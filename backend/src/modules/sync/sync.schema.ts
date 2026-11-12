import { SyncEntityTypes, SyncOperationTypes } from '@dokanwala/shared';
import { z } from 'zod';

const opTypeValues = Object.values(SyncOperationTypes) as [
  (typeof SyncOperationTypes)[keyof typeof SyncOperationTypes],
  ...(typeof SyncOperationTypes)[keyof typeof SyncOperationTypes][],
];

const entityTypeValues = Object.values(SyncEntityTypes) as [
  (typeof SyncEntityTypes)[keyof typeof SyncEntityTypes],
  ...(typeof SyncEntityTypes)[keyof typeof SyncEntityTypes][],
];

export const syncPushOpInputSchema = z.strictObject({
  clientOpId: z.uuid('Invalid clientOpId UUID'),
  idempotencyKey: z.string().trim().min(1).max(120),
  opType: z.enum(opTypeValues),
  entityType: z.enum(entityTypeValues),
  entityId: z.uuid('Invalid entityId UUID'),
  dependsOnEntityId: z.uuid('Invalid dependsOnEntityId UUID').nullable().optional(),
  baseVersion: z.number().int().min(1).nullable().optional(),
  occurredAt: z.iso.datetime({ offset: true }).nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const syncPushSchema = z.strictObject({
  deviceId: z.string().trim().min(1).max(120).nullable().optional(),
  operations: z.array(syncPushOpInputSchema).min(1).max(50),
});

export const syncPullQuerySchema = z.strictObject({
  cursor: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional().default(0),
  limit: z.coerce.number().int().min(1).max(200).optional().default(200),
});

export type SyncPushInput = z.infer<typeof syncPushSchema>;
export type SyncPushOpItemInput = z.infer<typeof syncPushOpInputSchema>;
export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;
