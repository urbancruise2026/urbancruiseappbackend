/**
 * auth request schemas. The app sends a 10-digit `phone` and `countryCode`
 * '+91' (India only); the service normalises to '919812345678'.
 */
import { z } from 'zod';

/** Roles that can log in. */
const RoleSchema = z.enum(['customer', 'vendor', 'driver', 'uc']);

/** India only for now. */
const IndianPhoneSchema = z.string().regex(/^[6-9]\d{9}$/, 'invalid Indian mobile number');
const CountryCodeSchema = z.literal('+91');

export const RequestOtpBody = z.object({
  phone: IndianPhoneSchema,
  countryCode: CountryCodeSchema,
  role: RoleSchema,
  /** hCaptcha token. Needed only after a `captcha_required` response. */
  captchaToken: z.string().min(1).max(4096).optional(),
});
export type RequestOtpBody = z.infer<typeof RequestOtpBody>;

const DeviceMetaSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(150),
  platform: z.enum(['ios', 'android']),
  appVersion: z.string().min(1).max(30),
});

export const VerifyOtpBody = z.object({
  phone: IndianPhoneSchema,
  countryCode: CountryCodeSchema,
  role: RoleSchema,
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
  requestId: z.string().min(1).max(128).optional(),
  device: DeviceMetaSchema,
});
export type VerifyOtpBody = z.infer<typeof VerifyOtpBody>;

/* ---------- UC device security ---------- */

const RefreshTokenSchema = z.string().min(20).max(4096);
const ChallengeIdSchema = z.uuid();
// Standard base64 (the phone library's encoding). P-256 SPKI ≈ 124 chars,
// DER ECDSA signature ≤ 96 chars; the caps only stop oversized input.
const base64 = (max: number) =>
  z
    .string()
    .min(4)
    .max(max)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64');
const PublicKeySchema = base64(512);
const SignatureSchema = base64(256);
const MpinSchema = z.string().regex(/^\d{4}$/, 'MPIN must be 4 digits');

export const UcChallengeBody = z.object({
  refreshToken: RefreshTokenSchema,
  purpose: z.enum([
    'register',
    'enable-biometric',
    'disable-biometric',
    'unlock-mpin',
    'unlock-biometric',
    'change-mpin',
    'refresh',
  ]),
});
export type UcChallengeBody = z.infer<typeof UcChallengeBody>;

export const UcStatusBody = z.object({ refreshToken: RefreshTokenSchema });
export type UcStatusBody = z.infer<typeof UcStatusBody>;

export const UcRegisterDeviceBody = z.object({
  refreshToken: RefreshTokenSchema,
  challengeId: ChallengeIdSchema,
  devicePublicKey: PublicKeySchema,
  deviceSignature: SignatureSchema,
  mpin: MpinSchema,
});
export type UcRegisterDeviceBody = z.infer<typeof UcRegisterDeviceBody>;

export const UcEnableBiometricBody = z.object({
  refreshToken: RefreshTokenSchema,
  challengeId: ChallengeIdSchema,
  biometricPublicKey: PublicKeySchema,
  deviceSignature: SignatureSchema,
  biometricSignature: SignatureSchema,
});
export type UcEnableBiometricBody = z.infer<typeof UcEnableBiometricBody>;

export const UcDisableBiometricBody = z.object({
  refreshToken: RefreshTokenSchema,
  challengeId: ChallengeIdSchema,
  deviceSignature: SignatureSchema,
});
export type UcDisableBiometricBody = z.infer<typeof UcDisableBiometricBody>;

export const UcUnlockMpinBody = z.object({
  refreshToken: RefreshTokenSchema,
  challengeId: ChallengeIdSchema,
  deviceSignature: SignatureSchema,
  mpin: MpinSchema,
  device: DeviceMetaSchema.optional(),
});
export type UcUnlockMpinBody = z.infer<typeof UcUnlockMpinBody>;

export const UcChangeMpinBody = z.object({
  refreshToken: RefreshTokenSchema,
  challengeId: ChallengeIdSchema,
  deviceSignature: SignatureSchema,
  currentMpin: MpinSchema,
  newMpin: MpinSchema,
});
export type UcChangeMpinBody = z.infer<typeof UcChangeMpinBody>;

export const UcUnlockBiometricBody = z.object({
  refreshToken: RefreshTokenSchema,
  challengeId: ChallengeIdSchema,
  biometricSignature: SignatureSchema,
  device: DeviceMetaSchema.optional(),
});
export type UcUnlockBiometricBody = z.infer<typeof UcUnlockBiometricBody>;

export const RefreshBody = z.object({
  refreshToken: RefreshTokenSchema,
  /**
   * Optional for older app builds; when absent the previous session's device
   * is kept. Must stay declared: Zod strips unknown keys, and logout relies
   * on the session's device id to remove the right push token.
   */
  device: DeviceMetaSchema.optional(),
  /**
   * UC staff only: a 'refresh' challenge signed by the phone's device key
   * (see service/uc-refresh-gate.ts). Ignored for other roles.
   */
  ucProof: z
    .object({ challengeId: ChallengeIdSchema, deviceSignature: SignatureSchema })
    .optional(),
});
export type RefreshBody = z.infer<typeof RefreshBody>;

export const LogoutBody = z.object({
  /** Optional. Logout identifies the session from the access token. */
  refreshToken: z.string().min(20).max(4096).optional(),
  /** 'current' (default) revokes this session; 'all' revokes every device. */
  scope: z.enum(['current', 'all']).default('current'),
});
export type LogoutBody = z.infer<typeof LogoutBody>;

/** Lengths match the customers columns (names 50, email 100). */
const NAME_RE = /^[\p{L}][\p{L}\p{M} .'-]*$/u;

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform(v => (v ? v : null));

/**
 * City as typed or as returned by the device (length matches
 * customers.customerCity, 100). Only whitespace is normalised: the spelling
 * is kept. 'Unknown' is rejected because the CRM uses it as a placeholder
 * for a missing city.
 */
const CITY_RE = /^[\p{L}][\p{L}\p{M} .'()-]*$/u;
const CitySchema = z
  .string()
  .transform(v => v.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(1, 'city is required')
      .max(100)
      .regex(CITY_RE, 'city contains invalid characters')
      .refine(v => v.toLowerCase() !== 'unknown', { message: 'enter your city' }),
  );

export const CustomerOnboardBody = z.object({
  onboardingToken: z.string().min(20).max(200),
  firstName: z
    .string()
    .trim()
    .min(1, 'first name is required')
    .max(50)
    .regex(NAME_RE, 'first name contains invalid characters'),
  lastName: optionalTrimmed(50).refine(v => v === null || NAME_RE.test(v), {
    message: 'last name contains invalid characters',
  }),
  email: optionalTrimmed(100).refine(v => v === null || z.email().safeParse(v).success, {
    message: 'invalid email address',
  }),
  customerType: z.enum(['personal', 'corporate', 'agent']),
  city: CitySchema,
  device: DeviceMetaSchema,
});
export type CustomerOnboardBody = z.infer<typeof CustomerOnboardBody>;
