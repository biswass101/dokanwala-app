import {
  addPoisha,
  addQuantities,
  calculateLineCogsPoisha,
  calculateLineTotalPoisha,
  calculateMovingWacBdt,
  calculateProportionalReturnDiscount,
  compareQuantities,
  convertToBaseQuantity,
  ErrorCodes,
  type SaleDto,
  type SaleReturnDto,
  subtractQuantities,
  type UserRole,
} from '@dokanwala/shared';
import { Decimal } from 'decimal.js';
import { prisma } from '../../database/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/app-error.js';
import {
  generateDailyNumber,
  lockInventoryBalancesForUpdate,
  requireIdempotencyKey,
  type RequestMeta,
} from './sales.helpers.js';
import type { CancelSaleInput, CreateSaleReturnInput } from './sales.schema.js';
import { saleInclude, toSaleDto, toSaleReturnDto } from './sales.types.js';

export async function createSaleReturn(
  shopId: string,
  actorUserId: string,
  role: UserRole,
  saleId: string,
  input: CreateSaleReturnInput,
  meta: RequestMeta,
): Promise<{ sale: SaleDto; saleReturn: SaleReturnDto; idempotencyReplayed: boolean }> {
  const idempotencyKey = requireIdempotencyKey(meta.idempotencyKey);

  const existingReplay = await prisma.saleReturn.findUnique({
    where: {
      shopId_idempotencyKey: {
        shopId,
        idempotencyKey,
      },
    },
  });

  if (existingReplay) {
    if (existingReplay.saleId !== saleId) {
      throw new ConflictError(
        'Idempotency key was already used for a different sale return',
        ErrorCodes.DUPLICATE_RESOURCE,
      );
    }
    const sale = await prisma.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: saleInclude,
    });
    const dto = toSaleDto(sale, role);
    const returnDto = dto.returns.find((r) => r.id === existingReplay.id);
    if (!returnDto) {
      throw new NotFoundError('Replayed sale return not found');
    }
    return {
      sale: dto,
      saleReturn: returnDto,
      idempotencyReplayed: true,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const lockedSaleRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM sales
        WHERE id = ${saleId}::uuid AND shop_id = ${shopId}::uuid
        FOR UPDATE
      `;
      if (!lockedSaleRows[0]) {
        throw new NotFoundError('Sale invoice not found');
      }

      const sale = await tx.sale.findUniqueOrThrow({
        where: { id: saleId },
        include: saleInclude,
      });

      if (sale.status === 'CANCELLED') {
        throw new BusinessRuleError(
          'Cancelled sales cannot be returned',
          ErrorCodes.BUSINESS_RULE_VIOLATION,
        );
      }
      if (sale.status === 'RETURNED') {
        throw new BusinessRuleError(
          'All items on this sale have already been returned',
          ErrorCodes.RETURN_EXCEEDS_SOLD,
        );
      }

      const saleItemMap = new Map(sale.items.map((item) => [item.id, item]));
      const returnBaseDeltaByItem = new Map<string, Decimal>();

      const preparedReturnLines: Array<{
        saleItemId: string;
        productId: string;
        qtyDisplay: string;
        qtyBase: string;
        qtyBaseDec: Decimal;
        unitSellingPricePoisha: number;
        unitCostAtSaleBdt: string;
        lineRefundPoisha: number;
        restoredCogsPoisha: number;
        nextReturnedQtyBase: string;
      }> = [];

      let returnSubtotalPoisha = 0;

      for (const reqItem of input.items) {
        const saleItem = saleItemMap.get(reqItem.saleItemId);
        if (!saleItem) {
          throw new NotFoundError('Referenced sale item not found on this invoice', {
            saleItemId: reqItem.saleItemId,
          });
        }

        const factorStr = saleItem.conversionFactorToBase.toFixed(4);
        const qtyBaseStr = convertToBaseQuantity(reqItem.qtyDisplay, factorStr);
        const qtyBaseDec = new Decimal(qtyBaseStr);

        const soldBaseStr = saleItem.qtyBase.toFixed(4);
        const prevReturnedBaseStr = saleItem.returnedQtyBase.toFixed(4);
        const remainingBaseStr = subtractQuantities(soldBaseStr, prevReturnedBaseStr);

        if (compareQuantities(qtyBaseStr, remainingBaseStr) > 0) {
          throw new ConflictError(
            `Return quantity exceeds remaining sold quantity for ${saleItem.productNameBn}`,
            ErrorCodes.RETURN_EXCEEDS_SOLD,
            {
              saleItemId: saleItem.id,
              productId: saleItem.productId,
              requestedBase: qtyBaseStr,
              remainingBase: remainingBaseStr,
            },
          );
        }

        const nextReturnedBaseStr = addQuantities(prevReturnedBaseStr, qtyBaseStr);
        returnBaseDeltaByItem.set(saleItem.id, qtyBaseDec);

        const rawLineGross = calculateLineTotalPoisha(
          reqItem.qtyDisplay,
          saleItem.unitSellingPricePoisha,
        );
        const prevReturnedItemValue = sale.returns.reduce(
          (sum, ret) =>
            sum +
            ret.items
              .filter((ri) => ri.saleItemId === saleItem.id)
              .reduce((riSum, ri) => riSum + ri.lineRefundPoisha, 0),
          0,
        );
        const remainingItemValue = Math.max(0, saleItem.lineSubtotalPoisha - prevReturnedItemValue);
        const isCompletingItem = compareQuantities(nextReturnedBaseStr, soldBaseStr) === 0;
        const lineRefundPoisha = isCompletingItem
          ? remainingItemValue
          : Math.min(rawLineGross, remainingItemValue);

        const costBdtStr = saleItem.unitCostAtSaleBdt.toFixed(6);
        const restoredCogsPoisha = calculateLineCogsPoisha(qtyBaseStr, costBdtStr);

        returnSubtotalPoisha = addPoisha(returnSubtotalPoisha, lineRefundPoisha);

        preparedReturnLines.push({
          saleItemId: saleItem.id,
          productId: saleItem.productId,
          qtyDisplay: reqItem.qtyDisplay,
          qtyBase: qtyBaseStr,
          qtyBaseDec,
          unitSellingPricePoisha: saleItem.unitSellingPricePoisha,
          unitCostAtSaleBdt: costBdtStr,
          lineRefundPoisha,
          restoredCogsPoisha,
          nextReturnedQtyBase: nextReturnedBaseStr,
        });
      }

      const isFullRemainingReturn = sale.items.every((item) => {
        const delta = returnBaseDeltaByItem.get(item.id) ?? new Decimal(0);
        const nextTotalReturned = new Decimal(item.returnedQtyBase.toString()).plus(delta);
        return nextTotalReturned.comparedTo(new Decimal(item.qtyBase.toString())) === 0;
      });

      const alreadyDiscountAdjustedPoisha = sale.returns.reduce(
        (acc, ret) => acc + ret.discountAdjustmentPoisha,
        0,
      );

      const discountAdjustmentPoisha = calculateProportionalReturnDiscount({
        returnSubtotalPoisha,
        saleSubtotalPoisha: sale.subtotalPoisha,
        totalDiscountPoisha: sale.discountPoisha,
        alreadyDiscountAdjustedPoisha,
        isFullRemainingReturn,
      });

      const refundTotalPoisha = Math.max(0, returnSubtotalPoisha - discountAdjustmentPoisha);

      let cashRefundPoisha = 0;
      let creditAdjustedPoisha = 0;

      if (input.refundMethod === 'CREDIT_ADJUSTMENT') {
        if (sale.duePoisha < refundTotalPoisha) {
          throw new BusinessRuleError(
            'Credit adjustment refund exceeds remaining customer due on this sale',
            ErrorCodes.BUSINESS_RULE_VIOLATION,
            {
              duePoisha: sale.duePoisha,
              refundTotalPoisha,
            },
          );
        }
        creditAdjustedPoisha = refundTotalPoisha;
      } else {
        const netPaidCashPoisha = Math.max(0, sale.paidPoisha - sale.cashRefundedPoisha);
        cashRefundPoisha = Math.min(refundTotalPoisha, netPaidCashPoisha);
        creditAdjustedPoisha = refundTotalPoisha - cashRefundPoisha;
      }

      const uniqueProductIds = Array.from(
        new Set(preparedReturnLines.map((line) => line.productId)),
      ).sort();
      const balanceMap = await lockInventoryBalancesForUpdate(tx, shopId, uniqueProductIds);

      const returnedAt = new Date();
      const returnNumber = await generateDailyNumber(tx, {
        table: 'sale_returns',
        shopId,
        prefix: 'RET',
        date: returnedAt,
      });

      const saleReturn = await tx.saleReturn.create({
        data: {
          shopId,
          saleId: sale.id,
          returnNumber,
          refundMethod: input.refundMethod,
          subtotalPoisha: returnSubtotalPoisha,
          discountAdjustmentPoisha,
          refundTotalPoisha,
          cashRefundPoisha,
          creditAdjustedPoisha,
          reason: input.reason ?? null,
          idempotencyKey,
          actorUserId,
          returnedAt,
        },
      });

      await tx.saleReturnItem.createMany({
        data: preparedReturnLines.map((line) => ({
          shopId,
          saleReturnId: saleReturn.id,
          saleItemId: line.saleItemId,
          productId: line.productId,
          qtyDisplay: line.qtyDisplay,
          qtyBase: line.qtyBase,
          unitSellingPricePoisha: line.unitSellingPricePoisha,
          lineRefundPoisha: line.lineRefundPoisha,
          restoredCogsPoisha: line.restoredCogsPoisha,
        })),
      });

      for (const line of preparedReturnLines) {
        await tx.saleItem.update({
          where: { id: line.saleItemId },
          data: {
            returnedQtyBase: line.nextReturnedQtyBase,
          },
        });
      }

      for (const line of preparedReturnLines) {
        const bal = balanceMap.get(line.productId);
        if (!bal) continue;

        const nextQtyDec = bal.qtyDec
          .plus(line.qtyBaseDec)
          .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
        const nextAvgCostBdt = calculateMovingWacBdt({
          oldQtyBase: bal.qtyDec.toFixed(4),
          oldAvgCostBdt: bal.avgCostBdt,
          incomingQtyBase: line.qtyBase,
          incomingTotalCostPoisha: line.restoredCogsPoisha,
        });
        bal.qtyDec = nextQtyDec;
        bal.avgCostBdt = nextAvgCostBdt;

        await tx.stockMovement.create({
          data: {
            shopId,
            productId: line.productId,
            movementType: 'RETURN_IN',
            deltaQtyBase: line.qtyBase,
            balanceAfterBase: nextQtyDec.toFixed(4),
            unitCostBdt: line.unitCostAtSaleBdt,
            valuePoisha: line.restoredCogsPoisha,
            referenceType: 'SALE_RETURN',
            referenceId: saleReturn.id,
            reason: input.reason ?? returnNumber,
            actorUserId,
          },
        });
      }

      for (const productId of uniqueProductIds) {
        const bal = balanceMap.get(productId);
        if (!bal) continue;
        await tx.inventoryBalance.update({
          where: { productId },
          data: {
            qtyBase: bal.qtyDec.toFixed(4),
            avgCostPerBaseBdt: bal.avgCostBdt,
            version: { increment: 1 },
          },
        });
      }

      const nextStatus = isFullRemainingReturn ? 'RETURNED' : 'PARTIALLY_RETURNED';
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: nextStatus,
          returnedTotalPoisha: addPoisha(sale.returnedTotalPoisha, refundTotalPoisha),
          duePoisha: Math.max(0, sale.duePoisha - creditAdjustedPoisha),
          cashRefundedPoisha: addPoisha(sale.cashRefundedPoisha, cashRefundPoisha),
        },
      });

      if (sale.customerId) {
        const custRows = await tx.$queryRaw<
          Array<{
            id: string;
            total_purchased_poisha: number;
            total_paid_poisha: number;
            due_poisha: number;
          }>
        >`
          SELECT id, total_purchased_poisha, total_paid_poisha, due_poisha
          FROM customers
          WHERE id = ${sale.customerId}::uuid AND shop_id = ${shopId}::uuid
          FOR UPDATE
        `;
        const customer = custRows[0];
        if (customer) {
          await tx.customer.update({
            where: { id: customer.id },
            data: {
              totalPurchasedPoisha: Math.max(
                0,
                customer.total_purchased_poisha - refundTotalPoisha,
              ),
              totalPaidPoisha: Math.max(0, customer.total_paid_poisha - cashRefundPoisha),
              duePoisha: Math.max(0, customer.due_poisha - creditAdjustedPoisha),
              version: { increment: 1 },
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          shopId,
          actorUserId,
          deviceId: meta.deviceId ?? null,
          action: 'SALE_RETURNED',
          entityType: 'SaleReturn',
          entityId: saleReturn.id,
          afterJson: {
            saleId: sale.id,
            returnNumber,
            refundTotalPoisha,
            cashRefundPoisha,
            creditAdjustedPoisha,
            nextStatus,
          },
          ipAddress: meta.ipAddress ?? null,
        },
      });

      const refreshedSale = await tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: saleInclude,
      });

      const returnRow = refreshedSale.returns.find((r) => r.id === saleReturn.id);
      if (!returnRow) {
        throw new NotFoundError('Created sale return missing');
      }

      return {
        sale: toSaleDto(refreshedSale, role),
        saleReturn: toSaleReturnDto(returnRow, role),
        idempotencyReplayed: false,
      };
    });

    return result;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.saleReturn.findUnique({
        where: {
          shopId_idempotencyKey: {
            shopId,
            idempotencyKey,
          },
        },
      });
      if (winner && winner.saleId === saleId) {
        const sale = await prisma.sale.findUniqueOrThrow({
          where: { id: saleId },
          include: saleInclude,
        });
        const dto = toSaleDto(sale, role);
        const returnDto = dto.returns.find((r) => r.id === winner.id);
        if (returnDto) {
          return {
            sale: dto,
            saleReturn: returnDto,
            idempotencyReplayed: true,
          };
        }
      }
    }
    throw err;
  }
}

export async function cancelSale(
  shopId: string,
  actorUserId: string,
  role: UserRole,
  saleId: string,
  input: CancelSaleInput,
  meta: RequestMeta,
): Promise<{ sale: SaleDto; idempotencyReplayed: boolean }> {
  const idempotencyKey = requireIdempotencyKey(meta.idempotencyKey);

  const existingReplay = await prisma.sale.findUnique({
    where: {
      shopId_cancelIdempotencyKey: {
        shopId,
        cancelIdempotencyKey: idempotencyKey,
      },
    },
    include: saleInclude,
  });

  if (existingReplay) {
    if (existingReplay.id !== saleId) {
      throw new ConflictError(
        'Idempotency key was already used to cancel another sale',
        ErrorCodes.DUPLICATE_RESOURCE,
      );
    }
    return {
      sale: toSaleDto(existingReplay, role),
      idempotencyReplayed: true,
    };
  }

  const cancelled = await prisma.$transaction(async (tx) => {
    const lockedSaleRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM sales
      WHERE id = ${saleId}::uuid AND shop_id = ${shopId}::uuid
      FOR UPDATE
    `;
    if (!lockedSaleRows[0]) {
      throw new NotFoundError('Sale invoice not found');
    }

    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: saleInclude,
    });

    if (sale.status === 'CANCELLED') {
      throw new BusinessRuleError(
        'This sale has already been cancelled',
        ErrorCodes.BUSINESS_RULE_VIOLATION,
      );
    }
    if (sale.status !== 'COMPLETED') {
      throw new BusinessRuleError(
        'Sales with partial or full returns cannot be voided via cancellation',
        ErrorCodes.BUSINESS_RULE_VIOLATION,
      );
    }

    const uniqueProductIds = Array.from(new Set(sale.items.map((item) => item.productId))).sort();
    const balanceMap = await lockInventoryBalancesForUpdate(tx, shopId, uniqueProductIds);

    for (const item of sale.items) {
      const bal = balanceMap.get(item.productId);
      if (!bal) continue;
      const qtyBaseStr = item.qtyBase.toFixed(4);
      const nextQtyDec = bal.qtyDec
        .plus(new Decimal(qtyBaseStr))
        .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      const nextAvgCostBdt = calculateMovingWacBdt({
        oldQtyBase: bal.qtyDec.toFixed(4),
        oldAvgCostBdt: bal.avgCostBdt,
        incomingQtyBase: qtyBaseStr,
        incomingTotalCostPoisha: item.lineCogsPoisha,
      });
      bal.qtyDec = nextQtyDec;
      bal.avgCostBdt = nextAvgCostBdt;

      await tx.stockMovement.create({
        data: {
          shopId,
          productId: item.productId,
          movementType: 'RETURN_IN',
          deltaQtyBase: qtyBaseStr,
          balanceAfterBase: nextQtyDec.toFixed(4),
          unitCostBdt: item.unitCostAtSaleBdt.toFixed(6),
          valuePoisha: item.lineCogsPoisha,
          referenceType: 'SALE_CANCEL',
          referenceId: sale.id,
          reason: input.reason,
          actorUserId,
        },
      });
    }

    for (const productId of uniqueProductIds) {
      const bal = balanceMap.get(productId);
      if (!bal) continue;
      await tx.inventoryBalance.update({
        where: { productId },
        data: {
          qtyBase: bal.qtyDec.toFixed(4),
          avgCostPerBaseBdt: bal.avgCostBdt,
          version: { increment: 1 },
        },
      });
    }

    if (sale.customerId) {
      const custRows = await tx.$queryRaw<
        Array<{
          id: string;
          total_purchased_poisha: number;
          total_paid_poisha: number;
          due_poisha: number;
        }>
      >`
        SELECT id, total_purchased_poisha, total_paid_poisha, due_poisha
        FROM customers
        WHERE id = ${sale.customerId}::uuid AND shop_id = ${shopId}::uuid
        FOR UPDATE
      `;
      const customer = custRows[0];
      if (customer) {
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            totalPurchasedPoisha: Math.max(0, customer.total_purchased_poisha - sale.totalPoisha),
            totalPaidPoisha: Math.max(0, customer.total_paid_poisha - sale.paidPoisha),
            duePoisha: Math.max(0, customer.due_poisha - sale.duePoisha),
            version: { increment: 1 },
          },
        });
      }
    }

    const cancelledAt = new Date();
    const updated = await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: 'CANCELLED',
        cancelIdempotencyKey: idempotencyKey,
        cancelReason: input.reason,
        cancelledAt,
        cancelledByUserId: actorUserId,
        duePoisha: 0,
      },
      include: saleInclude,
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'SALE_CANCELLED',
        entityType: 'Sale',
        entityId: sale.id,
        beforeJson: {
          status: sale.status,
          totalPoisha: sale.totalPoisha,
          duePoisha: sale.duePoisha,
        },
        afterJson: {
          status: 'CANCELLED',
          cancelReason: input.reason,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    return updated;
  });

  return {
    sale: toSaleDto(cancelled, role),
    idempotencyReplayed: false,
  };
}
