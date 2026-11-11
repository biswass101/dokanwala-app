import {
  bdtToPoisha,
  poishaToBdtString,
  toBanglaDigits,
  type PaymentMethod,
  type SupplierDto,
} from '@dokanwala/shared';
import * as Crypto from 'expo-crypto';
import React, { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { AppText, Button, Card, Input, NumericInput } from '@/components';
import { FilterChip } from '@/features/products/components/FilterChip';
import { useCreateSupplierPaymentMutation } from '@/features/purchases/hooks/usePurchasesQueries';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { Colors, Layout } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'BKASH', 'NAGAD', 'OTHER'];

export interface SupplierPaymentModalProps {
  visible: boolean;
  supplier: SupplierDto;
  purchaseId?: string | null;
  maxPayablePoisha?: number;
  onClose: () => void;
}

function SupplierPaymentContent({
  supplier,
  purchaseId,
  maxPayablePoisha,
  onClose,
}: Omit<SupplierPaymentModalProps, 'visible'>) {
  const { t } = useAppTranslation();
  const { digitStyle, formatMoney } = useFormattedMoney();

  const paymentMutation = useCreateSupplierPaymentMutation(supplier.id);
  const [idempotencyKey] = useState(() => Crypto.randomUUID());

  const effectiveMaxPoisha = maxPayablePoisha ?? supplier.payablePoisha;

  const [amountAscii, setAmountAscii] = useState('');
  const [amountRaw, setAmountRaw] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handlePayFull = () => {
    if (effectiveMaxPoisha <= 0) return;
    const bdtStr = poishaToBdtString(effectiveMaxPoisha);
    const trimmed = bdtStr.endsWith('.00') ? bdtStr.slice(0, -3) : bdtStr;
    setAmountAscii(trimmed);
    setAmountRaw(digitStyle === 'bn' ? toBanglaDigits(trimmed) : trimmed);
    setFormError(null);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!amountAscii.trim()) {
      setFormError(t('validation.paymentAmountRequired'));
      return;
    }

    let amountPoisha: number;
    try {
      amountPoisha = bdtToPoisha(amountAscii);
    } catch {
      setFormError(t('validation.paymentAmountRequired'));
      return;
    }

    if (amountPoisha <= 0) {
      setFormError(t('validation.paymentAmountRequired'));
      return;
    }

    if (amountPoisha > effectiveMaxPoisha) {
      setFormError(t('validation.paymentExceedsDue'));
      return;
    }

    try {
      await paymentMutation.mutateAsync({
        idempotencyKey,
        payload: {
          ...(purchaseId ? { purchaseId } : {}),
          method,
          amountPoisha,
          ...(reference.trim().length > 0 ? { reference: reference.trim() } : {}),
          ...(note.trim().length > 0 ? { note: note.trim() } : {}),
        },
      });
      onClose();
    } catch (err) {
      setFormError(getLocalizedErrorMessage(err, t));
    }
  };

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
          maxHeight: '90%',
          borderWidth: 1,
          borderColor: Colors.border,
        }}
      >
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <AppText variant="sectionTitle" weight="bold" style={{ flex: 1 }}>
            {t('suppliers.paymentModalTitle')}
          </AppText>
          <Button
            label={t('common.cancel')}
            variant="outline"
            testID="supplier-payment-close-btn"
            disabled={paymentMutation.isPending}
            onPress={onClose}
          />
        </View>

        <Card
          style={{
            backgroundColor: Colors.warningSoft,
            borderColor: '#FDE68A',
            padding: 10,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AppText variant="body" weight="bold" color={Colors.warning} style={{ flex: 1 }}>
            {t('suppliers.paymentDueBanner', { amount: formatMoney(effectiveMaxPoisha) })}
          </AppText>
          {effectiveMaxPoisha > 0 ? (
            <Button
              label={t('suppliers.payFullDueButton')}
              variant="secondary"
              onPress={handlePayFull}
            />
          ) : null}
        </Card>

        {formError ? (
          <Card style={{ backgroundColor: Colors.dangerSoft, borderColor: '#FECACA', padding: 10 }}>
            <AppText variant="caption" weight="semibold" color={Colors.danger}>
              {formError}
            </AppText>
          </Card>
        ) : null}

        <ScrollView contentContainerStyle={{ gap: 10 }}>
          <NumericInput
            label={t('suppliers.paymentAmountLabel')}
            accessibilityLabel={t('suppliers.paymentAmountLabel')}
            placeholder={digitStyle === 'bn' ? '০' : '0'}
            value={amountRaw}
            onChangeNormalized={(ascii, raw) => {
              setAmountAscii(ascii);
              setAmountRaw(raw);
            }}
          />

          <View style={{ gap: 6 }}>
            <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
              {t('suppliers.paymentMethodLabel')}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PAYMENT_METHODS.map((m) => (
                <FilterChip
                  key={m}
                  label={t(`sales.paymentMethods.${m}`)}
                  selected={method === m}
                  onPress={() => setMethod(m)}
                />
              ))}
            </View>
          </View>

          <Input
            label={t('suppliers.paymentReferenceLabel')}
            accessibilityLabel={t('suppliers.paymentReferenceLabel')}
            placeholder={t('suppliers.paymentReferencePlaceholder')}
            value={reference}
            onChangeText={setReference}
          />
          <Input
            label={t('suppliers.paymentNoteLabel')}
            accessibilityLabel={t('suppliers.paymentNoteLabel')}
            placeholder={t('suppliers.paymentNotePlaceholder')}
            value={note}
            onChangeText={setNote}
          />
        </ScrollView>

        <Button
          label={t('suppliers.paymentSubmit')}
          fullWidth
          testID="supplier-payment-submit-btn"
          loading={paymentMutation.isPending}
          onPress={() => void handleSubmit()}
        />
      </View>
    </View>
  );
}

export function SupplierPaymentModal({
  visible,
  supplier,
  purchaseId,
  maxPayablePoisha,
  onClose,
}: SupplierPaymentModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? (
        <SupplierPaymentContent
          key={`${supplier.id}-${purchaseId ?? 'all'}-${supplier.payablePoisha}`}
          supplier={supplier}
          purchaseId={purchaseId}
          maxPayablePoisha={maxPayablePoisha}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}
