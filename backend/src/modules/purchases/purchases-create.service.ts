import {
  addPoisha,
  allocatePurchaseNetCostsPoisha,
  calculateLineTotalPoisha,
  calculateMovingWacBdt,
  convertToBaseQuantity,
  ErrorCodes,
  type PurchaseDto,
} from '@dokanwala/shared';
import { Decimal } from 'decimal.js';
import { prisma } from '../../database/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { BusinessRuleError, NotFoundError } from '../../shared/errors/app-error.js';
import {
  generateDailyNumber,
  InvalidUnitConversionError,
  lockInventoryBalancesForUpdate,
  requireIdempotencyKey,
  type RequestMeta,
} from '../../shared/utils/transaction-helpers.js';
import type { CreatePurchaseInput } from './purchases.schema.js';
import { purchaseInclude, toPurchaseDto } from './purchases.types.js';

export async function createPurchase(
  shopId: string,
  actorUserId: string,
  input: CreatePurchaseInput,
  meta: RequestMeta,
): Promise<{ purchase: PurchaseDto; idempotencyReplayed: boolean }> {
  const idempotencyKey = requireIdempotencyKey(meta.idempotencyKey);

  const existingReplay = await prisma.purchase.findUnique({
    where: {
      shopId_idempotencyKey: {
        shopId,
        idempotencyKey,
      },
    },
    include: purchaseInclude,
  });

  if (existingReplay) {
    return {
      purchase: toPurchaseDto(existingReplay),
      idempotencyReplayed: true,
    };
  }

  try {
    const createdPurchase = await prisma.$transaction(async (tx) => {
      const uniqueProductIds = Array.from(
        new Set(input.items.map((item) => item.productId)),
      ).sort();

      const products = await tx.product.findMany({
        where: {
          shopId,
          id: { in: uniqueProductIds },
          deletedAt: null,
          isActive: true,
        },
        include: {
          productUnits: {
            where: { isActive: true },
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

      const productMap = new Map(products.map((p) => [p.id, p]));
      const balanceMap = await lockInventoryBalancesForUpdate(tx, shopId, uniqueProductIds);

      const preparedLines: Array<{
        lineOrder: number;
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
        unitCostPoisha: number;
        lineTotalPoisha: number;
        netCostPoisha: number;
      }> = [];

      let subtotalPoisha = 0;

      for (let idx = 0; idx < input.items.length; idx += 1) {
        const reqItem = input.items[idx];
        if (!reqItem) continue;
        const product = productMap.get(reqItem.productId);
        if (!product) {
          throw new NotFoundError('Product not found');
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
        const lineTotalPoisha = calculateLineTotalPoisha(
          reqItem.qtyDisplay,
          reqItem.unitCostPoisha,
        );

        subtotalPoisha = addPoisha(subtotalPoisha, lineTotalPoisha);

        preparedLines.push({
          lineOrder: idx,
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
          unitCostPoisha: reqItem.unitCostPoisha,
          lineTotalPoisha,
          netCostPoisha: lineTotalPoisha,
        });
      }

      if (input.discountPoisha > subtotalPoisha) {
        throw new BusinessRuleError(
          'Purchase discount cannot exceed purchase subtotal',
          ErrorCodes.BUSINESS_RULE_VIOLATION,
          { subtotalPoisha, discountPoisha: input.discountPoisha },
        );
      }

      const netCosts = allocatePurchaseNetCostsPoisha(
        preparedLines.map((l) => l.lineTotalPoisha),
        input.discountPoisha,
      );
      for (let i = 0; i < preparedLines.length; i += 1) {
        const line = preparedLines[i];
        if (line) {
          line.netCostPoisha = netCosts[i] ?? line.lineTotalPoisha;
        }
      }

      const totalPoisha = subtotalPoisha - input.discountPoisha;

      if (input.paidPoisha > totalPoisha) {
        throw new BusinessRuleError(
          'Paid amount cannot exceed net purchase total',
          ErrorCodes.BUSINESS_RULE_VIOLATION,
          { totalPoisha, paidPoisha: input.paidPoisha },
        );
      }

      const duePoisha = totalPoisha - input.paidPoisha;

      if (duePoisha > 0 && !input.supplierId) {
        throw new BusinessRuleError(
          'Credit or partial-payment purchases require selecting a supplier',
          ErrorCodes.BUSINESS_RULE_VIOLATION,
          { duePoisha },
        );
      }

      let supplierNameSnapshot: string | null = null;
      if (input.supplierId) {
        const supRows = await tx.$queryRaw<
          Array<{
            id: string;
            name_bn: string;
            total_purchased_poisha: number;
            total_paid_poisha: number;
            payable_poisha: number;
            is_active: boolean;
            deleted_at: Date | null;
          }>
        >`
          SELECT id, name_bn, total_purchased_poisha, total_paid_poisha, payable_poisha, is_active, deleted_at
          FROM suppliers
          WHERE id = ${input.supplierId}::uuid AND shop_id = ${shopId}::uuid
          FOR UPDATE
        `;
        const supplier = supRows[0];
        if (!supplier || supplier.deleted_at !== null || !supplier.is_active) {
          throw new NotFoundError('Selected supplier was not found or is inactive');
        }
        supplierNameSnapshot = supplier.name_bn;

        await tx.supplier.update({
          where: { id: supplier.id },
          data: {
            totalPurchasedPoisha: addPoisha(supplier.total_purchased_poisha, totalPoisha),
            totalPaidPoisha: addPoisha(supplier.total_paid_poisha, input.paidPoisha),
            payablePoisha: addPoisha(supplier.payable_poisha, duePoisha),
            version: { increment: 1 },
          },
        });
      }

      const purchasedAt = input.purchasedAt ? new Date(input.purchasedAt) : new Date();
      const purchaseNumber = await generateDailyNumber(tx, {
        table: 'purchases',
        shopId,
        prefix: 'PUR',
        date: purchasedAt,
      });

      const purchase = await tx.purchase.create({
        data: {
          ...(input.id !== undefined ? { id: input.id } : {}),
          shopId,
          purchaseNumber,
          supplierId: input.supplierId ?? null,
          supplierNameSnapshot,
          status: 'COMPLETED',
          subtotalPoisha,
          discountPoisha: input.discountPoisha,
          totalPoisha,
          paidPoisha: input.paidPoisha,
          settledDuePoisha: 0,
          duePoisha,
          paymentMethod: input.paidPoisha > 0 ? (input.paymentMethod ?? null) : null,
          paymentReference: input.paidPoisha > 0 ? (input.paymentReference ?? null) : null,
          returnedTotalPoisha: 0,
          cashRefundedPoisha: 0,
          note: input.note ?? null,
          idempotencyKey,
          actorUserId,
          purchasedAt,
        },
      });

      await tx.purchaseItem.createMany({
        data: preparedLines.map((line) => ({
          shopId,
          purchaseId: purchase.id,
          productId: line.productId,
          unitId: line.unitId,
          productNameBn: line.productNameBn,
          productNameEn: line.productNameEn,
          unitNameBn: line.unitNameBn,
          unitNameEn: line.unitNameEn,
          lineOrder: line.lineOrder,
          qtyDisplay: line.qtyDisplay,
          conversionFactorToBase: line.conversionFactorToBase,
          qtyBase: line.qtyBase,
          returnedQtyBase: '0.0000',
          unitCostPoisha: line.unitCostPoisha,
          lineTotalPoisha: line.lineTotalPoisha,
          netCostPoisha: line.netCostPoisha,
        })),
      });

      const latestBasePurchasePriceByProduct = new Map<string, number>();

      for (const line of preparedLines) {
        const bal = balanceMap.get(line.productId);
        if (!bal) continue;

        const nextAvgCostBdt = calculateMovingWacBdt({
          oldQtyBase: bal.qtyDec.toFixed(4),
          oldAvgCostBdt: bal.avgCostBdt,
          incomingQtyBase: line.qtyBase,
          incomingTotalCostPoisha: line.netCostPoisha,
        });
        const nextQtyDec = bal.qtyDec
          .plus(line.qtyBaseDec)
          .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

        bal.qtyDec = nextQtyDec;
        bal.avgCostBdt = nextAvgCostBdt;

        const lineBaseUnitCostBdt = new Decimal(line.netCostPoisha)
          .dividedBy(100)
          .dividedBy(line.qtyBaseDec)
          .toDecimalPlaces(6, Decimal.ROUND_HALF_UP)
          .toFixed(6);

        const basePricePoisha = new Decimal(line.netCostPoisha)
          .dividedBy(line.qtyBaseDec)
          .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
          .toNumber();
        latestBasePurchasePriceByProduct.set(line.productId, basePricePoisha);

        await tx.stockMovement.create({
          data: {
            shopId,
            productId: line.productId,
            movementType: 'PURCHASE_IN',
            deltaQtyBase: line.qtyBase,
            balanceAfterBase: nextQtyDec.toFixed(4),
            unitCostBdt: lineBaseUnitCostBdt,
            valuePoisha: line.netCostPoisha,
            referenceType: 'PURCHASE',
            referenceId: purchase.id,
            reason: purchaseNumber,
            actorUserId,
          },
        });
      }

      for (const productId of uniqueProductIds) {
        const bal = balanceMap.get(productId);
        if (bal) {
          await tx.inventoryBalance.update({
            where: { productId },
            data: {
              qtyBase: bal.qtyDec.toFixed(4),
              avgCostPerBaseBdt: bal.avgCostBdt,
              version: { increment: 1 },
            },
          });
        }

        const latestBasePricePoisha = latestBasePurchasePriceByProduct.get(productId);
        await tx.product.update({
          where: { id: productId },
          data: {
            ...(latestBasePricePoisha !== undefined
              ? { lastPurchasePricePoisha: latestBasePricePoisha }
              : {}),
            version: { increment: 1 },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          shopId,
          actorUserId,
          deviceId: meta.deviceId ?? null,
          action: 'PURCHASE_CREATED',
          entityType: 'Purchase',
          entityId: purchase.id,
          afterJson: {
            purchaseNumber,
            supplierId: input.supplierId ?? null,
            totalPoisha,
            paidPoisha: input.paidPoisha,
            duePoisha,
            itemCount: preparedLines.length,
          },
          ipAddress: meta.ipAddress ?? null,
        },
      });

      return tx.purchase.findUniqueOrThrow({
        where: { id: purchase.id },
        include: purchaseInclude,
      });
    });

    return {
      purchase: toPurchaseDto(createdPurchase),
      idempotencyReplayed: false,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.purchase.findUnique({
        where: {
          shopId_idempotencyKey: {
            shopId,
            idempotencyKey,
          },
        },
        include: purchaseInclude,
      });
      if (winner) {
        return {
          purchase: toPurchaseDto(winner),
          idempotencyReplayed: true,
        };
      }
    }
    throw err;
  }
}
