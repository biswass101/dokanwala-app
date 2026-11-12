import {
  ErrorCodes,
  type ExpenseAuditLogDto,
  type ExpenseCategoryDto,
  type ExpenseDto,
  type PaginationMeta,
} from '@dokanwala/shared';
import { prisma } from '../../database/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/app-error.js';
import { formatDhakaYmd, getDhakaDayRangeUtc } from '../../shared/utils/timezone.js';
import { requireIdempotencyKey, type RequestMeta } from '../../shared/utils/transaction-helpers.js';
import { recordCashbookEntry } from '../cashbook/cashbook-ledger.helper.js';
import { recordSyncChange } from '../sync/sync-change.helper.js';
import { ensureDefaultExpenseCategoriesForShop } from './expense-categories.seed.js';
import type {
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  ListExpenseCategoriesQuery,
  ListExpensesQuery,
  UpdateExpenseCategoryInput,
  UpdateExpenseInput,
} from './expenses.schema.js';
import {
  buildExpenseAuditSnapshot,
  expenseAuditLogInclude,
  expenseInclude,
  toExpenseAuditLogDto,
  toExpenseCategoryDto,
  toExpenseDto,
} from './expenses.types.js';

export async function listExpenseCategories(
  shopId: string,
  query: ListExpenseCategoriesQuery,
): Promise<ExpenseCategoryDto[]> {
  await ensureDefaultExpenseCategoriesForShop(shopId);

  const rows = await prisma.expenseCategory.findMany({
    where: {
      shopId,
      deletedAt: null,
      ...(query.includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ sortOrder: 'asc' }, { nameBn: 'asc' }],
  });

  return rows.map(toExpenseCategoryDto);
}

