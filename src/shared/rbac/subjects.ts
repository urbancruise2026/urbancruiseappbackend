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
  // UC Directory lists (all customers / vendors / drivers / staff).
  // Separate from 'Customer', which is a customer's OWN profile.
  | 'DirectoryCustomer'
  | 'DirectoryVendor'
  | 'DirectoryDriver'
  | 'DirectoryStaff'
  // The personal-mobile column inside the staff list. Kept apart from
  // 'DirectoryStaff' so tightening or widening one never moves the other.
  | 'DirectoryStaffPersonalPhone';
