import { z } from 'zod';
import { nfcOptionalString, nfcRequiredString } from '../../shared/validators/common.js';

export const listCategoriesQuerySchema = z.strictObject({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const createCategorySchema = z.strictObject({
  nameBn: nfcRequiredString(1, 120),
  nameEn: nfcOptionalString(120),
  sortOrder: z.number().int().min(0).max(10_000).optional().default(100),
});

export const updateCategorySchema = z.strictObject({
  nameBn: nfcRequiredString(1, 120).optional(),
  nameEn: nfcOptionalString(120),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
