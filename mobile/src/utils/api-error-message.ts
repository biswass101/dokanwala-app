import type { TFunction } from 'i18next';
import { ApiClientError } from '@/services/api/client';

export function getLocalizedErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiClientError) {
    const key = `errors.${error.code}`;
    const translated = t(key);
    if (translated !== key) {
      return translated;
    }
    return error.message || t('common.errorFallback');
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return t('common.errorFallback');
}
