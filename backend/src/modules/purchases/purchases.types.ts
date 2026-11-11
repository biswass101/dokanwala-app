import type { PurchaseDto, PurchaseItemDto, PurchaseReturnDto } from '@dokanwala/shared';
import type { Prisma } from '../../generated/prisma/client.js';

export const purchaseInclude = {
  actorUser: { select: { id: true, name: true } },
  items: {
    orderBy: [{ lineOrder: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  returns: {
    orderBy: [{ returnedAt: 'asc' as const }, { id: 'asc' as const }],
    include: {
      actorUser: { select: { id: true, name: true } },
      items: {
        include: {
          purchaseItem: {
            select: {
              productNameBn: true,
              productNameEn: true,
              unitNameBn: true,
              unitNameEn: true,
            },
          },
        },
        orderBy: [{ id: 'asc' as const }],
      },
    },
  },
} satisfies Prisma.PurchaseInclude;

export type PurchaseWithRelations = Prisma.PurchaseGetPayload<{
  include: typeof purchaseInclude;
}>;

export type PurchaseReturnWithRelations = PurchaseWithRelations['returns'][number];

export function toPurchaseReturnDto(row: PurchaseReturnWithRelations): PurchaseReturnDto {
  return {
    id: row.id,
    purchaseId: row.purchaseId,
    returnNumber: row.returnNumber,
    refundMethod: row.refundMethod,
    subtotalPoisha: row.subtotalPoisha,
    discountAdjustmentPoisha: row.discountAdjustmentPoisha,
    refundTotalPoisha: row.refundTotalPoisha,
    cashRefundPoisha: row.cashRefundPoisha,
    payableAdjustedPoisha: row.payableAdjustedPoisha,
    reason: row.reason,
    actorUserId: row.actorUserId,
    actorName: row.actorUser?.name ?? null,
    returnedAt: row.returnedAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      purchaseReturnId: item.purchaseReturnId,
      purchaseItemId: item.purchaseItemId,
      productId: item.productId,
      productNameBn: item.purchaseItem.productNameBn,
      productNameEn: item.purchaseItem.productNameEn,
      unitNameBn: item.purchaseItem.unitNameBn,
      unitNameEn: item.purchaseItem.unitNameEn,
      qtyDisplay: item.qtyDisplay.toFixed(4),
      qtyBase: item.qtyBase.toFixed(4),
      unitCostPoisha: item.unitCostPoisha,
      lineRefundPoisha: item.lineRefundPoisha,
      reversedCostPoisha: item.reversedCostPoisha,
    })),
  };
}

export function toPurchaseDto(purchase: PurchaseWithRelations): PurchaseDto {
  const items: PurchaseItemDto[] = purchase.items.map((item) => ({
    id: item.id,
    purchaseId: item.purchaseId,
    productId: item.productId,
    unitId: item.unitId,
    productNameBn: item.productNameBn,
    productNameEn: item.productNameEn,
    unitNameBn: item.unitNameBn,
    unitNameEn: item.unitNameEn,
    lineOrder: item.lineOrder,
    qtyDisplay: item.qtyDisplay.toFixed(4),
    conversionFactorToBase: item.conversionFactorToBase.toFixed(4),
    qtyBase: item.qtyBase.toFixed(4),
    returnedQtyBase: item.returnedQtyBase.toFixed(4),
    unitCostPoisha: item.unitCostPoisha,
    lineTotalPoisha: item.lineTotalPoisha,
    netCostPoisha: item.netCostPoisha,
  }));

  return {
    id: purchase.id,
    shopId: purchase.shopId,
    purchaseNumber: purchase.purchaseNumber,
    supplierId: purchase.supplierId,
    supplierNameSnapshot: purchase.supplierNameSnapshot,
    status: purchase.status,
    subtotalPoisha: purchase.subtotalPoisha,
    discountPoisha: purchase.discountPoisha,
    totalPoisha: purchase.totalPoisha,
    paidPoisha: purchase.paidPoisha,
    settledDuePoisha: purchase.settledDuePoisha,
    duePoisha: purchase.duePoisha,
    paymentMethod: purchase.paymentMethod,
    paymentReference: purchase.paymentReference,
    returnedTotalPoisha: purchase.returnedTotalPoisha,
    cashRefundedPoisha: purchase.cashRefundedPoisha,
    note: purchase.note,
    actorUserId: purchase.actorUserId,
    actorName: purchase.actorUser?.name ?? null,
    purchasedAt: purchase.purchasedAt.toISOString(),
    createdAt: purchase.createdAt.toISOString(),
    updatedAt: purchase.updatedAt.toISOString(),
    items,
    returns: purchase.returns.map(toPurchaseReturnDto),
  };
}
