import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { uuidParamSchema } from '../../shared/validators/common.js';
import {
  archiveCategoryHandler,
  createCategoryHandler,
  listCategoriesHandler,
  updateCategoryHandler,
} from './categories.controller.js';
import {
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from './categories.schema.js';

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);

categoriesRouter.get(
  '/',
  validateRequest({ query: listCategoriesQuerySchema }),
  listCategoriesHandler,
);

categoriesRouter.post(
  '/',
  requireRole('OWNER'),
  validateRequest({ body: createCategorySchema }),
  createCategoryHandler,
);

categoriesRouter.patch(
  '/:id',
  requireRole('OWNER'),
  validateRequest({ params: uuidParamSchema, body: updateCategorySchema }),
  updateCategoryHandler,
);

categoriesRouter.delete(
  '/:id',
  requireRole('OWNER'),
  validateRequest({ params: uuidParamSchema }),
  archiveCategoryHandler,
);
