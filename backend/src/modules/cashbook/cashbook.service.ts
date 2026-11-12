import { ErrorCodes, type CashbookEntryDto, type CashbookSummaryResponse } from '@dokanwala/shared';
import { prisma } from '../../database/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/app-error.js';
import { formatDhakaYmd, getDhakaDayRangeUtc } from '../../shared/utils/timezone.js';
import { requireIdempotencyKey, type RequestMeta } from '../../shared/utils/transaction-helpers.js';
import { recordSyncChange } from '../sync/sync-change.helper.js';
import type {
  CloseCashbookInput,
  CreateManualCashbookEntryInput,
  OpenCashbookInput,
  ReopenCashbookInput,
} from './cashbook.schema.js';
import {
  cashbookEntryInclude,
  cashbookSessionInclude,
  computeCashbookMethodTotals,
  toCashbookEntryDto,
  toCashbookSessionDto,
} from './cashbook.types.js';

function validateBusinessDateRange(businessDate: string): { startUtc: Date; endUtc: Date } {
  try {
    return getDhakaDayRangeUtc(businessDate);
  } catch (err) {
    throw new ValidationError(err instanceof Error ? err.message : 'Invalid businessDate');
  }
}

export async function getCashbookSummary(
  shopId: string,
  requestedDate?: string,
): Promise<CashbookSummaryResponse> {
  const businessDate = requestedDate ?? formatDhakaYmd();
  const { startUtc, endUtc } = validateBusinessDateRange(businessDate);

  const [session, previousClosed, entryRows] = await Promise.all([
    prismaFindSession(shopId, businessDate),
    prismaFindPreviousClosedSession(shopId, businessDate),
    prismaFindEntriesInRange(shopId, startUtc, endUtc),
  ]);

  const totals = computeCashbookMethodTotals(entryRows);
  const openingCashPoisha = session ? session.openingCashPoisha : 0;
  const liveExpectedClosingCashPoisha = openingCashPoisha + totals.netCashPoisha;

  return {
    businessDate,
    session: session ? toCashbookSessionDto(session, liveExpectedClosingCashPoisha) : null,
    totals,
    liveExpectedClosingCashPoisha,
    previousClosedCashPoisha: previousClosed ? previousClosed.actualClosingCashPoisha : null,
    entries: entryRows.map(toCashbookEntryDto),
  };
}

async function prismaFindSession(shopId: string, businessDate: string) {
  return prisma.cashbookSession.findUnique({
    where: {
      shopId_businessDate: {
        shopId,
        businessDate,
      },
    },
    include: cashbookSessionInclude,
  });
}

async function prismaFindPreviousClosedSession(shopId: string, businessDate: string) {
  return prisma.cashbookSession.findFirst({
    where: {
      shopId,
      businessDate: { lt: businessDate },
      status: 'CLOSED',
      actualClosingCashPoisha: { not: null },
    },
    orderBy: [{ businessDate: 'desc' }],
    select: {
      actualClosingCashPoisha: true,
    },
  });
}

