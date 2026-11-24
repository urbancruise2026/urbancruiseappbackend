/** uc.caller_id — controller (HTTP only). */
import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { getIdentity, ok } from '../../../shared/http/responses.js';
import { getSnapshot } from './service.js';

/**
 * GET /api/v1/uc/caller-id/snapshot
 *   → 200 { data: { version, generatedAt, entries, ambiguousCount } }
 *   → 304 (no body) when If-None-Match equals the current version
 *   → 403 CALLER_ID_REVOKED when the caller is no longer Active
 *
 * The app stores `version` and sends it back as If-None-Match, so a phone
 * that is already up to date downloads nothing.
 */
export const getCallerIdSnapshot = asyncHandler(async (req: Request, res: Response) => {
  const identity = getIdentity(req);
  const snapshot = await getSnapshot(identity.entityId);
  const etag = `"${snapshot.version}"`;

  // Customer names and numbers: no shared or browser cache may keep this.
  // The app keeps its own copy and revalidates with If-None-Match.
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('ETag', etag);

  const ifNoneMatch = req.header('if-none-match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    res.status(304).end();
    return;
  }

  ok(res, snapshot);
});
