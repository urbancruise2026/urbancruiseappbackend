/**
 * uc.vendors — routes, mounted at /api/v1/uc/vendors.
 *
 * GET / — UC Directory vendors list: search, status filter, sort, cursor
 * pagination. UC staff only.
 */
import { Router } from 'express';
import { authenticate } from '../../../shared/http/middleware/authenticate.js';
import { authorize } from '../../../shared/http/middleware/authorize.js';
import { validate } from '../../../shared/http/middleware/validate.js';
import { vendorListQuerySchema } from './schemas.js';
import { getVendors } from './controller.js';

const router = Router();

router.get(
  '/',
  authenticate,
  authorize('read', 'DirectoryVendor'),
  validate({ query: vendorListQuerySchema }),
  getVendors,
);

export default router;
