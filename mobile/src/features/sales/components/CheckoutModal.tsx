import {
  addPoisha,
  bdtToPoisha,
  compareQuantities,
  doesDiscountExceedPercentCap,
  poishaToBdtString,
  toBanglaDigits,
  type DigitStyle,
  type PaymentMethod,
} from '@dokanwala/shared';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { AppText, Button, Card, Input, NumericInput } from '@/components';
import { FilterChip } from '@/features/products/components/FilterChip';
import { useCreateSaleMutation } from '@/features/sales/hooks/useSalesQueries';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { computeCartSummary, useCartStore } from '@/store/cart.store';
import { Colors, Layout } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';
import { CustomerPickerModal } from './CustomerPickerModal';

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'BKASH', 'NAGAD', 'OTHER'];

interface PaymentDraft {
  rowKey: string;
  method: PaymentMethod;
  amountRaw: string;
  amountAscii: string;
  reference: string;
}

function poishaToLocalizedInput(
  poisha: number,
  digitStyle: DigitStyle,
): {
  ascii: string;
  raw: string;
} {
  if (poisha <= 0) return { ascii: '', raw: '' };
  const ascii = poishaToBdtString(poisha, 2).replace(/\.00$/, '');
  return {
    ascii,
    raw: digitStyle === 'bn' ? toBanglaDigits(ascii) : ascii,
  };
}

export interface CheckoutModalProps {
  visible: boolean;
  onClose: () => void;
  onCompleted: (saleId: string) => void;
}

