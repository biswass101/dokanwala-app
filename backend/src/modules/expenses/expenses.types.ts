import type {
  ExpenseAuditLogDto,
  ExpenseAuditSnapshot,
  ExpenseCategoryDto,
  ExpenseDto,
} from '@dokanwala/shared';
import type { ExpenseCategory, Prisma } from '../../generated/prisma/client.js';

export const expenseInclude = {
  category: {
    select: {
      id: true,
      nameBn: true,
      nameEn: true,
    },
  },
  actorUser: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ExpenseInclude;

export type ExpenseWithRelations = Prisma.ExpenseGetPayload<{
  include: typeof expenseInclude;
}>;

export const expenseAuditLogInclude = {
  editedBy: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ExpenseAuditLogInclude;

export type ExpenseAuditLogWithRelations = Prisma.ExpenseAuditLogGetPayload<{
  include: typeof expenseAuditLogInclude;
}>;

export function toExpenseCategoryDto(row: ExpenseCategory): ExpenseCategoryDto {
  return {
    id: row.id,
    shopId: row.shopId,
    nameBn: row.nameBn,
    nameEn: row.nameEn,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toExpenseDto(row: ExpenseWithRelations): ExpenseDto {
  return {
    id: row.id,
    shopId: row.shopId,
    categoryId: row.categoryId,
    categoryNameBn: row.category.nameBn,
    categoryNameEn: row.category.nameEn,
    amountPoisha: row.amountPoisha,
    method: row.method,
    reference: row.reference,
    note: row.note,
    incurredAt: row.incurredAt.toISOString(),
    actorUserId: row.actorUserId,
    actorName: row.actorUser?.name ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function buildExpenseAuditSnapshot(expense: {
  categoryId: string;
  categoryNameSnapshot: string;
  amountPoisha: number;
  method: ExpenseDto['method'];
  reference: string | null;
  note: string | null;
  incurredAt: Date;
}): ExpenseAuditSnapshot {
  return {
    categoryId: expense.categoryId,
    categoryNameBn: expense.categoryNameSnapshot,
    amountPoisha: expense.amountPoisha,
    method: expense.method,
    reference: expense.reference,
    note: expense.note,
    incurredAt: expense.incurredAt.toISOString(),
  };
}

export function toExpenseAuditLogDto(row: ExpenseAuditLogWithRelations): ExpenseAuditLogDto {
  return {
    id: row.id,
    shopId: row.shopId,
    expenseId: row.expenseId,
    action: row.action,
    editedById: row.editedById,
    editedByName: row.editedBy?.name ?? null,
    beforeJson: (row.beforeJson as ExpenseAuditSnapshot | null) ?? null,
    afterJson: row.afterJson as unknown as ExpenseAuditSnapshot,
    reason: row.reason,
    occurredAt: row.occurredAt.toISOString(),
  };
}
