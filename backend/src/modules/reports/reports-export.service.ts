import {
  ErrorCodes,
  formatBdt,
  poishaToBdtString,
  type ReportExportFormat,
  type ReportExportKind,
  type ReportExportLang,
  type SalesReportPeriod,
  type UserRole,
} from '@dokanwala/shared';
import { prisma } from '../../database/prisma.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors/app-error.js';
import { buildUtf8BomCsv, type CsvCellValue } from '../../shared/utils/csv.js';
import {
  PDF_FONT_BOLD,
  PDF_FONT_REGULAR,
  renderPdfToBuffer,
} from '../../shared/utils/pdf.js';
import { formatDhakaYmd } from '../../shared/utils/timezone.js';
import {
  getDuesReport,
  getProductsReport,
  getProfitLossReport,
  getSalesReport,
} from './reports.service.js';

export interface ExportReportParams {
  shopId: string;
  role: UserRole;
  report: ReportExportKind;
  format: ReportExportFormat;
  lang: ReportExportLang;
  period: SalesReportPeriod;
  from?: string;
  to?: string;
  limit: number;
}

export interface ExportFileResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

function moneyLabel(poisha: number, lang: ReportExportLang): string {
  return formatBdt(poisha, { digitStyle: lang, showDecimals: false });
}

function pdfTableRow(
  doc: PDFKit.PDFDocument,
  columns: ReadonlyArray<{ text: string; width: number; align?: 'left' | 'right' }>,
  y: number,
  bold = false,
): number {
  doc.font(bold ? PDF_FONT_BOLD : PDF_FONT_REGULAR).fontSize(bold ? 9 : 8.5);
  let x = doc.page.margins.left;
  let maxH = 14;
  for (const col of columns) {
    const h = doc.heightOfString(col.text, { width: col.width });
    if (h > maxH) {
      maxH = h;
    }
  }
  for (const col of columns) {
    doc.text(col.text, x, y, {
      width: col.width,
      align: col.align ?? 'left',
    });
    x += col.width + 6;
  }
  return y + maxH + 5;
}

function ensureSpace(doc: PDFKit.PDFDocument, neededHeight: number): number {
  const bottomLimit = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottomLimit) {
    doc.addPage();
    return doc.page.margins.top;
  }
  return doc.y;
}

