/**
 * uc.caller_id — service: builds the caller-ID lists.
 *
 * TWO LISTS
 *   getSnapshot()  — customers only, for app builds that only know the
 *                    customer card (GET /snapshot). Unchanged since 23 Nov.
 *   getContacts()  — customers, vendors, drivers and active UC staff, for
 *                    app builds with the four card types (GET /contacts).
 *
 * WHO MAY DOWNLOAD THEM
 *   Every Active UC staff member, whatever their department (product
 *   decisions, 23 + 24 Nov 2026: anyone may call any UC staff number).
 *   This is wider than the UC Directory customers list, which 'general'
 *   staff cannot open (requireFullDirectory.ts). Access is checked twice:
 *     1. the route — authorize('read', 'CallerIdDirectory'): role 'uc' only;
 *     2. here — isActiveStaff(), read from Saarthi on every request, so a
 *        person HR marks inactive is refused at once, not when their access
 *        token expires.
 *
 * MATCHING RULES
 *   - Numbers are stored as E.164 (phone.ts). A number that cannot be read
 *     with certainty is left out.
 *   - One person may have two numbers: both identify them.
 *   - One number in two lists: the first kind in CALLER_ID_KINDS wins —
 *     customer → vendor → driver → staff (product decision, 24 Nov 2026).
 *   - One number on two or more DIFFERENT people of the kind that holds it
 *     is ambiguous: it is left out completely (never handed to a lower
 *     kind either) and counted in ambiguousCount. Never guess.
 *   - Someone with no name to show is left out.
 *
 * WHAT EACH KIND SHOWS (product decisions, 24 Nov 2026)
 *   customer  name (company name if none); type + city chips
 *   vendor    owner name; company name; city; 'Inactive' when suspended
 *             or inactive
 *   driver    driver name; 'Driver · <vendor>'; city
 *   staff     alias (first letter capitalised), else full name;
 *             department + branch; ACTIVE staff and WORK numbers only
 *
 * CACHING
 *   Each list is the same for every caller, so each server process keeps
 *   it for LIST_TTL_MS. Many phones syncing at once cost one build.
 */
import { createHash } from 'node:crypto';
import { ForbiddenError } from '../../../shared/errors/index.js';
import { text } from '../directory.js';
import { toE164 } from './phone.js';
import * as repo from './repository.js';
import {
  CALLER_ID_KINDS,
  type CallerIdContact,
  type CallerIdContactsSnapshot,
  type CallerIdCustomerType,
  type CallerIdEntry,
  type CallerIdKind,
  type CallerIdSnapshot,
} from './types.js';

/** How long one process reuses a built list. */
const LIST_TTL_MS = 60_000;

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

/** Vendor statuses that get the 'Inactive' tag (uc/vendors VendorStatus). */
const INACTIVE_VENDOR_STATUSES: ReadonlySet<string> = new Set(['suspended', 'inactive']);

const INACTIVE_BADGE = 'Inactive';

/* ------------------------------------------------------------------ */
/* Small field rules                                                  */
/* ------------------------------------------------------------------ */

/**
 * A city, or null when it says nothing. About 90% of live customer rows
 * hold the literal 'Unknown' (23 Nov 2026); the card hides the city
 * instead of printing that word (product decision, 23 Nov 2026).
 */
function toCity(v: string | null): string | null {
  const t = text(v);
  return t && t.toLowerCase() !== 'unknown' ? t : null;
}

function toType(v: string | null): CallerIdCustomerType | null {
  const t = text(v);
  return t ? (TYPE_BY_DB.get(t.toLowerCase()) ?? null) : null;
}

/**
 * Saarthi alias with the first letter capitalised, rest as typed. Same
 * rule as uc/uc_staff/alias.ts displayAlias(); kept here because sibling
 * sub-modules may not import each other.
 */
function displayAlias(v: string | null): string | null {
  const t = text(v);
  if (t === null) return null;
  const [first = '', ...rest] = Array.from(t);
  return first.toLocaleUpperCase('en-IN') + rest.join('');
}

