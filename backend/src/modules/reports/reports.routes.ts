import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import {
  exportReportHandler,
  getDashboardSummaryHandler,
  getDuesReportHandler,
  getProductsReportHandler,
  getProfitLossReportHandler,
  getSalesReportHandler,
} from './reports.controller.js';
import {
  dashboardQuerySchema,
  dateRangeQuerySchema,
  exportReportQuerySchema,
  productsReportQuerySchema,
  salesReportQuerySchema,
} from './reports.schema.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

reportsRouter.get(
  '/dashboard',
  validateRequest({ query: dashboardQuerySchema }),
  getDashboardSummaryHandler,
);

reportsRouter.get(
  '/sales',
  validateRequest({ query: salesReportQuerySchema }),
  getSalesReportHandler,
);

reportsRouter.get(
  '/products',
  validateRequest({ query: productsReportQuerySchema }),
  getProductsReportHandler,
);

reportsRouter.get(
  '/profit-loss',
  requireRole('OWNER'),
  validateRequest({ query: dateRangeQuerySchema }),
  getProfitLossReportHandler,
);

reportsRouter.get('/dues', getDuesReportHandler);

reportsRouter.get(
  '/export',
  validateRequest({ query: exportReportQuerySchema }),
  exportReportHandler,
);
