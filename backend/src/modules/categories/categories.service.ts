import { ErrorCodes, type CategoryDto } from '@dokanwala/shared';
import { prisma } from '../../database/prisma.js';
import type { Category } from '../../generated/prisma/client.js';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error.js';
import { ensureDefaultCatalogForShop } from '../catalog/catalog.seed.js';
import { recordSyncChange } from '../sync/sync-change.helper.js';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.schema.js';

interface RequestMeta {
  deviceId?: string;
  ipAddress?: string;
}

function toCategoryDto(category: Category): CategoryDto {
  return {
    id: category.id,
    shopId: category.shopId,
    nameBn: category.nameBn,
    nameEn: category.nameEn,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export async function listCategories(
  shopId: string,
  includeInactive = false,
): Promise<CategoryDto[]> {
  await ensureDefaultCatalogForShop(shopId);

  const categories = await prisma.category.findMany({
    where: {
      shopId,
      deletedAt: null,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ sortOrder: 'asc' }, { nameBn: 'asc' }],
  });

  return categories.map(toCategoryDto);
}

export async function createCategory(
  shopId: string,
  actorUserId: string,
  input: CreateCategoryInput,
  meta: RequestMeta,
): Promise<CategoryDto> {
  const existing = await prisma.category.findFirst({
    where: {
      shopId,
      nameBn: input.nameBn,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(
      'A category with this Bangla name already exists',
      ErrorCodes.DUPLICATE_RESOURCE,
      { field: 'nameBn' },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const category = await tx.category.create({
      data: {
        shopId,
        nameBn: input.nameBn,
        nameEn: input.nameEn ?? null,
        sortOrder: input.sortOrder,
      },
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'CATEGORY_CREATED',
        entityType: 'Category',
        entityId: category.id,
        afterJson: {
          nameBn: category.nameBn,
          nameEn: category.nameEn,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    await recordSyncChange(tx, {
      shopId,
      entityType: 'CATEGORY',
      entityId: category.id,
    });

    return category;
  });

  return toCategoryDto(created);
}

export async function updateCategory(
  shopId: string,
  actorUserId: string,
  categoryId: string,
  input: UpdateCategoryInput,
  meta: RequestMeta,
): Promise<CategoryDto> {
  const existing = await prisma.category.findFirst({
    where: {
      id: categoryId,
      shopId,
      deletedAt: null,
    },
  });

  if (!existing) {
    throw new NotFoundError('Category not found');
  }

  if (input.nameBn !== undefined && input.nameBn !== existing.nameBn) {
    const duplicate = await prisma.category.findFirst({
      where: {
        shopId,
        nameBn: input.nameBn,
        deletedAt: null,
        NOT: { id: existing.id },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictError(
        'A category with this Bangla name already exists',
        ErrorCodes.DUPLICATE_RESOURCE,
        { field: 'nameBn' },
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.category.update({
      where: { id: existing.id },
      data: {
        ...(input.nameBn !== undefined ? { nameBn: input.nameBn } : {}),
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'CATEGORY_UPDATED',
        entityType: 'Category',
        entityId: existing.id,
        beforeJson: { nameBn: existing.nameBn, isActive: existing.isActive },
        afterJson: { nameBn: saved.nameBn, isActive: saved.isActive },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    await recordSyncChange(tx, {
      shopId,
      entityType: 'CATEGORY',
      entityId: saved.id,
    });

    return saved;
  });

  return toCategoryDto(updated);
}

export async function archiveCategory(
  shopId: string,
  actorUserId: string,
  categoryId: string,
  meta: RequestMeta,
): Promise<{ archived: true; id: string }> {
  const existing = await prisma.category.findFirst({
    where: {
      id: categoryId,
      shopId,
      deletedAt: null,
    },
  });

  if (!existing) {
    throw new NotFoundError('Category not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.category.update({
      where: { id: existing.id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    await tx.product.updateMany({
      where: {
        shopId,
        categoryId: existing.id,
      },
      data: {
        categoryId: null,
      },
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'CATEGORY_ARCHIVED',
        entityType: 'Category',
        entityId: existing.id,
        beforeJson: { nameBn: existing.nameBn },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    await recordSyncChange(tx, {
      shopId,
      entityType: 'CATEGORY',
      entityId: existing.id,
      action: 'DELETE',
    });
  });

  return { archived: true, id: existing.id };
}
