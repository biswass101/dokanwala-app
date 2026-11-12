import type { NextFunction, Request, Response } from 'express';
import { getRequestMeta, requireRequestAuth } from '../../shared/utils/request-auth.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type {
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  ListExpenseCategoriesQuery,
  ListExpensesQuery,
  UpdateExpenseCategoryInput,
  UpdateExpenseInput,
} from './expenses.schema.js';
import {
  createExpense,
  createExpenseCategory,
  getExpenseAuditHistory,
  getExpenseById,
  listExpenseCategories,
  listExpenses,
  updateExpense,
  updateExpenseCategory,
} from './expenses.service.js';

export async function listExpenseCategoriesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const categories = await listExpenseCategories(
      auth.shopId,
      req.query as unknown as ListExpenseCategoriesQuery,
    );
    sendSuccess(req, res, { categories }, 200);
  } catch (err) {
    next(err);
  }
}

export async function createExpenseCategoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const category = await createExpenseCategory(
      auth.shopId,
      auth.userId,
      req.body as CreateExpenseCategoryInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, { category }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateExpenseCategoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const category = await updateExpenseCategory(
      auth.shopId,
      auth.userId,
      String(req.params.id),
      req.body as UpdateExpenseCategoryInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, { category }, 200);
  } catch (err) {
    next(err);
  }
}

export async function listExpensesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const result = await listExpenses(auth.shopId, req.query as unknown as ListExpensesQuery);
    sendSuccess(
      req,
      res,
      {
        expenses: result.expenses,
        totalExpensePoisha: result.totalExpensePoisha,
      },
      200,
      result.pagination,
    );
  } catch (err) {
    next(err);
  }
}

export async function getExpenseByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const expense = await getExpenseById(auth.shopId, String(req.params.id));
    sendSuccess(req, res, { expense }, 200);
  } catch (err) {
    next(err);
  }
}

export async function createExpenseHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const result = await createExpense(
      auth.shopId,
      auth.userId,
      req.body as CreateExpenseInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, result, result.idempotencyReplayed ? 200 : 201);
  } catch (err) {
    next(err);
  }
}

export async function updateExpenseHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const expense = await updateExpense(
      auth.shopId,
      auth.userId,
      String(req.params.id),
      req.body as UpdateExpenseInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, { expense }, 200);
  } catch (err) {
    next(err);
  }
}

export async function getExpenseAuditHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const result = await getExpenseAuditHistory(auth.shopId, String(req.params.id));
    sendSuccess(req, res, result, 200);
  } catch (err) {
    next(err);
  }
}
