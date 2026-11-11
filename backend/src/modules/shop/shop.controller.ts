import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../shared/errors/app-error.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type {
  CreateEmployeeInput,
  UpdateShopInput,
  UpdateShopUserInput,
} from './shop.schema.js';
import {
  createEmployeeAccount,
  getShopProfile,
  listShopUsers,
  updateShopProfile,
  updateShopUser,
} from './shop.service.js';

function extractRequestMeta(req: Request): { deviceId?: string; ipAddress?: string } {
  const deviceId = req.header('x-device-id')?.trim();
  const ipAddress = req.ip;
  return {
    ...(deviceId ? { deviceId: deviceId.slice(0, 120) } : {}),
    ...(ipAddress ? { ipAddress: ipAddress.slice(0, 64) } : {}),
  };
}

export async function getShopController(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new UnauthorizedError();
  const shop = await getShopProfile(req.auth.shopId);
  sendSuccess(req, res, { shop }, 200);
}

export async function updateShopController(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new UnauthorizedError();
  const input = req.body as UpdateShopInput;
  const shop = await updateShopProfile(
    req.auth.shopId,
    req.auth.userId,
    input,
    extractRequestMeta(req),
  );
  sendSuccess(req, res, { shop }, 200);
}

export async function listShopUsersController(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new UnauthorizedError();
  const users = await listShopUsers(req.auth.shopId);
  sendSuccess(req, res, { users }, 200);
}

export async function createEmployeeController(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new UnauthorizedError();
  const input = req.body as CreateEmployeeInput;
  const user = await createEmployeeAccount(
    req.auth.shopId,
    req.auth.userId,
    input,
    extractRequestMeta(req),
  );
  sendSuccess(req, res, { user }, 201);
}

export async function updateShopUserController(req: Request, res: Response): Promise<void> {
  if (!req.auth) throw new UnauthorizedError();
  const { id } = req.params as { id: string };
  const input = req.body as UpdateShopUserInput;
  const user = await updateShopUser(
    req.auth.shopId,
    req.auth.userId,
    id,
    input,
    extractRequestMeta(req),
  );
  sendSuccess(req, res, { user }, 200);
}
