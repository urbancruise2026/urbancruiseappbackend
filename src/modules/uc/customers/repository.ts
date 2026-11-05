/**
 * uc.customers — repository. Reads ONLY the `customers` table.
 * Always ? placeholders; SQL fragments below are fixed strings, never
 * built from user input.
 */
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../../shared/db/pool.js';
import {
  decodeCursor,
  istDayStartEpoch,
  keyset,
  likeContains,
  phoneSearchFormats,
} from '../directory.js';
import type { CustomerCategory, CustomerListQuery } from './types.js';

/** customers.customerType values per category (live data, 05 Nov 2026). */
export const CATEGORY_DB_VALUE: Readonly<Record<CustomerCategory, string>> = {
  personal: 'Personal',
  corporate: 'Corporate',
  agent: 'Travel Agent',
};

const NAME_EXPR = `COALESCE(CONCAT_WS(' ',
    NULLIF(TRIM(c.firstName), ''), NULLIF(TRIM(c.middleName), ''), NULLIF(TRIM(c.lastName), '')), '')`;
/** Sort key: rows without created_at sort as epoch 0 (oldest). */
const DATE_EXPR = 'COALESCE(UNIX_TIMESTAMP(c.created_at), 0)';
/** Date filters: NULL for rows without created_at, so they never match a range. */
const CREATED_EXPR = 'UNIX_TIMESTAMP(c.created_at)';
const ID_EXPR = 'c.id';

export type CustomerRow = RowDataPacket & {
  id: string;
  name: string;
  customerType: string | null;
  customerCategoryType: string | null;
  customerPhone: string | null;
  alternatePhone: string | null;
  customerEmail: string | null;
  customerCity: string | null;
  companyName: string | null;
  created_epoch: string | number;
  sort_key: string | number;
};

/** WHERE for search + filters (no cursor), shared by the page and the count. */
function filterSql(q: CustomerListQuery): { where: string[]; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.search) {
    const like = likeContains(q.search);
    const parts = [
      `${NAME_EXPR} LIKE ? ESCAPE '\\\\'`,
      `c.customerEmail LIKE ? ESCAPE '\\\\'`,
      `c.customerCity LIKE ? ESCAPE '\\\\'`,
      `c.companyName LIKE ? ESCAPE '\\\\'`,
    ];
    params.push(like, like, like, like);
    const phones = phoneSearchFormats(q.search);
    if (phones) {
      const ph = phones.map(() => '?').join(', ');
      parts.push(`c.customerPhone IN (${ph})`, `c.alternatePhone IN (${ph})`);
      params.push(...phones, ...phones);
    }
    where.push(`(${parts.join(' OR ')})`);
  }

  if (q.type !== 'all') {
    where.push('c.customerType = ?');
    params.push(CATEGORY_DB_VALUE[q.type]);
  }

  if (q.dateFrom) {
    where.push(`${CREATED_EXPR} >= ?`);
    params.push(istDayStartEpoch(q.dateFrom));
  }
  if (q.dateTo) {
    // Inclusive day: before 00:00 IST of the next day.
    where.push(`${CREATED_EXPR} < ?`);
    params.push(istDayStartEpoch(q.dateTo) + 24 * 60 * 60);
  }

  return { where, params };
}

/**
 * One page (limit + 1 rows, so the caller can tell whether there is a
 * next page) and the total for the same search and filters.
 */
export async function listCustomers(
  q: CustomerListQuery,
): Promise<{ rows: CustomerRow[]; total: number }> {
  const { where, params } = filterSql(q);
  const cursor = q.cursor ? decodeCursor(q.cursor, q.sortBy) : null;
  const ks = keyset(
    q.sortBy,
    { dateExpr: DATE_EXPR, nameExpr: NAME_EXPR, idExpr: ID_EXPR },
    cursor,
  );

  const pageWhere = ks.where ? [...where, ks.where] : where;
  const whereSql = (w: string[]) => (w.length ? `WHERE ${w.join(' AND ')}` : '');

  const [[rows], [countRows]] = await Promise.all([
    pool.query<CustomerRow[]>(
      `SELECT c.id,
              ${NAME_EXPR} AS name,
              c.customerType, c.customerCategoryType,
              c.customerPhone, c.alternatePhone, c.customerEmail,
              c.customerCity, c.companyName,
              ${DATE_EXPR} AS created_epoch,
              ${ks.keyExpr} AS sort_key
         FROM customers c
         ${whereSql(pageWhere)}
        ORDER BY ${ks.orderBy}
        LIMIT ?`,
      [...params, ...ks.params, q.limit + 1],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM customers c ${whereSql(where)}`,
      params,
    ),
  ]);

  return { rows, total: Number(countRows[0]?.['total'] ?? 0) };
}
