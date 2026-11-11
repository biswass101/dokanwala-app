import type { NextFunction, Request, Response } from 'express';
import { getRequestMeta, requireRequestAuth } from '../../shared/utils/request-auth.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.schema.js';
import {
  archiveCategory,
  createCategory,
  listCategories,
  updateCategory,
} from './categories.service.js';

export async function listCategoriesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const query = req.query as unknown as { includeInactive?: boolean };
    const categories = await listCategories(auth.shopId, query.includeInactive ?? false);
    sendSuccess(req, res, { categories });
  } catch (err) {
    next(err);
  }
}

export async function createCategoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const category = await createCategory(
      auth.shopId,
      auth.userId,
      req.body as CreateCategoryInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, { category }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateCategoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const { id } = req.params as { id: string };
    const category = await updateCategory(
      auth.shopId,
      auth.userId,
      id,
      req.body as UpdateCategoryInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, { category });
  } catch (err) {
    next(err);
  }
}

export async function archiveCategoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const { id } = req.params as { id: string };
    const result = await archiveCategory(auth.shopId, auth.userId, id, getRequestMeta(req));
    sendSuccess(req, res, result);
  } catch (err) {
    next(err);
  }
}
