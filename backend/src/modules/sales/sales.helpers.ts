import { ErrorCodes } from '@dokanwala/shared';
import { Decimal } from 'decimal.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError, NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
import { formatDhakaYmd } from '../../shared/utils/timezone.js';

export interface RequestMeta {
  deviceId?: string;
  ipAddress?: string;
  idempotencyKey?: string;
}

export class InvalidUnitConversionError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      statusCode: 400,
      code: ErrorCodes.INVALID_UNIT_CONVERSION,
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }
}

export function requireIdempotencyKey(rawKey: string | undefined): string {
  const trimmed = rawKey?.trim() ?? '';
  if (trimmed.length === 0 || trimmed.length > 120) {
    throw new ValidationError('X-Idempotency-Key header is required (1-120 characters)');
  }
  return trimmed;
}

export async function generateDailyNumber(
  tx: Prisma.TransactionClient,
  params: {
    table: 'sales' | 'sale_returns';
    shopId: string;
    prefix: 'INV' | 'RET';
    date: Date;
  },
): Promise<string> {
  const ymdCompact = formatDhakaYmd(params.date).replace(/-/g, '');
  const dayPrefix = `${params.prefix}-${ymdCompact}-`;

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${params.shopId}:${dayPrefix}`}))`;

  const rows =
    params.table === 'sales'
      ? await tx.$queryRaw<Array<{ num: string }>>`
          SELECT receipt_number AS num
          FROM sales
          WHERE shop_id = ${params.shopId}::uuid
            AND receipt_number LIKE ${`${dayPrefix}%`}
          ORDER BY length(receipt_number) DESC, receipt_number DESC
          LIMIT 1
        `
      : await tx.$queryRaw<Array<{ num: string }>>`
          SELECT return_number AS num
          FROM sale_returns
          WHERE shop_id = ${params.shopId}::uuid
            AND return_number LIKE ${`${dayPrefix}%`}
          ORDER BY length(return_number) DESC, return_number DESC
          LIMIT 1
        `;

  let nextCounter = 1;
  const latestNum = rows[0]?.num;
  if (latestNum) {
    const suffix = latestNum.slice(dayPrefix.length);
    const parsed = Number.parseInt(suffix, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      nextCounter = parsed + 1;
    }
  }

  return `${dayPrefix}${String(nextCounter).padStart(4, '0')}`;
}

export async function lockInventoryBalancesForUpdate(
  tx: Prisma.TransactionClient,
  shopId: string,
  uniqueSortedProductIds: readonly string[],
): Promise<Map<string, { qtyDec: Decimal; avgCostBdt: string }>> {
  const lockedBalances = await tx.$queryRaw<
    Array<{
      product_id: string;
      qty_base: Prisma.Decimal;
      avg_cost_per_base_bdt: Prisma.Decimal;
    }>
  >`
    SELECT product_id, qty_base, avg_cost_per_base_bdt
    FROM inventory_balances
    WHERE shop_id = ${shopId}::uuid
      AND product_id IN (${Prisma.join(uniqueSortedProductIds.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY product_id ASC
    FOR UPDATE
  `;

  if (lockedBalances.length !== uniqueSortedProductIds.length) {
    throw new NotFoundError('Inventory balance missing for one or more products');
  }

  const balanceMap = new Map<string, { qtyDec: Decimal; avgCostBdt: string }>();
  for (const row of lockedBalances) {
    balanceMap.set(row.product_id, {
      qtyDec: new Decimal(row.qty_base.toString()),
      avgCostBdt: new Decimal(row.avg_cost_per_base_bdt.toString()).toFixed(6),
    });
  }

  return balanceMap;
}
