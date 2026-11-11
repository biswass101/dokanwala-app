import { type CustomerDto, ErrorCodes, type PaginationMeta } from '@dokanwala/shared';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ConflictError } from '../../shared/errors/app-error.js';
import type { CreateCustomerInput, ListCustomersQuery } from './customers.schema.js';
import { toCustomerDto } from './customers.types.js';

interface RequestMeta {
  deviceId?: string;
  ipAddress?: string;
}

export async function listCustomers(
  shopId: string,
  query: ListCustomersQuery,
): Promise<{ customers: CustomerDto[]; pagination: PaginationMeta }> {
  const where: Prisma.CustomerWhereInput = {
    shopId,
    deletedAt: null,
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.withDuesOnly ? { duePoisha: { gt: 0 } } : {}),
    ...(query.q && query.q.length > 0
      ? {
          OR: [
            { nameBn: { contains: query.q, mode: 'insensitive' } },
            { nameEn: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [totalItems, rows] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: [{ duePoisha: 'desc' }, { nameBn: 'asc' }],
      skip,
      take: query.limit,
    }),
  ]);

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.limit);

  return {
    customers: rows.map(toCustomerDto),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
    },
  };
}

export async function createCustomer(
  shopId: string,
  actorUserId: string,
  input: CreateCustomerInput,
  meta: RequestMeta,
): Promise<CustomerDto> {
  if (input.phone) {
    const duplicate = await prisma.customer.findFirst({
      where: {
        shopId,
        phone: input.phone,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictError(
        'A customer with this phone number already exists in your shop',
        ErrorCodes.DUPLICATE_RESOURCE,
        { field: 'phone' },
      );
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        ...(input.id !== undefined ? { id: input.id } : {}),
        shopId,
        nameBn: input.nameBn,
        nameEn: input.nameEn ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        note: input.note ?? null,
      },
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'CUSTOMER_CREATED',
        entityType: 'Customer',
        entityId: customer.id,
        afterJson: {
          nameBn: customer.nameBn,
          phone: customer.phone,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    return customer;
  });

  return toCustomerDto(created);
}