async function prismaFindEntriesInRange(shopId: string, startUtc: Date, endUtc: Date) {
  return prisma.cashbookEntry.findMany({
    where: {
      shopId,
      occurredAt: {
        gte: startUtc,
        lte: endUtc,
      },
    },
    include: cashbookEntryInclude,
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function openCashbookSession(
  shopId: string,
  actorUserId: string,
  input: OpenCashbookInput,
  meta: RequestMeta,
): Promise<CashbookSummaryResponse> {
  const businessDate = input.businessDate ?? formatDhakaYmd();
  const { startUtc, endUtc } = validateBusinessDateRange(businessDate);

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.cashbookSession.findUnique({
        where: {
          shopId_businessDate: {
            shopId,
            businessDate,
          },
        },
        select: { id: true, status: true },
      });

      if (existing) {
        throw new ConflictError(
          `Cashbook session already exists for ${businessDate} (${existing.status})`,
          ErrorCodes.DUPLICATE_RESOURCE,
        );
      }

      const dayEntries = await tx.cashbookEntry.findMany({
        where: {
          shopId,
          occurredAt: { gte: startUtc, lte: endUtc },
        },
        select: {
          direction: true,
          method: true,
          amountPoisha: true,
        },
      });
      const totals = computeCashbookMethodTotals(dayEntries);
      const expectedClosingCashPoisha = input.openingCashPoisha + totals.netCashPoisha;

      const created = await tx.cashbookSession.create({
        data: {
          shopId,
          businessDate,
          status: 'OPEN',
          openingCashPoisha: input.openingCashPoisha,
          expectedClosingCashPoisha,
          note: input.note ?? null,
          openedByUserId: actorUserId,
          openedAt: new Date(),
        },
      });

      await tx.cashbookEntry.updateMany({
        where: {
          shopId,
          sessionId: null,
          occurredAt: { gte: startUtc, lte: endUtc },
        },
        data: {
          sessionId: created.id,
        },
      });

      await tx.auditLog.create({
        data: {
          shopId,
          actorUserId,
          deviceId: meta.deviceId ?? null,
          action: 'CASHBOOK_OPENED',
          entityType: 'CashbookSession',
          entityId: created.id,
          afterJson: {
            businessDate,
            openingCashPoisha: input.openingCashPoisha,
            expectedClosingCashPoisha,
          },
          ipAddress: meta.ipAddress ?? null,
        },
      });

      await recordSyncChange(tx, {
        shopId,
        entityType: 'CASHBOOK_SESSION',
        entityId: created.id,
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError(
        `Cashbook session already exists for ${businessDate}`,
        ErrorCodes.DUPLICATE_RESOURCE,
      );
    }
    throw err;
  }

  return getCashbookSummary(shopId, businessDate);
}

export async function closeCashbookSession(
  shopId: string,
  actorUserId: string,
  input: CloseCashbookInput,
  meta: RequestMeta,
): Promise<CashbookSummaryResponse> {
  const businessDate = input.businessDate ?? formatDhakaYmd();
  const { startUtc, endUtc } = validateBusinessDateRange(businessDate);

  await prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<
      Array<{
        id: string;
        status: 'OPEN' | 'CLOSED';
        opening_cash_poisha: number;
      }>
    >`
      SELECT id, status, opening_cash_poisha
      FROM cashbook_sessions
      WHERE shop_id = ${shopId}::uuid AND business_date = ${businessDate}
      FOR UPDATE
    `;

    const existing = lockedRows[0];
    if (!existing) {
      throw new NotFoundError(`No cashbook session opened for ${businessDate}`);
    }

    if (existing.status === 'CLOSED') {
      throw new BusinessRuleError(
        `Cashbook session for ${businessDate} is already closed`,
        ErrorCodes.BUSINESS_RULE_VIOLATION,
      );
    }

    const dayEntries = await tx.cashbookEntry.findMany({
      where: {
        shopId,
        occurredAt: { gte: startUtc, lte: endUtc },
      },
      select: {
        direction: true,
        method: true,
        amountPoisha: true,
      },
    });
    const totals = computeCashbookMethodTotals(dayEntries);
    const expectedClosingCashPoisha = existing.opening_cash_poisha + totals.netCashPoisha;
    const variancePoisha = input.actualClosingCashPoisha - expectedClosingCashPoisha;

    await tx.cashbookSession.update({
      where: { id: existing.id },
      data: {
        status: 'CLOSED',
        expectedClosingCashPoisha,
        actualClosingCashPoisha: input.actualClosingCashPoisha,
        variancePoisha,
        ...(input.note !== undefined ? { note: input.note } : {}),
        closedByUserId: actorUserId,
        closedAt: new Date(),
        version: { increment: 1 },
      },
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'CASHBOOK_CLOSED',
        entityType: 'CashbookSession',
        entityId: existing.id,
        afterJson: {
          businessDate,
          openingCashPoisha: existing.opening_cash_poisha,
          expectedClosingCashPoisha,
          actualClosingCashPoisha: input.actualClosingCashPoisha,
          variancePoisha,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    await recordSyncChange(tx, {
      shopId,
      entityType: 'CASHBOOK_SESSION',
      entityId: existing.id,
    });
  });

  return getCashbookSummary(shopId, businessDate);
}

export async function reopenCashbookSession(
  shopId: string,
  actorUserId: string,
  input: ReopenCashbookInput,
  meta: RequestMeta,
): Promise<CashbookSummaryResponse> {
  const businessDate = input.businessDate ?? formatDhakaYmd();
  validateBusinessDateRange(businessDate);

  await prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<
      Array<{
        id: string;
        status: 'OPEN' | 'CLOSED';
        actual_closing_cash_poisha: number | null;
        variance_poisha: number | null;
      }>
    >`
      SELECT id, status, actual_closing_cash_poisha, variance_poisha
      FROM cashbook_sessions
      WHERE shop_id = ${shopId}::uuid AND business_date = ${businessDate}
      FOR UPDATE
    `;

    const existing = lockedRows[0];
    if (!existing) {
      throw new NotFoundError(`No cashbook session found for ${businessDate}`);
    }

    if (existing.status === 'OPEN') {
      throw new BusinessRuleError(
        `Cashbook session for ${businessDate} is already open`,
        ErrorCodes.BUSINESS_RULE_VIOLATION,
      );
    }

    await tx.cashbookSession.update({
      where: { id: existing.id },
      data: {
        status: 'OPEN',
        actualClosingCashPoisha: null,
        variancePoisha: null,
        closedByUserId: null,
        closedAt: null,
        version: { increment: 1 },
      },
    });

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: meta.deviceId ?? null,
        action: 'CASHBOOK_REOPENED',
        entityType: 'CashbookSession',
        entityId: existing.id,
        beforeJson: {
          actualClosingCashPoisha: existing.actual_closing_cash_poisha,
          variancePoisha: existing.variance_poisha,
        },
        afterJson: {
          businessDate,
          status: 'OPEN',
          reason: input.reason ?? null,
        },
        ipAddress: meta.ipAddress ?? null,
      },
    });

    await recordSyncChange(tx, {
      shopId,
      entityType: 'CASHBOOK_SESSION',
      entityId: existing.id,
    });
  });

  return getCashbookSummary(shopId, businessDate);
}