function CheckoutModalContent({ onClose, onCompleted }: Omit<CheckoutModalProps, 'visible'>) {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();

  const user = useAuthStore((s) => s.user);
  const shop = useAuthStore((s) => s.shop);
  const isEmployee = user?.role === 'EMPLOYEE';
  const allowNegativeStock = Boolean(shop?.allowNegativeStock);
  const employeeCanGiveCredit = shop?.employeeCanGiveCredit ?? true;
  const employeeMaxDiscountPercent = shop?.employeeMaxDiscountPercent ?? 10;

  const items = useCartStore((s) => s.items);
  const discountType = useCartStore((s) => s.discountType);
  const discountRaw = useCartStore((s) => s.discountRaw);
  const discountAscii = useCartStore((s) => s.discountAscii);
  const selectedCustomer = useCartStore((s) => s.selectedCustomer);
  const note = useCartStore((s) => s.note);
  const setDiscountType = useCartStore((s) => s.setDiscountType);
  const setDiscountInput = useCartStore((s) => s.setDiscountInput);
  const setSelectedCustomer = useCartStore((s) => s.setSelectedCustomer);
  const setNote = useCartStore((s) => s.setNote);
  const ensureCheckoutIdempotencyKey = useCartStore((s) => s.ensureCheckoutIdempotencyKey);
  const clearCart = useCartStore((s) => s.clearCart);

  const createSaleMutation = useCreateSaleMutation();

  const summary = useMemo(
    () => computeCartSummary(items, discountType, discountAscii),
    [items, discountType, discountAscii],
  );

  const initialPay = poishaToLocalizedInput(summary.totalPoisha, digitStyle);
  const [payments, setPayments] = useState<PaymentDraft[]>(() => [
    {
      rowKey: 'pay-1',
      method: 'CASH',
      amountAscii: initialPay.ascii,
      amountRaw: initialPay.raw,
      reference: '',
    },
  ]);
  const [tenderedRaw, setTenderedRaw] = useState('');
  const [tenderedAscii, setTenderedAscii] = useState('');
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const paymentComputation = useMemo(() => {
    let paidPoisha = 0;
    let cashPaidPoisha = 0;
    let hasInvalidAmount = false;
    const preparedPayments: {
      method: PaymentMethod;
      amountPoisha: number;
      reference?: string | null;
    }[] = [];

    for (const row of payments) {
      const clean = row.amountAscii.trim();
      if (!clean) continue;
      try {
        const amountPoisha = bdtToPoisha(clean);
        if (amountPoisha < 0) {
          hasInvalidAmount = true;
          continue;
        }
        if (amountPoisha === 0) continue;
        paidPoisha = addPoisha(paidPoisha, amountPoisha);
        if (row.method === 'CASH') {
          cashPaidPoisha = addPoisha(cashPaidPoisha, amountPoisha);
        }
        preparedPayments.push({
          method: row.method,
          amountPoisha,
          ...(row.reference.trim().length > 0 ? { reference: row.reference.trim() } : {}),
        });
      } catch {
        hasInvalidAmount = true;
      }
    }

    let tenderedPoisha: number | null = null;
    let tenderedInvalid = false;
    if (tenderedAscii.trim().length > 0) {
      try {
        tenderedPoisha = bdtToPoisha(tenderedAscii);
        if (tenderedPoisha < 0) tenderedInvalid = true;
      } catch {
        tenderedInvalid = true;
      }
    }

    const changePoisha =
      tenderedPoisha !== null && tenderedPoisha >= cashPaidPoisha
        ? tenderedPoisha - cashPaidPoisha
        : 0;

    return {
      paidPoisha,
      cashPaidPoisha,
      duePoisha: Math.max(0, summary.totalPoisha - paidPoisha),
      overpaid: paidPoisha > summary.totalPoisha,
      tenderedPoisha,
      tenderedInvalid,
      tenderedTooLow: tenderedPoisha !== null && tenderedPoisha < cashPaidPoisha,
      changePoisha,
      hasInvalidAmount,
      preparedPayments,
    };
  }, [payments, summary.totalPoisha, tenderedAscii]);

  const setSinglePaymentMethod = (method: PaymentMethod) => {
    const val = poishaToLocalizedInput(summary.totalPoisha, digitStyle);
    setPayments([
      {
        rowKey: 'pay-single',
        method,
        amountAscii: val.ascii,
        amountRaw: val.raw,
        reference: '',
      },
    ]);
    setTenderedRaw('');
    setTenderedAscii('');
    setFormError(null);
  };

  const setFullDue = () => {
    setPayments([]);
    setTenderedRaw('');
    setTenderedAscii('');
    setFormError(null);
  };

  const addPaymentRow = () => {
    const remaining = Math.max(0, summary.totalPoisha - paymentComputation.paidPoisha);
    const remFormatted = poishaToLocalizedInput(remaining, digitStyle);
    const nextMethod: PaymentMethod = payments.some((p) => p.method === 'CASH') ? 'BKASH' : 'CASH';
    setPayments((prev) => [
      ...prev,
      {
        rowKey: `pay-${Date.now()}-${prev.length + 1}`,
        method: nextMethod,
        amountAscii: remFormatted.ascii,
        amountRaw: remFormatted.raw,
        reference: '',
      },
    ]);
  };

  const handleSubmit = async () => {
    setFormError(null);

    if (!summary.hasValidQuantities) {
      setFormError(t('errors.VALIDATION_ERROR'));
      return;
    }

    if (!allowNegativeStock) {
      for (const line of items) {
        const reqBase = summary.requestedBaseByProduct[line.productId] ?? '0';
        if (compareQuantities(reqBase, line.product.inventory.qtyBase) > 0) {
          setFormError(t('errors.INSUFFICIENT_STOCK'));
          return;
        }
      }
    }

    if (summary.hasDiscountError) {
      setFormError(t('validation.invalidDiscount'));
      return;
    }

    if (
      isEmployee &&
      doesDiscountExceedPercentCap(
        summary.subtotalPoisha,
        summary.discountPoisha,
        employeeMaxDiscountPercent,
      )
    ) {
      setFormError(
        t('validation.employeeDiscountExceeded', {
          max: formatDigits(employeeMaxDiscountPercent),
        }),
      );
      return;
    }

    if (paymentComputation.hasInvalidAmount || paymentComputation.overpaid) {
      setFormError(t('validation.paymentExceedsTotal'));
      return;
    }

    if (paymentComputation.tenderedInvalid || paymentComputation.tenderedTooLow) {
      setFormError(t('validation.tenderedTooLow'));
      return;
    }

    if (paymentComputation.duePoisha > 0) {
      if (isEmployee && !employeeCanGiveCredit) {
        setFormError(t('sales.employeeCreditBlocked'));
        return;
      }
      if (!selectedCustomer) {
        setFormError(t('validation.creditRequiresCustomer'));
        return;
      }
    }

    const discountValuePayload =
      discountAscii.trim().length === 0
        ? '0.00'
        : discountType === 'FIXED_POISHA'
          ? String(bdtToPoisha(discountAscii))
          : discountAscii;

    try {
      const idempotencyKey = ensureCheckoutIdempotencyKey();
      const res = await createSaleMutation.mutateAsync({
        idempotencyKey,
        payload: {
          customerId: selectedCustomer?.id ?? null,
          items: items.map((line) => ({
            productId: line.productId,
            unitId: line.unitId,
            qtyDisplay: line.qtyAscii,
          })),
          discountType,
          discountValue: discountValuePayload,
          payments: paymentComputation.preparedPayments,
          ...(paymentComputation.cashPaidPoisha > 0 && paymentComputation.tenderedPoisha !== null
            ? { tenderedPoisha: paymentComputation.tenderedPoisha }
            : {}),
          ...(note.trim().length > 0 ? { note: note.trim() } : {}),
        },
      });
      clearCart();
      onClose();
      onCompleted(res.sale.id);
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
          maxHeight: '94%',
          borderWidth: 1,
          borderColor: Colors.border,
        }}
      >
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <AppText variant="sectionTitle" weight="bold" style={{ flex: 1 }}>
            {t('pos.checkoutModalTitle')}
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

        <ScrollView contentContainerStyle={{ gap: 12 }}>
          {/* Totals & Discount Card */}
          <Card style={{ gap: 10, backgroundColor: Colors.background }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body" color={Colors.textSecondary}>
                {t('sales.subtotal')}
              </AppText>
              <AppText variant="body" weight="semibold">
                {formatMoney(summary.subtotalPoisha)}
              </AppText>
            </View>

            <View style={{ gap: 6 }}>
              <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
                {t('pos.discountTitle')}
              </AppText>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <FilterChip
                  label={t('pos.discountFixed')}
                  selected={discountType === 'FIXED_POISHA'}
                  onPress={() => setDiscountType('FIXED_POISHA')}
                />
                <FilterChip
                  label={t('pos.discountPercent')}
                  selected={discountType === 'PERCENT'}
                  onPress={() => setDiscountType('PERCENT')}
                />
              </View>
              <NumericInput
                placeholder={
                  discountType === 'FIXED_POISHA'
                    ? t('pos.discountPlaceholderFixed')
                    : t('pos.discountPlaceholderPercent')
                }
                value={discountRaw}
                accessibilityLabel={t('pos.discountTitle')}
                onChangeNormalized={(ascii, raw) => setDiscountInput(ascii, raw)}
              />
              {isEmployee ? (
                <AppText variant="caption" color={Colors.textMuted}>
                  {t('sales.employeeDiscountLimitHint', {
                    max: formatDigits(employeeMaxDiscountPercent),
                  })}
                </AppText>
              ) : null}
            </View>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                borderTopWidth: 1,
                borderTopColor: Colors.border,
                paddingTop: 8,
              }}
            >
              <AppText variant="sectionTitle" weight="bold">
                {t('sales.netTotal')}
              </AppText>
              <AppText variant="sectionTitle" weight="bold" color={Colors.primary}>
                {formatMoney(summary.totalPoisha)}
              </AppText>
            </View>
          </Card>

          {/* Customer Selector */}
          <Card style={{ gap: 8 }}>
            <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
              {t('pos.customerLabel')}
            </AppText>
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
                  {selectedCustomer
                    ? language === 'en' && selectedCustomer.nameEn
                      ? selectedCustomer.nameEn
                      : selectedCustomer.nameBn
                    : t('pos.walkInCustomer')}
                </AppText>
                {selectedCustomer && selectedCustomer.duePoisha > 0 ? (
                  <AppText variant="caption" color={Colors.warning}>
                    {t('customers.dueLabel', {
                      amount: formatMoney(selectedCustomer.duePoisha),
                    })}
                  </AppText>
                ) : null}
              </View>
              <Button
                label={selectedCustomer ? t('pos.changeCustomer') : t('pos.selectCustomer')}
                variant="secondary"
                testID="checkout-select-customer-btn"
                onPress={() => setCustomerModalOpen(true)}
              />
              {selectedCustomer ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSelectedCustomer(null)}
                  style={{ paddingHorizontal: 8, paddingVertical: 6 }}
                >
                  <AppText variant="caption" weight="semibold" color={Colors.danger}>
                    {t('pos.clearCustomer')}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          </Card>

          {/* Payments */}
          <Card style={{ gap: 10 }}>
            <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
              {t('sales.paymentsTitle')}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <FilterChip
                label={t('sales.payFullCash')}
                selected={
                  payments.length === 1 &&
                  payments[0]?.method === 'CASH' &&
                  paymentComputation.duePoisha === 0
                }
                onPress={() => setSinglePaymentMethod('CASH')}
              />
              <FilterChip
                label={t('sales.payFullBkash')}
                selected={
                  payments.length === 1 &&
                  payments[0]?.method === 'BKASH' &&
                  paymentComputation.duePoisha === 0
                }
                onPress={() => setSinglePaymentMethod('BKASH')}
              />
              <FilterChip
                label={t('sales.payFullNagad')}
                selected={
                  payments.length === 1 &&
                  payments[0]?.method === 'NAGAD' &&
                  paymentComputation.duePoisha === 0
                }
                onPress={() => setSinglePaymentMethod('NAGAD')}
              />
              {!isEmployee || employeeCanGiveCredit ? (
                <FilterChip
                  label={t('sales.markFullDue')}
                  selected={payments.length === 0}
                  tone="warning"
                  onPress={setFullDue}
                />
              ) : null}
            </View>

            {payments.map((row, idx) => (
              <Card
                key={row.rowKey}
                style={{ gap: 8, padding: 10, backgroundColor: Colors.background }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 }}>
                    {PAYMENT_METHODS.map((m) => (
                      <FilterChip
                        key={m}
                        label={t(`sales.paymentMethods.${m}`)}
                        selected={row.method === m}
                        onPress={() =>
                          setPayments((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, method: m } : item)),
                          )
                        }
                      />
                    ))}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setPayments((prev) => prev.filter((_, i) => i !== idx))}
                    style={{ padding: 6 }}
                  >
                    <AppText variant="caption" color={Colors.danger}>
                      {t('sales.removePaymentRow')}
                    </AppText>
                  </Pressable>
                </View>

                <NumericInput
                  label={t('sales.paymentAmountLabel')}
                  placeholder={digitStyle === 'bn' ? '০' : '0'}
                  value={row.amountRaw}
                  accessibilityLabel={`${t('sales.paymentAmountLabel')} ${idx + 1}`}
                  onChangeNormalized={(ascii, raw) =>
                    setPayments((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, amountAscii: ascii, amountRaw: raw } : item,
                      ),
                    )
                  }
                />

                {row.method !== 'CASH' ? (
                  <Input
                    label={t('sales.paymentReferenceLabel')}
                    placeholder={t('sales.paymentReferencePlaceholder')}
                    value={row.reference}
                    onChangeText={(txt) =>
                      setPayments((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, reference: txt } : item)),
                      )
                    }
                  />
                ) : null}
              </Card>
            ))}

            <Button label={t('sales.addPaymentRow')} variant="outline" onPress={addPaymentRow} />

            {paymentComputation.cashPaidPoisha > 0 ? (
              <View style={{ gap: 6 }}>
                <NumericInput
                  label={t('sales.tenderedCash')}
                  placeholder={t('sales.tenderedPlaceholder')}
                  value={tenderedRaw}
                  onChangeNormalized={(ascii, raw) => {
                    setTenderedAscii(ascii);
                    setTenderedRaw(raw);
                  }}
                />
                {paymentComputation.tenderedPoisha !== null &&
                !paymentComputation.tenderedTooLow ? (
                  <AppText variant="body" weight="bold" color={Colors.primaryPressed}>
                    {t('sales.changeReturn')}: {formatMoney(paymentComputation.changePoisha)}
                  </AppText>
                ) : null}
              </View>
            ) : null}
          </Card>

          <Input
            label={t('pos.noteLabel')}
            placeholder={t('pos.notePlaceholder')}
            value={note}
            onChangeText={setNote}
          />

          {/* Summary Paid vs Due */}
          <Card
            style={{
              gap: 6,
              backgroundColor:
                paymentComputation.duePoisha > 0 ? Colors.warningSoft : Colors.successSoft,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body" weight="semibold">
                {t('sales.paidAmount')}
              </AppText>
              <AppText variant="body" weight="bold" color={Colors.success}>
                {formatMoney(paymentComputation.paidPoisha)}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body" weight="semibold">
                {t('sales.dueAmount')}
              </AppText>
              <AppText
                variant="body"
                weight="bold"
                color={paymentComputation.duePoisha > 0 ? Colors.danger : Colors.textPrimary}
              >
                {formatMoney(paymentComputation.duePoisha)}
              </AppText>
            </View>
          </Card>
        </ScrollView>

        <Button
          label={t('pos.completeSaleButton')}
          fullWidth
          loading={createSaleMutation.isPending}
          onPress={() => void handleSubmit()}
        />

        <CustomerPickerModal
          visible={customerModalOpen}
          selectedCustomerId={selectedCustomer?.id}
          onSelect={setSelectedCustomer}
          onClose={() => setCustomerModalOpen(false)}
        />
      </View>
    </View>
  );
}

export function CheckoutModal({ visible, onClose, onCompleted }: CheckoutModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? <CheckoutModalContent onClose={onClose} onCompleted={onCompleted} /> : null}
    </Modal>
  );
}
