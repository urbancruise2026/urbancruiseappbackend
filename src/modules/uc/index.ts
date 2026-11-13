/**
 * uc module — Urban Cruise staff APIs, mounted at /api/v1/uc.
 *
 * Live:
 *   /workspace  — which dashboard the SIGNED-IN staff member gets
 *   /customers  — UC Directory customers list
 *   /vendors    — UC Directory vendors list
 *   /drivers    — UC Directory drivers list
 *   /staff      — UC Directory staff list
 *
 * Still stubs (not mounted): quotations, dashboard.
 */
import { Router } from 'express';
import meRouter from './me/routes.js';
import customersRouter from './customers/routes.js';
import vendorsRouter from './vendors/routes.js';
import driversRouter from './drivers/routes.js';
import staffRouter from './uc_staff/routes.js';

export default {
  mount(): Router {
    const r = Router();
    // Mounted at the module root, so its path is /api/v1/uc/workspace.
    // First, so a future sub-module can never shadow it.
    r.use('/', meRouter);
    r.use('/customers', customersRouter);
    r.use('/vendors', vendorsRouter);
    r.use('/drivers', driversRouter);
    r.use('/staff', staffRouter);
    return r;
  },
};
