import type { NextFunction, Request, Response } from 'express';
import { getRequestMeta, requireRequestAuth } from '../../shared/utils/request-auth.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type {
  CashbookDateQuery,
  CloseCashbookInput,
  CreateManualCashbookEntryInput,
  OpenCashbookInput,
  ReopenCashbookInput,
} from './cashbook.schema.js';
import {
  closeCashbookSession,
  createManualCashbookEntry,
  getCashbookSummary,
  openCashbookSession,
  reopenCashbookSession,
} from './cashbook.service.js';

export async function getCashbookSummaryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const query = req.query as unknown as CashbookDateQuery;
    const summary = await getCashbookSummary(auth.shopId, query.businessDate);
    sendSuccess(req, res, summary, 200);
  } catch (err) {
    next(err);
  }
}

export async function openCashbookHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const summary = await openCashbookSession(
      auth.shopId,
      auth.userId,
      req.body as OpenCashbookInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, summary, 201);
  } catch (err) {
    next(err);
  }
}

export async function closeCashbookHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const summary = await closeCashbookSession(
      auth.shopId,
      auth.userId,
      req.body as CloseCashbookInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, summary, 200);
  } catch (err) {
    next(err);
  }
}

export async function reopenCashbookHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const summary = await reopenCashbookSession(
      auth.shopId,
      auth.userId,
      req.body as ReopenCashbookInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, summary, 200);
  } catch (err) {
    next(err);
  }
}

export async function createManualCashbookEntryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const result = await createManualCashbookEntry(
      auth.shopId,
      auth.userId,
      req.body as CreateManualCashbookEntryInput,
      getRequestMeta(req),
    );
    sendSuccess(
      req,
      res,
      { entry: result.entry, idempotencyReplayed: result.idempotencyReplayed },
      result.idempotencyReplayed ? 200 : 201,
    );
  } catch (err) {
    next(err);
  }
}
