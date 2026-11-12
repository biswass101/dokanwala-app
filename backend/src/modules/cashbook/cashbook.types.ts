import type {
  CashbookEntryDto,
  CashbookMethodTotalsDto,
  CashbookSessionDto,
} from '@dokanwala/shared';
import type { Prisma } from '../../generated/prisma/client.js';

export const cashbookSessionInclude = {
  openedByUser: {
    select: { id: true, name: true },
  },
  closedByUser: {
    select: { id: true, name: true },
  },
} satisfies Prisma.CashbookSessionInclude;

export type CashbookSessionWithRelations = Prisma.CashbookSessionGetPayload<{
  include: typeof cashbookSessionInclude;
}>;

export const cashbookEntryInclude = {
  actorUser: {
    select: { id: true, name: true },
  },
} satisfies Prisma.CashbookEntryInclude;

export type CashbookEntryWithRelations = Prisma.CashbookEntryGetPayload<{
  include: typeof cashbookEntryInclude;
}>;

export function toCashbookSessionDto(
  row: CashbookSessionWithRelations,
  liveExpectedClosingCashPoisha?: number,
): CashbookSessionDto {
  const expected =
    row.status === 'OPEN' && liveExpectedClosingCashPoisha !== undefined
      ? liveExpectedClosingCashPoisha
      : row.expectedClosingCashPoisha;

  return {
    id: row.id,
    shopId: row.shopId,
    businessDate: row.businessDate,
    status: row.status,
    openingCashPoisha: row.openingCashPoisha,
    expectedClosingCashPoisha: expected,
    actualClosingCashPoisha: row.actualClosingCashPoisha,
    variancePoisha: row.variancePoisha,
    note: row.note,
    openedByUserId: row.openedByUserId,
    openedByName: row.openedByUser ? row.openedByUser.name : null,
    closedByUserId: row.closedByUserId,
    closedByName: row.closedByUser ? row.closedByUser.name : null,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCashbookEntryDto(row: CashbookEntryWithRelations): CashbookEntryDto {
  return {
    id: row.id,
    shopId: row.shopId,
    sessionId: row.sessionId,
    direction: row.direction,
    entryType: row.entryType,
    method: row.method,
    amountPoisha: row.amountPoisha,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    referenceNumber: row.referenceNumber,
    note: row.note,
    actorUserId: row.actorUserId,
    actorName: row.actorUser ? row.actorUser.name : null,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function computeCashbookMethodTotals(
  entries: ReadonlyArray<{
    direction: 'IN' | 'OUT';
    method: 'CASH' | 'BKASH' | 'NAGAD' | 'OTHER';
    amountPoisha: number;
  }>,
): CashbookMethodTotalsDto {
  let cashInPoisha = 0;
  let cashOutPoisha = 0;
  let bkashInPoisha = 0;
  let bkashOutPoisha = 0;
  let nagadInPoisha = 0;
  let nagadOutPoisha = 0;
  let otherInPoisha = 0;
  let otherOutPoisha = 0;

  for (const entry of entries) {
    const isIn = entry.direction === 'IN';
    switch (entry.method) {
      case 'CASH':
        if (isIn) cashInPoisha += entry.amountPoisha;
        else cashOutPoisha += entry.amountPoisha;
        break;
      case 'BKASH':
        if (isIn) bkashInPoisha += entry.amountPoisha;
        else bkashOutPoisha += entry.amountPoisha;
        break;
      case 'NAGAD':
        if (isIn) nagadInPoisha += entry.amountPoisha;
        else nagadOutPoisha += entry.amountPoisha;
        break;
      case 'OTHER':
        if (isIn) otherInPoisha += entry.amountPoisha;
        else otherOutPoisha += entry.amountPoisha;
        break;
    }
  }

  const netCashPoisha = cashInPoisha - cashOutPoisha;
  const netBkashPoisha = bkashInPoisha - bkashOutPoisha;
  const netNagadPoisha = nagadInPoisha - nagadOutPoisha;
  const netOtherPoisha = otherInPoisha - otherOutPoisha;
  const totalInPoisha = cashInPoisha + bkashInPoisha + nagadInPoisha + otherInPoisha;
  const totalOutPoisha = cashOutPoisha + bkashOutPoisha + nagadOutPoisha + otherOutPoisha;

  return {
    cashInPoisha,
    cashOutPoisha,
    netCashPoisha,
    bkashInPoisha,
    bkashOutPoisha,
    netBkashPoisha,
    nagadInPoisha,
    nagadOutPoisha,
    netNagadPoisha,
    otherInPoisha,
    otherOutPoisha,
    netOtherPoisha,
    totalInPoisha,
    totalOutPoisha,
    netAllMethodsPoisha: totalInPoisha - totalOutPoisha,
  };
}
