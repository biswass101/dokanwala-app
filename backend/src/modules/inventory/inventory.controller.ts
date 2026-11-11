import type { NextFunction, Request, Response } from 'express';
import { getRequestMeta, requireRequestAuth } from '../../shared/utils/request-auth.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type {
  CreateStockAdjustmentInput,
  ListAdjustmentsQuery,
  ListMovementsQuery,
} from './inventory.schema.js';
import {
  createStockAdjustment,
  getInventoryValuation,
  getLowStockAlerts,
  listStockAdjustments,
  listStockMovements,
} from './inventory.service.js';

export async function getLowStockAlertsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const products = await getLowStockAlerts(auth.shopId, auth.role);
    sendSuccess(req, res, { products });
  } catch (err) {
    next(err);
  }
}

export async function listMovementsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const result = await listStockMovements(
      auth.shopId,
      auth.role,
      req.query as unknown as ListMovementsQuery,
    );
    sendSuccess(req, res, { movements: result.movements }, 200, result.pagination);
  } catch (err) {
    next(err);
  }
}

export async function listAdjustmentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const result = await listStockAdjustments(
      auth.shopId,
      auth.role,
      req.query as unknown as ListAdjustmentsQuery,
    );
    sendSuccess(req, res, { adjustments: result.adjustments }, 200, result.pagination);
  } catch (err) {
    next(err);
  }
}

export async function getValuationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const summary = await getInventoryValuation(auth.shopId);
    sendSuccess(req, res, { valuation: summary });
  } catch (err) {
    next(err);
  }
}

export async function createAdjustmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const result = await createStockAdjustment(
      auth.shopId,
      auth.userId,
      auth.role,
      req.body as CreateStockAdjustmentInput,
      getRequestMeta(req),
    );
    sendSuccess(
      req,
      res,
      {
        adjustment: result.adjustment,
        product: result.product,
        idempotencyReplayed: result.idempotencyReplayed,
      },
      result.idempotencyReplayed ? 200 : 201,
    );
  } catch (err) {
    next(err);
  }
}
