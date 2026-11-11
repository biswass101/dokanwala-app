import {
  calculateLineTotalPoisha,
  calculateMovingWacBdt,
  convertToBaseQuantity,
  ErrorCodes,
  type PaginationMeta,
  type ProductDto,
  type UserRole,
} from '@dokanwala/shared';
import { Decimal } from 'decimal.js';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  AppError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../shared/errors/app-error.js';
import { ensureDefaultCatalogForShop } from '../catalog/catalog.seed.js';
import type {
  CreateProductInput,
  ListProductsQuery,
  ProductUnitRuleInput,
  ReplaceProductUnitsInput,
  UpdateProductInput,
} from './products.schema.js';
import { productInclude, toProductDto } from './products.types.js';

interface RequestMeta {
  deviceId?: string;
  ipAddress?: string;
}

class InvalidUnitConversionError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      statusCode: 400,
      code: ErrorCodes.INVALID_UNIT_CONVERSION,
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

async function assertUnitsBelongToShop(
  tx: Prisma.TransactionClient,
  shopId: string,
  unitIds: readonly string[],
): Promise<void> {
  const uniqueIds = Array.from(new Set(unitIds));
  if (uniqueIds.length === 0) return;

  const found = await tx.unit.findMany({
    where: {
      shopId,
      id: { in: uniqueIds },
    },
    select: { id: true },
  });

  if (found.length !== uniqueIds.length) {
    throw new InvalidUnitConversionError('One or more units do not belong to your shop');
  }
}

