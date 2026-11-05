/**
 * UC device security — MPIN + fingerprint, bound to each phone.
 *
 * FLOW (app side in the UC app)
 *   1. OTP login (unchanged) → phone creates its hardware DEVICE key.
 *   2. registerUcDevice: within 10 min of that login, the phone proves it
 *      holds the device key (signs a challenge) and sets its 4-digit MPIN.
 *   3. Optional enableUcBiometric: phone creates a FINGERPRINT key (usable
 *      only after a fingerprint) and proves it holds both keys.
 *   4. Every fresh start: unlockUcWithMpin (device signature + MPIN) or
 *      unlockUcWithBiometric (fingerprint signature) → fresh tokens.
 *   5. In between, /auth/refresh for UC needs a device signature and an
 *      unlock within 24 h (uc-refresh-gate.ts).
 *
 * Change MPIN (changeUcMpin) needs the current MPIN, not OTP; wrong
 * current MPINs share the unlock attempt counter.
 *
 * Each phone has its own MPIN and fingerprint; a staff member may register
 * several phones. UC_MPIN_MAX_ATTEMPTS wrong MPINs on one phone remove that
 * phone's registration and end its session; other phones are unaffected.
 *
 * Every step signs a single-use challenge whose text includes the purpose
 * (uc-crypto.ts ucChallengeMessage), so a signature can't be replayed or
 * reused for another action.
 */
import {
  UC_MPIN_MAX_ATTEMPTS,
  UC_SETUP_WINDOW_SECONDS,
  UC_UNLOCK_MAX_AGE_SECONDS,
} from '../../../config/constants.js';
import { AuthError, ForbiddenError, ValidationError } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/logger/index.js';
import {
  AUTH_ERROR,
  type DeviceMeta,
  type RefreshResponseDto,
  type UcDeviceRow,
  type UcSecurityStatusDto,
} from '../types.js';
import {
  hashMpin,
  mpinWeakness,
  parseP256PublicKey,
  verifyMpin,
  verifyPhoneSignature,
} from './uc-crypto.js';
import {
  assertSameDevice,
  consumeUcChallenge,
  inspectUcSession,
  mpinPepper,
  recordUcEvent,
  requireSessionDeviceId,
  sessionDeviceId,
  type UcSession,
} from './uc-challenge.js';
import { endFamily, refreshSession } from './session.js';
import type { AuthServiceDeps } from '../infrastructure/AuthContainer.js';

/* ---------------- Helpers ---------------- */

function notRegistered(): ForbiddenError {
  return new ForbiddenError(
    'Set up your MPIN to continue. Please sign in again.',
    AUTH_ERROR.UC_DEVICE_NOT_REGISTERED,
  );
}

async function loadDevice(
  deps: AuthServiceDeps,
  session: UcSession,
  deviceId: string,
): Promise<UcDeviceRow> {
  const device = await deps.repo.findUcDevice(session.staffId, deviceId, UC_UNLOCK_MAX_AGE_SECONDS);
  if (!device) throw notRegistered();
  return device;
}

async function signatureFailed(
  deps: AuthServiceDeps,
  session: UcSession,
  deviceId: string,
  ip: string | null,
): Promise<never> {
  await recordUcEvent(deps, { staffId: session.staffId, deviceId, event: 'signature_failed', ip });
  throw new AuthError('Device check failed.', AUTH_ERROR.UC_SIGNATURE_INVALID);
}

function requireP256Key(publicKeyBase64: string): void {
  if (!parseP256PublicKey(publicKeyBase64)) {
    throw new ValidationError(
      'This phone key is not supported.',
      undefined,
      AUTH_ERROR.UC_KEY_INVALID,
    );
  }
}

