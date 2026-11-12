import {
  addPoisha,
  calculateInventoryValuationPoisha,
  compareQuantities,
  convertToBaseQuantity,
  ErrorCodes,
  type InventoryValuationItemDto,
  type InventoryValuationSummaryDto,
  type PaginationMeta,
  type ProductDto,
  type StockAdjustmentDto,
  type StockMovementDto,
  type UserRole,
} from '@dokanwala/shared';
import { Decimal } from 'decimal.js';
import { prisma } from '../../database/prisma.js';
import type {
  Prisma,
  StockAdjustmentType,
  StockMovementType,
} from '../../generated/prisma/client.js';
import {
  AppError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../shared/errors/app-error.js';
import { getDhakaDayRangeUtc } from '../../shared/utils/timezone.js';
import { listProducts } from '../products/products.service.js';
import { productInclude, toProductDto } from '../products/products.types.js';
import { recordSyncChange } from '../sync/sync-change.helper.js';
import type {
  CreateStockAdjustmentInput,
  ListAdjustmentsQuery,
  ListMovementsQuery,
} from './inventory.schema.js';

interface RequestMeta {
  deviceId?: string;
  ipAddress?: string;
  idempotencyKey?: string;
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

type StockMovementWithRelations = Prisma.StockMovementGetPayload<{
  include: {
    product: { include: { baseUnit: true } };
    actorUser: { select: { id: true; name: true } };
  };
}>;

type StockAdjustmentWithRelations = Prisma.StockAdjustmentGetPayload<{
  include: {
    product: { select: { id: true; nameBn: true; nameEn: true } };
    actorUser: { select: { id: true; name: true } };
  };
}>;

function toStockMovementDto(row: StockMovementWithRelations, role: UserRole): StockMovementDto {
  const isOwner = role === 'OWNER';
  return {
    id: row.id,
    shopId: row.shopId,
    productId: row.productId,
    productNameBn: row.product.nameBn,
    productNameEn: row.product.nameEn,
    baseUnitNameBn: row.product.baseUnit.nameBn,
    baseUnitNameEn: row.product.baseUnit.nameEn,
    movementType: row.movementType,
    deltaQtyBase: row.deltaQtyBase.toFixed(4),
    balanceAfterBase: row.balanceAfterBase.toFixed(4),
    unitCostBdt: isOwner ? row.unitCostBdt.toFixed(6) : null,
    valuePoisha: isOwner ? row.valuePoisha : null,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    reason: row.reason,
    actorUserId: row.actorUserId,
    actorName: row.actorUser?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toStockAdjustmentDto(
  row: StockAdjustmentWithRelations,
  role: UserRole,
): StockAdjustmentDto {
  const isOwner = role === 'OWNER';
  return {
    id: row.id,
    shopId: row.shopId,
    productId: row.productId,
    productNameBn: row.product.nameBn,
    productNameEn: row.product.nameEn,
    adjustmentType: row.adjustmentType,
    qtyBase: row.qtyBase.toFixed(4),
    deltaQtyBase: row.deltaQtyBase.toFixed(4),
    unitCostBdt: isOwner ? row.unitCostBdt.toFixed(6) : null,
    lossPoisha: isOwner ? row.lossPoisha : null,
    reason: row.reason,
    actorUserId: row.actorUserId,
    actorName: row.actorUser?.name ?? null,
    adjustedAt: row.adjustedAt.toISOString(),
  };
}

function mapAdjustmentToMovementType(type: StockAdjustmentType): StockMovementType {
  switch (type) {
    case 'WASTAGE':
      return 'WASTAGE_OUT';
    case 'DAMAGE':
      return 'DAMAGE_OUT';
    case 'EXPIRED':
      return 'EXPIRED_OUT';
    case 'COUNT_ADJUST':
      return 'COUNT_ADJUST';
  }
}

export async function getLowStockAlerts(shopId: string, role: UserRole): Promise<ProductDto[]> {
  const { products } = await listProducts(shopId, role, {
    lowStockOnly: true,
    includeInactive: false,
    page: 1,
    limit: 200,
  });

  return products.sort((a, b) => {
    const qtyA = new Decimal(a.inventory.qtyBase);
    const qtyB = new Decimal(b.inventory.qtyBase);
    return qtyA.comparedTo(qtyB);
  });
}

export async function listStockMovements(
  shopId: string,
  role: UserRole,
  query: ListMovementsQuery,
): Promise<{ movements: StockMovementDto[]; pagination: PaginationMeta }> {
  const createdAtFilter: Prisma.DateTimeFilter = {};
  if (query.from) {
    createdAtFilter.gte = getDhakaDayRangeUtc(query.from).startUtc;
  }
  if (query.to) {
    createdAtFilter.lte = getDhakaDayRangeUtc(query.to).endUtc;
  }

  const where: Prisma.StockMovementWhereInput = {
    shopId,
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.type ? { movementType: query.type } : {}),
    ...(query.from || query.to ? { createdAt: createdAtFilter } : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [totalItems, rows] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      include: {
        product: { include: { baseUnit: true } },
        actorUser: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take: query.limit,
    }),
  ]);

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.limit);

  return {
    movements: rows.map((row) => toStockMovementDto(row, role)),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
    },
  };
}

