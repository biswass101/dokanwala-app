import { z } from 'zod';
import { decimalQuantitySchema, nfcOptionalString } from '../../shared/validators/common.js';

const ymdDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');

export const listMovementsQuerySchema = z.strictObject({
  productId: z.uuid('Invalid product filter').optional(),
  type: z
    .enum([
      'OPENING_STOCK',
      'PURCHASE_IN',
      'SALE_OUT',
      'RETURN_IN',
      'PURCHASE_RETURN_OUT',
      'COUNT_ADJUST',
      'WASTAGE_OUT',
      'DAMAGE_OUT',
      'EXPIRED_OUT',
    ])
    .optional(),
  from: ymdDateSchema.optional(),
  to: ymdDateSchema.optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const listAdjustmentsQuerySchema = z.strictObject({
  productId: z.uuid('Invalid product filter').optional(),
  adjustmentType: z.enum(['COUNT_ADJUST', 'WASTAGE', 'DAMAGE', 'EXPIRED']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const createStockAdjustmentSchema = z
  .strictObject({
    productId: z.uuid('Invalid product identifier'),
    adjustmentType: z.enum(['COUNT_ADJUST', 'WASTAGE', 'DAMAGE', 'EXPIRED']),
    unitId: z.uuid('Invalid unit identifier'),
    qtyDisplay: decimalQuantitySchema({
      allowZero: false,
      decimals: 4,
      label: 'Adjustment quantity',
    }).optional(),
    direction: z.enum(['INCREASE', 'DECREASE']).optional(),
    countedQtyDisplay: decimalQuantitySchema({
      allowZero: true,
      decimals: 4,
      label: 'Counted quantity',
    }).optional(),
    reason: nfcOptionalString(300),
  })
  .superRefine((data, ctx) => {
    if (data.adjustmentType === 'COUNT_ADJUST') {
      const hasCount = data.countedQtyDisplay !== undefined;
      const hasDelta = data.qtyDisplay !== undefined && data.direction !== undefined;
      if (!hasCount && !hasDelta) {
        ctx.addIssue({
          code: 'custom',
          message:
            'COUNT_ADJUST requires either countedQtyDisplay or both qtyDisplay and direction',
          path: ['countedQtyDisplay'],
        });
      }
      if (hasCount && data.qtyDisplay !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'Provide either countedQtyDisplay or qtyDisplay, not both',
          path: ['countedQtyDisplay'],
        });
      }
      return;
    }

    if (data.countedQtyDisplay !== undefined || data.direction === 'INCREASE') {
      ctx.addIssue({
        code: 'custom',
        message: 'WASTAGE, DAMAGE, and EXPIRED adjustments must decrease stock via qtyDisplay',
        path: ['adjustmentType'],
      });
    }
    if (data.qtyDisplay === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'qtyDisplay is required for WASTAGE, DAMAGE, and EXPIRED adjustments',
        path: ['qtyDisplay'],
      });
    }
  });

export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;
export type ListAdjustmentsQuery = z.infer<typeof listAdjustmentsQuerySchema>;
export type CreateStockAdjustmentInput = z.infer<typeof createStockAdjustmentSchema>;
