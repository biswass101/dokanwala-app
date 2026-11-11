import crypto from 'node:crypto';
import {
  ErrorCodes,
  type AuthSessionResponse,
  type AuthTokensDto,
  type AuthUserDto,
  type ShopProfileDto,
} from '@dokanwala/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../shared/errors/app-error.js';
import { hashSecret, verifySecret } from './auth.password.js';
import type {
  LoginInput,
  PinLoginInput,
  RegisterInput,
  SetPinInput,
} from './auth.schema.js';
import {
  generateOpaqueRefreshToken,
  getRefreshTokenExpiryDate,
  hashRefreshToken,
  signAccessToken,
} from './auth.tokens.js';
import { toAuthUserDto, toShopProfileDto } from './auth.types.js';

interface RequestMeta {
  deviceId?: string;
  ipAddress?: string;
}

function buildTokens(userId: string, shopId: string, role: 'OWNER' | 'EMPLOYEE', sessionId: string, rawRefreshToken: string): AuthTokensDto {
  const accessToken = signAccessToken({
    sub: userId,
    shopId,
    role,
    sessionId,
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresInSeconds: env.JWT_ACCESS_EXPIRES_IN_SECONDS,
  };
}

export async function registerShopAndOwner(
  input: RegisterInput,
  meta: RequestMeta,
): Promise<AuthSessionResponse> {
  if (!env.ALLOW_PUBLIC_REGISTRATION) {
    const existingShopCount = await prisma.shop.count();
    if (existingShopCount > 0) {
      throw new ForbiddenError(
        'Public shop registration is disabled on this server',
        ErrorCodes.FORBIDDEN_ROLE,
      );
    }
  }

  const existingUser = await prisma.user.findUnique({
    where: { phone: input.phone },
    select: { id: true },
  });
  if (existingUser) {
    throw new ConflictError(
      'An account with this phone number already exists',
      ErrorCodes.DUPLICATE_RESOURCE,
      { field: 'phone' },
    );
  }

  const passwordHash = await hashSecret(input.password);
  const pinHash = input.pin ? await hashSecret(input.pin) : null;
  const rawRefreshToken = generateOpaqueRefreshToken();
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const tokenFamily = crypto.randomUUID();
  const expiresAt = getRefreshTokenExpiryDate();

  const created = await prisma.$transaction(async (tx) => {
    const shop = await tx.shop.create({
      data: {
        nameBn: input.shopNameBn,
        nameEn: input.shopNameEn ?? null,
        addressBn: input.shopAddressBn ?? null,
        phone: input.phone,
        defaultLanguage: input.preferredLanguage,
        defaultDigitStyle: input.preferredDigitStyle,
      },
    });

    const user = await tx.user.create({
      data: {
        shopId: shop.id,
        name: input.ownerName,
        phone: input.phone,
        role: 'OWNER',
        passwordHash,
        pinHash,
        preferredLanguage: input.preferredLanguage,
        preferredDigitStyle: input.preferredDigitStyle,
      },
    });

    const session = await tx.refreshSession.create({
      data: {
        userId: user.id,
        shopId: shop.id,
        tokenFamily,
        tokenHash,
        deviceId: meta.deviceId ?? null,
        deviceName: input.deviceName ?? null,
        expiresAt,
      },
    });

    await tx.auditLog.create({
      data: {
        shopId: shop.id,
        actorUserId: user.id,
        deviceId: meta.deviceId ?? null,
        action: 'SHOP_REGISTERED',
        entityType: 'Shop',
        entityId: shop.id,
        afterJson: {
          shopNameBn: shop.nameBn,
          ownerPhone: user.phone,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    return { shop, user, session };
  });

  return {
    user: toAuthUserDto(created.user),
    shop: toShopProfileDto(created.shop),
    tokens: buildTokens(
      created.user.id,
      created.shop.id,
      created.user.role,
      created.session.id,
      rawRefreshToken,
    ),
  };
}

async function handleFailedLoginAttempt(
  userId: string,
  shopId: string,
  currentAttempts: number,
  meta: RequestMeta,
): Promise<never> {
  const nextAttempts = currentAttempts + 1;
  const shouldLock = nextAttempts >= env.AUTH_MAX_FAILED_ATTEMPTS;
  const lockedUntil = shouldLock
    ? new Date(Date.now() + env.AUTH_LOCKOUT_MINUTES * 60 * 1000)
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: nextAttempts,
        ...(lockedUntil !== null ? { lockedUntil } : {}),
      },
    });

    if (shouldLock) {
      await tx.auditLog.create({
        data: {
          shopId,
          actorUserId: userId,
          deviceId: meta.deviceId ?? null,
          action: 'ACCOUNT_LOCKED',
          entityType: 'User',
          entityId: userId,
          afterJson: {
            failedLoginAttempts: nextAttempts,
            lockedUntil: lockedUntil?.toISOString() ?? null,
          },
          ipAddress: meta.ipAddress ?? null,
        },
      });
    }
  });

  if (shouldLock && lockedUntil) {
    throw new ForbiddenError(
      'Account temporarily locked due to too many failed attempts',
      ErrorCodes.ACCOUNT_LOCKED,
      { lockedUntil: lockedUntil.toISOString() },
    );
  }

  throw new UnauthorizedError('Invalid credentials', ErrorCodes.INVALID_CREDENTIALS);
}

