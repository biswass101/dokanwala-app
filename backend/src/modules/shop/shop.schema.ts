import { z } from 'zod';
import {
  bdPhoneSchema,
  nfcOptionalString,
  nfcRequiredString,
  passwordSchema,
  pinSchema,
} from '../../shared/validators/common.js';

export const updateShopSchema = z.strictObject({
  nameBn: nfcRequiredString(2, 150).optional(),
  nameEn: nfcOptionalString(150),
  addressBn: nfcOptionalString(300),
  addressEn: nfcOptionalString(300),
  phone: bdPhoneSchema.nullable().optional(),
  defaultLanguage: z.enum(['bn', 'en']).optional(),
  defaultDigitStyle: z.enum(['bn', 'en']).optional(),
  receiptHeaderBn: nfcOptionalString(300),
  receiptFooterBn: nfcOptionalString(300),
  allowNegativeStock: z.boolean().optional(),
  employeeCanGiveCredit: z.boolean().optional(),
  employeeMaxDiscountPercent: z.number().int().min(0).max(100).optional(),
});

export const createEmployeeSchema = z.strictObject({
  name: nfcRequiredString(2, 120),
  phone: bdPhoneSchema,
  password: passwordSchema,
  pin: pinSchema.optional(),
  preferredLanguage: z.enum(['bn', 'en']).default('bn'),
  preferredDigitStyle: z.enum(['bn', 'en']).default('bn'),
});

export const updateShopUserSchema = z.strictObject({
  name: nfcRequiredString(2, 120).optional(),
  isActive: z.boolean().optional(),
  pin: pinSchema.nullable().optional(),
  preferredLanguage: z.enum(['bn', 'en']).optional(),
  preferredDigitStyle: z.enum(['bn', 'en']).optional(),
});

export type UpdateShopInput = z.infer<typeof updateShopSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateShopUserInput = z.infer<typeof updateShopUserSchema>;
