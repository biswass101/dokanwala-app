import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { uuidParamSchema } from '../../shared/validators/common.js';
import {
  createExpenseCategoryHandler,
  createExpenseHandler,
  getExpenseAuditHistoryHandler,
  getExpenseByIdHandler,
  listExpenseCategoriesHandler,
  listExpensesHandler,
  updateExpenseCategoryHandler,
  updateExpenseHandler,
} from './expenses.controller.js';
import {
  createExpenseCategorySchema,
  createExpenseSchema,
  listExpenseCategoriesQuerySchema,
  listExpensesQuerySchema,
  updateExpenseCategorySchema,
  updateExpenseSchema,
} from './expenses.schema.js';

export const expenseCategoriesRouter = Router();

expenseCategoriesRouter.use(requireAuth);

expenseCategoriesRouter.get(
  '/',
  validateRequest({ query: listExpenseCategoriesQuerySchema }),
  listExpenseCategoriesHandler,
);

expenseCategoriesRouter.post(
  '/',
  requireRole('OWNER'),
  validateRequest({ body: createExpenseCategorySchema }),
  createExpenseCategoryHandler,
);

expenseCategoriesRouter.patch(
  '/:id',
  requireRole('OWNER'),
  validateRequest({ params: uuidParamSchema, body: updateExpenseCategorySchema }),
  updateExpenseCategoryHandler,
);

export const expensesRouter = Router();

expensesRouter.use(requireAuth);

expensesRouter.get('/', validateRequest({ query: listExpensesQuerySchema }), listExpensesHandler);

expensesRouter.post('/', validateRequest({ body: createExpenseSchema }), createExpenseHandler);

expensesRouter.get('/:id', validateRequest({ params: uuidParamSchema }), getExpenseByIdHandler);

expensesRouter.patch(
  '/:id',
  requireRole('OWNER'),
  validateRequest({ params: uuidParamSchema, body: updateExpenseSchema }),
  updateExpenseHandler,
);

expensesRouter.get(
  '/:id/history',
  requireRole('OWNER'),
  validateRequest({ params: uuidParamSchema }),
  getExpenseAuditHistoryHandler,
);
