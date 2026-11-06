/**
 * auth repository: uc_staff. Only employeeStatus 'Active' (trimmed,
 * case-insensitive) may log in. The old `status` column is not used for login.
 *
 * The table has no full_name column: the display name is built from
 * firstName + middleName + lastName.
 */
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../../shared/db/pool.js';
import { isRawPhoneAdminBlocked } from './mobile-registry.js';
import type { ResolvedUser, UserProfileDto } from '../types.js';
import {
  candidateFormats,
  placeholders,
  normalisePhoneToE164,
  placeholder,
  normStatus,
} from './users-shared.js';

/** Shown when a staff row has no first, middle or last name. */
const UC_STAFF_FALLBACK_NAME = 'UC Staff';

/* DB row (only the columns this file reads) */
type UcStaffRow = RowDataPacket & {
  id: number;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  email: string | null;
  mobile: string;
  /** Employee state, e.g. 'Active'. Only 'active' (any case) may log in. */
  employeeStatus: string | null;
  created_at: Date | null;
};

/** 'Ravi', null, 'Sharma' → 'Ravi Sharma'. Empty or blank parts are skipped. */
function fullName(r: Pick<UcStaffRow, 'firstName' | 'middleName' | 'lastName'>): string {
  const name = [r.firstName, r.middleName, r.lastName]
    .map(part => (part ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return name || UC_STAFF_FALLBACK_NAME;
}

/* Phone lookup */
export async function findUcStaffByPhone(mobile: string): Promise<ResolvedUser | null> {
  const fmts = candidateFormats(mobile);
  const [rows] = await pool.execute<UcStaffRow[]>(
    `SELECT id, mobile, employeeStatus FROM uc_staff WHERE mobile IN (${placeholders(fmts)}) LIMIT 1`,
    fmts,
  );
  if (!rows.length) return null;
  const r = rows[0]!;
  return {
    role: 'uc',
    entityId: String(r.id),
    userId: String(r.id),
    status: normStatus(r.employeeStatus, { nullIsActive: false }),
    requiresProfileSetup: false,
  };
}

/* Status by id: any employeeStatus other than 'Active' is inactive. */
export async function getUcStaffStatusById(id: string): Promise<ResolvedUser['status'] | null> {
  const [rows] = await pool.execute<UcStaffRow[]>(
    'SELECT id, employeeStatus, mobile FROM uc_staff WHERE id = ? LIMIT 1',
    [id],
  );
  if (!rows.length) return null;
  const r = rows[0]!;
  if (normStatus(r.employeeStatus, { nullIsActive: false }) !== 'active') return 'inactive';
  // A staff row can still be 'active' while its number is admin-blocked.
  return (await isRawPhoneAdminBlocked(r.mobile)) ? 'inactive' : 'active';
}

/* Profile loaders */
export async function loadUcStaffProfile(id: string): Promise<UserProfileDto> {
  const [rows] = await pool.execute<UcStaffRow[]>(
    `SELECT id, firstName, middleName, lastName, email, mobile, created_at
       FROM uc_staff WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows.length) return placeholder(id);
  const r = rows[0]!;
  const phone = normalisePhoneToE164(r.mobile);
  return {
    id: String(r.id),
    displayName: fullName(r),
    email: r.email ?? null,
    phoneIndia: phone,
    phoneGlobal: phone,
    // Same fallback as customers, vendors and drivers when the date is missing.
    memberSince: (r.created_at ?? new Date()).toISOString(),
  };
}

export async function loadUcStaffIdentityDetails(
  id: string,
): Promise<{ profile: UserProfileDto; requiresProfileSetup: boolean } | null> {
  const profile = await loadUcStaffProfile(id);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM uc_staff WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows.length) return null;
  return { profile, requiresProfileSetup: false };
}
