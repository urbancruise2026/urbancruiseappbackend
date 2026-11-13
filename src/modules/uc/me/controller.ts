/** uc.me — controller (HTTP only). */
import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { ok, getIdentity } from '../../../shared/http/responses.js';
import { loadViewerAccess } from '../viewer.js';
import { canSeePersonalNumbers, resolveWorkspace } from '../workspace.js';

/**
 * GET /api/v1/uc/workspace
 *
 * Which dashboard this staff member gets, resolved on the server. The app
 * uses it to choose a screen and nothing else: it is never sent back, and no
 * endpoint authorises anything from it. Every dashboard's data endpoint must
 * resolve the workspace again for itself.
 *
 * Called once after login and on resume. Not a JWT claim — see viewer.ts.
 */
export const getWorkspace = asyncHandler(async (req: Request, res: Response) => {
  const identity = getIdentity(req);
  const access = await loadViewerAccess(identity.entityId);

  res.setHeader('Cache-Control', 'private, no-store');
  ok(res, {
    workspace: resolveWorkspace(access),
    departmentId: access?.departmentId ?? null,
    subDepartmentId: access?.subDepartmentId ?? null,
    // So the app can hide the "Alternate Phone" row before any list loads.
    // Advisory only: the server decides again on every /uc/staff request.
    canSeePersonalNumbers: canSeePersonalNumbers(access),
  });
});
