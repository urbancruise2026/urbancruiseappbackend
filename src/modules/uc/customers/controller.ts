/** uc.customers — controller (HTTP only). */
import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { ok } from '../../../shared/http/responses.js';
import { listCustomers } from './service.js';
import type { CustomerListQuery } from './types.js';

/** GET /api/v1/uc/customers → { data: { items, nextCursor, total } } */
export const getCustomers = asyncHandler(async (req: Request, res: Response) => {
  const page = await listCustomers(req.query as unknown as CustomerListQuery);
  // Personal data (phones, emails): never cache.
  res.setHeader('Cache-Control', 'private, no-store');
  ok(res, page);
});
