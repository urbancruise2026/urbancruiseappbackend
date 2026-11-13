/**
 * uc.staff — service: decides which view the caller may read, then turns the
 * rows into the Directory page.
 *
 * Access is checked twice, on purpose:
 *   1. the route — authorize('read', 'DirectoryStaff'): UC staff only;
 *   2. here — canSeePersonalNumbers(), which picks the view. A caller who is
 *      not in HR queries a view that has no personal-number column.
 *
 * Every UC staff member sees every other staff member, active or inactive.
 * Nobody is hidden for having no office number (product decision,
 * 13 Nov 2026); their card simply shows one line fewer.
 */
import { encodeCursor, epochToIso, text, type DirectoryPage } from '../directory.js';
import { loadViewerAccess } from '../viewer.js';
import { canSeePersonalNumbers } from '../workspace.js';
import * as repo from './repository.js';
import type { StaffDirectoryItem, StaffListQuery } from './types.js';

/** Shared mapping for both shapes. */
function toItem(r: repo.StaffRow): StaffDirectoryItem {
  return {
    id: String(r.id),
    name: text(r.name) ?? '',
    department: text(r.department),
    subDepartment: text(r.subDepartment),
    reportingManagerId: r.managerId === null ? null : String(r.managerId),
    reportingManagerName: text(r.managerName),
    phone: text(r.officeMobileNumber),
    email: text(r.email),
    city: text(r.branch),
    active: (r.employeeStatus ?? '').trim().toLowerCase() === 'active',
    // null when the staff member has no joining date in Saarthi. Never
    // replaced with createdAt — an invented joining date is worse than none.
    joinedAt: epochToIso(r.joined_epoch),
  };
}

/**
 * Lists staff for `viewerStaffId` — the caller's own id, taken from the
 * access token by the controller, never from the request.
 */
export async function listStaff(
  viewerStaffId: string,
  q: StaffListQuery,
): Promise<DirectoryPage<StaffDirectoryItem>> {
  const access = await loadViewerAccess(viewerStaffId);
  const hr = canSeePersonalNumbers(access);

  const { rows, total } = hr ? await repo.listStaffForHr(q) : await repo.listStaff(q);

  const hasNext = rows.length > q.limit;
  const page = hasNext ? rows.slice(0, q.limit) : rows;

  const items: StaffDirectoryItem[] = page.map(r => {
    const item = toItem(r);
    // phoneAlt is added only on the HR path. For everyone else the key is
    // absent from the JSON, not null — so the app's optional field simply
    // never appears, and no caller can tell a withheld number from a
    // missing one.
    if (hr) {
      const personal = text((r as repo.StaffRowHr).personalMobile);
      if (personal) item.phoneAlt = personal;
    }
    return item;
  });

  const last = page[page.length - 1];
  const nextCursor =
    hasNext && last
      ? encodeCursor(
          q.sortBy,
          q.sortBy === 'nameAsc' ? String(last.sort_key ?? '') : Number(last.sort_key),
          Number(last.id),
        )
      : null;

  return { items, nextCursor, total };
}
