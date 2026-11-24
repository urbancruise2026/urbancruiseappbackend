/**
 * uc.caller_id — routes, mounted at /api/v1/uc/caller-id.
 *
 * GET /snapshot — every customer number a UC staff phone needs to show the
 * caller-ID card. UC staff only; Active status checked per request in the
 * service.
 *
 * No requireFullDirectory: unlike the Directory customers list, caller ID
 * is for every department (product decision, 23 Nov 2026).
 */
import { Router } from 'express';
import { authenticate } from '../../../shared/http/middleware/authenticate.js';
import { authorize } from '../../../shared/http/middleware/authorize.js';
import { getCallerIdSnapshot } from './controller.js';

const router = Router();

router.get('/snapshot', authenticate, authorize('read', 'CallerIdDirectory'), getCallerIdSnapshot);

export default router;
