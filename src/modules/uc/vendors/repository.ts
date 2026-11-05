/**
 * uc.vendors — repository. Reads ONLY the `vendors` table.
 * Needs vendors.verification (db/migrations/20261105_01_...).
 */
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../../shared/db/pool.js';
import { decodeCursor, keyset, likeContains, phoneSearchFormats } from '../directory.js';
import type { VendorListQuery } from './types.js';

/** Sort A–Z by the card title (vendors.name). */
const NAME_EXPR = `COALESCE(NULLIF(TRIM(v.name), ''), '')`;
const DATE_EXPR = 'COALESCE(UNIX_TIMESTAMP(v.created_at), 0)';
const ID_EXPR = 'v.id';

export type VendorRow = RowDataPacket & {
  id: number;
  name: string | null;
  company_name: string | null;
  phone: string | null;
  owner_phone: string | null;
  email: string | null;
  company_city: string | null;
  address: string | null;
  gst_number: string | null;
  company_pan_number: string | null;
  company_type: string | null;
  status: string | null;
  verification: string;
  created_epoch: string | number;
  sort_key: string | number;
};

function filterSql(q: VendorListQuery): { where: string[]; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.search) {
    const like = likeContains(q.search);
    const parts = [
      `v.name LIKE ? ESCAPE '\\\\'`,
      `v.company_name LIKE ? ESCAPE '\\\\'`,
      `v.email LIKE ? ESCAPE '\\\\'`,
      `v.company_city LIKE ? ESCAPE '\\\\'`,
    ];
    params.push(like, like, like, like);
    const phones = phoneSearchFormats(q.search);
    if (phones) {
      const ph = phones.map(() => '?').join(', ');
      parts.push(`v.phone IN (${ph})`, `v.owner_phone IN (${ph})`);
      params.push(...phones, ...phones);
    }
    where.push(`(${parts.join(' OR ')})`);
  }

  if (q.status === 'active') {
    // Empty status counts as Active (product decision).
    where.push(`(v.status IS NULL OR TRIM(v.status) = '' OR TRIM(v.status) = 'active')`);
  } else if (q.status !== 'all') {
    where.push('TRIM(v.status) = ?');
    params.push(q.status);
  }

  return { where, params };
}

export async function listVendors(
  q: VendorListQuery,
): Promise<{ rows: VendorRow[]; total: number }> {
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
    pool.query<VendorRow[]>(
      `SELECT v.id, v.name, v.company_name, v.phone, v.owner_phone, v.email,
              v.company_city, v.address, v.gst_number, v.company_pan_number,
              v.company_type, v.status, v.verification,
              ${DATE_EXPR} AS created_epoch,
              ${ks.keyExpr} AS sort_key
         FROM vendors v
         ${whereSql(pageWhere)}
        ORDER BY ${ks.orderBy}
        LIMIT ?`,
      [...params, ...ks.params, q.limit + 1],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM vendors v ${whereSql(where)}`,
      params,
    ),
  ]);

  return { rows, total: Number(countRows[0]?.['total'] ?? 0) };
}