export async function createManualCashbookEntry(
  shopId: string,
  actorUserId: string,
  input: CreateManualCashbookEntryInput,
  meta: RequestMeta,
): Promise<{ entry: CashbookEntryDto; idempotencyReplayed: boolean }> {
  const idempotencyKey = requireIdempotencyKey(meta.idempotencyKey);

  const existingReplay = await prisma.cashbookEntry.findUnique({
    where: {
      shopId_idempotencyKey: {
        shopId,
        idempotencyKey,
      },
    },
    include: cashbookEntryInclude,
  });

  if (existingReplay) {
    return {
      entry: toCashbookEntryDto(existingReplay),
      idempotencyReplayed: true,
    };
  }

  let occurredAt: Date;
  if (input.occurredAt) {
    occurredAt = new Date(input.occurredAt);
  } else if (input.businessDate && input.businessDate !== formatDhakaYmd()) {
    validateBusinessDateRange(input.businessDate);
    occurredAt = new Date(`${input.businessDate}T12:00:00+06:00`);
  } else {
    occurredAt = new Date();
  }

  const businessDate = formatDhakaYmd(occurredAt);
  const direction = input.entryType === 'OWNER_CASH_IN' ? 'IN' : 'OUT';

  try {
    const created = await prisma.$transaction(async (tx) => {
      const session = await tx.cashbookSession.findUnique({
        where: {
          shopId_businessDate: {
            shopId,
            businessDate,
          },
        },
        select: { id: true },
      });

      const entry = await tx.cashbookEntry.create({
        data: {
          ...(input.id !== undefined ? { id: input.id } : {}),
          shopId,
          sessionId: session?.id ?? null,
          direction,
          entryType: input.entryType,
          method: input.method,
          amountPoisha: input.amountPoisha,
          referenceType: 'MANUAL',
          note: input.note ?? null,
          idempotencyKey,
          actorUserId,
          occurredAt,
        },
        include: cashbookEntryInclude,
      });

      await tx.auditLog.create({
        data: {
          shopId,
          actorUserId,
          deviceId: meta.deviceId ?? null,
          action: 'CASHBOOK_MANUAL_ENTRY',
          entityType: 'CashbookEntry',
          entityId: entry.id,
          afterJson: {
            businessDate,
            entryType: input.entryType,
            direction,
            method: input.method,
            amountPoisha: input.amountPoisha,
            note: input.note ?? null,
          },
          ipAddress: meta.ipAddress ?? null,
        },
      });

      if (session?.id) {
        await recordSyncChange(tx, {
          shopId,
          entityType: 'CASHBOOK_SESSION',
          entityId: session.id,
        });
      }
      await recordSyncChange(tx, {
        shopId,
        entityType: 'CASHBOOK_ENTRY',
        entityId: entry.id,
      });

      return entry;
    });

    return {
      entry: toCashbookEntryDto(created),
      idempotencyReplayed: false,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.cashbookEntry.findUnique({
        where: {
          shopId_idempotencyKey: {
            shopId,
            idempotencyKey,
          },
        },
        include: cashbookEntryInclude,
      });
      if (winner) {
        return {
          entry: toCashbookEntryDto(winner),
          idempotencyReplayed: true,
        };
      }
    }
    throw err;
  }
}