async function statusFor(deps: AuthServiceDeps, session: UcSession): Promise<UcSecurityStatusDto> {
  const deviceId = sessionDeviceId(session.row);
  const [device, setupAllowed] = await Promise.all([
    deviceId
      ? deps.repo.findUcDevice(session.staffId, deviceId, UC_UNLOCK_MAX_AGE_SECONDS)
      : Promise.resolve(null),
    deps.repo.isLoginWithin(session.row.family_id ?? session.row.jti, UC_SETUP_WINDOW_SECONDS),
  ]);
  return {
    deviceRegistered: device !== null,
    biometricEnabled: device?.biometricPublicKey != null,
    setupAllowed: deviceId !== null && setupAllowed,
    unlockFresh: device?.unlockFresh ?? false,
  };
}

/**
 * Records one wrong MPIN (unlock or Change MPIN share the same counter) and
 * always throws. On the last allowed attempt it locks THIS phone: drops its
 * MPIN + keys and ends its session; the staff member's other phones keep
 * working.
 */
async function wrongMpin(
  deps: AuthServiceDeps,
  session: UcSession,
  deviceId: string,
  event: 'unlock_mpin_failed' | 'change_mpin_failed',
  ip: string | null,
): Promise<never> {
  const failures = await deps.repo.recordUcMpinFailure(session.staffId, deviceId);
  // null = the registration was removed meanwhile (lockout, logout).
  if (failures === null) throw notRegistered();

  if (failures >= UC_MPIN_MAX_ATTEMPTS) {
    await deps.repo.deleteUcDevice(session.staffId, deviceId);
    await endFamily(deps, 'uc', session.staffId, session.row.jti, 'admin_force');
    await recordUcEvent(deps, { staffId: session.staffId, deviceId, event: 'mpin_locked', ip });
    logger.warn(
      { staffId: session.staffId, deviceId },
      'uc mpin locked after too many wrong attempts — phone registration removed',
    );
    throw new AuthError(
      'Too many wrong MPINs. Sign in again with OTP and set a new MPIN.',
      AUTH_ERROR.UC_MPIN_LOCKED,
      { attemptsLeft: 0 },
    );
  }

  await recordUcEvent(deps, { staffId: session.staffId, deviceId, event, ip });
  throw new AuthError('Wrong MPIN.', AUTH_ERROR.UC_MPIN_INVALID, {
    attemptsLeft: UC_MPIN_MAX_ATTEMPTS - failures,
  });
}

/* ---------------- Status ---------------- */

/** What this phone has set up. The app calls it after OTP login and at start. */
export async function getUcSecurityStatus(
  deps: AuthServiceDeps,
  p: { refreshToken: string },
): Promise<UcSecurityStatusDto> {
  const session = await inspectUcSession(deps, p.refreshToken);
  return statusFor(deps, session);
}

/* ---------------- Register phone + MPIN ---------------- */

export type RegisterUcDeviceParams = {
  refreshToken: string;
  challengeId: string;
  /** Hardware device key (EC P-256, SPKI DER, base64). */
  devicePublicKey: string;
  /** 'register' challenge signed with that key. */
  deviceSignature: string;
  mpin: string;
  ip: string | null;
};

/**
 * Registers this phone and sets its MPIN. Only within UC_SETUP_WINDOW_SECONDS
 * of an OTP login. Replaces any earlier registration of the same phone
 * (that is also how "Forgot MPIN" works: OTP login, then set a new one).
 */