export async function listStockAdjustments(
  shopId: string,
  role: UserRole,
  query: ListAdjustmentsQuery,
): Promise<{ adjustments: StockAdjustmentDto[]; pagination: PaginationMeta }> {
  const where: Prisma.StockAdjustmentWhereInput = {
    shopId,
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.adjustmentType ? { adjustmentType: query.adjustmentType } : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [totalItems, rows] = await Promise.all([
    prisma.stockAdjustment.count({ where }),
    prisma.stockAdjustment.findMany({
      where,
      include: {
        product: { select: { id: true, nameBn: true, nameEn: true } },
        actorUser: { select: { id: true, name: true } },
      },
      orderBy: [{ adjustedAt: 'desc' }],
      skip,
      take: query.limit,
    }),
  ]);

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.limit);

  return {
    adjustments: rows.map((row) => toStockAdjustmentDto(row, role)),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
    },
  };
}

export async function getInventoryValuation(shopId: string): Promise<InventoryValuationSummaryDto> {
  const products = await prisma.product.findMany({
    where: {
      shopId,
      deletedAt: null,
      isActive: true,
    },
    include: {
      baseUnit: true,
      inventoryBalance: true,
    },
    orderBy: [{ nameBn: 'asc' }],
  });

  let totalValuationPoisha = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  const items: InventoryValuationItemDto[] = products.map((product) => {
    const qtyBase = product.inventoryBalance
      ? product.inventoryBalance.qtyBase.toFixed(4)
      : '0.0000';
    const avgCostPerBaseBdt = product.inventoryBalance
      ? product.inventoryBalance.avgCostPerBaseBdt.toFixed(6)
      : '0.000000';
    const valuationPoisha = calculateInventoryValuationPoisha(qtyBase, avgCostPerBaseBdt);
    const lowStockThresholdBase = product.lowStockThresholdBase.toFixed(4);
    const isLowStock = compareQuantities(qtyBase, lowStockThresholdBase) <= 0;

    if (isLowStock) {
      lowStockCount += 1;
    }
    if (compareQuantities(qtyBase, '0') <= 0) {
      outOfStockCount += 1;
    }
    totalValuationPoisha = addPoisha(totalValuationPoisha, valuationPoisha);

    return {
      productId: product.id,
      nameBn: product.nameBn,
      nameEn: product.nameEn,
      baseUnitNameBn: product.baseUnit.nameBn,
      baseUnitNameEn: product.baseUnit.nameEn,
      qtyBase,
      avgCostPerBaseBdt,
      valuationPoisha,
      lowStockThresholdBase,
      isLowStock,
    };
  });

  return {
    totalValuationPoisha,
    totalActiveProducts: products.length,
    lowStockCount,
    outOfStockCount,
    items,
  };
}

