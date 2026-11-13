/**
 * uc.staff — repository. Reads ONLY the directory VIEWs:
 *
 *   uc_staff_directory      no personal number   (every UC caller)
 *   uc_staff_directory_hr   + personalMobile     (HR callers only)
 *
 * Both are read-only views over saarthi; see
 * db/pinaak/views/uc_staff_directory.sql.
 *
 * HOW THE PERSONAL NUMBER IS PROTECTED
 *   The view name and the SELECT list are two fixed constants, chosen by the
 *   boolean the service computed from canSeePersonalNumbers(). Nothing about
 *   them comes from the request. For a non-HR caller the personal number is
 *   not a column of the view that was queried, so it cannot be returned even
 *   if a later change mishandles the flag. Defence in depth, not one `if`.
 *
 * All values are bound with ? placeholders. Every SQL fragment below is a
 * fixed string and is never built from user input.
 */
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../../shared/db/pool.js';
import { decodeCursor, keyset, likeContains, phoneSearchFormats } from '../directory.js';
import type { StaffListQuery } from './types.js';

/* ------------------------------------------------------------------ */
/* Column expressions                                                 */
/* ------------------------------------------------------------------ */

/**
 * Card title. The view already turns blank parts into NULL, so CONCAT_WS
 * drops them; a row with no name at all becomes ''.
 */
const NAME_EXPR = `COALESCE(CONCAT_WS(' ', v.firstName, v.middleName, v.lastName), '')`;

/**
 * Sort key for 'newest' / 'oldest': the real joining date. Rows without one
 * (staff id 1, and anyone with no uc_staff_employment row) sort as epoch 0,
 * i.e. oldest — the same convention the customers list uses for created_at.
 */
const DATE_EXPR = 'COALESCE(UNIX_TIMESTAMP(v.joiningDate), 0)';

const ID_EXPR = 'v.id';

/** Shared by both shapes. The HR shape appends personalMobile. */
const BASE_COLUMNS = `v.id,
              ${NAME_EXPR} AS name,
              v.department, v.subDepartment,
              v.managerId, v.managerName,
              v.officeMobileNumber, v.email, v.branch,
              v.employeeStatus,
              ${DATE_EXPR} AS joined_epoch`;

/* ------------------------------------------------------------------ */
/* Row shapes                                                         */
/* ------------------------------------------------------------------ */

export type StaffRow = RowDataPacket & {
  id: number;
  name: string;
  department: string | null;
  subDepartment: string | null;
  managerId: number | null;
  managerName: string | null;
  officeMobileNumber: string | null;
  email: string | null;
  branch: string | null;
  employeeStatus: string | null;
  joined_epoch: string | number;
  sort_key: string | number;
};

/** Only ever produced by listStaffForHr(). */
export type StaffRowHr = StaffRow & { personalMobile: string | null };

/* ------------------------------------------------------------------ */
/* Filters                                                            */
/* ------------------------------------------------------------------ */

/**
 * WHERE for search + filters (no cursor), shared by the page and the count.
 *
 * `searchPersonalMobile` is true only on the HR path, where the column
 * exists. It is a caller-supplied boolean, never a request value.
 */
function filterSql(
  q: StaffListQuery,
  searchPersonalMobile: boolean,
): { where: string[]; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.search) {
    const like = likeContains(q.search);
    const parts = [
      `${NAME_EXPR} LIKE ? ESCAPE '\\\\'`,
      `v.email LIKE ? ESCAPE '\\\\'`,
      `v.branch LIKE ? ESCAPE '\\\\'`,
    ];
    params.push(like, like, like);

    // A phone matches only the COMPLETE number, never part of it — the app
    // masks phones, so partial digits must not reveal them. Same rule as the
    // app's phoneMatchesQuery(). Live office numbers are stored as plain 10
    // digits (55 rows) and '+91 NNNNNNNNNN' (1 row); personal numbers are all
    // plain 10 digits. phoneLookupFormats() covers both.
    const phones = phoneSearchFormats(q.search);
    if (phones) {
      const ph = phones.map(() => '?').join(', ');
      parts.push(`v.officeMobileNumber IN (${ph})`);
      params.push(...phones);
      if (searchPersonalMobile) {
        parts.push(`v.personalMobile IN (${ph})`);
        params.push(...phones);
      }
    }
    where.push(`(${parts.join(' OR ')})`);
  }

  if (q.active !== 'all') {
    where.push('v.employeeStatus = ?');
    params.push(q.active === 'active' ? 'Active' : 'Inactive');
  }

  return { where, params };
}

/* ------------------------------------------------------------------ */
/* Queries                                                            */
/* ------------------------------------------------------------------ */

/**
 * One page (limit + 1 rows, so the caller can tell whether there is a next
 * page) and the total for the same search and filters.
 *
 * `view` and `columns` are passed only by the two exported wrappers below,
 * each with its own literal constants.
 */
async function listFrom<T extends StaffRow>(
  q: StaffListQuery,
  view: string,
  columns: string,
  searchPersonalMobile: boolean,
): Promise<{ rows: T[]; total: number }> {
  const { where, params } = filterSql(q, searchPersonalMobile);
  const cursor = q.cursor ? decodeCursor(q.cursor, q.sortBy) : null;
  const ks = keyset(
    q.sortBy,
    { dateExpr: DATE_EXPR, nameExpr: NAME_EXPR, idExpr: ID_EXPR },
    cursor,
  );

  const pageWhere = ks.where ? [...where, ks.where] : where;
  const whereSql = (w: string[]) => (w.length ? `WHERE ${w.join(' AND ')}` : '');
  const from = `FROM ${view} v`;

  const [[rows], [countRows]] = await Promise.all([
    pool.query<T[]>(
      `SELECT ${columns},
              ${ks.keyExpr} AS sort_key
         ${from}
         ${whereSql(pageWhere)}
        ORDER BY ${ks.orderBy}
        LIMIT ?`,
      [...params, ...ks.params, q.limit + 1],
    ),
    pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total ${from} ${whereSql(where)}`, params),
  ]);

  return { rows, total: Number(countRows[0]?.['total'] ?? 0) };
}

/** Every UC caller. The personal number is not a column of this view. */
export function listStaff(q: StaffListQuery): Promise<{ rows: StaffRow[]; total: number }> {
  return listFrom<StaffRow>(q, 'uc_staff_directory', BASE_COLUMNS, false);
}

/**
 * HR callers only. The service must have established that through
 * canSeePersonalNumbers() before calling this.
 */
export function listStaffForHr(q: StaffListQuery): Promise<{ rows: StaffRowHr[]; total: number }> {
  return listFrom<StaffRowHr>(
    q,
    'uc_staff_directory_hr',
    `${BASE_COLUMNS}, v.personalMobile`,
    true,
  );
}
