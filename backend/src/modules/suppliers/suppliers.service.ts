import {
  addPoisha,
  ErrorCodes,
  type PaginationMeta,
  type SupplierDto,
  type SupplierLedgerEntryDto,
  type SupplierPaymentDto,
} from '@dokanwala/shared';
import { prisma } from '../../database/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/app-error.js';
import { getDhakaDayRangeUtc } from '../../shared/utils/timezone.js';
import { requireIdempotencyKey, type RequestMeta } from '../../shared/utils/transaction-helpers.js';
import type {
  CreateSupplierInput,
  CreateSupplierPaymentInput,
  ListSuppliersQuery,
  SupplierLedgerQuery,
  UpdateSupplierInput,
} from './suppliers.schema.js';
import { supplierPaymentInclude, toSupplierDto, toSupplierPaymentDto } from './suppliers.types.js';

export async function listSuppliers(
  shopId: string,
  query: ListSuppliersQuery,
): Promise<{ suppliers: SupplierDto[]; pagination: PaginationMeta }> {
  const where: Prisma.SupplierWhereInput = {
    shopId,
    deletedAt: null,
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.withPayablesOnly ? { payablePoisha: { gt: 0 } } : {}),
    ...(query.q && query.q.length > 0
      ? {
          OR: [
            { nameBn: { contains: query.q, mode: 'insensitive' } },
            { nameEn: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: query.q, mode: 'insensitive' } },
            { address: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [totalItems, rows] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({
      where,
      orderBy: [{ payablePoisha: 'desc' }, { nameBn: 'asc' }],
      skip,
      take: query.limit,
    }),
  ]);

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.limit);

  return {
    suppliers: rows.map(toSupplierDto),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
    },
  };
}

