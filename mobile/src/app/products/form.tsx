import {
  bdtToPoisha,
  calculateLineTotalPoisha,
  compareQuantities,
  formatQuantityDisplay,
  poishaToBdtString,
  toBanglaDigits,
  type CategoryDto,
  type ProductDto,
  type UnitDto,
} from '@dokanwala/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Switch, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  Input,
  LoadingView,
  NumericInput,
  ScreenContainer,
} from '@/components';
import { FilterChip } from '@/features/products/components/FilterChip';
import {
  useCategoriesQuery,
  useCreateProductMutation,
  useMovementsQuery,
  useProductDetailQuery,
  useUnitsQuery,
  useUpdateProductMutation,
} from '@/features/products/hooks/useCatalogQueries';
import {
  getLocalizedCategoryName,
  getLocalizedUnitName,
} from '@/features/products/utils/catalog-format';
import { SupplierPickerModal } from '@/features/purchases/components/SupplierPickerModal';
import { useSuppliersQuery } from '@/features/purchases/hooks/usePurchasesQueries';
import { getLocalizedSupplierName } from '@/features/purchases/utils/purchase-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import type { ProductUnitInputPayload } from '@/services/api/catalog';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

interface UnitRuleDraft {
  localKey: string;
  unitId: string;
  factorRaw: string;
  factorAscii: string;
  priceOverrideRaw: string;
  priceOverrideAscii: string;
}

function suggestDefaultFactor(baseCode: string, targetCode: string): string {
  if (baseCode === 'PIECE' && targetCode === 'BIRA') return '20';
  if (baseCode === 'PIECE' && targetCode === 'DOZEN') return '12';
  if (baseCode === 'GRAM' && targetCode === 'KG') return '1000';
  if (baseCode === 'GRAM' && targetCode === 'POYA') return '250';
  if (baseCode === 'ML' && targetCode === 'LITER') return '1000';
  return '10';
}

interface ProductFormInnerProps {
  existingProduct?: ProductDto;
  categories: CategoryDto[];
  allUnits: UnitDto[];
  baseUnitLocked: boolean;
}

