/**
 * UC Directory — helpers shared by the customers, vendors and drivers lists.
 *
 * PAGINATION: keyset ("cursor"), not LIMIT/OFFSET. The cursor is an opaque
 * base64url token holding the sort it was made for plus the last row's
 * sort key and id. A cursor from another sort (or a tampered one) is
 * rejected with 400 INVALID_CURSOR instead of returning wrong rows.
 *
 * DATES: compared and returned through UNIX_TIMESTAMP(), which is the same
 * whatever MySQL session time zone the server uses.
 *
 * PHONE SEARCH: a phone only matches the COMPLETE number (10-digit Indian
 * number, with or without 91 / +91), never part of it — the app masks
 * phones, so partial digits must not reveal them. Same rule as the app's
 * phoneMatchesQuery().
 */
import { ValidationError } from '../../shared/errors/index.js';
import { phoneLookupFormats } from '../../shared/utils/phone.js';

/** Default and maximum rows per page. */
export const DIRECTORY_DEFAULT_LIMIT = 20;
export const DIRECTORY_MAX_LIMIT = 50;

/** Longest accepted search text. */
export const DIRECTORY_MAX_SEARCH = 100;

export type DirectorySort = 'newest' | 'oldest' | 'nameAsc';

/** Response body of every directory list (inside the { data } envelope). */
export type DirectoryPage<T> = {
  items: T[];
  /** Opaque token for the next page; null when there are no more rows. */
  nextCursor: string | null;
  /** Rows matching the search and filters (all pages). */
  total: number;
};

/* ------------------------------------------------------------------ */
/* Cursor                                                             */
/* ------------------------------------------------------------------ */

/** Sort key of the last row: epoch seconds (date sorts) or text (name). */
type CursorKey = number | string;

type CursorPayload = { s: DirectorySort; k: CursorKey; i: number };

export function encodeCursor(sort: DirectorySort, key: CursorKey, id: number): string {
  const payload: CursorPayload = { s: sort, k: key, i: id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** Decodes a cursor made for `sort`. Throws 400 INVALID_CURSOR otherwise. */
export function decodeCursor(cursor: string, sort: DirectorySort): { key: CursorKey; id: number } {
  const invalid = (): never => {
    throw new ValidationError('Invalid cursor.', [{ path: ['cursor'] }], 'INVALID_CURSOR');
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return invalid();
  }
  if (!parsed || typeof parsed !== 'object') return invalid();
  const { s, k, i } = parsed as Partial<CursorPayload>;
  if (s !== sort) return invalid();
  if (typeof i !== 'number' || !Number.isSafeInteger(i) || i < 0) return invalid();
  const keyOk =
    sort === 'nameAsc'
      ? typeof k === 'string' && k.length <= 500
      : typeof k === 'number' && Number.isSafeInteger(k) && k >= 0;
  if (!keyOk) return invalid();
  return { key: k as CursorKey, id: i };
}

/**
 * ORDER BY plus the "after the cursor" condition for a sort.
 *   dateExpr — epoch-seconds expression, e.g. COALESCE(UNIX_TIMESTAMP(c.created_at), 0)
 *   nameExpr — display-name expression used for 'nameAsc'
 *   idExpr   — the primary key, e.g. c.id
 * Rows with no created_at sort as epoch 0 (oldest).
 */
export function keyset(
  sort: DirectorySort,
  exprs: { dateExpr: string; nameExpr: string; idExpr: string },
  cursor: { key: CursorKey; id: number } | null,
): { orderBy: string; where: string | null; params: unknown[]; keyExpr: string } {
  const { dateExpr, nameExpr, idExpr } = exprs;
  const keyExpr = sort === 'nameAsc' ? nameExpr : dateExpr;
  const desc = sort === 'newest';
  const dir = desc ? 'DESC' : 'ASC';
  const cmp = desc ? '<' : '>';
  const orderBy = `${keyExpr} ${dir}, ${idExpr} ${dir}`;
  if (!cursor) return { orderBy, where: null, params: [], keyExpr };
  return {
    orderBy,
    where: `(${keyExpr} ${cmp} ? OR (${keyExpr} = ? AND ${idExpr} ${cmp} ?))`,
    params: [cursor.key, cursor.key, cursor.id],
    keyExpr,
  };
}

/* ------------------------------------------------------------------ */
/* Search                                                             */
/* ------------------------------------------------------------------ */

/** Characters allowed in a query meant as a phone number. */
const PHONE_QUERY = /^[+\d\s().-]+$/;

/**
 * Stored formats to look up when the search is a complete phone number,
 * or null when it isn't one (then phones are not searched at all).
 * Accepts '9876543210', '919876543210', '+91 98765 43210'.
 */
export function phoneSearchFormats(search: string): string[] | null {
  const q = search.trim();
  if (!PHONE_QUERY.test(q)) return null;
  const digits = q.replace(/\D/g, '');
  const national =
    digits.length === 10
      ? digits
      : digits.length === 12 && digits.startsWith('91')
        ? digits.slice(2)
        : null;
  return national ? phoneLookupFormats(national) : null;
}

/** Escapes LIKE wildcards; the result is used as %term% with ESCAPE '\\'. */
export function likeContains(search: string): string {
  return `%${search.trim().replace(/[\\%_]/g, ch => `\\${ch}`)}%`;
}

/* ------------------------------------------------------------------ */
/* Dates                                                              */
/* ------------------------------------------------------------------ */

/** India Standard Time offset: the app's users and the CRM are in India. */
const IST_OFFSET_SECONDS = 5.5 * 60 * 60;

/** Epoch seconds of 00:00 IST on a 'YYYY-MM-DD' day. */
export function istDayStartEpoch(day: string): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 1000 - IST_OFFSET_SECONDS;
}

/** Epoch seconds → ISO string, or null for 0 / missing (no created_at). */
export function epochToIso(epoch: unknown): string | null {
  const n = typeof epoch === 'string' ? Number(epoch) : (epoch as number);
  return typeof n === 'number' && Number.isFinite(n) && n > 0
    ? new Date(n * 1000).toISOString()
    : null;
}

/* ------------------------------------------------------------------ */
/* Values                                                             */
/* ------------------------------------------------------------------ */

/** Trimmed text, or null when null / blank. */
export function text(v: unknown): string | null {
  if (typeof v !== 'string') return v === null || v === undefined ? null : String(v);
  const t = v.trim();
  return t === '' ? null : t;
}
