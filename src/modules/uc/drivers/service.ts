/**
 * uc.drivers — service: turns repository rows into the Directory page.
 * Access is checked at the route (UC staff only).
 */
import { encodeCursor, epochToIso, text, type DirectoryPage } from '../directory.js';
import * as repo from './repository.js';
import type { DriverDirectoryItem, DriverListQuery, DriverVerification } from './types.js';

const VERIFICATIONS: ReadonlySet<string> = new Set<DriverVerification>([
  'verified',
  'pending',
  'rejected',
]);

/** ENUM column; anything unexpected is treated as not verified yet. */
function toVerification(v: string | null): DriverVerification {
  const t = text(v)?.toLowerCase();
  return t && VERIFICATIONS.has(t) ? (t as DriverVerification) : 'pending';
}

function toItem(r: repo.DriverRow): DriverDirectoryItem {
  return {
    id: String(r.id),
    name: text(r.name) ?? '',
    phone: text(r.phone),
    email: text(r.email),
    city: text(r.current_city),
    vendorId: r.vendor_id === null || r.vendor_id === undefined ? null : String(r.vendor_id),
    vendorName: text(r.vendor_name),
    licenseNo: text(r.license_number),
    verification: toVerification(r.status),
    createdAt: epochToIso(r.created_epoch),
  };
}

export async function listDrivers(q: DriverListQuery): Promise<DirectoryPage<DriverDirectoryItem>> {
  const { rows, total } = await repo.listDrivers(q);
  const hasNext = rows.length > q.limit;
  const page = hasNext ? rows.slice(0, q.limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasNext && last
      ? encodeCursor(
          q.sortBy,
          q.sortBy === 'nameAsc' ? String(last.sort_key ?? '') : Number(last.sort_key),
          Number(last.id),
        )
      : null;
  return { items: page.map(toItem), nextCursor, total };
}
