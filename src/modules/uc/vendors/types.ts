/**
 * uc.vendors — types for the UC Directory vendors list.
 * Read only from the `vendors` table.
 */
import type { DirectorySort } from '../directory.js';

export type VendorStatus = 'active' | 'pending' | 'suspended' | 'inactive';
export type VendorVerification = 'verified' | 'pending' | 'rejected';

/** One vendor row as the app's Directory receives it. */
export type VendorDirectoryItem = {
  id: string;
  /** vendors.name — the card title (product decision). */
  ownerName: string;
  /** vendors.company_name — shown below the title. */
  companyName: string | null;
  /** vendors.phone — main number. */
  phone: string | null;
  /** vendors.owner_phone — second number. */
  phoneAlt: string | null;
  /** vendors.email */
  email: string | null;
  /** vendors.company_city */
  city: string | null;
  /** vendors.address */
  address: string | null;
  /** vendors.gst_number */
  gstin: string | null;
  /** vendors.company_pan_number */
  pan: string | null;
  /** vendors.company_type */
  businessType: string | null;
  /**
   * vendors.status. Empty (NULL / blank) counts as 'active' (product
   * decision). A value the app doesn't know → null (no badge).
   */
  status: VendorStatus | null;
  /** vendors.verification (KYC). */
  verification: VendorVerification;
  createdAt: string | null;
};

export type VendorListQuery = {
  search: string;
  status: 'all' | VendorStatus;
  sortBy: DirectorySort;
  cursor?: string;
  limit: number;
};
