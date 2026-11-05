/** auth service entry points. Every function takes AuthServiceDeps first. */
export { sendOtp, type SendOtpParams } from './otp-send.js';
export { verifyOtp, type VerifyOtpParams } from './otp-verify.js';
export { completeCustomerOnboarding, type CompleteOnboardingParams } from './onboarding.js';
export { refreshSession, logout, getMe, type LogoutParams, type GetMeParams } from './session.js';
export { type AuditEventInput } from './audit.js';
export { issueUcChallenge } from './uc-challenge.js';
export {
  getUcSecurityStatus,
  registerUcDevice,
  enableUcBiometric,
  disableUcBiometric,
  unlockUcWithMpin,
  unlockUcWithBiometric,
  changeUcMpin,
} from './uc-security.js';
export type { UcRefreshGate } from './uc-refresh-gate.js';
