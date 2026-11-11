import type { AuthSessionResponse } from '@dokanwala/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PinKeypad } from '@/components';
import {
  clearLocalSessionData,
  loadLocalPreferences,
  loadLocalSessionData,
  saveLocalPreferences,
  saveLocalSessionData,
} from '@/database/repositories/session-local.repo';
import {
  resetLocalDatabaseInstanceForTests,
  type SqliteDatabaseAdapter,
} from '@/database/sqlite';
import LoginScreen from '@/app/(auth)/login';
import PinUnlockScreen from '@/app/(auth)/pin-unlock';
import { authApi } from '@/services/api/auth';
import {
  clearSecureAuthSession,
  getStoredRefreshToken,
  hasOfflinePinVerifier,
  saveAuthTokens,
  saveOfflinePinVerifier,
  verifyOfflinePin,
} from '@/services/auth/secure-session';
import { useAuthStore } from '@/store/auth.store';
import { usePreferencesStore } from '@/store/preferences.store';

function createFakeSqliteAdapter(): SqliteDatabaseAdapter {
  const prefs = new Map<string, string>();
  const users: Record<string, unknown>[] = [];
  const shops: Record<string, unknown>[] = [];

  return {
    async execAsync() {},
    async runAsync(source, ...params) {
      const sql = source.trim().toUpperCase();
      if (sql.includes('INTO APP_PREFERENCES')) {
        prefs.set(String(params[0]), String(params[1]));
      } else if (sql.startsWith('DELETE FROM USERS_LOCAL')) {
        users.length = 0;
      } else if (sql.startsWith('DELETE FROM SHOPS_LOCAL')) {
        shops.length = 0;
      } else if (sql.includes('INTO SHOPS_LOCAL')) {
        shops.push({
          id: params[0],
          name_bn: params[1],
          name_en: params[2],
          address_bn: params[3],
          address_en: params[4],
          phone: params[5],
          logo_url: params[6],
          currency_code: params[7],
          timezone: params[8],
          default_language: params[9],
          default_digit_style: params[10],
          receipt_header_bn: params[11],
          receipt_footer_bn: params[12],
          allow_negative_stock: params[13],
          employee_can_give_credit: params[14],
          employee_max_discount_percent: params[15],
          is_active: params[16],
          created_at: params[17],
          updated_at: params[18],
        });
      } else if (sql.includes('INTO USERS_LOCAL')) {
        users.push({
          id: params[0],
          shop_id: params[1],
          name: params[2],
          phone: params[3],
          role: params[4],
          has_pin: params[5],
          preferred_language: params[6],
          preferred_digit_style: params[7],
          is_active: params[8],
          created_at: params[9],
        });
      }
      return { changes: 1, lastInsertRowId: 1 };
    },
    async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
      const sql = source.trim().toUpperCase();
      if (sql.includes('FROM APP_PREFERENCES')) {
        const val = prefs.get(String(params[0]));
        return val !== undefined ? ({ value: val } as T) : null;
      }
      if (sql.includes('FROM USERS_LOCAL')) {
        return (users[0] as T | undefined) ?? null;
      }
      if (sql.includes('FROM SHOPS_LOCAL')) {
        return (shops[0] as T | undefined) ?? null;
      }
      return null;
    },
    async getAllAsync<T>() {
      return [] as T[];
    },
    async withTransactionAsync(task) {
      await task();
    },
  };
}

const sampleSession: AuthSessionResponse = {
  user: {
    id: 'user-1',
    shopId: 'shop-1',
    name: 'রহিম মালিক',
    phone: '+8801711223344',
    role: 'OWNER',
    hasPin: true,
    preferredLanguage: 'bn',
    preferredDigitStyle: 'bn',
    isActive: true,
    createdAt: '2026-11-12T00:00:00.000Z',
  },
  shop: {
    id: 'shop-1',
    nameBn: 'রহিম পান স্টোর',
    nameEn: 'Rahim Pan Store',
    addressBn: 'ঢাকা',
    addressEn: null,
    phone: '+8801711223344',
    logoUrl: null,
    currencyCode: 'BDT',
    timezone: 'Asia/Dhaka',
    defaultLanguage: 'bn',
    defaultDigitStyle: 'bn',
    receiptHeaderBn: null,
    receiptFooterBn: null,
    allowNegativeStock: false,
    employeeCanGiveCredit: true,
    employeeMaxDiscountPercent: 10,
    isActive: true,
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
  },
  tokens: {
    accessToken: 'jwt-access-1',
    refreshToken: 'refresh-token-1',
    expiresInSeconds: 900,
  },
};

