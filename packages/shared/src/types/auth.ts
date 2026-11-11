import type { DigitStyle, LanguageCode, UserRole } from '../constants/domain.js';
import { toEnglishDigits } from '../money/format-bdt.js';

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;
export const PASSWORD_MIN_LENGTH = 8;

export function normalizePinInput(raw: string): string {
  return toEnglishDigits(raw.trim()).replace(/\s+/g, '');
}

export function isValidPinFormat(raw: string): boolean {
  const normalized = normalizePinInput(raw);
  return new RegExp(`^\\d{${String(PIN_MIN_LENGTH)},${String(PIN_MAX_LENGTH)}}$`).test(normalized);
}

export interface ShopProfileDto {
  id: string;
  nameBn: string;
  nameEn: string | null;
  addressBn: string | null;
  addressEn: string | null;
  phone: string | null;
  logoUrl: string | null;
  currencyCode: string;
  timezone: string;
  defaultLanguage: LanguageCode;
  defaultDigitStyle: DigitStyle;
  receiptHeaderBn: string | null;
  receiptFooterBn: string | null;
  allowNegativeStock: boolean;
  employeeCanGiveCredit: boolean;
  employeeMaxDiscountPercent: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUserDto {
  id: string;
  shopId: string;
  name: string;
  phone: string;
  role: UserRole;
  hasPin: boolean;
  preferredLanguage: LanguageCode;
  preferredDigitStyle: DigitStyle;
  isActive: boolean;
  createdAt: string;
}

export interface StaffMemberDto extends AuthUserDto {
  updatedAt: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface AuthSessionResponse {
  user: AuthUserDto;
  shop: ShopProfileDto;
  tokens: AuthTokensDto;
}
