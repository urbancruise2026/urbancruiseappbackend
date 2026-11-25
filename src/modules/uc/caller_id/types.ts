/**
 * uc.caller_id — types for the caller-ID lists.
 *
 * Two lists, two endpoints:
 *   GET /snapshot  — customers only (CallerIdSnapshot). Kept unchanged for
 *                    app builds that only know the customer card: they
 *                    would show a vendor or driver as "Customer".
 *   GET /contacts  — customers, vendors, drivers and UC staff
 *                    (CallerIdContactsSnapshot). Used by app builds with
 *                    the four card types (24 Nov 2026).
 *
 * The app replaces its local copy with the whole list in one transaction;
 * there are no partial updates, so a deleted, merged or changed record
 * simply disappears from the next list.
 *
 * Only add fields; never rename or remove one (older apps read them).
 */

/** Same categories as the UC Directory (uc/customers). */
export type CallerIdCustomerType = 'personal' | 'corporate' | 'agent';

/* ------------------------------------------------------------------ */
/* /snapshot — customers only                                         */
/* ------------------------------------------------------------------ */

/** One phone number → one customer. */
export type CallerIdEntry = {
  /** E.164, e.g. '+919812345678'. Unique within a snapshot. */
  phone: string;
  /** customers.id, so a later version can open the customer in the app. */
  customerId: string;
  /** Full name; the company name when the customer has no name. */
  name: string;
  /** null when customers.customerType is empty or unknown. */
  type: CallerIdCustomerType | null;
  /** customers.customerCity, trimmed. null when empty or 'Unknown'. */
  city: string | null;
};

export type CallerIdSnapshot = {
  /**
   * Changes whenever any entry changes. The app sends it back as
   * If-None-Match and gets 304 (no body) when nothing changed.
   */
  version: string;
  /** ISO time the snapshot was built on the server. */
  generatedAt: string;
  entries: CallerIdEntry[];
  /**
   * Numbers left out because they belong to two or more different
   * customers. Caller ID never guesses between them. For the app's
   * status screen and for ops to clean up duplicates.
   */
  ambiguousCount: number;
};

/* ------------------------------------------------------------------ */
/* /contacts — customers, vendors, drivers, UC staff                  */
/* ------------------------------------------------------------------ */

/**
 * Who the number belongs to. Also the priority when one number is in two
 * lists: the first kind in this order wins (product decision, 24 Nov 2026).
 */
export const CALLER_ID_KINDS = ['customer', 'vendor', 'driver', 'staff'] as const;
export type CallerIdKind = (typeof CALLER_ID_KINDS)[number];

/**
 * One phone number → one person. Which fields are filled depends on kind:
 *
 *   kind      name                    subtitle                 chips
 *   customer  full name / company     null                     type, city
 *   vendor    owner name              company name             city
 *   driver    driver name             'Driver · <vendor>'      city
 *   staff     alias, else full name   null                     department, branch
 */
export type CallerIdContact = {
  /** E.164, e.g. '+919812345678'. Unique within the list. */
  phone: string;
  kind: CallerIdKind;
  /** The record's id in its own table (customers / vendors / drivers / Saarthi staff). */
  id: string;
  name: string;
  /** Second line under the name, or null. */
  subtitle: string | null;
  /** Customers only. */
  type: CallerIdCustomerType | null;
  /** Customers, vendors, drivers. null when empty or 'Unknown'. */
  city: string | null;
  /** Staff only: 'Sales · Tele-Sales', or just 'Sales'. */
  department: string | null;
  /** Staff only: 'Mumbai Office'. */
  branch: string | null;
  /**
   * A small tag next to the name, decided here so the rules can change
   * without an app update. Today: 'Inactive' for suspended or inactive
   * vendors and for inactive UC staff. null = no tag.
   */
  badge: string | null;
};

export type CallerIdContactsSnapshot = {
  /** As CallerIdSnapshot.version: send back as If-None-Match. */
  version: string;
  generatedAt: string;
  entries: CallerIdContact[];
  /**
   * Numbers left out because two or more different customers, vendors or
   * drivers share them (the highest-priority kind holding the number).
   * Never staff: a shared staff number goes to its first holder.
   */
  ambiguousCount: number;
};
