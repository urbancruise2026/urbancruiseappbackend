/** Resource kinds used by authorize() (a kind, not a specific record). */

export type Subject =
  | 'Enquiry'
  | 'Quotation'
  | 'Booking'
  | 'Trip'
  | 'Payment'
  | 'Customer'
  | 'Notification'
  | 'Feedback'
  | 'Support'
  // UC Directory lists (all customers / vendors / drivers). Separate from
  // 'Customer', which is a customer's OWN profile.
  | 'DirectoryCustomer'
  | 'DirectoryVendor'
  | 'DirectoryDriver';