export async function createSupplier(
  shopId: string,
  actorUserId: string,
  input: CreateSupplierInput,
  meta: RequestMeta,
): Promise<SupplierDto> {
  if (input.phone) {
    const duplicate = await prisma.supplier.findFirst({
      where: {
        shopId,
        phone: input.phone,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictError(
        'A supplier with this phone number already exists in your shop',
        ErrorCodes.DUPLICATE_RESOURCE,
        { field: 'phone' },
      );
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({
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
        action: 'SUPPLIER_CREATED',
        entityType: 'Supplier',
        entityId: supplier.id,
        afterJson: {
          nameBn: supplier.nameBn,
          phone: supplier.phone,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    return supplier;
  });

  return toSupplierDto(created);
}

export async function updateSupplier(
  shopId: string,
  actorUserId: string,
  supplierId: string,
  input: UpdateSupplierInput,
  meta: RequestMeta,
): Promise<SupplierDto> {
  const existing = await prisma.supplier.findFirst({
    where: {
      id: supplierId,
      shopId,
      deletedAt: null,
    },
  });

  if (!existing) {
    throw new NotFoundError('Supplier not found');
  }

  if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
    throw new ConflictError(
      'Supplier record was modified on another device',
      ErrorCodes.VERSION_CONFLICT,
      { serverState: toSupplierDto(existing) },
    );
  }

  if (input.isActive === false && existing.payablePoisha > 0 && !input.confirmWithPayable) {
    throw new BusinessRuleError(
      'Supplier has an outstanding payable balance. Confirm archiving or settle dues first.',
      ErrorCodes.BUSINESS_RULE_VIOLATION,
      { payablePoisha: existing.payablePoisha },
    );
  }

  if (input.phone !== undefined && input.phone !== null && input.phone !== existing.phone) {
    const duplicate = await prisma.supplier.findFirst({
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
        'Another supplier with this phone number already exists in your shop',
        ErrorCodes.DUPLICATE_RESOURCE,
        { field: 'phone' },
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.update({
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
        action: 'SUPPLIER_UPDATED',
        entityType: 'Supplier',
        entityId: existing.id,
        beforeJson: {
          nameBn: existing.nameBn,
          phone: existing.phone,
          isActive: existing.isActive,
        },
        afterJson: {
          nameBn: supplier.nameBn,
          phone: supplier.phone,
          isActive: supplier.isActive,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    return supplier;
  });

  return toSupplierDto(updated);
}

export async function getSupplierLedger(
  shopId: string,
  supplierId: string,
  query: SupplierLedgerQuery,
): Promise<{
  supplier: SupplierDto;
  entries: SupplierLedgerEntryDto[];
}> {
  const supplier = await prisma.supplier.findFirst({
    where: {
      id: supplierId,
      shopId,
      deletedAt: null,
    },
  });

  if (!supplier) {
    throw new NotFoundError('Supplier not found');
  }

  const [purchases, returns, payments] = await Promise.all([
    prisma.purchase.findMany({
      where: { shopId, supplierId },
      select: {
        id: true,
        purchaseNumber: true,
        totalPoisha: true,
        paidPoisha: true,
        paymentMethod: true,
        note: true,
        purchasedAt: true,
        createdAt: true,
      },
      orderBy: [{ purchasedAt: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.purchaseReturn.findMany({
      where: {
        shopId,
        purchase: { supplierId },
      },
      select: {
        id: true,
        purchaseId: true,
        returnNumber: true,
        refundMethod: true,
        refundTotalPoisha: true,
        cashRefundPoisha: true,
        payableAdjustedPoisha: true,
        reason: true,
        returnedAt: true,
      },
      orderBy: [{ returnedAt: 'asc' }],
    }),
    prisma.supplierPayment.findMany({
      where: { shopId, supplierId },
      select: {
        id: true,
        purchaseId: true,
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
    type: SupplierLedgerEntryDto['type'];
    referenceId: string;
    referenceNumber: string | null;
    occurredAt: Date;
    tieCreatedAt: Date;
    typeRank: number;
    totalPoisha: number;
    paidOrRefundedPoisha: number;
    payableDeltaPoisha: number;
    method: SupplierLedgerEntryDto['method'];
    note: string | null;
  }

  const rawEvents: RawEvent[] = [];

  for (const p of purchases) {
    rawEvents.push({
      id: `purchase:${p.id}`,
      type: 'PURCHASE',
      referenceId: p.id,
      referenceNumber: p.purchaseNumber,
      occurredAt: p.purchasedAt,
      tieCreatedAt: p.createdAt,
      typeRank: 1,
      totalPoisha: p.totalPoisha,
      paidOrRefundedPoisha: p.paidPoisha,
      payableDeltaPoisha: p.totalPoisha - p.paidPoisha,
      method: p.paymentMethod,
      note: p.note,
    });
  }

  for (const r of returns) {
    rawEvents.push({
      id: `return:${r.id}`,
      type: 'PURCHASE_RETURN',
      referenceId: r.purchaseId,
      referenceNumber: r.returnNumber,
      occurredAt: r.returnedAt,
      tieCreatedAt: r.returnedAt,
      typeRank: 2,
      totalPoisha: r.refundTotalPoisha,
      paidOrRefundedPoisha: r.cashRefundPoisha,
      payableDeltaPoisha: -r.payableAdjustedPoisha,
      method: r.refundMethod,
      note: r.reason,
    });
  }

  for (const sp of payments) {
    rawEvents.push({
      id: `payment:${sp.id}`,
      type: 'SUPPLIER_PAYMENT',
      referenceId: sp.id,
      referenceNumber: sp.reference,
      occurredAt: sp.paidAt,
      tieCreatedAt: sp.createdAt,
      typeRank: 3,
      totalPoisha: sp.amountPoisha,
      paidOrRefundedPoisha: sp.amountPoisha,
      payableDeltaPoisha: -sp.amountPoisha,
      method: sp.method,
      note: sp.note,
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

  let runningPayablePoisha = 0;
  const entriesWithBalance: SupplierLedgerEntryDto[] = [];

  for (const ev of rawEvents) {
    runningPayablePoisha += ev.payableDeltaPoisha;
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
      payableDeltaPoisha: ev.payableDeltaPoisha,
      runningPayablePoisha,
      method: ev.method,
      note: ev.note,
    });
  }

  const limitedEntries =
    entriesWithBalance.length > query.limit
      ? entriesWithBalance.slice(entriesWithBalance.length - query.limit)
      : entriesWithBalance;

  return {
    supplier: toSupplierDto(supplier),
    entries: limitedEntries,
  };
}

export async function createSupplierPayment(
  shopId: string,
  actorUserId: string,
  supplierId: string,
  input: CreateSupplierPaymentInput,
  meta: RequestMeta,
): Promise<{
  payment: SupplierPaymentDto;
  supplier: SupplierDto;
  idempotencyReplayed: boolean;
}> {
  const idempotencyKey = requireIdempotencyKey(meta.idempotencyKey);

  const existingReplay = await prisma.supplierPayment.findUnique({
    where: {
      shopId_idempotencyKey: {
        shopId,
        idempotencyKey,
      },
    },
    include: supplierPaymentInclude,
  });

  if (existingReplay) {
    if (existingReplay.supplierId !== supplierId) {
      throw new ConflictError(
        'Idempotency key was already used for another supplier payment',
        ErrorCodes.DUPLICATE_RESOURCE,
      );
    }
    const supplier = await prisma.supplier.findUniqueOrThrow({
      where: { id: supplierId },
    });
    return {
      payment: toSupplierPaymentDto(existingReplay),
      supplier: toSupplierDto(supplier),
      idempotencyReplayed: true,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const lockedSupplierRows = await tx.$queryRaw<
        Array<{
          id: string;
          total_paid_poisha: number;
          payable_poisha: number;
          deleted_at: Date | null;
        }>
      >`
        SELECT id, total_paid_poisha, payable_poisha, deleted_at
        FROM suppliers
        WHERE id = ${supplierId}::uuid AND shop_id = ${shopId}::uuid
        FOR UPDATE
      `;

      const lockedSupplier = lockedSupplierRows[0];
      if (!lockedSupplier || lockedSupplier.deleted_at !== null) {
        throw new NotFoundError('Supplier not found');
      }

      if (input.amountPoisha > lockedSupplier.payable_poisha) {
        throw new BusinessRuleError(
          'Supplier payment amount exceeds current payable balance',
          ErrorCodes.BUSINESS_RULE_VIOLATION,
          {
            payablePoisha: lockedSupplier.payable_poisha,
            amountPoisha: input.amountPoisha,
          },
        );
      }

      if (input.purchaseId) {
        const targetPurchase = await tx.purchase.findFirst({
          where: {
            id: input.purchaseId,
            shopId,
            supplierId,
          },
          select: { id: true },
        });
        if (!targetPurchase) {
          throw new NotFoundError('Referenced purchase bill not found for this supplier');
        }
      }

      const openPurchases = await tx.$queryRaw<
        Array<{
          id: string;
          due_poisha: number;
        }>
      >`
        SELECT id, due_poisha
        FROM purchases
        WHERE shop_id = ${shopId}::uuid
          AND supplier_id = ${supplierId}::uuid
          AND due_poisha > 0
        ORDER BY purchased_at ASC, created_at ASC
        FOR UPDATE
      `;

      let remainingToAllocate = input.amountPoisha;

      if (input.purchaseId) {
        const prioritized = openPurchases.find((p) => p.id === input.purchaseId);
        if (prioritized && remainingToAllocate > 0) {
          const alloc = Math.min(remainingToAllocate, prioritized.due_poisha);
          if (alloc > 0) {
            await tx.purchase.update({
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

      for (const openPurchase of openPurchases) {
        if (remainingToAllocate <= 0) break;
        if (openPurchase.id === input.purchaseId) continue;
        const alloc = Math.min(remainingToAllocate, openPurchase.due_poisha);
        if (alloc > 0) {
          await tx.purchase.update({
            where: { id: openPurchase.id },
            data: {
              settledDuePoisha: { increment: alloc },
              duePoisha: { decrement: alloc },
            },
          });
          remainingToAllocate -= alloc;
        }
      }

      const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
      const payment = await tx.supplierPayment.create({
        data: {
          ...(input.id !== undefined ? { id: input.id } : {}),
          shopId,
          supplierId,
          purchaseId: input.purchaseId ?? null,
          method: input.method,
          amountPoisha: input.amountPoisha,
          reference: input.reference ?? null,
          note: input.note ?? null,
          idempotencyKey,
          actorUserId,
          paidAt,
        },
        include: supplierPaymentInclude,
      });

      const updatedSupplier = await tx.supplier.update({
        where: { id: supplierId },
        data: {
          totalPaidPoisha: addPoisha(lockedSupplier.total_paid_poisha, input.amountPoisha),
          payablePoisha: lockedSupplier.payable_poisha - input.amountPoisha,
          version: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: {
          shopId,
          actorUserId,
          deviceId: meta.deviceId ?? null,
          action: 'SUPPLIER_PAYMENT_RECORDED',
          entityType: 'SupplierPayment',
          entityId: payment.id,
          afterJson: {
            supplierId,
            purchaseId: input.purchaseId ?? null,
            amountPoisha: input.amountPoisha,
            method: input.method,
            remainingPayablePoisha: updatedSupplier.payablePoisha,
          },
          ipAddress: meta.ipAddress ?? null,
        },
      });

      return {
        payment: toSupplierPaymentDto(payment),
        supplier: toSupplierDto(updatedSupplier),
        idempotencyReplayed: false,
      };
    });

    return result;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.supplierPayment.findUnique({
        where: {
          shopId_idempotencyKey: {
            shopId,
            idempotencyKey,
          },
        },
        include: supplierPaymentInclude,
      });
      if (winner && winner.supplierId === supplierId) {
        const supplier = await prisma.supplier.findUniqueOrThrow({
          where: { id: supplierId },
        });
        return {
          payment: toSupplierPaymentDto(winner),
          supplier: toSupplierDto(supplier),
          idempotencyReplayed: true,
        };
      }
    }
    throw err;
  }
}