export async function registerUcDevice(
  deps: AuthServiceDeps,
  p: RegisterUcDeviceParams,
): Promise<UcSecurityStatusDto> {
  const session = await inspectUcSession(deps, p.refreshToken);
  const deviceId = requireSessionDeviceId(session.row);
  const message = await consumeUcChallenge(deps, {
    challengeId: p.challengeId,
    purpose: 'register',
    jti: session.row.jti,
  });

  const loginIsFresh = await deps.repo.isLoginWithin(
    session.row.family_id ?? session.row.jti,
    UC_SETUP_WINDOW_SECONDS,
  );
  if (!loginIsFresh) {
    throw new ForbiddenError(
      'For your safety, sign in again with OTP to set your MPIN.',
      AUTH_ERROR.UC_SETUP_EXPIRED,
    );
  }

  const weakness = mpinWeakness(p.mpin);
  if (weakness) {
    throw new ValidationError(
      'This MPIN is too easy to guess. Choose another.',
      { reason: weakness },
      AUTH_ERROR.UC_MPIN_WEAK,
    );
  }

  requireP256Key(p.devicePublicKey);
  if (!verifyPhoneSignature(p.devicePublicKey, message, p.deviceSignature)) {
    return signatureFailed(deps, session, deviceId, p.ip);
  }

  const mpinHash = await hashMpin(mpinPepper(), session.staffId, deviceId, p.mpin);
  await deps.repo.upsertUcDevice({
    staffId: session.staffId,
    deviceId,
    devicePublicKey: p.devicePublicKey,
    mpinHash,
  });
  await recordUcEvent(deps, {
    staffId: session.staffId,
    deviceId,
    event: 'device_registered',
    ip: p.ip,
  });
  return statusFor(deps, session);
}

/* ---------------- Fingerprint on / off ---------------- */

export type EnableUcBiometricParams = {
  refreshToken: string;
  challengeId: string;
  /** Fingerprint-protected key (EC P-256, SPKI DER, base64). */
  biometricPublicKey: string;
  /** 'enable-biometric' challenge signed with the DEVICE key. */
  deviceSignature: string;
  /** The same challenge signed with the new FINGERPRINT key. */
  biometricSignature: string;
  ip: string | null;
};

/**
 * Turns fingerprint unlock on for this phone. Needs both signatures (the
 * registered phone AND the new key) and a recent unlock, so a stolen token
 * can't attach an attacker's key.
 */
export async function enableUcBiometric(
  deps: AuthServiceDeps,
  p: EnableUcBiometricParams,
): Promise<UcSecurityStatusDto> {
  const session = await inspectUcSession(deps, p.refreshToken);
  const deviceId = requireSessionDeviceId(session.row);
  const device = await loadDevice(deps, session, deviceId);
  const message = await consumeUcChallenge(deps, {
    challengeId: p.challengeId,
    purpose: 'enable-biometric',
    jti: session.row.jti,
  });

  if (!verifyPhoneSignature(device.devicePublicKey, message, p.deviceSignature)) {
    return signatureFailed(deps, session, deviceId, p.ip);
  }
  requireP256Key(p.biometricPublicKey);
  // The fingerprint key must be a different key from the silent device key,
  // otherwise "fingerprint" unlock would work without a fingerprint.
  if (p.biometricPublicKey === device.devicePublicKey) {
    throw new ValidationError(
      'This phone key is not supported.',
      undefined,
      AUTH_ERROR.UC_KEY_INVALID,
    );
  }
  if (!verifyPhoneSignature(p.biometricPublicKey, message, p.biometricSignature)) {
    return signatureFailed(deps, session, deviceId, p.ip);
  }
  if (!device.unlockFresh) {
    throw new AuthError('Unlock with your MPIN to continue.', AUTH_ERROR.UC_UNLOCK_REQUIRED);
  }

  // false = the registration was removed meanwhile (e.g. logout elsewhere).
  if (!(await deps.repo.setUcBiometricKey(session.staffId, deviceId, p.biometricPublicKey))) {
    throw notRegistered();
  }
  await recordUcEvent(deps, {
    staffId: session.staffId,
    deviceId,
    event: 'biometric_enabled',
    ip: p.ip,
  });
  return statusFor(deps, session);
}

export type DisableUcBiometricParams = {
  refreshToken: string;
  challengeId: string;
  /** 'disable-biometric' challenge signed with the DEVICE key. */
  deviceSignature: string;
  ip: string | null;
};

