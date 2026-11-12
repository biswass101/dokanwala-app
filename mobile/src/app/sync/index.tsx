import {
  formatDhakaDateTime,
  SyncOutboxStatuses,
  type SyncOutboxStatus,
} from '@dokanwala/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { AppText, Badge, Button, Card, ScreenContainer } from '@/components';
import type { LocalSyncOutboxRecord } from '@/database/repositories/sync-outbox.repo';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import {
  resolveDiscardOp,
  resolveForceNegativeStockSync,
  resolveKeepMine,
  resolveRetryOp,
  resolveUseServer,
  runSyncNow,
} from '@/services/sync/sync-engine';
import { useAuthStore } from '@/store/auth.store';
import { useSyncStore } from '@/store/sync.store';
import { Colors } from '@/theme/tokens';

function getStatusBadgeTone(
  status: SyncOutboxStatus,
): 'success' | 'warning' | 'danger' | 'primary' | 'neutral' {
  switch (status) {
    case SyncOutboxStatuses.SYNCED:
      return 'success';
    case SyncOutboxStatuses.IN_FLIGHT:
      return 'primary';
    case SyncOutboxStatuses.CONFLICT:
    case SyncOutboxStatuses.ACTION_REQUIRED:
      return 'danger';
    case SyncOutboxStatuses.FAILED_RETRYABLE:
    case SyncOutboxStatuses.PENDING:
    default:
      return 'warning';
  }
}

function summarizeSnapshotLines(
  snapshot: Record<string, unknown> | null,
  formatMoney: (poisha: number) => string,
  formatDigits: (value: string | number) => string,
): string[] {
  if (!snapshot) return [];
  const lines: string[] = [];
  if (typeof snapshot.nameBn === 'string' && snapshot.nameBn.trim().length > 0) {
    lines.push(snapshot.nameBn);
  }
  if (typeof snapshot.receiptNumber === 'string') {
    lines.push(formatDigits(snapshot.receiptNumber));
  }
  if (typeof snapshot.baseSellingPricePoisha === 'number') {
    lines.push(formatMoney(snapshot.baseSellingPricePoisha));
  }
  if (typeof snapshot.totalPoisha === 'number') {
    lines.push(formatMoney(snapshot.totalPoisha));
  }
  if (typeof snapshot.amountPoisha === 'number') {
    lines.push(formatMoney(snapshot.amountPoisha));
  }
  if (typeof snapshot.duePoisha === 'number' && snapshot.duePoisha > 0) {
    lines.push(`Due: ${formatMoney(snapshot.duePoisha)}`);
  }
  if (typeof snapshot.phone === 'string' && snapshot.phone.trim().length > 0) {
    lines.push(formatDigits(snapshot.phone));
  }
  if (typeof snapshot.availableQtyBase === 'string' && typeof snapshot.requestedQtyBase === 'string') {
    lines.push(`${formatDigits(snapshot.availableQtyBase)} / ${formatDigits(snapshot.requestedQtyBase)}`);
  }
  if (typeof snapshot.note === 'string' && snapshot.note.trim().length > 0) {
    lines.push(snapshot.note);
  }
  return lines.slice(0, 4);
}

