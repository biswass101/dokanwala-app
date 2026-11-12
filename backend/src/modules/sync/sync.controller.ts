import type { NextFunction, Request, Response } from 'express';
import { getRequestMeta, requireRequestAuth } from '../../shared/utils/request-auth.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type { SyncPullQuery, SyncPushInput } from './sync.schema.js';
import { pullSyncChanges, pushSyncOperations } from './sync.service.js';

export async function pushSyncHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const body = req.body as SyncPushInput;
    const result = await pushSyncOperations(
      auth.shopId,
      auth.userId,
      auth.role,
      body,
      getRequestMeta(req),
    );
    sendSuccess(req, res, result, 200);
  } catch (err) {
    next(err);
  }
}

export async function pullSyncHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const query = req.query as unknown as SyncPullQuery;
    const result = await pullSyncChanges(auth.shopId, auth.role, query);
    sendSuccess(req, res, result, 200);
  } catch (err) {
    next(err);
  }
}
