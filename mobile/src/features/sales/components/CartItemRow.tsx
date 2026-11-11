import { compareQuantities } from '@dokanwala/shared';
import React from 'react';
import { Pressable, View } from 'react-native';
import { AppText, Card, NumericInput } from '@/components';
import { FilterChip } from '@/features/products/components/FilterChip';
import {
  formatQuantityWithDigits,
  getLocalizedProductName,
  getLocalizedUnitName,
} from '@/features/products/utils/catalog-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import {
  getCartLineSubtotalPoisha,
  getCartLineUnitPricePoisha,
  getCartLineUnitRule,
  type CartLine,
} from '@/store/cart.store';
import { Colors } from '@/theme/tokens';

export interface CartItemRowProps {
  line: CartLine;
  totalRequestedBaseForProduct: string;
  allowNegativeStock: boolean;
  onChangeQty: (qtyAscii: string, qtyRaw: string) => void;
  onStepQty: (delta: number) => void;
  onChangeUnit: (newUnitId: string) => void;
  onAddOtherUnit: (unitId: string) => void;
  onRemove: () => void;
}

export function CartItemRow({
  line,
  totalRequestedBaseForProduct,
  allowNegativeStock,
  onChangeQty,
  onStepQty,
  onChangeUnit,
  onAddOtherUnit,
  onRemove,
}: CartItemRowProps) {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();

  const product = line.product;
  const activeRule = getCartLineUnitRule(line);
  const unitPricePoisha = getCartLineUnitPricePoisha(line);
  const lineSubtotalPoisha = getCartLineSubtotalPoisha(line);

  const productName = getLocalizedProductName(product, language);
  const unitName = activeRule
    ? getLocalizedUnitName(activeRule, language)
    : getLocalizedUnitName(
        { nameBn: product.baseUnitNameBn, nameEn: product.baseUnitNameEn },
        language,
      );

  const exceedsStock =
    !allowNegativeStock &&
    compareQuantities(totalRequestedBaseForProduct || '0', product.inventory.qtyBase) > 0;

  const baseUnitLabel = getLocalizedUnitName(
    { nameBn: product.baseUnitNameBn, nameEn: product.baseUnitNameEn },
    language,
  );

  const presets = (() => {
    const code = activeRule?.unitCode;
    if (code === 'GRAM' || code === 'ML') {
      return ['100', '250', '500'];
    }
    if (activeRule?.isFractional) {
      return ['0.25', '0.5', '1', '2'];
    }
    return ['1', '5', '10'];
  })();

  const alternateUnit = product.units.find((u) => u.unitId !== line.unitId);

  return (
    <Card style={{ gap: 10, padding: 12 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        <View style={{ flex: 1 }}>
          <AppText variant="body" weight="bold">
            {productName}
          </AppText>
          <AppText variant="caption" color={Colors.textSecondary}>
            {formatMoney(unitPricePoisha)} / {unitName}
          </AppText>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <AppText variant="sectionTitle" weight="bold" color={Colors.primary}>
            {formatMoney(lineSubtotalPoisha)}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('pos.removeItem')} ${productName}`}
            onPress={onRemove}
            style={{ paddingVertical: 4, paddingHorizontal: 6 }}
          >
            <AppText variant="caption" weight="semibold" color={Colors.danger}>
              {t('pos.removeItem')}
            </AppText>
          </Pressable>
        </View>
      </View>

      {/* Unit switcher */}
      {product.units.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <AppText variant="caption" color={Colors.textMuted}>
            {t('pos.unitLabel')}
          </AppText>
          {product.units.map((u) => (
            <FilterChip
              key={u.id}
              label={getLocalizedUnitName(u, language)}
              selected={line.unitId === u.unitId}
              onPress={() => onChangeUnit(u.unitId)}
            />
          ))}
          {alternateUnit ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onAddOtherUnit(alternateUnit.unitId)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: Colors.primary,
                backgroundColor: Colors.surface,
              }}
            >
              <AppText variant="caption" weight="semibold" color={Colors.primary}>
                {t('pos.addOtherUnit')}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Quantity Controls */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${productName} (${unitName})`}
          onPress={() => onStepQty(activeRule?.isFractional ? -0.5 : -1)}
          style={{
            minWidth: 44,
            minHeight: 44,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: Colors.border,
            backgroundColor: Colors.background,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppText variant="sectionTitle" weight="bold">
            -
          </AppText>
        </Pressable>

        <View style={{ flex: 1 }}>
          <NumericInput
            value={line.qtyRaw}
            placeholder={digitStyle === 'bn' ? '১' : '1'}
            accessibilityLabel={`${productName} (${unitName}) ${t('pos.qtyLabel')}`}
            onChangeNormalized={onChangeQty}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${productName} (${unitName})`}
          onPress={() => onStepQty(activeRule?.isFractional ? 0.5 : 1)}
          style={{
            minWidth: 44,
            minHeight: 44,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: Colors.primary,
            backgroundColor: Colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppText variant="sectionTitle" weight="bold" color={Colors.primaryPressed}>
            +
          </AppText>
        </Pressable>
      </View>

      {/* Quick Presets */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {presets.map((presetAscii) => {
          const label = `${formatDigits(presetAscii)} ${unitName}`;
          return (
            <FilterChip
              key={presetAscii}
              label={label}
              selected={line.qtyAscii === presetAscii}
              onPress={() => onChangeQty(presetAscii, formatDigits(presetAscii))}
            />
          );
        })}
      </View>

      {exceedsStock ? (
        <AppText variant="caption" weight="semibold" color={Colors.danger}>
          {t('pos.stockExceedsWarning', {
            requested: `${formatQuantityWithDigits(totalRequestedBaseForProduct, digitStyle)} ${baseUnitLabel}`,
            available: `${formatQuantityWithDigits(product.inventory.qtyBase, digitStyle)} ${baseUnitLabel}`,
          })}
        </AppText>
      ) : null}
    </Card>
  );
}
