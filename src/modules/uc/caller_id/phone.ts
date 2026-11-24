/**
 * uc.caller_id — the ONE phone-number rule shared by the server and the
 * Android caller-ID service.
 *
 * Every number is turned into E.164 ('+919812345678') before it goes on
 * the phone, and Android turns the incoming caller's number into E.164 with
 * the SAME rules before it looks it up (CallerIdNumber.kt in the app). If
 * you change a rule here, change it there too, or calls stop matching.
 *
 * customers.customerPhone / alternatePhone are stored in mixed formats
 * ('+91 9812345678', '919812345678', '+919812345678', '9812345678',
 * '09812345678', foreign numbers with a '+'). Anything that does not fit a
 * rule below returns null and is left out of caller ID: a number we cannot
 * read with certainty must never identify anyone.
 *
 * Pure: no database, no env.
 */

/** India's country code, used for numbers written without one. */
const INDIA_CC = '91';

/** E.164 allows at most 15 digits; shorter than 8 is never a real phone. */
const MIN_INTL_DIGITS = 8;
const MAX_INTL_DIGITS = 15;

/**
 * A 10-digit Indian national number: mobiles start 6-9, landlines (with the
 * STD code, without the leading 0) start 2-5. Never 0 or 1.
 */
const INDIAN_NATIONAL = /^[2-9]\d{9}$/;

/**
 * '+91 98123 45678' → '+919812345678'. null when the number cannot be read
 * with certainty.
 *
 *   +<digits>         international as written (an Indian one is checked)
 *   00<digits>        international dialling prefix, same as '+'
 *   91 + 10 digits    Indian, country code without '+'
 *   0 + 10 digits     Indian, trunk prefix
 *   10 digits         Indian national number
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (hasPlus) return international(digits);
  if (digits.startsWith('00')) return international(digits.slice(2));

  if (digits.length === 12 && digits.startsWith(INDIA_CC)) {
    return indian(digits.slice(2));
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return indian(digits.slice(1));
  }
  if (digits.length === 10) return indian(digits);

  return null;
}

function indian(national: string): string | null {
  return INDIAN_NATIONAL.test(national) ? `+${INDIA_CC}${national}` : null;
}

function international(digits: string): string | null {
  if (digits.startsWith(INDIA_CC)) {
    // '+91…' must be a valid Indian number, not just any digits.
    return digits.length === 12 ? indian(digits.slice(2)) : null;
  }
  if (digits.startsWith('0')) return null;
  if (digits.length < MIN_INTL_DIGITS || digits.length > MAX_INTL_DIGITS) return null;
  return `+${digits}`;
}
