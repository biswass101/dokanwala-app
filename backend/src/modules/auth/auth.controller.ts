import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../shared/errors/app-error.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type {
  LoginInput,
  LogoutInput,
  PinLoginInput,
  RefreshTokenInput,
  RegisterInput,
  SetPinInput,
} from './auth.schema.js';
import {
  getAuthenticatedProfile,
  loginWithPassword,
  loginWithPin,
  logoutSession,
  registerShopAndOwner,
  rotateRefreshSession,
  setQuickPin,
} from './auth.service.js';

function extractRequestMeta(req: Request): { deviceId?: string; ipAddress?: string } {
  const deviceId = req.header('x-device-id')?.trim();
  const ipAddress = req.ip;
  return {
    ...(deviceId ? { deviceId: deviceId.slice(0, 120) } : {}),
    ...(ipAddress ? { ipAddress: ipAddress.slice(0, 64) } : {}),
  };
}

export async function registerController(req: Request, res: Response): Promise<void> {
  const input = req.body as RegisterInput;
  const session = await registerShopAndOwner(input, extractRequestMeta(req));
  sendSuccess(req, res, session, 201);
}

export async function loginController(req: Request, res: Response): Promise<void> {
  const input = req.body as LoginInput;
  const session = await loginWithPassword(input, extractRequestMeta(req));
  sendSuccess(req, res, session, 200);
}

export async function pinLoginController(req: Request, res: Response): Promise<void> {
  const input = req.body as PinLoginInput;
  const session = await loginWithPin(input, extractRequestMeta(req));
  sendSuccess(req, res, session, 200);
}

export async function refreshController(req: Request, res: Response): Promise<void> {
  const input = req.body as RefreshTokenInput;
  const tokens = await rotateRefreshSession(input.refreshToken, extractRequestMeta(req));
  sendSuccess(req, res, tokens, 200);
}

export async function logoutController(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    throw new UnauthorizedError();
  }
  const input = req.body as LogoutInput;
  await logoutSession({
    userId: req.auth.userId,
    shopId: req.auth.shopId,
    sessionId: req.auth.sessionId,
    ...(input.refreshToken !== undefined ? { rawRefreshToken: input.refreshToken } : {}),
    meta: extractRequestMeta(req),
  });
  sendSuccess(req, res, { loggedOut: true }, 200);
}

export async function setPinController(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    throw new UnauthorizedError();
  }
  const input = req.body as SetPinInput;
  const user = await setQuickPin(
    req.auth.userId,
    req.auth.shopId,
    input,
    extractRequestMeta(req),
  );
  sendSuccess(req, res, { user }, 200);
}

export async function meController(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    throw new UnauthorizedError();
  }
  const profile = await getAuthenticatedProfile(req.auth.userId, req.auth.shopId);
  sendSuccess(req, res, profile, 200);
}
