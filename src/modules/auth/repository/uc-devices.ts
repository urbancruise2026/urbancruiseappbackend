/**
 * auth repository: uc_staff_devices + uc_staff_device_events
 * (sql/2026-11-uc-device-security.sql).
 *
 * One row per (UC staff member, phone). Every time comparison uses the
 * DATABASE clock (NOW(3)), like isWithinRotationGrace, so app-server clock
 * drift can't change the 24-hour unlock or the 10-minute setup window.
 */
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../../../shared/db/pool.js';
import { withTransaction } from '../../../shared/db/transaction.js';
import type { UcDeviceEventName, UcDeviceRow } from '../types.js';

export async function findUcDevice(
  staffId: string,
  deviceId: string,
  unlockMaxAgeSeconds: number,
): Promise<UcDeviceRow | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT staff_id, device_id, device_public_key, biometric_public_key,
            mpin_hash, mpin_failed_attempts,
            (last_unlocked_at IS NOT NULL
              AND last_unlocked_at >= NOW(3) - INTERVAL ? SECOND) AS unlock_fresh
       FROM uc_staff_devices
      WHERE staff_id = ? AND device_id = ?
      LIMIT 1`,
    [unlockMaxAgeSeconds, staffId, deviceId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    staffId: String(r['staff_id']),
    deviceId: String(r['device_id']),
    devicePublicKey: String(r['device_public_key']),
    biometricPublicKey:
      r['biometric_public_key'] === null ? null : String(r['biometric_public_key']),
    mpinHash: String(r['mpin_hash']),
    mpinFailedAttempts: Number(r['mpin_failed_attempts']),
    unlockFresh: Number(r['unlock_fresh']) === 1,
  };
}

/**
 * Creates or REPLACES this phone's registration (new OTP login on the same
 * phone = fresh MPIN, fingerprint off, attempts reset). Counts as an unlock.
 */
export async function upsertUcDevice(input: {
  staffId: string;
  deviceId: string;
  devicePublicKey: string;
  mpinHash: string;
}): Promise<void> {
  await pool.execute(
    `INSERT INTO uc_staff_devices
       (staff_id, device_id, device_public_key, biometric_public_key,
        mpin_hash, mpin_failed_attempts, last_unlocked_at)
     VALUES (?, ?, ?, NULL, ?, 0, NOW(3))
     ON DUPLICATE KEY UPDATE
       device_public_key    = VALUES(device_public_key),
       biometric_public_key = NULL,
       mpin_hash            = VALUES(mpin_hash),
       mpin_failed_attempts = 0,
       last_unlocked_at     = NOW(3)`,
    [input.staffId, input.deviceId, input.devicePublicKey, input.mpinHash],
  );
}

/** Sets (or with null, clears) the fingerprint key. False if the row is gone. */
export async function setUcBiometricKey(
  staffId: string,
  deviceId: string,
  biometricPublicKey: string | null,
): Promise<boolean> {
  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE uc_staff_devices SET biometric_public_key = ?
      WHERE staff_id = ? AND device_id = ?`,
    [biometricPublicKey, staffId, deviceId],
  );
  return res.affectedRows > 0;
}

/**
 * Change MPIN: replaces the hash and resets wrong tries. Keeps the device
 * key, the fingerprint key and the unlock time. False if the row is gone.
 */
export async function updateUcMpinHash(
  staffId: string,
  deviceId: string,
  mpinHash: string,
): Promise<boolean> {
  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE uc_staff_devices SET mpin_hash = ?, mpin_failed_attempts = 0
      WHERE staff_id = ? AND device_id = ?`,
    [mpinHash, staffId, deviceId],
  );
  return res.affectedRows > 0;
}

/** Successful MPIN / fingerprint unlock: reset wrong tries, stamp the time. */
export async function markUcDeviceUnlocked(staffId: string, deviceId: string): Promise<void> {
  await pool.execute(
    `UPDATE uc_staff_devices
        SET mpin_failed_attempts = 0, last_unlocked_at = NOW(3)
      WHERE staff_id = ? AND device_id = ?`,
    [staffId, deviceId],
  );
}

/**
 * Adds one wrong MPIN and returns the new total, atomically (row lock), so
 * parallel wrong guesses can't slip past the limit. null if the row is gone.
 */
export async function recordUcMpinFailure(
  staffId: string,
  deviceId: string,
): Promise<number | null> {
  return withTransaction(async conn => {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT mpin_failed_attempts FROM uc_staff_devices
        WHERE staff_id = ? AND device_id = ?
        FOR UPDATE`,
      [staffId, deviceId],
    );
    const r = rows[0];
    if (!r) return null;
    const next = Math.min(Number(r['mpin_failed_attempts']) + 1, 255); // TINYINT UNSIGNED
    await conn.execute(
      `UPDATE uc_staff_devices SET mpin_failed_attempts = ?
        WHERE staff_id = ? AND device_id = ?`,
      [next, staffId, deviceId],
    );
    return next;
  });
}

/** Removes one phone's registration (MPIN + both keys). */
export async function deleteUcDevice(staffId: string, deviceId: string): Promise<void> {
  await pool.execute(`DELETE FROM uc_staff_devices WHERE staff_id = ? AND device_id = ?`, [
    staffId,
    deviceId,
  ]);
}

/** Removes every phone of a staff member (logout from all devices). */
export async function deleteAllUcDevices(staffId: string): Promise<void> {
  await pool.execute(`DELETE FROM uc_staff_devices WHERE staff_id = ?`, [staffId]);
}

/** True if the login that started `familyId` happened within `seconds` (DB clock). */
export async function isLoginWithin(familyId: string, seconds: number): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 FROM auth_sessions
      WHERE jti = ? AND previous_jti IS NULL
        AND issued_at >= NOW() - INTERVAL ? SECOND
      LIMIT 1`,
    [familyId, seconds],
  );
  return rows.length > 0;
}

export async function insertUcDeviceEvent(e: {
  staffId: string;
  deviceId: string | null;
  event: UcDeviceEventName;
  ip: string | null;
}): Promise<void> {
  await pool.execute(
    `INSERT INTO uc_staff_device_events (staff_id, device_id, event, ip)
     VALUES (?, ?, ?, INET6_ATON(?))`,
    [e.staffId, e.deviceId, e.event, e.ip],
  );
}
