/** uc.vendors — controller (HTTP only). */
import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { ok } from '../../../shared/http/responses.js';
import { listVendors } from './service.js';
import type { VendorListQuery } from './types.js';

/** GET /api/v1/uc/vendors → { data: { items, nextCursor, total } } */
export const getVendors = asyncHandler(async (req: Request, res: Response) => {
  const page = await listVendors(req.query as unknown as VendorListQuery);
  res.setHeader('Cache-Control', 'private, no-store');
  ok(res, page);
});
