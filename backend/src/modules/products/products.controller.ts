import type { NextFunction, Request, Response } from 'express';
import { getRequestMeta, requireRequestAuth } from '../../shared/utils/request-auth.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type {
  CreateProductInput,
  ListProductsQuery,
  ReplaceProductUnitsInput,
  UpdateProductInput,
} from './products.schema.js';
import {
  archiveProduct,
  createProduct,
  getProductById,
  listProducts,
  replaceProductUnits,
  updateProduct,
} from './products.service.js';

export async function listProductsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const result = await listProducts(
      auth.shopId,
      auth.role,
      req.query as unknown as ListProductsQuery,
    );
    sendSuccess(req, res, { products: result.products }, 200, result.pagination);
  } catch (err) {
    next(err);
  }
}

export async function getProductHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const { id } = req.params as { id: string };
    const product = await getProductById(auth.shopId, auth.role, id);
    sendSuccess(req, res, { product });
  } catch (err) {
    next(err);
  }
}

export async function createProductHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const product = await createProduct(
      auth.shopId,
      auth.userId,
      auth.role,
      req.body as CreateProductInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, { product }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateProductHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const { id } = req.params as { id: string };
    const product = await updateProduct(
      auth.shopId,
      auth.userId,
      auth.role,
      id,
      req.body as UpdateProductInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, { product });
  } catch (err) {
    next(err);
  }
}

export async function replaceProductUnitsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const { id } = req.params as { id: string };
    const product = await replaceProductUnits(
      auth.shopId,
      auth.userId,
      auth.role,
      id,
      req.body as ReplaceProductUnitsInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, { product });
  } catch (err) {
    next(err);
  }
}

export async function archiveProductHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const { id } = req.params as { id: string };
    const result = await archiveProduct(auth.shopId, auth.userId, id, getRequestMeta(req));
    sendSuccess(req, res, result);
  } catch (err) {
    next(err);
  }
}
