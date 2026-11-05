/**
 * uc.customers — types for the UC Directory customers list.
 * Read only from the `customers` table.
 */
import type { DirectorySort } from '../directory.js';

export type CustomerCategory = 'personal' | 'corporate' | 'agent';

export type CustomerSubType =
  | 'personal'
  | 'company'
  | 'ngo'
  | 'educational_institute'
  | 'sporting_company'
  | 'government'
  | 'travel_agent'
  | 'tour_operator'
  | 'hotel'
  | 'wedding_planner'
  | 'dmc';

/** One customer row as the app's Directory receives it. */
export type CustomerDirectoryItem = {
  id: string;
  /** From customers.customerType. null when not set or not recognised. */
  category: CustomerCategory | null;
  /** From customers.customerCategoryType. null when not set, not
   *  recognised, or not valid for the category. */
  customerType: CustomerSubType | null;
  /** first + middle + last name. '' when all are empty. */
  name: string;
  /** customers.customerPhone, as stored. */
  phoneIndia: string | null;
  /** customers.alternatePhone, as stored. */
  phoneGlobal: string | null;
  email: string | null;
  city: string | null;
  companyName: string | null;
  /** ISO, or null when the row has no created_at. */
  createdAt: string | null;
};

export type CustomerListQuery = {
  search: string;
  type: 'all' | CustomerCategory;
  /** 'YYYY-MM-DD', India time, inclusive. */
  dateFrom?: string;
  /** 'YYYY-MM-DD', India time, inclusive. */
  dateTo?: string;
  sortBy: DirectorySort;
  cursor?: string;
  limit: number;
};
