import { normalizeUnicodeText } from '@dokanwala/shared';
import { z } from 'zod';
import { decimalQuantitySchema, nonNegativePoishaSchema } from '../../shared/validators/common.js';

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

export const purchaseLineItemInputSchema = z.strictObject({
  productId: z.uuid('Invalid product identifier'),
  unitId: z.uuid('Invalid unit identifier'),
  qtyDisplay: decimalQuantitySchema({
    allowZero: false,
    decimals: 4,
    label: 'Purchase quantity',
  }),
  unitCostPoisha: nonNegativePoishaSchema,
});

export const createPurchaseSchema = z
  .strictObject({
    id: z.uuid().optional(),
    supplierId: z.uuid('Invalid supplier identifier').nullable().optional(),
    items: z
      .array(purchaseLineItemInputSchema)
      .min(1, 'Purchase must contain at least one item')
      .max(100),
    discountPoisha: nonNegativePoishaSchema.optional().default(0),
    paidPoisha: nonNegativePoishaSchema.optional().default(0),
    paymentMethod: z.enum(['CASH', 'BKASH', 'NAGAD', 'OTHER']).nullable().optional(),
    paymentReference: nullableNfcOptionalString(120),
    note: nullableNfcOptionalString(300),
    purchasedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.paidPoisha > 0 && !data.paymentMethod) {
      ctx.addIssue({
        code: 'custom',
        message: 'Payment method is required when paid amount is greater than zero',
        path: ['paymentMethod'],
      });
    }
  });

export const listPurchasesQuerySchema = z.strictObject({
  from: ymdDateSchema.optional(),
  to: ymdDateSchema.optional(),
  supplierId: z.uuid('Invalid supplier filter').optional(),
  status: z.enum(['COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED']).optional(),
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

export const purchaseReturnItemInputSchema = z.strictObject({
  purchaseItemId: z.uuid('Invalid purchase item identifier'),
  qtyDisplay: decimalQuantitySchema({
    allowZero: false,
    decimals: 4,
    label: 'Return quantity',
  }),
});

export const createPurchaseReturnSchema = z
  .strictObject({
    refundMethod: z.enum(['CASH', 'BKASH', 'NAGAD', 'OTHER', 'PAYABLE_ADJUSTMENT']),
    items: z
      .array(purchaseReturnItemInputSchema)
      .min(1, 'Purchase return must specify at least one item')
      .max(100),
    reason: nullableNfcOptionalString(300),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (const item of data.items) {
      if (seen.has(item.purchaseItemId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate purchaseItemId in return request',
          path: ['items'],
        });
        break;
      }
      seen.add(item.purchaseItemId);
    }
  });

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;
export type CreatePurchaseReturnInput = z.infer<typeof createPurchaseReturnSchema>;
