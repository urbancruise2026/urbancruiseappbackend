/**
 * auth repository: uc_staff. Only employeeStatus 'Active' (trimmed,
 * case-insensitive) may log in. The old `status` column is not used for login.
 *
 * Login number: UC staff sign in with their OFFICE number
 * (uc_staff.officeMobileNumber), not the personal `mobile` column. The same
 * column is used for the refresh-time "number still linked" check, the admin
 * block check and the profile phone, so all of them agree on one number.
 *
 * Office SIMs get reassigned, so one number can appear on several rows (an
 * old staff member who left and the new one). Only Active rows compete:
 *   - one Active row         → that account
 *   - no Active row          → the account is reported inactive
 *   - more than one Active   → refused (409 account_ambiguous); never guess
 *
 * The table has no full_name column: the display name is built from
 * firstName + middleName + lastName.
 */
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../../shared/db/pool.js';
import { logger } from '../../../shared/logger/index.js';
import { ConflictError } from '../../../shared/errors/index.js';
import { isRawPhoneAdminBlocked } from './mobile-registry.js';
import { AUTH_ERROR, type ResolvedUser, type UserProfileDto } from '../types.js';
import {
  candidateFormats,
  placeholders,
  normalisePhoneToE164,
  placeholder,
  normStatus,
} from './users-shared.js';

/** Shown when a staff row has no first, middle or last name. */
const UC_STAFF_FALLBACK_NAME = 'UC Staff';

/**
 * Upper bound on rows read for one office number. Real data has one or two
 * (reassigned SIM); the cap only stops a bad import from loading the table.
 */
const OFFICE_NUMBER_MATCH_LIMIT = 20;

/* DB row (only the columns this file reads) */
type UcStaffRow = RowDataPacket & {
  id: number;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  email: string | null;
  /** Login number. Nullable: staff without an office number cannot log in. */
  officeMobileNumber: string | null;
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

function toResolved(r: Pick<UcStaffRow, 'id' | 'employeeStatus'>): ResolvedUser {
  return {
    role: 'uc',
    entityId: String(r.id),
    userId: String(r.id),
    status: normStatus(r.employeeStatus, { nullIsActive: false }),
    requiresProfileSetup: false,
  };
}

/* Phone lookup (by office number) */
export async function findUcStaffByPhone(mobile: string): Promise<ResolvedUser | null> {
  const fmts = candidateFormats(mobile);
  const [rows] = await pool.execute<UcStaffRow[]>(
    `SELECT id, employeeStatus
       FROM uc_staff
      WHERE officeMobileNumber IN (${placeholders(fmts)})
      ORDER BY id
      LIMIT ${OFFICE_NUMBER_MATCH_LIMIT}`,
    fmts,
  );
  if (!rows.length) return null;

  const resolved = rows.map(toResolved);
  const active = resolved.filter(u => u.status === 'active');

  if (active.length === 1) return active[0]!;

  if (active.length > 1) {
    // Data error in the CRM: never pick one, or a login could open someone
    // else's account. Ids only; the number is never logged unmasked.
    logger.error(
      {
        alarm: 'uc_office_number_ambiguous',
        staffIds: active.map(u => u.entityId),
      },
      'uc login refused — office number is on more than one Active uc_staff row',
    );
    throw new ConflictError(
      'This number is linked to more than one staff account. ' +
        'Please contact your Urban Cruise administrator.',
      AUTH_ERROR.ACCOUNT_AMBIGUOUS,
      { role: 'uc' },
    );
  }

  // Rows exist but none is Active: report the account as inactive.
  return resolved[0]!;
}

/* Status by id: any employeeStatus other than 'Active' is inactive. */
export async function getUcStaffStatusById(id: string): Promise<ResolvedUser['status'] | null> {
  const [rows] = await pool.execute<UcStaffRow[]>(
    'SELECT id, employeeStatus, officeMobileNumber FROM uc_staff WHERE id = ? LIMIT 1',
    [id],
  );
  if (!rows.length) return null;
  const r = rows[0]!;
  if (normStatus(r.employeeStatus, { nullIsActive: false }) !== 'active') return 'inactive';
  // A staff row can still be 'active' while its login number is admin-blocked.
  return (await isRawPhoneAdminBlocked(r.officeMobileNumber)) ? 'inactive' : 'active';
}

/* Profile loaders */
export async function loadUcStaffProfile(id: string): Promise<UserProfileDto> {
  const [rows] = await pool.execute<UcStaffRow[]>(
    `SELECT id, firstName, middleName, lastName, email, officeMobileNumber, created_at
       FROM uc_staff WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows.length) return placeholder(id);
  const r = rows[0]!;
  // The login number. Null-safe: an empty phone is shown as '' (as placeholder()).
  const raw = (r.officeMobileNumber ?? '').trim();
  const phone = raw ? normalisePhoneToE164(raw) : '';
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
