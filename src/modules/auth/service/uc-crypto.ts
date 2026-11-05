/**
 * UC device security — pure crypto helpers (no DB, no Redis).
 *
 *   - MPIN rules (4 digits, weak MPINs refused) and hashing.
 *   - Verifying signatures made by the phone's hardware keys.
 *   - The exact text the phone signs for a challenge.
 *
 * PHONE KEYS (app: @sbaiahmed1/react-native-biometrics, keyType 'ec256')
 *   Public key : X.509 SubjectPublicKeyInfo, DER, base64 (Android
 *                PublicKey.encoded; iOS adds the same SPKI header).
 *   Signature  : ECDSA P-256 over SHA-256 of the UTF-8 message, DER
 *                (Android "SHA256withECDSA", iOS
 *                ecdsaSignatureMessageX962SHA256), base64.
 *   Node verifies this natively: crypto.verify('sha256', …, dsaEncoding 'der').
 *
 * MPIN HASH
 *   scrypt( HMAC-SHA256(pepper, "uc-mpin:v1:<staff>:<device>:<mpin>"), salt )
 *   - pepper (UC_MPIN_PEPPER) lives only in the server env, so a leaked
 *     database alone can't be brute-forced (4 digits = 10,000 guesses).
 *   - staff + device in the input: a hash copied to another row won't match.
 *   - Stored as "scrypt$1$N$r$p$<salt b64>$<hash b64>" so parameters can be
 *     raised later without breaking existing hashes.
 */
import {
  createPublicKey,
  randomBytes,
  scrypt,
  timingSafeEqual,
  verify as verifySignatureRaw,
  type KeyObject,
  type ScryptOptions,
} from 'node:crypto';
import { hmacSha256 } from '../../../shared/utils/crypto.js';
import type { UcChallengePurpose } from '../types.js';

/* ---------------- MPIN rules ---------------- */

export const UC_MPIN_LENGTH = 4;

/** Why an MPIN is refused; null when it's acceptable. */
export type MpinWeakness = 'format' | 'repeated' | 'sequence' | 'pattern' | 'common';

/** Commonly chosen 4-digit PINs not caught by the rules below. */
const COMMON_MPINS: ReadonlySet<string> = new Set([
  '2580', // straight down the middle of a keypad
  '0852', // straight up the middle of a keypad
  '1004',
  '6969',
]);

/**
 * Returns why `mpin` is too weak, or null if it is fine.
 *   format   — not exactly 4 digits
 *   repeated — all the same digit (1111)
 *   sequence — straight run up or down, with 0 after 9 as on a phone
 *              keypad (1234, 7890, 9012, 4321, 0987, 1098)
 *   pattern  — two repeated pairs (1212, 1122)
 *   common   — in COMMON_MPINS
 */
export function mpinWeakness(mpin: string): MpinWeakness | null {
  if (!/^\d{4}$/.test(mpin)) return 'format';
  const [a, b, c, d] = mpin;
  if (a === b && b === c && c === d) return 'repeated';
  // Digits treated as a cycle (…8, 9, 0, 1…), so 8901 and 9012 count too.
  if ('0123456789012'.includes(mpin) || '2109876543210'.includes(mpin)) return 'sequence';
  if ((a === c && b === d) || (a === b && c === d)) return 'pattern';
  if (COMMON_MPINS.has(mpin)) return 'common';
  return null;
}

/* ---------------- MPIN hashing ---------------- */

// N = 2^15 needs 128 * N * r = 32 MiB; maxmem leaves headroom. About 50–100 ms
// per hash on a server core: fine for a 4-digit PIN checked at most 5 times
// per phone, and slow for an attacker with the database AND the pepper.
const SCRYPT_PARAMS = { N: 1 << 15, r: 8, p: 1 } as const;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const HASH_PREFIX = 'scrypt';
const HASH_VERSION = '1';

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

function pepperedInput(pepper: string, staffId: string, deviceId: string, mpin: string): string {
  return hmacSha256(pepper, `uc-mpin:v1:${staffId}:${deviceId}:${mpin}`);
}

export async function hashMpin(
  pepper: string,
  staffId: string,
  deviceId: string,
  mpin: string,
): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const { N, r, p } = SCRYPT_PARAMS;
  const key = await scryptAsync(
    pepperedInput(pepper, staffId, deviceId, mpin),
    salt,
    SCRYPT_KEY_LENGTH,
    { N, r, p, maxmem: SCRYPT_MAXMEM },
  );
  return [HASH_PREFIX, HASH_VERSION, N, r, p, salt.toString('base64'), key.toString('base64')].join(
    '$',
  );
}

/** Constant-time check. A malformed stored hash returns false (never throws). */
export async function verifyMpin(
  pepper: string,
  staffId: string,
  deviceId: string,
  mpin: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 7 || parts[0] !== HASH_PREFIX || parts[1] !== HASH_VERSION) return false;
  const N = Number(parts[2]);
  const r = Number(parts[3]);
  const p = Number(parts[4]);
  if (![N, r, p].every(n => Number.isSafeInteger(n) && n > 0)) return false;
  const salt = Buffer.from(parts[5] ?? '', 'base64');
  const expected = Buffer.from(parts[6] ?? '', 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = await scryptAsync(
    pepperedInput(pepper, staffId, deviceId, mpin),
    salt,
    expected.length,
    { N, r, p, maxmem: SCRYPT_MAXMEM },
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* ---------------- Phone key signatures ---------------- */

/**
 * Parses a base64 X.509 SPKI public key and accepts ONLY EC P-256.
 * Returns null for anything else (RSA, other curves, garbage).
 */
export function parseP256PublicKey(publicKeyBase64: string): KeyObject | null {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    if (key.asymmetricKeyType !== 'ec') return null;
    if (key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return null;
    return key;
  } catch {
    return null;
  }
}

/** True only if `signatureBase64` is a valid P-256 signature of `message` by the key. */
export function verifyPhoneSignature(
  publicKeyBase64: string,
  message: string,
  signatureBase64: string,
): boolean {
  const key = parseP256PublicKey(publicKeyBase64);
  if (!key) return false;
  try {
    return verifySignatureRaw(
      'sha256',
      Buffer.from(message, 'utf8'),
      { key, dsaEncoding: 'der' },
      Buffer.from(signatureBase64, 'base64'),
    );
  } catch {
    return false;
  }
}

/* ---------------- Challenge ---------------- */

/** 32 random bytes, base64url. */
export function newChallengeNonce(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * The exact text the phone signs. Includes the purpose, so a signature
 * made to unlock can't be replayed to, say, turn fingerprint off.
 * The app must build the identical string (UTF-8).
 */
export function ucChallengeMessage(
  purpose: UcChallengePurpose,
  challengeId: string,
  nonce: string,
): string {
  return `urbancruise:uc-security:v1|${purpose}|${challengeId}|${nonce}`;
}
