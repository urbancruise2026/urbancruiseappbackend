/**
 * uc — where the SIGNED-IN staff member sits in the HR org chart.
 *
 * Reads `pinaak.uc_staff_access`, a VIEW over saarthi (db/pinaak/views/
 * uc_staff_directory.sql). One row, looked up by the caller's own id from the
 * access token — never from the request body.
 *
 * WHY THIS IS READ PER REQUEST, NOT TAKEN FROM THE JWT
 *   JWT_ACCESS_TTL is 1h and JWT_REFRESH_TTL 30d (config/env.ts). If the
 *   department were a token claim, moving someone from Sales to HR in Saarthi
 *   would leave them on the old dashboard — and, worse, keep letting them see
 *   personal numbers — until the token happened to refresh. The whole point of
 *   reading Saarthi through a view is that HR changes apply at once. One
 *   primary-key lookup per request keeps that true.
 *
 * This file is DB access only. The rules that turn a row into a dashboard or a
 * permission live in workspace.ts, so the two can be tested and changed apart.
 */
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../shared/db/pool.js';

/** One row of pinaak.uc_staff_access. */
export type UcViewerAccess = {
  staffId: string;
  /** saarthi.departments.id. null when the staff row has no department. */
  departmentId: number | null;
  /** saarthi.sub_department.id. null when not set. */
  subDepartmentId: number | null;
  /**
   * saarthi.auth_credentials.access_role — the Saarthi web-app role.
   * One of EMPLOYEE, MANAGER, TEAM_LEAD, ZONAL_HEAD, SUPER_ADMIN, HOD
   * (live values, 13 Nov 2026). null when the person has no Saarthi login.
   */
  accessRole: string | null;
};

type AccessRow = RowDataPacket & {
  id: number;
  departmentId: number | null;
  subDepartmentId: number | null;
  accessRole: string | null;
};

/**
 * The caller's own placement, or null when no staff row matches.
 *
 * A null return is NOT treated as an error here. `authenticate` has already
 * confirmed the session, and getUcStaffStatusById() has already confirmed the
 * account is Active, so null means the row was removed between those checks
 * and this read. Callers fall back to the least-privileged outcome: the
 * 'general' dashboard and no personal numbers.
 */
export async function loadViewerAccess(staffId: string): Promise<UcViewerAccess | null> {
  const [rows] = await pool.execute<AccessRow[]>(
    `SELECT id, departmentId, subDepartmentId, accessRole
       FROM uc_staff_access
      WHERE id = ?
      LIMIT 1`,
    [staffId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    staffId: String(r.id),
    departmentId: r.departmentId === null ? null : Number(r.departmentId),
    subDepartmentId: r.subDepartmentId === null ? null : Number(r.subDepartmentId),
    accessRole: r.accessRole,
  };
}
