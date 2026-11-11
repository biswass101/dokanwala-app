import type { DigitStyle, LanguageCode } from '@dokanwala/shared';
import { create } from 'zustand';
import { saveLocalPreferences } from '@/database/repositories/session-local.repo';
import i18n from '@/i18n';

export type SyncIndicatorState = 'synced' | 'pending' | 'syncing' | 'conflict';

interface PreferencesState {
  language: LanguageCode;
  digitStyle: DigitStyle;
  syncIndicator: SyncIndicatorState;
  pendingSyncCount: number;
  setLanguage: (language: LanguageCode, persist?: boolean) => void;
  toggleLanguage: () => void;
  setDigitStyle: (style: DigitStyle, persist?: boolean) => void;
  setSyncIndicator: (state: SyncIndicatorState, count?: number) => void;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  language: 'bn',
  digitStyle: 'bn',
  syncIndicator: 'synced',
  pendingSyncCount: 0,
  setLanguage: (language, persist = true) => {
    const nextDigitStyle: DigitStyle = language === 'bn' ? 'bn' : 'en';
    void i18n.changeLanguage(language);
    set({
      language,
      digitStyle: nextDigitStyle,
    });
    if (persist) {
      void saveLocalPreferences(language, nextDigitStyle).catch(() => {
        // Ignore persistence errors before SQLite initializes in unit tests
      });
    }
  },
  toggleLanguage: () => {
    const next: LanguageCode = get().language === 'bn' ? 'en' : 'bn';
    get().setLanguage(next, true);
  },
  setDigitStyle: (digitStyle, persist = true) => {
    set({ digitStyle });
    if (persist) {
      void saveLocalPreferences(get().language, digitStyle).catch(() => {
        // Ignore persistence errors before SQLite initializes in unit tests
      });
    }
  },
  setSyncIndicator: (syncIndicator, count = 0) =>
    set({ syncIndicator, pendingSyncCount: count }),
}));
