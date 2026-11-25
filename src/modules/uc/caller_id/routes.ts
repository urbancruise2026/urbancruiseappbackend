/**
 * uc.caller_id — routes, mounted at /api/v1/uc/caller-id.
 *
 * GET /snapshot — customers only. Kept for app builds that only know the
 *                 customer card (they would show a vendor as "Customer").
 * GET /contacts — customers, vendors, drivers and UC staff, for app
 *                 builds with the four card types (24 Nov 2026).
 *
 * UC staff only; Active status checked per request in the service.
 * No requireFullDirectory: unlike the Directory customers list, caller ID
 * is for every department (product decision, 23 Nov 2026).
 */
import { Router } from 'express';
import { authenticate } from '../../../shared/http/middleware/authenticate.js';
import { authorize } from '../../../shared/http/middleware/authorize.js';
import { getCallerIdContacts, getCallerIdSnapshot } from './controller.js';

const router = Router();

router.get('/snapshot', authenticate, authorize('read', 'CallerIdDirectory'), getCallerIdSnapshot);
router.get('/contacts', authenticate, authorize('read', 'CallerIdDirectory'), getCallerIdContacts);

export default router;
