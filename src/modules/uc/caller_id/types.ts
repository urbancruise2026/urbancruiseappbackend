/**
 * uc.caller_id — types for the caller-ID snapshot.
 *
 * The snapshot is the complete list of customer numbers a UC staff phone
 * needs to recognise who is calling. The app replaces its local copy with
 * it in one transaction; there are no partial updates, so a deleted,
 * merged or changed customer simply disappears from the next snapshot.
 *
 * Only add fields; never rename or remove one (older apps read them).
 */

/** Same categories as the UC Directory (uc/customers). */
export type CallerIdCustomerType = 'personal' | 'corporate' | 'agent';

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