function ProductFormInner({
  existingProduct,
  categories,
  allUnits,
  baseUnitLocked,
}: ProductFormInnerProps) {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney } = useFormattedMoney();
  const router = useRouter();
  const isEditMode = Boolean(existingProduct);

  const createMutation = useCreateProductMutation();
  const updateMutation = useUpdateProductMutation();

  const formatForInput = (ascii: string): string =>
    digitStyle === 'bn' ? toBanglaDigits(ascii) : ascii;

  const initialDefaultUnit =
    allUnits.find((u) => u.code === 'PIECE') ?? allUnits[0];
  const initialBaseUnitId = existingProduct?.baseUnitId ?? initialDefaultUnit?.id ?? '';

  const initialSellAscii = existingProduct
    ? poishaToBdtString(existingProduct.baseSellingPricePoisha)
    : '';
  const initialPurAscii =
    existingProduct?.lastPurchasePricePoisha !== null &&
    existingProduct?.lastPurchasePricePoisha !== undefined &&
    existingProduct.lastPurchasePricePoisha > 0
      ? poishaToBdtString(existingProduct.lastPurchasePricePoisha)
      : '';
  const initialThrAscii = existingProduct
    ? formatQuantityDisplay(existingProduct.lowStockThresholdBase, 4)
    : '0';

  const [nameBn, setNameBn] = useState(existingProduct?.nameBn ?? '');
  const [nameEn, setNameEn] = useState(existingProduct?.nameEn ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(
    existingProduct?.categoryId ?? null,
  );
  const [defaultSupplierName, setDefaultSupplierName] = useState(
    existingProduct?.defaultSupplierName ?? '',
  );
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);

  const suppliersQuery = useSuppliersQuery();
  const availableSuppliers = useMemo(
    () => (suppliersQuery.data?.suppliers ?? []).filter((s) => s.isActive),
    [suppliersQuery.data?.suppliers],
  );

  const [baseUnitId, setBaseUnitId] = useState(initialBaseUnitId);
  const [defaultSaleUnitId, setDefaultSaleUnitId] = useState(
    existingProduct?.defaultSaleUnitId ?? initialBaseUnitId,
  );
  const [defaultPurchaseUnitId, setDefaultPurchaseUnitId] = useState(
    existingProduct?.defaultPurchaseUnitId ?? initialBaseUnitId,
  );

  const [sellingPriceRaw, setSellingPriceRaw] = useState(
    initialSellAscii ? formatForInput(initialSellAscii) : '',
  );
  const [sellingPriceAscii, setSellingPriceAscii] = useState(initialSellAscii);
  const [purchasePriceRaw, setPurchasePriceRaw] = useState(
    initialPurAscii ? formatForInput(initialPurAscii) : '',
  );
  const [purchasePriceAscii, setPurchasePriceAscii] = useState(initialPurAscii);
  const [thresholdRaw, setThresholdRaw] = useState(formatForInput(initialThrAscii));
  const [thresholdAscii, setThresholdAscii] = useState(initialThrAscii);

  const [unitRules, setUnitRules] = useState<UnitRuleDraft[]>(() =>
    existingProduct
      ? existingProduct.units
          .filter((u) => u.unitId !== existingProduct.baseUnitId)
          .map((u, idx) => {
            const facAscii = formatQuantityDisplay(u.conversionFactorToBase, 4);
            const priceAscii =
              u.sellingPricePoisha !== null ? poishaToBdtString(u.sellingPricePoisha) : '';
            return {
              localKey: `${u.unitId}-${idx}`,
              unitId: u.unitId,
              factorAscii: facAscii,
              factorRaw: formatForInput(facAscii),
              priceOverrideAscii: priceAscii,
              priceOverrideRaw: priceAscii ? formatForInput(priceAscii) : '',
            };
          })
      : [],
  );

  const [enableOpeningStock, setEnableOpeningStock] = useState(false);
  const [openingQtyRaw, setOpeningQtyRaw] = useState('');
  const [openingQtyAscii, setOpeningQtyAscii] = useState('');
  const [openingUnitId, setOpeningUnitId] = useState(initialBaseUnitId);
  const [openingUnitCostRaw, setOpeningUnitCostRaw] = useState('');
  const [openingUnitCostAscii, setOpeningUnitCostAscii] = useState('');
  const [openingReason, setOpeningReason] = useState('');

  const [formError, setFormError] = useState<string | null>(null);

  const configuredUnits = useMemo(() => {
    const ids = new Set<string>();
    if (baseUnitId) ids.add(baseUnitId);
    for (const rule of unitRules) {
      if (rule.unitId) ids.add(rule.unitId);
    }
    return allUnits.filter((u) => ids.has(u.id));
  }, [allUnits, baseUnitId, unitRules]);

  const validUnitIds = useMemo(
    () => new Set(configuredUnits.map((u) => u.id)),
    [configuredUnits],
  );
  const effectiveSaleUnitId = validUnitIds.has(defaultSaleUnitId)
    ? defaultSaleUnitId
    : baseUnitId;
  const effectivePurchaseUnitId = validUnitIds.has(defaultPurchaseUnitId)
    ? defaultPurchaseUnitId
    : baseUnitId;
  const effectiveOpeningUnitId = validUnitIds.has(openingUnitId)
    ? openingUnitId
    : baseUnitId;

  const openingTotalPoishaPreview = useMemo(() => {
    if (!enableOpeningStock || !openingQtyAscii || !openingUnitCostAscii) return 0;
    try {
      const unitCostPoisha = bdtToPoisha(openingUnitCostAscii);
      return calculateLineTotalPoisha(openingQtyAscii, unitCostPoisha);
    } catch {
      return 0;
    }
  }, [enableOpeningStock, openingQtyAscii, openingUnitCostAscii]);

  const handleSelectBaseUnit = (nextBaseId: string) => {
    if (baseUnitLocked) return;
    setBaseUnitId(nextBaseId);
    setUnitRules((prev) => prev.filter((rule) => rule.unitId !== nextBaseId));
  };

  const handleAddUnitRule = () => {
    const usedIds = new Set<string>([baseUnitId, ...unitRules.map((r) => r.unitId)]);
    const candidate: UnitDto | undefined = allUnits.find((u) => !usedIds.has(u.id));
    if (!candidate) {
      setFormError(t('validation.duplicateProductUnit'));
      return;
    }
    const baseCode = allUnits.find((u) => u.id === baseUnitId)?.code ?? '';
    const suggested = suggestDefaultFactor(baseCode, candidate.code);

    setUnitRules((prev) => [
      ...prev,
      {
        localKey: `${Date.now()}-${prev.length}`,
        unitId: candidate.id,
        factorAscii: suggested,
        factorRaw: formatForInput(suggested),
        priceOverrideAscii: '',
        priceOverrideRaw: '',
      },
    ]);
  };

  const handleSubmit = async () => {
    setFormError(null);

    if (nameBn.trim().length < 1) {
      setFormError(t('validation.minProductNameBn'));
      return;
    }
    if (!baseUnitId) {
      setFormError(t('validation.selectBaseUnit'));
      return;
    }

    let baseSellingPricePoisha: number;
    try {
      if (!sellingPriceAscii) throw new Error('empty');
      baseSellingPricePoisha = bdtToPoisha(sellingPriceAscii);
      if (baseSellingPricePoisha < 0) throw new Error('negative');
    } catch {
      setFormError(t('validation.invalidSellingPrice'));
      return;
    }

    let lastPurchasePricePoisha = 0;
    if (purchasePriceAscii.trim().length > 0) {
      try {
        lastPurchasePricePoisha = bdtToPoisha(purchasePriceAscii);
        if (lastPurchasePricePoisha < 0) throw new Error('negative');
      } catch {
        setFormError(t('validation.invalidPurchasePrice'));
        return;
      }
    }

    const normalizedThreshold = thresholdAscii.trim().length > 0 ? thresholdAscii.trim() : '0';
    try {
      if (compareQuantities(normalizedThreshold, '0') < 0) {
        throw new Error('negative');
      }
    } catch {
      setFormError(t('validation.invalidThreshold'));
      return;
    }

    const seenUnitIds = new Set<string>([baseUnitId]);
    const validatedRules: ProductUnitInputPayload[] = [
      {
        unitId: baseUnitId,
        conversionFactorToBase: '1',
        sellingPricePoisha: baseSellingPricePoisha,
      },
    ];

    for (const rule of unitRules) {
      if (!rule.unitId || seenUnitIds.has(rule.unitId)) {
        setFormError(t('validation.duplicateProductUnit'));
        return;
      }
      seenUnitIds.add(rule.unitId);

      try {
        if (!rule.factorAscii || compareQuantities(rule.factorAscii, '0') <= 0) {
          throw new Error('invalid');
        }
      } catch {
        setFormError(t('validation.invalidUnitFactor'));
        return;
      }

      let overridePoisha: number | null = null;
      if (rule.priceOverrideAscii.trim().length > 0) {
        try {
          overridePoisha = bdtToPoisha(rule.priceOverrideAscii);
          if (overridePoisha < 0) throw new Error('negative');
        } catch {
          setFormError(t('validation.invalidSellingPrice'));
          return;
        }
      }

      validatedRules.push({
        unitId: rule.unitId,
        conversionFactorToBase: rule.factorAscii.trim(),
        sellingPricePoisha: overridePoisha,
      });
    }

    let openingStockPayload:
      | {
          qtyDisplay: string;
          unitId: string;
          unitCostPoisha?: number;
          reason?: string | null;
        }
      | undefined;

    if (!isEditMode && enableOpeningStock) {
      try {
        if (!openingQtyAscii || compareQuantities(openingQtyAscii, '0') <= 0) {
          throw new Error('invalid');
        }
      } catch {
        setFormError(t('validation.invalidOpeningQty'));
        return;
      }

      let openingUnitCostPoisha: number | undefined;
      if (openingUnitCostAscii.trim().length > 0) {
        try {
          openingUnitCostPoisha = bdtToPoisha(openingUnitCostAscii);
          if (openingUnitCostPoisha < 0) throw new Error('negative');
        } catch {
          setFormError(t('validation.invalidPurchasePrice'));
          return;
        }
      }

      openingStockPayload = {
        qtyDisplay: openingQtyAscii.trim(),
        unitId: effectiveOpeningUnitId,
        ...(openingUnitCostPoisha !== undefined ? { unitCostPoisha: openingUnitCostPoisha } : {}),
        ...(openingReason.trim().length > 0 ? { reason: openingReason.trim() } : {}),
      };
    }

    try {
      if (isEditMode && existingProduct) {
        await updateMutation.mutateAsync({
          id: existingProduct.id,
          patch: {
            nameBn: nameBn.trim(),
            nameEn: nameEn.trim() || null,
            categoryId: categoryId ?? null,
            defaultSupplierName: defaultSupplierName.trim() || null,
            ...(baseUnitLocked ? {} : { baseUnitId }),
            defaultSaleUnitId: effectiveSaleUnitId,
            defaultPurchaseUnitId: effectivePurchaseUnitId,
            baseSellingPricePoisha,
            lastPurchasePricePoisha,
            lowStockThresholdBase: normalizedThreshold,
            expectedVersion: existingProduct.version,
          },
          units: validatedRules,
        });
        router.back();
        return;
      }

      await createMutation.mutateAsync({
        nameBn: nameBn.trim(),
        ...(nameEn.trim() ? { nameEn: nameEn.trim() } : {}),
        categoryId: categoryId ?? null,
        ...(defaultSupplierName.trim() ? { defaultSupplierName: defaultSupplierName.trim() } : {}),
        baseUnitId,
        defaultSaleUnitId: effectiveSaleUnitId,
        defaultPurchaseUnitId: effectivePurchaseUnitId,
        baseSellingPricePoisha,
        lastPurchasePricePoisha,
        lowStockThresholdBase: normalizedThreshold,
        units: validatedRules,
        ...(openingStockPayload ? { openingStock: openingStockPayload } : {}),
      });
      router.back();
    } catch (err) {
      setFormError(getLocalizedErrorMessage(err, t));
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {isEditMode ? t('products.formEditTitle') : t('products.formCreateTitle')}
        </AppText>
        <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
      </View>

      {formError ? (
        <Card style={{ backgroundColor: Colors.dangerSoft, borderColor: '#FECACA' }}>
          <AppText variant="body" weight="semibold" color={Colors.danger}>
            {formError}
          </AppText>
        </Card>
      ) : null}

      {/* Core Product Metadata */}
      <Card style={{ gap: 14 }}>
        <Input
          label={t('products.nameBnLabel')}
          placeholder={t('products.nameBnPlaceholder')}
          value={nameBn}
          onChangeText={setNameBn}
        />
        <Input
          label={t('products.nameEnLabel')}
          placeholder={t('products.nameEnPlaceholder')}
          value={nameEn}
          onChangeText={setNameEn}
        />

        <View style={{ gap: 8 }}>
          <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
            {t('products.categoryLabel')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <FilterChip
              label={t('products.uncategorized')}
              selected={categoryId === null}
              onPress={() => setCategoryId(null)}
            />
            {categories.map((cat) => (
              <FilterChip
                key={cat.id}
                label={getLocalizedCategoryName(cat, language) ?? cat.nameBn}
                selected={categoryId === cat.id}
                onPress={() => setCategoryId(cat.id)}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
              {t('products.supplierLabel')}
            </AppText>
            <Button
              label={t('products.chooseSupplierButton')}
              variant="outline"
              testID="product-supplier-picker-btn"
              onPress={() => setSupplierPickerOpen(true)}
            />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <FilterChip
              label={t('products.noSupplierSelected')}
              selected={defaultSupplierName.trim() === ''}
              onPress={() => setDefaultSupplierName('')}
            />
            {availableSuppliers.map((sup) => {
              const supDisplay = getLocalizedSupplierName(sup, language);
              const isSelected =
                defaultSupplierName === sup.nameBn ||
                (sup.nameEn !== null && defaultSupplierName === sup.nameEn);
              return (
                <FilterChip
                  key={sup.id}
                  label={supDisplay}
                  selected={isSelected}
                  onPress={() => setDefaultSupplierName(sup.nameBn)}
                />
              );
            })}
            {defaultSupplierName.trim().length > 0 &&
            !availableSuppliers.some(
              (s) => s.nameBn === defaultSupplierName || s.nameEn === defaultSupplierName,
            ) ? (
              <FilterChip
                label={defaultSupplierName}
                selected
                onPress={() => setDefaultSupplierName(defaultSupplierName)}
              />
            ) : null}
          </View>
        </View>
      </Card>

      {/* Base Unit & Core Pricing */}
      <Card style={{ gap: 14 }}>
        <View style={{ gap: 8 }}>
          <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
            {t('products.baseUnitLabel')}
          </AppText>
          {baseUnitLocked ? (
            <Badge label={t('products.baseUnitLockedNote')} tone="warning" />
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {allUnits.map((unit) => (
              <FilterChip
                key={unit.id}
                label={`${getLocalizedUnitName(unit, language)} (${unit.code})`}
                selected={baseUnitId === unit.id}
                onPress={() => handleSelectBaseUnit(unit.id)}
              />
            ))}
          </View>
        </View>

        <NumericInput
          label={t('products.baseSellingPriceLabel')}
          placeholder={digitStyle === 'bn' ? '১০.০০' : '10.00'}
          value={sellingPriceRaw}
          onChangeNormalized={(ascii, raw) => {
            setSellingPriceAscii(ascii);
            setSellingPriceRaw(raw);
          }}
        />
        <NumericInput
          label={t('products.purchasePriceRefLabel')}
          placeholder={digitStyle === 'bn' ? '৭.০০' : '7.00'}
          value={purchasePriceRaw}
          onChangeNormalized={(ascii, raw) => {
            setPurchasePriceAscii(ascii);
            setPurchasePriceRaw(raw);
          }}
        />
        <NumericInput
          label={t('products.lowStockThresholdLabel')}
          placeholder={digitStyle === 'bn' ? '১০' : '10'}
          value={thresholdRaw}
          onChangeNormalized={(ascii, raw) => {
            setThresholdAscii(ascii);
            setThresholdRaw(raw);
          }}
        />
        <AppText variant="caption" color={Colors.textMuted}>
          {t('products.lowStockThresholdHint')}
        </AppText>
      </Card>

      {/* Flexible Unit Conversions */}
      <Card style={{ gap: 12 }}>
        <View style={{ gap: 4 }}>
          <AppText variant="sectionTitle" weight="bold">
            {t('products.unitRulesTitle')}
          </AppText>
          <AppText variant="caption" color={Colors.textSecondary}>
            {t('products.unitRulesHint')}
          </AppText>
        </View>

        {unitRules.map((rule, index) => (
          <Card
            key={rule.localKey}
            style={{ backgroundColor: Colors.background, gap: 10, padding: 12 }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <AppText variant="caption" weight="bold">
                {t('products.unitSelectLabel')} #{index + 1}
              </AppText>
              <Button
                label={t('products.removeUnitRule')}
                variant="outline"
                onPress={() =>
                  setUnitRules((prev) => prev.filter((item) => item.localKey !== rule.localKey))
                }
              />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {allUnits
                .filter((u) => u.id !== baseUnitId)
                .map((unit) => (
                  <FilterChip
                    key={unit.id}
                    label={getLocalizedUnitName(unit, language)}
                    selected={rule.unitId === unit.id}
                    onPress={() => {
                      const baseCode = allUnits.find((u) => u.id === baseUnitId)?.code ?? '';
                      const nextFactor = suggestDefaultFactor(baseCode, unit.code);
                      setUnitRules((prev) =>
                        prev.map((item) =>
                          item.localKey === rule.localKey
                            ? {
                                ...item,
                                unitId: unit.id,
                                factorAscii: nextFactor,
                                factorRaw: formatForInput(nextFactor),
                              }
                            : item,
                        ),
                      );
                    }}
                  />
                ))}
            </View>

            <NumericInput
              label={t('products.factorLabel')}
              placeholder={t('products.factorPlaceholder')}
              value={rule.factorRaw}
              onChangeNormalized={(ascii, raw) => {
                setUnitRules((prev) =>
                  prev.map((item) =>
                    item.localKey === rule.localKey
                      ? { ...item, factorAscii: ascii, factorRaw: raw }
                      : item,
                  ),
                );
              }}
            />

            <NumericInput
              label={t('products.unitPriceOverrideLabel')}
              placeholder={t('products.unitPriceOverridePlaceholder')}
              value={rule.priceOverrideRaw}
              onChangeNormalized={(ascii, raw) => {
                setUnitRules((prev) =>
                  prev.map((item) =>
                    item.localKey === rule.localKey
                      ? { ...item, priceOverrideAscii: ascii, priceOverrideRaw: raw }
                      : item,
                  ),
                );
              }}
            />
          </Card>
        ))}

        <Button
          label={t('products.addUnitRule')}
          variant="secondary"
          onPress={handleAddUnitRule}
        />

        {/* Default Sale & Purchase Unit */}
        <View style={{ gap: 8, marginTop: 4 }}>
          <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
            {t('products.defaultSaleUnitLabel')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {configuredUnits.map((unit) => (
              <FilterChip
                key={`sale-${unit.id}`}
                label={getLocalizedUnitName(unit, language)}
                selected={effectiveSaleUnitId === unit.id}
                onPress={() => setDefaultSaleUnitId(unit.id)}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
            {t('products.defaultPurchaseUnitLabel')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {configuredUnits.map((unit) => (
              <FilterChip
                key={`purchase-${unit.id}`}
                label={getLocalizedUnitName(unit, language)}
                selected={effectivePurchaseUnitId === unit.id}
                onPress={() => setDefaultPurchaseUnitId(unit.id)}
              />
            ))}
          </View>
        </View>
      </Card>

      {/* Opening Stock (Create mode only) */}
      {!isEditMode ? (
        <Card style={{ gap: 12 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <AppText variant="sectionTitle" weight="bold">
                {t('products.openingStockTitle')}
              </AppText>
              <AppText variant="caption" color={Colors.textSecondary}>
                {t('products.enableOpeningStock')}
              </AppText>
            </View>
            <Switch value={enableOpeningStock} onValueChange={setEnableOpeningStock} />
          </View>

          {enableOpeningStock ? (
            <View style={{ gap: 12 }}>
              <View style={{ gap: 8 }}>
                <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
                  {t('products.openingUnitLabel')}
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {configuredUnits.map((unit) => (
                    <FilterChip
                      key={`open-${unit.id}`}
                      label={getLocalizedUnitName(unit, language)}
                      selected={effectiveOpeningUnitId === unit.id}
                      onPress={() => setOpeningUnitId(unit.id)}
                    />
                  ))}
                </View>
              </View>

              <NumericInput
                label={t('products.openingQtyLabel')}
                placeholder={digitStyle === 'bn' ? '৫' : '5'}
                value={openingQtyRaw}
                onChangeNormalized={(ascii, raw) => {
                  setOpeningQtyAscii(ascii);
                  setOpeningQtyRaw(raw);
                }}
              />

              <NumericInput
                label={t('products.openingUnitCostLabel')}
                placeholder={digitStyle === 'bn' ? '১৪০' : '140'}
                value={openingUnitCostRaw}
                onChangeNormalized={(ascii, raw) => {
                  setOpeningUnitCostAscii(ascii);
                  setOpeningUnitCostRaw(raw);
                }}
              />

              {openingTotalPoishaPreview > 0 ? (
                <AppText variant="body" weight="bold" color={Colors.primary}>
                  {t('products.openingTotalPreview', {
                    value: formatMoney(openingTotalPoishaPreview),
                  })}
                </AppText>
              ) : null}

              <Input
                label={t('products.openingReasonLabel')}
                placeholder={t('products.openingReasonPlaceholder')}
                value={openingReason}
                onChangeText={setOpeningReason}
              />
            </View>
          ) : null}
        </Card>
      ) : null}

      <Button
        label={t('common.save')}
        fullWidth
        loading={isSubmitting}
        onPress={() => void handleSubmit()}
      />

      <SupplierPickerModal
        visible={supplierPickerOpen}
        selectedSupplierId={
          availableSuppliers.find(
            (s) => s.nameBn === defaultSupplierName || s.nameEn === defaultSupplierName,
          )?.id ?? null
        }
        onSelect={(supplier) => {
          setDefaultSupplierName(supplier ? supplier.nameBn : '');
        }}
        onClose={() => setSupplierPickerOpen(false)}
      />
    </ScreenContainer>
  );
}

export default function ProductFormScreen() {
  const { t } = useAppTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ productId?: string }>();
  const productId =
    typeof params.productId === 'string' && params.productId.length > 0
      ? params.productId
      : undefined;
  const isEditMode = Boolean(productId);

  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === 'OWNER';

  const categoriesQuery = useCategoriesQuery(false);
  const unitsQuery = useUnitsQuery();
  const detailQuery = useProductDetailQuery(productId);
  const productMovementsQuery = useMovementsQuery(productId ? { productId } : undefined);

  if (!isOwner) {
    return (
      <ScreenContainer>
        <ErrorState
          title={t('common.errorTitle')}
          message={t('shop.ownerOnlyNote')}
          onRetry={() => router.back()}
        />
      </ScreenContainer>
    );
  }

  if (unitsQuery.isLoading || categoriesQuery.isLoading || (isEditMode && detailQuery.isLoading)) {
    return (
      <ScreenContainer>
        <LoadingView />
      </ScreenContainer>
    );
  }

  if (isEditMode && detailQuery.isError) {
    return (
      <ScreenContainer>
        <ErrorState
          message={getLocalizedErrorMessage(detailQuery.error, t)}
          onRetry={() => void detailQuery.refetch()}
        />
      </ScreenContainer>
    );
  }

  const existingProduct = detailQuery.data?.product;
  const allUnits = unitsQuery.data?.units ?? [];
  const categories = categoriesQuery.data?.categories ?? [];
  const baseUnitLocked = isEditMode && (productMovementsQuery.data?.movements.length ?? 0) > 0;

  return (
    <ProductFormInner
      key={existingProduct?.id ?? 'new'}
      existingProduct={existingProduct}
      categories={categories}
      allUnits={allUnits}
      baseUnitLocked={baseUnitLocked}
    />
  );
}
