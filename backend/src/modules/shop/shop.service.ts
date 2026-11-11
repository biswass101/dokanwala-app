import {
  ErrorCodes,
  type ShopProfileDto,
  type StaffMemberDto,
} from '@dokanwala/shared';
import { prisma } from '../../database/prisma.js';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../shared/errors/app-error.js';
import { hashSecret } from '../auth/auth.password.js';
import { toShopProfileDto, toStaffMemberDto } from '../auth/auth.types.js';
import type {
  CreateEmployeeInput,
  UpdateShopInput,
  UpdateShopUserInput,
} from './shop.schema.js';

interface RequestMeta {
  deviceId?: string;
  ipAddress?: string;
}

export async function getShopProfile(shopId: string): Promise<ShopProfileDto> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
  });

  if (!shop || !shop.isActive) {
    throw new NotFoundError('Shop not found');
  }

  return toShopProfileDto(shop);
}

export async function updateShopProfile(
  shopId: string,
  actorUserId: string,
  input: UpdateShopInput,
  meta: RequestMeta,
): Promise<ShopProfileDto> {
  const existing = await prisma.shop.findUnique({
    where: { id: shopId },
  });

  if (!existing || !existing.isActive) {
    throw new NotFoundError('Shop not found');
  }

  const updateData = {
    ...(input.nameBn !== undefined ? { nameBn: input.nameBn } : {}),
    ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
    ...(input.addressBn !== undefined ? { addressBn: input.addressBn } : {}),
    ...(input.addressEn !== undefined ? { addressEn: input.addressEn } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.defaultLanguage !== undefined ? { defaultLanguage: input.defaultLanguage } : {}),
    ...(input.defaultDigitStyle !== undefined
      ? { defaultDigitStyle: input.defaultDigitStyle }
      : {}),
    ...(input.receiptHeaderBn !== undefined ? { receiptHeaderBn: input.receiptHeaderBn } : {}),
    ...(input.receiptFooterBn !== undefined ? { receiptFooterBn: input.receiptFooterBn } : {}),
    ...(input.allowNegativeStock !== undefined
      ? { allowNegativeStock: input.allowNegativeStock }
      : {}),
    ...(input.employeeCanGiveCredit !== undefined
      ? { employeeCanGiveCredit: input.employeeCanGiveCredit }
      : {}),
    ...(input.employeeMaxDiscountPercent !== undefined
      ? { employeeMaxDiscountPercent: input.employeeMaxDiscountPercent }
      : {}),
  };

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.shop.update({
      where: { id: shopId },
      data: updateData,
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'SHOP_UPDATED',
        entityType: 'Shop',
        entityId: shopId,
        beforeJson: {
          nameBn: existing.nameBn,
          allowNegativeStock: existing.allowNegativeStock,
          employeeCanGiveCredit: existing.employeeCanGiveCredit,
          employeeMaxDiscountPercent: existing.employeeMaxDiscountPercent,
        },
        afterJson: {
          nameBn: saved.nameBn,
          allowNegativeStock: saved.allowNegativeStock,
          employeeCanGiveCredit: saved.employeeCanGiveCredit,
          employeeMaxDiscountPercent: saved.employeeMaxDiscountPercent,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    return saved;
  });

  return toShopProfileDto(updated);
}

export async function listShopUsers(shopId: string): Promise<StaffMemberDto[]> {
  const users = await prisma.user.findMany({
    where: {
      shopId,
      deletedAt: null,
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });

  return users.map(toStaffMemberDto);
}

export async function createEmployeeAccount(
  shopId: string,
  actorUserId: string,
  input: CreateEmployeeInput,
  meta: RequestMeta,
): Promise<StaffMemberDto> {
  const duplicate = await prisma.user.findUnique({
    where: { phone: input.phone },
    select: { id: true },
  });
  if (duplicate) {
    throw new ConflictError(
      'An account with this phone number already exists',
      ErrorCodes.DUPLICATE_RESOURCE,
      { field: 'phone' },
    );
  }

  const passwordHash = await hashSecret(input.password);
  const pinHash = input.pin ? await hashSecret(input.pin) : null;

  const created = await prisma.$transaction(async (tx) => {
    const employee = await tx.user.create({
      data: {
        shopId,
        name: input.name,
        phone: input.phone,
        role: 'EMPLOYEE',
        passwordHash,
        pinHash,
        preferredLanguage: input.preferredLanguage,
        preferredDigitStyle: input.preferredDigitStyle,
      },
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'STAFF_CREATED',
        entityType: 'User',
        entityId: employee.id,
        afterJson: {
          name: employee.name,
          phone: employee.phone,
          role: employee.role,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    return employee;
  });

  return toStaffMemberDto(created);
}

export async function updateShopUser(
  shopId: string,
  actorUserId: string,
  targetUserId: string,
  input: UpdateShopUserInput,
  meta: RequestMeta,
): Promise<StaffMemberDto> {
  const target = await prisma.user.findFirst({
    where: {
      id: targetUserId,
      shopId,
      deletedAt: null,
    },
  });

  if (!target) {
    throw new NotFoundError('Staff member not found');
  }

  if (target.id === actorUserId && input.isActive === false) {
    throw new BusinessRuleError(
      'Owner cannot deactivate their own account',
      ErrorCodes.BUSINESS_RULE_VIOLATION,
    );
  }

  const nextPinHash =
    input.pin === undefined
      ? undefined
      : input.pin === null
        ? null
        : await hashSecret(input.pin);

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.user.update({
      where: { id: target.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(nextPinHash !== undefined ? { pinHash: nextPinHash } : {}),
        ...(input.preferredLanguage !== undefined
          ? { preferredLanguage: input.preferredLanguage }
          : {}),
        ...(input.preferredDigitStyle !== undefined
          ? { preferredDigitStyle: input.preferredDigitStyle }
          : {}),
      },
    });

    if (input.isActive === false) {
      await tx.refreshSession.updateMany({
        where: {
          userId: target.id,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'STAFF_UPDATED',
        entityType: 'User',
        entityId: target.id,
        beforeJson: {
          name: target.name,
          isActive: target.isActive,
        },
        afterJson: {
          name: saved.name,
          isActive: saved.isActive,
          pinUpdated: input.pin !== undefined,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    return saved;
  });

  return toStaffMemberDto(updated);
}
