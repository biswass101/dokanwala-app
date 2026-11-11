import { z } from 'zod';
import {
  bdPhoneSchema,
  nfcOptionalString,
  nfcRequiredString,
  passwordSchema,
  pinSchema,
} from '../../shared/validators/common.js';

export const registerSchema = z.strictObject({
  shopNameBn: nfcRequiredString(2, 150),
  shopNameEn: nfcOptionalString(150),
  shopAddressBn: nfcOptionalString(300),
  ownerName: nfcRequiredString(2, 120),
  phone: bdPhoneSchema,
  password: passwordSchema,
  pin: pinSchema.optional(),
  preferredLanguage: z.enum(['bn', 'en']).default('bn'),
  preferredDigitStyle: z.enum(['bn', 'en']).default('bn'),
  deviceName: z.string().trim().max(120).optional(),
});

export const loginSchema = z.strictObject({
  phone: bdPhoneSchema,
  password: z.string().min(1, 'Password is required').max(128),
  deviceName: z.string().trim().max(120).optional(),
});

export const pinLoginSchema = z.strictObject({
  phone: bdPhoneSchema,
  pin: pinSchema,
  deviceName: z.string().trim().max(120).optional(),
});

export const refreshTokenSchema = z.strictObject({
  refreshToken: z.string().trim().min(20, 'Valid refresh token is required').max(500),
});

export const logoutSchema = z.strictObject({
  refreshToken: z.string().trim().min(20).max(500).optional(),
});

export const setPinSchema = z.strictObject({
  currentPassword: z.string().min(1, 'Current password is required').max(128),
  pin: pinSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PinLoginInput = z.infer<typeof pinLoginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type SetPinInput = z.infer<typeof setPinSchema>;