describe('Phase 2 Offline PIN, Local SQLite & Auth UI', () => {
  beforeEach(async () => {
    resetLocalDatabaseInstanceForTests(createFakeSqliteAdapter());
    await clearSecureAuthSession();
    usePreferencesStore.getState().setLanguage('bn', false);
    useAuthStore.setState({
      status: 'unauthenticated',
      user: null,
      shop: null,
      hasOfflinePin: false,
      isOfflineSession: false,
    });
    jest.restoreAllMocks();
  });

  it('persists preferences and session cache in local SQLite repository', async () => {
    await saveLocalPreferences('bn', 'bn');
    expect(await loadLocalPreferences()).toEqual({ language: 'bn', digitStyle: 'bn' });

    await saveLocalSessionData(sampleSession.user, sampleSession.shop);
    const loaded = await loadLocalSessionData();
    expect(loaded?.user.name).toBe('রহিম মালিক');
    expect(loaded?.shop.nameBn).toBe('রহিম পান স্টোর');

    await clearLocalSessionData();
    expect(await loadLocalSessionData()).toBeNull();
  });

  it('verifies offline PIN with Bangla digits and enforces lockout + wipe', async () => {
    await saveAuthTokens('acc-1', 'ref-1');
    await saveOfflinePinVerifier('user-1', '১২৩৪');
    expect(await hasOfflinePinVerifier('user-1')).toBe(true);

    const ok = await verifyOfflinePin('user-1', '1234');
    expect(ok.ok).toBe(true);

    for (let i = 0; i < 4; i += 1) {
      const fail = await verifyOfflinePin('user-1', '0000');
      expect(fail).toMatchObject({ ok: false, reason: 'INVALID_PIN', remainingAttempts: 4 - i });
    }

    const locked = await verifyOfflinePin('user-1', '0000');
    expect(locked).toMatchObject({ ok: false, reason: 'LOCKED' });
    expect(await getStoredRefreshToken()).toBe('ref-1');
  });

  it('validates BD phone and submits normalized login credentials', async () => {
    const loginSpy = jest.spyOn(authApi, 'login').mockResolvedValueOnce(sampleSession);

    await render(<LoginScreen />);
    const phoneInput = screen.getByPlaceholderText('০১৭XXXXXXXX');
    const passwordInput = screen.getByPlaceholderText('কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড');

    await fireEvent.changeText(phoneInput, '০১৭১১২২৩৩৪৪');
    await fireEvent.changeText(passwordInput, 'StrongPassword123');
    await fireEvent.press(screen.getByRole('button', { name: 'প্রবেশ করুন' }));

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '+8801711223344',
          password: 'StrongPassword123',
        }),
      );
    });
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('renders PinKeypad with Bangla digits and unlocks offline session', async () => {
    await saveAuthTokens('acc-1', 'ref-1');
    await saveOfflinePinVerifier(sampleSession.user.id, '4321');
    useAuthStore.setState({
      status: 'locked',
      user: sampleSession.user,
      shop: sampleSession.shop,
      hasOfflinePin: true,
      isOfflineSession: true,
    });
    jest.spyOn(authApi, 'getMe').mockRejectedValue(new Error('Offline'));

    await render(<PinUnlockScreen />);
    expect(screen.getByText('রহিম পান স্টোর')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Digit 4' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Digit 3' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Digit 2' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Digit 1' }));
    await fireEvent.press(screen.getByRole('button', { name: 'খুলুন' }));

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('authenticated');
    });
  });

  it('displays localized Bangla numerals on PinKeypad', async () => {
    const onChange = jest.fn();
    await render(<PinKeypad value="" onChange={onChange} />);
    expect(screen.getByText('১')).toBeTruthy();
    expect(screen.getByText('৯')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Digit 5' }));
    expect(onChange).toHaveBeenCalledWith('5');
  });
});