/** Turns fingerprint unlock off for this phone (MPIN keeps working). */
export async function disableUcBiometric(
  deps: AuthServiceDeps,
  p: DisableUcBiometricParams,
): Promise<UcSecurityStatusDto> {
  const session = await inspectUcSession(deps, p.refreshToken);
  const deviceId = requireSessionDeviceId(session.row);
  const device = await loadDevice(deps, session, deviceId);
  const message = await consumeUcChallenge(deps, {
    challengeId: p.challengeId,
    purpose: 'disable-biometric',
    jti: session.row.jti,
  });
  if (!verifyPhoneSignature(device.devicePublicKey, message, p.deviceSignature)) {
    return signatureFailed(deps, session, deviceId, p.ip);
  }

  await deps.repo.setUcBiometricKey(session.staffId, deviceId, null);
  await recordUcEvent(deps, {
    staffId: session.staffId,
    deviceId,
    event: 'biometric_disabled',
    ip: p.ip,
  });
  return statusFor(deps, session);
}

/* ---------------- Change MPIN ---------------- */

export type ChangeUcMpinParams = {
  refreshToken: string;
  challengeId: string;
  /** 'change-mpin' challenge signed with the DEVICE key. */
  deviceSignature: string;
  currentMpin: string;
  newMpin: string;
  ip: string | null;
};

/**
 * Change MPIN from inside the app: current MPIN + new MPIN, no OTP.
 *   - the registered phone must sign the challenge;
 *   - the phone must be unlocked (within 24 h);
 *   - a wrong current MPIN counts toward the SAME 5-try limit as unlock,
 *     so this screen can't be used to guess the MPIN;
 *   - the new MPIN must pass the weak-MPIN rules and differ from the current.
 * Fingerprint stays on (its key has nothing to do with the MPIN).
 */
export async function changeUcMpin(
  deps: AuthServiceDeps,
  p: ChangeUcMpinParams,
): Promise<UcSecurityStatusDto> {
  // Input-only checks first: they reveal nothing about the current MPIN, so
  // they don't use up an attempt.
  if (p.newMpin === p.currentMpin) {
    throw new ValidationError(
      'Your new MPIN must be different from your current MPIN.',
      undefined,
      AUTH_ERROR.UC_MPIN_SAME,
    );
  }
  const weakness = mpinWeakness(p.newMpin);
  if (weakness) {
    throw new ValidationError(
      'This MPIN is too easy to guess. Choose another.',
      { reason: weakness },
      AUTH_ERROR.UC_MPIN_WEAK,
    );
  }

  const session = await inspectUcSession(deps, p.refreshToken);
  const deviceId = requireSessionDeviceId(session.row);
  const device = await loadDevice(deps, session, deviceId);
  const message = await consumeUcChallenge(deps, {
    challengeId: p.challengeId,
    purpose: 'change-mpin',
    jti: session.row.jti,
  });
  if (!verifyPhoneSignature(device.devicePublicKey, message, p.deviceSignature)) {
    return signatureFailed(deps, session, deviceId, p.ip);
  }
  if (!device.unlockFresh) {
    throw new AuthError('Unlock with your MPIN to continue.', AUTH_ERROR.UC_UNLOCK_REQUIRED);
  }

  const pepper = mpinPepper();
  const ok = await verifyMpin(pepper, session.staffId, deviceId, p.currentMpin, device.mpinHash);
  if (!ok) return wrongMpin(deps, session, deviceId, 'change_mpin_failed', p.ip);

  const mpinHash = await hashMpin(pepper, session.staffId, deviceId, p.newMpin);
  // false = the registration was removed meanwhile (e.g. logout elsewhere).
  if (!(await deps.repo.updateUcMpinHash(session.staffId, deviceId, mpinHash))) {
    throw notRegistered();
  }
  await recordUcEvent(deps, {
    staffId: session.staffId,
    deviceId,
    event: 'mpin_changed',
    ip: p.ip,
  });
  return statusFor(deps, session);
}

