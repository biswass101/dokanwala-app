import { ErrorCodes, type UnitDto } from '@dokanwala/shared';
import { prisma } from '../../database/prisma.js';
import type { Unit } from '../../generated/prisma/client.js';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error.js';
import { ensureDefaultCatalogForShop } from '../catalog/catalog.seed.js';
import { recordSyncChange } from '../sync/sync-change.helper.js';
import type { CreateUnitInput, UpdateUnitInput } from './units.schema.js';

interface RequestMeta {
  deviceId?: string;
  ipAddress?: string;
}

function toUnitDto(unit: Unit): UnitDto {
  return {
    id: unit.id,
    shopId: unit.shopId,
    code: unit.code,
    nameBn: unit.nameBn,
    nameEn: unit.nameEn,
    isFractional: unit.isFractional,
    isDefault: unit.isDefault,
    createdAt: unit.createdAt.toISOString(),
    updatedAt: unit.updatedAt.toISOString(),
  };
}

export async function listUnits(shopId: string): Promise<UnitDto[]> {
  await ensureDefaultCatalogForShop(shopId);

  const units = await prisma.unit.findMany({
    where: { shopId },
    orderBy: [{ isDefault: 'desc' }, { nameEn: 'asc' }],
  });

  return units.map(toUnitDto);
}

export async function createUnit(
  shopId: string,
  actorUserId: string,
  input: CreateUnitInput,
  meta: RequestMeta,
): Promise<UnitDto> {
  const existing = await prisma.unit.findUnique({
    where: {
      shopId_code: {
        shopId,
        code: input.code,
      },
    },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(
      'A unit with this code already exists in your shop',
      ErrorCodes.DUPLICATE_RESOURCE,
      { field: 'code' },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.create({
      data: {
        shopId,
        code: input.code,
        nameBn: input.nameBn,
        nameEn: input.nameEn,
        isFractional: input.isFractional,
        isDefault: false,
      },
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'UNIT_CREATED',
        entityType: 'Unit',
        entityId: unit.id,
        afterJson: {
          code: unit.code,
          nameBn: unit.nameBn,
          nameEn: unit.nameEn,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    await recordSyncChange(tx, {
      shopId,
      entityType: 'UNIT',
      entityId: unit.id,
    });

    return unit;
  });

  return toUnitDto(created);
}

export async function updateUnit(
  shopId: string,
  actorUserId: string,
  unitId: string,
  input: UpdateUnitInput,
  meta: RequestMeta,
): Promise<UnitDto> {
  const existing = await prisma.unit.findFirst({
    where: {
      id: unitId,
      shopId,
    },
  });

  if (!existing) {
    throw new NotFoundError('Unit not found');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.unit.update({
      where: { id: existing.id },
      data: {
        ...(input.nameBn !== undefined ? { nameBn: input.nameBn } : {}),
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
        ...(input.isFractional !== undefined ? { isFractional: input.isFractional } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'UNIT_UPDATED',
        entityType: 'Unit',
        entityId: existing.id,
        beforeJson: { nameBn: existing.nameBn, nameEn: existing.nameEn },
        afterJson: { nameBn: saved.nameBn, nameEn: saved.nameEn },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    await recordSyncChange(tx, {
      shopId,
      entityType: 'UNIT',
      entityId: saved.id,
    });

    return saved;
  });

  return toUnitDto(updated);
}
