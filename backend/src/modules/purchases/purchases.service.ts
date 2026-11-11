import type { PaginationMeta, PurchaseDto } from '@dokanwala/shared';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotFoundError } from '../../shared/errors/app-error.js';
import { getDhakaDayRangeUtc } from '../../shared/utils/timezone.js';
import type { ListPurchasesQuery } from './purchases.schema.js';
import { purchaseInclude, toPurchaseDto } from './purchases.types.js';

export { createPurchase } from './purchases-create.service.js';
export { createPurchaseReturn } from './purchases-return.service.js';

export async function listPurchases(
  shopId: string,
  query: ListPurchasesQuery,
): Promise<{ purchases: PurchaseDto[]; pagination: PaginationMeta }> {
  const purchasedAtFilter: Prisma.DateTimeFilter = {};
  if (query.from) {
    purchasedAtFilter.gte = getDhakaDayRangeUtc(query.from).startUtc;
  }
  if (query.to) {
    purchasedAtFilter.lte = getDhakaDayRangeUtc(query.to).endUtc;
  }

  const where: Prisma.PurchaseWhereInput = {
    shopId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.dueOnly ? { duePoisha: { gt: 0 } } : {}),
    ...(query.from || query.to ? { purchasedAt: purchasedAtFilter } : {}),
    ...(query.q && query.q.length > 0
      ? {
          OR: [
            { purchaseNumber: { contains: query.q, mode: 'insensitive' } },
            { supplierNameSnapshot: { contains: query.q, mode: 'insensitive' } },
            {
              items: {
                some: {
                  OR: [
                    { productNameBn: { contains: query.q, mode: 'insensitive' } },
                    { productNameEn: { contains: query.q, mode: 'insensitive' } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [totalItems, rows] = await Promise.all([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({
      where,
      include: purchaseInclude,
      orderBy: [{ purchasedAt: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: query.limit,
    }),
  ]);

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.limit);

  return {
    purchases: rows.map(toPurchaseDto),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
    },
  };
}

export async function getPurchaseById(shopId: string, purchaseId: string): Promise<PurchaseDto> {
  const purchase = await prisma.purchase.findFirst({
    where: {
      id: purchaseId,
      shopId,
    },
    include: purchaseInclude,
  });

  if (!purchase) {
    throw new NotFoundError('Purchase record not found');
  }

  return toPurchaseDto(purchase);
}
