/** uc.vendors — request schemas. */
import { z } from 'zod';
import {
  DIRECTORY_DEFAULT_LIMIT,
  DIRECTORY_MAX_LIMIT,
  DIRECTORY_MAX_SEARCH,
} from '../directory.js';

/** GET /api/v1/uc/vendors */
export const vendorListQuerySchema = z.object({
  search: z.string().trim().max(DIRECTORY_MAX_SEARCH).default(''),
  status: z.enum(['all', 'active', 'pending', 'suspended', 'inactive']).default('all'),
  sortBy: z.enum(['newest', 'oldest', 'nameAsc']).default('newest'),
  cursor: z.string().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(DIRECTORY_MAX_LIMIT).default(DIRECTORY_DEFAULT_LIMIT),
});
