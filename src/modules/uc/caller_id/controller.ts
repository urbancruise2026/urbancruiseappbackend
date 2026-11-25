/** uc.caller_id — controller (HTTP only). */
import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { getIdentity, ok } from '../../../shared/http/responses.js';
import { getContacts, getSnapshot } from './service.js';

/**
 * Sends a caller-ID list with its version as the ETag. When the phone's
 * If-None-Match equals it, answers 304 with no body, so a phone that is
 * already up to date downloads nothing.
 */
function sendList(req: Request, res: Response, list: { version: string }): void {
  const etag = `"${list.version}"`;

  // Names and numbers: no shared or browser cache may keep this. The app
  // keeps its own copy and revalidates with If-None-Match.
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('ETag', etag);

  const ifNoneMatch = req.header('if-none-match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    res.status(304).end();
    return;
  }

  ok(res, list);
}

/**
 * GET /api/v1/uc/caller-id/snapshot — customers only (older app builds).
 *   → 200 { data: { version, generatedAt, entries, ambiguousCount } }
 *   → 304 (no body) when If-None-Match equals the current version
 *   → 403 CALLER_ID_REVOKED when the caller is no longer Active
 */
export const getCallerIdSnapshot = asyncHandler(async (req: Request, res: Response) => {
  const identity = getIdentity(req);
  sendList(req, res, await getSnapshot(identity.entityId));
});

/**
 * GET /api/v1/uc/caller-id/contacts — customers, vendors, drivers and
 * UC staff (app builds with the four card types).
 *   → 200 { data: { version, generatedAt, entries, ambiguousCount } }
 *   → 304 (no body) when If-None-Match equals the current version
 *   → 403 CALLER_ID_REVOKED when the caller is no longer Active
 */
export const getCallerIdContacts = asyncHandler(async (req: Request, res: Response) => {
  const identity = getIdentity(req);
  sendList(req, res, await getContacts(identity.entityId));
});