async function completeLoginSession(params: {
  userId: string;
  shopId: string;
  deviceName?: string;
  meta: RequestMeta;
}): Promise<{ sessionId: string; rawRefreshToken: string }> {
  const rawRefreshToken = generateOpaqueRefreshToken();
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const tokenFamily = crypto.randomUUID();
  const expiresAt = getRefreshTokenExpiryDate();

  const session = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: params.userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    return tx.refreshSession.create({
      data: {
        userId: params.userId,
        shopId: params.shopId,
        tokenFamily,
        tokenHash,
        deviceId: params.meta.deviceId ?? null,
        deviceName: params.deviceName ?? null,
        expiresAt,
      },
    });
  });

  return { sessionId: session.id, rawRefreshToken };
}

export async function loginWithPassword(
  input: LoginInput,
  meta: RequestMeta,
): Promise<AuthSessionResponse> {
  const user = await prisma.user.findUnique({
    where: { phone: input.phone },
    include: { shop: true },
  });

  if (!user || !user.isActive || user.deletedAt !== null || !user.shop.isActive) {
    throw new UnauthorizedError('Invalid credentials', ErrorCodes.INVALID_CREDENTIALS);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ForbiddenError(
      'Account temporarily locked due to too many failed attempts',
      ErrorCodes.ACCOUNT_LOCKED,
      { lockedUntil: user.lockedUntil.toISOString() },
    );
  }

  const valid = await verifySecret(user.passwordHash, input.password);
  if (!valid) {
    return handleFailedLoginAttempt(user.id, user.shopId, user.failedLoginAttempts, meta);
  }

  const { sessionId, rawRefreshToken } = await completeLoginSession({
    userId: user.id,
    shopId: user.shopId,
    ...(input.deviceName !== undefined ? { deviceName: input.deviceName } : {}),
    meta,
  });

  return {
    user: toAuthUserDto(user),
    shop: toShopProfileDto(user.shop),
    tokens: buildTokens(user.id, user.shopId, user.role, sessionId, rawRefreshToken),
  };
}

export async function loginWithPin(
  input: PinLoginInput,
  meta: RequestMeta,
): Promise<AuthSessionResponse> {
  const user = await prisma.user.findUnique({
    where: { phone: input.phone },
    include: { shop: true },
  });

  if (!user || !user.isActive || user.deletedAt !== null || !user.shop.isActive) {
    throw new UnauthorizedError('Invalid credentials', ErrorCodes.INVALID_CREDENTIALS);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ForbiddenError(
      'Account temporarily locked due to too many failed attempts',
      ErrorCodes.ACCOUNT_LOCKED,
      { lockedUntil: user.lockedUntil.toISOString() },
    );
  }

  if (!user.pinHash) {
    throw new UnauthorizedError('Quick PIN is not configured for this account', ErrorCodes.INVALID_CREDENTIALS);
  }

  const valid = await verifySecret(user.pinHash, input.pin);
  if (!valid) {
    return handleFailedLoginAttempt(user.id, user.shopId, user.failedLoginAttempts, meta);
  }

  const { sessionId, rawRefreshToken } = await completeLoginSession({
    userId: user.id,
    shopId: user.shopId,
    ...(input.deviceName !== undefined ? { deviceName: input.deviceName } : {}),
    meta,
  });

  return {
    user: toAuthUserDto(user),
    shop: toShopProfileDto(user.shop),
    tokens: buildTokens(user.id, user.shopId, user.role, sessionId, rawRefreshToken),
  };
}

