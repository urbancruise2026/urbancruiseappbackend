/**
 * config routes (public, no session), mounted at /api/v1/config.
 *   GET /app        app config, called at cold start before login
 *   GET /brochures  vehicle brochure catalog (YouTube ids, grouping, specs)
 *   GET /spiritual-tours  spiritual tour catalog, grouped by region in the app
 * Covered by the global rate limit only; all three are cheap and in-memory.
 */
import { Router } from 'express';
import { validate } from '../../shared/http/middleware/validate.js';
import { AppConfigQuery } from './schemas.js';
import { getAppConfig, getBrochures, getSpiritualTours } from './controller.js';

const router = Router();

router.get('/app', validate({ query: AppConfigQuery }), getAppConfig);

router.get('/brochures', getBrochures);

router.get('/spiritual-tours', getSpiritualTours);

export default router;
