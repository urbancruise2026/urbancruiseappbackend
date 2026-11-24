/**
 * uc.caller_id — service: builds the caller-ID snapshot.
 *
 * WHO MAY DOWNLOAD IT
 *   Every Active UC staff member, whatever their department (product
 *   decision, 23 Nov 2026: a customer may call any UC staff number). This
 *   is wider than the UC Directory customers list, which 'general' staff
 *   cannot open (requireFullDirectory.ts). Access is checked twice:
 *     1. the route — authorize('read', 'CallerIdDirectory'): role 'uc' only;
 *     2. here — isActiveStaff(), read from Saarthi on every request, so a
 *        person HR marks inactive is refused at once, not when their access
 *        token expires.
 *
 * MATCHING RULES (from the caller-ID specification)
 *   - Numbers are stored as E.164 (phone.ts). A number that cannot be read
 *     with certainty is left out.
 *   - One customer may have two numbers: both identify them.
 *   - One number on two or more DIFFERENT customers is ambiguous: it is left
 *     out completely and counted in ambiguousCount. Never guess.
 *   - A customer with neither a name nor a company name is left out: there
 *     is nothing to show.
 *
 * CACHING
 *   The snapshot is the same for every caller, so each server process keeps
 *   it for SNAPSHOT_TTL_MS. Many phones syncing at once cost one query.
 */
import { createHash } from 'node:crypto';
import { ForbiddenError } from '../../../shared/errors/index.js';
import { text } from '../directory.js';
import { toE164 } from './phone.js';
import * as repo from './repository.js';
import type { CallerIdCustomerType, CallerIdEntry, CallerIdSnapshot } from './types.js';

/** How long one process reuses a built snapshot. */
const SNAPSHOT_TTL_MS = 60_000;

/**
 * customers.customerType (lower-cased, trimmed) → type. Same values as the
 * UC Directory (uc/customers/repository.ts CATEGORY_DB_VALUE); kept here
 * because sibling sub-modules may not import each other.
 */
const TYPE_BY_DB: ReadonlyMap<string, CallerIdCustomerType> = new Map([
  ['personal', 'personal'],
  ['corporate', 'corporate'],
  ['travel agent', 'agent'],
]);

let cached: { snapshot: CallerIdSnapshot; builtAt: number } | null = null;

/**
 * customers.customerCity, or null when it says nothing. About 90% of live
 * rows hold the literal 'Unknown' (23 Nov 2026); the card hides the city
 * line instead of printing that word (product decision, 23 Nov 2026).
 */
function toCity(v: string | null): string | null {
  const t = text(v);
  return t && t.toLowerCase() !== 'unknown' ? t : null;
}

function toType(v: string | null): CallerIdCustomerType | null {
  const t = text(v);
  return t ? (TYPE_BY_DB.get(t.toLowerCase()) ?? null) : null;
}

async function buildSnapshot(): Promise<CallerIdSnapshot> {
  const rows = await repo.listCustomersWithPhones();

  /** phone → entry, or null once a second customer claims the same phone. */
  const byPhone = new Map<string, CallerIdEntry | null>();

  for (const r of rows) {
    const name = text(r.name) ?? text(r.companyName);
    if (!name) continue;

    const customerId = String(r.id);
    const base = { customerId, name, type: toType(r.customerType), city: toCity(r.customerCity) };

    const phones = new Set(
      [toE164(r.customerPhone), toE164(r.alternatePhone)].filter((p): p is string => p !== null),
    );

    for (const phone of phones) {
      if (!byPhone.has(phone)) {
        byPhone.set(phone, { phone, ...base });
        continue;
      }
      const existing = byPhone.get(phone);
      // Same phone, different customer → ambiguous for good.
      if (existing && existing.customerId !== customerId) byPhone.set(phone, null);
    }
  }

  const entries: CallerIdEntry[] = [];
  let ambiguousCount = 0;
  for (const e of byPhone.values()) {
    if (e) entries.push(e);
    else ambiguousCount += 1;
  }
  entries.sort((a, b) => (a.phone < b.phone ? -1 : a.phone > b.phone ? 1 : 0));

  const version = createHash('sha1').update(JSON.stringify(entries)).digest('hex');

  return {
    version,
    generatedAt: new Date().toISOString(),
    entries,
    ambiguousCount,
  };
}

/**
 * The snapshot for `staffId` — the caller's own id from the access token.
 * Throws 403 CALLER_ID_REVOKED when the person is no longer Active; the app
 * then deletes its local copy.
 */
export async function getSnapshot(staffId: string): Promise<CallerIdSnapshot> {
  if (!(await repo.isActiveStaff(staffId))) {
    throw new ForbiddenError('Caller ID is not available for this account.', 'CALLER_ID_REVOKED');
  }

  const now = Date.now();
  if (cached && now - cached.builtAt < SNAPSHOT_TTL_MS) return cached.snapshot;

  const snapshot = await buildSnapshot();
  cached = { snapshot, builtAt: now };
  return snapshot;
}