/** Distinct E.164 numbers from raw columns; unreadable ones dropped. */
function phonesOf(...raw: (string | null)[]): string[] {
  return [...new Set(raw.map(r => toE164(r)).filter((p): p is string => p !== null))];
}

/* ------------------------------------------------------------------ */
/* Rows → contacts                                                    */
/* ------------------------------------------------------------------ */

type Person = Omit<CallerIdContact, 'phone'>;
type PersonWithPhones = { person: Person; phones: string[] };

const EMPTY: Omit<Person, 'kind' | 'id' | 'name'> = {
  subtitle: null,
  type: null,
  city: null,
  department: null,
  branch: null,
  badge: null,
};

function customerPeople(rows: repo.CallerIdRow[]): PersonWithPhones[] {
  const out: PersonWithPhones[] = [];
  for (const r of rows) {
    const name = text(r.name) ?? text(r.companyName);
    if (!name) continue;
    out.push({
      person: {
        ...EMPTY,
        kind: 'customer',
        id: String(r.id),
        name,
        type: toType(r.customerType),
        city: toCity(r.customerCity),
      },
      phones: phonesOf(r.customerPhone, r.alternatePhone),
    });
  }
  return out;
}

function vendorPeople(rows: repo.CallerIdVendorRow[]): PersonWithPhones[] {
  const out: PersonWithPhones[] = [];
  for (const r of rows) {
    const company = text(r.companyName);
    const name = text(r.ownerName) ?? company;
    if (!name) continue;
    const status = text(r.status)?.toLowerCase() ?? '';
    out.push({
      person: {
        ...EMPTY,
        kind: 'vendor',
        id: String(r.id),
        name,
        // Don't repeat the company when it is already the name.
        subtitle: company && company !== name ? company : null,
        city: toCity(r.city),
        badge: INACTIVE_VENDOR_STATUSES.has(status) ? INACTIVE_BADGE : null,
      },
      phones: phonesOf(r.phone, r.ownerPhone),
    });
  }
  return out;
}

function driverPeople(rows: repo.CallerIdDriverRow[]): PersonWithPhones[] {
  const out: PersonWithPhones[] = [];
  for (const r of rows) {
    const name = text(r.name);
    if (!name) continue;
    const vendor = text(r.vendorName);
    out.push({
      person: {
        ...EMPTY,
        kind: 'driver',
        id: String(r.id),
        name,
        subtitle: vendor ? `Driver · ${vendor}` : 'Driver',
        city: toCity(r.city),
        // Drivers have no active / inactive status in the database
        // (only verification), so no tag yet.
      },
      phones: phonesOf(r.phone),
    });
  }
  return out;
}

