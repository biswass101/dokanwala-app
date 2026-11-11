import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { uuidParamSchema } from '../../shared/validators/common.js';
import { createUnitHandler, listUnitsHandler, updateUnitHandler } from './units.controller.js';
import { createUnitSchema, updateUnitSchema } from './units.schema.js';

export const unitsRouter = Router();

unitsRouter.use(requireAuth);

unitsRouter.get('/', listUnitsHandler);

unitsRouter.post(
  '/',
  requireRole('OWNER'),
  validateRequest({ body: createUnitSchema }),
  createUnitHandler,
);

unitsRouter.patch(
  '/:id',
  requireRole('OWNER'),
  validateRequest({ params: uuidParamSchema, body: updateUnitSchema }),
  updateUnitHandler,
);
