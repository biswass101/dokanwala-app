export const UserRoles = {
  OWNER: 'OWNER',
  EMPLOYEE: 'EMPLOYEE',
} as const;

export type UserRole = (typeof UserRoles)[keyof typeof UserRoles];

export const PaymentMethods = {
  CASH: 'CASH',
  BKASH: 'BKASH',
  NAGAD: 'NAGAD',
  OTHER: 'OTHER',
} as const;

export type PaymentMethod = (typeof PaymentMethods)[keyof typeof PaymentMethods];

export const LanguageCodes = {
  BN: 'bn',
  EN: 'en',
} as const;

export type LanguageCode = (typeof LanguageCodes)[keyof typeof LanguageCodes];

export const DigitStyles = {
  BN: 'bn',
  EN: 'en',
} as const;

export type DigitStyle = (typeof DigitStyles)[keyof typeof DigitStyles];

export const SyncStatuses = {
  SYNCED: 'SYNCED',
  PENDING: 'PENDING',
  CONFLICT: 'CONFLICT',
} as const;

export type SyncStatus = (typeof SyncStatuses)[keyof typeof SyncStatuses];

export const BDT_CURRENCY_SYMBOL = '৳';
export const DEFAULT_CURRENCY_CODE = 'BDT';
export const DEFAULT_TIMEZONE = 'Asia/Dhaka';
export const POISHA_PER_BDT = 100;
