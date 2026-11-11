import { normalizeUnicodeText } from '@dokanwala/shared';
import { z } from 'zod';
import {
  decimalQuantitySchema,
  nfcOptionalString,
  nfcRequiredString,
  nonNegativePoishaSchema,
} from '../../shared/validators/common.js';

export const productUnitRuleSchema = z.strictObject({
  unitId: z.uuid('Invalid unit identifier'),
  conversionFactorToBase: decimalQuantitySchema({
    allowZero: false,
    decimals: 4,
    label: 'Conversion factor',
  }),
  sellingPricePoisha: nonNegativePoishaSchema.nullable().optional(),
});

export const openingStockSchema = z.strictObject({
  qtyDisplay: decimalQuantitySchema({
    allowZero: false,
    decimals: 4,
    label: 'Opening stock quantity',
  }),
  unitId: z.uuid('Invalid opening stock unit identifier'),
  unitCostPoisha: nonNegativePoishaSchema.optional(),
  totalCostPoisha: nonNegativePoishaSchema.optional(),
  reason: nfcOptionalString(300),
});

export const listProductsQuerySchema = z.strictObject({
  q: z
    .string()
    .trim()
    .max(120)
    .transform((v) => normalizeUnicodeText(v))
    .optional(),
  categoryId: z.uuid('Invalid category filter').optional(),
  lowStockOnly: z
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

export const createProductSchema = z.strictObject({
  id: z.uuid().optional(),
  nameBn: nfcRequiredString(1, 180),
  nameEn: nfcOptionalString(180),
  categoryId: z.uuid().nullable().optional(),
  barcode: nfcOptionalString(80),
  imageUrl: z.url('Invalid image URL').max(500).nullable().optional(),
  defaultSupplierName: nfcOptionalString(150),
  baseUnitId: z.uuid('Invalid base unit identifier'),
  defaultSaleUnitId: z.uuid('Invalid default sale unit identifier').optional(),
  defaultPurchaseUnitId: z.uuid('Invalid default purchase unit identifier').optional(),
  baseSellingPricePoisha: nonNegativePoishaSchema,
  lastPurchasePricePoisha: nonNegativePoishaSchema.optional().default(0),
  lowStockThresholdBase: decimalQuantitySchema({
    allowZero: true,
    decimals: 4,
    label: 'Low stock threshold',
  })
    .optional()
    .default('0.0000'),
  units: z.array(productUnitRuleSchema).max(20).optional().default([]),
  openingStock: openingStockSchema.optional(),
});

export const updateProductSchema = z.strictObject({
  nameBn: nfcRequiredString(1, 180).optional(),
  nameEn: nfcOptionalString(180),
  categoryId: z.uuid().nullable().optional(),
  barcode: nfcOptionalString(80),
  imageUrl: z.url('Invalid image URL').max(500).nullable().optional(),
  defaultSupplierName: nfcOptionalString(150),
  baseUnitId: z.uuid('Invalid base unit identifier').optional(),
  defaultSaleUnitId: z.uuid('Invalid default sale unit identifier').optional(),
  defaultPurchaseUnitId: z.uuid('Invalid default purchase unit identifier').optional(),
  baseSellingPricePoisha: nonNegativePoishaSchema.optional(),
  lastPurchasePricePoisha: nonNegativePoishaSchema.optional(),
  lowStockThresholdBase: decimalQuantitySchema({
    allowZero: true,
    decimals: 4,
    label: 'Low stock threshold',
  }).optional(),
  isActive: z.boolean().optional(),
  expectedVersion: z.number().int().min(1).optional(),
});

export const replaceProductUnitsSchema = z.strictObject({
  units: z.array(productUnitRuleSchema).max(20),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ReplaceProductUnitsInput = z.infer<typeof replaceProductUnitsSchema>;
export type ProductUnitRuleInput = z.infer<typeof productUnitRuleSchema>;
