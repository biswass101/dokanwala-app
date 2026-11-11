import type {
  LanguageCode,
  PurchaseRefundMethod,
  PurchaseStatus,
  SupplierDto,
  SupplierLedgerEntryType,
} from '@dokanwala/shared';
import type { TFunction } from 'i18next';
import type { BadgeTone } from '@/components/ui/Badge';

export function getPurchaseStatusBadge(
  status: PurchaseStatus,
  t: TFunction,
): { label: string; tone: BadgeTone } {
  const label = t(`purchases.statuses.${status}`);
  switch (status) {
    case 'COMPLETED':
      return { label, tone: 'success' };
    case 'PARTIALLY_RETURNED':
      return { label, tone: 'warning' };
    case 'RETURNED':
      return { label, tone: 'neutral' };
    default:
      return { label, tone: 'neutral' };
  }
}

export function getPurchaseRefundMethodLabel(method: PurchaseRefundMethod, t: TFunction): string {
  return t(`purchases.refundMethods.${method}`);
}

export function getSupplierLedgerTypeBadge(
  type: SupplierLedgerEntryType,
  t: TFunction,
): { label: string; tone: BadgeTone } {
  const label = t(`suppliers.ledgerTypes.${type}`);
  switch (type) {
    case 'PURCHASE':
      return { label, tone: 'primary' };
    case 'PURCHASE_RETURN':
      return { label, tone: 'warning' };
    case 'SUPPLIER_PAYMENT':
      return { label, tone: 'success' };
    default:
      return { label, tone: 'neutral' };
  }
}

export function getLocalizedSupplierName(
  supplier: Pick<SupplierDto, 'nameBn' | 'nameEn'>,
  language: LanguageCode,
): string {
  if (language === 'en' && supplier.nameEn && supplier.nameEn.trim().length > 0) {
    return supplier.nameEn;
  }
  return supplier.nameBn;
}
