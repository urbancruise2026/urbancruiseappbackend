/** uc.staff — controller (HTTP only). */
import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { ok, getIdentity } from '../../../shared/http/responses.js';
import { listStaff } from './service.js';
import type { StaffListQuery } from './types.js';

/** GET /api/v1/uc/staff → { data: { items, nextCursor, total } } */
export const getStaff = asyncHandler(async (req: Request, res: Response) => {
  // The caller's own id comes from the access token, never from the request.
  const identity = getIdentity(req);
  const page = await listStaff(identity.entityId, req.query as unknown as StaffListQuery);
  // Personal data (phones, emails): never cache. The response also differs by
  // caller (HR sees personal numbers), so a shared cache would be a leak.
  res.setHeader('Cache-Control', 'private, no-store');
  ok(res, page);
});