export async function createExpenseCategory(
  shopId: string,
  actorUserId: string,
  input: CreateExpenseCategoryInput,
  meta: RequestMeta,
): Promise<ExpenseCategoryDto> {
  const duplicate = await prisma.expenseCategory.findFirst({
    where: {
      shopId,
      nameBn: input.nameBn,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (duplicate) {
    throw new ConflictError(
      'An expense category with this Bangla name already exists',
      ErrorCodes.DUPLICATE_RESOURCE,
      { field: 'nameBn' },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const category = await tx.expenseCategory.create({
      data: {
        ...(input.id !== undefined ? { id: input.id } : {}),
        shopId,
        nameBn: input.nameBn,
        nameEn: input.nameEn ?? null,
        isDefault: false,
        sortOrder: input.sortOrder ?? 100,
      },
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'EXPENSE_CATEGORY_CREATED',
        entityType: 'ExpenseCategory',
        entityId: category.id,
        afterJson: {
          nameBn: category.nameBn,
          nameEn: category.nameEn,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    await recordSyncChange(tx, {
      shopId,
      entityType: 'EXPENSE_CATEGORY',
      entityId: category.id,
    });

    return category;
  });

  return toExpenseCategoryDto(created);
}

export async function updateExpenseCategory(
  shopId: string,
  actorUserId: string,
  categoryId: string,
  input: UpdateExpenseCategoryInput,
  meta: RequestMeta,
): Promise<ExpenseCategoryDto> {
  const existing = await prisma.expenseCategory.findFirst({
    where: {
      id: categoryId,
      shopId,
      deletedAt: null,
    },
  });

  if (!existing) {
    throw new NotFoundError('Expense category not found');
  }

  if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
    throw new ConflictError(
      'Expense category was modified on another device',
      ErrorCodes.VERSION_CONFLICT,
      { serverState: toExpenseCategoryDto(existing) },
    );
  }

  if (input.nameBn !== undefined && input.nameBn !== existing.nameBn) {
    const duplicate = await prisma.expenseCategory.findFirst({
      where: {
        shopId,
        nameBn: input.nameBn,
        deletedAt: null,
        NOT: { id: existing.id },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictError(
        'Another expense category with this Bangla name already exists',
        ErrorCodes.DUPLICATE_RESOURCE,
        { field: 'nameBn' },
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const category = await tx.expenseCategory.update({
      where: { id: existing.id },
      data: {
        ...(input.nameBn !== undefined ? { nameBn: input.nameBn } : {}),
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        version: { increment: 1 },
      },
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'EXPENSE_CATEGORY_UPDATED',
        entityType: 'ExpenseCategory',
        entityId: existing.id,
        beforeJson: {
          nameBn: existing.nameBn,
          isActive: existing.isActive,
        },
        afterJson: {
          nameBn: category.nameBn,
          isActive: category.isActive,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    await recordSyncChange(tx, {
      shopId,
      entityType: 'EXPENSE_CATEGORY',
      entityId: category.id,
    });

    return category;
  });

  return toExpenseCategoryDto(updated);
}

export async function listExpenses(
  shopId: string,
  query: ListExpensesQuery,
): Promise<{
  expenses: ExpenseDto[];
  totalExpensePoisha: number;
  pagination: PaginationMeta;
}> {
  const fromUtc = query.from ? getDhakaDayRangeUtc(query.from).startUtc : undefined;
  const toUtc = query.to ? getDhakaDayRangeUtc(query.to).endUtc : undefined;

  const where: Prisma.ExpenseWhereInput = {
    shopId,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.method ? { method: query.method } : {}),
    ...(fromUtc || toUtc
      ? {
          incurredAt: {
            ...(fromUtc ? { gte: fromUtc } : {}),
            ...(toUtc ? { lte: toUtc } : {}),
          },
        }
      : {}),
    ...(query.q && query.q.length > 0
      ? {
          OR: [
            { categoryNameSnapshot: { contains: query.q, mode: 'insensitive' } },
            { reference: { contains: query.q, mode: 'insensitive' } },
            { note: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [totalItems, aggregate, rows] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.aggregate({
      where,
      _sum: { amountPoisha: true },
    }),
    prisma.expense.findMany({
      where,
      include: expenseInclude,
      orderBy: [{ incurredAt: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: query.limit,
    }),
  ]);

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.limit);

  return {
    expenses: rows.map(toExpenseDto),
    totalExpensePoisha: aggregate._sum.amountPoisha ?? 0,
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
    },
  };
}

export async function getExpenseById(shopId: string, expenseId: string): Promise<ExpenseDto> {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, shopId },
    include: expenseInclude,
  });

  if (!expense) {
    throw new NotFoundError('Expense record not found');
  }

  return toExpenseDto(expense);
}

export async function createExpense(
  shopId: string,
  actorUserId: string,
  input: CreateExpenseInput,
  meta: RequestMeta,
): Promise<{ expense: ExpenseDto; idempotencyReplayed: boolean }> {
  const idempotencyKey = requireIdempotencyKey(meta.idempotencyKey);

  const existingReplay = await prisma.expense.findUnique({
    where: {
      shopId_idempotencyKey: {
        shopId,
        idempotencyKey,
      },
    },
    include: expenseInclude,
  });

  if (existingReplay) {
    return {
      expense: toExpenseDto(existingReplay),
      idempotencyReplayed: true,
    };
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const category = await tx.expenseCategory.findFirst({
        where: {
          id: input.categoryId,
          shopId,
          deletedAt: null,
          isActive: true,
        },
      });

      if (!category) {
        throw new NotFoundError('Selected expense category was not found or is inactive');
      }

      const incurredAt = input.incurredAt ? new Date(input.incurredAt) : new Date();
      const snapshot = buildExpenseAuditSnapshot({
        categoryId: category.id,
        categoryNameSnapshot: category.nameBn,
        amountPoisha: input.amountPoisha,
        method: input.method,
        reference: input.reference ?? null,
        note: input.note ?? null,
        incurredAt,
      });

      const expense = await tx.expense.create({
        data: {
          ...(input.id !== undefined ? { id: input.id } : {}),
          shopId,
          categoryId: category.id,
          categoryNameSnapshot: category.nameBn,
          amountPoisha: input.amountPoisha,
          method: input.method,
          reference: input.reference ?? null,
          note: input.note ?? null,
          incurredAt,
          idempotencyKey,
          actorUserId,
        },
        include: expenseInclude,
      });

      await tx.expenseAuditLog.create({
        data: {
          shopId,
          expenseId: expense.id,
          action: 'CREATED',
          editedById: actorUserId,
          beforeJson: Prisma.JsonNull,
          afterJson: snapshot as unknown as Prisma.InputJsonValue,
          reason: null,
          occurredAt: incurredAt,
        },
      });

      await recordCashbookEntry(tx, {
        shopId,
        direction: 'OUT',
        entryType: 'EXPENSE_OUT',
        method: input.method,
        amountPoisha: input.amountPoisha,
        referenceType: 'EXPENSE',
        referenceId: expense.id,
        referenceNumber: category.nameBn,
        note: input.note ?? null,
        actorUserId,
        occurredAt: incurredAt,
      });

      await tx.auditLog.create({
        data: {
          shopId,
          actorUserId,
          deviceId: meta.deviceId ?? null,
          action: 'EXPENSE_CREATED',
          entityType: 'Expense',
          entityId: expense.id,
          afterJson: snapshot as unknown as Prisma.InputJsonValue,
          ipAddress: meta.ipAddress ?? null,
        },
      });

      await recordSyncChange(tx, {
        shopId,
        entityType: 'EXPENSE',
        entityId: expense.id,
      });

      return expense;
    });

    return {
      expense: toExpenseDto(created),
      idempotencyReplayed: false,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.expense.findUnique({
        where: {
          shopId_idempotencyKey: {
            shopId,
            idempotencyKey,
          },
        },
        include: expenseInclude,
      });
      if (winner) {
        return {
          expense: toExpenseDto(winner),
          idempotencyReplayed: true,
        };
      }
    }
    throw err;
  }
}

export async function updateExpense(
  shopId: string,
  actorUserId: string,
  expenseId: string,
  input: UpdateExpenseInput,
  meta: RequestMeta,
): Promise<ExpenseDto> {
  const updated = await prisma.$transaction(async (tx) => {
    const existingRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM expenses
      WHERE id = ${expenseId}::uuid AND shop_id = ${shopId}::uuid
      FOR UPDATE
    `;

    if (!existingRows[0]) {
      throw new NotFoundError('Expense record not found');
    }

    const existing = await tx.expense.findUniqueOrThrow({
      where: { id: expenseId },
      include: expenseInclude,
    });

    if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
      throw new ConflictError(
        'Expense record was modified on another device',
        ErrorCodes.VERSION_CONFLICT,
        { serverState: toExpenseDto(existing) },
      );
    }

    let nextCategoryId = existing.categoryId;
    let nextCategoryNameSnapshot = existing.categoryNameSnapshot;
    if (input.categoryId !== undefined && input.categoryId !== existing.categoryId) {
      const nextCat = await tx.expenseCategory.findFirst({
        where: {
          id: input.categoryId,
          shopId,
          deletedAt: null,
          isActive: true,
        },
      });
      if (!nextCat) {
        throw new NotFoundError('Selected expense category was not found or is inactive');
      }
      nextCategoryId = nextCat.id;
      nextCategoryNameSnapshot = nextCat.nameBn;
    }

    const nextAmountPoisha = input.amountPoisha ?? existing.amountPoisha;
    const nextMethod = input.method ?? existing.method;
    const nextReference = input.reference !== undefined ? input.reference : existing.reference;
    const nextNote = input.note !== undefined ? input.note : existing.note;
    const nextIncurredAt = input.incurredAt ? new Date(input.incurredAt) : existing.incurredAt;

    const beforeSnapshot = buildExpenseAuditSnapshot(existing);
    const afterSnapshot = buildExpenseAuditSnapshot({
      categoryId: nextCategoryId,
      categoryNameSnapshot: nextCategoryNameSnapshot,
      amountPoisha: nextAmountPoisha,
      method: nextMethod,
      reference: nextReference,
      note: nextNote,
      incurredAt: nextIncurredAt,
    });

    const hasFieldChange =
      beforeSnapshot.categoryId !== afterSnapshot.categoryId ||
      beforeSnapshot.amountPoisha !== afterSnapshot.amountPoisha ||
      beforeSnapshot.method !== afterSnapshot.method ||
      beforeSnapshot.reference !== afterSnapshot.reference ||
      beforeSnapshot.note !== afterSnapshot.note ||
      beforeSnapshot.incurredAt !== afterSnapshot.incurredAt;

    if (!hasFieldChange) {
      throw new BusinessRuleError(
        'No changes detected in expense fields',
        ErrorCodes.BUSINESS_RULE_VIOLATION,
      );
    }

    const saved = await tx.expense.update({
      where: { id: existing.id },
      data: {
        categoryId: nextCategoryId,
        categoryNameSnapshot: nextCategoryNameSnapshot,
        amountPoisha: nextAmountPoisha,
        method: nextMethod,
        reference: nextReference,
        note: nextNote,
        incurredAt: nextIncurredAt,
        version: { increment: 1 },
      },
      include: expenseInclude,
    });

    await tx.expenseAuditLog.create({
      data: {
        shopId,
        expenseId: saved.id,
        action: 'UPDATED',
        editedById: actorUserId,
        beforeJson: beforeSnapshot as unknown as Prisma.InputJsonValue,
        afterJson: afterSnapshot as unknown as Prisma.InputJsonValue,
        reason: input.reason ?? null,
      },
    });

    const sameMethod = existing.method === nextMethod;
    const sameDhakaDay = formatDhakaYmd(existing.incurredAt) === formatDhakaYmd(nextIncurredAt);
    if (sameMethod && sameDhakaDay) {
      const deltaPoisha = nextAmountPoisha - existing.amountPoisha;
      if (deltaPoisha > 0) {
        await recordCashbookEntry(tx, {
          shopId,
          direction: 'OUT',
          entryType: 'EXPENSE_ADJUST_OUT',
          method: nextMethod,
          amountPoisha: deltaPoisha,
          referenceType: 'EXPENSE',
          referenceId: saved.id,
          referenceNumber: nextCategoryNameSnapshot,
          note: input.reason ?? nextNote ?? null,
          actorUserId,
          occurredAt: nextIncurredAt,
        });
      } else if (deltaPoisha < 0) {
        await recordCashbookEntry(tx, {
          shopId,
          direction: 'IN',
          entryType: 'EXPENSE_ADJUST_IN',
          method: nextMethod,
          amountPoisha: Math.abs(deltaPoisha),
          referenceType: 'EXPENSE',
          referenceId: saved.id,
          referenceNumber: nextCategoryNameSnapshot,
          note: input.reason ?? nextNote ?? null,
          actorUserId,
          occurredAt: nextIncurredAt,
        });
      }
    } else {
      await recordCashbookEntry(tx, {
        shopId,
        direction: 'IN',
        entryType: 'EXPENSE_ADJUST_IN',
        method: existing.method,
        amountPoisha: existing.amountPoisha,
        referenceType: 'EXPENSE',
        referenceId: saved.id,
        referenceNumber: existing.categoryNameSnapshot,
        note: input.reason ?? existing.note ?? null,
        actorUserId,
        occurredAt: existing.incurredAt,
      });
      await recordCashbookEntry(tx, {
        shopId,
        direction: 'OUT',
        entryType: 'EXPENSE_ADJUST_OUT',
        method: nextMethod,
        amountPoisha: nextAmountPoisha,
        referenceType: 'EXPENSE',
        referenceId: saved.id,
        referenceNumber: nextCategoryNameSnapshot,
        note: input.reason ?? nextNote ?? null,
        actorUserId,
        occurredAt: nextIncurredAt,
      });
    }

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'EXPENSE_UPDATED',
        entityType: 'Expense',
        entityId: saved.id,
        beforeJson: beforeSnapshot as unknown as Prisma.InputJsonValue,
        afterJson: afterSnapshot as unknown as Prisma.InputJsonValue,
        ipAddress: meta.ipAddress ?? null,
      },
    });

    await recordSyncChange(tx, {
      shopId,
      entityType: 'EXPENSE',
      entityId: saved.id,
    });

    return saved;
  });

  return toExpenseDto(updated);
}

export async function getExpenseAuditHistory(
  shopId: string,
  expenseId: string,
): Promise<{
  expense: ExpenseDto;
  history: ExpenseAuditLogDto[];
}> {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, shopId },
    include: expenseInclude,
  });

  if (!expense) {
    throw new NotFoundError('Expense record not found');
  }

  const logs = await prisma.expenseAuditLog.findMany({
    where: {
      shopId,
      expenseId,
    },
    include: expenseAuditLogInclude,
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  });

  return {
    expense: toExpenseDto(expense),
    history: logs.map(toExpenseAuditLogDto),
  };
}
