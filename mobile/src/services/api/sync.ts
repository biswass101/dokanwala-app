import type {
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
} from '@dokanwala/shared';
import { unwrapApiGet, unwrapApiPost } from './client';

export const syncApi = {
  push(body: SyncPushRequest): Promise<SyncPushResponse> {
    return unwrapApiPost<SyncPushResponse>('/sync/push', body);
  },

  pull(cursor: number, limit = 200): Promise<SyncPullResponse> {
    return unwrapApiGet<SyncPullResponse>('/sync/pull', { cursor, limit });
  },
};
