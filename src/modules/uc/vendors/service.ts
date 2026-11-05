/**
 * uc.vendors — service: turns repository rows into the Directory page.
 * Access is checked at the route (UC staff only).
 */
import { encodeCursor, epochToIso, text, type DirectoryPage } from '../directory.js';
import * as repo from './repository.js';
import type {
  VendorDirectoryItem,
  VendorListQuery,
  VendorStatus,
  VendorVerification,
} from './types.js';

const STATUSES: ReadonlySet<string> = new Set<VendorStatus>([
  'active',
  'pending',
  'suspended',
  'inactive',
]);
const VERIFICATIONS: ReadonlySet<string> = new Set<VendorVerification>([
  'verified',
  'pending',
  'rejected',
]);

/** Empty → 'active' (product decision); unknown text → null (no badge). */
function toStatus(v: string | null): VendorStatus | null {
  const t = text(v)?.toLowerCase();
  if (!t) return 'active';
  return STATUSES.has(t) ? (t as VendorStatus) : null;
}

/** ENUM column; anything unexpected is treated as not verified yet. */
function toVerification(v: string | null): VendorVerification {
  const t = text(v)?.toLowerCase();
  return t && VERIFICATIONS.has(t) ? (t as VendorVerification) : 'pending';
}

function toItem(r: repo.VendorRow): VendorDirectoryItem {
  return {
    id: String(r.id),
    ownerName: text(r.name) ?? '',
    companyName: text(r.company_name),
    phone: text(r.phone),
    phoneAlt: text(r.owner_phone),
    email: text(r.email),
    city: text(r.company_city),
    address: text(r.address),
    gstin: text(r.gst_number),
    pan: text(r.company_pan_number),
    businessType: text(r.company_type),
    status: toStatus(r.status),
    verification: toVerification(r.verification),
    createdAt: epochToIso(r.created_epoch),
  };
}

export async function listVendors(q: VendorListQuery): Promise<DirectoryPage<VendorDirectoryItem>> {
  const { rows, total } = await repo.listVendors(q);
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
