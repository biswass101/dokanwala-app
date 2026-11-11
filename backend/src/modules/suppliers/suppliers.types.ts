import type { SupplierDto, SupplierPaymentDto } from '@dokanwala/shared';
import type { Prisma, Supplier, SupplierPayment } from '../../generated/prisma/client.js';

export const supplierPaymentInclude = {
  actorUser: { select: { id: true, name: true } },
} satisfies Prisma.SupplierPaymentInclude;

export type SupplierPaymentWithActor = Prisma.SupplierPaymentGetPayload<{
  include: typeof supplierPaymentInclude;
}>;

export function toSupplierDto(supplier: Supplier): SupplierDto {
  return {
    id: supplier.id,
    shopId: supplier.shopId,
    nameBn: supplier.nameBn,
    nameEn: supplier.nameEn,
    phone: supplier.phone,
    address: supplier.address,
    note: supplier.note,
    totalPurchasedPoisha: supplier.totalPurchasedPoisha,
    totalPaidPoisha: supplier.totalPaidPoisha,
    payablePoisha: supplier.payablePoisha,
    isActive: supplier.isActive,
    version: supplier.version,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  };
}

export function toSupplierPaymentDto(
  row: SupplierPayment & { actorUser?: { id: string; name: string } | null },
): SupplierPaymentDto {
  return {
    id: row.id,
    shopId: row.shopId,
    supplierId: row.supplierId,
    purchaseId: row.purchaseId,
    method: row.method,
    amountPoisha: row.amountPoisha,
    reference: row.reference,
    note: row.note,
    actorUserId: row.actorUserId,
    actorName: row.actorUser?.name ?? null,
    paidAt: row.paidAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