async function assertCategoryBelongsToShop(
  tx: Prisma.TransactionClient,
  shopId: string,
  categoryId: string | null | undefined,
): Promise<void> {
  if (!categoryId) return;
  const category = await tx.category.findFirst({
    where: {
      id: categoryId,
      shopId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!category) {
    throw new NotFoundError('Selected category not found in your shop');
  }
}

function normalizeAndValidateProductUnits(params: {
  baseUnitId: string;
  defaultSaleUnitId: string;
  defaultPurchaseUnitId: string;
  baseSellingPricePoisha: number;
  rules: readonly ProductUnitRuleInput[];
}): Array<{
  unitId: string;
  conversionFactorToBase: string;
  sellingPricePoisha: number | null;
}> {
  const map = new Map<
    string,
    { unitId: string; conversionFactorToBase: string; sellingPricePoisha: number | null }
  >();

  for (const rule of params.rules) {
    if (map.has(rule.unitId)) {
      throw new InvalidUnitConversionError('Duplicate unit rule provided for product', {
        unitId: rule.unitId,
      });
    }
    if (rule.unitId === params.baseUnitId) {
      if (new Decimal(rule.conversionFactorToBase).comparedTo(1) !== 0) {
        throw new InvalidUnitConversionError(
          'Base unit conversion factor must equal 1.0000',
          { unitId: rule.unitId },
        );
      }
      map.set(rule.unitId, {
        unitId: rule.unitId,
        conversionFactorToBase: '1.0000',
        sellingPricePoisha:
          rule.sellingPricePoisha !== undefined
            ? rule.sellingPricePoisha
            : params.baseSellingPricePoisha,
      });
      continue;
    }

    map.set(rule.unitId, {
      unitId: rule.unitId,
      conversionFactorToBase: rule.conversionFactorToBase,
      sellingPricePoisha: rule.sellingPricePoisha ?? null,
    });
  }

  if (!map.has(params.baseUnitId)) {
    map.set(params.baseUnitId, {
      unitId: params.baseUnitId,
      conversionFactorToBase: '1.0000',
      sellingPricePoisha: params.baseSellingPricePoisha,
    });
  }

  if (!map.has(params.defaultSaleUnitId)) {
    throw new InvalidUnitConversionError(
      'Default sale unit must be configured in product units or equal base unit',
      { unitId: params.defaultSaleUnitId },
    );
  }
  if (!map.has(params.defaultPurchaseUnitId)) {
    throw new InvalidUnitConversionError(
      'Default purchase unit must be configured in product units or equal base unit',
      { unitId: params.defaultPurchaseUnitId },
    );
  }

  return Array.from(map.values());
}

export async function listProducts(
  shopId: string,
  role: UserRole,
  query: ListProductsQuery,
): Promise<{ products: ProductDto[]; pagination: PaginationMeta }> {
  await ensureDefaultCatalogForShop(shopId);

  let lowStockIdsFilter: string[] | undefined;
  if (query.lowStockOnly) {
    const lowStockRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT p.id
      FROM products p
      INNER JOIN inventory_balances ib ON ib.product_id = p.id
      WHERE p.shop_id = ${shopId}::uuid
        AND p.deleted_at IS NULL
        AND ib.qty_base <= p.low_stock_threshold_base
    `;
    lowStockIdsFilter = lowStockRows.map((row) => row.id);
    if (lowStockIdsFilter.length === 0) {
      return {
        products: [],
        pagination: {
          page: query.page,
          limit: query.limit,
          totalItems: 0,
          totalPages: 0,
        },
      };
    }
  }

  const where: Prisma.ProductWhereInput = {
    shopId,
    deletedAt: null,
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(lowStockIdsFilter !== undefined ? { id: { in: lowStockIdsFilter } } : {}),
    ...(query.q && query.q.length > 0
      ? {
          OR: [
            { nameBn: { contains: query.q, mode: 'insensitive' } },
            { nameEn: { contains: query.q, mode: 'insensitive' } },
            { barcode: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [totalItems, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: [{ nameBn: 'asc' }, { createdAt: 'desc' }],
      skip,
      take: query.limit,
    }),
  ]);

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.limit);

  return {
    products: rows.map((row) => toProductDto(row, role)),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
    },
  };
}

export async function getProductById(
  shopId: string,
  role: UserRole,
  productId: string,
): Promise<ProductDto> {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      shopId,
      deletedAt: null,
    },
    include: productInclude,
  });

  if (!product) {
    throw new NotFoundError('Product not found');
  }

  return toProductDto(product, role);
}

export async function createProduct(
  shopId: string,
  actorUserId: string,
  role: UserRole,
  input: CreateProductInput,
  meta: RequestMeta,
): Promise<ProductDto> {
  await ensureDefaultCatalogForShop(shopId);

  const defaultSaleUnitId = input.defaultSaleUnitId ?? input.baseUnitId;
  const defaultPurchaseUnitId = input.defaultPurchaseUnitId ?? input.baseUnitId;

  if (input.barcode) {
    const duplicateBarcode = await prisma.product.findFirst({
      where: {
        shopId,
        barcode: input.barcode,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (duplicateBarcode) {
      throw new ConflictError(
        'A product with this barcode already exists in your shop',
        ErrorCodes.DUPLICATE_RESOURCE,
        { field: 'barcode' },
      );
    }
  }

  const normalizedUnits = normalizeAndValidateProductUnits({
    baseUnitId: input.baseUnitId,
    defaultSaleUnitId,
    defaultPurchaseUnitId,
    baseSellingPricePoisha: input.baseSellingPricePoisha,
    rules: input.units,
  });

  const allUnitIds = normalizedUnits.map((u) => u.unitId);
  if (input.openingStock) {
    allUnitIds.push(input.openingStock.unitId);
  }

  const created = await prisma.$transaction(async (tx) => {
    await assertCategoryBelongsToShop(tx, shopId, input.categoryId);
    await assertUnitsBelongToShop(tx, shopId, allUnitIds);

    const product = await tx.product.create({
      data: {
        ...(input.id !== undefined ? { id: input.id } : {}),
        shopId,
        categoryId: input.categoryId ?? null,
        nameBn: input.nameBn,
        nameEn: input.nameEn ?? null,
        barcode: input.barcode ?? null,
        imageUrl: input.imageUrl ?? null,
        defaultSupplierName: input.defaultSupplierName ?? null,
        baseUnitId: input.baseUnitId,
        defaultSaleUnitId,
        defaultPurchaseUnitId,
        baseSellingPricePoisha: input.baseSellingPricePoisha,
        lastPurchasePricePoisha: input.lastPurchasePricePoisha,
        lowStockThresholdBase: input.lowStockThresholdBase,
      },
    });

    await tx.productUnit.createMany({
      data: normalizedUnits.map((rule) => ({
        shopId,
        productId: product.id,
        unitId: rule.unitId,
        conversionFactorToBase: rule.conversionFactorToBase,
        sellingPricePoisha: rule.sellingPricePoisha,
      })),
    });

    let openingQtyBase = '0.0000';
    let initialAvgCostBdt = '0.000000';
    let openingTotalCostPoisha = 0;

    if (input.openingStock) {
      const openingUnitRule = normalizedUnits.find(
        (u) => u.unitId === input.openingStock?.unitId,
      );
      if (!openingUnitRule) {
        throw new InvalidUnitConversionError(
          'Opening stock unit must be configured in product units',
          { unitId: input.openingStock.unitId },
        );
      }

      openingQtyBase = convertToBaseQuantity(
        input.openingStock.qtyDisplay,
        openingUnitRule.conversionFactorToBase,
      );

      if (input.openingStock.totalCostPoisha !== undefined) {
        openingTotalCostPoisha = input.openingStock.totalCostPoisha;
      } else if (input.openingStock.unitCostPoisha !== undefined) {
        openingTotalCostPoisha = calculateLineTotalPoisha(
          input.openingStock.qtyDisplay,
          input.openingStock.unitCostPoisha,
        );
      } else if (input.lastPurchasePricePoisha > 0) {
        openingTotalCostPoisha = calculateLineTotalPoisha(
          openingQtyBase,
          input.lastPurchasePricePoisha,
        );
      }

      if (openingTotalCostPoisha > 0) {
        initialAvgCostBdt = calculateMovingWacBdt({
          oldQtyBase: '0',
          oldAvgCostBdt: '0',
          incomingQtyBase: openingQtyBase,
          incomingTotalCostPoisha: openingTotalCostPoisha,
        });
      }
    }

    await tx.inventoryBalance.create({
      data: {
        productId: product.id,
        shopId,
        qtyBase: openingQtyBase,
        avgCostPerBaseBdt: initialAvgCostBdt,
        version: 1,
      },
    });

    if (new Decimal(openingQtyBase).gt(0)) {
      await tx.stockMovement.create({
        data: {
          shopId,
          productId: product.id,
          movementType: 'OPENING_STOCK',
          deltaQtyBase: openingQtyBase,
          balanceAfterBase: openingQtyBase,
          unitCostBdt: initialAvgCostBdt,
          valuePoisha: openingTotalCostPoisha,
          referenceType: 'PRODUCT_OPENING',
          referenceId: product.id,
          reason: input.openingStock?.reason ?? null,
          actorUserId,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'PRODUCT_CREATED',
        entityType: 'Product',
        entityId: product.id,
        afterJson: {
          nameBn: product.nameBn,
          baseSellingPricePoisha: product.baseSellingPricePoisha,
          openingQtyBase,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    return tx.product.findUniqueOrThrow({
      where: { id: product.id },
      include: productInclude,
    });
  });

  return toProductDto(created, role);
}

export async function updateProduct(
  shopId: string,
  actorUserId: string,
  role: UserRole,
  productId: string,
  input: UpdateProductInput,
  meta: RequestMeta,
): Promise<ProductDto> {
  const existing = await prisma.product.findFirst({
    where: {
      id: productId,
      shopId,
      deletedAt: null,
    },
    include: productInclude,
  });

  if (!existing) {
    throw new NotFoundError('Product not found');
  }

  if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
    throw new ConflictError('Product was modified on another device', ErrorCodes.VERSION_CONFLICT, {
      serverState: toProductDto(existing, role),
    });
  }

  if (input.barcode !== undefined && input.barcode !== null && input.barcode !== existing.barcode) {
    const duplicateBarcode = await prisma.product.findFirst({
      where: {
        shopId,
        barcode: input.barcode,
        deletedAt: null,
        NOT: { id: existing.id },
      },
      select: { id: true },
    });
    if (duplicateBarcode) {
      throw new ConflictError(
        'A product with this barcode already exists in your shop',
        ErrorCodes.DUPLICATE_RESOURCE,
        { field: 'barcode' },
      );
    }
  }

  const nextBaseUnitId = input.baseUnitId ?? existing.baseUnitId;
  const nextDefaultSaleUnitId = input.defaultSaleUnitId ?? existing.defaultSaleUnitId;
  const nextDefaultPurchaseUnitId = input.defaultPurchaseUnitId ?? existing.defaultPurchaseUnitId;

  const updated = await prisma.$transaction(async (tx) => {
    await assertCategoryBelongsToShop(tx, shopId, input.categoryId);

    if (input.baseUnitId && input.baseUnitId !== existing.baseUnitId) {
      const movementCount = await tx.stockMovement.count({
        where: { shopId, productId: existing.id },
      });
      if (movementCount > 0) {
        throw new BusinessRuleError(
          'Base unit cannot be changed after stock movements have occurred',
          ErrorCodes.BUSINESS_RULE_VIOLATION,
          { productId: existing.id },
        );
      }

      await assertUnitsBelongToShop(tx, shopId, [input.baseUnitId]);
      await tx.productUnit.upsert({
        where: {
          productId_unitId: {
            productId: existing.id,
            unitId: input.baseUnitId,
          },
        },
        update: {
          conversionFactorToBase: '1.0000',
          isActive: true,
        },
        create: {
          shopId,
          productId: existing.id,
          unitId: input.baseUnitId,
          conversionFactorToBase: '1.0000',
          sellingPricePoisha: input.baseSellingPricePoisha ?? existing.baseSellingPricePoisha,
        },
      });
    }

    const configuredUnitIds = new Set(existing.productUnits.map((u) => u.unitId));
    configuredUnitIds.add(nextBaseUnitId);

    if (!configuredUnitIds.has(nextDefaultSaleUnitId)) {
      throw new InvalidUnitConversionError(
        'Default sale unit must be configured in product units first',
        { unitId: nextDefaultSaleUnitId },
      );
    }
    if (!configuredUnitIds.has(nextDefaultPurchaseUnitId)) {
      throw new InvalidUnitConversionError(
        'Default purchase unit must be configured in product units first',
        { unitId: nextDefaultPurchaseUnitId },
      );
    }

    await tx.product.update({
      where: { id: existing.id },
      data: {
        ...(input.nameBn !== undefined ? { nameBn: input.nameBn } : {}),
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.defaultSupplierName !== undefined
          ? { defaultSupplierName: input.defaultSupplierName }
          : {}),
        ...(input.baseUnitId !== undefined ? { baseUnitId: input.baseUnitId } : {}),
        ...(input.defaultSaleUnitId !== undefined
          ? { defaultSaleUnitId: input.defaultSaleUnitId }
          : {}),
        ...(input.defaultPurchaseUnitId !== undefined
          ? { defaultPurchaseUnitId: input.defaultPurchaseUnitId }
          : {}),
        ...(input.baseSellingPricePoisha !== undefined
          ? { baseSellingPricePoisha: input.baseSellingPricePoisha }
          : {}),
        ...(input.lastPurchasePricePoisha !== undefined
          ? { lastPurchasePricePoisha: input.lastPurchasePricePoisha }
          : {}),
        ...(input.lowStockThresholdBase !== undefined
          ? { lowStockThresholdBase: input.lowStockThresholdBase }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        version: { increment: 1 },
      },
    });

    if (input.baseSellingPricePoisha !== undefined) {
      await tx.productUnit.updateMany({
        where: {
          shopId,
          productId: existing.id,
          unitId: nextBaseUnitId,
        },
        data: {
          sellingPricePoisha: input.baseSellingPricePoisha,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'PRODUCT_UPDATED',
        entityType: 'Product',
        entityId: existing.id,
        beforeJson: {
          nameBn: existing.nameBn,
          baseSellingPricePoisha: existing.baseSellingPricePoisha,
          isActive: existing.isActive,
        },
        afterJson: {
          nameBn: input.nameBn ?? existing.nameBn,
          baseSellingPricePoisha:
            input.baseSellingPricePoisha ?? existing.baseSellingPricePoisha,
          isActive: input.isActive ?? existing.isActive,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    return tx.product.findUniqueOrThrow({
      where: { id: existing.id },
      include: productInclude,
    });
  });

  return toProductDto(updated, role);
}

export async function replaceProductUnits(
  shopId: string,
  actorUserId: string,
  role: UserRole,
  productId: string,
  input: ReplaceProductUnitsInput,
  meta: RequestMeta,
): Promise<ProductDto> {
  const existing = await prisma.product.findFirst({
    where: {
      id: productId,
      shopId,
      deletedAt: null,
    },
  });

  if (!existing) {
    throw new NotFoundError('Product not found');
  }

  const normalizedUnits = normalizeAndValidateProductUnits({
    baseUnitId: existing.baseUnitId,
    defaultSaleUnitId: existing.defaultSaleUnitId,
    defaultPurchaseUnitId: existing.defaultPurchaseUnitId,
    baseSellingPricePoisha: existing.baseSellingPricePoisha,
    rules: input.units,
  });

  const updated = await prisma.$transaction(async (tx) => {
    await assertUnitsBelongToShop(
      tx,
      shopId,
      normalizedUnits.map((u) => u.unitId),
    );

    const keepUnitIds = normalizedUnits.map((u) => u.unitId);

    await tx.productUnit.updateMany({
      where: {
        shopId,
        productId: existing.id,
        unitId: { notIn: keepUnitIds },
      },
      data: { isActive: false },
    });

    for (const rule of normalizedUnits) {
      await tx.productUnit.upsert({
        where: {
          productId_unitId: {
            productId: existing.id,
            unitId: rule.unitId,
          },
        },
        update: {
          conversionFactorToBase: rule.conversionFactorToBase,
          sellingPricePoisha: rule.sellingPricePoisha,
          isActive: true,
        },
        create: {
          shopId,
          productId: existing.id,
          unitId: rule.unitId,
          conversionFactorToBase: rule.conversionFactorToBase,
          sellingPricePoisha: rule.sellingPricePoisha,
          isActive: true,
        },
      });
    }

    await tx.product.update({
      where: { id: existing.id },
      data: { version: { increment: 1 } },
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'PRODUCT_UNITS_UPDATED',
        entityType: 'Product',
        entityId: existing.id,
        afterJson: { unitCount: normalizedUnits.length },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    return tx.product.findUniqueOrThrow({
      where: { id: existing.id },
      include: productInclude,
    });
  });

  return toProductDto(updated, role);
}

export async function archiveProduct(
  shopId: string,
  actorUserId: string,
  productId: string,
  meta: RequestMeta,
): Promise<{ archived: true; id: string }> {
  const existing = await prisma.product.findFirst({
    where: {
      id: productId,
      shopId,
      deletedAt: null,
    },
  });

  if (!existing) {
    throw new NotFoundError('Product not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: existing.id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        version: { increment: 1 },
      },
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'PRODUCT_ARCHIVED',
        entityType: 'Product',
        entityId: existing.id,
        beforeJson: { nameBn: existing.nameBn },
        ipAddress: meta.ipAddress ?? null,
      },
    });
  });

  return { archived: true, id: existing.id };
}