export default function SyncCenterScreen() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();
  const queryClient = useQueryClient();

  const user = useAuthStore((s) => s.user);
  const shop = useAuthStore((s) => s.shop);
  const shopId = shop?.id ?? '';
  const isOwner = user?.role === 'OWNER';

  const isOnline = useSyncStore((s) => s.isOnline);
  const isSyncing = useSyncStore((s) => s.isSyncing);
  const lastSyncSeq = useSyncStore((s) => s.lastSyncSeq);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const lastError = useSyncStore((s) => s.lastError);
  const counts = useSyncStore((s) => s.counts);
  const outboxItems = useSyncStore((s) => s.outboxItems);
  const refreshFromLocalDb = useSyncStore((s) => s.refreshFromLocalDb);

  const [busyOpId, setBusyOpId] = useState<string | null>(null);

  useEffect(() => {
    if (shopId) {
      void refreshFromLocalDb(shopId);
    }
  }, [shopId, refreshFromLocalDb]);

  const conflictItems = useMemo(
    () =>
      outboxItems.filter(
        (item) =>
          item.status === SyncOutboxStatuses.CONFLICT ||
          item.status === SyncOutboxStatuses.ACTION_REQUIRED,
      ),
    [outboxItems],
  );

  const otherItems = useMemo(
    () =>
      [...outboxItems]
        .filter(
          (item) =>
            item.status !== SyncOutboxStatuses.CONFLICT &&
            item.status !== SyncOutboxStatuses.ACTION_REQUIRED,
        )
        .reverse(),
    [outboxItems],
  );

  const pendingTotal = counts.pendingCount + counts.inFlightCount + counts.retryableCount;
  const conflictTotal = counts.conflictCount + counts.actionRequiredCount;

  const handleManualSync = async () => {
    await runSyncNow(queryClient, { force: true });
  };

  const handleKeepMine = async (item: LocalSyncOutboxRecord) => {
    if (!shopId) return;
    setBusyOpId(item.clientOpId);
    try {
      await resolveKeepMine(shopId, item, queryClient);
    } finally {
      setBusyOpId(null);
    }
  };

  const handleUseServer = async (item: LocalSyncOutboxRecord) => {
    if (!shopId) return;
    setBusyOpId(item.clientOpId);
    try {
      await resolveUseServer(shopId, item, queryClient);
    } finally {
      setBusyOpId(null);
    }
  };

  const handleForceStock = async (item: LocalSyncOutboxRecord) => {
    if (!shopId) return;
    setBusyOpId(item.clientOpId);
    try {
      await resolveForceNegativeStockSync(shopId, item.clientOpId, queryClient);
    } finally {
      setBusyOpId(null);
    }
  };

  const handleRetry = async (item: LocalSyncOutboxRecord) => {
    if (!shopId) return;
    setBusyOpId(item.clientOpId);
    try {
      await resolveRetryOp(shopId, item.clientOpId, queryClient);
    } finally {
      setBusyOpId(null);
    }
  };

  const handleDiscard = async (item: LocalSyncOutboxRecord) => {
    if (!shopId) return;
    setBusyOpId(item.clientOpId);
    try {
      await resolveDiscardOp(shopId, item, queryClient);
    } finally {
      setBusyOpId(null);
    }
  };

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {t('sync.centerTitle')}
        </AppText>
        <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
      </View>

      {/* Connection & Cursor Summary Card */}
      <Card style={{ gap: 10 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Badge
            label={isOnline ? t('sync.onlineBadge') : t('sync.offlineBadge')}
            tone={isOnline ? 'success' : 'warning'}
          />
          <AppText variant="caption" color={Colors.textSecondary}>
            {t('sync.lastSyncSeq', { seq: formatDigits(lastSyncSeq) })}
          </AppText>
        </View>

        <AppText variant="caption" color={Colors.textSecondary}>
          {lastSyncedAt
            ? t('sync.lastSyncedAt', {
                time: formatDhakaDateTime(lastSyncedAt, language, digitStyle),
              })
            : t('sync.neverSynced')}
        </AppText>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Badge
            label={t('sync.countsPending', { count: formatDigits(pendingTotal) })}
            tone={pendingTotal > 0 ? 'warning' : 'neutral'}
          />
          <Badge
            label={t('sync.countsConflicts', { count: formatDigits(conflictTotal) })}
            tone={conflictTotal > 0 ? 'danger' : 'neutral'}
          />
        </View>

        {lastError ? (
          <Card style={{ backgroundColor: Colors.dangerSoft, borderColor: '#FECACA', padding: 10 }}>
            <AppText variant="caption" color={Colors.danger}>
              {lastError}
            </AppText>
          </Card>
        ) : null}

        <Button
          label={isSyncing ? t('sync.syncing') : t('sync.syncNowButton')}
          fullWidth
          testID="sync-now-btn"
          loading={isSyncing}
          onPress={() => void handleManualSync()}
        />
      </Card>

      {/* Conflicts & Action Required Inspector */}
      <Card style={{ gap: 12 }}>
        <AppText variant="sectionTitle" weight="bold">
          {t('sync.conflictsTitle')}
        </AppText>

        {conflictItems.length === 0 ? (
          <AppText variant="body" color={Colors.textSecondary}>
            {t('sync.noConflicts')}
          </AppText>
        ) : (
          conflictItems.map((item) => {
            const localLines = summarizeSnapshotLines(
              item.localSnapshot ?? item.payload,
              formatMoney,
              formatDigits,
            );
            const serverLines = summarizeSnapshotLines(
              item.serverSnapshot,
              formatMoney,
              formatDigits,
            );
            const itemBusy = busyOpId === item.clientOpId || isSyncing;
            const opLabel = t(`sync.opLabels.${item.opType}`, { defaultValue: item.opType });
            const conflictKindLabel = item.conflictKind
              ? t(`sync.conflictKindLabels.${item.conflictKind}`, {
                  defaultValue: item.conflictKind,
                })
              : t('sync.statusLabels.CONFLICT');

            return (
              <Card
                key={item.clientOpId}
                testID={`sync-conflict-card-${item.clientOpId}`}
                style={{
                  gap: 10,
                  backgroundColor: Colors.dangerSoft,
                  borderColor: '#FECACA',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <AppText variant="body" weight="bold" style={{ flex: 1 }}>
                    {opLabel}
                  </AppText>
                  <Badge label={conflictKindLabel} tone="danger" />
                </View>

                {item.conflictMessage ? (
                  <AppText variant="caption" color={Colors.danger}>
                    {item.conflictMessage}
                  </AppText>
                ) : null}

                {/* Side-by-side Device vs Server Comparison */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: Colors.surface,
                      borderRadius: 8,
                      padding: 10,
                      borderWidth: 1,
                      borderColor: Colors.border,
                      gap: 4,
                    }}
                  >
                    <AppText variant="caption" weight="bold" color={Colors.primaryPressed}>
                      {t('sync.localDeviceTitle')}
                    </AppText>
                    {localLines.map((line, idx) => (
                      <AppText key={`l-${idx}`} variant="caption" color={Colors.textPrimary}>
                        {line}
                      </AppText>
                    ))}
                  </View>

                  <View
                    style={{
                      flex: 1,
                      backgroundColor: Colors.surface,
                      borderRadius: 8,
                      padding: 10,
                      borderWidth: 1,
                      borderColor: Colors.border,
                      gap: 4,
                    }}
                  >
                    <AppText variant="caption" weight="bold" color={Colors.textSecondary}>
                      {item.serverVersion !== null
                        ? t('sync.serverDataTitle', {
                            version: formatDigits(item.serverVersion),
                          })
                        : t('sync.serverDataUnknown')}
                    </AppText>
                    {serverLines.map((line, idx) => (
                      <AppText key={`s-${idx}`} variant="caption" color={Colors.textPrimary}>
                        {line}
                      </AppText>
                    ))}
                  </View>
                </View>

                {/* Resolution Actions */}
                <View style={{ gap: 8 }}>
                  {item.conflictKind === 'VERSION_CONFLICT' ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button
                        label={t('sync.keepMineButton')}
                        variant="primary"
                        loading={itemBusy}
                        testID={`sync-keep-mine-${item.clientOpId}`}
                        onPress={() => void handleKeepMine(item)}
                        style={{ flex: 1 }}
                      />
                      <Button
                        label={t('sync.useServerButton')}
                        variant="outline"
                        disabled={itemBusy}
                        testID={`sync-use-server-${item.clientOpId}`}
                        onPress={() => void handleUseServer(item)}
                        style={{ flex: 1 }}
                      />
                    </View>
                  ) : null}

                  {item.conflictKind === 'INSUFFICIENT_STOCK' ? (
                    <View style={{ gap: 8 }}>
                      {isOwner ? (
                        <Button
                          label={t('sync.forceNegativeStockButton')}
                          variant="primary"
                          fullWidth
                          loading={itemBusy}
                          testID={`sync-force-stock-${item.clientOpId}`}
                          onPress={() => void handleForceStock(item)}
                        />
                      ) : (
                        <AppText variant="caption" color={Colors.warning}>
                          {t('sync.ownerRequiredNote')}
                        </AppText>
                      )}
                      <Button
                        label={t('sync.discardButton')}
                        variant="danger"
                        fullWidth
                        disabled={itemBusy}
                        testID={`sync-discard-${item.clientOpId}`}
                        onPress={() => void handleDiscard(item)}
                      />
                    </View>
                  ) : null}

                  {item.conflictKind !== 'VERSION_CONFLICT' &&
                  item.conflictKind !== 'INSUFFICIENT_STOCK' ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button
                        label={t('sync.retryButton')}
                        variant="secondary"
                        loading={itemBusy}
                        testID={`sync-retry-${item.clientOpId}`}
                        onPress={() => void handleRetry(item)}
                        style={{ flex: 1 }}
                      />
                      <Button
                        label={t('sync.discardButton')}
                        variant="danger"
                        disabled={itemBusy}
                        testID={`sync-discard-${item.clientOpId}`}
                        onPress={() => void handleDiscard(item)}
                        style={{ flex: 1 }}
                      />
                    </View>
                  ) : null}
                </View>
              </Card>
            );
          })
        )}
      </Card>

      {/* Outbox Queue */}
      <Card style={{ gap: 10 }}>
        <AppText variant="sectionTitle" weight="semibold">
          {t('sync.outboxTitle', { count: formatDigits(otherItems.length) })}
        </AppText>

        {otherItems.length === 0 ? (
          <AppText variant="body" color={Colors.textSecondary}>
            {t('sync.noOutboxItems')}
          </AppText>
        ) : (
          otherItems.map((item) => {
            const opLabel = t(`sync.opLabels.${item.opType}`, { defaultValue: item.opType });
            const statusLabel = t(`sync.statusLabels.${item.status}`, {
              defaultValue: item.status,
            });
            const lines = summarizeSnapshotLines(
              item.localSnapshot ?? item.payload,
              formatMoney,
              formatDigits,
            );

            return (
              <View
                key={item.clientOpId}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: Colors.border,
                  paddingTop: 10,
                  gap: 4,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <AppText variant="body" weight="semibold" style={{ flex: 1 }}>
                    {opLabel}
                  </AppText>
                  <Badge label={statusLabel} tone={getStatusBadgeTone(item.status)} />
                </View>

                {lines.length > 0 ? (
                  <AppText variant="caption" color={Colors.textSecondary}>
                    {lines.join(' • ')}
                  </AppText>
                ) : null}

                <AppText variant="caption" color={Colors.textMuted}>
                  {formatDhakaDateTime(item.occurredAt, language, digitStyle)}
                  {item.retryCount > 0
                    ? ` • ${t('sync.retryCountLabel', { count: formatDigits(item.retryCount) })}`
                    : ''}
                </AppText>

                {item.dependsOnEntityId && item.status !== SyncOutboxStatuses.SYNCED ? (
                  <AppText variant="caption" color={Colors.warning}>
                    {t('sync.dependsOnNote')}
                  </AppText>
                ) : null}

                {item.warnings.map((w, idx) => (
                  <AppText key={`w-${idx}`} variant="caption" color={Colors.warning}>
                    {t(`sync.warningLabels.${w}`, { defaultValue: w })}
                  </AppText>
                ))}
              </View>
            );
          })
        )}
      </Card>
    </ScreenContainer>
  );
}
