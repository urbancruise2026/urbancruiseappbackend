/**
 * uc.caller_id — repository. Reads only the columns caller ID shows:
 * names, phone numbers, city / company / department / branch, and the
 * status needed for the 'Inactive' tag. No email, address, GST, PAN,
 * licence or personal mobile numbers.
 */
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../../shared/db/pool.js';

/* ------------------------------------------------------------------ */
/* Staff status                                                       */
/* ------------------------------------------------------------------ */

type StatusRow = RowDataPacket & { employeeStatus: string | null };

/**
 * Whether this UC staff member is Active in Saarthi RIGHT NOW, read from
 * the pinaak.uc_staff_access view.
 *
 * Checked on every request because `authenticate` only checks the access
 * token, and an access token stays valid for up to an hour after someone
 * leaves. The lists hold every customer's number, so they must stop the
 * moment HR marks the person inactive.
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

/* ------------------------------------------------------------------ */
/* Customers                                                          */
/* ------------------------------------------------------------------ */

/** Same full-name rule as the UC Directory customers list. */
const CUSTOMER_NAME_EXPR = `COALESCE(CONCAT_WS(' ',
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

/**
 * Every customer with at least one phone number, ordered by id so the
 * list (and its version) comes out the same for the same data.
 */
export async function listCustomersWithPhones(): Promise<CallerIdRow[]> {
  const [rows] = await pool.query<CallerIdRow[]>(
    `SELECT c.id,
            ${CUSTOMER_NAME_EXPR} AS name,
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

/* ------------------------------------------------------------------ */
/* Vendors                                                            */
/* ------------------------------------------------------------------ */

export type CallerIdVendorRow = RowDataPacket & {
  id: string | number;
  ownerName: string | null;
  companyName: string | null;
  phone: string | null;
  ownerPhone: string | null;
  city: string | null;
  status: string | null;
};

/**
 * Every vendor with a phone: the vendor's own number and the owner
 * contact's number (same two numbers the UC Directory shows). Same joins
 * as uc/vendors/repository.ts.
 */
export async function listVendorsWithPhones(): Promise<CallerIdVendorRow[]> {
  const [rows] = await pool.query<CallerIdVendorRow[]>(
    `SELECT v.id,
            v.name            AS ownerName,
            vc.company_name   AS companyName,
            v.phone,
            vo.phone          AS ownerPhone,
            vc.company_city   AS city,
            v.status
       FROM vendors v
       LEFT JOIN vendor_companies vc ON vc.vendor_id = v.id
       LEFT JOIN vendor_contacts  vo ON vo.vendor_id = v.id AND vo.role = 'owner'
      WHERE NULLIF(TRIM(v.phone), '') IS NOT NULL
         OR NULLIF(TRIM(vo.phone), '') IS NOT NULL
      ORDER BY v.id`,
  );
  return rows;
}

/* ------------------------------------------------------------------ */
/* Drivers                                                            */
/* ------------------------------------------------------------------ */

export type CallerIdDriverRow = RowDataPacket & {
  id: string | number;
  name: string;
  phone: string | null;
  city: string | null;
  vendorName: string | null;
};

/**
 * Every driver with a phone. Vendor name = company name, else the
 * vendor's own name (same rule as uc/drivers/repository.ts).
 */
export async function listDriversWithPhones(): Promise<CallerIdDriverRow[]> {
  const [rows] = await pool.query<CallerIdDriverRow[]>(
    `SELECT d.id,
            COALESCE(CONCAT_WS(' ',
              NULLIF(TRIM(d.first_name), ''), NULLIF(TRIM(d.last_name), '')), '') AS name,
            d.phone,
            d.current_city AS city,
            COALESCE(NULLIF(TRIM(vc.company_name), ''), NULLIF(TRIM(v.name), '')) AS vendorName
       FROM drivers d
       LEFT JOIN vendors          v  ON v.id         = d.vendor_id
       LEFT JOIN vendor_companies vc ON vc.vendor_id = d.vendor_id
      WHERE NULLIF(TRIM(d.phone), '') IS NOT NULL
      ORDER BY d.id`,
  );
  return rows;
}

/* ------------------------------------------------------------------ */
/* UC staff                                                           */
/* ------------------------------------------------------------------ */

export type CallerIdStaffRow = RowDataPacket & {
  id: string | number;
  name: string;
  aliasName: string | null;
  department: string | null;
  subDepartment: string | null;
  branch: string | null;
  officeMobileNumber: string | null;
};

/**
 * ACTIVE UC staff with a WORK number, from the uc_staff_directory view
 * (Saarthi). Never the personal mobile: that one is HR-only (product
 * decision, 24 Nov 2026), and this list goes to every staff phone.
 */
export async function listActiveStaffWithPhones(): Promise<CallerIdStaffRow[]> {
  const [rows] = await pool.query<CallerIdStaffRow[]>(
    `SELECT v.id,
            COALESCE(CONCAT_WS(' ', v.firstName, v.middleName, v.lastName), '') AS name,
            v.aliasName,
            v.department,
            v.subDepartment,
            v.branch,
            v.officeMobileNumber
       FROM uc_staff_directory v
      WHERE v.employeeStatus = 'Active'
        AND v.officeMobileNumber IS NOT NULL
      ORDER BY v.id`,
  );
  return rows;
}
