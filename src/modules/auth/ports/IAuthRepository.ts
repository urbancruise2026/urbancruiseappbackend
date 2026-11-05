/**
 * Port for all auth persistence (MySQL). Implementation: MysqlAuthRepository,
 * wired in AuthContainer.
 */

import type { MobileFlags } from '../repository/mobile-registry.js';
import type {
  ResolvedUser,
  UserProfileDto,
  AuthSessionRow,
  CustomerOnboardingDetails,
  UcDeviceEventName,
  UcDeviceRow,
} from '../types.js';
import type { CreateSessionInput, RevokeReason, RevokedSession } from '../repository/sessions.js';
import type { OtpEventInsert, LoginEventInsert, DlrUpdate } from '../repository/audit.js';
import type { UserRole } from '../../../shared/rbac/roles.js';

// Re-exported so callers don't import from the repository folder.
export type { OtpEventInsert, LoginEventInsert, DlrUpdate, RevokeReason };

export interface IAuthRepository {
  // mobile_registry

  getMobileFlags(mobile: string): Promise<MobileFlags | null>;
  touchMobileRegistry(mobile: string): Promise<void>;
  incrementVerifyFailure(mobile: string): Promise<number>;
  lockMobile(mobile: string, until: Date, captchaUntil: Date): Promise<void>;
  resetVerifyFailure(mobile: string): Promise<void>;

  // users

  findUserByPhone(role: UserRole, mobile: string): Promise<ResolvedUser | null>;

  /**
   * Creates the customer at onboarding. If one exists (even concurrently),
   * returns it with created=false.
   */
  createCustomerIfAbsent(
    mobile: string,
    details: CustomerOnboardingDetails,
  ): Promise<{ user: ResolvedUser; created: boolean }>;

  /** Account status; null if the row no longer exists. */
  getAccountStatus(role: UserRole, entityId: string): Promise<ResolvedUser['status'] | null>;

  // profiles

  loadProfile(role: UserRole, entityId: string): Promise<UserProfileDto>;
  loadIdentityDetails(
    role: UserRole,
    entityId: string,
  ): Promise<{ profile: UserProfileDto; requiresProfileSetup: boolean } | null>;

  // sessions

  createSession(input: CreateSessionInput): Promise<void>;
  findSessionByJti(jti: string): Promise<AuthSessionRow | null>;
  markSessionRevoked(jti: string, reason: RevokeReason): Promise<void>;
  revokeAllForEntity(role: UserRole, entityId: string, reason: RevokeReason): Promise<string[]>;
  /** Atomically revokes oldJti and creates next. False if oldJti was already revoked. */
  rotateSession(oldJti: string, next: CreateSessionInput): Promise<boolean>;
  /**
   * True if oldJti was rotated within graceSeconds (DB clock) and its
   * replacement is still active: a duplicate refresh, not token theft.
   */
  isWithinRotationGrace(oldJti: string, graceSeconds: number): Promise<boolean>;
  /** Revokes every active session in a login family (atomically). */
  revokeFamily(
    role: UserRole,
    entityId: string,
    familyId: string,
    reason: RevokeReason,
  ): Promise<RevokedSession[]>;
  /** Inserts a grace sibling only if its family is still active. */
  createGraceSibling(next: CreateSessionInput): Promise<boolean>;

  // push tokens

  /** Deletes an account's push tokens on sign-out. deviceId null means all devices. */
  deletePushTokens(role: UserRole, entityId: string, deviceId: string | null): Promise<void>;

  // audit

  insertOtpEvent(e: OtpEventInsert): Promise<void>;
  insertLoginEvent(e: LoginEventInsert): Promise<void>;

  /** Applies an MSG91 DLR to its pending otp_events row. Idempotent; returns rows updated. */
  applyDlr(update: DlrUpdate): Promise<number>;

  // UC device security (uc_staff_devices)

  /** The phone's registration; unlockFresh uses unlockMaxAgeSeconds on the DB clock. */
  findUcDevice(
    staffId: string,
    deviceId: string,
    unlockMaxAgeSeconds: number,
  ): Promise<UcDeviceRow | null>;
  /** Creates or replaces the phone's registration (fingerprint off, counts as an unlock). */
  upsertUcDevice(input: {
    staffId: string;
    deviceId: string;
    devicePublicKey: string;
    mpinHash: string;
  }): Promise<void>;
  /** Sets or (null) clears the fingerprint key. False if the registration is gone. */
  setUcBiometricKey(
    staffId: string,
    deviceId: string,
    biometricPublicKey: string | null,
  ): Promise<boolean>;
  /** Change MPIN: new hash, wrong tries reset; keys kept. False if the registration is gone. */
  updateUcMpinHash(staffId: string, deviceId: string, mpinHash: string): Promise<boolean>;
  /** Successful unlock: resets wrong tries and stamps last_unlocked_at. */
  markUcDeviceUnlocked(staffId: string, deviceId: string): Promise<void>;
  /** Atomically adds a wrong MPIN; returns the new total, null if the registration is gone. */
  recordUcMpinFailure(staffId: string, deviceId: string): Promise<number | null>;
  deleteUcDevice(staffId: string, deviceId: string): Promise<void>;
  deleteAllUcDevices(staffId: string): Promise<void>;
  /** True if the login that started this family was within `seconds` (DB clock). */
  isLoginWithin(familyId: string, seconds: number): Promise<boolean>;
  insertUcDeviceEvent(e: {
    staffId: string;
    deviceId: string | null;
    event: UcDeviceEventName;
    ip: string | null;
  }): Promise<void>;
}
