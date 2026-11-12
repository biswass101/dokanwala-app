import {
  addPoisha,
  type CustomerDto,
  type CustomerLedgerEntryDto,
  type CustomerPaymentDto,
  ErrorCodes,
  type PaginationMeta,
  type UserRole,
} from '@dokanwala/shared';
import { prisma } from '../../database/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/app-error.js';
import { getDhakaDayRangeUtc } from '../../shared/utils/timezone.js';
import { requireIdempotencyKey, type RequestMeta } from '../../shared/utils/transaction-helpers.js';
import { recordCashbookEntry } from '../cashbook/cashbook-ledger.helper.js';
import { recordSyncChange } from '../sync/sync-change.helper.js';
import type {
  CreateCustomerInput,
  CreateCustomerPaymentInput,
  CustomerLedgerQuery,
  ListCustomersQuery,
  UpdateCustomerInput,
} from './customers.schema.js';
import { customerPaymentInclude, toCustomerDto, toCustomerPaymentDto } from './customers.types.js';

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

export async function getCustomerById(shopId: string, customerId: string): Promise<CustomerDto> {
  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      shopId,
      deletedAt: null,
    },
  });

  if (!customer) {
    throw new NotFoundError('Customer not found');
  }

  return toCustomerDto(customer);
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

    await recordSyncChange(tx, {
      shopId,
      entityType: 'CUSTOMER',
      entityId: customer.id,
    });

    return customer;
  });

  return toCustomerDto(created);
}

