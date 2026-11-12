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
import { CustomerFormModal } from '@/features/customers/components/CustomerFormModal';
import { CustomerPaymentModal } from '@/features/customers/components/CustomerPaymentModal';
import {
  useCustomerLedgerQuery,
  useUpdateCustomerMutation,
} from '@/features/customers/hooks/useCustomersQueries';
import {
  getCustomerLedgerTypeBadge,
  getLocalizedCustomerName,
} from '@/features/customers/utils/customer-format';
import { getPaymentMethodLabel, getRefundMethodLabel } from '@/features/sales/utils/receipt-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export default function CustomerDetailScreen() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const customerId = typeof params.id === 'string' ? params.id : undefined;

  const user = useAuthStore((s) => s.user);
  const shop = useAuthStore((s) => s.shop);
  const canCollectDue = user?.role === 'OWNER' || Boolean(shop?.employeeCanGiveCredit);

  const ledgerQuery = useCustomerLedgerQuery(customerId);
  const updateMutation = useUpdateCustomerMutation(customerId ?? '');

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

  if (ledgerQuery.isError || !ledgerQuery.data?.customer) {
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

  const customer = ledgerQuery.data.customer;
  const fromOfflineCache = ledgerQuery.data.fromOfflineCache;
  const displayName = getLocalizedCustomerName(customer, language);

  const handleToggleActive = async () => {
    setActionError(null);
    if (customer.isActive) {
      setArchiveConfirmOpen(true);
      return;
    }
    try {
      await updateMutation.mutateAsync({
        isActive: true,
        expectedVersion: customer.version,
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
        confirmWithDue: true,
        expectedVersion: customer.version,
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
          {t('customers.detailTitle')}
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

      {/* Customer Profile Card */}
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
            {customer.phone ? (
              <AppText variant="body" color={Colors.textSecondary}>
                {formatDigits(customer.phone)}
              </AppText>
            ) : null}
            {customer.address ? (
              <AppText variant="caption" color={Colors.textSecondary}>
                {customer.address}
              </AppText>
            ) : null}
            {customer.note ? (
              <AppText variant="caption" color={Colors.textMuted}>
                {customer.note}
              </AppText>
            ) : null}
          </View>
          <Badge
            label={customer.isActive ? t('staff.activeBadge') : t('customers.inactiveBadge')}
            tone={customer.isActive ? 'success' : 'neutral'}
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
              {t('customers.totalPurchasedLabel')}
            </AppText>
            <AppText variant="body" weight="semibold">
              {formatMoney(customer.totalPurchasedPoisha)}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="body" color={Colors.textSecondary}>
              {t('customers.totalPaidLabel')}
            </AppText>
            <AppText variant="body" weight="semibold" color={Colors.success}>
              {formatMoney(customer.totalPaidPoisha)}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="sectionTitle" weight="bold">
              {t('customers.currentDueLabel')}
            </AppText>
            <AppText
              variant="sectionTitle"
              weight="bold"
              color={customer.duePoisha > 0 ? Colors.danger : Colors.success}
            >
              {formatMoney(customer.duePoisha)}
            </AppText>
          </View>
        </View>
      </Card>

      {/* Primary Actions */}
      <View style={{ gap: 8 }}>
        {customer.duePoisha > 0 && canCollectDue ? (
          <Button
            label={t('customers.collectDueButton')}
            fullWidth
            testID="customer-collect-due-btn"
            onPress={() => setPaymentModalOpen(true)}
          />
        ) : null}

        {customer.duePoisha > 0 && !canCollectDue ? (
          <Card
            style={{ backgroundColor: Colors.warningSoft, borderColor: '#FDE68A', padding: 10 }}
          >
            <AppText variant="caption" weight="semibold" color={Colors.warning}>
              {t('customers.employeeBlockedNote')}
            </AppText>
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            label={t('customers.editButton')}
            variant="outline"
            testID="customer-edit-btn"
            onPress={() => setEditModalOpen(true)}
            style={{ flex: 1 }}
          />
          <Button
            label={
              customer.isActive ? t('customers.deactivateButton') : t('customers.activateButton')
            }
            variant={customer.isActive ? 'danger' : 'secondary'}
            loading={updateMutation.isPending}
            onPress={() => void handleToggleActive()}
            style={{ flex: 1 }}
          />
        </View>
      </View>

      {/* Ledger Entries */}
      <Card style={{ gap: 10 }}>
        <AppText variant="sectionTitle" weight="semibold">
          {t('customers.ledgerTitle')}
        </AppText>

        {orderedEntries.length === 0 ? (
          <AppText variant="body" color={Colors.textSecondary}>
            {t('customers.ledgerEmpty')}
          </AppText>
        ) : (
          orderedEntries.map((entry) => {
            const typeBadge = getCustomerLedgerTypeBadge(entry.type, t);
            const isSaleLink =
              entry.type === 'SALE' || entry.type === 'SALE_RETURN' || entry.type === 'SALE_CANCEL';
            const deltaText =
              entry.dueDeltaPoisha > 0
                ? `+${formatMoney(entry.dueDeltaPoisha)}`
                : entry.dueDeltaPoisha < 0
                  ? `-${formatMoney(Math.abs(entry.dueDeltaPoisha))}`
                  : formatMoney(0);
            const deltaColor =
              entry.dueDeltaPoisha > 0
                ? Colors.danger
                : entry.dueDeltaPoisha < 0
                  ? Colors.success
                  : Colors.textSecondary;

            let methodLabel: string | null = null;
            if (entry.method) {
              if (entry.type === 'SALE_RETURN') {
                methodLabel = getRefundMethodLabel(
                  entry.method as 'CASH' | 'BKASH' | 'NAGAD' | 'OTHER' | 'CREDIT_ADJUSTMENT',
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
                    {t('customers.runningDue', {
                      amount: formatMoney(entry.runningDuePoisha),
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

            if (isSaleLink) {
              return (
                <Pressable
                  key={entry.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/sales/${entry.referenceId}`)}
                >
                  {inner}
                </Pressable>
              );
            }

            return <View key={entry.id}>{inner}</View>;
          })
        )}
      </Card>

      <CustomerFormModal
        visible={editModalOpen}
        customer={customer}
        onClose={() => setEditModalOpen(false)}
      />

      <CustomerPaymentModal
        visible={paymentModalOpen}
        customer={customer}
        onClose={() => setPaymentModalOpen(false)}
      />

      <ConfirmDialog
        visible={archiveConfirmOpen}
        title={t('customers.archiveConfirmTitle')}
        message={
          customer.duePoisha > 0
            ? t('customers.archiveConfirmWithDue', {
                amount: formatMoney(customer.duePoisha),
              })
            : t('customers.archiveConfirmMessage')
        }
        confirmLabel={t('customers.deactivateButton')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={updateMutation.isPending}
        onConfirm={() => void handleConfirmDeactivate()}
        onCancel={() => setArchiveConfirmOpen(false)}
      />
    </ScreenContainer>
  );
}
