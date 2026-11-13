import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { uuidParamSchema } from '../../shared/validators/common.js';
import {
  cancelSaleHandler,
  createQuickSaleHandler,
  createSaleHandler,
  createSaleReturnHandler,
  deleteSaleHandler,
  getSaleByIdHandler,
  getSaleReceiptPdfHandler,
  listSalesHandler,
  updateSaleHandler,
} from './sales.controller.js';
import {
  cancelSaleSchema,
  createQuickSaleSchema,
  createSaleReturnSchema,
  createSaleSchema,
  deleteSaleSchema,
  listSalesQuerySchema,
  receiptPdfQuerySchema,
  updateSaleSchema,
} from './sales.schema.js';

export const salesRouter = Router();

salesRouter.use(requireAuth);

salesRouter.get('/', validateRequest({ query: listSalesQuerySchema }), listSalesHandler);

salesRouter.post('/', validateRequest({ body: createSaleSchema }), createSaleHandler);
salesRouter.post('/quick', validateRequest({ body: createQuickSaleSchema }), createQuickSaleHandler);

salesRouter.get('/:id', validateRequest({ params: uuidParamSchema }), getSaleByIdHandler);

salesRouter.patch(
  '/:id',
  validateRequest({ params: uuidParamSchema, body: updateSaleSchema }),
  updateSaleHandler,
);

salesRouter.delete(
  '/:id',
  requireRole('OWNER'),
  validateRequest({ params: uuidParamSchema, body: deleteSaleSchema }),
  deleteSaleHandler,
);

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
