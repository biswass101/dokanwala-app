import type { AuthSessionResponse, AuthUserDto, ShopProfileDto } from '@dokanwala/shared';
import { create } from 'zustand';
import { clearLocalCatalogData } from '@/database/repositories/catalog-local.repo';
import { clearLocalCustomersExpensesData } from '@/database/repositories/customers-expenses-local.repo';
import { clearLocalPurchasesData } from '@/database/repositories/purchases-local.repo';
import { clearLocalSalesData } from '@/database/repositories/sales-local.repo';
import {
  clearLocalSessionData,
  loadLocalPreferences,
  loadLocalSessionData,
  saveLocalPreferences,
  saveLocalSessionData,
} from '@/database/repositories/session-local.repo';
import { getLocalDatabase } from '@/database/sqlite';
import { authApi } from '@/services/api/auth';
import { ApiClientError, registerSessionInvalidatedHandler } from '@/services/api/client';
import {
  clearSecureAuthSession,
  getStoredRefreshToken,
  hasOfflinePinVerifier,
  saveAuthTokens,
  saveOfflinePinVerifier,
  verifyOfflinePin,
  type OfflinePinVerifyResult,
} from '@/services/auth/secure-session';
import { useCartStore } from '@/store/cart.store';
import { usePreferencesStore } from '@/store/preferences.store';

export type AuthStatus = 'booting' | 'unauthenticated' | 'locked' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  user: AuthUserDto | null;
  shop: ShopProfileDto | null;
  hasOfflinePin: boolean;
  isOfflineSession: boolean;
  bootstrapSession: () => Promise<void>;
  completeOnlineAuth: (session: AuthSessionResponse, plainPin?: string) => Promise<void>;
  updateLocalShop: (shop: ShopProfileDto) => Promise<void>;
  updateLocalUserPin: (user: AuthUserDto, plainPin: string) => Promise<void>;
  unlockWithPinOffline: (plainPin: string) => Promise<OfflinePinVerifyResult>;
  lockApp: () => void;
  logout: () => Promise<void>;
  clearLocalAuthOnly: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'booting',
  user: null,
  shop: null,
  hasOfflinePin: false,
  isOfflineSession: false,

  bootstrapSession: async () => {
    registerSessionInvalidatedHandler(async () => {
      await get().clearLocalAuthOnly();
    });

    await getLocalDatabase();

    const savedPrefs = await loadLocalPreferences();
    if (savedPrefs) {
      usePreferencesStore.getState().setLanguage(savedPrefs.language);
      usePreferencesStore.getState().setDigitStyle(savedPrefs.digitStyle);
    }

    const [refreshToken, localSession] = await Promise.all([
      getStoredRefreshToken(),
      loadLocalSessionData(),
    ]);

    if (!refreshToken || !localSession) {
      set({
        status: 'unauthenticated',
        user: null,
        shop: null,
        hasOfflinePin: false,
        isOfflineSession: false,
      });
      return;
    }

    const pinConfigured = await hasOfflinePinVerifier(localSession.user.id);
    if (pinConfigured) {
      set({
        status: 'locked',
        user: localSession.user,
        shop: localSession.shop,
        hasOfflinePin: true,
        isOfflineSession: true,
      });
      return;
    }

    try {
      const freshProfile = await authApi.getMe();
      await saveLocalSessionData(freshProfile.user, freshProfile.shop);
      set({
        status: 'authenticated',
        user: freshProfile.user,
        shop: freshProfile.shop,
        hasOfflinePin: false,
        isOfflineSession: false,
      });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'NETWORK_ERROR') {
        set({
          status: 'authenticated',
          user: localSession.user,
          shop: localSession.shop,
          hasOfflinePin: false,
          isOfflineSession: true,
        });
        return;
      }
      await get().clearLocalAuthOnly();
    }
  },

  completeOnlineAuth: async (session, plainPin) => {
    await saveAuthTokens(session.tokens.accessToken, session.tokens.refreshToken);
    if (plainPin) {
      await saveOfflinePinVerifier(session.user.id, plainPin);
    }
    await saveLocalSessionData(session.user, session.shop);

    const prefs = usePreferencesStore.getState();
    prefs.setLanguage(session.user.preferredLanguage);
    prefs.setDigitStyle(session.user.preferredDigitStyle);
    await saveLocalPreferences(session.user.preferredLanguage, session.user.preferredDigitStyle);

    const pinConfigured = await hasOfflinePinVerifier(session.user.id);
    set({
      status: 'authenticated',
      user: session.user,
      shop: session.shop,
      hasOfflinePin: pinConfigured,
      isOfflineSession: false,
    });
  },

  updateLocalShop: async (shop) => {
    const currentUser = get().user;
    if (currentUser) {
      await saveLocalSessionData(currentUser, shop);
    }
    set({ shop });
  },

  updateLocalUserPin: async (user, plainPin) => {
    await saveOfflinePinVerifier(user.id, plainPin);
    const currentShop = get().shop;
    if (currentShop) {
      await saveLocalSessionData(user, currentShop);
    }
    set({ user, hasOfflinePin: true });
  },

  unlockWithPinOffline: async (plainPin) => {
    const currentUser = get().user;
    if (!currentUser) {
      return { ok: false, reason: 'NOT_CONFIGURED' };
    }
    const result = await verifyOfflinePin(currentUser.id, plainPin);
    if (result.ok) {
      set({ status: 'authenticated' });
      // Silently refresh profile in background if internet is available
      void authApi
        .getMe()
        .then(async (fresh) => {
          await saveLocalSessionData(fresh.user, fresh.shop);
          set({
            user: fresh.user,
            shop: fresh.shop,
            isOfflineSession: false,
          });
        })
        .catch(() => {
          // Offline mode remains cleanly active
        });
      return result;
    }

    if (result.reason === 'WIPED') {
      await clearLocalSessionData();
      await clearLocalCatalogData();
      await clearLocalSalesData();
      await clearLocalPurchasesData();
      await clearLocalCustomersExpensesData();
      useCartStore.getState().clearCart();
      set({
        status: 'unauthenticated',
        user: null,
        shop: null,
        hasOfflinePin: false,
        isOfflineSession: false,
      });
    }

    return result;
  },

  lockApp: () => {
    if (get().hasOfflinePin && get().user) {
      set({ status: 'locked' });
    }
  },

  logout: async () => {
    const refreshToken = await getStoredRefreshToken();
    try {
      if (refreshToken) {
        await authApi.logout(refreshToken);
      }
    } catch {
      // Offline logout still revokes local device tokens safely
    }
    await get().clearLocalAuthOnly();
  },

  clearLocalAuthOnly: async () => {
    await clearSecureAuthSession();
    await clearLocalSessionData();
    await clearLocalCatalogData();
    await clearLocalSalesData();
    await clearLocalPurchasesData();
    await clearLocalCustomersExpensesData();
    useCartStore.getState().clearCart();
    set({
      status: 'unauthenticated',
      user: null,
      shop: null,
      hasOfflinePin: false,
      isOfflineSession: false,
    });
  },
}));
