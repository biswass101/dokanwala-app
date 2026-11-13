import {
  addPoisha,
  calculateDiscountPoisha,
  calculateLineCogsPoisha,
  calculateLineTotalPoisha,
  convertToBaseQuantity,
  doesDiscountExceedPercentCap,
  ErrorCodes,
  type SaleDto,
  type UserRole,
} from '@dokanwala/shared';
import { Decimal } from 'decimal.js';
import { prisma } from '../../database/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/app-error.js';
import { recordCashbookEntry } from '../cashbook/cashbook-ledger.helper.js';
import { recordSyncChange } from '../sync/sync-change.helper.js';
import {
  generateDailyNumber,
  InvalidUnitConversionError,
  lockInventoryBalancesForUpdate,
  requireIdempotencyKey,
  type RequestMeta,
} from './sales.helpers.js';
import type { CreateQuickSaleInput, CreateSaleInput } from './sales.schema.js';
import { saleInclude, toSaleDto } from './sales.types.js';

export interface CreateSaleSyncOptions {
  offlineItemPrices?: readonly number[];
  allowNegativeStockOverride?: boolean;
  offlineSoldAt?: string | null;
}

export async function createSale(
  shopId: string,
  actorUserId: string,
  role: UserRole,
  input: CreateSaleInput,
  meta: RequestMeta,
): Promise<{ sale: SaleDto; idempotencyReplayed: boolean }> {
  const result = await createSaleInternal(shopId, actorUserId, role, input, meta);
  return {
    sale: result.sale,
    idempotencyReplayed: result.idempotencyReplayed,
  };
}

export async function createSaleFromSync(
  shopId: string,
  actorUserId: string,
  role: UserRole,
  input: CreateSaleInput,
  meta: RequestMeta,
  syncOptions?: CreateSaleSyncOptions,
): Promise<{ sale: SaleDto; idempotencyReplayed: boolean; warnings: string[] }> {
  return createSaleInternal(shopId, actorUserId, role, input, meta, syncOptions);
}