/* ---------------- Unlock ---------------- */

type UnlockContext = {
  refreshToken: string;
  challengeId: string;
  /** Device meta, as on /auth/refresh. Must be the session's own phone. */
  device: DeviceMeta | null;
  ip: string | null;
  userAgent: string | null;
};

export type UnlockUcWithMpinParams = UnlockContext & {
  /** 'unlock-mpin' challenge signed with the DEVICE key. */
  deviceSignature: string;
  mpin: string;
};

/**
 * Unlock with MPIN: the registered phone's signature + the right MPIN →
 * fresh tokens. A wrong MPIN costs one attempt; the last one removes this
 * phone's registration and logs it out (OTP + new MPIN needed).
 */
export async function unlockUcWithMpin(
  deps: AuthServiceDeps,
  p: UnlockUcWithMpinParams,
): Promise<RefreshResponseDto> {
  const session = await inspectUcSession(deps, p.refreshToken);
  const deviceId = requireSessionDeviceId(session.row);
  assertSameDevice(session.row, p.device?.id ?? null);
  const device = await loadDevice(deps, session, deviceId);
  const message = await consumeUcChallenge(deps, {
    challengeId: p.challengeId,
    purpose: 'unlock-mpin',
    jti: session.row.jti,
  });

  // The phone first: an MPIN guess from another device never reaches the
  // MPIN check and never uses up an attempt of the real phone.
  if (!verifyPhoneSignature(device.devicePublicKey, message, p.deviceSignature)) {
    return signatureFailed(deps, session, deviceId, p.ip);
  }

  const ok = await verifyMpin(mpinPepper(), session.staffId, deviceId, p.mpin, device.mpinHash);
  if (!ok) return wrongMpin(deps, session, deviceId, 'unlock_mpin_failed', p.ip);

  await deps.repo.markUcDeviceUnlocked(session.staffId, deviceId);
  await recordUcEvent(deps, {
    staffId: session.staffId,
    deviceId,
    event: 'unlock_mpin_ok',
    ip: p.ip,
  });
  return refreshSession(deps, p.refreshToken, p.device, p.ip, p.userAgent, {
    kind: 'unlock-verified',
  });
}

export type UnlockUcWithBiometricParams = UnlockContext & {
  /** 'unlock-biometric' challenge signed with the FINGERPRINT key. */
  biometricSignature: string;
};

/**
 * Unlock with fingerprint: a signature that the phone's hardware makes only
 * after a successful fingerprint / Face ID → fresh tokens.
 */
export async function unlockUcWithBiometric(
  deps: AuthServiceDeps,
  p: UnlockUcWithBiometricParams,
): Promise<RefreshResponseDto> {
  const session = await inspectUcSession(deps, p.refreshToken);
  const deviceId = requireSessionDeviceId(session.row);
  assertSameDevice(session.row, p.device?.id ?? null);
  const device = await loadDevice(deps, session, deviceId);
  if (!device.biometricPublicKey) {
    throw new ForbiddenError(
      'Fingerprint unlock is off. Use your MPIN.',
      AUTH_ERROR.UC_BIOMETRIC_NOT_ENABLED,
    );
  }
  const message = await consumeUcChallenge(deps, {
    challengeId: p.challengeId,
    purpose: 'unlock-biometric',
    jti: session.row.jti,
  });
  if (!verifyPhoneSignature(device.biometricPublicKey, message, p.biometricSignature)) {
    return signatureFailed(deps, session, deviceId, p.ip);
  }

  await deps.repo.markUcDeviceUnlocked(session.staffId, deviceId);
  await recordUcEvent(deps, {
    staffId: session.staffId,
    deviceId,
    event: 'unlock_biometric_ok',
    ip: p.ip,
  });
  return refreshSession(deps, p.refreshToken, p.device, p.ip, p.userAgent, {
    kind: 'unlock-verified',
  });
}
