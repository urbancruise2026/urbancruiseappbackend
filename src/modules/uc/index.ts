/**
 * uc module — Urban Cruise staff APIs, mounted at /api/v1/uc.
 *
 * Live:
 *   /customers  — UC Directory customers list
 *   /vendors    — UC Directory vendors list
 *   /drivers    — UC Directory drivers list
 *
 * Still stubs (not mounted): quotations, uc_staff, dashboard.
 */
import { Router } from 'express';
import customersRouter from './customers/routes.js';
import vendorsRouter from './vendors/routes.js';
import driversRouter from './drivers/routes.js';

export default {
  mount(): Router {
    const r = Router();
    r.use('/customers', customersRouter);
    r.use('/vendors', vendorsRouter);
    r.use('/drivers', driversRouter);
    return r;
  },
};