export async function rotateRefreshSession(
  rawRefreshToken: string,
  meta: RequestMeta,
): Promise<AuthTokensDto> {
  const tokenHash = hashRefreshToken(rawRefreshToken);

  const existing = await prisma.refreshSession.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: { shop: true },
      },
    },
  });

  if (!existing) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  // Reuse of a revoked/rotated token indicates possible token theft -> revoke entire family
  if (existing.revokedAt !== null) {
    await prisma.$transaction(async (tx) => {
      await tx.refreshSession.updateMany({
        where: {
          tokenFamily: existing.tokenFamily,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          shopId: existing.shopId,
          actorUserId: existing.userId,
          deviceId: meta.deviceId ?? null,
          action: 'REFRESH_TOKEN_REUSE_DETECTED',
          entityType: 'RefreshSession',
          entityId: existing.id,
          ipAddress: meta.ipAddress ?? null,
        },
      });
    });

    throw new UnauthorizedError('Refresh token was already revoked');
  }

  const now = new Date();
  if (
    existing.expiresAt <= now ||
    !existing.user.isActive ||
    existing.user.deletedAt !== null ||
    !existing.user.shop.isActive
  ) {
    await prisma.refreshSession.update({
      where: { id: existing.id },
      data: { revokedAt: now },
    });
    throw new UnauthorizedError('Refresh session has expired or user is inactive');
  }

  const nextRawToken = generateOpaqueRefreshToken();
  const nextTokenHash = hashRefreshToken(nextRawToken);
  const nextExpiresAt = getRefreshTokenExpiryDate(now);

  const nextSession = await prisma.$transaction(async (tx) => {
    const created = await tx.refreshSession.create({
      data: {
        userId: existing.userId,
        shopId: existing.shopId,
        tokenFamily: existing.tokenFamily,
        tokenHash: nextTokenHash,
        deviceId: meta.deviceId ?? existing.deviceId,
        deviceName: existing.deviceName,
        expiresAt: nextExpiresAt,
      },
    });

    await tx.refreshSession.update({
      where: { id: existing.id },
      data: {
        revokedAt: now,
        replacedBySessionId: created.id,
      },
    });

    return created;
  });

  return buildTokens(
    existing.userId,
    existing.shopId,
    existing.user.role,
    nextSession.id,
    nextRawToken,
  );
}

export async function logoutSession(params: {
  userId: string;
  shopId: string;
  sessionId: string;
  rawRefreshToken?: string;
  meta: RequestMeta;
}): Promise<void> {
  const now = new Date();
  const tokenHash = params.rawRefreshToken ? hashRefreshToken(params.rawRefreshToken) : null;

  await prisma.$transaction(async (tx) => {
    await tx.refreshSession.updateMany({
      where: {
        userId: params.userId,
        revokedAt: null,
        OR: [
          { id: params.sessionId },
          ...(tokenHash ? [{ tokenHash }] : []),
        ],
      },
      data: { revokedAt: now },
    });

    await tx.auditLog.create({
      data: {
        shopId: params.shopId,
        actorUserId: params.userId,
        deviceId: params.meta.deviceId ?? null,
        action: 'LOGOUT',
        entityType: 'RefreshSession',
        entityId: params.sessionId,
        ipAddress: params.meta.ipAddress ?? null,
      },
    });
  });
}

export async function setQuickPin(
  userId: string,
  shopId: string,
  input: SetPinInput,
  meta: RequestMeta,
): Promise<AuthUserDto> {
  const user = await prisma.user.findFirst({
    where: { id: userId, shopId, deletedAt: null },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const passwordValid = await verifySecret(user.passwordHash, input.currentPassword);
  if (!passwordValid) {
    throw new UnauthorizedError('Current password is incorrect', ErrorCodes.INVALID_CREDENTIALS);
  }

  const newPinHash = await hashSecret(input.pin);

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.user.update({
      where: { id: user.id },
      data: { pinHash: newPinHash },
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId: user.id,
        deviceId: meta.deviceId ?? null,
        action: 'PIN_UPDATED',
        entityType: 'User',
        entityId: user.id,
        ipAddress: meta.ipAddress ?? null,
      },
    });

    return saved;
  });

  return toAuthUserDto(updated);
}

export async function getAuthenticatedProfile(
  userId: string,
  shopId: string,
): Promise<{ user: AuthUserDto; shop: ShopProfileDto }> {
  const user = await prisma.user.findFirst({
    where: { id: userId, shopId, deletedAt: null },
    include: { shop: true },
  });

  if (!user) {
    throw new NotFoundError('Authenticated profile not found');
  }

  return {
    user: toAuthUserDto(user),
    shop: toShopProfileDto(user.shop),
  };
}