async function createSaleInternal(
  shopId: string,
  actorUserId: string,
  role: UserRole,
  input: CreateSaleInput,
  meta: RequestMeta,
  syncOptions?: CreateSaleSyncOptions,
): Promise<{ sale: SaleDto; idempotencyReplayed: boolean; warnings: string[] }> {
  const idempotencyKey = requireIdempotencyKey(meta.idempotencyKey);

  const existingReplay = await prisma.sale.findUnique({
    where: {
      shopId_idempotencyKey: {
        shopId,
        idempotencyKey,
      },
    },
    include: saleInclude,
  });

  if (existingReplay) {
    return {
      sale: toSaleDto(existingReplay, role),
      idempotencyReplayed: true,
      warnings: [],
    };
  }

  try {
    const { createdSale, warnings } = await prisma.$transaction(async (tx) => {
      const txWarnings: string[] = [];
      const shop = await tx.shop.findUnique({
        where: { id: shopId },
        select: {
          allowNegativeStock: true,
          employeeCanGiveCredit: true,
          employeeMaxDiscountPercent: true,
        },
      });
      if (!shop) {
        throw new NotFoundError('Shop not found');
      }

      const uniqueProductIds = Array.from(
        new Set(input.items.map((item) => item.productId)),
      ).sort();

      const isOfflineSync = Boolean(syncOptions);
      const products = await tx.product.findMany({
        where: {
          shopId,
          id: { in: uniqueProductIds },
          ...(isOfflineSync ? {} : { deletedAt: null, isActive: true }),
        },
        include: {
          productUnits: {
            ...(isOfflineSync ? {} : { where: { isActive: true } }),
            include: { unit: true },
          },
        },
      });

      if (products.length !== uniqueProductIds.length) {
        const foundSet = new Set(products.map((p) => p.id));
        const missingId = uniqueProductIds.find((id) => !foundSet.has(id));
        throw new NotFoundError('One or more products were not found or are inactive', {
          ...(missingId ? { productId: missingId } : {}),
        });
      }

      const archivedProductsSold = isOfflineSync
        ? products
            .filter((p) => p.deletedAt !== null || !p.isActive)
            .map((p) => ({ productId: p.id, nameBn: p.nameBn }))
        : [];

      const productMap = new Map(products.map((p) => [p.id, p]));
      const balanceMap = await lockInventoryBalancesForUpdate(tx, shopId, uniqueProductIds);

      const totalRequestedBaseByProduct = new Map<string, Decimal>();
      const preparedLines: Array<{
        productId: string;
        unitId: string;
        productNameBn: string;
        productNameEn: string | null;
        unitNameBn: string;
        unitNameEn: string;
        qtyDisplay: string;
        conversionFactorToBase: string;
        qtyBase: string;
        qtyBaseDec: Decimal;
        unitSellingPricePoisha: number;
        unitCostAtSaleBdt: string;
        lineSubtotalPoisha: number;
        lineCogsPoisha: number;
      }> = [];

      let subtotalPoisha = 0;
      let totalCogsPoisha = 0;
      const priceVariances: Array<{
        productId: string;
        lineIndex: number;
        offlineUnitSellingPricePoisha: number;
        serverUnitSellingPricePoisha: number;
      }> = [];

      for (const [lineIdx, reqItem] of input.items.entries()) {
        const product = productMap.get(reqItem.productId);
        const bal = balanceMap.get(reqItem.productId);
        if (!product || !bal) {
          throw new NotFoundError('Product inventory record not found');
        }

        const unitRule = product.productUnits.find((pu) => pu.unitId === reqItem.unitId);
        if (!unitRule) {
          throw new InvalidUnitConversionError('Selected unit is not configured for this product', {
            productId: product.id,
            unitId: reqItem.unitId,
          });
        }

        const factorStr = unitRule.conversionFactorToBase.toFixed(4);
        const qtyBaseStr = convertToBaseQuantity(reqItem.qtyDisplay, factorStr);
        const qtyBaseDec = new Decimal(qtyBaseStr);

        const prevProductReq = totalRequestedBaseByProduct.get(product.id) ?? new Decimal(0);
        totalRequestedBaseByProduct.set(product.id, prevProductReq.plus(qtyBaseDec));

        const catalogPricePoisha =
          unitRule.sellingPricePoisha ??
          calculateLineTotalPoisha(factorStr, product.baseSellingPricePoisha);
        const serverUnitSellingPricePoisha =
          reqItem.unitPricePoisha !== undefined
            ? reqItem.unitPricePoisha
            : catalogPricePoisha;
        const offlineOverridePrice = syncOptions?.offlineItemPrices?.[lineIdx];
        const unitSellingPricePoisha =
          offlineOverridePrice !== undefined && offlineOverridePrice >= 0
            ? offlineOverridePrice
            : serverUnitSellingPricePoisha;

        if (
          offlineOverridePrice !== undefined &&
          offlineOverridePrice !== serverUnitSellingPricePoisha
        ) {
          priceVariances.push({
            productId: product.id,
            lineIndex: lineIdx,
            offlineUnitSellingPricePoisha: offlineOverridePrice,
            serverUnitSellingPricePoisha,
          });
        }

        const lineSubtotalPoisha =
          reqItem.lineTotalPoisha !== undefined
            ? reqItem.lineTotalPoisha
            : calculateLineTotalPoisha(
                reqItem.qtyDisplay,
                unitSellingPricePoisha,
              );
        const lineCogsPoisha = calculateLineCogsPoisha(qtyBaseStr, bal.avgCostBdt);

        subtotalPoisha = addPoisha(subtotalPoisha, lineSubtotalPoisha);
        totalCogsPoisha = addPoisha(totalCogsPoisha, lineCogsPoisha);

        preparedLines.push({
          productId: product.id,
          unitId: unitRule.unitId,
          productNameBn: product.nameBn,
          productNameEn: product.nameEn,
          unitNameBn: unitRule.unit.nameBn,
          unitNameEn: unitRule.unit.nameEn,
          qtyDisplay: reqItem.qtyDisplay,
          conversionFactorToBase: factorStr,
          qtyBase: qtyBaseStr,
          qtyBaseDec,
          unitSellingPricePoisha,
          unitCostAtSaleBdt: bal.avgCostBdt,
          lineSubtotalPoisha,
          lineCogsPoisha,
        });
      }

      const allowNegative = shop.allowNegativeStock || Boolean(syncOptions?.allowNegativeStockOverride);
      const stockDiscrepancies: Array<{
        productId: string;
        productNameBn: string;
        requestedBase: string;
        availableBase: string;
      }> = [];

      for (const [productId, requestedDec] of totalRequestedBaseByProduct.entries()) {
        const bal = balanceMap.get(productId);
        const product = productMap.get(productId);
        if (!bal || !product) continue;

        if (bal.qtyDec.lt(requestedDec)) {
          const isGeneralQuickSale =
            product.barcode === 'QUICK_SALE' || product.nameBn === 'সাধারণ বিক্রি';
          if (!allowNegative && !isGeneralQuickSale) {
            throw new ConflictError(
              `Insufficient stock for ${product.nameBn}`,
              ErrorCodes.INSUFFICIENT_STOCK,
              {
                productId,
                productNameBn: product.nameBn,
                requestedBase: requestedDec.toFixed(4),
                availableBase: bal.qtyDec.toFixed(4),
              },
            );
          }
          stockDiscrepancies.push({
            productId,
            productNameBn: product.nameBn,
            requestedBase: requestedDec.toFixed(4),
            availableBase: bal.qtyDec.toFixed(4),
          });
        }
      }

      const discountPoisha = calculateDiscountPoisha(
        subtotalPoisha,
        input.discountType,
        input.discountValue,
      );

      if (discountPoisha > subtotalPoisha) {
        throw new BusinessRuleError(
          'Discount cannot exceed sale subtotal',
          ErrorCodes.BUSINESS_RULE_VIOLATION,
          { subtotalPoisha, discountPoisha },
        );
      }

      if (
        role === 'EMPLOYEE' &&
        doesDiscountExceedPercentCap(
          subtotalPoisha,
          discountPoisha,
          shop.employeeMaxDiscountPercent,
        )
      ) {
        throw new ForbiddenError(
          `Employee discount cannot exceed ${String(shop.employeeMaxDiscountPercent)}%`,
          ErrorCodes.FORBIDDEN_ROLE,
          {
            maxDiscountPercent: shop.employeeMaxDiscountPercent,
            discountPoisha,
            subtotalPoisha,
          },
        );
      }

      const totalPoisha = subtotalPoisha - discountPoisha;

      let paidPoisha = 0;
      let cashPaidPoisha = 0;
      for (const payment of input.payments) {
        paidPoisha = addPoisha(paidPoisha, payment.amountPoisha);
        if (payment.method === 'CASH') {
          cashPaidPoisha = addPoisha(cashPaidPoisha, payment.amountPoisha);
        }
      }

      if (paidPoisha > totalPoisha) {
        throw new BusinessRuleError(
          'Total payments cannot exceed invoice total',
          ErrorCodes.BUSINESS_RULE_VIOLATION,
          { totalPoisha, paidPoisha },
        );
      }

      let changePoisha = 0;
      if (input.tenderedPoisha !== null && input.tenderedPoisha !== undefined) {
        if (input.tenderedPoisha < cashPaidPoisha) {
          throw new BusinessRuleError(
            'Tendered cash cannot be less than cash payment amount',
            ErrorCodes.BUSINESS_RULE_VIOLATION,
            { cashPaidPoisha, tenderedPoisha: input.tenderedPoisha },
          );
        }
        changePoisha = input.tenderedPoisha - cashPaidPoisha;
      }

      const duePoisha = totalPoisha - paidPoisha;

      if (duePoisha > 0) {
        if (!input.customerId) {
          throw new BusinessRuleError(
            'Credit or partial payment sales require selecting a customer',
            ErrorCodes.BUSINESS_RULE_VIOLATION,
            { duePoisha },
          );
        }
        if (role === 'EMPLOYEE' && !shop.employeeCanGiveCredit) {
          throw new ForbiddenError(
            'Employees are not permitted to make credit sales',
            ErrorCodes.FORBIDDEN_ROLE,
          );
        }
      }

      let customerNameSnapshot: string | null = null;
      if (input.customerId) {
        const custRows = await tx.$queryRaw<
          Array<{
            id: string;
            name_bn: string;
            total_purchased_poisha: number;
            total_paid_poisha: number;
            due_poisha: number;
            is_active: boolean;
            deleted_at: Date | null;
          }>
        >`
          SELECT id, name_bn, total_purchased_poisha, total_paid_poisha, due_poisha, is_active, deleted_at
          FROM customers
          WHERE id = ${input.customerId}::uuid AND shop_id = ${shopId}::uuid
          FOR UPDATE
        `;
        const customer = custRows[0];
        if (!customer || customer.deleted_at !== null || !customer.is_active) {
          throw new NotFoundError('Selected customer was not found or is inactive');
        }
        customerNameSnapshot = customer.name_bn;

        await tx.customer.update({
          where: { id: customer.id },
          data: {
            totalPurchasedPoisha: addPoisha(customer.total_purchased_poisha, totalPoisha),
            totalPaidPoisha: addPoisha(customer.total_paid_poisha, paidPoisha),
            duePoisha: addPoisha(customer.due_poisha, duePoisha),
            version: { increment: 1 },
          },
        });
      }

      const soldAt = input.soldAt
        ? new Date(input.soldAt)
        : syncOptions?.offlineSoldAt
          ? new Date(syncOptions.offlineSoldAt)
          : new Date();
      const receiptNumber = await generateDailyNumber(tx, {
        table: 'sales',
        shopId,
        prefix: 'INV',
        date: soldAt,
      });

      const sale = await tx.sale.create({
        data: {
          ...(input.id !== undefined ? { id: input.id } : {}),
          shopId,
          receiptNumber,
          customerId: input.customerId ?? null,
          customerNameSnapshot,
          status: 'COMPLETED',
          subtotalPoisha,
          discountType: input.discountType,
          discountValue: input.discountValue,
          discountPoisha,
          totalPoisha,
          paidPoisha,
          duePoisha,
          tenderedPoisha: input.tenderedPoisha ?? null,
          changePoisha,
          returnedTotalPoisha: 0,
          cashRefundedPoisha: 0,
          cogsPoisha: totalCogsPoisha,
          note: input.note ?? null,
          idempotencyKey,
          actorUserId,
          soldAt,
        },
      });

      await tx.saleItem.createMany({
        data: preparedLines.map((line) => ({
          shopId,
          saleId: sale.id,
          productId: line.productId,
          unitId: line.unitId,
          productNameBn: line.productNameBn,
          productNameEn: line.productNameEn,
          unitNameBn: line.unitNameBn,
          unitNameEn: line.unitNameEn,
          qtyDisplay: line.qtyDisplay,
          conversionFactorToBase: line.conversionFactorToBase,
          qtyBase: line.qtyBase,
          returnedQtyBase: '0.0000',
          unitSellingPricePoisha: line.unitSellingPricePoisha,
          unitCostAtSaleBdt: line.unitCostAtSaleBdt,
          lineSubtotalPoisha: line.lineSubtotalPoisha,
          lineCogsPoisha: line.lineCogsPoisha,
        })),
      });

      if (input.payments.length > 0) {
        await tx.payment.createMany({
          data: input.payments.map((p) => ({
            shopId,
            saleId: sale.id,
            method: p.method,
            amountPoisha: p.amountPoisha,
            reference: p.reference ?? null,
            receivedAt: soldAt,
          })),
        });

        for (const payment of input.payments) {
          await recordCashbookEntry(tx, {
            shopId,
            direction: 'IN',
            entryType: 'SALE_IN',
            method: payment.method,
            amountPoisha: payment.amountPoisha,
            referenceType: 'SALE',
            referenceId: sale.id,
            referenceNumber: receiptNumber,
            note: customerNameSnapshot ?? input.note ?? null,
            actorUserId,
            occurredAt: soldAt,
          });
        }
      }

      const runningBalanceByProduct = new Map<string, Decimal>(
        Array.from(balanceMap.entries()).map(([pid, b]) => [pid, b.qtyDec]),
      );

      for (const line of preparedLines) {
        const prevBal = runningBalanceByProduct.get(line.productId) ?? new Decimal(0);
        const nextBal = prevBal.minus(line.qtyBaseDec).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
        runningBalanceByProduct.set(line.productId, nextBal);

        await tx.stockMovement.create({
          data: {
            shopId,
            productId: line.productId,
            movementType: 'SALE_OUT',
            deltaQtyBase: line.qtyBaseDec.negated().toFixed(4),
            balanceAfterBase: nextBal.toFixed(4),
            unitCostBdt: line.unitCostAtSaleBdt,
            valuePoisha: line.lineCogsPoisha,
            referenceType: 'SALE',
            referenceId: sale.id,
            reason: receiptNumber,
            actorUserId,
          },
        });
      }

      for (const productId of uniqueProductIds) {
        const finalBal = runningBalanceByProduct.get(productId);
        if (!finalBal) continue;
        await tx.inventoryBalance.update({
          where: { productId },
          data: {
            qtyBase: finalBal.toFixed(4),
            version: { increment: 1 },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          shopId,
          actorUserId,
          deviceId: meta.deviceId ?? null,
          action: 'SALE_CREATED',
          entityType: 'Sale',
          entityId: sale.id,
          afterJson: {
            receiptNumber,
            totalPoisha,
            paidPoisha,
            duePoisha,
            itemCount: preparedLines.length,
          },
          ipAddress: meta.ipAddress ?? null,
        },
      });

      if (priceVariances.length > 0) {
        txWarnings.push('OFFLINE_PRICE_VARIANCE');
        await tx.auditLog.create({
          data: {
            shopId,
            actorUserId,
            deviceId: meta.deviceId ?? null,
            action: 'OFFLINE_PRICE_VARIANCE',
            entityType: 'Sale',
            entityId: sale.id,
            afterJson: { receiptNumber, priceVariances },
            ipAddress: meta.ipAddress ?? null,
          },
        });
      }

      if (stockDiscrepancies.length > 0) {
        txWarnings.push('LOW_STOCK_DISCREPANCY');
        await tx.auditLog.create({
          data: {
            shopId,
            actorUserId,
            deviceId: meta.deviceId ?? null,
            action: 'LOW_STOCK_DISCREPANCY',
            entityType: 'Sale',
            entityId: sale.id,
            afterJson: { receiptNumber, stockDiscrepancies },
            ipAddress: meta.ipAddress ?? null,
          },
        });
      }

      if (archivedProductsSold.length > 0) {
        txWarnings.push('ARCHIVED_PRODUCT_SOLD');
        await tx.auditLog.create({
          data: {
            shopId,
            actorUserId,
            deviceId: meta.deviceId ?? null,
            action: 'ARCHIVED_PRODUCT_SOLD',
            entityType: 'Sale',
            entityId: sale.id,
            afterJson: { receiptNumber, archivedProductsSold },
            ipAddress: meta.ipAddress ?? null,
          },
        });
      }

      await recordSyncChange(tx, {
        shopId,
        entityType: 'SALE',
        entityId: sale.id,
      });
      for (const productId of uniqueProductIds) {
        await recordSyncChange(tx, {
          shopId,
          entityType: 'PRODUCT',
          entityId: productId,
        });
      }
      if (input.customerId) {
        await recordSyncChange(tx, {
          shopId,
          entityType: 'CUSTOMER',
          entityId: input.customerId,
        });
      }

      const fullSale = await tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: saleInclude,
      });

      return { createdSale: fullSale, warnings: txWarnings };
    });

    return {
      sale: toSaleDto(createdSale, role),
      idempotencyReplayed: false,
      warnings,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.sale.findUnique({
        where: {
          shopId_idempotencyKey: {
            shopId,
            idempotencyKey,
          },
        },
        include: saleInclude,
      });
      if (winner) {
        return {
          sale: toSaleDto(winner, role),
          idempotencyReplayed: true,
          warnings: [],
        };
      }
    }
    throw err;
  }
}

