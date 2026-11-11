import { compareQuantities, formatDhakaDateTime, formatQuantityDisplay } from '@dokanwala/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingView,
  ScreenContainer,
} from '@/components';
import { OwnerOnlyScreen } from '@/features/purchases/components/OwnerOnlyScreen';
import { PurchaseReturnModal } from '@/features/purchases/components/PurchaseReturnModal';
import { SupplierPaymentModal } from '@/features/purchases/components/SupplierPaymentModal';
import {
  usePurchaseDetailQuery,
  useSupplierLedgerQuery,
} from '@/features/purchases/hooks/usePurchasesQueries';
import {
  getPurchaseRefundMethodLabel,
  getPurchaseStatusBadge,
} from '@/features/purchases/utils/purchase-format';
import { getPaymentMethodLabel } from '@/features/sales/utils/receipt-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

function PurchaseDetailContent({ purchaseId }: { purchaseId: string | undefined }) {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();

  const detailQuery = usePurchaseDetailQuery(purchaseId);
  const purchase = detailQuery.data?.purchase;
  const supplierLedgerQuery = useSupplierLedgerQuery(purchase?.supplierId ?? undefined);

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  if (detailQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingView />
      </ScreenContainer>
    );
  }

  if (detailQuery.isError || !purchase) {
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

  const fromOfflineCache = Boolean(detailQuery.data?.fromOfflineCache);
  const statusBadge = getPurchaseStatusBadge(purchase.status, t);
  const canReturn = purchase.status === 'COMPLETED' || purchase.status === 'PARTIALLY_RETURNED';
  const linkedSupplier = supplierLedgerQuery.data?.supplier;

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {t('purchases.detailTitle')}
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

      {/* Header Summary */}
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
              {formatDigits(purchase.purchaseNumber)}
            </AppText>
            <AppText variant="caption" color={Colors.textSecondary}>
              {formatDhakaDateTime(purchase.purchasedAt, language, digitStyle)}
            </AppText>
          </View>
          <Badge label={statusBadge.label} tone={statusBadge.tone} />
        </View>

        {purchase.supplierId ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (purchase.supplierId) {
                router.push(`/suppliers/${purchase.supplierId}`);
              }
            }}
          >
            <AppText variant="body" color={Colors.textSecondary}>
              {t('purchases.supplierLabel')}:{' '}
              <AppText variant="body" weight="bold" color={Colors.primary}>
                {purchase.supplierNameSnapshot ?? t('purchases.walkInSupplier')}
              </AppText>
            </AppText>
          </Pressable>
        ) : (
          <AppText variant="body" color={Colors.textSecondary}>
            {t('purchases.supplierLabel')}:{' '}
            <AppText variant="body" weight="semibold">
              {t('purchases.walkInSupplier')}
            </AppText>
          </AppText>
        )}

        {purchase.note ? (
          <AppText variant="caption" color={Colors.textSecondary}>
            {purchase.note}
          </AppText>
        ) : null}
      </Card>

      {/* Purchased Items */}
      <Card style={{ gap: 10 }}>
        <AppText variant="sectionTitle" weight="semibold">
          {t('purchases.itemsSectionTitle')}
        </AppText>
        {purchase.items.map((item) => {
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
                  {formatMoney(item.unitCostPoisha)}
                </AppText>
                <AppText variant="caption" color={Colors.textMuted}>
                  {t('purchases.itemBaseQtyInfo', {
                    qty: formatDigits(formatQuantityDisplay(item.qtyBase, 3)),
                    netCost: formatMoney(item.netCostPoisha),
                  })}
                </AppText>
                {hasReturned ? (
                  <AppText variant="caption" color={Colors.warning}>
                    {t('purchases.returnedQtyTag', {
                      qty: `${formatDigits(formatQuantityDisplay(item.returnedQtyBase, 3))} base`,
                    })}
                  </AppText>
                ) : null}
              </View>
              <AppText variant="body" weight="bold">
                {formatMoney(item.lineTotalPoisha)}
              </AppText>
            </View>
          );
        })}
      </Card>

      {/* Settlement Summary */}
      <Card style={{ gap: 6 }}>
        <AppText variant="sectionTitle" weight="semibold">
          {t('purchases.settlementSummaryTitle')}
        </AppText>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="body" color={Colors.textSecondary}>
            {t('purchases.subtotal')}
          </AppText>
          <AppText variant="body" weight="semibold">
            {formatMoney(purchase.subtotalPoisha)}
          </AppText>
        </View>
        {purchase.discountPoisha > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="body" color={Colors.textSecondary}>
              {t('purchases.discount')}
            </AppText>
            <AppText variant="body" weight="semibold" color={Colors.danger}>
              -{formatMoney(purchase.discountPoisha)}
            </AppText>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="sectionTitle" weight="bold">
            {t('purchases.netTotal')}
          </AppText>
          <AppText variant="sectionTitle" weight="bold" color={Colors.primary}>
            {formatMoney(purchase.totalPoisha)}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="body" color={Colors.textSecondary}>
            {t('purchases.paidAmount')}
            {purchase.paymentMethod ? ` (${getPaymentMethodLabel(purchase.paymentMethod, t)})` : ''}
          </AppText>
          <AppText variant="body" weight="semibold" color={Colors.success}>
            {formatMoney(purchase.paidPoisha)}
          </AppText>
        </View>
        {purchase.settledDuePoisha > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="body" color={Colors.textSecondary}>
              {t('purchases.settledDueAmount')}
            </AppText>
            <AppText variant="body" weight="semibold" color={Colors.success}>
              {formatMoney(purchase.settledDuePoisha)}
            </AppText>
          </View>
        ) : null}
        {purchase.duePoisha > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="body" weight="bold" color={Colors.danger}>
              {t('purchases.dueAmount')}
            </AppText>
            <AppText variant="body" weight="bold" color={Colors.danger}>
              {formatMoney(purchase.duePoisha)}
            </AppText>
          </View>
        ) : null}
        {purchase.returnedTotalPoisha > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="body" color={Colors.warning}>
              {t('purchases.returnedTotalAmount')}
            </AppText>
            <AppText variant="body" weight="bold" color={Colors.warning}>
              {formatMoney(purchase.returnedTotalPoisha)}
            </AppText>
          </View>
        ) : null}
        {purchase.cashRefundedPoisha > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" color={Colors.textSecondary}>
              {t('purchases.cashRefundedAmount')}
            </AppText>
            <AppText variant="caption" weight="semibold">
              {formatMoney(purchase.cashRefundedPoisha)}
            </AppText>
          </View>
        ) : null}
      </Card>

      {/* Purchase Returns History */}
      {purchase.returns.length > 0 ? (
        <Card style={{ gap: 8 }}>
          <AppText variant="sectionTitle" weight="semibold">
            {t('purchases.returnsHistoryTitle')}
          </AppText>
          {purchase.returns.map((ret) => (
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
                {getPurchaseRefundMethodLabel(ret.refundMethod, t)} •{' '}
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

      {/* Actions */}
      <View style={{ gap: 10 }}>
        {linkedSupplier && purchase.duePoisha > 0 ? (
          <Button
            label={t('suppliers.payDueButton')}
            variant="secondary"
            fullWidth
            testID="purchase-pay-due-btn"
            onPress={() => setPaymentModalOpen(true)}
          />
        ) : null}

        {canReturn ? (
          <Button
            label={t('purchases.returnButton')}
            fullWidth
            testID="purchase-return-open-btn"
            onPress={() => setReturnModalOpen(true)}
          />
        ) : null}
      </View>

      <PurchaseReturnModal
        visible={returnModalOpen}
        purchase={purchase}
        onClose={() => setReturnModalOpen(false)}
      />

      {linkedSupplier ? (
        <SupplierPaymentModal
          visible={paymentModalOpen}
          supplier={linkedSupplier}
          purchaseId={purchase.id}
          maxPayablePoisha={purchase.duePoisha}
          onClose={() => setPaymentModalOpen(false)}
        />
      ) : null}
    </ScreenContainer>
  );
}

export default function PurchaseDetailScreen() {
  const { t } = useAppTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const purchaseId = typeof params.id === 'string' ? params.id : undefined;
  const user = useAuthStore((s) => s.user);

  if (user?.role !== 'OWNER') {
    return (
      <OwnerOnlyScreen
        title={t('purchases.detailTitle')}
        description={t('purchases.ownerOnlyDesc')}
      />
    );
  }

  return <PurchaseDetailContent purchaseId={purchaseId} />;
}
