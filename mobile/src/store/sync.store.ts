import type { LocalSyncCountsDto } from '@dokanwala/shared';
import { create } from 'zustand';
import {
  getOrCreateLocalSyncState,
  getSyncCounts,
  loadSyncOutboxItems,
  type LocalSyncOutboxRecord,
} from '@/database/repositories/sync-outbox.repo';
import { useAuthStore } from '@/store/auth.store';
import { usePreferencesStore, type SyncIndicatorState } from '@/store/preferences.store';

const EMPTY_COUNTS: LocalSyncCountsDto = {
  pendingCount: 0,
  inFlightCount: 0,
  retryableCount: 0,
  conflictCount: 0,
  actionRequiredCount: 0,
  totalUnresolvedCount: 0,
};

function computeSyncIndicator(
  isSyncing: boolean,
  counts: LocalSyncCountsDto,
): { indicator: SyncIndicatorState; count: number } {
  const conflictTotal = counts.conflictCount + counts.actionRequiredCount;
  const pendingTotal = counts.pendingCount + counts.inFlightCount + counts.retryableCount;

  if (isSyncing) {
    return {
      indicator: 'syncing',
      count: pendingTotal + conflictTotal,
    };
  }
  if (conflictTotal > 0) {
    return {
      indicator: 'conflict',
      count: conflictTotal,
    };
  }
  if (pendingTotal > 0) {
    return {
      indicator: 'pending',
      count: pendingTotal,
    };
  }
  return {
    indicator: 'synced',
    count: 0,
  };
}

interface SyncStoreState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncSeq: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  deviceId: string | null;
  counts: LocalSyncCountsDto;
  outboxItems: LocalSyncOutboxRecord[];
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setLastError: (error: string | null) => void;
  refreshFromLocalDb: (shopId: string) => Promise<void>;
  resetSyncStore: () => void;
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  isOnline: true,
  isSyncing: false,
  lastSyncSeq: 0,
  lastSyncedAt: null,
  lastError: null,
  deviceId: null,
  counts: EMPTY_COUNTS,
  outboxItems: [],

  setOnline: (isOnline) => set({ isOnline }),

  setSyncing: (isSyncing) => {
    set({ isSyncing });
    const { indicator, count } = computeSyncIndicator(isSyncing, get().counts);
    usePreferencesStore.getState().setSyncIndicator(indicator, count);
  },

  setLastError: (lastError) => set({ lastError }),

  refreshFromLocalDb: async (shopId) => {
    if (!shopId) {
      get().resetSyncStore();
      return;
    }

    const [syncState, counts, outboxItems] = await Promise.all([
      getOrCreateLocalSyncState(shopId),
      getSyncCounts(shopId),
      loadSyncOutboxItems(shopId),
    ]);

    set({
      lastSyncSeq: syncState.lastSyncSeq,
      lastSyncedAt: syncState.lastSyncedAt,
      deviceId: syncState.deviceId,
      counts,
      outboxItems,
    });

    const { indicator, count } = computeSyncIndicator(get().isSyncing, counts);
    usePreferencesStore.getState().setSyncIndicator(indicator, count);
  },

  resetSyncStore: () => {
    set({
      isSyncing: false,
      lastSyncSeq: 0,
      lastSyncedAt: null,
      lastError: null,
      deviceId: null,
      counts: EMPTY_COUNTS,
      outboxItems: [],
    });
    usePreferencesStore.getState().setSyncIndicator('synced', 0);
  },
}));

export async function safeRefreshSyncStore(): Promise<void> {
  const shopId = useAuthStore.getState().shop?.id;
  if (!shopId) return;
  try {
    await useSyncStore.getState().refreshFromLocalDb(shopId);
  } catch {
    // Ignore store refresh failures if database isn't mocked in isolated UI unit tests
  }
}
