import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import {
  closeCashbookHandler,
  createManualCashbookEntryHandler,
  getCashbookSummaryHandler,
  openCashbookHandler,
  reopenCashbookHandler,
} from './cashbook.controller.js';
import {
  cashbookDateQuerySchema,
  closeCashbookSchema,
  createManualCashbookEntrySchema,
  openCashbookSchema,
  reopenCashbookSchema,
} from './cashbook.schema.js';

export const cashbookRouter = Router();

cashbookRouter.use(requireAuth);

cashbookRouter.get(
  '/',
  validateRequest({ query: cashbookDateQuerySchema }),
  getCashbookSummaryHandler,
);

cashbookRouter.post(
  '/open',
  validateRequest({ body: openCashbookSchema }),
  openCashbookHandler,
);

cashbookRouter.post(
  '/close',
  validateRequest({ body: closeCashbookSchema }),
  closeCashbookHandler,
);

cashbookRouter.post(
  '/reopen',
  requireRole('OWNER'),
  validateRequest({ body: reopenCashbookSchema }),
  reopenCashbookHandler,
);

cashbookRouter.post(
  '/entries',
  requireRole('OWNER'),
  validateRequest({ body: createManualCashbookEntrySchema }),
  createManualCashbookEntryHandler,
);
