import type {
  CashbookDirection,
  CashbookEntryType,
  PaymentMethod,
} from '@dokanwala/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { formatDhakaYmd } from '../../shared/utils/timezone.js';
import { recordSyncChange } from '../sync/sync-change.helper.js';

export type PrismaTx = Prisma.TransactionClient;

export function mapSaleRefundMethodToPaymentMethod(
  method: 'CASH' | 'BKASH' | 'NAGAD' | 'OTHER' | 'CREDIT_ADJUSTMENT',
): PaymentMethod | null {
  if (method === 'CREDIT_ADJUSTMENT') return null;
  return method;
}

export function mapPurchaseRefundMethodToPaymentMethod(
  method: 'CASH' | 'BKASH' | 'NAGAD' | 'OTHER' | 'PAYABLE_ADJUSTMENT',
): PaymentMethod | null {
  if (method === 'PAYABLE_ADJUSTMENT') return null;
  return method;
}

export interface RecordCashbookEntryParams {
  shopId: string;
  direction: CashbookDirection;
  entryType: CashbookEntryType;
  method: PaymentMethod;
  amountPoisha: number;
  referenceType?: string | null;
  referenceId?: string | null;
  referenceNumber?: string | null;
  note?: string | null;
  idempotencyKey?: string | null;
  actorUserId?: string | null;
  occurredAt?: Date;
}

export async function recordCashbookEntry(
  tx: PrismaTx,
  params: RecordCashbookEntryParams,
): Promise<void> {
  if (params.amountPoisha <= 0) {
    return;
  }

  const occurredAt = params.occurredAt ?? new Date();
  const businessDate = formatDhakaYmd(occurredAt);

  const session = await tx.cashbookSession.findUnique({
    where: {
      shopId_businessDate: {
        shopId: params.shopId,
        businessDate,
      },
    },
    select: { id: true },
  });

  await tx.cashbookEntry.create({
    data: {
      shopId: params.shopId,
      sessionId: session?.id ?? null,
      direction: params.direction,
      entryType: params.entryType,
      method: params.method,
      amountPoisha: params.amountPoisha,
      referenceType: params.referenceType ?? null,
      referenceId: params.referenceId ?? null,
      referenceNumber: params.referenceNumber ?? null,
      note: params.note ?? null,
      idempotencyKey: params.idempotencyKey ?? null,
      actorUserId: params.actorUserId ?? null,
      occurredAt,
    },
  });

  if (session?.id) {
    await recordSyncChange(tx, {
      shopId: params.shopId,
      entityType: 'CASHBOOK_SESSION',
      entityId: session.id,
    });
  }
}
