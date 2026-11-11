import type { NextFunction, Request, Response } from 'express';
import { getRequestMeta, requireRequestAuth } from '../../shared/utils/request-auth.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type {
  CreatePurchaseInput,
  CreatePurchaseReturnInput,
  ListPurchasesQuery,
} from './purchases.schema.js';
import {
  createPurchase,
  createPurchaseReturn,
  getPurchaseById,
  listPurchases,
} from './purchases.service.js';

export async function listPurchasesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const result = await listPurchases(auth.shopId, req.query as unknown as ListPurchasesQuery);
    sendSuccess(req, res, { purchases: result.purchases }, 200, result.pagination);
  } catch (err) {
    next(err);
  }
}

export async function getPurchaseByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const { id } = req.params as { id: string };
    const purchase = await getPurchaseById(auth.shopId, id);
    sendSuccess(req, res, { purchase });
  } catch (err) {
    next(err);
  }
}

export async function createPurchaseHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const result = await createPurchase(
      auth.shopId,
      auth.userId,
      req.body as CreatePurchaseInput,
      getRequestMeta(req),
    );
    sendSuccess(
      req,
      res,
      {
        purchase: result.purchase,
        idempotencyReplayed: result.idempotencyReplayed,
      },
      result.idempotencyReplayed ? 200 : 201,
    );
  } catch (err) {
    next(err);
  }
}

export async function createPurchaseReturnHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const { id } = req.params as { id: string };
    const result = await createPurchaseReturn(
      auth.shopId,
      auth.userId,
      id,
      req.body as CreatePurchaseReturnInput,
      getRequestMeta(req),
    );
    sendSuccess(
      req,
      res,
      {
        purchase: result.purchase,
        purchaseReturn: result.purchaseReturn,
        idempotencyReplayed: result.idempotencyReplayed,
      },
      result.idempotencyReplayed ? 200 : 201,
    );
  } catch (err) {
    next(err);
  }
}