async function ensureGeneralSaleProduct(
  tx: Prisma.TransactionClient,
  shopId: string,
): Promise<{ productId: string; unitId: string }> {
  const existing = await tx.product.findFirst({
    where: {
      shopId,
      deletedAt: null,
      OR: [{ barcode: 'QUICK_SALE' }, { nameBn: 'সাধারণ বিক্রি' }],
    },
    include: {
      productUnits: {
        where: { isActive: true },
        include: { unit: true },
      },
    },
  });

  if (existing && existing.productUnits.length > 0) {
    const unitId = existing.defaultSaleUnitId;
    const bal = await tx.inventoryBalance.findUnique({
      where: { productId: existing.id },
    });
    if (!bal) {
      await tx.inventoryBalance.create({
        data: {
          productId: existing.id,
          shopId,
          qtyBase: '999999.0000',
          avgCostPerBaseBdt: '0.000000',
          version: 1,
        },
      });
    }
    return { productId: existing.id, unitId };
  }

  let pieceUnit = await tx.unit.findFirst({
    where: { shopId, code: 'PIECE' },
  });
  if (!pieceUnit) {
    pieceUnit = await tx.unit.findFirst({ where: { shopId } });
  }
  if (!pieceUnit) {
    pieceUnit = await tx.unit.create({
      data: {
        shopId,
        code: 'PIECE',
        nameBn: 'টি',
        nameEn: 'Piece',
        isFractional: false,
        isDefault: true,
      },
    });
  }

  let category = await tx.category.findFirst({
    where: { shopId, nameBn: 'অন্যান্য', deletedAt: null },
  });
  if (!category) {
    category = await tx.category.findFirst({
      where: { shopId, deletedAt: null },
    });
  }
  if (!category) {
    category = await tx.category.create({
      data: {
        shopId,
        nameBn: 'অন্যান্য',
        nameEn: 'Miscellaneous',
        sortOrder: 99,
        isActive: true,
      },
    });
  }

  const created = await tx.product.create({
    data: {
      shopId,
      nameBn: 'সাধারণ বিক্রি',
      nameEn: 'General Sale',
      barcode: 'QUICK_SALE',
      categoryId: category.id,
      baseUnitId: pieceUnit.id,
      defaultSaleUnitId: pieceUnit.id,
      defaultPurchaseUnitId: pieceUnit.id,
      baseSellingPricePoisha: 0,
      lastPurchasePricePoisha: 0,
      lowStockThresholdBase: '0.0000',
      isActive: true,
      productUnits: {
        create: {
          shopId,
          unitId: pieceUnit.id,
          conversionFactorToBase: '1.0000',
          sellingPricePoisha: 0,
          isActive: true,
        },
      },
      inventoryBalance: {
        create: {
          shopId,
          qtyBase: '999999.0000',
          avgCostPerBaseBdt: '0.000000',
          version: 1,
        },
      },
    },
  });

  return { productId: created.id, unitId: pieceUnit.id };
}

