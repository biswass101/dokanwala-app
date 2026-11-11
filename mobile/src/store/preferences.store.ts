import type { DigitStyle, LanguageCode } from '@dokanwala/shared';
import { create } from 'zustand';
import i18n from '@/i18n';

export type SyncIndicatorState = 'synced' | 'pending' | 'syncing' | 'conflict';

interface PreferencesState {
  language: LanguageCode;
  digitStyle: DigitStyle;
  syncIndicator: SyncIndicatorState;
  pendingSyncCount: number;
  setLanguage: (language: LanguageCode) => void;
  toggleLanguage: () => void;
  setDigitStyle: (style: DigitStyle) => void;
  setSyncIndicator: (state: SyncIndicatorState, count?: number) => void;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  language: 'bn',
  digitStyle: 'bn',
  syncIndicator: 'synced',
  pendingSyncCount: 0,
  setLanguage: (language) => {
    void i18n.changeLanguage(language);
    set({
      language,
      digitStyle: language === 'bn' ? 'bn' : 'en',
    });
  },
  toggleLanguage: () => {
    const next: LanguageCode = get().language === 'bn' ? 'en' : 'bn';
    get().setLanguage(next);
  },
  setDigitStyle: (digitStyle) => set({ digitStyle }),
  setSyncIndicator: (syncIndicator, count = 0) =>
    set({ syncIndicator, pendingSyncCount: count }),
}));
