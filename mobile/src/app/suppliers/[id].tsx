import { formatDhakaDateTime } from '@dokanwala/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  LoadingView,
  ScreenContainer,
} from '@/components';
import { OwnerOnlyScreen } from '@/features/purchases/components/OwnerOnlyScreen';
import { SupplierFormModal } from '@/features/purchases/components/SupplierFormModal';
import { SupplierPaymentModal } from '@/features/purchases/components/SupplierPaymentModal';
import {
  useSupplierLedgerQuery,
  useUpdateSupplierMutation,
} from '@/features/purchases/hooks/usePurchasesQueries';
import {
  getLocalizedSupplierName,
  getPurchaseRefundMethodLabel,
  getSupplierLedgerTypeBadge,
} from '@/features/purchases/utils/purchase-format';
import { getPaymentMethodLabel } from '@/features/sales/utils/receipt-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

function SupplierDetailContent({ supplierId }: { supplierId: string | undefined }) {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();

  const ledgerQuery = useSupplierLedgerQuery(supplierId);
  const updateMutation = useUpdateSupplierMutation(supplierId ?? '');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const orderedEntries = useMemo(
    () => [...(ledgerQuery.data?.entries ?? [])].reverse(),
    [ledgerQuery.data?.entries],
  );

  if (ledgerQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingView />
      </ScreenContainer>
    );
  }

  if (ledgerQuery.isError || !ledgerQuery.data?.supplier) {
    return (
      <ScreenContainer>
        <ErrorState
          message={
            ledgerQuery.isError
              ? getLocalizedErrorMessage(ledgerQuery.error, t)
              : t('errors.RESOURCE_NOT_FOUND')
          }
          onRetry={() => void ledgerQuery.refetch()}
        />
      </ScreenContainer>
    );
  }

  const supplier = ledgerQuery.data.supplier;
  const fromOfflineCache = ledgerQuery.data.fromOfflineCache;
  const displayName = getLocalizedSupplierName(supplier, language);

  const handleToggleActive = async () => {
    setActionError(null);
    if (supplier.isActive) {
      setArchiveConfirmOpen(true);
      return;
    }
    try {
      await updateMutation.mutateAsync({
        isActive: true,
        expectedVersion: supplier.version,
      });
    } catch (err) {
      setActionError(getLocalizedErrorMessage(err, t));
    }
  };

  const handleConfirmDeactivate = async () => {
    setActionError(null);
    try {
      await updateMutation.mutateAsync({
        isActive: false,
        confirmWithPayable: true,
        expectedVersion: supplier.version,
      });
      setArchiveConfirmOpen(false);
    } catch (err) {
      setActionError(getLocalizedErrorMessage(err, t));
      setArchiveConfirmOpen(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {t('suppliers.detailTitle')}
        </AppText>
        <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
      </View>

      {fromOfflineCache ? (
        <Card style={{ backgroundColor: Colors.warningSoft, borderColor: '#FDE68A', padding: 10 }}>
          <AppText variant="caption" weight="semibold" color={Colors.warning}>
            {t('common.offlineCachedBadge')}
          </AppText>
        </Card>
      ) : null}

      {actionError ? (
        <Card style={{ backgroundColor: Colors.dangerSoft, borderColor: '#FECACA', padding: 10 }}>
          <AppText variant="caption" weight="semibold" color={Colors.danger}>
            {actionError}
          </AppText>
        </Card>
      ) : null}

      {/* Supplier Profile Card */}
      <Card style={{ gap: 10 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="sectionTitle" weight="bold">
              {displayName}
            </AppText>
            {supplier.phone ? (
              <AppText variant="body" color={Colors.textSecondary}>
                {formatDigits(supplier.phone)}
              </AppText>
            ) : null}
            {supplier.address ? (
              <AppText variant="caption" color={Colors.textSecondary}>
                {supplier.address}
              </AppText>
            ) : null}
            {supplier.note ? (
              <AppText variant="caption" color={Colors.textMuted}>
                {supplier.note}
              </AppText>
            ) : null}
          </View>
          <Badge
            label={supplier.isActive ? t('staff.activeBadge') : t('suppliers.inactiveBadge')}
            tone={supplier.isActive ? 'success' : 'neutral'}
          />
        </View>

        <View
          style={{
            gap: 6,
            borderTopWidth: 1,
            borderTopColor: Colors.border,
            paddingTop: 10,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="body" color={Colors.textSecondary}>
              {t('suppliers.totalPurchasedLabel')}
            </AppText>
            <AppText variant="body" weight="semibold">
              {formatMoney(supplier.totalPurchasedPoisha)}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="body" color={Colors.textSecondary}>
              {t('suppliers.totalPaidLabel')}
            </AppText>
            <AppText variant="body" weight="semibold" color={Colors.success}>
              {formatMoney(supplier.totalPaidPoisha)}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="sectionTitle" weight="bold">
              {t('suppliers.currentPayableLabel')}
            </AppText>
            <AppText
              variant="sectionTitle"
              weight="bold"
              color={supplier.payablePoisha > 0 ? Colors.danger : Colors.success}
            >
              {formatMoney(supplier.payablePoisha)}
            </AppText>
          </View>
        </View>
      </Card>

      {/* Primary Actions */}
      <View style={{ gap: 8 }}>
        {supplier.payablePoisha > 0 ? (
          <Button
            label={t('suppliers.payDueButton')}
            fullWidth
            testID="supplier-pay-due-btn"
            onPress={() => setPaymentModalOpen(true)}
          />
        ) : null}

        {supplier.isActive ? (
          <Button
            label={t('suppliers.newPurchaseFromSupplier')}
            variant="secondary"
            fullWidth
            onPress={() =>
              router.push({ pathname: '/purchases/form', params: { supplierId: supplier.id } })
            }
          />
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            label={t('suppliers.editButton')}
            variant="outline"
            onPress={() => setEditModalOpen(true)}
            style={{ flex: 1 }}
          />
          <Button
            label={
              supplier.isActive ? t('suppliers.deactivateButton') : t('suppliers.activateButton')
            }
            variant={supplier.isActive ? 'danger' : 'secondary'}
            loading={updateMutation.isPending}
            onPress={() => void handleToggleActive()}
            style={{ flex: 1 }}
          />
        </View>
      </View>

      {/* Ledger Entries */}
      <Card style={{ gap: 10 }}>
        <AppText variant="sectionTitle" weight="semibold">
          {t('suppliers.ledgerTitle')}
        </AppText>

        {orderedEntries.length === 0 ? (
          <AppText variant="body" color={Colors.textSecondary}>
            {t('suppliers.ledgerEmpty')}
          </AppText>
        ) : (
          orderedEntries.map((entry) => {
            const typeBadge = getSupplierLedgerTypeBadge(entry.type, t);
            const isPurchaseLink = entry.type === 'PURCHASE' || entry.type === 'PURCHASE_RETURN';
            const deltaText =
              entry.payableDeltaPoisha > 0
                ? `+${formatMoney(entry.payableDeltaPoisha)}`
                : entry.payableDeltaPoisha < 0
                  ? `-${formatMoney(Math.abs(entry.payableDeltaPoisha))}`
                  : formatMoney(0);
            const deltaColor =
              entry.payableDeltaPoisha > 0
                ? Colors.danger
                : entry.payableDeltaPoisha < 0
                  ? Colors.success
                  : Colors.textSecondary;

            let methodLabel: string | null = null;
            if (entry.method) {
              if (entry.type === 'PURCHASE_RETURN') {
                methodLabel = getPurchaseRefundMethodLabel(
                  entry.method as 'CASH' | 'BKASH' | 'NAGAD' | 'OTHER' | 'PAYABLE_ADJUSTMENT',
                  t,
                );
              } else {
                methodLabel = getPaymentMethodLabel(
                  entry.method as 'CASH' | 'BKASH' | 'NAGAD' | 'OTHER',
                  t,
                );
              }
            }

            const inner = (
              <View
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
                  <Badge label={typeBadge.label} tone={typeBadge.tone} />
                  <AppText variant="body" weight="bold" color={deltaColor}>
                    {deltaText}
                  </AppText>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <AppText variant="caption" color={Colors.textSecondary}>
                    {entry.referenceNumber ? `${formatDigits(entry.referenceNumber)} • ` : ''}
                    {formatDhakaDateTime(entry.occurredAt, language, digitStyle)}
                  </AppText>
                  <AppText variant="caption" weight="semibold" color={Colors.textPrimary}>
                    {t('suppliers.runningPayable', {
                      amount: formatMoney(entry.runningPayablePoisha),
                    })}
                  </AppText>
                </View>

                {methodLabel || entry.note ? (
                  <AppText variant="caption" color={Colors.textMuted}>
                    {[methodLabel, entry.note].filter(Boolean).join(' • ')}
                  </AppText>
                ) : null}
              </View>
            );

            if (isPurchaseLink) {
              return (
                <Pressable
                  key={entry.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/purchases/${entry.referenceId}`)}
                >
                  {inner}
                </Pressable>
              );
            }

            return <View key={entry.id}>{inner}</View>;
          })
        )}
      </Card>

      <SupplierFormModal
        visible={editModalOpen}
        supplier={supplier}
        onClose={() => setEditModalOpen(false)}
      />

      <SupplierPaymentModal
        visible={paymentModalOpen}
        supplier={supplier}
        onClose={() => setPaymentModalOpen(false)}
      />

      <ConfirmDialog
        visible={archiveConfirmOpen}
        title={t('suppliers.archiveConfirmTitle')}
        message={
          supplier.payablePoisha > 0
            ? t('suppliers.archiveConfirmWithPayable', {
                amount: formatMoney(supplier.payablePoisha),
              })
            : t('suppliers.archiveConfirmMessage')
        }
        confirmLabel={t('suppliers.deactivateButton')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={updateMutation.isPending}
        onConfirm={() => void handleConfirmDeactivate()}
        onCancel={() => setArchiveConfirmOpen(false)}
      />
    </ScreenContainer>
  );
}

export default function SupplierDetailScreen() {
  const { t } = useAppTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const supplierId = typeof params.id === 'string' ? params.id : undefined;
  const user = useAuthStore((s) => s.user);

  if (user?.role !== 'OWNER') {
    return (
      <OwnerOnlyScreen
        title={t('suppliers.detailTitle')}
        description={t('suppliers.ownerOnlyDesc')}
      />
    );
  }

  return <SupplierDetailContent supplierId={supplierId} />;
}
