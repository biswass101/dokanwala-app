import {
  addQuantities,
  calculateInventoryValuationPoisha,
  compareQuantities,
  convertToBaseQuantity,
  subtractQuantities,
  toBanglaDigits,
  type StockAdjustmentType,
} from '@dokanwala/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Input,
  LoadingView,
  NumericInput,
  ScreenContainer,
} from '@/components';
import { FilterChip } from '@/features/products/components/FilterChip';
import {
  useCreateAdjustmentMutation,
  useProductDetailQuery,
  useProductsQuery,
} from '@/features/products/hooks/useCatalogQueries';
import {
  formatProductStockDisplay,
  formatQuantityWithDigits,
  getLocalizedProductName,
  getLocalizedUnitName,
} from '@/features/products/utils/catalog-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

const ADJUSTMENT_TYPES: StockAdjustmentType[] = ['WASTAGE', 'DAMAGE', 'EXPIRED', 'COUNT_ADJUST'];

export default function StockAdjustmentScreen() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney } = useFormattedMoney();
  const router = useRouter();
  const params = useLocalSearchParams<{ productId?: string }>();

  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === 'OWNER';

  const paramProductId =
    typeof params.productId === 'string' && params.productId.length > 0
      ? params.productId
      : undefined;

  const productsQuery = useProductsQuery({});
  const selectedProductId = paramProductId ?? productsQuery.data?.products[0]?.id;

  const detailQuery = useProductDetailQuery(selectedProductId);
  const adjustMutation = useCreateAdjustmentMutation();

  const product = detailQuery.data?.product;

  const [adjustmentType, setAdjustmentType] = useState<StockAdjustmentType>('WASTAGE');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [countMode, setCountMode] = useState<'PHYSICAL' | 'DELTA'>('PHYSICAL');
  const [direction, setDirection] = useState<'INCREASE' | 'DECREASE'>('DECREASE');
  const [qtyRaw, setQtyRaw] = useState('');
  const [qtyAscii, setQtyAscii] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const selectedUnit = useMemo(() => {
    if (!product) return undefined;
    if (selectedUnitId) {
      const explicit = product.units.find((u) => u.unitId === selectedUnitId);
      if (explicit) return explicit;
    }
    return (
      product.units.find((u) => u.unitId === product.defaultSaleUnitId) ??
      product.units.find((u) => u.unitId === product.baseUnitId) ??
      product.units[0]
    );
  }, [product, selectedUnitId]);

  const presets = useMemo(() => {
    if (selectedUnit?.isFractional) {
      return ['0.25', '0.5', '1', '5'];
    }
    return ['1', '5', '10', '20'];
  }, [selectedUnit?.isFractional]);

  const preview = useMemo(() => {
    if (!product || !selectedUnit || !qtyAscii.trim()) {
      return null;
    }
    try {
      const currentBase = product.inventory.qtyBase;
      const convertedBase = convertToBaseQuantity(qtyAscii, selectedUnit.conversionFactorToBase);

      let nextBase: string;
      let deltaNegativeQtyBase = '0';

      if (adjustmentType === 'COUNT_ADJUST' && countMode === 'PHYSICAL') {
        nextBase = convertedBase;
        const cmp = compareQuantities(convertedBase, currentBase);
        if (cmp < 0) {
          deltaNegativeQtyBase = subtractQuantities(currentBase, convertedBase);
        }
      } else {
        const isIncrease = adjustmentType === 'COUNT_ADJUST' && direction === 'INCREASE';
        if (isIncrease) {
          nextBase = addQuantities(currentBase, convertedBase);
        } else {
          nextBase = subtractQuantities(currentBase, convertedBase);
          deltaNegativeQtyBase = convertedBase;
        }
      }

      const estimatedLossPoisha =
        compareQuantities(deltaNegativeQtyBase, '0') > 0 && product.inventory.avgCostPerBaseBdt
          ? calculateInventoryValuationPoisha(
              deltaNegativeQtyBase,
              product.inventory.avgCostPerBaseBdt,
            )
          : 0;

      return { nextBase, estimatedLossPoisha };
    } catch {
      return null;
    }
  }, [adjustmentType, countMode, direction, product, qtyAscii, selectedUnit]);

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

  if (detailQuery.isLoading || (!selectedProductId && productsQuery.isLoading)) {
    return (
      <ScreenContainer>
        <LoadingView />
      </ScreenContainer>
    );
  }

  if (detailQuery.isError || !product) {
    return (
      <ScreenContainer>
        <ErrorState
          message={
            detailQuery.isError
              ? getLocalizedErrorMessage(detailQuery.error, t)
              : t('errors.RESOURCE_NOT_FOUND')
          }
          onRetry={() => {
            void detailQuery.refetch();
            void productsQuery.refetch();
          }}
        />
      </ScreenContainer>
    );
  }

  const baseUnitName = getLocalizedUnitName(
    { nameBn: product.baseUnitNameBn, nameEn: product.baseUnitNameEn },
    language,
  );
  const productName = getLocalizedProductName(product, language);

  const handleOpenConfirm = () => {
    setFormError(null);
    if (!selectedUnit) {
      setFormError(t('validation.invalidAdjustQty'));
      return;
    }

    try {
      const allowZero = adjustmentType === 'COUNT_ADJUST' && countMode === 'PHYSICAL';
      if (!qtyAscii.trim()) throw new Error('empty');
      const cmp = compareQuantities(qtyAscii, '0');
      if (allowZero ? cmp < 0 : cmp <= 0) {
        throw new Error('range');
      }
    } catch {
      setFormError(t('validation.invalidAdjustQty'));
      return;
    }

    setConfirmVisible(true);
  };

  const handleSubmitConfirmed = async () => {
    if (!selectedUnit) return;
    setFormError(null);
    try {
      await adjustMutation.mutateAsync({
        productId: product.id,
        adjustmentType,
        unitId: selectedUnit.unitId,
        ...(adjustmentType === 'COUNT_ADJUST' && countMode === 'PHYSICAL'
          ? { countedQtyDisplay: qtyAscii.trim() }
          : adjustmentType === 'COUNT_ADJUST'
            ? { qtyDisplay: qtyAscii.trim(), direction }
            : { qtyDisplay: qtyAscii.trim() }),
        ...(reason.trim().length > 0 ? { reason: reason.trim() } : {}),
      });
      setConfirmVisible(false);
      router.back();
    } catch (err) {
      setConfirmVisible(false);
      setFormError(getLocalizedErrorMessage(err, t));
    }
  };

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {t('inventory.adjustTitle')}
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

      {/* Product Summary */}
      <Card style={{ gap: 6 }}>
        <AppText variant="sectionTitle" weight="bold">
          {productName}
        </AppText>
        <AppText variant="body" color={Colors.textSecondary}>
          {t('inventory.currentStockLabel')}:{' '}
          <AppText variant="body" weight="bold" color={Colors.primary}>
            {formatProductStockDisplay(product, language, digitStyle)}
          </AppText>
        </AppText>
      </Card>

      {/* Adjustment Form */}
      <Card style={{ gap: 14 }}>
        <View style={{ gap: 8 }}>
          <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
            {t('inventory.adjustmentTypeLabel')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ADJUSTMENT_TYPES.map((type) => (
              <FilterChip
                key={type}
                label={t(`inventory.adjustmentTypes.${type}`)}
                selected={adjustmentType === type}
                tone={type === 'COUNT_ADJUST' ? 'warning' : 'danger'}
                onPress={() => setAdjustmentType(type)}
              />
            ))}
          </View>
        </View>

        {adjustmentType === 'COUNT_ADJUST' ? (
          <View style={{ gap: 10 }}>
            <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
              {t('inventory.countModeLabel')}
            </AppText>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <FilterChip
                label={t('inventory.countModePhysical')}
                selected={countMode === 'PHYSICAL'}
                onPress={() => setCountMode('PHYSICAL')}
              />
              <FilterChip
                label={t('inventory.countModeDelta')}
                selected={countMode === 'DELTA'}
                onPress={() => setCountMode('DELTA')}
              />
            </View>

            {countMode === 'DELTA' ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <FilterChip
                  label={t('inventory.increaseLabel')}
                  selected={direction === 'INCREASE'}
                  onPress={() => setDirection('INCREASE')}
                />
                <FilterChip
                  label={t('inventory.decreaseLabel')}
                  selected={direction === 'DECREASE'}
                  tone="danger"
                  onPress={() => setDirection('DECREASE')}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Unit Selection */}
        <View style={{ gap: 8 }}>
          <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
            {t('inventory.adjustmentUnitLabel')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {product.units.map((u) => (
              <FilterChip
                key={u.id}
                label={getLocalizedUnitName(u, language)}
                selected={selectedUnit?.unitId === u.unitId}
                onPress={() => setSelectedUnitId(u.unitId)}
              />
            ))}
          </View>
        </View>

        <NumericInput
          label={
            adjustmentType === 'COUNT_ADJUST' && countMode === 'PHYSICAL'
              ? t('inventory.countedQtyLabel')
              : t('inventory.quantityLabel')
          }
          placeholder={digitStyle === 'bn' ? '৫' : '5'}
          value={qtyRaw}
          onChangeNormalized={(ascii, raw) => {
            setQtyAscii(ascii);
            setQtyRaw(raw);
          }}
        />

        {/* Quick Quantity Presets */}
        <View style={{ gap: 6 }}>
          <AppText variant="caption" color={Colors.textMuted}>
            {t('inventory.quickPresetsLabel')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {presets.map((presetAscii) => {
              const display = digitStyle === 'bn' ? toBanglaDigits(presetAscii) : presetAscii;
              return (
                <FilterChip
                  key={presetAscii}
                  label={display}
                  selected={qtyAscii === presetAscii}
                  onPress={() => {
                    setQtyAscii(presetAscii);
                    setQtyRaw(display);
                  }}
                />
              );
            })}
          </View>
        </View>

        <Input
          label={t('inventory.reasonLabel')}
          placeholder={t('inventory.reasonPlaceholder')}
          value={reason}
          onChangeText={setReason}
        />

        {preview ? (
          <Card style={{ backgroundColor: Colors.background, gap: 6, padding: 12 }}>
            <AppText variant="body" weight="semibold" color={Colors.primaryPressed}>
              {t('inventory.afterStockPreview', {
                value: `${formatQuantityWithDigits(preview.nextBase, digitStyle)} ${baseUnitName}`,
              })}
            </AppText>
            {preview.estimatedLossPoisha > 0 ? (
              <AppText variant="body" weight="bold" color={Colors.danger}>
                {t('inventory.estimatedLossLabel')}: {formatMoney(preview.estimatedLossPoisha)}
              </AppText>
            ) : null}
          </Card>
        ) : null}
      </Card>

      <Button
        label={t('inventory.submitAdjustButton')}
        variant={adjustmentType === 'COUNT_ADJUST' ? 'primary' : 'danger'}
        fullWidth
        loading={adjustMutation.isPending}
        onPress={handleOpenConfirm}
      />

      <ConfirmDialog
        visible={confirmVisible}
        title={t('inventory.confirmAdjustTitle')}
        message={t('inventory.confirmAdjustMessage', { product: productName })}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        destructive={adjustmentType !== 'COUNT_ADJUST'}
        loading={adjustMutation.isPending}
        onCancel={() => setConfirmVisible(false)}
        onConfirm={() => void handleSubmitConfirmed()}
      />
    </ScreenContainer>
  );
}
