/**
 * UC device security — the extra check /auth/refresh runs for UC sessions.
 *
 * For role 'uc' a refresh token alone is NOT enough. The refresh must also:
 *   1. come from the registered phone: a fresh challenge signed by the
 *      phone's hardware device key (so a copied token is useless on any
 *      other device), and
 *   2. fall within 24 h of the phone's last MPIN / fingerprint unlock.
 *
 * Unlock endpoints (uc-security.ts) verify the MPIN / fingerprint
 * themselves and then call refreshSession with { kind: 'unlock-verified' }.
 * That kind is only ever built in uc-security.ts; the HTTP controller can
 * only build 'device-proof' from the request body.
 *
 * Other roles are not affected: refreshSession calls this only for 'uc'.
 */
import { UC_UNLOCK_MAX_AGE_SECONDS } from '../../../config/constants.js';
import { AuthError, ForbiddenError } from '../../../shared/errors/index.js';
import { AUTH_ERROR, type AuthSessionRow } from '../types.js';
import { verifyPhoneSignature } from './uc-crypto.js';
import {
  assertSameDevice,
  consumeUcChallenge,
  recordUcEvent,
  requireSessionDeviceId,
} from './uc-challenge.js';
import type { AuthServiceDeps } from '../infrastructure/AuthContainer.js';

/** Sent by the app with a UC refresh: a signed 'refresh' challenge. */
export type UcRefreshProof = { challengeId: string; deviceSignature: string };

export type UcRefreshGate =
  /** Normal /auth/refresh. proof is null when the app sent none. */
  | { kind: 'device-proof'; proof: UcRefreshProof | null }
  /** MPIN / fingerprint already verified by uc-security.ts. */
  | { kind: 'unlock-verified' };

export async function assertUcRefreshAllowed(
  deps: AuthServiceDeps,
  row: AuthSessionRow,
  gate: UcRefreshGate,
  sentDeviceId: string | null,
  ip: string | null,
): Promise<void> {
  const deviceId = requireSessionDeviceId(row);
  assertSameDevice(row, sentDeviceId);
  if (gate.kind === 'unlock-verified') return;

  const device = await deps.repo.findUcDevice(row.entity_id, deviceId, UC_UNLOCK_MAX_AGE_SECONDS);
  if (!device) {
    throw new ForbiddenError(
      'Set up your MPIN to continue. Please sign in again.',
      AUTH_ERROR.UC_DEVICE_NOT_REGISTERED,
    );
  }
  if (!gate.proof) {
    throw new AuthError('Device check required.', AUTH_ERROR.UC_DEVICE_PROOF_REQUIRED);
  }

  const message = await consumeUcChallenge(deps, {
    challengeId: gate.proof.challengeId,
    purpose: 'refresh',
    jti: row.jti,
  });
  if (!verifyPhoneSignature(device.devicePublicKey, message, gate.proof.deviceSignature)) {
    await recordUcEvent(deps, { staffId: row.entity_id, deviceId, event: 'signature_failed', ip });
    throw new AuthError('Device check failed.', AUTH_ERROR.UC_SIGNATURE_INVALID);
  }

  if (!device.unlockFresh) {
    throw new AuthError(
      'Unlock with your MPIN or fingerprint to continue.',
      AUTH_ERROR.UC_UNLOCK_REQUIRED,
    );
  }
}
