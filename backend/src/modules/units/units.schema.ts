import { z } from 'zod';
import { nfcRequiredString } from '../../shared/validators/common.js';

export const createUnitSchema = z.strictObject({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,30}$/, 'Unit code must contain 2–30 uppercase letters, numbers, or underscores'),
  nameBn: nfcRequiredString(1, 60),
  nameEn: nfcRequiredString(1, 60),
  isFractional: z.boolean().optional().default(false),
});

export const updateUnitSchema = z.strictObject({
  nameBn: nfcRequiredString(1, 60).optional(),
  nameEn: nfcRequiredString(1, 60).optional(),
  isFractional: z.boolean().optional(),
});

export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
