import type { PaginationMeta, SaleDto, UserRole } from '@dokanwala/shared';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotFoundError } from '../../shared/errors/app-error.js';
import { getDhakaDayRangeUtc } from '../../shared/utils/timezone.js';
import type { ListSalesQuery } from './sales.schema.js';
import { saleInclude, toSaleDto } from './sales.types.js';

export { createSale } from './sales-create.service.js';
export { cancelSale, createSaleReturn } from './sales-return-cancel.service.js';

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
