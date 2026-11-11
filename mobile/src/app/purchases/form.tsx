import {
  addPoisha,
  bdtToPoisha,
  calculateBaseUnitPurchaseCostPoisha,
  calculateExpectedUnitPurchaseCostPoisha,
  compareQuantities,
  formatQuantityDisplay,
  poishaToBdtString,
  previewPurchaseItemImpact,
  toBanglaDigits,
  type DigitStyle,
  type PaymentMethod,
  type ProductDto,
  type SupplierDto,
} from '@dokanwala/shared';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  ErrorState,
  Input,
  LoadingView,
  NumericInput,
  ScreenContainer,
} from '@/components';
import { FilterChip } from '@/features/products/components/FilterChip';
import { useProductsQuery } from '@/features/products/hooks/useCatalogQueries';
import {
  formatProductStockDisplay,
  getLocalizedProductName,
  getLocalizedUnitName,
} from '@/features/products/utils/catalog-format';
import { OwnerOnlyScreen } from '@/features/purchases/components/OwnerOnlyScreen';
import { SupplierPickerModal } from '@/features/purchases/components/SupplierPickerModal';
import {
  useCreatePurchaseMutation,
  useSuppliersQuery,
} from '@/features/purchases/hooks/usePurchasesQueries';
import { getLocalizedSupplierName } from '@/features/purchases/utils/purchase-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'BKASH', 'NAGAD', 'OTHER'];

type PayMode = 'FULL' | 'DUE' | 'CUSTOM';

interface PurchaseLineDraft {
  lineKey: string;
  product: ProductDto;
  unitId: string;
  qtyAscii: string;
  qtyRaw: string;
  costAscii: string;
  costRaw: string;
}

function poishaToInputStrings(
  poisha: number,
  digitStyle: DigitStyle,
): { ascii: string; raw: string } {
  if (poisha <= 0) return { ascii: '', raw: '' };
  const rawBdt = poishaToBdtString(poisha, 2);
  const ascii = rawBdt.endsWith('.00') ? rawBdt.slice(0, -3) : rawBdt;
  return {
    ascii,
    raw: digitStyle === 'bn' ? toBanglaDigits(ascii) : ascii,
  };
}

function resolveDefaultPurchaseUnit(product: ProductDto) {
  return (
    product.units.find((u) => u.unitId === product.defaultPurchaseUnitId) ??
    product.units.find((u) => u.isBaseUnit) ??
    product.units[0]
  );
}

