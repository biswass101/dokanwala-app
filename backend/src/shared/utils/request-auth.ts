import type { Request } from 'express';
import { UnauthorizedError } from '../errors/app-error.js';
import type { AuthContext } from '../types/express.js';

export function requireRequestAuth(req: Request): AuthContext {
  if (!req.auth) {
    throw new UnauthorizedError('Authentication required');
  }
  return req.auth;
}

export function getRequestMeta(req: Request): {
  deviceId?: string;
  ipAddress?: string;
  idempotencyKey?: string;
} {
  const deviceIdHeader = req.headers['x-device-id'];
  const idemHeader = req.headers['x-idempotency-key'];
  const deviceId = typeof deviceIdHeader === 'string' ? deviceIdHeader : undefined;
  const idempotencyKey = typeof idemHeader === 'string' ? idemHeader : undefined;
  return {
    ...(deviceId !== undefined ? { deviceId } : {}),
    ...(req.ip !== undefined ? { ipAddress: req.ip } : {}),
    ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
  };
}
