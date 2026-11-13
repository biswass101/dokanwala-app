import {
  bdtToPoisha,
  getDhakaYmd,
  normalizeNumericInput,
  normalizeUnicodeText,
  shiftDhakaYmd,
  type CustomerDto,
  type PaymentMethod,
  type ProductDto,
  type SaleDto,
} from '@dokanwala/shared';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AppText, Badge, Button, Card, Input } from '@/components';
import { FilterChip } from '@/features/products/components/FilterChip';
import { useProductsQuery } from '@/features/products/hooks/useCatalogQueries';
import { getLocalizedProductName } from '@/features/products/utils/catalog-format';
import { useCreateQuickSaleMutation } from '@/features/sales/hooks/useSalesQueries';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';
import { CustomerPickerModal } from './CustomerPickerModal';

export interface QuickSaleFormProps {
  onSuccess?: (sale: SaleDto) => void;
  compact?: boolean;
}

const QUICK_NOTES = [
  'আজকের মোট বিক্রি',
  'কাউন্টার ক্যাশ',
  'বিবিধ বিক্রি',
  'সন্ধ্যার ক্যাশ',
  'খুচরা বিক্রি',
];

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000, 2000, 5000];
const QUICK_QUANTITIES = ['1', '2', '5', '10', '20', '50'];

