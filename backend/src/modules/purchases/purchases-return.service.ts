import {
  addPoisha,
  addQuantities,
  calculateLineTotalPoisha,
  calculateProportionalCostReversedPoisha,
  calculateProportionalReturnDiscount,
  calculatePurchaseReturnWacBdt,
  compareQuantities,
  convertToBaseQuantity,
  ErrorCodes,
  type PurchaseDto,
  type PurchaseReturnDto,
  subtractQuantities,
} from '@dokanwala/shared';
import { Decimal } from 'decimal.js';
import { prisma } from '../../database/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/app-error.js';
import {
  mapPurchaseRefundMethodToPaymentMethod,
  recordCashbookEntry,
} from '../cashbook/cashbook-ledger.helper.js';
import { recordSyncChange } from '../sync/sync-change.helper.js';
import {
  generateDailyNumber,
  lockInventoryBalancesForUpdate,
  requireIdempotencyKey,
  type RequestMeta,
} from '../../shared/utils/transaction-helpers.js';
import type { CreatePurchaseReturnInput } from './purchases.schema.js';
import { purchaseInclude, toPurchaseDto, toPurchaseReturnDto } from './purchases.types.js';

export async function createPurchaseReturn(
  shopId: string,
  actorUserId: string,
  purchaseId: string,
  input: CreatePurchaseReturnInput,
  meta: RequestMeta,
): Promise<{
  purchase: PurchaseDto;
  purchaseReturn: PurchaseReturnDto;
  idempotencyReplayed: boolean;
}> {
  const idempotencyKey = requireIdempotencyKey(meta.idempotencyKey);

  const existingReplay = await prisma.purchaseReturn.findUnique({
    where: {
      shopId_idempotencyKey: {
        shopId,
        idempotencyKey,
      },
    },
  });

  if (existingReplay) {
    if (existingReplay.purchaseId !== purchaseId) {
      throw new ConflictError(
        'Idempotency key was already used for a different purchase return',
        ErrorCodes.DUPLICATE_RESOURCE,
      );
    }
    const purchase = await prisma.purchase.findUniqueOrThrow({
      where: { id: purchaseId },
      include: purchaseInclude,
    });
    const dto = toPurchaseDto(purchase);
    const returnDto = dto.returns.find((r) => r.id === existingReplay.id);
    if (!returnDto) {
      throw new NotFoundError('Replayed purchase return not found');
    }
    return {
      purchase: dto,
      purchaseReturn: returnDto,
      idempotencyReplayed: true,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const lockedPurchaseRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM purchases
        WHERE id = ${purchaseId}::uuid AND shop_id = ${shopId}::uuid
        FOR UPDATE
      `;
      if (!lockedPurchaseRows[0]) {
        throw new NotFoundError('Purchase record not found');
      }

      const purchase = await tx.purchase.findUniqueOrThrow({
        where: { id: purchaseId },
        include: purchaseInclude,
      });

      if (purchase.status === 'RETURNED') {
        throw new BusinessRuleError(
          'All items on this purchase have already been returned',
          ErrorCodes.RETURN_EXCEEDS_SOLD,
        );
      }

      const purchaseItemMap = new Map(purchase.items.map((item) => [item.id, item]));
      const returnBaseDeltaByItem = new Map<string, Decimal>();
      const totalReturnBaseByProduct = new Map<string, Decimal>();

      const preparedReturnLines: Array<{
        purchaseItemId: string;
        productId: string;
        productNameBn: string;
        qtyDisplay: string;
        qtyBase: string;
        qtyBaseDec: Decimal;
        unitCostPoisha: number;
        lineRefundPoisha: number;
        reversedCostPoisha: number;
        nextReturnedQtyBase: string;
      }> = [];

      let returnSubtotalPoisha = 0;

      for (const reqItem of input.items) {
        const purchaseItem = purchaseItemMap.get(reqItem.purchaseItemId);
        if (!purchaseItem) {
          throw new NotFoundError('Referenced purchase item not found on this bill', {
            purchaseItemId: reqItem.purchaseItemId,
          });
        }

        const factorStr = purchaseItem.conversionFactorToBase.toFixed(4);
        const qtyBaseStr = convertToBaseQuantity(reqItem.qtyDisplay, factorStr);
        const qtyBaseDec = new Decimal(qtyBaseStr);

        const purchasedBaseStr = purchaseItem.qtyBase.toFixed(4);
        const prevReturnedBaseStr = purchaseItem.returnedQtyBase.toFixed(4);
        const remainingBaseStr = subtractQuantities(purchasedBaseStr, prevReturnedBaseStr);

        if (compareQuantities(qtyBaseStr, remainingBaseStr) > 0) {
          throw new ConflictError(
            `Return quantity exceeds remaining purchased quantity for ${purchaseItem.productNameBn}`,
            ErrorCodes.RETURN_EXCEEDS_SOLD,
            {
              purchaseItemId: purchaseItem.id,
              productId: purchaseItem.productId,
              requestedBase: qtyBaseStr,
              remainingBase: remainingBaseStr,
            },
          );
        }

        const nextReturnedBaseStr = addQuantities(prevReturnedBaseStr, qtyBaseStr);
        returnBaseDeltaByItem.set(purchaseItem.id, qtyBaseDec);
        totalReturnBaseByProduct.set(
          purchaseItem.productId,
          (totalReturnBaseByProduct.get(purchaseItem.productId) ?? new Decimal(0)).plus(qtyBaseDec),
        );

        const rawLineGross = calculateLineTotalPoisha(
          reqItem.qtyDisplay,
          purchaseItem.unitCostPoisha,
        );
        const prevReturnedItemValue = purchase.returns.reduce(
          (sum, ret) =>
            sum +
            ret.items
              .filter((ri) => ri.purchaseItemId === purchaseItem.id)
              .reduce((riSum, ri) => riSum + ri.lineRefundPoisha, 0),
          0,
        );
        const remainingItemValue = Math.max(
          0,
          purchaseItem.lineTotalPoisha - prevReturnedItemValue,
        );
        const isCompletingItem = compareQuantities(nextReturnedBaseStr, purchasedBaseStr) === 0;
        const lineRefundPoisha = isCompletingItem
          ? remainingItemValue
          : Math.min(rawLineGross, remainingItemValue);

        const prevReversedCost = purchase.returns.reduce(
          (sum, ret) =>
            sum +
            ret.items
              .filter((ri) => ri.purchaseItemId === purchaseItem.id)
              .reduce((riSum, ri) => riSum + ri.reversedCostPoisha, 0),
          0,
        );
        const reversedCostPoisha = calculateProportionalCostReversedPoisha({
          itemNetCostPoisha: purchaseItem.netCostPoisha,
          itemQtyBase: purchasedBaseStr,
          returnQtyBase: qtyBaseStr,
          alreadyReversedCostPoisha: prevReversedCost,
          isCompletingItem,
        });

        returnSubtotalPoisha = addPoisha(returnSubtotalPoisha, lineRefundPoisha);

        preparedReturnLines.push({
          purchaseItemId: purchaseItem.id,
          productId: purchaseItem.productId,
          productNameBn: purchaseItem.productNameBn,
          qtyDisplay: reqItem.qtyDisplay,
          qtyBase: qtyBaseStr,
          qtyBaseDec,
          unitCostPoisha: purchaseItem.unitCostPoisha,
          lineRefundPoisha,
          reversedCostPoisha,
          nextReturnedQtyBase: nextReturnedBaseStr,
        });
      }

      const isFullRemainingReturn = purchase.items.every((item) => {
        const delta = returnBaseDeltaByItem.get(item.id) ?? new Decimal(0);
        const nextTotalReturned = new Decimal(item.returnedQtyBase.toString()).plus(delta);
        return nextTotalReturned.comparedTo(new Decimal(item.qtyBase.toString())) === 0;
      });

      const alreadyDiscountAdjustedPoisha = purchase.returns.reduce(
        (acc, ret) => acc + ret.discountAdjustmentPoisha,
        0,
      );

      const discountAdjustmentPoisha = calculateProportionalReturnDiscount({
        returnSubtotalPoisha,
        saleSubtotalPoisha: purchase.subtotalPoisha,
        totalDiscountPoisha: purchase.discountPoisha,
        alreadyDiscountAdjustedPoisha,
        isFullRemainingReturn,
      });

      const refundTotalPoisha = Math.max(0, returnSubtotalPoisha - discountAdjustmentPoisha);

      let cashRefundPoisha = 0;
      let payableAdjustedPoisha = 0;

      if (input.refundMethod === 'PAYABLE_ADJUSTMENT') {
        if (!purchase.supplierId || purchase.duePoisha < refundTotalPoisha) {
          throw new BusinessRuleError(
            'Payable adjustment return exceeds remaining due on this purchase',
            ErrorCodes.BUSINESS_RULE_VIOLATION,
            {
              duePoisha: purchase.duePoisha,
              refundTotalPoisha,
            },
          );
        }
        payableAdjustedPoisha = refundTotalPoisha;
      } else {
        const netPaidCashPoisha = Math.max(
          0,
          purchase.paidPoisha + purchase.settledDuePoisha - purchase.cashRefundedPoisha,
        );
        cashRefundPoisha = Math.min(refundTotalPoisha, netPaidCashPoisha);
        payableAdjustedPoisha = refundTotalPoisha - cashRefundPoisha;
        if (payableAdjustedPoisha > purchase.duePoisha) {
          throw new BusinessRuleError(
            'Purchase return adjustment exceeds remaining payable on this bill',
            ErrorCodes.BUSINESS_RULE_VIOLATION,
            { duePoisha: purchase.duePoisha, payableAdjustedPoisha },
          );
        }
      }

      const uniqueProductIds = Array.from(
        new Set(preparedReturnLines.map((line) => line.productId)),
      ).sort();
      const balanceMap = await lockInventoryBalancesForUpdate(tx, shopId, uniqueProductIds);

      for (const [productId, requestedReturnDec] of totalReturnBaseByProduct.entries()) {
        const bal = balanceMap.get(productId);
        if (!bal) continue;
        if (bal.qtyDec.lt(requestedReturnDec)) {
          const lineInfo = preparedReturnLines.find((l) => l.productId === productId);
          throw new ConflictError(
            `Not enough stock remaining on hand to return ${lineInfo?.productNameBn ?? 'product'} to supplier`,
            ErrorCodes.INSUFFICIENT_STOCK,
            {
              productId,
              requestedReturnBase: requestedReturnDec.toFixed(4),
              availableBase: bal.qtyDec.toFixed(4),
            },
          );
        }
      }

      const returnedAt = new Date();
      const returnNumber = await generateDailyNumber(tx, {
        table: 'purchase_returns',
        shopId,
        prefix: 'PRET',
        date: returnedAt,
      });

      const purchaseReturn = await tx.purchaseReturn.create({
        data: {
          shopId,
          purchaseId: purchase.id,
          returnNumber,
          refundMethod: input.refundMethod,
          subtotalPoisha: returnSubtotalPoisha,
          discountAdjustmentPoisha,
          refundTotalPoisha,
          cashRefundPoisha,
          payableAdjustedPoisha,
          reason: input.reason ?? null,
          idempotencyKey,
          actorUserId,
          returnedAt,
        },
      });

      const refundMethodForCashbook = mapPurchaseRefundMethodToPaymentMethod(input.refundMethod);
      if (refundMethodForCashbook && cashRefundPoisha > 0) {
        await recordCashbookEntry(tx, {
          shopId,
          direction: 'IN',
          entryType: 'PURCHASE_REFUND_IN',
          method: refundMethodForCashbook,
          amountPoisha: cashRefundPoisha,
          referenceType: 'PURCHASE_RETURN',
          referenceId: purchaseReturn.id,
          referenceNumber: returnNumber,
          note: input.reason ?? purchase.purchaseNumber,
          actorUserId,
          occurredAt: returnedAt,
        });
      }

      await tx.purchaseReturnItem.createMany({
        data: preparedReturnLines.map((line) => ({
          shopId,
          purchaseReturnId: purchaseReturn.id,
          purchaseItemId: line.purchaseItemId,
          productId: line.productId,
          qtyDisplay: line.qtyDisplay,
          qtyBase: line.qtyBase,
          unitCostPoisha: line.unitCostPoisha,
          lineRefundPoisha: line.lineRefundPoisha,
          reversedCostPoisha: line.reversedCostPoisha,
        })),
      });

      for (const line of preparedReturnLines) {
        await tx.purchaseItem.update({
          where: { id: line.purchaseItemId },
          data: {
            returnedQtyBase: line.nextReturnedQtyBase,
          },
        });
      }

      for (const line of preparedReturnLines) {
        const bal = balanceMap.get(line.productId);
        if (!bal) continue;

        const nextAvgCostBdt = calculatePurchaseReturnWacBdt({
          currentQtyBase: bal.qtyDec.toFixed(4),
          currentAvgCostBdt: bal.avgCostBdt,
          returnQtyBase: line.qtyBase,
          reversedCostPoisha: line.reversedCostPoisha,
        });
        const nextQtyDec = bal.qtyDec
          .minus(line.qtyBaseDec)
          .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

        bal.qtyDec = nextQtyDec;
        bal.avgCostBdt = nextAvgCostBdt;

        const reversedUnitCostBdt = new Decimal(line.reversedCostPoisha)
          .dividedBy(100)
          .dividedBy(line.qtyBaseDec)
          .toDecimalPlaces(6, Decimal.ROUND_HALF_UP)
          .toFixed(6);

        await tx.stockMovement.create({
          data: {
            shopId,
            productId: line.productId,
            movementType: 'PURCHASE_RETURN_OUT',
            deltaQtyBase: line.qtyBaseDec.negated().toFixed(4),
            balanceAfterBase: nextQtyDec.toFixed(4),
            unitCostBdt: reversedUnitCostBdt,
            valuePoisha: line.reversedCostPoisha,
            referenceType: 'PURCHASE_RETURN',
            referenceId: purchaseReturn.id,
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
      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          status: nextStatus,
          returnedTotalPoisha: addPoisha(purchase.returnedTotalPoisha, refundTotalPoisha),
          duePoisha: Math.max(0, purchase.duePoisha - payableAdjustedPoisha),
          cashRefundedPoisha: addPoisha(purchase.cashRefundedPoisha, cashRefundPoisha),
        },
      });

      if (purchase.supplierId) {
        const supRows = await tx.$queryRaw<
          Array<{
            id: string;
            total_purchased_poisha: number;
            total_paid_poisha: number;
            payable_poisha: number;
          }>
        >`
          SELECT id, total_purchased_poisha, total_paid_poisha, payable_poisha
          FROM suppliers
          WHERE id = ${purchase.supplierId}::uuid AND shop_id = ${shopId}::uuid
          FOR UPDATE
        `;
        const supplier = supRows[0];
        if (supplier) {
          if (payableAdjustedPoisha > supplier.payable_poisha) {
            throw new BusinessRuleError(
              'Payable adjustment exceeds current supplier payable balance',
              ErrorCodes.BUSINESS_RULE_VIOLATION,
              {
                payablePoisha: supplier.payable_poisha,
                payableAdjustedPoisha,
              },
            );
          }
          await tx.supplier.update({
            where: { id: supplier.id },
            data: {
              totalPurchasedPoisha: Math.max(
                0,
                supplier.total_purchased_poisha - refundTotalPoisha,
              ),
              totalPaidPoisha: Math.max(0, supplier.total_paid_poisha - cashRefundPoisha),
              payablePoisha: Math.max(0, supplier.payable_poisha - payableAdjustedPoisha),
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
          action: 'PURCHASE_RETURNED',
          entityType: 'PurchaseReturn',
          entityId: purchaseReturn.id,
          afterJson: {
            purchaseId: purchase.id,
            returnNumber,
            refundTotalPoisha,
            cashRefundPoisha,
            payableAdjustedPoisha,
            nextStatus,
          },
          ipAddress: meta.ipAddress ?? null,
        },
      });

      await recordSyncChange(tx, {
        shopId,
        entityType: 'PURCHASE',
        entityId: purchase.id,
      });
      for (const productId of uniqueProductIds) {
        await recordSyncChange(tx, {
          shopId,
          entityType: 'PRODUCT',
          entityId: productId,
        });
      }
      if (purchase.supplierId) {
        await recordSyncChange(tx, {
          shopId,
          entityType: 'SUPPLIER',
          entityId: purchase.supplierId,
        });
      }

      const refreshedPurchase = await tx.purchase.findUniqueOrThrow({
        where: { id: purchase.id },
        include: purchaseInclude,
      });

      const returnRow = refreshedPurchase.returns.find((r) => r.id === purchaseReturn.id);
      if (!returnRow) {
        throw new NotFoundError('Created purchase return missing');
      }

      return {
        purchase: toPurchaseDto(refreshedPurchase),
        purchaseReturn: toPurchaseReturnDto(returnRow),
        idempotencyReplayed: false,
      };
    });

    return result;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.purchaseReturn.findUnique({
        where: {
          shopId_idempotencyKey: {
            shopId,
            idempotencyKey,
          },
        },
      });
      if (winner && winner.purchaseId === purchaseId) {
        const purchase = await prisma.purchase.findUniqueOrThrow({
          where: { id: purchaseId },
          include: purchaseInclude,
        });
        const dto = toPurchaseDto(purchase);
        const returnDto = dto.returns.find((r) => r.id === winner.id);
        if (returnDto) {
          return {
            purchase: dto,
            purchaseReturn: returnDto,
            idempotencyReplayed: true,
          };
        }
      }
    }
    throw err;
  }
}