export async function createStockAdjustment(
  shopId: string,
  actorUserId: string,
  role: UserRole,
  input: CreateStockAdjustmentInput,
  meta: RequestMeta,
): Promise<{
  adjustment: StockAdjustmentDto;
  product: ProductDto;
  idempotencyReplayed: boolean;
}> {
  const normalizedIdemKey = meta.idempotencyKey?.trim() || null;

  if (normalizedIdemKey) {
    const existingAdj = await prisma.stockAdjustment.findUnique({
      where: {
        shopId_idempotencyKey: {
          shopId,
          idempotencyKey: normalizedIdemKey,
        },
      },
      include: {
        product: { select: { id: true, nameBn: true, nameEn: true } },
        actorUser: { select: { id: true, name: true } },
      },
    });

    if (existingAdj) {
      const currentProduct = await prisma.product.findUniqueOrThrow({
        where: { id: existingAdj.productId },
        include: productInclude,
      });
      return {
        adjustment: toStockAdjustmentDto(existingAdj, role),
        product: toProductDto(currentProduct, role),
        idempotencyReplayed: true,
      };
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const shop = await tx.shop.findUnique({
      where: { id: shopId },
      select: { allowNegativeStock: true },
    });
    if (!shop) {
      throw new NotFoundError('Shop not found');
    }

    const product = await tx.product.findFirst({
      where: {
        id: input.productId,
        shopId,
        deletedAt: null,
      },
      include: {
        productUnits: {
          where: { isActive: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    const unitRule = product.productUnits.find((pu) => pu.unitId === input.unitId);
    if (!unitRule) {
      throw new InvalidUnitConversionError('Selected unit is not configured for this product', {
        unitId: input.unitId,
      });
    }

    const lockedRows = await tx.$queryRaw<
      Array<{
        product_id: string;
        qty_base: Prisma.Decimal;
        avg_cost_per_base_bdt: Prisma.Decimal;
      }>
    >`
      SELECT product_id, qty_base, avg_cost_per_base_bdt
      FROM inventory_balances
      WHERE product_id = ${product.id}::uuid AND shop_id = ${shopId}::uuid
      FOR UPDATE
    `;

    const lockedBalance = lockedRows[0];
    if (!lockedBalance) {
      throw new NotFoundError('Inventory balance record missing for product');
    }

    const currentQtyDec = new Decimal(lockedBalance.qty_base.toString());
    const avgCostStr = new Decimal(lockedBalance.avg_cost_per_base_bdt.toString()).toFixed(6);
    const factorStr = unitRule.conversionFactorToBase.toFixed(4);

    let deltaDec: Decimal;
    let absQtyBaseStr: string;

    if (input.adjustmentType === 'COUNT_ADJUST' && input.countedQtyDisplay !== undefined) {
      const targetBaseStr = convertToBaseQuantity(input.countedQtyDisplay, factorStr);
      const targetBaseDec = new Decimal(targetBaseStr);
      deltaDec = targetBaseDec.minus(currentQtyDec).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      if (deltaDec.isZero()) {
        throw new BusinessRuleError(
          'Physical count matches current stock; no adjustment needed',
          ErrorCodes.BUSINESS_RULE_VIOLATION,
          { currentQtyBase: currentQtyDec.toFixed(4) },
        );
      }
      absQtyBaseStr = deltaDec.abs().toFixed(4);
    } else {
      absQtyBaseStr = convertToBaseQuantity(input.qtyDisplay ?? '0', factorStr);
      const magnitudeDec = new Decimal(absQtyBaseStr);
      const isIncrease =
        input.adjustmentType === 'COUNT_ADJUST' && input.direction === 'INCREASE';
      deltaDec = isIncrease ? magnitudeDec : magnitudeDec.negated();
    }

    const nextQtyDec = currentQtyDec.plus(deltaDec).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

    if (deltaDec.isNegative() && nextQtyDec.isNegative() && !shop.allowNegativeStock) {
      throw new ConflictError(
        'Insufficient stock for this adjustment',
        ErrorCodes.INSUFFICIENT_STOCK,
        {
          productId: product.id,
          requestedBase: absQtyBaseStr,
          availableBase: currentQtyDec.toFixed(4),
        },
      );
    }

    const lossPoisha = deltaDec.isNegative()
      ? calculateInventoryValuationPoisha(absQtyBaseStr, avgCostStr)
      : 0;

    const deltaQtyBaseStr = deltaDec.toFixed(4);
    const nextQtyBaseStr = nextQtyDec.toFixed(4);

    await tx.inventoryBalance.update({
      where: { productId: product.id },
      data: {
        qtyBase: nextQtyBaseStr,
        version: { increment: 1 },
      },
    });

    const adjustment = await tx.stockAdjustment.create({
      data: {
        shopId,
        productId: product.id,
        adjustmentType: input.adjustmentType,
        qtyBase: absQtyBaseStr,
        deltaQtyBase: deltaQtyBaseStr,
        unitCostBdt: avgCostStr,
        lossPoisha,
        reason: input.reason ?? null,
        idempotencyKey: normalizedIdemKey,
        actorUserId,
      },
      include: {
        product: { select: { id: true, nameBn: true, nameEn: true } },
        actorUser: { select: { id: true, name: true } },
      },
    });

    await tx.stockMovement.create({
      data: {
        shopId,
        productId: product.id,
        movementType: mapAdjustmentToMovementType(input.adjustmentType),
        deltaQtyBase: deltaQtyBaseStr,
        balanceAfterBase: nextQtyBaseStr,
        unitCostBdt: avgCostStr,
        valuePoisha: lossPoisha,
        referenceType: 'STOCK_ADJUSTMENT',
        referenceId: adjustment.id,
        reason: input.reason ?? null,
        actorUserId,
      },
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: `INVENTORY_${input.adjustmentType}`,
        entityType: 'StockAdjustment',
        entityId: adjustment.id,
        beforeJson: { qtyBase: currentQtyDec.toFixed(4) },
        afterJson: {
          qtyBase: nextQtyBaseStr,
          deltaQtyBase: deltaQtyBaseStr,
          lossPoisha,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    const updatedProduct = await tx.product.findUniqueOrThrow({
      where: { id: product.id },
      include: productInclude,
    });

    await recordSyncChange(tx, {
      shopId,
      entityType: 'PRODUCT',
      entityId: product.id,
    });

    return {
      adjustment: toStockAdjustmentDto(adjustment, role),
      product: toProductDto(updatedProduct, role),
      idempotencyReplayed: false,
    };
  });

  return result;
}
