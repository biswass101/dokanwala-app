import type { BackupRestoreResponse, ShopBackupDocument } from '@dokanwala/shared';
import { apiClient, unwrapApiPost } from './client';

export const backupApi = {
  async exportBackup(): Promise<{
    document: ShopBackupDocument;
    rawJson: string;
    filename: string;
  }> {
    const response = await apiClient.get<ShopBackupDocument | string>('/backup/export', {
      responseType: 'text',
      transformResponse: [(data: string) => data],
    });
    const rawJson = typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2);
    const document = JSON.parse(rawJson) as ShopBackupDocument;
    const disposition = String(response.headers['content-disposition'] ?? '');
    const match = /filename="([^"]+)"/.exec(disposition);
    const filename = match?.[1] ?? 'dokanwala-backup.json';
    return { document, rawJson, filename };
  },

  restoreBackup(document: ShopBackupDocument): Promise<{ restore: BackupRestoreResponse }> {
    return unwrapApiPost('/backup/restore', document);
  },
};
