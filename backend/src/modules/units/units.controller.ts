import type { NextFunction, Request, Response } from 'express';
import { getRequestMeta, requireRequestAuth } from '../../shared/utils/request-auth.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type { CreateUnitInput, UpdateUnitInput } from './units.schema.js';
import { createUnit, listUnits, updateUnit } from './units.service.js';

export async function listUnitsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const units = await listUnits(auth.shopId);
    sendSuccess(req, res, { units });
  } catch (err) {
    next(err);
  }
}

export async function createUnitHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const unit = await createUnit(
      auth.shopId,
      auth.userId,
      req.body as CreateUnitInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, { unit }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateUnitHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = requireRequestAuth(req);
    const { id } = req.params as { id: string };
    const unit = await updateUnit(
      auth.shopId,
      auth.userId,
      id,
      req.body as UpdateUnitInput,
      getRequestMeta(req),
    );
    sendSuccess(req, res, { unit });
  } catch (err) {
    next(err);
  }
}
