import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import {
  createAdjustmentHandler,
  getLowStockAlertsHandler,
  getValuationHandler,
  listAdjustmentsHandler,
  listMovementsHandler,
} from './inventory.controller.js';
import {
  createStockAdjustmentSchema,
  listAdjustmentsQuerySchema,
  listMovementsQuerySchema,
} from './inventory.schema.js';

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth);

inventoryRouter.get('/alerts', getLowStockAlertsHandler);

inventoryRouter.get(
  '/movements',
  validateRequest({ query: listMovementsQuerySchema }),
  listMovementsHandler,
);

inventoryRouter.get(
  '/adjustments',
  validateRequest({ query: listAdjustmentsQuerySchema }),
  listAdjustmentsHandler,
);

inventoryRouter.get('/valuation', requireRole('OWNER'), getValuationHandler);

inventoryRouter.post(
  '/adjustments',
  requireRole('OWNER'),
  validateRequest({ body: createStockAdjustmentSchema }),
  createAdjustmentHandler,
);
