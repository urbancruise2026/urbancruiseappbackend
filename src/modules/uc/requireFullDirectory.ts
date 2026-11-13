/**
 * uc — route guard for the customer, vendor and driver directory lists.
 *
 * Runs AFTER authenticate and authorize. authorize() answers "may this ROLE
 * read this kind of resource" from the access token alone; this guard answers
 * "may this particular staff member", which needs their department and is
 * therefore read from Saarthi per request.
 *
 * Without it, hiding those tabs in the mobile app would be decorative: a
 * 'general' staff member could call the endpoint directly and get every
 * customer record back.
 *
 * Not applied to /uc/staff — every staff member may look up a colleague.
 */
import type { RequestHandler } from 'express';
import { ForbiddenError } from '../../shared/errors/index.js';
import { getIdentity } from '../../shared/http/responses.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { loadViewerAccess } from './viewer.js';
import { canReadFullDirectory, resolveWorkspace } from './workspace.js';

export const requireFullDirectory: RequestHandler = asyncHandler(async (req, _res, next) => {
  const identity = getIdentity(req);
  const access = await loadViewerAccess(identity.entityId);
  if (!canReadFullDirectory(access)) {
    throw new ForbiddenError('Your team does not have access to this directory.', 'RBAC_DENIED', {
      workspace: resolveWorkspace(access),
    });
  }
  next();
});
