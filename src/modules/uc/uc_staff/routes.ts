/**
 * uc.staff — routes, mounted at /api/v1/uc/staff.
 *
 * GET / — UC Directory staff list: search by name, phone, email or branch,
 * active filter, sort, cursor pagination. UC staff only.
 *
 * Personal numbers are NOT gated here. authorize() answers "may this role
 * read this kind of resource"; which COLUMNS a caller gets is a field-level
 * decision and belongs in the service, where the department is known.
 */
import { Router } from 'express';
import { authenticate } from '../../../shared/http/middleware/authenticate.js';
import { authorize } from '../../../shared/http/middleware/authorize.js';
import { validate } from '../../../shared/http/middleware/validate.js';
import { staffListQuerySchema } from './schemas.js';
import { getStaff } from './controller.js';

const router = Router();

router.get(
  '/',
  authenticate,
  authorize('read', 'DirectoryStaff'),
  validate({ query: staffListQuerySchema }),
  getStaff,
);

export default router;
