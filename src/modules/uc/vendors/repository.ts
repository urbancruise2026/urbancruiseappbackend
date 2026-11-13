/**
 * uc.vendors — repository.
 *
 * The vendor record is SPLIT ACROSS THREE TABLES. `vendors` holds only the
 * identity and status columns; the company details live in
 * `vendor_companies`, and the owner's phone in `vendor_contacts`:
 *
 *   vendors           id, vender_code, name, short_name, email, phone,
 *                     status, verification, created_at, updated_at
 *   vendor_companies  company_name, company_type, company_pan_number,
 *                     gst_number, registered_address, company_city, ...
 *   vendor_contacts   one row per (vendor_id, role) — owner / ops_manager /
 *                     accountant — each with name, phone, email
 *
 * NEITHER JOIN CAN DUPLICATE A ROW, and that is enforced by the database,
 * not by convention:
 *   vendor_companies  PRIMARY KEY (vendor_id)
 *   vendor_contacts   UNIQUE KEY uq_vendor_role (vendor_id, role)
 * So one vendor is always exactly one row here, and the keyset cursor and
 * the total stay correct.
 *
 * `address` is vendor_companies.registered_address. vendor_personal.address
 * is the other candidate and is empty for every vendor in live data
 * (0 of 5 filled, 13 Nov 2026), so it is not read at all.
 *
 * All values are bound with ? placeholders; every SQL fragment below is a
 * fixed string and is never built from user input.
 */
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../../shared/db/pool.js';
import { decodeCursor, keyset, likeContains, phoneSearchFormats } from '../directory.js';
import type { VendorListQuery } from './types.js';

/** Sort A–Z by the card title (vendors.name). */
const NAME_EXPR = `COALESCE(NULLIF(TRIM(v.name), ''), '')`;
const DATE_EXPR = 'COALESCE(UNIX_TIMESTAMP(v.created_at), 0)';
const ID_EXPR = 'v.id';

/**
 * Shared by the page query and the count query. The joins must be on both,
 * because the search filters reference vc and vo.
 */
const FROM_SQL = `FROM vendors v
         LEFT JOIN vendor_companies vc ON vc.vendor_id = v.id
         LEFT JOIN vendor_contacts  vo ON vo.vendor_id = v.id AND vo.role = 'owner'`;

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
      `vc.company_name LIKE ? ESCAPE '\\\\'`,
      `v.email LIKE ? ESCAPE '\\\\'`,
      `vc.company_city LIKE ? ESCAPE '\\\\'`,
    ];
    params.push(like, like, like, like);
    const phones = phoneSearchFormats(q.search);
    if (phones) {
      const ph = phones.map(() => '?').join(', ');
      parts.push(`v.phone IN (${ph})`, `vo.phone IN (${ph})`);
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
      `SELECT v.id, v.name,
              vc.company_name,
              v.phone,
              vo.phone AS owner_phone,
              v.email,
              vc.company_city,
              vc.registered_address AS address,
              vc.gst_number, vc.company_pan_number, vc.company_type,
              v.status, v.verification,
              ${DATE_EXPR} AS created_epoch,
              ${ks.keyExpr} AS sort_key
         ${FROM_SQL}
         ${whereSql(pageWhere)}
        ORDER BY ${ks.orderBy}
        LIMIT ?`,
      [...params, ...ks.params, q.limit + 1],
    ),
    pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total ${FROM_SQL} ${whereSql(where)}`, params),
  ]);

  return { rows, total: Number(countRows[0]?.['total'] ?? 0) };
}
