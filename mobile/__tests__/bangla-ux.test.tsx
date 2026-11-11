import { bdtToPoisha, formatBdt } from '@dokanwala/shared';
import { usePreferencesStore } from '@/store/preferences.store';
import i18n from '@/i18n';

describe('Bangla Language & Currency Preferences', () => {
  beforeEach(() => {
    usePreferencesStore.getState().setLanguage('bn');
  });

  it('defaults to Bangla language and Bangla digit style', () => {
    expect(usePreferencesStore.getState().language).toBe('bn');
    expect(usePreferencesStore.getState().digitStyle).toBe('bn');
    expect(i18n.t('tabs.sales')).toBe('বিক্রি');
  });

  it('switches cleanly between Bangla and English at runtime', () => {
    usePreferencesStore.getState().toggleLanguage();
    expect(usePreferencesStore.getState().language).toBe('en');
    expect(usePreferencesStore.getState().digitStyle).toBe('en');
    expect(i18n.t('tabs.sales')).toBe('Sales');

    usePreferencesStore.getState().toggleLanguage();
    expect(usePreferencesStore.getState().language).toBe('bn');
    expect(i18n.t('tabs.home')).toBe('হোম');
  });

  it('formats parsed Bangla BDT values accurately', () => {
    const poisha = bdtToPoisha('১২,৫০০.৫০');
    expect(formatBdt(poisha, { digitStyle: 'bn' })).toBe('৳ ১২,৫০০.৫০');
    expect(formatBdt(poisha, { digitStyle: 'en' })).toBe('৳ 12,500.50');
  });
});
