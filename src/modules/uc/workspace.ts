/**
 * uc — which dashboard a staff member gets, and who may see personal numbers.
 *
 * Pure functions over a UcViewerAccess row. No I/O, so every rule here is
 * directly unit-testable.
 *
 * THE SERVER DECIDES, NOT THE APP
 *   The app receives the resolved workspace and uses it only to choose which
 *   screen to draw. It never sends it back, and nothing is authorised from it:
 *   anyone can modify a mobile app. Every endpoint that returns a dashboard's
 *   DATA must call resolveWorkspace() again for itself.
 *
 * IDS, NOT NAMES
 *   departments.department_name is editable and already holds 'VEH OPS ' with
 *   a trailing space in production. Ids do not change.
 *
 * Live figures these rules produce (active staff, verified 13 Nov 2026):
 *   telesales 40 · general 22 · sales 9 · admin 2 · ops 1   = 74
 */
import type { UcViewerAccess } from './viewer.js';

/** The dashboards the app can render. 'general' is the fallback. */
export type UcWorkspace = 'admin' | 'telesales' | 'sales' | 'ops' | 'general';

/* ------------------------------------------------------------------ */
/* Saarthi ids these rules key on                                     */
/* ------------------------------------------------------------------ */

/** saarthi.departments.id = 4 ('HR'). */
export const HR_DEPARTMENT_ID = 4;

/** saarthi.departments.id = 1 ('Sales'). */
const SALES_DEPARTMENT_ID = 1;

/** saarthi.sub_department.id = 3 ('Tele-Sales', inside Sales). */
const TELESALES_SUB_DEPARTMENT_ID = 3;

/**
 * UNCONFIRMED — CHANGE THIS ONE LINE IF 'Ops' MEANS SOMETHING ELSE.
 *
 * Set to saarthi.departments.id = 5 ('VEH OPS'), which is 1 active person.
 * The other candidate is saarthi.sub_department.id = 13 ('Ops & Admin',
 * inside HR), which is 6 active people. They are different parts of the
 * company: VEH OPS handles vehicles and vendors; Ops & Admin sits inside HR.
 *
 * To switch to 'Ops & Admin': delete this constant, and replace the ops rule
 * in resolveWorkspace() with
 *     if (a.subDepartmentId === 13) return 'ops';
 * placed ABOVE the HR fallthrough.
 */
const OPS_DEPARTMENT_ID = 5;

/**
 * saarthi.auth_credentials.access_role values that get the Admin dashboard.
 * Confirmed by the user, 13 Nov 2026: Admin means SUPER_ADMIN and HOD. These
 * are access roles, NOT departments — there is no 'Admin' department in
 * saarthi.departments.
 */
const ADMIN_ACCESS_ROLES: ReadonlySet<string> = new Set(['SUPER_ADMIN', 'HOD']);

/* ------------------------------------------------------------------ */
/* Rules                                                              */
/* ------------------------------------------------------------------ */

/**
 * First match wins, top to bottom. A caller with no access row (removed
 * between authentication and this read) gets 'general' — the dashboard with
 * the least in it.
 *
 * Order matters: the admin check is first, so a HOD inside Sales gets the
 * Admin dashboard rather than the Sales one. The Tele-Sales check is above
 * the Sales check, because Tele-Sales is a sub-department INSIDE Sales and
 * would otherwise be swallowed by it.
 */
export function resolveWorkspace(access: UcViewerAccess | null): UcWorkspace {
  if (!access) return 'general';

  const role = (access.accessRole ?? '').trim().toUpperCase();
  if (ADMIN_ACCESS_ROLES.has(role)) return 'admin';

  if (access.subDepartmentId === TELESALES_SUB_DEPARTMENT_ID) return 'telesales';
  if (access.departmentId === SALES_DEPARTMENT_ID) return 'sales';
  if (access.departmentId === OPS_DEPARTMENT_ID) return 'ops';

  return 'general';
}

/**
 * Whether this caller may see other staff members' PERSONAL mobile numbers in
 * the UC Directory. HR department only (product decision, 13 Nov 2026).
 *
 * Deliberately NOT folded into resolveWorkspace(). A dashboard and a data
 * permission are two different things: HR may later get its own dashboard, or
 * Finance may later be allowed to see personal numbers, and neither change
 * should disturb the other. (Single Responsibility — see README.)
 *
 * This decides which VIEW the repository queries. For a caller where this is
 * false, the personal number is not in the view at all, so it cannot leak
 * even if a later code change mishandles the flag.
 */
export function canSeePersonalNumbers(access: UcViewerAccess | null): boolean {
  return access?.departmentId === HR_DEPARTMENT_ID;
}

/**
 * Workspaces whose users may read the FULL UC Directory — customers,
 * vendors and drivers. Everyone else sees only the UC staff tab
 * (product decision, 13 Nov 2026).
 */
const FULL_DIRECTORY_WORKSPACES: ReadonlySet<UcWorkspace> = new Set<UcWorkspace>([
  'admin',
  'sales',
  'telesales',
  'ops',
]);

/**
 * Whether this caller may read customer, vendor and driver lists.
 *
 * Hiding those tabs in the app is NOT a boundary — the app's own
 * screenAccess.ts says so, and anyone can modify a client. Without this
 * check a 'general' user could call /api/v1/uc/customers directly and
 * receive every customer record. Applied as route middleware; see
 * requireFullDirectory.ts.
 *
 * The UC staff list is deliberately NOT gated: every staff member may look
 * up a colleague, which is the whole point of that tab.
 */
export function canReadFullDirectory(access: UcViewerAccess | null): boolean {
  return FULL_DIRECTORY_WORKSPACES.has(resolveWorkspace(access));
}