export async function updateCustomer(
  shopId: string,
  actorUserId: string,
  customerId: string,
  input: UpdateCustomerInput,
  meta: RequestMeta,
): Promise<CustomerDto> {
  const existing = await prisma.customer.findFirst({
    where: {
      id: customerId,
      shopId,
      deletedAt: null,
    },
  });

  if (!existing) {
    throw new NotFoundError('Customer not found');
  }

  if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
    throw new ConflictError(
      'Customer record was modified on another device',
      ErrorCodes.VERSION_CONFLICT,
      { serverState: toCustomerDto(existing) },
    );
  }

  if (input.isActive === false && existing.duePoisha > 0 && !input.confirmWithDue) {
    throw new BusinessRuleError(
      'Customer has an outstanding due balance. Confirm archiving or collect dues first.',
      ErrorCodes.BUSINESS_RULE_VIOLATION,
      { duePoisha: existing.duePoisha },
    );
  }

  if (input.phone !== undefined && input.phone !== null && input.phone !== existing.phone) {
    const duplicate = await prisma.customer.findFirst({
      where: {
        shopId,
        phone: input.phone,
        deletedAt: null,
        NOT: { id: existing.id },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictError(
        'Another customer with this phone number already exists in your shop',
        ErrorCodes.DUPLICATE_RESOURCE,
        { field: 'phone' },
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.update({
      where: { id: existing.id },
      data: {
        ...(input.nameBn !== undefined ? { nameBn: input.nameBn } : {}),
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        version: { increment: 1 },
      },
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'CUSTOMER_UPDATED',
        entityType: 'Customer',
        entityId: existing.id,
        beforeJson: {
          nameBn: existing.nameBn,
          phone: existing.phone,
          isActive: existing.isActive,
        },
        afterJson: {
          nameBn: customer.nameBn,
          phone: customer.phone,
          isActive: customer.isActive,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    await recordSyncChange(tx, {
      shopId,
      entityType: 'CUSTOMER',
      entityId: customer.id,
    });

    return customer;
  });

  return toCustomerDto(updated);
}

export async function getCustomerLedger(
  shopId: string,
  customerId: string,
  query: CustomerLedgerQuery,
): Promise<{
  customer: CustomerDto;
  entries: CustomerLedgerEntryDto[];
}> {
  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      shopId,
      deletedAt: null,
    },
  });

  if (!customer) {
    throw new NotFoundError('Customer not found');
  }

  const [sales, returns, customerPayments] = await Promise.all([
    prisma.sale.findMany({
      where: { shopId, customerId },
      select: {
        id: true,
        receiptNumber: true,
        status: true,
        totalPoisha: true,
        paidPoisha: true,
        note: true,
        soldAt: true,
        cancelledAt: true,
        cancelReason: true,
        createdAt: true,
        payments: {
          select: { method: true },
          orderBy: [{ receivedAt: 'asc' }],
          take: 1,
        },
      },
      orderBy: [{ soldAt: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.saleReturn.findMany({
      where: {
        shopId,
        sale: { customerId },
      },
      select: {
        id: true,
        saleId: true,
        returnNumber: true,
        refundMethod: true,
        refundTotalPoisha: true,
        cashRefundPoisha: true,
        creditAdjustedPoisha: true,
        reason: true,
        returnedAt: true,
      },
      orderBy: [{ returnedAt: 'asc' }],
    }),
    prisma.customerPayment.findMany({
      where: { shopId, customerId },
      select: {
        id: true,
        saleId: true,
        method: true,
        amountPoisha: true,
        reference: true,
        note: true,
        paidAt: true,
        createdAt: true,
      },
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  interface RawEvent {
    id: string;
    type: CustomerLedgerEntryDto['type'];
    referenceId: string;
    referenceNumber: string | null;
    occurredAt: Date;
    tieCreatedAt: Date;
    typeRank: number;
    totalPoisha: number;
    paidOrRefundedPoisha: number;
    dueDeltaPoisha: number;
    method: CustomerLedgerEntryDto['method'];
    note: string | null;
  }

  const rawEvents: RawEvent[] = [];

  for (const s of sales) {
    const initialDue = s.totalPoisha - s.paidPoisha;
    rawEvents.push({
      id: `sale:${s.id}`,
      type: 'SALE',
      referenceId: s.id,
      referenceNumber: s.receiptNumber,
      occurredAt: s.soldAt,
      tieCreatedAt: s.createdAt,
      typeRank: 1,
      totalPoisha: s.totalPoisha,
      paidOrRefundedPoisha: s.paidPoisha,
      dueDeltaPoisha: initialDue,
      method: s.payments[0]?.method ?? null,
      note: s.note,
    });

    if (s.status === 'CANCELLED' && s.cancelledAt) {
      rawEvents.push({
        id: `cancel:${s.id}`,
        type: 'SALE_CANCEL',
        referenceId: s.id,
        referenceNumber: s.receiptNumber,
        occurredAt: s.cancelledAt,
        tieCreatedAt: s.cancelledAt,
        typeRank: 2,
        totalPoisha: s.totalPoisha,
        paidOrRefundedPoisha: s.paidPoisha,
        dueDeltaPoisha: -initialDue,
        method: null,
        note: s.cancelReason,
      });
    }
  }

  for (const r of returns) {
    rawEvents.push({
      id: `return:${r.id}`,
      type: 'SALE_RETURN',
      referenceId: r.saleId,
      referenceNumber: r.returnNumber,
      occurredAt: r.returnedAt,
      tieCreatedAt: r.returnedAt,
      typeRank: 3,
      totalPoisha: r.refundTotalPoisha,
      paidOrRefundedPoisha: r.cashRefundPoisha,
      dueDeltaPoisha: -r.creditAdjustedPoisha,
      method: r.refundMethod,
      note: r.reason,
    });
  }

  for (const cp of customerPayments) {
    rawEvents.push({
      id: `payment:${cp.id}`,
      type: 'CUSTOMER_PAYMENT',
      referenceId: cp.id,
      referenceNumber: cp.reference,
      occurredAt: cp.paidAt,
      tieCreatedAt: cp.createdAt,
      typeRank: 4,
      totalPoisha: cp.amountPoisha,
      paidOrRefundedPoisha: cp.amountPoisha,
      dueDeltaPoisha: -cp.amountPoisha,
      method: cp.method,
      note: cp.note,
    });
  }

  rawEvents.sort((a, b) => {
    const timeDiff = a.occurredAt.getTime() - b.occurredAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    const createdDiff = a.tieCreatedAt.getTime() - b.tieCreatedAt.getTime();
    if (createdDiff !== 0) return createdDiff;
    return a.typeRank - b.typeRank;
  });

  const fromUtc = query.from ? getDhakaDayRangeUtc(query.from).startUtc : null;
  const toUtc = query.to ? getDhakaDayRangeUtc(query.to).endUtc : null;

  let runningDuePoisha = 0;
  const entriesWithBalance: CustomerLedgerEntryDto[] = [];

  for (const ev of rawEvents) {
    runningDuePoisha += ev.dueDeltaPoisha;
    if (fromUtc && ev.occurredAt < fromUtc) continue;
    if (toUtc && ev.occurredAt > toUtc) continue;

    entriesWithBalance.push({
      id: ev.id,
      type: ev.type,
      referenceId: ev.referenceId,
      referenceNumber: ev.referenceNumber,
      occurredAt: ev.occurredAt.toISOString(),
      totalPoisha: ev.totalPoisha,
      paidOrRefundedPoisha: ev.paidOrRefundedPoisha,
      dueDeltaPoisha: ev.dueDeltaPoisha,
      runningDuePoisha,
      method: ev.method,
      note: ev.note,
    });
  }

  const limitedEntries =
    entriesWithBalance.length > query.limit
      ? entriesWithBalance.slice(entriesWithBalance.length - query.limit)
      : entriesWithBalance;

  return {
    customer: toCustomerDto(customer),
    entries: limitedEntries,
  };
}

export async function collectCustomerPayment(
  shopId: string,
  actorUserId: string,
  role: UserRole,
  customerId: string,
  input: CreateCustomerPaymentInput,
  meta: RequestMeta,
): Promise<{
  payment: CustomerPaymentDto;
  customer: CustomerDto;
  idempotencyReplayed: boolean;
}> {
  const idempotencyKey = requireIdempotencyKey(meta.idempotencyKey);

  const existingReplay = await prisma.customerPayment.findUnique({
    where: {
      shopId_idempotencyKey: {
        shopId,
        idempotencyKey,
      },
    },
    include: customerPaymentInclude,
  });

  if (existingReplay) {
    if (existingReplay.customerId !== customerId) {
      throw new ConflictError(
        'Idempotency key was already used for another customer payment',
        ErrorCodes.DUPLICATE_RESOURCE,
      );
    }
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    return {
      payment: toCustomerPaymentDto(existingReplay),
      customer: toCustomerDto(customer),
      idempotencyReplayed: true,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const shop = await tx.shop.findUnique({
        where: { id: shopId },
        select: { employeeCanGiveCredit: true },
      });
      if (!shop) {
        throw new NotFoundError('Shop not found');
      }
      if (role === 'EMPLOYEE' && !shop.employeeCanGiveCredit) {
        throw new ForbiddenError(
          'Employees are not permitted to collect customer credit dues in shop policy',
          ErrorCodes.FORBIDDEN_ROLE,
        );
      }

      const lockedCustomerRows = await tx.$queryRaw<
        Array<{
          id: string;
          total_paid_poisha: number;
          due_poisha: number;
          deleted_at: Date | null;
        }>
      >`
        SELECT id, total_paid_poisha, due_poisha, deleted_at
        FROM customers
        WHERE id = ${customerId}::uuid AND shop_id = ${shopId}::uuid
        FOR UPDATE
      `;

      const lockedCustomer = lockedCustomerRows[0];
      if (!lockedCustomer || lockedCustomer.deleted_at !== null) {
        throw new NotFoundError('Customer not found');
      }

      if (input.amountPoisha > lockedCustomer.due_poisha) {
        throw new BusinessRuleError(
          'Customer payment amount exceeds current outstanding due balance',
          ErrorCodes.BUSINESS_RULE_VIOLATION,
          {
            duePoisha: lockedCustomer.due_poisha,
            amountPoisha: input.amountPoisha,
          },
        );
      }

      if (input.saleId) {
        const targetSale = await tx.sale.findFirst({
          where: {
            id: input.saleId,
            shopId,
            customerId,
            status: { not: 'CANCELLED' },
          },
          select: { id: true },
        });
        if (!targetSale) {
          throw new NotFoundError('Referenced sale invoice not found for this customer');
        }
      }

      const openSales = await tx.$queryRaw<
        Array<{
          id: string;
          due_poisha: number;
        }>
      >`
        SELECT id, due_poisha
        FROM sales
        WHERE shop_id = ${shopId}::uuid
          AND customer_id = ${customerId}::uuid
          AND status <> 'CANCELLED'
          AND due_poisha > 0
        ORDER BY sold_at ASC, created_at ASC
        FOR UPDATE
      `;

      let remainingToAllocate = input.amountPoisha;

      if (input.saleId) {
        const prioritized = openSales.find((s) => s.id === input.saleId);
        if (prioritized && remainingToAllocate > 0) {
          const alloc = Math.min(remainingToAllocate, prioritized.due_poisha);
          if (alloc > 0) {
            await tx.sale.update({
              where: { id: prioritized.id },
              data: {
                settledDuePoisha: { increment: alloc },
                duePoisha: { decrement: alloc },
              },
            });
            remainingToAllocate -= alloc;
          }
        }
      }

      for (const openSale of openSales) {
        if (remainingToAllocate <= 0) break;
        if (openSale.id === input.saleId) continue;
        const alloc = Math.min(remainingToAllocate, openSale.due_poisha);
        if (alloc > 0) {
          await tx.sale.update({
            where: { id: openSale.id },
            data: {
              settledDuePoisha: { increment: alloc },
              duePoisha: { decrement: alloc },
            },
          });
          remainingToAllocate -= alloc;
        }
      }

      const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
      const payment = await tx.customerPayment.create({
        data: {
          ...(input.id !== undefined ? { id: input.id } : {}),
          shopId,
          customerId,
          saleId: input.saleId ?? null,
          method: input.method,
          amountPoisha: input.amountPoisha,
          reference: input.reference ?? null,
          note: input.note ?? null,
          idempotencyKey,
          actorUserId,
          paidAt,
        },
        include: customerPaymentInclude,
      });

      const updatedCustomer = await tx.customer.update({
        where: { id: customerId },
        data: {
          totalPaidPoisha: addPoisha(lockedCustomer.total_paid_poisha, input.amountPoisha),
          duePoisha: lockedCustomer.due_poisha - input.amountPoisha,
          version: { increment: 1 },
        },
      });

      await recordCashbookEntry(tx, {
        shopId,
        direction: 'IN',
        entryType: 'DUE_COLLECTION_IN',
        method: input.method,
        amountPoisha: input.amountPoisha,
        referenceType: 'CUSTOMER_PAYMENT',
        referenceId: payment.id,
        referenceNumber: input.reference ?? updatedCustomer.nameBn,
        note: input.note ?? updatedCustomer.nameBn,
        actorUserId,
        occurredAt: paidAt,
      });

      await tx.auditLog.create({
        data: {
          shopId,
          actorUserId,
          deviceId: meta.deviceId ?? null,
          action: 'CUSTOMER_PAYMENT_COLLECTED',
          entityType: 'CustomerPayment',
          entityId: payment.id,
          afterJson: {
            customerId,
            saleId: input.saleId ?? null,
            amountPoisha: input.amountPoisha,
            method: input.method,
            remainingDuePoisha: updatedCustomer.duePoisha,
          },
          ipAddress: meta.ipAddress ?? null,
        },
      });

      await recordSyncChange(tx, {
        shopId,
        entityType: 'CUSTOMER',
        entityId: customerId,
      });

      return {
        payment: toCustomerPaymentDto(payment),
        customer: toCustomerDto(updatedCustomer),
        idempotencyReplayed: false,
      };
    });

    return result;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.customerPayment.findUnique({
        where: {
          shopId_idempotencyKey: {
            shopId,
            idempotencyKey,
          },
        },
        include: customerPaymentInclude,
      });
      if (winner && winner.customerId === customerId) {
        const customer = await prisma.customer.findUniqueOrThrow({
          where: { id: customerId },
        });
        return {
          payment: toCustomerPaymentDto(winner),
          customer: toCustomerDto(customer),
          idempotencyReplayed: true,
        };
      }
    }
    throw err;
  }
}