export async function exportReportFile(params: ExportReportParams): Promise<ExportFileResult> {
  if (params.report === 'profit-loss' && params.role !== 'OWNER') {
    throw new ForbiddenError(
      'Only shop owners can export the profit and loss report',
      ErrorCodes.FORBIDDEN_ROLE,
    );
  }

  const shop = await prisma.shop.findUnique({
    where: { id: params.shopId },
    select: { nameBn: true, nameEn: true, addressBn: true, phone: true },
  });
  if (!shop) {
    throw new NotFoundError('Shop not found');
  }

  const todayYmd = formatDhakaYmd();
  const isOwner = params.role === 'OWNER';
  const lang = params.lang;
  const shopName = lang === 'en' && shop.nameEn ? shop.nameEn : shop.nameBn;
  const filename = `dokanwala-${params.report}-${todayYmd}.${params.format}`;

  if (params.format === 'csv') {
    let buffer: Buffer;

    if (params.report === 'sales') {
      const data = await getSalesReport(
        params.shopId,
        params.role,
        params.period,
        params.from,
        params.to,
      );
      const headers =
        lang === 'bn'
          ? [
              'সময়কাল',
              'বিল সংখ্যা',
              'মোট বিক্রি (টাকা)',
              'ছাড় (টাকা)',
              'রিটার্ন (টাকা)',
              'নিট বিক্রি (টাকা)',
              'নগদ ও এমএফএস প্রাপ্তি (টাকা)',
              'বাকি দেওয়া (টাকা)',
              ...(isOwner ? ['ক্রয়মূল্য / COGS (টাকা)', 'মোট লাভ (টাকা)'] : []),
            ]
          : [
              'Period',
              'Invoices',
              'Gross Sales (BDT)',
              'Discounts (BDT)',
              'Returns (BDT)',
              'Net Sales (BDT)',
              'Cash & MFS Received (BDT)',
              'Credit Issued (BDT)',
              ...(isOwner ? ['COGS (BDT)', 'Gross Profit (BDT)'] : []),
            ];

      const rows: CsvCellValue[][] = data.buckets.map((b) => [
        b.label,
        b.salesCount,
        poishaToBdtString(b.grossSalesPoisha),
        poishaToBdtString(b.discountsPoisha),
        poishaToBdtString(b.returnsPoisha),
        poishaToBdtString(b.netSalesPoisha),
        poishaToBdtString(b.cashAndMfsReceivedPoisha),
        poishaToBdtString(b.creditIssuedPoisha),
        ...(isOwner
          ? [
              b.cogsPoisha !== null ? poishaToBdtString(b.cogsPoisha) : '0.00',
              b.grossProfitPoisha !== null ? poishaToBdtString(b.grossProfitPoisha) : '0.00',
            ]
          : []),
      ]);

      buffer = buildUtf8BomCsv(headers, rows);
    } else if (params.report === 'products') {
      const data = await getProductsReport(
        params.shopId,
        params.role,
        params.from,
        params.to,
        params.limit,
      );
      const headers =
        lang === 'bn'
          ? [
              'পণ্যের নাম',
              'একক',
              'বিক্রিত পরিমাণ',
              'রিটার্ন পরিমাণ',
              'নিট পরিমাণ',
              'মোট আয় (টাকা)',
              'রিটার্ন (টাকা)',
              'নিট আয় (টাকা)',
              ...(isOwner ? ['নিট COGS (টাকা)', 'মোট লাভ (টাকা)'] : []),
            ]
          : [
              'Product',
              'Unit',
              'Sold Qty',
              'Returned Qty',
              'Net Qty',
              'Gross Revenue (BDT)',
              'Returns (BDT)',
              'Net Revenue (BDT)',
              ...(isOwner ? ['Net COGS (BDT)', 'Gross Profit (BDT)'] : []),
            ];

      const rows: CsvCellValue[][] = data.items.map((item) => [
        lang === 'en' && item.productNameEn ? item.productNameEn : item.productNameBn,
        item.baseUnitNameBn,
        item.soldQtyBase,
        item.returnedQtyBase,
        item.netQtyBase,
        poishaToBdtString(item.grossRevenuePoisha),
        poishaToBdtString(item.returnedRevenuePoisha),
        poishaToBdtString(item.netRevenuePoisha),
        ...(isOwner
          ? [
              item.netCogsPoisha !== null ? poishaToBdtString(item.netCogsPoisha) : '0.00',
              item.grossProfitPoisha !== null ? poishaToBdtString(item.grossProfitPoisha) : '0.00',
            ]
          : []),
      ]);

      buffer = buildUtf8BomCsv(headers, rows);
    } else if (params.report === 'profit-loss') {
      const data = await getProfitLossReport(params.shopId, params.from, params.to);
      const headers =
        lang === 'bn' ? ['খাত', 'পরিমাণ (টাকা)'] : ['Line Item', 'Amount (BDT)'];
      const rows: CsvCellValue[][] = [
        [lang === 'bn' ? 'সময়কাল' : 'Date Range', `${data.fromDate} - ${data.toDate}`],
        [lang === 'bn' ? 'মোট বিক্রি' : 'Gross Sales', poishaToBdtString(data.grossSalesPoisha)],
        [lang === 'bn' ? 'মোট ছাড়' : 'Discounts', poishaToBdtString(data.discountsPoisha)],
        [lang === 'bn' ? 'বিক্রয় রিটার্ন' : 'Sales Returns', poishaToBdtString(data.salesReturnsPoisha)],
        [lang === 'bn' ? 'নিট বিক্রি' : 'Net Sales', poishaToBdtString(data.netSalesPoisha)],
        [lang === 'bn' ? 'নিট COGS' : 'Net COGS', poishaToBdtString(data.netCogsPoisha)],
        [lang === 'bn' ? 'মোট মুনাফা (Gross Profit)' : 'Gross Profit', poishaToBdtString(data.grossProfitPoisha)],
        [lang === 'bn' ? 'অপচয় ও ঘাটতি ক্ষতি' : 'Inventory Loss', poishaToBdtString(data.totalInventoryLossPoisha)],
        [lang === 'bn' ? 'পরিচালনা খরচ' : 'Operating Expenses', poishaToBdtString(data.totalOperatingExpensesPoisha)],
        [lang === 'bn' ? 'নিট লাভ (Net Profit)' : 'Net Profit', poishaToBdtString(data.netProfitPoisha)],
        ...data.expensesByCategory.map((cat): CsvCellValue[] => [
          `${lang === 'bn' ? 'খরচ' : 'Expense'}: ${cat.categoryNameBn}`,
          poishaToBdtString(cat.amountPoisha),
        ]),
      ];

      buffer = buildUtf8BomCsv(headers, rows);
    } else {
      const data = await getDuesReport(params.shopId);
      const headers =
        lang === 'bn'
          ? ['ধরন', 'নাম', 'ফোন', 'মোট লেনদেন (টাকা)', 'মোট পরিশোধ (টাকা)', 'বকেয়া / পাওনা (টাকা)']
          : ['Party Type', 'Name', 'Phone', 'Total Billed (BDT)', 'Total Paid (BDT)', 'Balance (BDT)'];

      const rows: CsvCellValue[][] = [
        ...data.customers.map((c): CsvCellValue[] => [
          lang === 'bn' ? 'ক্রেতা (পাওনা)' : 'Customer Receivable',
          lang === 'en' && c.nameEn ? c.nameEn : c.nameBn,
          c.phone ?? '',
          poishaToBdtString(c.totalPurchasedPoisha),
          poishaToBdtString(c.totalPaidPoisha),
          poishaToBdtString(c.duePoisha),
        ]),
        ...data.suppliers.map((s): CsvCellValue[] => [
          lang === 'bn' ? 'সাপ্লায়ার (দেনা)' : 'Supplier Payable',
          lang === 'en' && s.nameEn ? s.nameEn : s.nameBn,
          s.phone ?? '',
          poishaToBdtString(s.totalPurchasedPoisha),
          poishaToBdtString(s.totalPaidPoisha),
          poishaToBdtString(s.payablePoisha),
        ]),
      ];

      buffer = buildUtf8BomCsv(headers, rows);
    }

    return {
      buffer,
      contentType: 'text/csv; charset=utf-8',
      filename,
    };
  }

  // PDF generation via pdfkit + embedded Noto Sans Bengali
  if (params.report === 'sales') {
    const data = await getSalesReport(
      params.shopId,
      params.role,
      params.period,
      params.from,
      params.to,
    );
    const buffer = await renderPdfToBuffer(
      (doc) => {
        doc.font(PDF_FONT_BOLD).fontSize(15).text(shopName, { align: 'center' });
        doc
          .font(PDF_FONT_BOLD)
          .fontSize(12)
          .text(lang === 'bn' ? 'বিক্রয় রিপোর্ট' : 'Sales Report', { align: 'center' });
        doc
          .font(PDF_FONT_REGULAR)
          .fontSize(9)
          .text(`${data.fromDate} - ${data.toDate}`, { align: 'center' });
        doc.moveDown(0.8);

        doc.font(PDF_FONT_BOLD).fontSize(10);
        doc.text(
          `${lang === 'bn' ? 'নিট বিক্রি' : 'Net Sales'}: ${moneyLabel(data.totals.netSalesPoisha, lang)}  |  ${
            lang === 'bn' ? 'বিল সংখ্যা' : 'Invoices'
          }: ${String(data.totals.salesCount)}`,
        );
        doc.font(PDF_FONT_REGULAR).fontSize(9.5);
        doc.text(
          `${lang === 'bn' ? 'নগদ ও এমএফএস' : 'Cash & MFS'}: ${moneyLabel(
            data.totals.cashAndMfsReceivedPoisha,
            lang,
          )}  |  ${lang === 'bn' ? 'বাকি' : 'Credit'}: ${moneyLabel(
            data.totals.creditIssuedPoisha,
            lang,
          )}`,
        );
        if (isOwner && data.totals.grossProfitPoisha !== null) {
          doc.text(
            `${lang === 'bn' ? 'মোট লাভ' : 'Gross Profit'}: ${moneyLabel(
              data.totals.grossProfitPoisha,
              lang,
            )}`,
          );
        }
        doc.moveDown(0.8);

        let y = pdfTableRow(
          doc,
          [
            { text: lang === 'bn' ? 'সময়কাল' : 'Period', width: 120 },
            { text: lang === 'bn' ? 'বিল' : 'Qty', width: 45, align: 'right' },
            { text: lang === 'bn' ? 'মোট বিক্রি' : 'Gross', width: 85, align: 'right' },
            { text: lang === 'bn' ? 'নিট বিক্রি' : 'Net Sales', width: 90, align: 'right' },
            { text: lang === 'bn' ? 'বাকি' : 'Due', width: 75, align: 'right' },
            ...(isOwner
              ? [{ text: lang === 'bn' ? 'লাভ' : 'Profit', width: 75, align: 'right' as const }]
              : []),
          ],
          doc.y,
          true,
        );

        for (const b of data.buckets) {
          y = ensureSpace(doc, 22);
          y = pdfTableRow(
            doc,
            [
              { text: b.label, width: 120 },
              { text: String(b.salesCount), width: 45, align: 'right' },
              { text: moneyLabel(b.grossSalesPoisha, lang), width: 85, align: 'right' },
              { text: moneyLabel(b.netSalesPoisha, lang), width: 90, align: 'right' },
              { text: moneyLabel(b.creditIssuedPoisha, lang), width: 75, align: 'right' },
              ...(isOwner
                ? [
                    {
                      text:
                        b.grossProfitPoisha !== null ? moneyLabel(b.grossProfitPoisha, lang) : '-',
                      width: 75,
                      align: 'right' as const,
                    },
                  ]
                : []),
            ],
            y,
          );
        }
      },
      { size: 'A4', margin: 36, title: filename },
    );

    return { buffer, contentType: 'application/pdf', filename };
  }

  if (params.report === 'products') {
    const data = await getProductsReport(
      params.shopId,
      params.role,
      params.from,
      params.to,
      params.limit,
    );
    const buffer = await renderPdfToBuffer(
      (doc) => {
        doc.font(PDF_FONT_BOLD).fontSize(15).text(shopName, { align: 'center' });
        doc
          .font(PDF_FONT_BOLD)
          .fontSize(12)
          .text(lang === 'bn' ? 'পণ্য বিক্রয় রিপোর্ট' : 'Product Sales Report', { align: 'center' });
        doc
          .font(PDF_FONT_REGULAR)
          .fontSize(9)
          .text(`${data.fromDate} - ${data.toDate}`, { align: 'center' });
        doc.moveDown(0.8);

        let y = pdfTableRow(
          doc,
          [
            { text: lang === 'bn' ? 'পণ্য' : 'Product', width: 170 },
            { text: lang === 'bn' ? 'নিট পরিমাণ' : 'Net Qty', width: 75, align: 'right' },
            { text: lang === 'bn' ? 'নিট আয়' : 'Net Revenue', width: 95, align: 'right' },
            ...(isOwner
              ? [
                  { text: lang === 'bn' ? 'খরচ' : 'COGS', width: 75, align: 'right' as const },
                  { text: lang === 'bn' ? 'লাভ' : 'Profit', width: 75, align: 'right' as const },
                ]
              : []),
          ],
          doc.y,
          true,
        );

        for (const item of data.items) {
          y = ensureSpace(doc, 22);
          y = pdfTableRow(
            doc,
            [
              {
                text: `${lang === 'en' && item.productNameEn ? item.productNameEn : item.productNameBn} (${item.baseUnitNameBn})`,
                width: 170,
              },
              { text: item.netQtyBase, width: 75, align: 'right' },
              { text: moneyLabel(item.netRevenuePoisha, lang), width: 95, align: 'right' },
              ...(isOwner
                ? [
                    {
                      text: item.netCogsPoisha !== null ? moneyLabel(item.netCogsPoisha, lang) : '-',
                      width: 75,
                      align: 'right' as const,
                    },
                    {
                      text:
                        item.grossProfitPoisha !== null
                          ? moneyLabel(item.grossProfitPoisha, lang)
                          : '-',
                      width: 75,
                      align: 'right' as const,
                    },
                  ]
                : []),
            ],
            y,
          );
        }
      },
      { size: 'A4', margin: 36, title: filename },
    );

    return { buffer, contentType: 'application/pdf', filename };
  }

  if (params.report === 'profit-loss') {
    const data = await getProfitLossReport(params.shopId, params.from, params.to);
    const buffer = await renderPdfToBuffer(
      (doc) => {
        doc.font(PDF_FONT_BOLD).fontSize(15).text(shopName, { align: 'center' });
        doc
          .font(PDF_FONT_BOLD)
          .fontSize(12)
          .text(lang === 'bn' ? 'লাভ-ক্ষতি বিবরণী' : 'Profit & Loss Statement', {
            align: 'center',
          });
        doc
          .font(PDF_FONT_REGULAR)
          .fontSize(9)
          .text(`${data.fromDate} - ${data.toDate}`, { align: 'center' });
        doc.moveDown(0.8);

        const lines: Array<[string, number, boolean?]> = [
          [lang === 'bn' ? 'মোট বিক্রি' : 'Gross Sales', data.grossSalesPoisha],
          [lang === 'bn' ? 'মোট ছাড়' : 'Discounts', -data.discountsPoisha],
          [lang === 'bn' ? 'বিক্রয় রিটার্ন' : 'Sales Returns', -data.salesReturnsPoisha],
          [lang === 'bn' ? 'নিট বিক্রি' : 'Net Sales', data.netSalesPoisha, true],
          [lang === 'bn' ? 'নিট ক্রয়মূল্য (COGS)' : 'Net COGS', -data.netCogsPoisha],
          [lang === 'bn' ? 'মোট মুনাফা (Gross Profit)' : 'Gross Profit', data.grossProfitPoisha, true],
          [lang === 'bn' ? 'মজুত ক্ষতি ও অপচয়' : 'Inventory & Wastage Loss', -data.totalInventoryLossPoisha],
          [lang === 'bn' ? 'পরিচালনা খরচ' : 'Operating Expenses', -data.totalOperatingExpensesPoisha],
          [lang === 'bn' ? 'নিট লাভ (Net Profit)' : 'Net Profit', data.netProfitPoisha, true],
        ];

        let y = doc.y;
        for (const [label, amount, bold] of lines) {
          y = ensureSpace(doc, 22);
          y = pdfTableRow(
            doc,
            [
              { text: label, width: 320 },
              { text: moneyLabel(amount, lang), width: 170, align: 'right' },
            ],
            y,
            bold ?? false,
          );
        }
      },
      { size: 'A4', margin: 36, title: filename },
    );

    return { buffer, contentType: 'application/pdf', filename };
  }

  const data = await getDuesReport(params.shopId);
  const buffer = await renderPdfToBuffer(
    (doc) => {
      doc.font(PDF_FONT_BOLD).fontSize(15).text(shopName, { align: 'center' });
      doc
        .font(PDF_FONT_BOLD)
        .fontSize(12)
        .text(lang === 'bn' ? 'বকেয়া ও পাওনা-দেনা রিপোর্ট' : 'Dues & Payables Report', {
          align: 'center',
        });
      doc.moveDown(0.5);
      doc.font(PDF_FONT_REGULAR).fontSize(9.5);
      doc.text(
        `${lang === 'bn' ? 'মোট ক্রেতা বাকি (পাওনা)' : 'Total Customer Dues'}: ${moneyLabel(
          data.totalCustomerDuePoisha,
          lang,
        )} (${String(data.customersWithDueCount)})`,
      );
      doc.text(
        `${lang === 'bn' ? 'মোট সাপ্লায়ার দেনা' : 'Total Supplier Payables'}: ${moneyLabel(
          data.totalSupplierPayablePoisha,
          lang,
        )} (${String(data.suppliersWithPayableCount)})`,
      );
      doc.moveDown(0.8);

      let y = pdfTableRow(
        doc,
        [
          { text: lang === 'bn' ? 'ধরন' : 'Type', width: 95 },
          { text: lang === 'bn' ? 'নাম' : 'Name', width: 175 },
          { text: lang === 'bn' ? 'ফোন' : 'Phone', width: 110 },
          { text: lang === 'bn' ? 'বকেয়া' : 'Balance', width: 105, align: 'right' },
        ],
        doc.y,
        true,
      );

      for (const c of data.customers) {
        y = ensureSpace(doc, 22);
        y = pdfTableRow(
          doc,
          [
            { text: lang === 'bn' ? 'ক্রেতা' : 'Customer', width: 95 },
            { text: lang === 'en' && c.nameEn ? c.nameEn : c.nameBn, width: 175 },
            { text: c.phone ?? '-', width: 110 },
            { text: moneyLabel(c.duePoisha, lang), width: 105, align: 'right' },
          ],
          y,
        );
      }

      for (const s of data.suppliers) {
        y = ensureSpace(doc, 22);
        y = pdfTableRow(
          doc,
          [
            { text: lang === 'bn' ? 'সাপ্লায়ার' : 'Supplier', width: 95 },
            { text: lang === 'en' && s.nameEn ? s.nameEn : s.nameBn, width: 175 },
            { text: s.phone ?? '-', width: 110 },
            { text: moneyLabel(s.payablePoisha, lang), width: 105, align: 'right' },
          ],
          y,
        );
      }
    },
    { size: 'A4', margin: 36, title: filename },
  );

  return { buffer, contentType: 'application/pdf', filename };
}
