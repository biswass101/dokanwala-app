import type { AuthUserDto, DigitStyle, LanguageCode, ShopProfileDto, UserRole } from '@dokanwala/shared';
import { getLocalDatabase } from '../sqlite';

const PREF_KEY_LANGUAGE = 'language';
const PREF_KEY_DIGIT_STYLE = 'digit_style';

interface ShopRow {
  id: string;
  name_bn: string;
  name_en: string | null;
  address_bn: string | null;
  address_en: string | null;
  phone: string | null;
  logo_url: string | null;
  currency_code: string;
  timezone: string;
  default_language: LanguageCode;
  default_digit_style: DigitStyle;
  receipt_header_bn: string | null;
  receipt_footer_bn: string | null;
  allow_negative_stock: number;
  employee_can_give_credit: number;
  employee_max_discount_percent: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface UserRow {
  id: string;
  shop_id: string;
  name: string;
  phone: string;
  role: UserRole;
  has_pin: number;
  preferred_language: LanguageCode;
  preferred_digit_style: DigitStyle;
  is_active: number;
  created_at: string;
}

export async function saveLocalPreferences(
  language: LanguageCode,
  digitStyle: DigitStyle,
): Promise<void> {
  const db = await getLocalDatabase();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT OR REPLACE INTO app_preferences (key, value, updated_at_ms) VALUES (?, ?, ?)',
      PREF_KEY_LANGUAGE,
      language,
      now,
    );
    await db.runAsync(
      'INSERT OR REPLACE INTO app_preferences (key, value, updated_at_ms) VALUES (?, ?, ?)',
      PREF_KEY_DIGIT_STYLE,
      digitStyle,
      now,
    );
  });
}

export async function loadLocalPreferences(): Promise<{
  language: LanguageCode;
  digitStyle: DigitStyle;
} | null> {
  const db = await getLocalDatabase();
  const langRow = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_preferences WHERE key = ?',
    PREF_KEY_LANGUAGE,
  );
  const digitRow = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_preferences WHERE key = ?',
    PREF_KEY_DIGIT_STYLE,
  );

  if (!langRow && !digitRow) {
    return null;
  }

  return {
    language: langRow?.value === 'en' ? 'en' : 'bn',
    digitStyle: digitRow?.value === 'en' ? 'en' : 'bn',
  };
}

export async function saveLocalSessionData(
  user: AuthUserDto,
  shop: ShopProfileDto,
): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM users_local');
    await db.runAsync('DELETE FROM shops_local');

    await db.runAsync(
      `INSERT INTO shops_local (
        id, name_bn, name_en, address_bn, address_en, phone, logo_url,
        currency_code, timezone, default_language, default_digit_style,
        receipt_header_bn, receipt_footer_bn, allow_negative_stock,
        employee_can_give_credit, employee_max_discount_percent,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      shop.id,
      shop.nameBn,
      shop.nameEn,
      shop.addressBn,
      shop.addressEn,
      shop.phone,
      shop.logoUrl,
      shop.currencyCode,
      shop.timezone,
      shop.defaultLanguage,
      shop.defaultDigitStyle,
      shop.receiptHeaderBn,
      shop.receiptFooterBn,
      shop.allowNegativeStock ? 1 : 0,
      shop.employeeCanGiveCredit ? 1 : 0,
      shop.employeeMaxDiscountPercent,
      shop.isActive ? 1 : 0,
      shop.createdAt,
      shop.updatedAt,
    );

    await db.runAsync(
      `INSERT INTO users_local (
        id, shop_id, name, phone, role, has_pin,
        preferred_language, preferred_digit_style, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id,
      user.shopId,
      user.name,
      user.phone,
      user.role,
      user.hasPin ? 1 : 0,
      user.preferredLanguage,
      user.preferredDigitStyle,
      user.isActive ? 1 : 0,
      user.createdAt,
    );
  });
}

export async function loadLocalSessionData(): Promise<{
  user: AuthUserDto;
  shop: ShopProfileDto;
} | null> {
  const db = await getLocalDatabase();
  const userRow = await db.getFirstAsync<UserRow>('SELECT * FROM users_local LIMIT 1');
  const shopRow = await db.getFirstAsync<ShopRow>('SELECT * FROM shops_local LIMIT 1');

  if (!userRow || !shopRow) {
    return null;
  }

  return {
    user: {
      id: userRow.id,
      shopId: userRow.shop_id,
      name: userRow.name,
      phone: userRow.phone,
      role: userRow.role,
      hasPin: userRow.has_pin === 1,
      preferredLanguage: userRow.preferred_language,
      preferredDigitStyle: userRow.preferred_digit_style,
      isActive: userRow.is_active === 1,
      createdAt: userRow.created_at,
    },
    shop: {
      id: shopRow.id,
      nameBn: shopRow.name_bn,
      nameEn: shopRow.name_en,
      addressBn: shopRow.address_bn,
      addressEn: shopRow.address_en,
      phone: shopRow.phone,
      logoUrl: shopRow.logo_url,
      currencyCode: shopRow.currency_code,
      timezone: shopRow.timezone,
      defaultLanguage: shopRow.default_language,
      defaultDigitStyle: shopRow.default_digit_style,
      receiptHeaderBn: shopRow.receipt_header_bn,
      receiptFooterBn: shopRow.receipt_footer_bn,
      allowNegativeStock: shopRow.allow_negative_stock === 1,
      employeeCanGiveCredit: shopRow.employee_can_give_credit === 1,
      employeeMaxDiscountPercent: shopRow.employee_max_discount_percent,
      isActive: shopRow.is_active === 1,
      createdAt: shopRow.created_at,
      updatedAt: shopRow.updated_at,
    },
  };
}

export async function clearLocalSessionData(): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM users_local');
    await db.runAsync('DELETE FROM shops_local');
  });
}
