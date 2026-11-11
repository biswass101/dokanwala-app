import {
  addPoisha,
  calculateLineTotalPoisha,
  calculateProportionalReturnDiscount,
  compareQuantities,
  convertFromBaseQuantity,
  convertToBaseQuantity,
  formatQuantityDisplay,
  subtractQuantities,
  toBanglaDigits,
  type RefundMethod,
  type SaleDto,
  type SaleItemDto,
} from '@dokanwala/shared';
import * as Crypto from 'expo-crypto';
import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { AppText, Button, Card, Input, NumericInput } from '@/components';
import { FilterChip } from '@/features/products/components/FilterChip';
import { useCreateSaleReturnMutation } from '@/features/sales/hooks/useSalesQueries';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { Colors, Layout } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

const REFUND_METHODS: RefundMethod[] = ['CASH', 'BKASH', 'NAGAD', 'OTHER', 'CREDIT_ADJUSTMENT'];

interface ReturnRowDraft {
  qtyRaw: string;
  qtyAscii: string;
}

export interface ReturnItemsModalProps {
  visible: boolean;
  sale: SaleDto;
  onClose: () => void;
}

function ReturnItemsContent({ sale, onClose }: Omit<ReturnItemsModalProps, 'visible'>) {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();

  const returnMutation = useCreateSaleReturnMutation(sale.id);
  const [idempotencyKey] = useState(() => Crypto.randomUUID());

  const returnableItems = useMemo(
    () =>
      sale.items
        .map((item) => {
          const remainingBase = subtractQuantities(item.qtyBase, item.returnedQtyBase);
          const remainingDisplay = convertFromBaseQuantity(
            remainingBase,
            item.conversionFactorToBase,
          );
          return {
            item,
            remainingBase,
            remainingDisplay: formatQuantityDisplay(remainingDisplay, 3),
          };
        })
        .filter((entry) => compareQuantities(entry.remainingBase, '0') > 0),
    [sale.items],
  );

  const [drafts, setDrafts] = useState<Record<string, ReturnRowDraft>>({});
  const [refundMethod, setRefundMethod] = useState<RefundMethod>(
    sale.duePoisha > 0 ? 'CREDIT_ADJUSTMENT' : 'CASH',
  );
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const setItemQty = (saleItemId: string, qtyAscii: string, qtyRaw: string) => {
    setDrafts((prev) => ({
      ...prev,
      [saleItemId]: { qtyAscii, qtyRaw },
    }));
  };

  const preview = useMemo(() => {
    let returnSubtotalPoisha = 0;
    let hasInvalid = false;
    const preparedItems: { saleItemId: string; qtyDisplay: string }[] = [];
    const requestedBaseByItem = new Map<string, string>();

    for (const { item, remainingBase } of returnableItems) {
      const draft = drafts[item.id];
      const ascii = draft?.qtyAscii.trim() ?? '';
      if (!ascii) continue;

      try {
        if (compareQuantities(ascii, '0') <= 0) {
          hasInvalid = true;
          continue;
        }
        const qtyBase = convertToBaseQuantity(ascii, item.conversionFactorToBase);
        if (compareQuantities(qtyBase, remainingBase) > 0) {
          hasInvalid = true;
          continue;
        }
        requestedBaseByItem.set(item.id, qtyBase);
        preparedItems.push({ saleItemId: item.id, qtyDisplay: ascii });

        const rawGross = calculateLineTotalPoisha(ascii, item.unitSellingPricePoisha);
        const prevReturnedValue = sale.returns.reduce(
          (sum, ret) =>
            sum +
            ret.items
              .filter((ri) => ri.saleItemId === item.id)
              .reduce((riSum, ri) => riSum + ri.lineRefundPoisha, 0),
          0,
        );
        const remainingValue = Math.max(0, item.lineSubtotalPoisha - prevReturnedValue);
        const lineRefund =
          compareQuantities(qtyBase, remainingBase) === 0
            ? remainingValue
            : Math.min(rawGross, remainingValue);
        returnSubtotalPoisha = addPoisha(returnSubtotalPoisha, lineRefund);
      } catch {
        hasInvalid = true;
      }
    }

    const isFullRemainingReturn = returnableItems.every(({ item, remainingBase }) => {
      const req = requestedBaseByItem.get(item.id);
      return req !== undefined && compareQuantities(req, remainingBase) === 0;
    });

    const alreadyDiscountAdjusted = sale.returns.reduce(
      (sum, ret) => sum + ret.discountAdjustmentPoisha,
      0,
    );

    const discountAdjustmentPoisha = calculateProportionalReturnDiscount({
      returnSubtotalPoisha,
      saleSubtotalPoisha: sale.subtotalPoisha,
      totalDiscountPoisha: sale.discountPoisha,
      alreadyDiscountAdjustedPoisha: alreadyDiscountAdjusted,
      isFullRemainingReturn,
    });

    const refundTotalPoisha = Math.max(0, returnSubtotalPoisha - discountAdjustmentPoisha);

    return {
      preparedItems,
      hasInvalid,
      returnSubtotalPoisha,
      discountAdjustmentPoisha,
      refundTotalPoisha,
    };
  }, [drafts, returnableItems, sale.discountPoisha, sale.returns, sale.subtotalPoisha]);

  const handleSubmit = async () => {
    setFormError(null);
    if (preview.hasInvalid) {
      setFormError(t('validation.invalidReturnQty'));
      return;
    }
    if (preview.preparedItems.length === 0) {
      setFormError(t('validation.selectReturnItem'));
      return;
    }
    if (refundMethod === 'CREDIT_ADJUSTMENT' && preview.refundTotalPoisha > sale.duePoisha) {
      setFormError(t('errors.BUSINESS_RULE_VIOLATION'));
      return;
    }

    try {
      await returnMutation.mutateAsync({
        idempotencyKey,
        payload: {
          refundMethod,
          items: preview.preparedItems,
          ...(reason.trim().length > 0 ? { reason: reason.trim() } : {}),
        },
      });
      onClose();
    } catch (err) {
      setFormError(getLocalizedErrorMessage(err, t));
    }
  };

  const renderItemName = (item: SaleItemDto) =>
    language === 'en' && item.productNameEn ? item.productNameEn : item.productNameBn;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <View
        style={{
          backgroundColor: Colors.surface,
          borderRadius: Layout.cardRadius,
          padding: 16,
          gap: 12,
          maxHeight: '92%',
          borderWidth: 1,
          borderColor: Colors.border,
        }}
      >
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <AppText variant="sectionTitle" weight="bold" style={{ flex: 1 }}>
            {t('sales.returnModalTitle')}
          </AppText>
          <Button label={t('common.cancel')} variant="outline" onPress={onClose} />
        </View>

        {formError ? (
          <Card style={{ backgroundColor: Colors.dangerSoft, borderColor: '#FECACA', padding: 10 }}>
            <AppText variant="caption" weight="semibold" color={Colors.danger}>
              {formError}
            </AppText>
          </Card>
        ) : null}

        <ScrollView contentContainerStyle={{ gap: 10 }}>
          {returnableItems.map(({ item, remainingDisplay }) => {
            const unitLabel = language === 'en' ? item.unitNameEn : item.unitNameBn;
            const draft = drafts[item.id] ?? { qtyAscii: '', qtyRaw: '' };
            return (
              <Card key={item.id} style={{ gap: 8, padding: 12 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <AppText variant="body" weight="bold">
                      {renderItemName(item)}
                    </AppText>
                    <AppText variant="caption" color={Colors.textSecondary}>
                      {t('sales.returnRemainingLabel', {
                        qty: `${formatDigits(remainingDisplay)} ${unitLabel}`,
                      })}
                    </AppText>
                  </View>
                  <Button
                    label={formatDigits(remainingDisplay)}
                    variant="secondary"
                    onPress={() =>
                      setItemQty(
                        item.id,
                        remainingDisplay,
                        digitStyle === 'bn' ? toBanglaDigits(remainingDisplay) : remainingDisplay,
                      )
                    }
                  />
                </View>

                <NumericInput
                  label={t('sales.returnQtyLabel', { unit: unitLabel })}
                  placeholder={digitStyle === 'bn' ? '০' : '0'}
                  value={draft.qtyRaw}
                  onChangeNormalized={(ascii, raw) => setItemQty(item.id, ascii, raw)}
                />
              </Card>
            );
          })}

          <View style={{ gap: 6 }}>
            <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
              {t('sales.returnMethodLabel')}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {REFUND_METHODS.map((method) => {
                if (method === 'CREDIT_ADJUSTMENT' && sale.duePoisha <= 0) {
                  return null;
                }
                return (
                  <FilterChip
                    key={method}
                    label={t(`sales.refundMethods.${method}`)}
                    selected={refundMethod === method}
                    onPress={() => setRefundMethod(method)}
                  />
                );
              })}
            </View>
          </View>

          <Input
            label={t('sales.returnReasonLabel')}
            placeholder={t('sales.returnReasonPlaceholder')}
            value={reason}
            onChangeText={setReason}
          />

          <Card style={{ gap: 6, backgroundColor: Colors.background }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="caption" color={Colors.textSecondary}>
                {t('sales.returnSubtotalPreview')}
              </AppText>
              <AppText variant="caption" weight="semibold">
                {formatMoney(preview.returnSubtotalPoisha)}
              </AppText>
            </View>
            {preview.discountAdjustmentPoisha > 0 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="caption" color={Colors.textSecondary}>
                  {t('sales.returnDiscountAdjustPreview')}
                </AppText>
                <AppText variant="caption" weight="semibold">
                  -{formatMoney(preview.discountAdjustmentPoisha)}
                </AppText>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body" weight="bold">
                {t('sales.returnTotalPreview')}
              </AppText>
              <AppText variant="body" weight="bold" color={Colors.primary}>
                {formatMoney(preview.refundTotalPoisha)}
              </AppText>
            </View>
          </Card>
        </ScrollView>

        <Button
          label={t('sales.submitReturnButton')}
          fullWidth
          loading={returnMutation.isPending}
          onPress={() => void handleSubmit()}
        />
      </View>
    </View>
  );
}

export function ReturnItemsModal({ visible, sale, onClose }: ReturnItemsModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? <ReturnItemsContent key={sale.id} sale={sale} onClose={onClose} /> : null}
    </Modal>
  );
}
