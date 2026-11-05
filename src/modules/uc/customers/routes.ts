/**
 * uc.customers — routes, mounted at /api/v1/uc/customers.
 *
 * GET / — UC Directory customers list: search, category and created-date
 * filters, sort, cursor pagination. UC staff only.
 */
import { Router } from 'express';
import { authenticate } from '../../../shared/http/middleware/authenticate.js';
import { authorize } from '../../../shared/http/middleware/authorize.js';
import { validate } from '../../../shared/http/middleware/validate.js';
import { customerListQuerySchema } from './schemas.js';
import { getCustomers } from './controller.js';

const router = Router();

router.get(
  '/',
  authenticate,
  authorize('read', 'DirectoryCustomer'),
  validate({ query: customerListQuerySchema }),
  getCustomers,
);

export default router;