function staffPeople(rows: repo.CallerIdStaffRow[]): PersonWithPhones[] {
  const out: PersonWithPhones[] = [];
  for (const r of rows) {
    const name = displayAlias(r.aliasName) ?? text(r.name);
    if (!name) continue;
    const dept = text(r.department);
    const sub = text(r.subDepartment);
    out.push({
      person: {
        ...EMPTY,
        kind: 'staff',
        id: String(r.id),
        name,
        department: dept && sub && sub !== dept ? `${dept} · ${sub}` : (dept ?? sub),
        branch: text(r.branch),
      },
      phones: phonesOf(r.officeMobileNumber),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Merging                                                            */
/* ------------------------------------------------------------------ */

/** What a number resolved to: one person, or ambiguous within `kind`. */
type Claim = { kind: CallerIdKind; person: Person | null };

/**
 * Merges the lists in CALLER_ID_KINDS order. A number claimed by an
 * earlier kind is never taken by a later one, even when it is ambiguous
 * there (a later kind must not "win" a number by default).
 */
function merge(byKind: Record<CallerIdKind, PersonWithPhones[]>): {
  entries: CallerIdContact[];
  ambiguousCount: number;
} {
  const claims = new Map<string, Claim>();

  for (const kind of CALLER_ID_KINDS) {
    for (const { person, phones } of byKind[kind]) {
      for (const phone of phones) {
        const claim = claims.get(phone);
        if (!claim) {
          claims.set(phone, { kind, person });
          continue;
        }
        if (claim.kind !== kind) continue; // a higher-priority kind holds it
        if (claim.person && claim.person.id !== person.id) {
          claims.set(phone, { kind, person: null }); // ambiguous for good
        }
      }
    }
  }

  const entries: CallerIdContact[] = [];
  let ambiguousCount = 0;
  for (const [phone, claim] of claims) {
    if (claim.person) entries.push({ phone, ...claim.person });
    else ambiguousCount += 1;
  }
  entries.sort((a, b) => (a.phone < b.phone ? -1 : a.phone > b.phone ? 1 : 0));
  return { entries, ambiguousCount };
}

function versionOf(entries: unknown[]): string {
  return createHash('sha1').update(JSON.stringify(entries)).digest('hex');
}

/* ------------------------------------------------------------------ */
/* Builders                                                           */
/* ------------------------------------------------------------------ */

async function buildSnapshot(): Promise<CallerIdSnapshot> {
  const people = customerPeople(await repo.listCustomersWithPhones());
  const { entries: contacts, ambiguousCount } = merge({
    customer: people,
    vendor: [],
    driver: [],
    staff: [],
  });

  // The original customer-only shape, exactly as before.
  const entries: CallerIdEntry[] = contacts.map(c => ({
    phone: c.phone,
    customerId: c.id,
    name: c.name,
    type: c.type,
    city: c.city,
  }));

  return {
    version: versionOf(entries),
    generatedAt: new Date().toISOString(),
    entries,
    ambiguousCount,
  };
}

async function buildContacts(): Promise<CallerIdContactsSnapshot> {
  const [customers, vendors, drivers, staff] = await Promise.all([
    repo.listCustomersWithPhones(),
    repo.listVendorsWithPhones(),
    repo.listDriversWithPhones(),
    repo.listActiveStaffWithPhones(),
  ]);

  const { entries, ambiguousCount } = merge({
    customer: customerPeople(customers),
    vendor: vendorPeople(vendors),
    driver: driverPeople(drivers),
    staff: staffPeople(staff),
  });

  return {
    version: versionOf(entries),
    generatedAt: new Date().toISOString(),
    entries,
    ambiguousCount,
  };
}

/* ------------------------------------------------------------------ */
/* Public                                                             */
/* ------------------------------------------------------------------ */

type Cached<T> = { value: T; builtAt: number } | null;
let snapshotCache: Cached<CallerIdSnapshot> = null;
let contactsCache: Cached<CallerIdContactsSnapshot> = null;

async function assertActive(staffId: string): Promise<void> {
  if (!(await repo.isActiveStaff(staffId))) {
    throw new ForbiddenError('Caller ID is not available for this account.', 'CALLER_ID_REVOKED');
  }
}

/**
 * Customers only, for app builds that only know the customer card.
 * Throws 403 CALLER_ID_REVOKED when the caller is no longer Active; the
 * app then deletes its local copy.
 */
export async function getSnapshot(staffId: string): Promise<CallerIdSnapshot> {
  await assertActive(staffId);
  const now = Date.now();
  if (snapshotCache && now - snapshotCache.builtAt < LIST_TTL_MS) return snapshotCache.value;
  const value = await buildSnapshot();
  snapshotCache = { value, builtAt: now };
  return value;
}

/**
 * Customers, vendors, drivers and active UC staff. Throws 403
 * CALLER_ID_REVOKED when the caller is no longer Active.
 */
export async function getContacts(staffId: string): Promise<CallerIdContactsSnapshot> {
  await assertActive(staffId);
  const now = Date.now();
  if (contactsCache && now - contactsCache.builtAt < LIST_TTL_MS) return contactsCache.value;
  const value = await buildContacts();
  contactsCache = { value, builtAt: now };
  return value;
}
