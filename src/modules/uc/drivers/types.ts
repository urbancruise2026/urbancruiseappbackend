/**
 * uc.drivers — types for the UC Directory drivers list.
 * Reads the `drivers` table, joined to `vendors` and `vendor_companies`
 * for the vendor's display name. See repository.ts.
 */
import type { DirectorySort } from '../directory.js';

export type DriverVerification = 'verified' | 'pending' | 'rejected';

/** One driver row as the app's Directory receives it. */
export type DriverDirectoryItem = {
  id: string;
  /** first_name + last_name. '' when both are empty. */
  name: string;
  phone: string | null;
  email: string | null;
  /** drivers.current_city */
  city: string | null;
  /** drivers.vendor_id; null when not linked to a vendor. */
  vendorId: string | null;
  /** vendor_companies.company_name, falling back to vendors.name when the
   *  company row has none. */
  vendorName: string | null;
  /** drivers.license_number */
  licenseNo: string | null;
  /** drivers.status */
  verification: DriverVerification;
  createdAt: string | null;
};

export type DriverListQuery = {
  search: string;
  verification: 'all' | DriverVerification;
  vendorId?: number;
  sortBy: DirectorySort;
  cursor?: string;
  limit: number;
};
