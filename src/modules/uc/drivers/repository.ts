/**
 * uc.drivers — repository. Reads `drivers`, LEFT JOINed to `vendors` for
 * the vendor name. Needs drivers.status and drivers.vendor_id
 * (db/migrations/20261105_01_...).
 */
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../../shared/db/pool.js';
import { decodeCursor, keyset, likeContains, phoneSearchFormats } from '../directory.js';
import type { DriverListQuery } from './types.js';

const NAME_EXPR = `COALESCE(CONCAT_WS(' ',
    NULLIF(TRIM(d.first_name), ''), NULLIF(TRIM(d.last_name), '')), '')`;
const VENDOR_NAME_EXPR = `COALESCE(NULLIF(TRIM(v.company_name), ''), NULLIF(TRIM(v.name), ''))`;
const DATE_EXPR = 'COALESCE(UNIX_TIMESTAMP(d.created_at), 0)';
const ID_EXPR = 'd.id';

export type DriverRow = RowDataPacket & {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  current_city: string | null;
  vendor_id: number | null;
  vendor_name: string | null;
  license_number: string | null;
  status: string;
  created_epoch: string | number;
  sort_key: string | number;
};

function filterSql(q: DriverListQuery): { where: string[]; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.search) {
    const like = likeContains(q.search);
    const parts = [
      `${NAME_EXPR} LIKE ? ESCAPE '\\\\'`,
      `${VENDOR_NAME_EXPR} LIKE ? ESCAPE '\\\\'`,
      `d.email LIKE ? ESCAPE '\\\\'`,
      `d.current_city LIKE ? ESCAPE '\\\\'`,
      `d.license_number LIKE ? ESCAPE '\\\\'`,
    ];
    params.push(like, like, like, like, like);
    const phones = phoneSearchFormats(q.search);
    if (phones) {
      parts.push(`d.phone IN (${phones.map(() => '?').join(', ')})`);
      params.push(...phones);
    }
    where.push(`(${parts.join(' OR ')})`);
  }

  if (q.verification !== 'all') {
    where.push('d.status = ?');
    params.push(q.verification);
  }

  if (q.vendorId !== undefined) {
    where.push('d.vendor_id = ?');
    params.push(q.vendorId);
  }

  return { where, params };
}

export async function listDrivers(
  q: DriverListQuery,
): Promise<{ rows: DriverRow[]; total: number }> {
  const { where, params } = filterSql(q);
  const cursor = q.cursor ? decodeCursor(q.cursor, q.sortBy) : null;
  const ks = keyset(
    q.sortBy,
    { dateExpr: DATE_EXPR, nameExpr: NAME_EXPR, idExpr: ID_EXPR },
    cursor,
  );

  const pageWhere = ks.where ? [...where, ks.where] : where;
  const whereSql = (w: string[]) => (w.length ? `WHERE ${w.join(' AND ')}` : '');
  const from = 'FROM drivers d LEFT JOIN vendors v ON v.id = d.vendor_id';

  const [[rows], [countRows]] = await Promise.all([
    pool.query<DriverRow[]>(
      `SELECT d.id,
              ${NAME_EXPR} AS name,
              d.phone, d.email, d.current_city, d.vendor_id,
              ${VENDOR_NAME_EXPR} AS vendor_name,
              d.license_number, d.status,
              ${DATE_EXPR} AS created_epoch,
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
