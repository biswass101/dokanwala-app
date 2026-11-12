import type {
  CashbookEntryDto,
  CashbookSummaryResponse,
  ManualCashbookEntryType,
  PaymentMethod,
} from '@dokanwala/shared';
import * as Crypto from 'expo-crypto';
import { unwrapApiGet, unwrapApiPost } from './client';

export interface OpenCashbookPayload {
  businessDate?: string;
  openingCashPoisha: number;
  note?: string | null;
}

export interface CloseCashbookPayload {
  businessDate?: string;
  actualClosingCashPoisha: number;
  note?: string | null;
}

export interface ReopenCashbookPayload {
  businessDate?: string;
  reason?: string | null;
}

export interface CreateManualCashbookEntryPayload {
  id?: string;
  businessDate?: string;
  entryType: ManualCashbookEntryType;
  method: PaymentMethod;
  amountPoisha: number;
  note?: string | null;
  occurredAt?: string;
}

export const cashbookApi = {
  getSummary(businessDate?: string): Promise<CashbookSummaryResponse> {
    const query: Record<string, string> = {};
    if (businessDate) query.businessDate = businessDate;
    return unwrapApiGet('/cashbook', query);
  },

  open(body: OpenCashbookPayload): Promise<CashbookSummaryResponse> {
    return unwrapApiPost('/cashbook/open', body);
  },

  close(body: CloseCashbookPayload): Promise<CashbookSummaryResponse> {
    return unwrapApiPost('/cashbook/close', body);
  },

  reopen(body: ReopenCashbookPayload): Promise<CashbookSummaryResponse> {
    return unwrapApiPost('/cashbook/reopen', body);
  },

  createManualEntry(
    body: CreateManualCashbookEntryPayload,
    idempotencyKey?: string,
  ): Promise<{ entry: CashbookEntryDto; idempotencyReplayed: boolean }> {
    const key = idempotencyKey ?? Crypto.randomUUID();
    return unwrapApiPost('/cashbook/entries', body, {
      'X-Idempotency-Key': key,
    });
  },
};
