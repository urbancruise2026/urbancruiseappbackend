/**
 * uc.vendors — types for the UC Directory vendors list.
 *
 * The vendor record is split across three tables; see repository.ts for the
 * joins and why they cannot duplicate a row. The field comments below name
 * the real source column for each value.
 */
import type { DirectorySort } from '../directory.js';

export type VendorStatus = 'active' | 'pending' | 'suspended' | 'inactive';
export type VendorVerification = 'verified' | 'pending' | 'rejected';

/** One vendor row as the app's Directory receives it. */
export type VendorDirectoryItem = {
  id: string;
  /** vendors.name — the card title (product decision). */
  ownerName: string;
  /** vendor_companies.company_name — shown below the title. */
  companyName: string | null;
  /** vendors.phone — main number. */
  phone: string | null;
  /** vendor_contacts.phone where role = 'owner' — second number. */
  phoneAlt: string | null;
  /** vendors.email */
  email: string | null;
  /** vendor_companies.company_city */
  city: string | null;
  /**
   * vendor_companies.registered_address. NOT vendor_personal.address, which
   * is empty for every vendor in live data (0 of 5, 13 Nov 2026).
   */
  address: string | null;
  /**
   * vendor_companies.gst_number. Empty for every vendor in live data
   * (0 of 5, 13 Nov 2026), so this is usually null on the card.
   */
  gstin: string | null;
  /** vendor_companies.company_pan_number */
  pan: string | null;
  /** vendor_companies.company_type */
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