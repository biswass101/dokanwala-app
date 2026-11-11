import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { uuidParamSchema } from '../../shared/validators/common.js';
import {
  createSupplierHandler,
  createSupplierPaymentHandler,
  getSupplierLedgerHandler,
  listSuppliersHandler,
  updateSupplierHandler,
} from './suppliers.controller.js';
import {
  createSupplierPaymentSchema,
  createSupplierSchema,
  listSuppliersQuerySchema,
  supplierLedgerQuerySchema,
  updateSupplierSchema,
} from './suppliers.schema.js';

export const suppliersRouter = Router();

suppliersRouter.use(requireAuth, requireRole('OWNER'));

suppliersRouter.get(
  '/',
  validateRequest({ query: listSuppliersQuerySchema }),
  listSuppliersHandler,
);

suppliersRouter.post('/', validateRequest({ body: createSupplierSchema }), createSupplierHandler);

suppliersRouter.patch(
  '/:id',
  validateRequest({ params: uuidParamSchema, body: updateSupplierSchema }),
  updateSupplierHandler,
);

suppliersRouter.get(
  '/:id/ledger',
  validateRequest({ params: uuidParamSchema, query: supplierLedgerQuerySchema }),
  getSupplierLedgerHandler,
);

suppliersRouter.post(
  '/:id/payments',
  validateRequest({ params: uuidParamSchema, body: createSupplierPaymentSchema }),
  createSupplierPaymentHandler,
);
