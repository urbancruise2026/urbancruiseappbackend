/**
 * uc.me — routes about the SIGNED-IN staff member, mounted at /api/v1/uc.
 *
 * GET /workspace — which dashboard this caller gets.
 *
 * No authorize() call: the route returns only the caller's own placement, and
 * authenticate has already established who that is. Separate from uc_staff,
 * which is about OTHER people.
 */
import { Router } from 'express';
import { authenticate } from '../../../shared/http/middleware/authenticate.js';
import { getWorkspace } from './controller.js';

const router = Router();

router.get('/workspace', authenticate, getWorkspace);

export default router;
