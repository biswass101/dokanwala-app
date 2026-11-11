import crypto from 'node:crypto';
import type { UserRole } from '@dokanwala/shared';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export interface AccessTokenClaims {
  sub: string;
  shopId: string;
  role: UserRole;
  sessionId: string;
  type: 'access';
}

export function signAccessToken(payload: Omit<AccessTokenClaims, 'type'>): string {
  return jwt.sign(
    {
      ...payload,
      type: 'access',
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN_SECONDS,
      issuer: env.APP_NAME,
    },
  );
}

export function verifyAccessToken(token: string): AccessTokenClaims | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: env.APP_NAME,
    });
    if (typeof decoded === 'string') {
      return null;
    }
    const claims = decoded as Partial<AccessTokenClaims>;
    if (
      claims.type !== 'access' ||
      typeof claims.sub !== 'string' ||
      typeof claims.shopId !== 'string' ||
      (claims.role !== 'OWNER' && claims.role !== 'EMPLOYEE') ||
      typeof claims.sessionId !== 'string'
    ) {
      return null;
    }
    return claims as AccessTokenClaims;
  } catch {
    return null;
  }
}

export function generateOpaqueRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function getRefreshTokenExpiryDate(from: Date = new Date()): Date {
  const expires = new Date(from.getTime());
  expires.setUTCDate(expires.getUTCDate() + env.REFRESH_TOKEN_EXPIRES_DAYS);
  return expires;
}
