export type CsvCellValue = string | number | boolean | null | undefined;

const SAFE_SIGNED_NUMBER_REGEX = /^-\d+(?:\.\d+)?$/;

export function sanitizeCsvFormulaCell(raw: string): string {
  if (raw.length === 0) {
    return raw;
  }
  const first = raw[0];
  if (first === '=' || first === '+' || first === '@' || first === '\t' || first === '\r') {
    return `'${raw}`;
  }
  if (first === '-' && !SAFE_SIGNED_NUMBER_REGEX.test(raw)) {
    return `'${raw}`;
  }
  return raw;
}

export function formatCsvCell(value: CsvCellValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value).replace(/\r\n/g, '\n');
  const safe = typeof value === 'number' || typeof value === 'boolean' ? str : sanitizeCsvFormulaCell(str);
  if (safe.includes('"') || safe.includes(',') || safe.includes('\n') || safe.includes('\r')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildUtf8BomCsv(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<CsvCellValue>>,
): Buffer {
  const lines: string[] = [headers.map((h) => formatCsvCell(h)).join(',')];
  for (const row of rows) {
    lines.push(row.map((cell) => formatCsvCell(cell)).join(','));
  }
  const content = `\uFEFF${lines.join('\r\n')}\r\n`;
  return Buffer.from(content, 'utf8');
}
