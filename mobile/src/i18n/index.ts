import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import bn from './bn.json';
import en from './en.json';

export const resources = {
  bn: { translation: bn },
  en: { translation: en },
} as const;

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: 'bn',
  fallbackLng: 'bn',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
