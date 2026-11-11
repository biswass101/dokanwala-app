import type {
  DigitStyle,
  LanguageCode,
  ShopProfileDto,
  StaffMemberDto,
} from '@dokanwala/shared';
import { unwrapApiGet, unwrapApiPatch, unwrapApiPost } from './client';

export interface UpdateShopPayload {
  nameBn?: string;
  nameEn?: string | null;
  addressBn?: string | null;
  addressEn?: string | null;
  phone?: string | null;
  defaultLanguage?: LanguageCode;
  defaultDigitStyle?: DigitStyle;
  receiptHeaderBn?: string | null;
  receiptFooterBn?: string | null;
  allowNegativeStock?: boolean;
  employeeCanGiveCredit?: boolean;
  employeeMaxDiscountPercent?: number;
}

export interface CreateEmployeePayload {
  name: string;
  phone: string;
  password: string;
  pin?: string;
  preferredLanguage?: LanguageCode;
  preferredDigitStyle?: DigitStyle;
}

export interface UpdateShopUserPayload {
  name?: string;
  isActive?: boolean;
  pin?: string | null;
}

export const shopApi = {
  getShop(): Promise<{ shop: ShopProfileDto }> {
    return unwrapApiGet<{ shop: ShopProfileDto }>('/shop');
  },
  updateShop(payload: UpdateShopPayload): Promise<{ shop: ShopProfileDto }> {
    return unwrapApiPatch<{ shop: ShopProfileDto }>('/shop', payload);
  },
  listUsers(): Promise<{ users: StaffMemberDto[] }> {
    return unwrapApiGet<{ users: StaffMemberDto[] }>('/shop/users');
  },
  createEmployee(payload: CreateEmployeePayload): Promise<{ user: StaffMemberDto }> {
    return unwrapApiPost<{ user: StaffMemberDto }>('/shop/users', payload);
  },
  updateUser(id: string, payload: UpdateShopUserPayload): Promise<{ user: StaffMemberDto }> {
    return unwrapApiPatch<{ user: StaffMemberDto }>(`/shop/users/${id}`, payload);
  },
};
