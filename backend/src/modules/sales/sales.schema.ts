import { normalizeNumericInput, normalizeUnicodeText } from '@dokanwala/shared';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import {
  decimalQuantitySchema,
  nfcOptionalString,
  nfcRequiredString,
  nonNegativePoishaSchema,
} from '../../shared/validators/common.js';

const ymdDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');

const positivePoishaSchema = z
  .number()
  .int('Amount in poisha must be an integer')
  .min(1, 'Payment amount must be greater than zero')
  .max(Number.MAX_SAFE_INTEGER);

const discountValueSchema = z.union([z.string(), z.number()]).transform((raw, ctx) => {
  const str = typeof raw === 'number' ? String(raw) : normalizeNumericInput(raw);
  if (!str || !/^\d+(?:\.\d+)?$/.test(str)) {
    ctx.addIssue({ code: 'custom', message: 'Discount value must be a valid non-negative number' });
    return z.NEVER;
  }
  try {
    const dec = new Decimal(str);
    if (!dec.isFinite() || dec.isNegative()) {
      ctx.addIssue({ code: 'custom', message: 'Discount value cannot be negative' });
      return z.NEVER;
    }
    return dec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Discount value is invalid' });
    return z.NEVER;
  }
});

export const saleLineItemInputSchema = z.strictObject({
  productId: z.uuid('Invalid product identifier'),
  unitId: z.uuid('Invalid unit identifier'),
  qtyDisplay: decimalQuantitySchema({
    allowZero: false,
    decimals: 4,
    label: 'Sale quantity',
  }),
});

export const salePaymentInputSchema = z.strictObject({
  method: z.enum(['CASH', 'BKASH', 'NAGAD', 'OTHER']),
  amountPoisha: positivePoishaSchema,
  reference: nfcOptionalString(120),
});

export const createSaleSchema = z
  .strictObject({
    id: z.uuid().optional(),
    customerId: z.uuid('Invalid customer identifier').nullable().optional(),
    items: z.array(saleLineItemInputSchema).min(1, 'Sale must contain at least one item').max(100),
    discountType: z.enum(['FIXED_POISHA', 'PERCENT']).optional().default('FIXED_POISHA'),
    discountValue: discountValueSchema.optional().default('0.00'),
    payments: z.array(salePaymentInputSchema).max(20).optional().default([]),
    tenderedPoisha: nonNegativePoishaSchema.nullable().optional(),
    note: nfcOptionalString(300),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === 'PERCENT') {
      const pct = new Decimal(data.discountValue);
      if (pct.gt(100)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Percentage discount cannot exceed 100%',
          path: ['discountValue'],
        });
      }
    } else {
      const fixed = new Decimal(data.discountValue);
      if (!fixed.isInteger()) {
        ctx.addIssue({
          code: 'custom',
          message: 'Fixed discount in poisha must be a whole integer',
          path: ['discountValue'],
        });
      }
    }
  });

export const listSalesQuerySchema = z.strictObject({
  from: ymdDateSchema.optional(),
  to: ymdDateSchema.optional(),
  status: z.enum(['COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED', 'CANCELLED']).optional(),
  customerId: z.uuid('Invalid customer filter').optional(),
  dueOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  q: z
    .string()
    .trim()
    .max(120)
    .transform((v) => normalizeUnicodeText(v))
    .optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

export const saleReturnItemInputSchema = z.strictObject({
  saleItemId: z.uuid('Invalid sale item identifier'),
  qtyDisplay: decimalQuantitySchema({
    allowZero: false,
    decimals: 4,
    label: 'Return quantity',
  }),
});

export const createSaleReturnSchema = z
  .strictObject({
    refundMethod: z.enum(['CASH', 'BKASH', 'NAGAD', 'OTHER', 'CREDIT_ADJUSTMENT']),
    items: z
      .array(saleReturnItemInputSchema)
      .min(1, 'Return must specify at least one item')
      .max(100),
    reason: nfcOptionalString(300),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (const item of data.items) {
      if (seen.has(item.saleItemId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate saleItemId in return request',
          path: ['items'],
        });
        break;
      }
      seen.add(item.saleItemId);
    }
  });

export const cancelSaleSchema = z.strictObject({
  reason: nfcRequiredString(2, 300),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;
export type CreateSaleReturnInput = z.infer<typeof createSaleReturnSchema>;
export type CancelSaleInput = z.infer<typeof cancelSaleSchema>;
