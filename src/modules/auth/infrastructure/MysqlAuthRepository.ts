/**
 * IAuthRepository backed by MySQL. A thin adapter over the functions in
 * ../repository; no logic or SQL of its own.
 */

import type { IAuthRepository } from '../ports/IAuthRepository.js';
import type { MobileFlags } from '../repository/mobile-registry.js';
import type {
  ResolvedUser,
  UserProfileDto,
  AuthSessionRow,
  CustomerOnboardingDetails,
  UcDeviceEventName,
  UcDeviceRow,
} from '../types.js';
import type { OtpEventInsert, LoginEventInsert, DlrUpdate } from '../repository/audit.js';
import type { CreateSessionInput, RevokeReason, RevokedSession } from '../repository/sessions.js';
import type { UserRole } from '../../../shared/rbac/roles.js';
import {
  findUcDevice,
  upsertUcDevice,
  setUcBiometricKey,
  markUcDeviceUnlocked,
  updateUcMpinHash,
  recordUcMpinFailure,
  deleteUcDevice,
  deleteAllUcDevices,
  isLoginWithin,
  insertUcDeviceEvent,
} from '../repository/uc-devices.js';

import {
  getMobileFlags,
  touchMobileRegistry,
  incrementVerifyFailure,
  lockMobile,
  resetVerifyFailure,
} from '../repository/mobile-registry.js';

import {
  findUserByPhone,
  createCustomerIfAbsent,
  getAccountStatus,
  loadProfile,
  loadIdentityDetails,
} from '../repository/users.js';

import {
  createSession,
  findSessionByJti,
  markSessionRevoked,
  revokeAllForEntity,
  rotateSession,
  isWithinRotationGrace,
  revokeFamily,
  createGraceSibling,
} from '../repository/sessions.js';

import { insertOtpEvent, insertLoginEvent, applyDlr } from '../repository/audit.js';
import { deletePushTokens } from '../repository/push-tokens.js';

export class MysqlAuthRepository implements IAuthRepository {
  // mobile_registry

  getMobileFlags(mobile: string): Promise<MobileFlags | null> {
    return getMobileFlags(mobile);
  }

  touchMobileRegistry(mobile: string): Promise<void> {
    return touchMobileRegistry(mobile);
  }

  incrementVerifyFailure(mobile: string): Promise<number> {
    return incrementVerifyFailure(mobile);
  }

  lockMobile(mobile: string, until: Date, captchaUntil: Date): Promise<void> {
    return lockMobile(mobile, until, captchaUntil);
  }

  resetVerifyFailure(mobile: string): Promise<void> {
    return resetVerifyFailure(mobile);
  }

  // users

  findUserByPhone(role: UserRole, mobile: string): Promise<ResolvedUser | null> {
    return findUserByPhone(role, mobile);
  }

  createCustomerIfAbsent(
    mobile: string,
    details: CustomerOnboardingDetails,
  ): Promise<{ user: ResolvedUser; created: boolean }> {
    return createCustomerIfAbsent(mobile, details);
  }

  getAccountStatus(role: UserRole, entityId: string): Promise<ResolvedUser['status'] | null> {
    return getAccountStatus(role, entityId);
  }

  // profiles

  loadProfile(role: UserRole, entityId: string): Promise<UserProfileDto> {
    return loadProfile(role, entityId);
  }

  loadIdentityDetails(
    role: UserRole,
    entityId: string,
  ): Promise<{ profile: UserProfileDto; requiresProfileSetup: boolean } | null> {
    return loadIdentityDetails(role, entityId);
  }

  // sessions

  createSession(input: CreateSessionInput): Promise<void> {
    return createSession(input);
  }

  findSessionByJti(jti: string): Promise<AuthSessionRow | null> {
    return findSessionByJti(jti);
  }

  markSessionRevoked(jti: string, reason: RevokeReason): Promise<void> {
    return markSessionRevoked(jti, reason);
  }

  revokeAllForEntity(role: UserRole, entityId: string, reason: RevokeReason): Promise<string[]> {
    return revokeAllForEntity(role, entityId, reason);
  }

  rotateSession(oldJti: string, next: CreateSessionInput): Promise<boolean> {
    return rotateSession(oldJti, next);
  }

  isWithinRotationGrace(oldJti: string, graceSeconds: number): Promise<boolean> {
    return isWithinRotationGrace(oldJti, graceSeconds);
  }

  revokeFamily(
    role: UserRole,
    entityId: string,
    familyId: string,
    reason: RevokeReason,
  ): Promise<RevokedSession[]> {
    return revokeFamily(role, entityId, familyId, reason);
  }

  createGraceSibling(next: CreateSessionInput): Promise<boolean> {
    return createGraceSibling(next);
  }

  // push tokens

  deletePushTokens(role: UserRole, entityId: string, deviceId: string | null): Promise<void> {
    return deletePushTokens(role, entityId, deviceId);
  }

  // audit

  insertOtpEvent(e: OtpEventInsert): Promise<void> {
    return insertOtpEvent(e);
  }

  insertLoginEvent(e: LoginEventInsert): Promise<void> {
    return insertLoginEvent(e);
  }

  applyDlr(update: DlrUpdate): Promise<number> {
    return applyDlr(update);
  }

  // UC device security

  findUcDevice(
    staffId: string,
    deviceId: string,
    unlockMaxAgeSeconds: number,
  ): Promise<UcDeviceRow | null> {
    return findUcDevice(staffId, deviceId, unlockMaxAgeSeconds);
  }

  upsertUcDevice(input: {
    staffId: string;
    deviceId: string;
    devicePublicKey: string;
    mpinHash: string;
  }): Promise<void> {
    return upsertUcDevice(input);
  }

  setUcBiometricKey(
    staffId: string,
    deviceId: string,
    biometricPublicKey: string | null,
  ): Promise<boolean> {
    return setUcBiometricKey(staffId, deviceId, biometricPublicKey);
  }

  updateUcMpinHash(staffId: string, deviceId: string, mpinHash: string): Promise<boolean> {
    return updateUcMpinHash(staffId, deviceId, mpinHash);
  }

  markUcDeviceUnlocked(staffId: string, deviceId: string): Promise<void> {
    return markUcDeviceUnlocked(staffId, deviceId);
  }

  recordUcMpinFailure(staffId: string, deviceId: string): Promise<number | null> {
    return recordUcMpinFailure(staffId, deviceId);
  }

  deleteUcDevice(staffId: string, deviceId: string): Promise<void> {
    return deleteUcDevice(staffId, deviceId);
  }

  deleteAllUcDevices(staffId: string): Promise<void> {
    return deleteAllUcDevices(staffId);
  }

  isLoginWithin(familyId: string, seconds: number): Promise<boolean> {
    return isLoginWithin(familyId, seconds);
  }

  insertUcDeviceEvent(e: {
    staffId: string;
    deviceId: string | null;
    event: UcDeviceEventName;
    ip: string | null;
  }): Promise<void> {
    return insertUcDeviceEvent(e);
  }
}
