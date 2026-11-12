import type { CustomerDto, CustomerPaymentDto } from '@dokanwala/shared';
import type { Customer, Prisma } from '../../generated/prisma/client.js';

export const customerPaymentInclude = {
  actorUser: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.CustomerPaymentInclude;

export type CustomerPaymentWithRelations = Prisma.CustomerPaymentGetPayload<{
  include: typeof customerPaymentInclude;
}>;

export function toCustomerDto(row: Customer): CustomerDto {
  return {
    id: row.id,
    shopId: row.shopId,
    nameBn: row.nameBn,
    nameEn: row.nameEn,
    phone: row.phone,
    address: row.address,
    note: row.note,
    totalPurchasedPoisha: row.totalPurchasedPoisha,
    totalPaidPoisha: row.totalPaidPoisha,
    duePoisha: row.duePoisha,
    isActive: row.isActive,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCustomerPaymentDto(row: CustomerPaymentWithRelations): CustomerPaymentDto {
  return {
    id: row.id,
    shopId: row.shopId,
    customerId: row.customerId,
    saleId: row.saleId,
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
