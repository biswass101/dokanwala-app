import { compareQuantities, formatDhakaDateTime, formatQuantityDisplay } from '@dokanwala/shared';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  Input,
  LoadingView,
  ScreenContainer,
} from '@/components';
import { ReturnItemsModal } from '@/features/sales/components/ReturnItemsModal';
import { useCancelSaleMutation, useSaleDetailQuery } from '@/features/sales/hooks/useSalesQueries';
import {
  getPaymentMethodLabel,
  getRefundMethodLabel,
  getSaleStatusBadge,
} from '@/features/sales/utils/receipt-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { Colors, Layout } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export default function SaleDetailScreen() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const saleId = typeof params.id === 'string' ? params.id : undefined;

  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === 'OWNER';

  const detailQuery = useSaleDetailQuery(saleId);
  const cancelMutation = useCancelSaleMutation(saleId ?? '');

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelIdempotencyKey, setCancelIdempotencyKey] = useState<string>(() =>
    Crypto.randomUUID(),
  );

  if (detailQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingView />
      </ScreenContainer>
    );
  }

  if (detailQuery.isError || !detailQuery.data?.sale) {
    return (
      <ScreenContainer>
        <ErrorState
          message={
            detailQuery.isError
              ? getLocalizedErrorMessage(detailQuery.error, t)
              : t('errors.RESOURCE_NOT_FOUND')
          }
          onRetry={() => void detailQuery.refetch()}
        />
      </ScreenContainer>
    );
  }

  const sale = detailQuery.data.sale;
  const fromOfflineCache = detailQuery.data.fromOfflineCache;
  const statusBadge = getSaleStatusBadge(sale.status, t);
  const canReturn = sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_RETURNED';
  const canCancel = isOwner && sale.status === 'COMPLETED';

  const handleConfirmCancel = async () => {
    setCancelError(null);
    const trimmed = cancelReason.trim();
    if (trimmed.length < 2) {
      setCancelError(t('validation.cancelReasonRequired'));
      return;
    }

    try {
      await cancelMutation.mutateAsync({
        idempotencyKey: cancelIdempotencyKey,
        payload: { reason: trimmed },
      });
      setCancelModalOpen(false);
      setCancelReason('');
    } catch (err) {
      setCancelError(getLocalizedErrorMessage(err, t));
    }
  };

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {t('sales.detailTitle')}
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

      {/* Invoice Header Summary */}
      <Card style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <View style={{ flex: 1 }}>
            <AppText variant="sectionTitle" weight="bold">
              {formatDigits(sale.receiptNumber)}
            </AppText>
            <AppText variant="caption" color={Colors.textSecondary}>
              {formatDhakaDateTime(sale.soldAt, language, digitStyle)}
            </AppText>
          </View>
          <Badge label={statusBadge.label} tone={statusBadge.tone} />
        </View>

        <AppText variant="body" color={Colors.textSecondary}>
          {t('receipt.customer')}:{' '}
          <AppText variant="body" weight="semibold">
            {sale.customerNameSnapshot ?? t('pos.walkInCustomer')}
          </AppText>
        </AppText>
        {sale.actorName ? (
          <AppText variant="caption" color={Colors.textSecondary}>
            {t('receipt.cashier')}: {sale.actorName}
          </AppText>
        ) : null}
        {sale.note ? (
          <AppText variant="caption" color={Colors.textSecondary}>
            {sale.note}
          </AppText>
        ) : null}
      </Card>

      {sale.status === 'CANCELLED' ? (
        <Card style={{ gap: 4, backgroundColor: Colors.dangerSoft, borderColor: '#FECACA' }}>
          <AppText variant="body" weight="bold" color={Colors.danger}>
            {t('sales.cancelledNotice')}
          </AppText>
          {sale.cancelReason ? (
            <AppText variant="caption" color={Colors.danger}>
              {t('sales.cancelReasonLabel')}: {sale.cancelReason}
            </AppText>
          ) : null}
        </Card>
      ) : null}

      {/* Sold Items */}
      <Card style={{ gap: 10 }}>
        <AppText variant="sectionTitle" weight="semibold">
          {t('sales.itemsTitle')}
        </AppText>
        {sale.items.map((item) => {
          const itemName =
            language === 'en' && item.productNameEn ? item.productNameEn : item.productNameBn;
          const unitLabel = language === 'en' ? item.unitNameEn : item.unitNameBn;
          const hasReturned = compareQuantities(item.returnedQtyBase, '0') > 0;
          return (
            <View
              key={item.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderTopWidth: 1,
                borderTopColor: Colors.border,
                paddingTop: 8,
                gap: 8,
              }}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="body" weight="semibold">
                  {itemName}
                </AppText>
                <AppText variant="caption" color={Colors.textSecondary}>
                  {formatDigits(formatQuantityDisplay(item.qtyDisplay, 3))} {unitLabel} ×{' '}
                  {formatMoney(item.unitSellingPricePoisha)}
                </AppText>
                {hasReturned ? (
                  <AppText variant="caption" color={Colors.warning}>
                    {t('sales.returnedQtyTag', {
                      qty: `${formatDigits(formatQuantityDisplay(item.returnedQtyBase, 3))} base`,
                    })}
                  </AppText>
                ) : null}
              </View>
              <AppText variant="body" weight="bold">
                {formatMoney(item.lineSubtotalPoisha)}
              </AppText>
            </View>
          );
        })}
      </Card>

      {/* Financial Totals */}
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="body" color={Colors.textSecondary}>
            {t('sales.subtotal')}
          </AppText>
          <AppText variant="body" weight="semibold">
            {formatMoney(sale.subtotalPoisha)}
          </AppText>
        </View>
        {sale.discountPoisha > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="body" color={Colors.textSecondary}>
              {t('sales.discount')}
            </AppText>
            <AppText variant="body" weight="semibold" color={Colors.danger}>
              -{formatMoney(sale.discountPoisha)}
            </AppText>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="sectionTitle" weight="bold">
            {t('sales.netTotal')}
          </AppText>
          <AppText variant="sectionTitle" weight="bold" color={Colors.primary}>
            {formatMoney(sale.totalPoisha)}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="body" color={Colors.textSecondary}>
            {t('sales.paidAmount')}
          </AppText>
          <AppText variant="body" weight="semibold" color={Colors.success}>
            {formatMoney(sale.paidPoisha)}
          </AppText>
        </View>
        {sale.duePoisha > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="body" weight="bold" color={Colors.danger}>
              {t('sales.dueAmount')}
            </AppText>
            <AppText variant="body" weight="bold" color={Colors.danger}>
              {formatMoney(sale.duePoisha)}
            </AppText>
          </View>
        ) : null}
        {sale.returnedTotalPoisha > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="body" color={Colors.warning}>
              {t('receipt.returned')}
            </AppText>
            <AppText variant="body" weight="bold" color={Colors.warning}>
              {formatMoney(sale.returnedTotalPoisha)}
            </AppText>
          </View>
        ) : null}
      </Card>

      {/* Owner-only Cost & Margin */}
      {isOwner && sale.cogsPoisha !== null ? (
        <Card style={{ gap: 6, backgroundColor: Colors.primarySoft, borderColor: '#99F6E4' }}>
          <AppText variant="caption" weight="bold" color={Colors.primaryPressed}>
            {t('sales.costSummaryTitle')}
          </AppText>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="body" color={Colors.textSecondary}>
              {t('sales.cogsLabel')}
            </AppText>
            <AppText variant="body" weight="semibold">
              {formatMoney(sale.cogsPoisha)}
            </AppText>
          </View>
          {sale.estimatedProfitPoisha !== null ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body" weight="bold">
                {t('sales.estimatedProfitLabel')}
              </AppText>
              <AppText variant="body" weight="bold" color={Colors.primaryPressed}>
                {formatMoney(sale.estimatedProfitPoisha)}
              </AppText>
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* Payments Recorded */}
      {sale.payments.length > 0 ? (
        <Card style={{ gap: 6 }}>
          <AppText variant="sectionTitle" weight="semibold">
            {t('sales.paymentsRecordedTitle')}
          </AppText>
          {sale.payments.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body" color={Colors.textSecondary}>
                {getPaymentMethodLabel(p.method, t)}
                {p.reference ? ` (${p.reference})` : ''}
              </AppText>
              <AppText variant="body" weight="semibold">
                {formatMoney(p.amountPoisha)}
              </AppText>
            </View>
          ))}
        </Card>
      ) : null}

      {/* Returns History */}
      {sale.returns.length > 0 ? (
        <Card style={{ gap: 8 }}>
          <AppText variant="sectionTitle" weight="semibold">
            {t('sales.returnsHistoryTitle')}
          </AppText>
          {sale.returns.map((ret) => (
            <Card key={ret.id} style={{ gap: 4, padding: 10, backgroundColor: Colors.background }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="body" weight="bold">
                  {formatDigits(ret.returnNumber)}
                </AppText>
                <AppText variant="body" weight="bold" color={Colors.warning}>
                  {formatMoney(ret.refundTotalPoisha)}
                </AppText>
              </View>
              <AppText variant="caption" color={Colors.textSecondary}>
                {getRefundMethodLabel(ret.refundMethod, t)} •{' '}
                {formatDhakaDateTime(ret.returnedAt, language, digitStyle)}
              </AppText>
              {ret.reason ? (
                <AppText variant="caption" color={Colors.textSecondary}>
                  {ret.reason}
                </AppText>
              ) : null}
            </Card>
          ))}
        </Card>
      ) : null}

      {/* Action Buttons */}
      <View style={{ gap: 10 }}>
        <Button
          label={t('sales.receiptButton')}
          variant="secondary"
          fullWidth
          onPress={() => router.push({ pathname: '/sales/receipt', params: { saleId: sale.id } })}
        />
        {canReturn ? (
          <Button
            label={t('sales.returnButton')}
            fullWidth
            onPress={() => setReturnModalOpen(true)}
          />
        ) : null}
        {canCancel ? (
          <Button
            label={t('sales.cancelButton')}
            variant="danger"
            fullWidth
            onPress={() => {
              setCancelError(null);
              setCancelIdempotencyKey(Crypto.randomUUID());
              setCancelModalOpen(true);
            }}
          />
        ) : null}
      </View>

      <ReturnItemsModal
        visible={returnModalOpen}
        sale={sale}
        onClose={() => setReturnModalOpen(false)}
      />

      {/* Cancel Sale Modal (Owner Only) */}
      <Modal
        visible={cancelModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelModalOpen(false)}
      >
        {cancelModalOpen ? (
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(15, 23, 42, 0.55)',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <View
              style={{
                backgroundColor: Colors.surface,
                borderRadius: Layout.cardRadius,
                padding: 18,
                gap: 12,
                borderWidth: 1,
                borderColor: Colors.border,
              }}
            >
              <AppText variant="sectionTitle" weight="bold" color={Colors.danger}>
                {t('sales.cancelDialogTitle')}
              </AppText>
              <AppText variant="body" color={Colors.textSecondary}>
                {t('sales.cancelDialogMessage')}
              </AppText>
              {cancelError ? (
                <AppText variant="caption" weight="semibold" color={Colors.danger}>
                  {cancelError}
                </AppText>
              ) : null}
              <Input
                label={t('sales.cancelReasonInputLabel')}
                placeholder={t('sales.cancelReasonInputPlaceholder')}
                value={cancelReason}
                onChangeText={setCancelReason}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button
                  label={t('common.cancel')}
                  variant="outline"
                  disabled={cancelMutation.isPending}
                  onPress={() => setCancelModalOpen(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  label={t('common.confirm')}
                  variant="danger"
                  loading={cancelMutation.isPending}
                  onPress={() => void handleConfirmCancel()}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          </View>
        ) : null}
      </Modal>
    </ScreenContainer>
  );
}