export function QuickSaleForm({ onSuccess, compact = false }: QuickSaleFormProps) {
  const { t, language } = useAppTranslation();
  const { formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();

  const todayYmd = getDhakaYmd();
  const yesterdayYmd = shiftDhakaYmd(todayYmd, -1);

  // Form states
  const [amountAscii, setAmountAscii] = useState('');
  const [qtyAscii, setQtyAscii] = useState('1');
  const [note, setNote] = useState('আজকের মোট বিক্রি');
  const [saleDate, setSaleDate] = useState<string>(todayYmd);
  const [customDateInput, setCustomDateInput] = useState<string>(todayYmd);
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'BKASH' | 'NAGAD' | 'DUE'>('CASH');

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDto | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

  // Optional product link
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductDto | null>(null);
  const [productSearch, setProductSearch] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<SaleDto | null>(null);

  const createQuickSaleMutation = useCreateQuickSaleMutation();

  const productsQuery = useProductsQuery(
    showProductPicker && productSearch.trim().length > 0 ? { q: productSearch.trim() } : undefined,
  );
  const searchResults = productsQuery.data?.products ?? [];

  // Parse amount in poisha
  const totalAmountPoisha = useMemo(() => {
    const clean = normalizeNumericInput(amountAscii).trim();
    if (!clean || isNaN(Number(clean))) return 0;
    try {
      return bdtToPoisha(clean);
    } catch {
      return 0;
    }
  }, [amountAscii]);

  const handleAddAmount = (addTaka: number) => {
    const currentClean = normalizeNumericInput(amountAscii).trim();
    const current = Number(currentClean) || 0;
    const next = current + addTaka;
    setAmountAscii(String(next));
  };

  const handleResetForm = () => {
    setAmountAscii('');
    setQtyAscii('1');
    setNote('আজকের মোট বিক্রি');
    setSaleDate(todayYmd);
    setShowCustomDate(false);
    setPaymentMode('CASH');
    setSelectedCustomer(null);
    setSelectedProduct(null);
    setFormError(null);
    setCompletedSale(null);
  };

  const handleSubmit = async () => {
    setFormError(null);

    if (totalAmountPoisha <= 0) {
      setFormError(t('pos.amountRequired', { defaultValue: 'অনুগ্রহ করে বিক্রির টাকার পরিমাণ লিখুন' }));
      return;
    }

    const cleanQty = normalizeNumericInput(qtyAscii).trim() || '1';
    if (Number(cleanQty) <= 0) {
      setFormError(t('pos.qtyRequired', { defaultValue: 'পরিমাণ অন্তত ১ হতে হবে' }));
      return;
    }

    if (paymentMode === 'DUE' && !selectedCustomer) {
      setFormError(
        t('pos.customerRequiredForDue', {
          defaultValue: 'বাকি বিক্রির জন্য কাস্টমার নির্বাচন আবশ্যক',
        }),
      );
      setCustomerPickerOpen(true);
      return;
    }

    const soldAtDate = saleDate && saleDate !== todayYmd ? `${saleDate}T12:00:00+06:00` : undefined;

    try {
      const res = await createQuickSaleMutation.mutateAsync({
        payload: {
          totalSellingPricePoisha: totalAmountPoisha,
          quantity: cleanQty,
          note: normalizeUnicodeText(note) || null,
          soldAt: soldAtDate,
          paymentMethod: paymentMode === 'DUE' ? 'CASH' : (paymentMode as PaymentMethod),
          paidPoisha: paymentMode === 'DUE' ? 0 : totalAmountPoisha,
          customerId: selectedCustomer?.id ?? null,
          productId: selectedProduct?.id ?? null,
        },
      });

      setCompletedSale(res.sale);
      if (onSuccess) {
        onSuccess(res.sale);
      }
    } catch (err) {
      setFormError(getLocalizedErrorMessage(err, t));
    }
  };

  if (completedSale) {
    return (
      <Card
        style={{
          padding: 20,
          gap: 16,
          backgroundColor: '#F0FDF4',
          borderColor: '#86EFAC',
          borderWidth: 1.5,
        }}
      >
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Badge label="সফল বিক্রি সম্পন্ন" tone="success" />
          <AppText variant="screenTitle" weight="bold" color={Colors.primary}>
            {formatMoney(completedSale.totalPoisha)}
          </AppText>
          <AppText variant="caption" color={Colors.textSecondary}>
            রসিদ নং: {completedSale.receiptNumber}
          </AppText>
        </View>

        <Card style={{ backgroundColor: Colors.surface, gap: 8, padding: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" color={Colors.textSecondary}>
              বিক্রির বিবরণ / নোট:
            </AppText>
            <AppText variant="caption" weight="bold">
              {completedSale.note || 'সাধারণ বিক্রি'}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" color={Colors.textSecondary}>
              তারিখ:
            </AppText>
            <AppText variant="caption" weight="bold">
              {completedSale.soldAt.slice(0, 10)}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" color={Colors.textSecondary}>
              পেমেন্ট মাধ্যম:
            </AppText>
            <AppText variant="caption" weight="bold">
              {completedSale.duePoisha > 0
                ? `বাকি (${completedSale.customerNameSnapshot ?? 'কাস্টমার'})`
                : completedSale.payments[0]?.method ?? 'নগদ'}
            </AppText>
          </View>
        </Card>

        <View style={{ padding: 10, backgroundColor: '#E0F2FE', borderRadius: 8 }}>
          <AppText variant="caption" color="#0369A1" style={{ textAlign: 'center' }}>
            ✓ এই বিক্রির হিসাব সাথে সাথে ড্যাশবোর্ড, ক্যাশবুক এবং বিক্রির গ্রাফ ও রিপোর্টে যুক্ত হয়েছে।
          </AppText>
        </View>

        <View style={{ gap: 8 }}>
          <Button
            label="আরেকটি সরাসরি বিক্রি যোগ করুন"
            onPress={handleResetForm}
            testID="quick-sale-reset-btn"
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label="রসিদ দেখুন"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => router.push(`/sales/${completedSale.id}`)}
            />
            <Button
              label="ড্যাশবোর্ডে যান"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => router.push('/(tabs)')}
            />
          </View>
        </View>
      </Card>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ gap: 14, paddingBottom: compact ? 20 : 60 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Title Card */}
      <Card style={{ gap: 4, backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="sectionTitle" weight="bold" color={Colors.primary}>
            ⚡ সরাসরি / দৈনিক মোট বিক্রি এন্ট্রি
          </AppText>
          <Badge label="দ্রুত হিসাব" tone="primary" />
        </View>
        <AppText variant="caption" color={Colors.textSecondary}>
          আইটেম স্ক্যান বা খোঁজা ছাড়াই সরাসরি আজকের মোট বা খুচরা বিক্রি হিসাবভুক্ত করুন।
        </AppText>
      </Card>

      {formError ? (
        <Card style={{ backgroundColor: Colors.dangerSoft, borderColor: '#FECACA', padding: 10 }}>
          <AppText variant="caption" weight="semibold" color={Colors.danger}>
            {formError}
          </AppText>
        </Card>
      ) : null}

      {/* Selling Price / Total Amount (Hero Field) */}
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="caption" weight="bold" color={Colors.textSecondary}>
            বিক্রির মোট টাকা (৳) *
          </AppText>
          {totalAmountPoisha > 0 ? (
            <AppText variant="body" weight="bold" color={Colors.primary}>
              {formatMoney(totalAmountPoisha)}
            </AppText>
          ) : null}
        </View>

        <Input
          value={amountAscii}
          onChangeText={setAmountAscii}
          placeholder="যেমন: ১৫০০ বা ৳ ৫০০"
          keyboardType="numeric"
          testID="quick-sale-amount-input"
          style={{ fontSize: 22, fontWeight: 'bold' }}
        />

        {/* Quick Amount Add Pills */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <AppText variant="caption" color={Colors.textSecondary}>
            যোগ করুন:
          </AppText>
          {QUICK_AMOUNTS.map((amt) => (
            <Pressable
              key={amt}
              onPress={() => handleAddAmount(amt)}
              style={{
                backgroundColor: '#F1F5F9',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#CBD5E1',
              }}
            >
              <AppText variant="caption" weight="semibold" color={Colors.textPrimary}>
                +{formatDigits(amt)}৳
              </AppText>
            </Pressable>
          ))}
          {amountAscii ? (
            <Pressable
              onPress={() => setAmountAscii('')}
              style={{
                backgroundColor: Colors.dangerSoft,
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderRadius: 16,
              }}
            >
              <AppText variant="caption" weight="semibold" color={Colors.danger}>
                মুছে ফেলুন
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </Card>

      {/* Quantity Sold */}
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="caption" weight="bold" color={Colors.textSecondary}>
            কত পিস / পরিমাণ বিক্রি হয়েছে? (সংখ্যা)
          </AppText>
          <AppText variant="caption" color={Colors.textSecondary}>
            ডিফল্ট: ১টি
          </AppText>
        </View>

        <Input
          value={qtyAscii}
          onChangeText={setQtyAscii}
          placeholder="১"
          keyboardType="numeric"
          testID="quick-sale-qty-input"
        />

        {/* Quick Quantity Pills */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <AppText variant="caption" color={Colors.textSecondary}>
            দ্রুত বাছাই:
          </AppText>
          {QUICK_QUANTITIES.map((q) => (
            <FilterChip
              key={q}
              label={`${formatDigits(q)} টি`}
              selected={normalizeNumericInput(qtyAscii).trim() === q}
              onPress={() => setQtyAscii(q)}
            />
          ))}
        </View>
      </Card>

      {/* Sale Note / Details */}
      <Card style={{ gap: 8 }}>
        <AppText variant="caption" weight="bold" color={Colors.textSecondary}>
          নোট / বিক্রির বিবরণ
        </AppText>
        <Input
          value={note}
          onChangeText={setNote}
          placeholder="যেমন: আজকের মোট বিক্রি, কাউন্টার ক্যাশ, ইত্যাদি"
          testID="quick-sale-note-input"
        />

        {/* Quick Note Pills */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {QUICK_NOTES.map((qn) => (
            <FilterChip
              key={qn}
              label={qn}
              selected={note === qn}
              onPress={() => setNote(qn)}
            />
          ))}
        </View>
      </Card>

      {/* Sale Date Selector */}
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="caption" weight="bold" color={Colors.textSecondary}>
            বিক্রির তারিখ
          </AppText>
          <Badge
            label={saleDate === todayYmd ? 'আজ' : saleDate === yesterdayYmd ? 'গতকাল' : saleDate}
            tone="primary"
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <FilterChip
            label="আজ"
            selected={saleDate === todayYmd && !showCustomDate}
            onPress={() => {
              setSaleDate(todayYmd);
              setShowCustomDate(false);
            }}
          />
          <FilterChip
            label="গতকাল"
            selected={saleDate === yesterdayYmd && !showCustomDate}
            onPress={() => {
              setSaleDate(yesterdayYmd);
              setShowCustomDate(false);
            }}
          />
          <FilterChip
            label="নির্দিষ্ট তারিখ"
            selected={showCustomDate}
            onPress={() => setShowCustomDate(!showCustomDate)}
          />
        </View>

        {showCustomDate ? (
          <View style={{ gap: 8, marginTop: 4 }}>
            <AppText variant="caption" color={Colors.textSecondary}>
              তারিখ লিখুন (YYYY-MM-DD):
            </AppText>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Input
                  value={customDateInput}
                  onChangeText={setCustomDateInput}
                  placeholder="YYYY-MM-DD"
                />
              </View>
              <Button
                label="প্রয়োগ করুন"
                onPress={() => {
                  if (/^\d{4}-\d{2}-\d{2}$/.test(customDateInput)) {
                    setSaleDate(customDateInput);
                  } else {
                    setFormError('তারিখটি সঠিক নয় (YYYY-MM-DD)');
                  }
                }}
              />
            </View>
          </View>
        ) : null}
      </Card>

      {/* Payment Method */}
      <Card style={{ gap: 10 }}>
        <AppText variant="caption" weight="bold" color={Colors.textSecondary}>
          টাকা প্রাপ্তির মাধ্যম
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <FilterChip
            label="নগদ (Cash)"
            selected={paymentMode === 'CASH'}
            onPress={() => setPaymentMode('CASH')}
          />
          <FilterChip
            label="বিকাশ (bKash)"
            selected={paymentMode === 'BKASH'}
            onPress={() => setPaymentMode('BKASH')}
          />
          <FilterChip
            label="নগদ (Nagad App)"
            selected={paymentMode === 'NAGAD'}
            onPress={() => setPaymentMode('NAGAD')}
          />
          <FilterChip
            label="বাকি (Due / Credit)"
            selected={paymentMode === 'DUE'}
            onPress={() => {
              setPaymentMode('DUE');
              if (!selectedCustomer) {
                setCustomerPickerOpen(true);
              }
            }}
          />
        </View>

        {/* Customer Selector if Credit/Due or Walk-in */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: '#F1F5F9',
          }}
        >
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color={Colors.textSecondary}>
              কাস্টমার:
            </AppText>
            <AppText variant="body" weight="semibold">
              {selectedCustomer
                ? selectedCustomer.nameBn
                : paymentMode === 'DUE'
                  ? 'কাস্টমার নির্বাচন আবশ্যক *'
                  : 'সাধারণ ক্রেতা (Walk-in)'}
            </AppText>
          </View>
          <Button
            label={selectedCustomer ? 'পরিবর্তন' : 'কাস্টমার বাছাই'}
            variant="secondary"
            onPress={() => setCustomerPickerOpen(true)}
          />
          {selectedCustomer ? (
            <Pressable
              onPress={() => setSelectedCustomer(null)}
              style={{ paddingHorizontal: 8, paddingVertical: 6 }}
            >
              <AppText variant="caption" color={Colors.danger}>
                বাতিল
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </Card>

      {/* Optional Product Selection */}
      <Card style={{ gap: 8 }}>
        <Pressable
          onPress={() => setShowProductPicker(!showProductPicker)}
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <AppText variant="caption" weight="bold" color={Colors.textSecondary}>
            নির্দিষ্ট পণ্যের সাথে যুক্ত করতে চান? (ঐচ্ছিক)
          </AppText>
          <AppText variant="caption" color={Colors.primary} weight="bold">
            {showProductPicker ? 'লুকান ▲' : selectedProduct ? 'নির্বাচিত ✓' : 'বাছাই করুন ▼'}
          </AppText>
        </Pressable>

        {selectedProduct ? (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#F8FAFC',
              padding: 10,
              borderRadius: 8,
            }}
          >
            <View>
              <AppText variant="body" weight="bold">
                {getLocalizedProductName(selectedProduct, language)}
              </AppText>
              <AppText variant="caption" color={Colors.textSecondary}>
                স্টক থেকে {qtyAscii} টি বাদ যাবে
              </AppText>
            </View>
            <Button
              label="মুছুন"
              variant="outline"
              onPress={() => setSelectedProduct(null)}
            />
          </View>
        ) : null}

        {showProductPicker && !selectedProduct ? (
          <View style={{ gap: 8, marginTop: 4 }}>
            <Input
              value={productSearch}
              onChangeText={setProductSearch}
              placeholder="পণ্য খুঁজতে নাম লিখুন..."
            />
            {searchResults.length > 0 ? (
              <View style={{ maxHeight: 180 }}>
                {searchResults.slice(0, 5).map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setSelectedProduct(p);
                      setShowProductPicker(false);
                      setProductSearch('');
                    }}
                    style={{
                      paddingVertical: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: '#F1F5F9',
                    }}
                  >
                    <AppText variant="body" weight="semibold">
                      {getLocalizedProductName(p, language)}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>

      {/* Confirmation & Submit */}
      <View style={{ marginTop: 8 }}>
        <Button
          label={
            createQuickSaleMutation.isPending
              ? 'বিক্রি সংরক্ষিত হচ্ছে...'
              : totalAmountPoisha > 0
                ? `${formatMoney(totalAmountPoisha)} বিক্রি নিশ্চিত করুন`
                : 'বিক্রি নিশ্চিত করুন'
          }
          onPress={handleSubmit}
          disabled={totalAmountPoisha <= 0 || createQuickSaleMutation.isPending}
          testID="quick-sale-submit-btn"
        />
      </View>

      {/* Customer Picker Modal */}
      <CustomerPickerModal
        visible={customerPickerOpen}
        selectedCustomerId={selectedCustomer?.id}
        onSelect={(c) => {
          setSelectedCustomer(c);
          setCustomerPickerOpen(false);
        }}
        onClose={() => setCustomerPickerOpen(false)}
      />
    </ScrollView>
  );
}
