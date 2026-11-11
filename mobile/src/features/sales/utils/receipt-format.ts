import {
  formatBdt,
  formatDhakaDateTime,
  formatQuantityDisplay,
  toBanglaDigits,
  type DigitStyle,
  type LanguageCode,
  type PaymentMethod,
  type RefundMethod,
  type SaleDto,
  type SaleStatus,
  type ShopProfileDto,
} from '@dokanwala/shared';
import type { TFunction } from 'i18next';
import type { BadgeTone } from '@/components/ui/Badge';

export function getSaleStatusBadge(
  status: SaleStatus,
  t: TFunction,
): { label: string; tone: BadgeTone } {
  const label = t(`sales.statuses.${status}`);
  switch (status) {
    case 'COMPLETED':
      return { label, tone: 'success' };
    case 'PARTIALLY_RETURNED':
      return { label, tone: 'warning' };
    case 'RETURNED':
      return { label, tone: 'neutral' };
    case 'CANCELLED':
      return { label, tone: 'danger' };
    default:
      return { label, tone: 'neutral' };
  }
}

export function getPaymentMethodLabel(method: PaymentMethod, t: TFunction): string {
  return t(`sales.paymentMethods.${method}`);
}

export function getRefundMethodLabel(method: RefundMethod, t: TFunction): string {
  return t(`sales.refundMethods.${method}`);
}

function localizeDigits(value: string, digitStyle: DigitStyle): string {
  return digitStyle === 'bn' ? toBanglaDigits(value) : value;
}

function resolveShopTitle(shop: ShopProfileDto | null, language: LanguageCode): string {
  if (!shop) {
    return language === 'bn' ? 'দোকানওয়ালা' : 'DokanWala';
  }
  if (language === 'en' && shop.nameEn && shop.nameEn.trim().length > 0) {
    return shop.nameEn;
  }
  return shop.nameBn;
}

function getPaymentMethodPlainLabel(method: PaymentMethod, language: LanguageCode): string {
  if (language === 'en') {
    switch (method) {
      case 'CASH':
        return 'Cash';
      case 'BKASH':
        return 'bKash';
      case 'NAGAD':
        return 'Nagad';
      case 'OTHER':
        return 'Other';
    }
  }
  switch (method) {
    case 'CASH':
      return 'নগদ';
    case 'BKASH':
      return 'বিকাশ';
    case 'NAGAD':
      return 'নগদ অ্যাপ';
    case 'OTHER':
      return 'অন্যান্য';
  }
}

export function buildShareableReceiptText(params: {
  sale: SaleDto;
  shop: ShopProfileDto | null;
  language: LanguageCode;
  digitStyle: DigitStyle;
}): string {
  const { sale, shop, language, digitStyle } = params;
  const fmtMoney = (poisha: number) => formatBdt(poisha, { digitStyle });
  const isBn = language === 'bn';

  const lines: string[] = [];
  lines.push(resolveShopTitle(shop, language));
  if (shop?.receiptHeaderBn) {
    lines.push(shop.receiptHeaderBn);
  }
  const address = isBn ? shop?.addressBn : (shop?.addressEn ?? shop?.addressBn);
  if (address) {
    lines.push(address);
  }
  if (shop?.phone) {
    lines.push(`${isBn ? 'ফোন' : 'Phone'}: ${localizeDigits(shop.phone, digitStyle)}`);
  }
  lines.push('------------------------------');
  lines.push(`${isBn ? 'রসিদ নং' : 'Receipt'}: ${localizeDigits(sale.receiptNumber, digitStyle)}`);
  lines.push(`${isBn ? 'সময়' : 'Time'}: ${formatDhakaDateTime(sale.soldAt, language, digitStyle)}`);
  if (sale.customerNameSnapshot) {
    lines.push(`${isBn ? 'ক্রেতা' : 'Customer'}: ${sale.customerNameSnapshot}`);
  }
  if (sale.actorName) {
    lines.push(`${isBn ? 'বিক্রেতা' : 'Cashier'}: ${sale.actorName}`);
  }
  if (sale.status === 'CANCELLED') {
    lines.push(isBn ? '*** এই রসিদ বাতিল করা হয়েছে ***' : '*** CANCELLED ***');
  }
  lines.push('------------------------------');

  for (const item of sale.items) {
    const itemName =
      language === 'en' && item.productNameEn ? item.productNameEn : item.productNameBn;
    const unitLabel = language === 'en' ? item.unitNameEn : item.unitNameBn;
    const qtyText = localizeDigits(formatQuantityDisplay(item.qtyDisplay, 3), digitStyle);
    lines.push(
      `${itemName} — ${qtyText} ${unitLabel} × ${fmtMoney(item.unitSellingPricePoisha)} = ${fmtMoney(item.lineSubtotalPoisha)}`,
    );
  }

  lines.push('------------------------------');
  lines.push(`${isBn ? 'মোট' : 'Subtotal'}: ${fmtMoney(sale.subtotalPoisha)}`);
  if (sale.discountPoisha > 0) {
    lines.push(`${isBn ? 'ছাড়' : 'Discount'}: -${fmtMoney(sale.discountPoisha)}`);
  }
  lines.push(`${isBn ? 'সর্বমোট বিল' : 'Net Total'}: ${fmtMoney(sale.totalPoisha)}`);

  for (const payment of sale.payments) {
    const methodLabel = getPaymentMethodPlainLabel(payment.method, language);
    lines.push(`${isBn ? 'পরিশোধ' : 'Paid'} (${methodLabel}): ${fmtMoney(payment.amountPoisha)}`);
  }

  if (sale.tenderedPoisha !== null) {
    lines.push(`${isBn ? 'নগদ গ্রহণ' : 'Tendered'}: ${fmtMoney(sale.tenderedPoisha)}`);
    lines.push(`${isBn ? 'ফেরত টাকা' : 'Change'}: ${fmtMoney(sale.changePoisha)}`);
  }

  if (sale.duePoisha > 0) {
    lines.push(`${isBn ? 'বাকি' : 'Due'}: ${fmtMoney(sale.duePoisha)}`);
  }

  if (sale.returnedTotalPoisha > 0) {
    lines.push(`${isBn ? 'পণ্য ফেরত' : 'Returned'}: ${fmtMoney(sale.returnedTotalPoisha)}`);
  }

  lines.push('------------------------------');
  const footer =
    shop?.receiptFooterBn?.trim() ||
    (isBn ? 'ধন্যবাদ, আবার আসবেন।' : 'Thank you, please come again.');
  lines.push(footer);

  return lines.join('\n');
}
