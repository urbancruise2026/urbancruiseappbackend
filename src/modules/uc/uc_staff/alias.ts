/**
 * uc.staff — how an alias (saarthi.uc_staff.alias_name) is shown.
 *
 * Pure: no database, no env. Kept apart from service.ts so it can be unit
 * tested without a MySQL connection.
 */
import { text } from '../directory.js';

/**
 * Alias for display: trimmed, first letter upper-cased, the rest exactly as
 * typed in Saarthi ('swara' → 'Swara', 'MAYANK' stays 'MAYANK',
 * 'R-H-Mumbai' unchanged). null when blank. Works on the first character,
 * not the first UTF-16 unit, so a non-Latin first letter is never split.
 */
export function displayAlias(v: unknown): string | null {
  const t = text(v);
  if (t === null) return null;
  const [first = '', ...rest] = Array.from(t);
  return first.toLocaleUpperCase('en-IN') + rest.join('');
}
