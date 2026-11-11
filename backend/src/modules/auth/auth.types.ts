import type { AuthUserDto, ShopProfileDto, StaffMemberDto } from '@dokanwala/shared';
import type { Shop, User } from '../../generated/prisma/client.js';

export function toAuthUserDto(user: User): AuthUserDto {
  return {
    id: user.id,
    shopId: user.shopId,
    name: user.name,
    phone: user.phone,
    role: user.role,
    hasPin: user.pinHash !== null,
    preferredLanguage: user.preferredLanguage,
    preferredDigitStyle: user.preferredDigitStyle,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toStaffMemberDto(user: User): StaffMemberDto {
  return {
    ...toAuthUserDto(user),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toShopProfileDto(shop: Shop): ShopProfileDto {
  return {
    id: shop.id,
    nameBn: shop.nameBn,
    nameEn: shop.nameEn,
    addressBn: shop.addressBn,
    addressEn: shop.addressEn,
    phone: shop.phone,
    logoUrl: shop.logoUrl,
    currencyCode: shop.currencyCode,
    timezone: shop.timezone,
    defaultLanguage: shop.defaultLanguage,
    defaultDigitStyle: shop.defaultDigitStyle,
    receiptHeaderBn: shop.receiptHeaderBn,
    receiptFooterBn: shop.receiptFooterBn,
    allowNegativeStock: shop.allowNegativeStock,
    employeeCanGiveCredit: shop.employeeCanGiveCredit,
    employeeMaxDiscountPercent: shop.employeeMaxDiscountPercent,
    isActive: shop.isActive,
    createdAt: shop.createdAt.toISOString(),
    updatedAt: shop.updatedAt.toISOString(),
  };
}
