const DHAKA_UTC_OFFSET_MS = 6 * 60 * 60 * 1000;

/**
 * Converts a YYYY-MM-DD calendar day in Asia/Dhaka (UTC+06:00, no DST) into exact UTC
 * inclusive [startUtc, endUtc] Date bounds for financial and cashbook reporting.
 */
export function getDhakaDayRangeUtc(dateYmd: string): { startUtc: Date; endUtc: Date } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
  if (!match) {
    throw new Error(`Invalid YYYY-MM-DD date string: ${dateYmd}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const utcMidnightMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const checkDate = new Date(utcMidnightMs);
  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day
  ) {
    throw new Error(`Non-existent calendar date: ${dateYmd}`);
  }

  const startMs = utcMidnightMs - DHAKA_UTC_OFFSET_MS;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return {
    startUtc: new Date(startMs),
    endUtc: new Date(endMs),
  };
}

/**
 * Formats an instant into YYYY-MM-DD in Asia/Dhaka (UTC+06:00).
 */
export function formatDhakaYmd(instant: Date = new Date()): string {
  const shifted = new Date(instant.getTime() + DHAKA_UTC_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${String(y)}-${m}-${d}`;
}
