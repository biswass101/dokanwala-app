import { useTranslation } from 'react-i18next';
import { usePreferencesStore } from '@/store/preferences.store';

export function useAppTranslation() {
  const { t } = useTranslation();
  const language = usePreferencesStore((state) => state.language);
  const toggleLanguage = usePreferencesStore((state) => state.toggleLanguage);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);

  return {
    t,
    language,
    isBangla: language === 'bn',
    toggleLanguage,
    setLanguage,
  };
}
