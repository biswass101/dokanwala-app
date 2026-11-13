import type { PaginationMeta, SaleDto, UserRole } from '@dokanwala/shared';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { BusinessRuleError, NotFoundError } from '../../shared/errors/app-error.js';
import { getDhakaDayRangeUtc } from '../../shared/utils/timezone.js';
import { recordSyncChange } from '../sync/sync-change.helper.js';
import type { RequestMeta } from './sales.helpers.js';
import type { DeleteSaleInput, ListSalesQuery, UpdateSaleInput } from './sales.schema.js';
import { saleInclude, toSaleDto } from './sales.types.js';
import { cancelSale } from './sales-return-cancel.service.js';

export { createSale, createQuickSale } from './sales-create.service.js';
export { cancelSale, createSaleReturn } from './sales-return-cancel.service.js';

export async function deleteSale(
  shopId: string,
  actorUserId: string,
  role: UserRole,
  saleId: string,
  input: DeleteSaleInput,
  meta: RequestMeta,
): Promise<{ sale: SaleDto; idempotencyReplayed: boolean }> {
  return cancelSale(
    shopId,
    actorUserId,
    role,
    saleId,
    { reason: input.reason || 'Deleted by merchant' },
    meta,
  );
}

export async function updateSale(
  shopId: string,
  actorUserId: string,
  role: UserRole,
  saleId: string,
  input: UpdateSaleInput,
): Promise<SaleDto> {
  const existing = await prisma.sale.findFirst({
    where: { id: saleId, shopId },
    include: saleInclude,
  });

  if (!existing) {
    throw new NotFoundError('Sale invoice not found');
  }

  if (existing.status === 'CANCELLED') {
    throw new BusinessRuleError('Cannot update cancelled sale invoice');
  }

  const updatedSale = await prisma.$transaction(async (tx) => {
    let customerNameSnapshot = existing.customerNameSnapshot;

    // Handle customer change if requested
    if (input.customerId !== undefined && input.customerId !== existing.customerId) {
      if (existing.customerId && existing.duePoisha > 0) {
        await tx.customer.update({
          where: { id: existing.customerId },
          data: {
            duePoisha: { decrement: existing.duePoisha },
            totalPurchasedPoisha: { decrement: existing.totalPoisha },
            totalPaidPoisha: { decrement: existing.paidPoisha },
            version: { increment: 1 },
          },
        });
      }

      if (input.customerId) {
        const newCustomer = await tx.customer.findFirst({
          where: { id: input.customerId, shopId },
        });
        if (!newCustomer) {
          throw new NotFoundError('Customer not found');
        }
        customerNameSnapshot = newCustomer.nameBn;

        if (existing.duePoisha > 0) {
          await tx.customer.update({
            where: { id: input.customerId },
            data: {
              duePoisha: { increment: existing.duePoisha },
              totalPurchasedPoisha: { increment: existing.totalPoisha },
              totalPaidPoisha: { increment: existing.paidPoisha },
              version: { increment: 1 },
            },
          });
        }
      } else {
        customerNameSnapshot = null;
      }
    }

    const soldAtDate = input.soldAt ? new Date(input.soldAt) : undefined;

    const sale = await tx.sale.update({
      where: { id: saleId },
      data: {
        ...(soldAtDate ? { soldAt: soldAtDate } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.customerId !== undefined
          ? { customerId: input.customerId, customerNameSnapshot }
          : {}),
      },
      include: saleInclude,
    });

    if (soldAtDate) {
      await tx.payment.updateMany({
        where: { saleId },
        data: { receivedAt: soldAtDate },
      });
      await tx.cashbookEntry.updateMany({
        where: { shopId, referenceType: 'SALE', referenceId: saleId },
        data: { occurredAt: soldAtDate },
      });
    }

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        action: 'SALE_UPDATED',
        entityType: 'Sale',
        entityId: sale.id,
        afterJson: {
          soldAt: sale.soldAt.toISOString(),
          note: sale.note,
          customerId: sale.customerId,
        },
      },
    });

    await recordSyncChange(tx, {
      shopId,
      entityType: 'SALE',
      entityId: sale.id,
      action: 'UPSERT',
    });

    return sale;
  });

  return toSaleDto(updatedSale, role);
}

export async function listSales(
  shopId: string,
  role: UserRole,
  query: ListSalesQuery,
): Promise<{ sales: SaleDto[]; pagination: PaginationMeta }> {
  const soldAtFilter: Prisma.DateTimeFilter = {};
  if (query.from) {
    soldAtFilter.gte = getDhakaDayRangeUtc(query.from).startUtc;
  }
  if (query.to) {
    soldAtFilter.lte = getDhakaDayRangeUtc(query.to).endUtc;
  }

  const where: Prisma.SaleWhereInput = {
    shopId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.dueOnly ? { duePoisha: { gt: 0 } } : {}),
    ...(query.from || query.to ? { soldAt: soldAtFilter } : {}),
    ...(query.q && query.q.length > 0
      ? {
          OR: [
            { receiptNumber: { contains: query.q, mode: 'insensitive' } },
            { customerNameSnapshot: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [totalItems, rows] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where,
      include: saleInclude,
      orderBy: [{ soldAt: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: query.limit,
    }),
  ]);

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.limit);

  return {
    sales: rows.map((row) => toSaleDto(row, role)),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
    },
  };
}

export async function getSaleById(
  shopId: string,
  role: UserRole,
  saleId: string,
): Promise<SaleDto> {
  const sale = await prisma.sale.findFirst({
    where: {
      id: saleId,
      shopId,
    },
    include: saleInclude,
  });

  if (!sale) {
    throw new NotFoundError('Sale invoice not found');
  }

  return toSaleDto(sale, role);
}
