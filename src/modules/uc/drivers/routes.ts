/**
 * uc.drivers — routes, mounted at /api/v1/uc/drivers.
 *
 * GET / — UC Directory drivers list: search, verification and vendor
 * filters, sort, cursor pagination. UC staff only.
 */
import { Router } from 'express';
import { authenticate } from '../../../shared/http/middleware/authenticate.js';
import { authorize } from '../../../shared/http/middleware/authorize.js';
import { validate } from '../../../shared/http/middleware/validate.js';
import { requireFullDirectory } from '../requireFullDirectory.js';
import { driverListQuerySchema } from './schemas.js';
import { getDrivers } from './controller.js';

const router = Router();

router.get(
  '/',
  authenticate,
  authorize('read', 'DirectoryDriver'),
  // Department-level gate: 'general' staff see only the UC staff tab.
  requireFullDirectory,
  validate({ query: driverListQuerySchema }),
  getDrivers,
);

export default router;
