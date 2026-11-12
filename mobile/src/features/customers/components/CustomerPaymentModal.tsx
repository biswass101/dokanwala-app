import {
  bdtToPoisha,
  poishaToBdtString,
  toBanglaDigits,
  type CustomerDto,
  type PaymentMethod,
} from '@dokanwala/shared';
import * as Crypto from 'expo-crypto';
import React, { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { AppText, Button, Card, Input, NumericInput } from '@/components';
import { useCollectCustomerPaymentMutation } from '@/features/customers/hooks/useCustomersQueries';
import { FilterChip } from '@/features/products/components/FilterChip';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { Colors, Layout } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'BKASH', 'NAGAD', 'OTHER'];

export interface CustomerPaymentModalProps {
  visible: boolean;
  customer: CustomerDto;
  saleId?: string | null;
  maxDuePoisha?: number;
  onClose: () => void;
}

function CustomerPaymentContent({
  customer,
  saleId,
  maxDuePoisha,
  onClose,
}: Omit<CustomerPaymentModalProps, 'visible'>) {
  const { t } = useAppTranslation();
  const { digitStyle, formatMoney } = useFormattedMoney();

  const collectMutation = useCollectCustomerPaymentMutation(customer.id);
  const [idempotencyKey] = useState(() => Crypto.randomUUID());

  const effectiveMaxPoisha = maxDuePoisha ?? customer.duePoisha;

  const [amountAscii, setAmountAscii] = useState('');
  const [amountRaw, setAmountRaw] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleCollectFull = () => {
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
      setFormError(t('validation.customerPaymentExceedsDue'));
      return;
    }

    try {
      await collectMutation.mutateAsync({
        idempotencyKey,
        payload: {
          ...(saleId ? { saleId } : {}),
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
            {t('customers.paymentModalTitle')}
          </AppText>
          <Button
            label={t('common.cancel')}
            variant="outline"
            testID="customer-payment-close-btn"
            disabled={collectMutation.isPending}
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
            {t('customers.paymentDueBanner', { amount: formatMoney(effectiveMaxPoisha) })}
          </AppText>
          {effectiveMaxPoisha > 0 ? (
            <Button
              label={t('customers.collectFullDueButton')}
              variant="secondary"
              testID="customer-collect-full-btn"
              onPress={handleCollectFull}
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
            label={t('customers.paymentAmountLabel')}
            accessibilityLabel={t('customers.paymentAmountLabel')}
            placeholder={digitStyle === 'bn' ? '০' : '0'}
            value={amountRaw}
            onChangeNormalized={(ascii, raw) => {
              setAmountAscii(ascii);
              setAmountRaw(raw);
            }}
          />

          <View style={{ gap: 6 }}>
            <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
              {t('customers.paymentMethodLabel')}
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
            label={t('customers.paymentReferenceLabel')}
            accessibilityLabel={t('customers.paymentReferenceLabel')}
            placeholder={t('customers.paymentReferencePlaceholder')}
            value={reference}
            onChangeText={setReference}
          />
          <Input
            label={t('customers.paymentNoteLabel')}
            accessibilityLabel={t('customers.paymentNoteLabel')}
            placeholder={t('customers.paymentNotePlaceholder')}
            value={note}
            onChangeText={setNote}
          />
        </ScrollView>

        <Button
          label={t('customers.paymentSubmit')}
          fullWidth
          testID="customer-payment-submit-btn"
          loading={collectMutation.isPending}
          onPress={() => void handleSubmit()}
        />
      </View>
    </View>
  );
}

export function CustomerPaymentModal({
  visible,
  customer,
  saleId,
  maxDuePoisha,
  onClose,
}: CustomerPaymentModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? (
        <CustomerPaymentContent
          key={`${customer.id}-${saleId ?? 'all'}-${customer.duePoisha}`}
          customer={customer}
          saleId={saleId}
          maxDuePoisha={maxDuePoisha}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}
