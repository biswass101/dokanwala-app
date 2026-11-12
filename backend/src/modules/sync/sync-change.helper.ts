import type { SyncEntityType } from '@dokanwala/shared';
import type { Prisma, SyncChangeAction } from '../../generated/prisma/client.js';

export interface RecordSyncChangeParams {
  shopId: string;
  entityType: SyncEntityType;
  entityId: string;
  action?: SyncChangeAction;
}

/**
 * Appends a monotonic sync_seq delta marker inside the active Prisma transaction
 * so GET /api/v1/sync/pull streams deterministic device catch-up independent of phone clocks.
 */
export async function recordSyncChange(
  tx: Prisma.TransactionClient,
  params: RecordSyncChangeParams,
): Promise<number> {
  const row = await tx.syncChange.create({
    data: {
      shopId: params.shopId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action ?? 'UPSERT',
    },
    select: {
      syncSeq: true,
    },
  });

  return Number(row.syncSeq);
}
