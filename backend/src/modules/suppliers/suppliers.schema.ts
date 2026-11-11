import { normalizeBdPhone, normalizeUnicodeText } from '@dokanwala/shared';
import { z } from 'zod';
import { nfcRequiredString } from '../../shared/validators/common.js';

const ymdDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');

const optionalBdPhoneSchema = z
  .union([z.string(), z.null()])
  .transform((val, ctx) => {
    if (val === null) return null;
    const trimmed = val.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > 20) {
      ctx.addIssue({ code: 'custom', message: 'Phone number cannot exceed 20 characters' });
      return z.NEVER;
    }
    const normalized = normalizeBdPhone(trimmed);
    if (!normalized) {
      ctx.addIssue({
        code: 'custom',
        message: 'Must be a valid Bangladeshi mobile number (e.g. 017XXXXXXXX)',
      });
      return z.NEVER;
    }
    return normalized;
  })
  .optional();

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

export const listSuppliersQuerySchema = z.strictObject({
  q: z
    .string()
    .trim()
    .max(120)
    .transform((v) => normalizeUnicodeText(v))
    .optional(),
  withPayablesOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const createSupplierSchema = z.strictObject({
  id: z.uuid().optional(),
  nameBn: nfcRequiredString(1, 150),
  nameEn: nullableNfcOptionalString(150),
  phone: optionalBdPhoneSchema,
  address: nullableNfcOptionalString(300),
  note: nullableNfcOptionalString(300),
});

export const updateSupplierSchema = z.strictObject({
  nameBn: nfcRequiredString(1, 150).optional(),
  nameEn: nullableNfcOptionalString(150),
  phone: optionalBdPhoneSchema,
  address: nullableNfcOptionalString(300),
  note: nullableNfcOptionalString(300),
  isActive: z.boolean().optional(),
  confirmWithPayable: z.boolean().optional().default(false),
  expectedVersion: z.number().int().min(1).optional(),
});

export const supplierLedgerQuerySchema = z.strictObject({
  from: ymdDateSchema.optional(),
  to: ymdDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
});

export const createSupplierPaymentSchema = z.strictObject({
  id: z.uuid().optional(),
  purchaseId: z.uuid('Invalid purchase identifier').nullable().optional(),
  method: z.enum(['CASH', 'BKASH', 'NAGAD', 'OTHER']),
  amountPoisha: z
    .number()
    .int('Payment amount must be a whole integer in poisha')
    .min(1, 'Payment amount must be greater than zero')
    .max(Number.MAX_SAFE_INTEGER),
  reference: nullableNfcOptionalString(120),
  note: nullableNfcOptionalString(300),
  paidAt: z.iso.datetime({ offset: true }).optional(),
});

export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type SupplierLedgerQuery = z.infer<typeof supplierLedgerQuerySchema>;
export type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema>;