function PurchaseFormContent({ paramSupplierId }: { paramSupplierId: string | undefined }) {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();

  const [productSearch, setProductSearch] = useState('');
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [supplierOverride, setSupplierOverride] = useState<SupplierDto | null | undefined>(
    undefined,
  );
  const [lines, setLines] = useState<PurchaseLineDraft[]>([]);
  const [lineSeq, setLineSeq] = useState(1);

  const [discountAscii, setDiscountAscii] = useState('');
  const [discountRaw, setDiscountRaw] = useState('');

  const [payMode, setPayMode] = useState<PayMode>('FULL');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [paidAscii, setPaidAscii] = useState('');
  const [paidRaw, setPaidRaw] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<{ hash: string; key: string } | null>(null);

  const suppliersQuery = useSuppliersQuery();
  const productsQuery = useProductsQuery(
    productSearch.trim().length > 0 ? { q: productSearch.trim() } : undefined,
  );
  const createPurchaseMutation = useCreatePurchaseMutation();

  const suppliers = useMemo(
    () => suppliersQuery.data?.suppliers ?? [],
    [suppliersQuery.data?.suppliers],
  );
  const paramSupplier = useMemo(
    () => (paramSupplierId ? (suppliers.find((s) => s.id === paramSupplierId) ?? null) : null),
    [paramSupplierId, suppliers],
  );
  const selectedSupplier = supplierOverride === undefined ? paramSupplier : supplierOverride;

  const products = useMemo(
    () => productsQuery.data?.products ?? [],
    [productsQuery.data?.products],
  );
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const hydratedLines = useMemo(
    () =>
      lines.map((line) => {
        const fresh = productById.get(line.product.id);
        return fresh ? { ...line, product: fresh } : line;
      }),
    [lines, productById],
  );

  const lineComputations = useMemo(() => {
    let subtotalPoisha = 0;
    const computed: {
      line: PurchaseLineDraft;
      unitRule: ProductDto['units'][number] | null;
      impact: ReturnType<typeof previewPurchaseItemImpact> | null;
    }[] = [];

    for (const line of hydratedLines) {
      const unitRule =
        line.product.units.find((u) => u.unitId === line.unitId) ?? line.product.units[0] ?? null;
      if (!unitRule) {
        computed.push({ line, unitRule: null, impact: null });
        continue;
      }

      const qtyTrimmed = line.qtyAscii.trim();
      const costTrimmed = line.costAscii.trim();

      if (!qtyTrimmed || !costTrimmed) {
        computed.push({ line, unitRule, impact: null });
        continue;
      }

      try {
        if (compareQuantities(qtyTrimmed, '0') <= 0) {
          computed.push({ line, unitRule, impact: null });
          continue;
        }
        const unitCostPoisha = bdtToPoisha(costTrimmed);
        if (unitCostPoisha < 0) {
          computed.push({ line, unitRule, impact: null });
          continue;
        }

        const impact = previewPurchaseItemImpact({
          currentQtyBase: line.product.inventory.qtyBase,
          currentAvgCostBdt: line.product.inventory.avgCostPerBaseBdt ?? '0.000000',
          qtyDisplay: qtyTrimmed,
          conversionFactorToBase: unitRule.conversionFactorToBase,
          unitCostPoisha,
        });
        subtotalPoisha = addPoisha(subtotalPoisha, impact.lineTotalPoisha);
        computed.push({ line, unitRule, impact });
      } catch {
        computed.push({ line, unitRule, impact: null });
      }
    }

    return { computed, subtotalPoisha };
  }, [hydratedLines]);

  const discountPoisha = useMemo(() => {
    if (!discountAscii.trim()) return 0;
    try {
      const parsed = bdtToPoisha(discountAscii);
      return parsed >= 0 ? parsed : 0;
    } catch {
      return -1;
    }
  }, [discountAscii]);

  const validDiscountPoisha = Math.max(0, discountPoisha);
  const totalPoisha = Math.max(0, lineComputations.subtotalPoisha - validDiscountPoisha);

  const fullPaidInput = useMemo(
    () => poishaToInputStrings(totalPoisha, digitStyle),
    [digitStyle, totalPoisha],
  );

  const displayedPaidRaw =
    payMode === 'FULL' ? fullPaidInput.raw : payMode === 'DUE' ? '' : paidRaw;

  const effectivePaidPoisha = useMemo(() => {
    if (payMode === 'FULL') return totalPoisha;
    if (payMode === 'DUE') return 0;
    if (!paidAscii.trim()) return 0;
    try {
      return bdtToPoisha(paidAscii);
    } catch {
      return -1;
    }
  }, [paidAscii, payMode, totalPoisha]);

  const duePoisha =
    effectivePaidPoisha >= 0 ? Math.max(0, totalPoisha - effectivePaidPoisha) : totalPoisha;

  const handleAddProduct = (product: ProductDto) => {
    const unit = resolveDefaultPurchaseUnit(product);
    if (!unit) return;
    const suggestedCostPoisha = calculateExpectedUnitPurchaseCostPoisha({
      avgCostPerBaseBdt: product.inventory.avgCostPerBaseBdt,
      lastPurchasePricePoisha: product.lastPurchasePricePoisha,
      conversionFactorToBase: unit.conversionFactorToBase,
    });
    const costInput = poishaToInputStrings(suggestedCostPoisha, digitStyle);

    setLines((prev) => [
      ...prev,
      {
        lineKey: `line-${lineSeq}`,
        product,
        unitId: unit.unitId,
        qtyAscii: '1',
        qtyRaw: digitStyle === 'bn' ? '১' : '1',
        costAscii: costInput.ascii,
        costRaw: costInput.raw,
      },
    ]);
    setLineSeq((s) => s + 1);
    setFormError(null);
  };

  const handleChangeLineUnit = (lineKey: string, nextUnitId: string) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.lineKey !== lineKey || line.unitId === nextUnitId) return line;
        const oldUnit = line.product.units.find((u) => u.unitId === line.unitId);
        const newUnit = line.product.units.find((u) => u.unitId === nextUnitId);
        if (!newUnit) return line;

        let nextCostPoisha = 0;
        const trimmedCost = line.costAscii.trim();
        if (trimmedCost.length > 0 && oldUnit) {
          try {
            const currentPoisha = bdtToPoisha(trimmedCost);
            if (currentPoisha > 0) {
              const baseCostPoisha = calculateBaseUnitPurchaseCostPoisha(
                currentPoisha,
                oldUnit.conversionFactorToBase,
              );
              nextCostPoisha = calculateExpectedUnitPurchaseCostPoisha({
                avgCostPerBaseBdt: null,
                lastPurchasePricePoisha: baseCostPoisha,
                conversionFactorToBase: newUnit.conversionFactorToBase,
              });
            }
          } catch {
            nextCostPoisha = 0;
          }
        }

        if (nextCostPoisha === 0) {
          nextCostPoisha = calculateExpectedUnitPurchaseCostPoisha({
            avgCostPerBaseBdt: line.product.inventory.avgCostPerBaseBdt,
            lastPurchasePricePoisha: line.product.lastPurchasePricePoisha,
            conversionFactorToBase: newUnit.conversionFactorToBase,
          });
        }

        const nextCostInput = poishaToInputStrings(nextCostPoisha, digitStyle);
        return {
          ...line,
          unitId: nextUnitId,
          costAscii: nextCostInput.ascii,
          costRaw: nextCostInput.raw,
        };
      }),
    );
  };

  const handleUpdateLineQty = (lineKey: string, qtyAscii: string, qtyRaw: string) => {
    setLines((prev) => prev.map((l) => (l.lineKey === lineKey ? { ...l, qtyAscii, qtyRaw } : l)));
  };

  const handleUpdateLineCost = (lineKey: string, costAscii: string, costRaw: string) => {
    setLines((prev) => prev.map((l) => (l.lineKey === lineKey ? { ...l, costAscii, costRaw } : l)));
  };

  const handleRemoveLine = (lineKey: string) => {
    setLines((prev) => prev.filter((l) => l.lineKey !== lineKey));
  };

  const handleSubmit = async () => {
    setFormError(null);

    if (hydratedLines.length === 0) {
      setFormError(t('validation.purchaseItemsRequired'));
      return;
    }

    const preparedItems: {
      productId: string;
      unitId: string;
      qtyDisplay: string;
      unitCostPoisha: number;
    }[] = [];

    for (const line of hydratedLines) {
      const qtyStr = line.qtyAscii.trim();
      if (!qtyStr) {
        setFormError(t('validation.invalidPurchaseQty'));
        return;
      }
      try {
        if (compareQuantities(qtyStr, '0') <= 0) {
          setFormError(t('validation.invalidPurchaseQty'));
          return;
        }
      } catch {
        setFormError(t('validation.invalidPurchaseQty'));
        return;
      }

      const costStr = line.costAscii.trim();
      if (!costStr) {
        setFormError(t('validation.invalidPurchaseCost'));
        return;
      }
      let unitCostPoisha: number;
      try {
        unitCostPoisha = bdtToPoisha(costStr);
      } catch {
        setFormError(t('validation.invalidPurchaseCost'));
        return;
      }
      if (unitCostPoisha < 0) {
        setFormError(t('validation.invalidPurchaseCost'));
        return;
      }

      preparedItems.push({
        productId: line.product.id,
        unitId: line.unitId,
        qtyDisplay: qtyStr,
        unitCostPoisha,
      });
    }

    if (discountPoisha < 0 || discountPoisha > lineComputations.subtotalPoisha) {
      setFormError(t('validation.purchaseDiscountExceedsSubtotal'));
      return;
    }

    if (effectivePaidPoisha < 0 || effectivePaidPoisha > totalPoisha) {
      setFormError(t('validation.purchasePaidExceedsTotal'));
      return;
    }

    if (duePoisha > 0 && !selectedSupplier) {
      setFormError(t('validation.purchaseDueRequiresSupplier'));
      return;
    }

    const payload = {
      ...(selectedSupplier ? { supplierId: selectedSupplier.id } : { supplierId: null }),
      items: preparedItems,
      discountPoisha,
      paidPoisha: effectivePaidPoisha,
      ...(effectivePaidPoisha > 0
        ? {
            paymentMethod,
            ...(paymentReference.trim().length > 0
              ? { paymentReference: paymentReference.trim() }
              : {}),
          }
        : { paymentMethod: null }),
      ...(note.trim().length > 0 ? { note: note.trim() } : {}),
    };

    const hash = JSON.stringify(payload);
    const idempotencyKey = lastAttempt?.hash === hash ? lastAttempt.key : Crypto.randomUUID();
    setLastAttempt({ hash, key: idempotencyKey });

    try {
      const res = await createPurchaseMutation.mutateAsync({
        payload,
        idempotencyKey,
      });
      router.replace(`/purchases/${res.purchase.id}`);
    } catch (err) {
      setFormError(getLocalizedErrorMessage(err, t));
    }
  };

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {t('purchases.formTitle')}
        </AppText>
        <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
      </View>

      {/* Supplier Card */}
      <Card style={{ gap: 10 }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color={Colors.textSecondary}>
              {t('purchases.supplierLabel')}
            </AppText>
            <AppText variant="body" weight="bold">
              {selectedSupplier
                ? getLocalizedSupplierName(selectedSupplier, language)
                : t('purchases.walkInSupplier')}
            </AppText>
            {selectedSupplier && selectedSupplier.payablePoisha > 0 ? (
              <AppText variant="caption" color={Colors.warning}>
                {t('suppliers.payableBadge', {
                  amount: formatMoney(selectedSupplier.payablePoisha),
                })}
              </AppText>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {selectedSupplier ? (
              <Button
                label={t('purchases.clearSupplier')}
                variant="outline"
                onPress={() => {
                  setSupplierOverride(null);
                  if (payMode === 'DUE') setPayMode('FULL');
                }}
              />
            ) : null}
            <Button
              label={
                selectedSupplier ? t('purchases.changeSupplier') : t('purchases.selectSupplier')
              }
              variant="secondary"
              testID="purchase-select-supplier-btn"
              onPress={() => setSupplierPickerOpen(true)}
            />
          </View>
        </View>
      </Card>

      {/* Product Selector Card */}
      <Card style={{ gap: 10 }}>
        <AppText variant="sectionTitle" weight="semibold">
          {t('purchases.productSearchTitle')}
        </AppText>
        <Input
          placeholder={t('purchases.productSearchPlaceholder')}
          value={productSearch}
          onChangeText={setProductSearch}
        />

        {productsQuery.isLoading ? (
          <LoadingView />
        ) : productsQuery.isError ? (
          <ErrorState
            message={getLocalizedErrorMessage(productsQuery.error, t)}
            onRetry={() => void productsQuery.refetch()}
          />
        ) : products.length === 0 ? (
          <AppText variant="caption" color={Colors.textSecondary}>
            {t('products.emptyTitle')}
          </AppText>
        ) : (
          <View style={{ gap: 6 }}>
            {products.slice(0, 8).map((product) => {
              const name = getLocalizedProductName(product, language);
              const stockText = formatProductStockDisplay(product, language, digitStyle);
              return (
                <Pressable
                  key={product.id}
                  accessibilityRole="button"
                  testID={`purchase-add-product-${product.id}`}
                  onPress={() => handleAddProduct(product)}
                >
                  <Card
                    style={{
                      padding: 10,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText variant="body" weight="semibold">
                        {name}
                      </AppText>
                      <AppText variant="caption" color={Colors.textSecondary}>
                        {t('products.stockLabel')}: {stockText}
                      </AppText>
                    </View>
                    <AppText variant="caption" weight="bold" color={Colors.primary}>
                      {t('purchases.addItemHint')}
                    </AppText>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      {/* Line Items */}
      <Card style={{ gap: 10 }}>
        <AppText variant="sectionTitle" weight="semibold">
          {t('purchases.lineItemsTitle', { count: hydratedLines.length })}
        </AppText>

        {hydratedLines.length === 0 ? (
          <AppText variant="body" color={Colors.textSecondary}>
            {t('purchases.emptyLines')}
          </AppText>
        ) : (
          lineComputations.computed.map(({ line, unitRule, impact }, index) => {
            const productName = getLocalizedProductName(line.product, language);
            const activeUnitLabel = unitRule
              ? getLocalizedUnitName(unitRule, language)
              : getLocalizedUnitName(
                  {
                    nameBn: line.product.baseUnitNameBn,
                    nameEn: line.product.baseUnitNameEn,
                  },
                  language,
                );
            const baseUnitLabel = getLocalizedUnitName(
              {
                nameBn: line.product.baseUnitNameBn,
                nameEn: line.product.baseUnitNameEn,
              },
              language,
            );

            return (
              <Card
                key={line.lineKey}
                style={{ gap: 8, padding: 12, backgroundColor: Colors.background }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <AppText variant="body" weight="bold" style={{ flex: 1 }}>
                    {formatDigits(index + 1)}. {productName}
                  </AppText>
                  <Button
                    label={t('purchases.removeItem')}
                    variant="outline"
                    onPress={() => handleRemoveLine(line.lineKey)}
                  />
                </View>

                {line.product.units.length > 1 ? (
                  <View
                    style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
                  >
                    <AppText variant="caption" color={Colors.textSecondary}>
                      {t('purchases.unitLabel')}
                    </AppText>
                    {line.product.units.map((u) => (
                      <FilterChip
                        key={u.id}
                        label={getLocalizedUnitName(u, language)}
                        selected={line.unitId === u.unitId}
                        onPress={() => handleChangeLineUnit(line.lineKey, u.unitId)}
                      />
                    ))}
                  </View>
                ) : null}

                <NumericInput
                  label={`${t('purchases.qtyLabel')} (${activeUnitLabel})`}
                  accessibilityLabel={`${t('purchases.qtyLabel')} (${activeUnitLabel})`}
                  placeholder={digitStyle === 'bn' ? '১' : '1'}
                  value={line.qtyRaw}
                  onChangeNormalized={(ascii, raw) => handleUpdateLineQty(line.lineKey, ascii, raw)}
                />

                <NumericInput
                  label={t('purchases.unitCostLabel', { unit: activeUnitLabel })}
                  accessibilityLabel={t('purchases.unitCostLabel', { unit: activeUnitLabel })}
                  placeholder={digitStyle === 'bn' ? '০' : '0'}
                  value={line.costRaw}
                  onChangeNormalized={(ascii, raw) =>
                    handleUpdateLineCost(line.lineKey, ascii, raw)
                  }
                />

                {impact ? (
                  <View
                    style={{
                      backgroundColor: Colors.primarySoft,
                      borderRadius: 8,
                      padding: 8,
                      gap: 4,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <AppText variant="caption" color={Colors.primaryPressed}>
                        {t('purchases.lineTotalLabel')}
                      </AppText>
                      <AppText variant="caption" weight="bold" color={Colors.primaryPressed}>
                        {formatMoney(impact.lineTotalPoisha)}
                      </AppText>
                    </View>
                    <AppText variant="caption" color={Colors.primaryPressed}>
                      {t('purchases.stockImpactPreview', {
                        before: `${formatDigits(formatQuantityDisplay(line.product.inventory.qtyBase, 3))} ${baseUnitLabel}`,
                        after: `${formatDigits(formatQuantityDisplay(impact.nextQtyBase, 3))} ${baseUnitLabel}`,
                        wac: formatMoney(bdtToPoisha(impact.nextAvgCostBdt)),
                        baseUnit: baseUnitLabel,
                      })}
                    </AppText>
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
      </Card>

      {/* Settlement & Payment Card */}
      <Card style={{ gap: 10 }}>
        <AppText variant="sectionTitle" weight="semibold">
          {t('purchases.paymentSectionTitle')}
        </AppText>

        <NumericInput
          label={t('purchases.discountLabel')}
          accessibilityLabel={t('purchases.discountLabel')}
          placeholder={t('purchases.discountPlaceholder')}
          value={discountRaw}
          onChangeNormalized={(ascii, raw) => {
            setDiscountAscii(ascii);
            setDiscountRaw(raw);
          }}
        />

        <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="body" color={Colors.textSecondary}>
              {t('purchases.subtotal')}
            </AppText>
            <AppText variant="body" weight="semibold">
              {formatMoney(lineComputations.subtotalPoisha)}
            </AppText>
          </View>
          {validDiscountPoisha > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body" color={Colors.textSecondary}>
                {t('purchases.discount')}
              </AppText>
              <AppText variant="body" weight="semibold" color={Colors.danger}>
                -{formatMoney(validDiscountPoisha)}
              </AppText>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="sectionTitle" weight="bold">
              {t('purchases.netTotal')}
            </AppText>
            <AppText variant="sectionTitle" weight="bold" color={Colors.primary}>
              {formatMoney(totalPoisha)}
            </AppText>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button
            label={t('purchases.payFullCashButton')}
            variant={payMode === 'FULL' && paymentMethod === 'CASH' ? 'secondary' : 'outline'}
            onPress={() => {
              setPayMode('FULL');
              setPaymentMethod('CASH');
            }}
          />
          <Button
            label={t('purchases.payFullBkashButton')}
            variant={payMode === 'FULL' && paymentMethod === 'BKASH' ? 'secondary' : 'outline'}
            onPress={() => {
              setPayMode('FULL');
              setPaymentMethod('BKASH');
            }}
          />
          {selectedSupplier ? (
            <Button
              label={t('purchases.markFullDueButton')}
              variant={payMode === 'DUE' ? 'secondary' : 'outline'}
              onPress={() => {
                setPayMode('DUE');
                setPaidAscii('');
                setPaidRaw('');
              }}
            />
          ) : null}
        </View>

        <NumericInput
          label={t('purchases.paidInputLabel')}
          accessibilityLabel={t('purchases.paidInputLabel')}
          placeholder={t('purchases.paidPlaceholder')}
          value={displayedPaidRaw}
          onChangeNormalized={(ascii, raw) => {
            setPayMode('CUSTOM');
            setPaidAscii(ascii);
            setPaidRaw(raw);
          }}
        />

        {effectivePaidPoisha > 0 ? (
          <>
            <View style={{ gap: 6 }}>
              <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
                {t('purchases.paymentMethodLabel')}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {PAYMENT_METHODS.map((m) => (
                  <FilterChip
                    key={m}
                    label={t(`sales.paymentMethods.${m}`)}
                    selected={paymentMethod === m}
                    onPress={() => setPaymentMethod(m)}
                  />
                ))}
              </View>
            </View>
            <Input
              label={t('purchases.referenceLabel')}
              placeholder={t('purchases.referencePlaceholder')}
              value={paymentReference}
              onChangeText={setPaymentReference}
            />
          </>
        ) : null}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="body" weight="bold">
            {t('purchases.dueAmount')}
          </AppText>
          <AppText
            variant="body"
            weight="bold"
            color={duePoisha > 0 ? Colors.danger : Colors.success}
          >
            {formatMoney(duePoisha)}
          </AppText>
        </View>

        {!selectedSupplier && duePoisha > 0 ? (
          <AppText variant="caption" weight="semibold" color={Colors.warning}>
            {t('purchases.walkInDueWarning')}
          </AppText>
        ) : null}

        <Input
          label={t('purchases.noteLabel')}
          placeholder={t('purchases.notePlaceholder')}
          value={note}
          onChangeText={setNote}
        />
      </Card>

      {formError ? (
        <Card style={{ backgroundColor: Colors.dangerSoft, borderColor: '#FECACA', padding: 12 }}>
          <AppText variant="body" weight="semibold" color={Colors.danger}>
            {formError}
          </AppText>
        </Card>
      ) : null}

      <Button
        label={t('purchases.submitButton')}
        fullWidth
        testID="purchase-submit-btn"
        loading={createPurchaseMutation.isPending}
        onPress={() => void handleSubmit()}
      />

      <SupplierPickerModal
        visible={supplierPickerOpen}
        selectedSupplierId={selectedSupplier?.id ?? null}
        onSelect={(sup) => setSupplierOverride(sup)}
        onClose={() => setSupplierPickerOpen(false)}
      />
    </ScreenContainer>
  );
}

export default function PurchaseFormScreen() {
  const { t } = useAppTranslation();
  const params = useLocalSearchParams<{ supplierId?: string }>();
  const paramSupplierId = typeof params.supplierId === 'string' ? params.supplierId : undefined;
  const user = useAuthStore((s) => s.user);

  if (user?.role !== 'OWNER') {
    return (
      <OwnerOnlyScreen
        title={t('purchases.formTitle')}
        description={t('purchases.ownerOnlyDesc')}
      />
    );
  }

  return <PurchaseFormContent paramSupplierId={paramSupplierId} />;
}
