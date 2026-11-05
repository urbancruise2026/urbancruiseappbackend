/** uc.drivers — controller (HTTP only). */
import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { ok } from '../../../shared/http/responses.js';
import { listDrivers } from './service.js';
import type { DriverListQuery } from './types.js';

/** GET /api/v1/uc/drivers → { data: { items, nextCursor, total } } */
export const getDrivers = asyncHandler(async (req: Request, res: Response) => {
  const page = await listDrivers(req.query as unknown as DriverListQuery);
  res.setHeader('Cache-Control', 'private, no-store');
  ok(res, page);
});
