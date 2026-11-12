import type { OfflineActorContext } from '@/database/repositories/offline-writes.repo';
import { ApiClientError } from '@/services/api/client';
import { useAuthStore } from '@/store/auth.store';
import { safeRefreshSyncStore, useSyncStore } from '@/store/sync.store';

export function getOfflineActorContext(): OfflineActorContext {
  const { user, shop } = useAuthStore.getState();
  if (!user || !shop) {
    throw new Error('No active authenticated shop session');
  }
  return {
    shopId: shop.id,
    userId: user.id,
    userName: user.name,
    shop,
  };
}

export async function executeOnlineOrOffline<T>(params: {
  onlineFn: () => Promise<T>;
  offlineFn: () => Promise<T>;
}): Promise<T> {
  if (!useSyncStore.getState().isOnline) {
    const result = await params.offlineFn();
    await safeRefreshSyncStore();
    return result;
  }

  try {
    return await params.onlineFn();
  } catch (err) {
    if (err instanceof ApiClientError && err.code === 'NETWORK_ERROR') {
      const result = await params.offlineFn();
      await safeRefreshSyncStore();
      return result;
    }
    throw err;
  }
}