export async function createQuickSale(
  shopId: string,
  actorUserId: string,
  role: UserRole,
  input: CreateQuickSaleInput,
  meta: RequestMeta,
): Promise<{ sale: SaleDto; idempotencyReplayed: boolean }> {
  let productId = input.productId;
  let unitId = input.unitId;

  if (!productId) {
    const general = await prisma.$transaction(async (tx) => {
      return ensureGeneralSaleProduct(tx, shopId);
    });
    productId = general.productId;
    unitId = general.unitId;
  } else if (!unitId) {
    const prod = await prisma.product.findUnique({
      where: { id: productId },
      select: { defaultSaleUnitId: true },
    });
    if (!prod) {
      throw new NotFoundError('Selected product not found');
    }
    unitId = prod.defaultSaleUnitId;
  }

  const totalSellingPricePoisha = input.totalSellingPricePoisha;
  const qtyDec = new Decimal(input.quantity);
  const unitPricePoisha = qtyDec.eq(1)
    ? totalSellingPricePoisha
    : Math.max(1, Math.round(new Decimal(totalSellingPricePoisha).dividedBy(qtyDec).toNumber()));

  const paidPoisha =
    input.paidPoisha !== undefined ? input.paidPoisha : totalSellingPricePoisha;

  if (paidPoisha < totalSellingPricePoisha && !input.customerId) {
    throw new BusinessRuleError(
      'Credit or partial payment sales require selecting a customer',
      ErrorCodes.BUSINESS_RULE_VIOLATION,
      { totalSellingPricePoisha, paidPoisha },
    );
  }

  const payments =
    paidPoisha > 0
      ? [
          {
            method: input.paymentMethod,
            amountPoisha: paidPoisha,
            reference: null,
          },
        ]
      : [];

  const saleInput: CreateSaleInput = {
    ...(input.id !== undefined ? { id: input.id } : {}),
    customerId: input.customerId ?? null,
    items: [
      {
        productId,
        unitId,
        qtyDisplay: input.quantity,
        unitPricePoisha,
        lineTotalPoisha: totalSellingPricePoisha,
      },
    ],
    discountType: 'FIXED_POISHA',
    discountValue: '0.00',
    payments,
    tenderedPoisha: input.paymentMethod === 'CASH' ? paidPoisha : null,
    note: input.note ?? null,
    soldAt: input.soldAt,
  };

  return createSale(shopId, actorUserId, role, saleInput, meta);
}

