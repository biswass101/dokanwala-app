import type { NextFunction, Request, Response } from 'express';
import { getRequestMeta, requireRequestAuth } from '../../shared/utils/request-auth.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type { RestoreBackupInput } from './backup.schema.js';
import { exportShopBackup, restoreShopBackup } from './backup.service.js';

export async function exportBackupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const meta = getRequestMeta(req);
    const result = await exportShopBackup(auth.shopId, auth.userId, meta);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(JSON.stringify(result.document, null, 2));
  } catch (err) {
    next(err);
  }
}

export async function restoreBackupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const meta = getRequestMeta(req);
    const result = await restoreShopBackup(
      auth.shopId,
      auth.userId,
      req.body as RestoreBackupInput,
      meta,
    );
    sendSuccess(req, res, { restore: result }, 200);
  } catch (err) {
    next(err);
  }
}
