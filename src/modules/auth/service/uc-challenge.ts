/**
 * UC device security — session checks and one-time challenges.
 *
 * Shared by uc-security.ts (register / unlock / fingerprint) and
 * uc-refresh-gate.ts (token refresh). Kept free of session.ts imports so
 * session.ts can use the refresh gate without an import cycle.
 *
 * Every UC security call carries the phone's refresh token (not the access
 * token): at a cold start the access token has usually expired, and the
 * refresh token is what the phone holds anyway.
 */
import { ENV } from '../../../config/env.js';
import { UC_CHALLENGE_TTL_SECONDS } from '../../../config/constants.js';
import { verifyRefreshToken } from '../../../shared/auth/jwt.js';
import { hashForStorage } from '../../../shared/auth/tokens.js';
import { safeEqual } from '../../../shared/utils/crypto.js';
import { newId } from '../../../shared/utils/id.js';
import { logger } from '../../../shared/logger/index.js';
import { assertRoleEnabled } from '../../../shared/rbac/enabled-roles.js';
import {
  AuthError,
  ForbiddenError,
  ServiceUnavailableError,
} from '../../../shared/errors/index.js';
import {
  AUTH_ERROR,
  LEGACY_PLACEHOLDER_DEVICE_ID,
  type AuthSessionRow,
  type UcChallengePurpose,
  type UcChallengeResponseDto,
  type UcDeviceEventName,
} from '../types.js';
import { newChallengeNonce, ucChallengeMessage } from './uc-crypto.js';
import type { AuthServiceDeps } from '../infrastructure/AuthContainer.js';

/* ---------------- Session ---------------- */

export type UcSession = {
  row: AuthSessionRow;
  staffId: string;
};

/**
 * Validates the refresh token WITHOUT rotating it: signature, session row
 * active, stored hash, owner, role 'uc' enabled and the account active.
 * Reuse detection and rotation stay in refreshSession (session.ts).
 */
export async function inspectUcSession(
  deps: AuthServiceDeps,
  refreshToken: string,
): Promise<UcSession> {
  const claims = verifyRefreshToken(refreshToken); // throws AuthError

  const row = await deps.repo.findSessionByJti(claims.jti);
  if (!row || row.revoked_at !== null) {
    throw new AuthError('Session has been revoked.', AUTH_ERROR.SESSION_REVOKED);
  }
  if (
    !safeEqual(hashForStorage(refreshToken), row.refresh_token_hash) ||
    String(claims.sub) !== String(row.entity_id)
  ) {
    throw new AuthError('Refresh token invalid.', AUTH_ERROR.REFRESH_INVALID);
  }
  if (row.role !== 'uc') {
    throw new ForbiddenError('This is only for Urban Cruise staff.', AUTH_ERROR.UC_ROLE_MISMATCH);
  }
  assertRoleEnabled(deps.enabledRoles, 'uc');

  const status = await deps.repo.getAccountStatus('uc', row.entity_id);
  if (status !== 'active') {
    throw new ForbiddenError(
      'This account is not active. Please contact your Urban Cruise administrator.',
      AUTH_ERROR.ACCOUNT_SUSPENDED,
    );
  }
  return { row, staffId: row.entity_id };
}

/** The phone this session belongs to, or null when unknown. */
export function sessionDeviceId(row: AuthSessionRow): string | null {
  return row.device_id && row.device_id !== LEGACY_PLACEHOLDER_DEVICE_ID ? row.device_id : null;
}

/** Same as sessionDeviceId but required: UC security is always bound to a phone. */
export function requireSessionDeviceId(row: AuthSessionRow): string {
  const id = sessionDeviceId(row);
  if (!id) {
    throw new ForbiddenError(
      'This login is not linked to a phone. Please sign in again.',
      AUTH_ERROR.UC_DEVICE_UNKNOWN,
    );
  }
  return id;
}

/**
 * A UC request may carry device meta (like /auth/refresh). For UC it must be
 * the SAME phone as the session's, otherwise the phone binding could be
 * moved to another device id.
 */
export function assertSameDevice(row: AuthSessionRow, sentDeviceId: string | null): void {
  const bound = sessionDeviceId(row);
  if (sentDeviceId !== null && bound !== null && sentDeviceId !== bound) {
    throw new ForbiddenError(
      'This login belongs to another phone. Please sign in again.',
      AUTH_ERROR.UC_DEVICE_UNKNOWN,
    );
  }
}

/* ---------------- Challenges ---------------- */

export async function issueUcChallenge(
  deps: AuthServiceDeps,
  p: { refreshToken: string; purpose: UcChallengePurpose },
): Promise<UcChallengeResponseDto> {
  const { row } = await inspectUcSession(deps, p.refreshToken);
  requireSessionDeviceId(row);

  const challengeId = newId();
  const nonce = newChallengeNonce();
  await deps.store.setUcChallenge(
    { challengeId, nonce, purpose: p.purpose, jti: row.jti },
    UC_CHALLENGE_TTL_SECONDS,
  );
  return { challengeId, nonce, expiresInSeconds: UC_CHALLENGE_TTL_SECONDS };
}

/**
 * Uses up the challenge (single use, even when the request then fails) and
 * returns the exact message the phone had to sign. Rejects a challenge that
 * is missing, expired, for another purpose, or issued to another session.
 */
export async function consumeUcChallenge(
  deps: AuthServiceDeps,
  p: { challengeId: string; purpose: UcChallengePurpose; jti: string },
): Promise<string> {
  const c = await deps.store.takeUcChallenge(p.challengeId);
  if (!c || c.purpose !== p.purpose || c.jti !== p.jti) {
    throw new AuthError(
      'This request has expired. Please try again.',
      AUTH_ERROR.UC_CHALLENGE_INVALID,
    );
  }
  return ucChallengeMessage(c.purpose, c.challengeId, c.nonce);
}

/* ---------------- Misc ---------------- */

/** UC_MPIN_PEPPER; env.ts refuses to start without it when 'uc' is enabled. */
export function mpinPepper(): string {
  const pepper = ENV.UC_MPIN_PEPPER;
  if (!pepper) {
    throw new ServiceUnavailableError('MPIN is not available right now.');
  }
  return pepper;
}

/** Best-effort audit row: a failed insert is logged, never fails the request. */
export async function recordUcEvent(
  deps: AuthServiceDeps,
  e: { staffId: string; deviceId: string | null; event: UcDeviceEventName; ip: string | null },
): Promise<void> {
  try {
    await deps.repo.insertUcDeviceEvent(e);
  } catch (err) {
    logger.warn({ err, ...e }, 'uc device event insert failed');
  }
}
