/** uc.drivers — request schemas. */
import { z } from 'zod';
import {
  DIRECTORY_DEFAULT_LIMIT,
  DIRECTORY_MAX_LIMIT,
  DIRECTORY_MAX_SEARCH,
} from '../directory.js';

/** GET /api/v1/uc/drivers */
export const driverListQuerySchema = z.object({
  search: z.string().trim().max(DIRECTORY_MAX_SEARCH).default(''),
  verification: z.enum(['all', 'verified', 'pending', 'rejected']).default('all'),
  vendorId: z.coerce.number().int().positive().max(2_147_483_647).optional(),
  sortBy: z.enum(['newest', 'oldest', 'nameAsc']).default('newest'),
  cursor: z.string().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(DIRECTORY_MAX_LIMIT).default(DIRECTORY_DEFAULT_LIMIT),
});
