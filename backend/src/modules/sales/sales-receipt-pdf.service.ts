import {
  formatBdt,
  formatDhakaDateTime,
  toBanglaDigits,
  type ReportExportLang,
  type UserRole,
} from '@dokanwala/shared';
import { prisma } from '../../database/prisma.js';
import { NotFoundError } from '../../shared/errors/app-error.js';
import {
  PDF_FONT_BOLD,
  PDF_FONT_REGULAR,
  renderPdfToBuffer,
} from '../../shared/utils/pdf.js';
import { getSaleById } from './sales.service.js';

export interface ReceiptPdfResult {
  buffer: Buffer;
  filename: string;
}

const PAYMENT_METHOD_LABELS: Record<string, { bn: string; en: string }> = {
  CASH: { bn: 'নগদ', en: 'Cash' },
  BKASH: { bn: 'বিকাশ', en: 'bKash' },
  NAGAD: { bn: 'নগদ অ্যাপ', en: 'Nagad' },
  OTHER: { bn: 'অন্যান্য', en: 'Other' },
};

export async function generateSaleReceiptPdf(
  shopId: string,
  role: UserRole,
  saleId: string,
  lang: ReportExportLang = 'bn',
): Promise<ReceiptPdfResult> {
  const [sale, shop] = await Promise.all([
    getSaleById(shopId, role, saleId),
    prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        nameBn: true,
        nameEn: true,
        addressBn: true,
        addressEn: true,
        phone: true,
        receiptHeaderBn: true,
        receiptFooterBn: true,
      },
    }),
  ]);

  if (!shop) {
    throw new NotFoundError('Shop not found');
  }

  const shopName = lang === 'en' && shop.nameEn ? shop.nameEn : shop.nameBn;
  const shopAddress = lang === 'en' && shop.addressEn ? shop.addressEn : shop.addressBn;
  const safeReceiptName = sale.receiptNumber.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `receipt-${safeReceiptName}.pdf`;

  const estimatedHeight = Math.max(
    420,
    300 +
      sale.items.length * 32 +
      sale.payments.length * 18 +
      (shop.receiptHeaderBn ? 24 : 0) +
      (shop.receiptFooterBn ? 24 : 0),
  );

  const money = (poisha: number): string =>
    formatBdt(poisha, { digitStyle: lang, showDecimals: false });
  const numStr = (val: string): string => (lang === 'bn' ? toBanglaDigits(val) : val);

  const buffer = await renderPdfToBuffer(
    (doc) => {
      const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const left = doc.page.margins.left;

      const drawDivider = (): void => {
        const y = doc.y + 3;
        doc
          .moveTo(left, y)
          .lineTo(left + contentWidth, y)
          .dash(2, { space: 2 })
          .stroke('#94A3B8')
          .undash();
        doc.y = y + 6;
      };

      const drawKeyValue = (label: string, value: string, bold = false): void => {
        const y = doc.y;
        doc.font(bold ? PDF_FONT_BOLD : PDF_FONT_REGULAR).fontSize(bold ? 9.5 : 8.5);
        doc.text(label, left, y, { width: contentWidth * 0.56, align: 'left' });
        doc.text(value, left + contentWidth * 0.56, y, {
          width: contentWidth * 0.44,
          align: 'right',
        });
        doc.y = y + 14;
      };

      doc.font(PDF_FONT_BOLD).fontSize(13).text(shopName, { align: 'center' });
      if (shopAddress) {
        doc.font(PDF_FONT_REGULAR).fontSize(8).text(shopAddress, { align: 'center' });
      }
      if (shop.phone) {
        doc
          .font(PDF_FONT_REGULAR)
          .fontSize(8)
          .text(`${lang === 'bn' ? 'ফোন' : 'Phone'}: ${numStr(shop.phone)}`, { align: 'center' });
      }
      if (shop.receiptHeaderBn) {
        doc.font(PDF_FONT_REGULAR).fontSize(8).text(shop.receiptHeaderBn, { align: 'center' });
      }

      drawDivider();

      drawKeyValue(lang === 'bn' ? 'রসিদ নং' : 'Receipt No', sale.receiptNumber, true);
      drawKeyValue(
        lang === 'bn' ? 'তারিখ' : 'Date',
        formatDhakaDateTime(sale.soldAt, lang, lang),
      );
      if (sale.customerNameSnapshot) {
        drawKeyValue(lang === 'bn' ? 'ক্রেতা' : 'Customer', sale.customerNameSnapshot);
      }

      drawDivider();

      doc.font(PDF_FONT_BOLD).fontSize(8.5).text(lang === 'bn' ? 'পণ্যের বিবরণ' : 'Items');
      doc.moveDown(0.2);

      for (const item of sale.items) {
        const name = lang === 'en' && item.productNameEn ? item.productNameEn : item.productNameBn;
        const unitName = lang === 'en' ? item.unitNameEn : item.unitNameBn;
        const cleanQty = item.qtyDisplay.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
        doc.font(PDF_FONT_BOLD).fontSize(8.5).text(name, { width: contentWidth });
        drawKeyValue(
          `  ${numStr(cleanQty)} ${unitName} × ${money(item.unitSellingPricePoisha)}`,
          money(item.lineSubtotalPoisha),
        );
      }

      drawDivider();

      drawKeyValue(lang === 'bn' ? 'মোট মূল্য' : 'Subtotal', money(sale.subtotalPoisha));
      if (sale.discountPoisha > 0) {
        drawKeyValue(lang === 'bn' ? 'ছাড়' : 'Discount', `-${money(sale.discountPoisha)}`);
      }
      drawKeyValue(lang === 'bn' ? 'সর্বমোট বিল' : 'Total', money(sale.totalPoisha), true);
      drawKeyValue(lang === 'bn' ? 'পরিশোধিত' : 'Paid', money(sale.paidPoisha));
      if (sale.duePoisha > 0) {
        drawKeyValue(lang === 'bn' ? 'বাকি' : 'Due', money(sale.duePoisha), true);
      }
      if (sale.changePoisha > 0) {
        drawKeyValue(lang === 'bn' ? 'ফেরত' : 'Change', money(sale.changePoisha));
      }

      if (sale.payments.length > 0) {
        drawDivider();
        for (const pay of sale.payments) {
          const methodLabel = PAYMENT_METHOD_LABELS[pay.method]?.[lang] ?? pay.method;
          drawKeyValue(methodLabel, money(pay.amountPoisha));
        }
      }

      drawDivider();
      doc
        .font(PDF_FONT_REGULAR)
        .fontSize(8)
        .text(
          shop.receiptFooterBn ??
            (lang === 'bn' ? 'ধন্যবাদ! আবার আসবেন।' : 'Thank you! Visit again.'),
          { align: 'center' },
        );
    },
    { size: [227, estimatedHeight], margin: 14, title: filename },
  );

  return { buffer, filename };
}
