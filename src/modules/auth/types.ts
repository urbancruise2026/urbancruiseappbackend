/**
 * auth types. Row types mirror DB column names exactly (customers is
 * camelCase, other tables snake_case).
 * AUTH_ERROR is the source of truth for error codes the app switches on:
 * add codes here first, then handle them in the app.
 */
import type { UserRole } from '../../shared/rbac/roles.js';

/** Placeholder written by older builds; treated as an unknown (null) device. */
export const LEGACY_PLACEHOLDER_DEVICE_ID = 'unknown-device';

/* Error codes returned to the app (ApiError.code) */

export const AUTH_ERROR = {
  ACCOUNT_NOT_PROVISIONED: 'account_not_provisioned',
  ACCOUNT_SUSPENDED: 'account_suspended',
  ACCOUNT_LOCKED: 'account_locked',
  /**
   * 409: the login number matches more than one active account of this role
   * (e.g. the same uc_staff.officeMobileNumber on two Active staff). Login is
   * refused rather than picking one; an admin must fix the data.
   */
  ACCOUNT_AMBIGUOUS: 'account_ambiguous',
  CAPTCHA_REQUIRED: 'captcha_required',
  MOBILE_BLOCKED: 'mobile_blocked',
  OTP_SEND_FAILED: 'otp_send_failed',
  OTP_INVALID: 'otp_invalid',
  OTP_EXPIRED: 'otp_expired',
  /**
   * 503: MSG91 can't deliver right now (wallet empty or circuit open).
   * Distinct from OTP_SEND_FAILED, which is a config error on our side.
   */
  SERVICE_UNAVAILABLE: 'service_unavailable',
  SESSION_REVOKED: 'session_revoked',
  /** /auth/me found the account row deleted; the session is revoked too. */
  SESSION_ORPHANED: 'session_orphaned',
  REFRESH_INVALID: 'refresh_invalid',
  /** Onboarding ticket missing, expired or used: restart from phone entry. */
  ONBOARDING_EXPIRED: 'onboarding_expired',
  /** Onboarding ticket used from a different device than the one that verified. */
  ONBOARDING_INVALID: 'onboarding_invalid',

  /* UC device security (MPIN + fingerprint). See service/uc-security.ts. */

  /** Challenge missing, expired, already used, or for another session/purpose. Get a new one. */
  UC_CHALLENGE_INVALID: 'uc_challenge_invalid',
  /** A device or fingerprint signature did not verify. */
  UC_SIGNATURE_INVALID: 'uc_signature_invalid',
  /** A public key is not a valid EC P-256 key. */
  UC_KEY_INVALID: 'uc_key_invalid',
  /** The session has no device id, so it can't be bound to a phone. Log in again. */
  UC_DEVICE_UNKNOWN: 'uc_device_unknown',
  /** This phone has no MPIN set up (or it was removed). Log in with OTP and set one. */
  UC_DEVICE_NOT_REGISTERED: 'uc_device_not_registered',
  /** MPIN setup is allowed only shortly after an OTP login. Log in again. */
  UC_SETUP_EXPIRED: 'uc_setup_expired',
  /** MPIN too easy to guess (details.reason says why). */
  UC_MPIN_WEAK: 'uc_mpin_weak',
  /** Wrong MPIN (details.attemptsLeft). */
  UC_MPIN_INVALID: 'uc_mpin_invalid',
  /** Change MPIN: the new MPIN is the same as the current one. */
  UC_MPIN_SAME: 'uc_mpin_same',
  /** Too many wrong MPINs: this phone's MPIN and fingerprint are removed and it is logged out. */
  UC_MPIN_LOCKED: 'uc_mpin_locked',
  /** Fingerprint unlock is not turned on for this phone. */
  UC_BIOMETRIC_NOT_ENABLED: 'uc_biometric_not_enabled',
  /** Last unlock is older than the limit: unlock with MPIN / fingerprint again. */
  UC_UNLOCK_REQUIRED: 'uc_unlock_required',
  /** A UC token refresh must include a device signature (ucProof). */
  UC_DEVICE_PROOF_REQUIRED: 'uc_device_proof_required',
  /** A UC-only endpoint was called with a non-UC session. */
  UC_ROLE_MISMATCH: 'uc_role_mismatch',
} as const;

/* OTP session (Redis) */

export type OtpSession = {
  requestId: string;
  mobile: string;
  otpHash: string;
  role: UserRole;
  /** Delivery channel; only SMS today. */
  channel: 'sms';
  isTest: boolean;
  attempts: number;
  sentAt: number;
  /**
   * IP block (IPv4 /24, IPv6 /64) charged at send time. A successful verify
   * is credited here, since phones often change IP in between. null for test
   * mobiles or unknown IP; absent on older sessions.
   */
  ipBlock?: string | null;
};

/* Account found by phone lookup */

export type ResolvedUser = {
  role: UserRole;
  entityId: string;
  userId: string;
  /** 'inactive' covers any status not in ACTIVE_STATUS_VALUES; such accounts can't log in. */
  status: 'active' | 'inactive';
  requiresProfileSetup: boolean;
};

/* auth_sessions row */

