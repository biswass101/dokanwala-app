import { ErrorCodes, type UserRole } from '@dokanwala/shared';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { prisma } from '../database/prisma.js';
import { verifyAccessToken } from '../modules/auth/auth.tokens.js';
import { ForbiddenError, UnauthorizedError } from '../shared/errors/app-error.js';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: {
    success: false,
    error: {
      code: ErrorCodes.RATE_LIMITED,
      message: 'Too many authentication attempts. Please try again later.',
      requestId: 'rate_limit',
    },
  },
});

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or malformed Bearer authorization header'));
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const claims = verifyAccessToken(token);
  if (!claims) {
    next(new UnauthorizedError('Invalid or expired access token'));
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    include: { shop: { select: { isActive: true } } },
  });

  if (
    !user ||
    !user.isActive ||
    user.deletedAt !== null ||
    !user.shop.isActive ||
    user.shopId !== claims.shopId
  ) {
    next(new UnauthorizedError('User account or shop session is no longer active'));
    return;
  }

  const deviceIdHeader = req.header('x-device-id')?.trim();

  req.auth = {
    userId: user.id,
    shopId: user.shopId,
    role: user.role,
    sessionId: claims.sessionId,
    ...(deviceIdHeader ? { deviceId: deviceIdHeader.slice(0, 120) } : {}),
  };

  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (!allowedRoles.includes(req.auth.role)) {
      next(
        new ForbiddenError('You do not have permission to perform this action', ErrorCodes.FORBIDDEN_ROLE, {
          requiredRoles: allowedRoles,
          currentRole: req.auth.role,
        }),
      );
      return;
    }

    next();
  };
}
