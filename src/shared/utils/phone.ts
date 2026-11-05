/**
 * Mobile number helpers. Internal format: country code + number, no '+'
 * (e.g. '919812345678').
 */
import { OTP_PREFIX_LENGTH } from '../../config/constants.js';

/** ('9812345678', '+91') → '919812345678' */
export function normalizeMobile(phone: string, countryCode: string): string {
  return `${countryCode.replace('+', '')}${phone}`;
}

/**
 * For logs: '919812345678' → '9198****78'. Under 8 chars → '****'.
 * Never log an unmasked mobile.
 */
export function maskMobile(mobile: string): string {
  return mobile.length < 8 ? '****' : `${mobile.slice(0, 4)}****${mobile.slice(-2)}`;
}

/**
 * First OTP_PREFIX_LENGTH chars (country code + operator prefix), so SMS
 * pumping across one number range shares one limit.
 */
export function bucketPrefix(mobile: string): string {
  return mobile.slice(0, OTP_PREFIX_LENGTH);
}

/**
 * The formats an Indian mobile is stored in by the shared CRM database,
 * production format first, then legacy ones: '+91 9812345678',
 * '919812345678', '+919812345678', '9812345678'. Look up with an exact
 * IN (...) so the phone index stays usable. Uses the last 10 digits.
 */
export function phoneLookupFormats(mobile: string): string[] {
  const last10 = mobile.replace(/\D/g, '').slice(-10);
  return [`+91 ${last10}`, `91${last10}`, `+91${last10}`, last10];
}
