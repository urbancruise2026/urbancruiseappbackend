/** uc.staff — request schemas. */
import { z } from 'zod';
import {
  DIRECTORY_DEFAULT_LIMIT,
  DIRECTORY_MAX_LIMIT,
  DIRECTORY_MAX_SEARCH,
} from '../directory.js';

/**
 * GET /api/v1/uc/staff
 *
 * Defaults match the app's DEFAULT_STAFF_FILTERS in
 * src/features/uc/staff/types.ts: active only, sorted A–Z.
 */
export const staffListQuerySchema = z.object({
  search: z.string().trim().max(DIRECTORY_MAX_SEARCH).default(''),
  active: z.enum(['all', 'active', 'inactive']).default('active'),
  sortBy: z.enum(['newest', 'oldest', 'nameAsc']).default('nameAsc'),
  cursor: z.string().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(DIRECTORY_MAX_LIMIT).default(DIRECTORY_DEFAULT_LIMIT),
});
