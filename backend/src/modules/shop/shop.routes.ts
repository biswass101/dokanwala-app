import { UserRoles } from '@dokanwala/shared';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { uuidParamSchema } from '../../shared/validators/common.js';
import {
  createEmployeeController,
  getShopController,
  listShopUsersController,
  updateShopController,
  updateShopUserController,
} from './shop.controller.js';
import {
  createEmployeeSchema,
  updateShopSchema,
  updateShopUserSchema,
} from './shop.schema.js';

export const shopRouter = Router();

shopRouter.use(requireAuth);

shopRouter.get('/', getShopController);

shopRouter.patch(
  '/',
  requireRole(UserRoles.OWNER),
  validateRequest({ body: updateShopSchema }),
  updateShopController,
);

shopRouter.get('/users', requireRole(UserRoles.OWNER), listShopUsersController);

shopRouter.post(
  '/users',
  requireRole(UserRoles.OWNER),
  validateRequest({ body: createEmployeeSchema }),
  createEmployeeController,
);

shopRouter.patch(
  '/users/:id',
  requireRole(UserRoles.OWNER),
  validateRequest({ params: uuidParamSchema, body: updateShopUserSchema }),
  updateShopUserController,
);
