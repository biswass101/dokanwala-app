import type { CustomerDto } from '@dokanwala/shared';
import type { Customer } from '../../generated/prisma/client.js';

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
