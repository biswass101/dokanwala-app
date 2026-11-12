import { normalizeUnicodeText } from '@dokanwala/shared';
import { z } from 'zod';
import { nfcRequiredString } from '../../shared/validators/common.js';

const ymdDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');

function nullableNfcOptionalString(max = 300) {
  return z
    .union([z.string(), z.null()])
    .transform((val, ctx) => {
      if (val === null) return null;
      const normalized = normalizeUnicodeText(val);
      if (normalized.length === 0) return null;
      if (normalized.length > max) {
        ctx.addIssue({
          code: 'custom',
          message: `Text cannot exceed ${String(max)} characters`,
        });
        return z.NEVER;
      }
      return normalized;
    })
    .optional();
}

export const listExpenseCategoriesQuerySchema = z.strictObject({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const createExpenseCategorySchema = z.strictObject({
  id: z.uuid().optional(),
  nameBn: nfcRequiredString(1, 120),
  nameEn: nullableNfcOptionalString(120),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export const updateExpenseCategorySchema = z.strictObject({
  nameBn: nfcRequiredString(1, 120).optional(),
  nameEn: nullableNfcOptionalString(120),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
  expectedVersion: z.number().int().min(1).optional(),
});

export const listExpensesQuerySchema = z.strictObject({
  categoryId: z.uuid('Invalid category filter').optional(),
  method: z.enum(['CASH', 'BKASH', 'NAGAD', 'OTHER']).optional(),
  from: ymdDateSchema.optional(),
  to: ymdDateSchema.optional(),
  q: z
    .string()
    .trim()
    .max(120)
    .transform((v) => normalizeUnicodeText(v))
    .optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const createExpenseSchema = z.strictObject({
  id: z.uuid().optional(),
  categoryId: z.uuid('Expense category is required'),
  amountPoisha: z
    .number()
    .int('Expense amount must be a whole integer in poisha')
    .min(1, 'Expense amount must be greater than zero')
    .max(Number.MAX_SAFE_INTEGER),
  method: z.enum(['CASH', 'BKASH', 'NAGAD', 'OTHER']),
  reference: nullableNfcOptionalString(120),
  note: nullableNfcOptionalString(300),
  incurredAt: z.iso.datetime({ offset: true }).optional(),
});

export const updateExpenseSchema = z.strictObject({
  categoryId: z.uuid().optional(),
  amountPoisha: z
    .number()
    .int('Expense amount must be a whole integer in poisha')
    .min(1, 'Expense amount must be greater than zero')
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  method: z.enum(['CASH', 'BKASH', 'NAGAD', 'OTHER']).optional(),
  reference: nullableNfcOptionalString(120),
  note: nullableNfcOptionalString(300),
  incurredAt: z.iso.datetime({ offset: true }).optional(),
  reason: nullableNfcOptionalString(300),
  expectedVersion: z.number().int().min(1).optional(),
});

export type ListExpenseCategoriesQuery = z.infer<typeof listExpenseCategoriesQuerySchema>;
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
