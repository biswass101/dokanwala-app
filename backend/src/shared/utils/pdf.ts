import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));

function resolveFontPath(filename: string): string {
  const candidates = [
    resolve(CURRENT_DIR, '../../../assets/fonts', filename),
    resolve(process.cwd(), 'assets/fonts', filename),
    resolve(process.cwd(), 'backend/assets/fonts', filename),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Bundled font file not found: ${filename}`);
}

export const PDF_FONT_REGULAR = 'NotoSansBengali-Regular';
export const PDF_FONT_BOLD = 'NotoSansBengali-Bold';

export interface PdfGenerationOptions {
  size?: 'A4' | [number, number];
  margin?: number;
  title?: string;
}

export function renderPdfToBuffer(
  build: (doc: PDFKit.PDFDocument) => void,
  options: PdfGenerationOptions = {},
): Promise<Buffer> {
  return new Promise((resolveBuffer, rejectBuffer) => {
    const doc = new PDFDocument({
      size: options.size ?? 'A4',
      margin: options.margin ?? 36,
      info: {
        Title: options.title ?? 'DokanWala Document',
        Creator: 'DokanWala POS',
      },
    });

    const regularFontPath = resolveFontPath('NotoSansBengali-Regular.ttf');
    const boldFontPath = resolveFontPath('NotoSansBengali-Bold.ttf');
    doc.registerFont(PDF_FONT_REGULAR, regularFontPath);
    doc.registerFont(PDF_FONT_BOLD, boldFontPath);
    doc.font(PDF_FONT_REGULAR);

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on('end', () => {
      resolveBuffer(Buffer.concat(chunks));
    });
    doc.on('error', (err: unknown) => {
      rejectBuffer(err instanceof Error ? err : new Error(String(err)));
    });

    try {
      build(doc);
      doc.end();
    } catch (err) {
      rejectBuffer(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export function formatNumberLocale(value: number | string, lang: 'bn' | 'en'): string {
  const str = String(value);
  if (lang === 'en') {
    return str;
  }
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const;
  return str.replace(/[0-9]/g, (digit) => bnDigits[Number(digit)] ?? digit);
}
