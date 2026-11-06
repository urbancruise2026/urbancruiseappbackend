/**
 * Mobile number helpers used by login and logging.
 */
import { describe, expect, it } from 'vitest';
import { maskMobile, normalizeMobile, phoneLookupFormats } from '../phone.js';

describe('normalizeMobile', () => {
  it('joins country code and number without "+"', () => {
    expect(normalizeMobile('9812345678', '+91')).toBe('919812345678');
    expect(normalizeMobile('9812345678', '91')).toBe('919812345678');
  });
});

describe('maskMobile', () => {
  it('hides the middle digits', () => {
    expect(maskMobile('919812345678')).toBe('9198****78');
  });

  it('never returns a full number, even a short one', () => {
    expect(maskMobile('1234567')).toBe('****');
  });
});

describe('phoneLookupFormats', () => {
  it('returns every stored format of the last 10 digits', () => {
    expect(phoneLookupFormats('+91 98123-45678')).toEqual([
      '+91 9812345678',
      '919812345678',
      '+919812345678',
      '9812345678',
    ]);
  });
});
