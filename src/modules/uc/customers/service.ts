/**
 * uc.customers — service: turns repository rows into the Directory page.
 * Access is checked at the route (authorize 'read' 'DirectoryCustomer':
 * UC staff only); every UC staff member sees every customer.
 */
import { encodeCursor, epochToIso, text, type DirectoryPage } from '../directory.js';
import * as repo from './repository.js';
import type {
  CustomerCategory,
  CustomerDirectoryItem,
  CustomerListQuery,
  CustomerSubType,
} from './types.js';

/** customers.customerType (lower-cased, trimmed) → category. */
const CATEGORY_BY_DB: ReadonlyMap<string, CustomerCategory> = new Map(
  (Object.entries(repo.CATEGORY_DB_VALUE) as [CustomerCategory, string][]).map(([k, v]) => [
    v.toLowerCase(),
    k,
  ]),
);

/**
 * customers.customerCategoryType (lower-cased, trimmed) → sub-type. Uses the
 * app's own labels. Values seen in live data on 05 Nov 2026: Personal,
 * Company, Travel Agent, Tour Operator, Educational Institute, Government
 * (+ 'Small Business', which the app has no sub-type for → null).
 */
const SUBTYPE_BY_DB: ReadonlyMap<string, CustomerSubType> = new Map([
  ['personal', 'personal'],
  ['company', 'company'],
  ['ngo', 'ngo'],
  ['educational institute', 'educational_institute'],
  ['sporting company', 'sporting_company'],
  ['government', 'government'],
  ['travel agent', 'travel_agent'],
  ['tour operator', 'tour_operator'],
  ['hotel', 'hotel'],
  ['wedding planner', 'wedding_planner'],
  ['dmc', 'dmc'],
]);

/** Sub-types valid for each category (same split as the app). */
const SUBTYPES_OF: Readonly<Record<CustomerCategory, ReadonlySet<CustomerSubType>>> = {
  personal: new Set(['personal']),
  corporate: new Set(['company', 'ngo', 'educational_institute', 'sporting_company', 'government']),
  agent: new Set(['travel_agent', 'tour_operator', 'hotel', 'wedding_planner', 'dmc']),
};

function toCategory(v: string | null): CustomerCategory | null {
  const t = text(v);
  return t ? (CATEGORY_BY_DB.get(t.toLowerCase()) ?? null) : null;
}

function toSubType(v: string | null, category: CustomerCategory | null): CustomerSubType | null {
  const t = text(v);
  if (!t || !category) return null;
  const sub = SUBTYPE_BY_DB.get(t.toLowerCase());
  return sub && SUBTYPES_OF[category].has(sub) ? sub : null;
}

function toItem(r: repo.CustomerRow): CustomerDirectoryItem {
  const category = toCategory(r.customerType);
  return {
    id: String(r.id),
    category,
    customerType: toSubType(r.customerCategoryType, category),
    name: text(r.name) ?? '',
    phoneIndia: text(r.customerPhone),
    phoneGlobal: text(r.alternatePhone),
    email: text(r.customerEmail),
    city: text(r.customerCity),
    companyName: text(r.companyName),
    createdAt: epochToIso(r.created_epoch),
  };
}

export async function listCustomers(
  q: CustomerListQuery,
): Promise<DirectoryPage<CustomerDirectoryItem>> {
  const { rows, total } = await repo.listCustomers(q);
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
