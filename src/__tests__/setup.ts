/**
 * Runs before every test file (vitest setupFiles).
 *
 * Gives src/config/env.ts a complete, fake configuration so modules that
 * import ENV can load. Tests must never touch real MySQL, Redis, MSG91 or
 * Firebase: tests that need them mock the client module with vi.mock().
 *
 * Every value here is a dummy. Never put a real secret in this file.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Stop dotenv (imported by env.ts) from loading a developer's real .env.
process.env['DOTENV_CONFIG_PATH'] = join(tmpdir(), 'urbancruise-test-no-such-env-file');
process.env['DOTENV_CONFIG_QUIET'] = 'true';

// env.ts checks that this file exists and looks like a service-account key.
// Firebase itself is never initialised in tests.
const dir = mkdtempSync(join(tmpdir(), 'urbancruise-test-'));
const firebasePath = join(dir, 'firebase-service-account.json');
writeFileSync(
  firebasePath,
  JSON.stringify({
    project_id: 'test-project',
    client_email: 'test@test-project.iam.gserviceaccount.com',
    private_key: 'not-a-real-key',
  }),
);

const TEST_ENV: Readonly<Record<string, string>> = {
  NODE_ENV: 'production', // avoids the pino-pretty worker thread used in development
  LOG_LEVEL: 'fatal', // keep test output clean
  PORT: '3001',

  DB_HOST: '127.0.0.1',
  DB_USER: 'test',
  DB_PASSWORD: 'test',
  DB_NAME: 'test',

  REDIS_HOST: '127.0.0.1',
  REDIS_PASSWORD: 'test',

  MSG91_AUTH_KEY: 'test',
  MSG91_SMS_SENDER_ID: 'TESTID',
  MSG91_SMS_TEMPLATE_ID: 'test',
  MSG91_WEBHOOK_SECRET: 'test-webhook-secret-0123456789abcdef',
  MSG91_TEST_MOBILES: '',
  MSG91_TEST_OTP: '482913',

  FIREBASE_SERVICE_ACCOUNT_PATH: firebasePath,

  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef-0123456789',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef-012345678',
  UC_MPIN_PEPPER: 'test-mpin-pepper-0123456789abcdef-0123456789ab',
  HCAPTCHA_SECRET: 'test',

  ENABLED_ROLES: 'customer',
};

// Always override: a value from the shell must not point tests at real systems.
for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] = value;
}
