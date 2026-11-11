import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { createCustomerHandler, listCustomersHandler } from './customers.controller.js';
import { createCustomerSchema, listCustomersQuerySchema } from './customers.schema.js';

export const customersRouter = Router();

customersRouter.use(requireAuth);

customersRouter.get(
  '/',
  validateRequest({ query: listCustomersQuerySchema }),
  listCustomersHandler,
);

customersRouter.post('/', validateRequest({ body: createCustomerSchema }), createCustomerHandler);
