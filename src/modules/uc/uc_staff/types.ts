/**
 * uc.staff — types for the UC Directory staff list.
 *
 * Source: `pinaak.uc_staff_directory` (and `..._hr` for HR callers), VIEWs
 * over the saarthi HR database. Read only — never write to them.
 *
 * Field names match the app's Staff type in
 * src/features/uc/staff/types.ts, so the list needs no translation layer.
 */
import type { DirectorySort } from '../directory.js';

/** One staff row as the app's Directory receives it. */
export type StaffDirectoryItem = {
  id: string;
  /** first + middle + last. '' when all three are empty. */
  name: string;
  /**
   * Department name, trimmed. One of Sales, Finance, IT, HR, VEH OPS,
   * Digital Marketing (live values, 13 Nov 2026). null when not set — the
   * app then draws no badge. Free text by design: a new department needs no
   * app release, it just gets the neutral badge colour.
   */
  department: string | null;
  /** Sub-department name, trimmed. null when not set. */
  subDepartment: string | null;
  /** saarthi.uc_staff.manager_id. null for staff with no manager. */
  reportingManagerId: string | null;
  /** The manager's full name, joined server-side. null when no manager. */
  reportingManagerName: string | null;
  /**
   * Office number — the number UC staff sign in with. null for the 22 active
   * staff who have none in Saarthi (verified 13 Nov 2026); the app then draws
   * one line fewer. Never substituted with a personal number.
   */
  phone: string | null;
  /**
   * PERSONAL mobile. Present ONLY for HR callers; for everyone else the field
   * is absent from the response because the column is not in the view that
   * was queried.
   */
  phoneAlt?: string | null;
  /** Office email. null for most staff — only 13 of 74 active have one. */
  email: string | null;
  /**
   * Branch name, e.g. 'Mumbai Office'. Labelled "Branch" in the app. 100%
   * populated in live data. Note it is an office, not a city: the Delhi
   * Office address is in Vaishali, Ghaziabad.
   */
  city: string | null;
  /** employeeStatus = 'Active'. */
  active: boolean;
  /**
   * Joining date, ISO. NULLABLE: staff id 1 is Active with no joining date,
   * and staff with no uc_staff_employment row have none either. Never filled
   * in from created_at — that would print an invented joining date.
   */
  joinedAt: string | null;
};

export type StaffActiveFilter = 'all' | 'active' | 'inactive';

export type StaffListQuery = {
  search: string;
  active: StaffActiveFilter;
  sortBy: DirectorySort;
  cursor?: string;
  limit: number;
};
