import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { uuidParamSchema } from '../../shared/validators/common.js';
import {
  collectCustomerPaymentHandler,
  createCustomerHandler,
  getCustomerByIdHandler,
  getCustomerLedgerHandler,
  listCustomersHandler,
  updateCustomerHandler,
} from './customers.controller.js';
import {
  createCustomerPaymentSchema,
  createCustomerSchema,
  customerLedgerQuerySchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from './customers.schema.js';

export const customersRouter = Router();

customersRouter.use(requireAuth);

customersRouter.get(
  '/',
  validateRequest({ query: listCustomersQuerySchema }),
  listCustomersHandler,
);

customersRouter.post('/', validateRequest({ body: createCustomerSchema }), createCustomerHandler);

customersRouter.get('/:id', validateRequest({ params: uuidParamSchema }), getCustomerByIdHandler);

customersRouter.patch(
  '/:id',
  validateRequest({ params: uuidParamSchema, body: updateCustomerSchema }),
  updateCustomerHandler,
);

customersRouter.get(
  '/:id/ledger',
  validateRequest({ params: uuidParamSchema, query: customerLedgerQuerySchema }),
  getCustomerLedgerHandler,
);

customersRouter.post(
  '/:id/payments',
  validateRequest({ params: uuidParamSchema, body: createCustomerPaymentSchema }),
  collectCustomerPaymentHandler,
);
