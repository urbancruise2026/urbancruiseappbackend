/**
 * uc.caller_id — repository. Reads ONLY the `customers` table, and only the
 * columns caller ID shows: no email, no address, no company details beyond
 * the name used when a customer has no personal name.
 */
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../../shared/db/pool.js';

/** Same full-name rule as the UC Directory customers list. */
const NAME_EXPR = `COALESCE(CONCAT_WS(' ',
    NULLIF(TRIM(c.firstName), ''), NULLIF(TRIM(c.middleName), ''), NULLIF(TRIM(c.lastName), '')), '')`;

export type CallerIdRow = RowDataPacket & {
  id: string | number;
  name: string;
  companyName: string | null;
  customerType: string | null;
  customerPhone: string | null;
  alternatePhone: string | null;
  customerCity: string | null;
};

type StatusRow = RowDataPacket & { employeeStatus: string | null };

/**
 * Whether this UC staff member is Active in Saarthi RIGHT NOW, read from
 * the pinaak.uc_staff_access view.
 *
 * Checked on every snapshot request because `authenticate` only checks the
 * access token, and an access token stays valid for up to an hour after
 * someone leaves. The snapshot is every customer's number, so it must stop
 * the moment HR marks the person inactive.
 */
export async function isActiveStaff(staffId: string): Promise<boolean> {
  const [rows] = await pool.execute<StatusRow[]>(
    `SELECT employeeStatus
       FROM uc_staff_access
      WHERE id = ?
      LIMIT 1`,
    [staffId],
  );
  return rows[0]?.employeeStatus === 'Active';
}

/**
 * Every customer with at least one phone number, ordered by id so the
 * snapshot (and its version) comes out the same for the same data.
 */
export async function listCustomersWithPhones(): Promise<CallerIdRow[]> {
  const [rows] = await pool.query<CallerIdRow[]>(
    `SELECT c.id,
            ${NAME_EXPR} AS name,
            c.companyName,
            c.customerType,
            c.customerPhone,
            c.alternatePhone,
            c.customerCity
       FROM customers c
      WHERE NULLIF(TRIM(c.customerPhone), '') IS NOT NULL
         OR NULLIF(TRIM(c.alternatePhone), '') IS NOT NULL
      ORDER BY c.id`,
  );
  return rows;
}
