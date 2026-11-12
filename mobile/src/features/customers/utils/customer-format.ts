import type {
  CustomerDto,
  CustomerLedgerEntryType,
  ExpenseCategoryDto,
  LanguageCode,
} from '@dokanwala/shared';
import type { TFunction } from 'i18next';
import type { BadgeTone } from '@/components/ui/Badge';

export function getLocalizedCustomerName(
  customer: Pick<CustomerDto, 'nameBn' | 'nameEn'>,
  language: LanguageCode,
): string {
  if (language === 'en' && customer.nameEn && customer.nameEn.trim().length > 0) {
    return customer.nameEn;
  }
  return customer.nameBn;
}

export function getCustomerLedgerTypeBadge(
  type: CustomerLedgerEntryType,
  t: TFunction,
): { label: string; tone: BadgeTone } {
  const label = t(`customers.ledgerTypes.${type}`);
  switch (type) {
    case 'SALE':
      return { label, tone: 'primary' };
    case 'SALE_RETURN':
    case 'SALE_CANCEL':
      return { label, tone: 'warning' };
    case 'CUSTOMER_PAYMENT':
      return { label, tone: 'success' };
    default:
      return { label, tone: 'neutral' };
  }
}

export function getLocalizedExpenseCategoryName(
  category: Pick<ExpenseCategoryDto, 'nameBn' | 'nameEn'>,
  language: LanguageCode,
): string {
  if (language === 'en' && category.nameEn && category.nameEn.trim().length > 0) {
    return category.nameEn;
  }
  return category.nameBn;
}
