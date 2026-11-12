import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { uuidParamSchema } from '../../shared/validators/common.js';
import {
  cancelSaleHandler,
  createSaleHandler,
  createSaleReturnHandler,
  getSaleByIdHandler,
  getSaleReceiptPdfHandler,
  listSalesHandler,
} from './sales.controller.js';
import {
  cancelSaleSchema,
  createSaleReturnSchema,
  createSaleSchema,
  listSalesQuerySchema,
  receiptPdfQuerySchema,
} from './sales.schema.js';

export const salesRouter = Router();

salesRouter.use(requireAuth);

salesRouter.get('/', validateRequest({ query: listSalesQuerySchema }), listSalesHandler);

salesRouter.post('/', validateRequest({ body: createSaleSchema }), createSaleHandler);

salesRouter.get('/:id', validateRequest({ params: uuidParamSchema }), getSaleByIdHandler);

salesRouter.get(
  '/:id/receipt/pdf',
  validateRequest({ params: uuidParamSchema, query: receiptPdfQuerySchema }),
  getSaleReceiptPdfHandler,
);

salesRouter.post(
  '/:id/returns',
  validateRequest({ params: uuidParamSchema, body: createSaleReturnSchema }),
  createSaleReturnHandler,
);

salesRouter.post(
  '/:id/cancel',
  requireRole('OWNER'),
  validateRequest({ params: uuidParamSchema, body: cancelSaleSchema }),
  cancelSaleHandler,
);
