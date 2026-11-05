/** uc.customers — request schemas. */
import { z } from 'zod';
import {
  DIRECTORY_DEFAULT_LIMIT,
  DIRECTORY_MAX_LIMIT,
  DIRECTORY_MAX_SEARCH,
} from '../directory.js';

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine(d => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'Invalid date');

/** GET /api/v1/uc/customers */
export const customerListQuerySchema = z
  .object({
    search: z.string().trim().max(DIRECTORY_MAX_SEARCH).default(''),
    type: z.enum(['all', 'personal', 'corporate', 'agent']).default('all'),
    dateFrom: isoDay.optional(),
    dateTo: isoDay.optional(),
    sortBy: z.enum(['newest', 'oldest', 'nameAsc']).default('newest'),
    cursor: z.string().min(1).max(1000).optional(),
    limit: z.coerce.number().int().min(1).max(DIRECTORY_MAX_LIMIT).default(DIRECTORY_DEFAULT_LIMIT),
  })
  .refine(q => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, {
    message: 'dateFrom must be on or before dateTo',
    path: ['dateFrom'],
  });