export type AuthSessionRow = {
  id: number;
  jti: string;
  role: UserRole;
  entity_id: string;
  refresh_token_hash: string;
  previous_jti: string | null;
  /** NULL only on rows written before the family_id migration. */
  family_id: string | null;
  device_id: string | null;
  device_name: string | null;
  platform: 'ios' | 'android' | null;
  app_version: string | null;
  ip: Buffer | null;
  user_agent: string | null;
  issued_at: Date;
  last_used_at: Date | null;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_reason: string | null;
};

/* Response DTOs */

export type UserProfileDto = {
  id: string;
  displayName: string;
  email: string | null;
  phoneIndia: string;
  phoneGlobal: string;
  memberSince: string;
};

/** Returned when a login completes (verify or onboarding). */
export type AuthenticatedResponseDto = {
  status: 'authenticated';
  accessToken: string;
  refreshToken: string;
  userId: string;
  role: UserRole;
  entityId: string;
  requiresProfileSetup: boolean;
  profile: UserProfileDto;
};

/**
 * Verify result for a new customer. No account or session exists yet; the
 * app calls POST /auth/customer/onboard with this token.
 */
export type OnboardingRequiredResponseDto = {
  status: 'onboarding_required';
  onboardingToken: string;
  expiresInSeconds: number;
  role: 'customer';
};

export type VerifyOtpResponseDto = AuthenticatedResponseDto | OnboardingRequiredResponseDto;

/**
 * POST /auth/customer/onboard response. isNewAccount is false when a
 * customer already existed for this mobile (the request logged into that
 * account instead), so the app shows its first-time welcome only when true.
 */
export type CustomerOnboardResponseDto = AuthenticatedResponseDto & {
  isNewAccount: boolean;
};

/** Onboarding ticket stored in Redis under the token's hash. */
export type OnboardingTicket = {
  mobile: string;
  deviceId: string;
  issuedAt: number;
};

/**
 * Customer kind chosen at onboarding (API value). Same values as the
 * CustomerCategory type in shared/rbac/roles.ts. The repository maps it to
 * the CRM's customers.customerType text; never write it to the DB as is.
 */
export type CustomerSignupType = 'personal' | 'corporate' | 'agent';

/** Details collected at onboarding. */
export type CustomerOnboardingDetails = {
  firstName: string;
  lastName: string | null;
  email: string | null;
  customerType: CustomerSignupType;
  /** Trimmed city name, saved as entered or as returned by the device. */
  city: string;
};

/** POST /auth/otp/request response. Keep `channel`: shipped apps read it. */
export type RequestOtpResponseDto = {
  requestId: string;
  resendAfterSeconds: number;
  channel: 'sms';
  testMode: boolean;
};

export type RefreshResponseDto = {
  accessToken: string;
  refreshToken: string;
};

/** GET /auth/me: the verify response without tokens. The app checks it at startup. */
export type MeResponseDto = {
  userId: string;
  role: UserRole;
  entityId: string;
  requiresProfileSetup: boolean;
  profile: UserProfileDto;
};

/* Device sent by the app */

export type DeviceMeta = {
  id: string;
  name: string;
  platform: 'ios' | 'android';
  appVersion: string;
};

/** Device as stored on auth_sessions. All nullable: an inherited device may be unknown. */
export type SessionDevice = {
  id: string | null;
  name: string | null;
  platform: 'ios' | 'android' | null;
  appVersion: string | null;
};

/* UC device security (MPIN + fingerprint) */

/** What a challenge may be used for. A challenge works for one purpose only. */
export type UcChallengePurpose =
  | 'register'
  | 'enable-biometric'
  | 'disable-biometric'
  | 'unlock-mpin'
  | 'unlock-biometric'
  | 'change-mpin'
  | 'refresh';

/** Stored in Redis under ucChallenge(challengeId). */
export type UcChallenge = {
  challengeId: string;
  nonce: string;
  purpose: UcChallengePurpose;
  /** jti of the session that asked for it; only that session may use it. */
  jti: string;
};

/** uc_staff_devices row (with a DB-clock freshness flag). */
export type UcDeviceRow = {
  staffId: string;
  deviceId: string;
  devicePublicKey: string;
  biometricPublicKey: string | null;
  mpinHash: string;
  mpinFailedAttempts: number;
  /** True when last_unlocked_at is within UC_UNLOCK_MAX_AGE_SECONDS (DB clock). */
  unlockFresh: boolean;
};

export type UcDeviceEventName =
  | 'device_registered'
  | 'biometric_enabled'
  | 'biometric_disabled'
  | 'unlock_mpin_ok'
  | 'unlock_mpin_failed'
  | 'mpin_locked'
  | 'unlock_biometric_ok'
  | 'mpin_changed'
  | 'change_mpin_failed'
  | 'signature_failed'
  | 'device_removed_logout';

export type UcChallengeResponseDto = {
  challengeId: string;
  /** Sign exactly ucChallengeMessage(purpose, challengeId, nonce), UTF-8. */
  nonce: string;
  expiresInSeconds: number;
};

export type UcSecurityStatusDto = {
  /** This phone has an MPIN (and device key) registered. */
  deviceRegistered: boolean;
  biometricEnabled: boolean;
  /** MPIN setup is still allowed (shortly after an OTP login). */
  setupAllowed: boolean;
  /** Last unlock is recent enough that a token refresh is allowed. */
  unlockFresh: boolean;
};
