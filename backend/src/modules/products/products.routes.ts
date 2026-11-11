import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { uuidParamSchema } from '../../shared/validators/common.js';
import {
  archiveProductHandler,
  createProductHandler,
  getProductHandler,
  listProductsHandler,
  replaceProductUnitsHandler,
  updateProductHandler,
} from './products.controller.js';
import {
  createProductSchema,
  listProductsQuerySchema,
  replaceProductUnitsSchema,
  updateProductSchema,
} from './products.schema.js';

export const productsRouter = Router();

productsRouter.use(requireAuth);

productsRouter.get('/', validateRequest({ query: listProductsQuerySchema }), listProductsHandler);

productsRouter.get('/:id', validateRequest({ params: uuidParamSchema }), getProductHandler);

productsRouter.post(
  '/',
  requireRole('OWNER'),
  validateRequest({ body: createProductSchema }),
  createProductHandler,
);

productsRouter.patch(
  '/:id',
  requireRole('OWNER'),
  validateRequest({ params: uuidParamSchema, body: updateProductSchema }),
  updateProductHandler,
);

productsRouter.put(
  '/:id/units',
  requireRole('OWNER'),
  validateRequest({ params: uuidParamSchema, body: replaceProductUnitsSchema }),
  replaceProductUnitsHandler,
);

productsRouter.delete(
  '/:id',
  requireRole('OWNER'),
  validateRequest({ params: uuidParamSchema }),
  archiveProductHandler,
);
