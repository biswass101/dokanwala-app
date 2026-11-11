import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { uuidParamSchema } from '../../shared/validators/common.js';
import {
  createPurchaseHandler,
  createPurchaseReturnHandler,
  getPurchaseByIdHandler,
  listPurchasesHandler,
} from './purchases.controller.js';
import {
  createPurchaseReturnSchema,
  createPurchaseSchema,
  listPurchasesQuerySchema,
} from './purchases.schema.js';

export const purchasesRouter = Router();

purchasesRouter.use(requireAuth, requireRole('OWNER'));

purchasesRouter.get(
  '/',
  validateRequest({ query: listPurchasesQuerySchema }),
  listPurchasesHandler,
);

purchasesRouter.post('/', validateRequest({ body: createPurchaseSchema }), createPurchaseHandler);

purchasesRouter.get('/:id', validateRequest({ params: uuidParamSchema }), getPurchaseByIdHandler);

purchasesRouter.post(
  '/:id/returns',
  validateRequest({ params: uuidParamSchema, body: createPurchaseReturnSchema }),
  createPurchaseReturnHandler,
);
