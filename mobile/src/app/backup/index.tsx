import type { ShopBackupDocument } from '@dokanwala/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { AppText, Button, Card, ScreenContainer } from '@/components';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { backupApi } from '@/services/api/backup';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';
import { pickJsonFileText, saveAndShareBytes } from '@/utils/file-export';

function encodeUtf8Bytes(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  return Uint8Array.from(Buffer.from(text, 'utf8'));
}

function parseBackupJson(raw: string): ShopBackupDocument | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ShopBackupDocument>;
    if (
      parsed &&
      parsed.schemaVersion === 1 &&
      typeof parsed.checksumSha256 === 'string' &&
      typeof parsed.sourceShopId === 'string' &&
      parsed.data &&
      typeof parsed.data === 'object'
    ) {
      return parsed as ShopBackupDocument;
    }
    return null;
  } catch {
    return null;
  }
}

export default function BackupScreen() {
  const { t } = useAppTranslation();
  const { formatDigits } = useFormattedMoney();
  const router = useRouter();
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role ?? 'EMPLOYEE');
  const isOwner = role === 'OWNER';

  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [pendingDoc, setPendingDoc] = useState<ShopBackupDocument | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleExport = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setExporting(true);
    try {
      const result = await backupApi.exportBackup();
      await saveAndShareBytes({
        bytes: encodeUtf8Bytes(result.rawJson),
        filename: result.filename,
        mimeType: 'application/json',
        dialogTitle: t('backup.exportSectionTitle'),
      });
      setStatusMessage(t('backup.exportSuccess', { filename: result.filename }));
    } catch (err) {
      setErrorMessage(getLocalizedErrorMessage(err, t));
    } finally {
      setExporting(false);
    }
  };

  const handlePickFile = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const picked = await pickJsonFileText();
      if (!picked) {
        return;
      }
      setSelectedFilename(picked.filename);
      setJsonInput(picked.content);
      setPendingDoc(null);
    } catch (err) {
      setErrorMessage(getLocalizedErrorMessage(err, t));
    }
  };

  const handlePrepareRestore = () => {
    setErrorMessage(null);
    setStatusMessage(null);
    const parsed = parseBackupJson(jsonInput.trim());
    if (!parsed) {
      setPendingDoc(null);
      setErrorMessage(t('backup.invalidJsonError'));
      return;
    }
    setPendingDoc(parsed);
  };

  const handleConfirmRestore = async () => {
    if (!pendingDoc) {
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    setRestoring(true);
    try {
      const { restore } = await backupApi.restoreBackup(pendingDoc);
      setPendingDoc(null);
      await queryClient.invalidateQueries();
      setStatusMessage(
        t('backup.restoreSuccess', {
          products: formatDigits(String(restore.counts.products)),
          sales: formatDigits(String(restore.counts.sales)),
          customers: formatDigits(String(restore.counts.customers)),
        }),
      );
    } catch (err) {
      setErrorMessage(getLocalizedErrorMessage(err, t));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {t('backup.title')}
        </AppText>
        <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
      </View>

      {!isOwner ? (
        <Card style={{ gap: 8 }}>
          <AppText variant="body" color={Colors.danger} weight="semibold">
            {t('backup.ownerOnlyDesc')}
          </AppText>
        </Card>
      ) : (
        <>
          {statusMessage ? (
            <Card
              testID="backup-status-banner"
              style={{ backgroundColor: Colors.successSoft, borderColor: '#A7F3D0', padding: 12 }}
            >
              <AppText variant="body" weight="semibold" color={Colors.success}>
                {statusMessage}
              </AppText>
            </Card>
          ) : null}

          {errorMessage ? (
            <Card
              testID="backup-error-banner"
              style={{ backgroundColor: Colors.dangerSoft, borderColor: '#FECACA', padding: 12 }}
            >
              <AppText variant="body" weight="semibold" color={Colors.danger}>
                {errorMessage}
              </AppText>
            </Card>
          ) : null}

          <Card style={{ gap: 10 }}>
            <AppText variant="sectionTitle" weight="semibold">
              {t('backup.exportSectionTitle')}
            </AppText>
            <AppText variant="caption" color={Colors.textSecondary}>
              {t('backup.exportDesc')}
            </AppText>
            <Button
              label={t('backup.exportButton')}
              testID="backup-export-btn"
              loading={exporting}
              fullWidth
              onPress={() => void handleExport()}
            />
          </Card>

          <Card style={{ gap: 10 }}>
            <AppText variant="sectionTitle" weight="semibold">
              {t('backup.restoreSectionTitle')}
            </AppText>
            <AppText variant="caption" color={Colors.warning}>
              {t('backup.restoreDesc')}
            </AppText>

            <Button
              label={t('backup.pickFileButton')}
              testID="backup-pick-file-btn"
              variant="secondary"
              fullWidth
              onPress={() => void handlePickFile()}
            />

            {selectedFilename ? (
              <AppText variant="caption" weight="semibold" color={Colors.primaryPressed}>
                {t('backup.selectedFileLabel', { filename: selectedFilename })}
              </AppText>
            ) : null}

            <AppText variant="caption" color={Colors.textSecondary}>
              {t('backup.pasteJsonLabel')}
            </AppText>
            <TextInput
              testID="backup-json-input"
              value={jsonInput}
              onChangeText={(text) => {
                setJsonInput(text);
                setPendingDoc(null);
              }}
              placeholder={t('backup.pasteJsonPlaceholder')}
              multiline
              numberOfLines={4}
              style={{
                borderWidth: 1,
                borderColor: Colors.border,
                borderRadius: 10,
                padding: 10,
                minHeight: 96,
                backgroundColor: Colors.background,
                color: Colors.textPrimary,
                textAlignVertical: 'top',
              }}
            />

            {!pendingDoc ? (
              <Button
                label={t('backup.restoreButton')}
                testID="backup-restore-btn"
                variant="outline"
                fullWidth
                onPress={handlePrepareRestore}
              />
            ) : (
              <Card
                style={{
                  gap: 8,
                  backgroundColor: Colors.warningSoft,
                  borderColor: '#FDE68A',
                  padding: 12,
                }}
              >
                <AppText variant="body" weight="bold" color={Colors.warning}>
                  {t('backup.confirmTitle')}
                </AppText>
                <AppText variant="caption" color={Colors.textSecondary}>
                  {t('backup.confirmDesc')}
                </AppText>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button
                    label={t('common.cancel')}
                    variant="outline"
                    onPress={() => setPendingDoc(null)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label={t('backup.confirmButton')}
                    testID="backup-confirm-restore-btn"
                    variant="danger"
                    loading={restoring}
                    onPress={() => void handleConfirmRestore()}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            )}
          </Card>
        </>
      )}
    </ScreenContainer>
  );
}
