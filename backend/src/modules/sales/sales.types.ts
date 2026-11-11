import type { SaleDto, SaleItemDto, SaleReturnDto, UserRole } from '@dokanwala/shared';
import type { Prisma } from '../../generated/prisma/client.js';

export const saleInclude = {
  actorUser: { select: { id: true, name: true } },
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  payments: {
    orderBy: [{ receivedAt: 'asc' as const }, { id: 'asc' as const }],
  },
  returns: {
    orderBy: [{ returnedAt: 'asc' as const }, { id: 'asc' as const }],
    include: {
      actorUser: { select: { id: true, name: true } },
      items: {
        include: {
          saleItem: {
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
} satisfies Prisma.SaleInclude;

export type SaleWithRelations = Prisma.SaleGetPayload<{
  include: typeof saleInclude;
}>;

export type SaleReturnWithRelations = SaleWithRelations['returns'][number];

export function toSaleReturnDto(row: SaleReturnWithRelations, role: UserRole): SaleReturnDto {
  const isOwner = role === 'OWNER';
  return {
    id: row.id,
    saleId: row.saleId,
    returnNumber: row.returnNumber,
    refundMethod: row.refundMethod,
    subtotalPoisha: row.subtotalPoisha,
    discountAdjustmentPoisha: row.discountAdjustmentPoisha,
    refundTotalPoisha: row.refundTotalPoisha,
    cashRefundPoisha: row.cashRefundPoisha,
    creditAdjustedPoisha: row.creditAdjustedPoisha,
    reason: row.reason,
    actorUserId: row.actorUserId,
    actorName: row.actorUser?.name ?? null,
    returnedAt: row.returnedAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      saleReturnId: item.saleReturnId,
      saleItemId: item.saleItemId,
      productId: item.productId,
      productNameBn: item.saleItem.productNameBn,
      productNameEn: item.saleItem.productNameEn,
      unitNameBn: item.saleItem.unitNameBn,
      unitNameEn: item.saleItem.unitNameEn,
      qtyDisplay: item.qtyDisplay.toFixed(4),
      qtyBase: item.qtyBase.toFixed(4),
      unitSellingPricePoisha: item.unitSellingPricePoisha,
      lineRefundPoisha: item.lineRefundPoisha,
      restoredCogsPoisha: isOwner ? item.restoredCogsPoisha : null,
    })),
  };
}

export function toSaleDto(sale: SaleWithRelations, role: UserRole): SaleDto {
  const isOwner = role === 'OWNER';

  const items: SaleItemDto[] = sale.items.map((item) => ({
    id: item.id,
    saleId: item.saleId,
    productId: item.productId,
    unitId: item.unitId,
    productNameBn: item.productNameBn,
    productNameEn: item.productNameEn,
    unitNameBn: item.unitNameBn,
    unitNameEn: item.unitNameEn,
    qtyDisplay: item.qtyDisplay.toFixed(4),
    conversionFactorToBase: item.conversionFactorToBase.toFixed(4),
    qtyBase: item.qtyBase.toFixed(4),
    returnedQtyBase: item.returnedQtyBase.toFixed(4),
    unitSellingPricePoisha: item.unitSellingPricePoisha,
    unitCostAtSaleBdt: isOwner ? item.unitCostAtSaleBdt.toFixed(6) : null,
    lineSubtotalPoisha: item.lineSubtotalPoisha,
    lineCogsPoisha: isOwner ? item.lineCogsPoisha : null,
  }));

  const returns = sale.returns.map((ret) => toSaleReturnDto(ret, role));

  let estimatedProfitPoisha: number | null = null;
  if (isOwner) {
    if (sale.status === 'CANCELLED') {
      estimatedProfitPoisha = 0;
    } else {
      const restoredCogs = sale.returns.reduce(
        (acc, ret) => acc + ret.items.reduce((itemAcc, ri) => itemAcc + ri.restoredCogsPoisha, 0),
        0,
      );
      const netRevenue = sale.totalPoisha - sale.returnedTotalPoisha;
      const netCogs = sale.cogsPoisha - restoredCogs;
      estimatedProfitPoisha = netRevenue - netCogs;
    }
  }

  return {
    id: sale.id,
    shopId: sale.shopId,
    receiptNumber: sale.receiptNumber,
    customerId: sale.customerId,
    customerNameSnapshot: sale.customerNameSnapshot,
    status: sale.status,
    subtotalPoisha: sale.subtotalPoisha,
    discountType: sale.discountType,
    discountValue: sale.discountValue.toFixed(2),
    discountPoisha: sale.discountPoisha,
    totalPoisha: sale.totalPoisha,
    paidPoisha: sale.paidPoisha,
    duePoisha: sale.duePoisha,
    tenderedPoisha: sale.tenderedPoisha,
    changePoisha: sale.changePoisha,
    returnedTotalPoisha: sale.returnedTotalPoisha,
    cashRefundedPoisha: sale.cashRefundedPoisha,
    cogsPoisha: isOwner ? sale.cogsPoisha : null,
    estimatedProfitPoisha,
    note: sale.note,
    actorUserId: sale.actorUserId,
    actorName: sale.actorUser?.name ?? null,
    cancelledAt: sale.cancelledAt ? sale.cancelledAt.toISOString() : null,
    cancelReason: sale.cancelReason,
    soldAt: sale.soldAt.toISOString(),
    createdAt: sale.createdAt.toISOString(),
    updatedAt: sale.updatedAt.toISOString(),
    items,
    payments: sale.payments.map((p) => ({
      id: p.id,
      saleId: p.saleId,
      method: p.method,
      amountPoisha: p.amountPoisha,
      reference: p.reference,
      receivedAt: p.receivedAt.toISOString(),
    })),
    returns,
  };
}
