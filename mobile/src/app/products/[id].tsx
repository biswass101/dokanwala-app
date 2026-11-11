import { bdtToPoisha, compareQuantities } from '@dokanwala/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingView,
  ScreenContainer,
} from '@/components';
import {
  useArchiveProductMutation,
  useMovementsQuery,
  useProductDetailQuery,
} from '@/features/products/hooks/useCatalogQueries';
import {
  formatProductStockDisplay,
  formatQuantityWithDigits,
  getEffectiveUnitSellingPricePoisha,
  getLocalizedCategoryName,
  getLocalizedProductName,
  getLocalizedUnitName,
  getMovementTypeBadge,
} from '@/features/products/utils/catalog-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export default function ProductDetailScreen() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney } = useFormattedMoney();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const productId = typeof params.id === 'string' ? params.id : undefined;

  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === 'OWNER';

  const detailQuery = useProductDetailQuery(productId);
  const movementsQuery = useMovementsQuery(productId ? { productId } : undefined);
  const archiveMutation = useArchiveProductMutation();

  const [confirmArchiveVisible, setConfirmArchiveVisible] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (detailQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingView />
      </ScreenContainer>
    );
  }

  if (detailQuery.isError || !detailQuery.data?.product) {
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

  const product = detailQuery.data.product;
  const fromOfflineCache = detailQuery.data.fromOfflineCache;
  const primaryName = getLocalizedProductName(product, language);
  const categoryLabel = getLocalizedCategoryName(product, language) ?? t('products.uncategorized');
  const baseUnitName = getLocalizedUnitName(
    { nameBn: product.baseUnitNameBn, nameEn: product.baseUnitNameEn },
    language,
  );
  const isOut = compareQuantities(product.inventory.qtyBase, '0') <= 0;

  const handleConfirmArchive = async () => {
    setActionError(null);
    try {
      await archiveMutation.mutateAsync(product.id);
      setConfirmArchiveVisible(false);
      router.back();
    } catch (err) {
      setConfirmArchiveVisible(false);
      setActionError(getLocalizedErrorMessage(err, t));
    }
  };

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {t('products.detailTitle')}
        </AppText>
        <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
      </View>

      {fromOfflineCache ? (
        <Card style={{ backgroundColor: Colors.warningSoft, borderColor: '#FDE68A', padding: 12 }}>
          <AppText variant="caption" weight="semibold" color={Colors.warning}>
            {t('common.offlineCachedBadge')}
          </AppText>
        </Card>
      ) : null}

      {actionError ? (
        <Card style={{ backgroundColor: Colors.dangerSoft, borderColor: '#FECACA' }}>
          <AppText variant="body" color={Colors.danger}>
            {actionError}
          </AppText>
        </Card>
      ) : null}

      {/* Product Identity Card */}
      <Card style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="screenTitle" weight="bold">
              {primaryName}
            </AppText>
            {product.nameEn && language === 'bn' ? (
              <AppText variant="body" color={Colors.textSecondary}>
                {product.nameEn}
              </AppText>
            ) : language === 'en' && product.nameBn !== primaryName ? (
              <AppText variant="body" color={Colors.textSecondary}>
                {product.nameBn}
              </AppText>
            ) : null}
          </View>

          {isOut ? (
            <Badge label={t('products.outOfStockBadge')} tone="danger" />
          ) : product.isLowStock ? (
            <Badge label={t('products.lowStockBadge')} tone="warning" />
          ) : (
            <Badge label={t('products.inStockBadge')} tone="success" />
          )}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          <Badge label={categoryLabel} tone="neutral" />
          {product.barcode ? (
            <Badge label={`${t('products.barcodeLabel')}: ${product.barcode}`} tone="neutral" />
          ) : null}
        </View>

        {product.defaultSupplierName ? (
          <AppText variant="caption" color={Colors.textSecondary}>
            {t('products.supplierLabel')}: {product.defaultSupplierName}
          </AppText>
        ) : null}
      </Card>

      {/* Stock & Costing Card */}
      <Card style={{ gap: 10 }}>
        <AppText variant="sectionTitle" weight="bold">
          {t('products.stockSectionTitle')}
        </AppText>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="body" color={Colors.textSecondary}>
            {t('products.stockLabel')}
          </AppText>
          <AppText variant="sectionTitle" weight="bold" color={Colors.primary}>
            {formatProductStockDisplay(product, language, digitStyle)}
          </AppText>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="body" color={Colors.textSecondary}>
            {t('products.thresholdLabel')}
          </AppText>
          <AppText variant="body" weight="semibold">
            {formatQuantityWithDigits(product.lowStockThresholdBase, digitStyle)} {baseUnitName}
          </AppText>
        </View>

        {isOwner && product.inventory.avgCostPerBaseBdt !== null ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="body" color={Colors.textSecondary}>
                {t('products.avgCostLabel')}
              </AppText>
              <AppText variant="body" weight="semibold">
                {formatMoney(bdtToPoisha(product.inventory.avgCostPerBaseBdt))}{' '}
                {t('products.perUnit', { unit: baseUnitName })}
              </AppText>
            </View>

            {product.lastPurchasePricePoisha !== null ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="body" color={Colors.textSecondary}>
                  {t('products.lastPurchaseLabel')}
                </AppText>
                <AppText variant="body" weight="semibold">
                  {formatMoney(product.lastPurchasePricePoisha)}
                </AppText>
              </View>
            ) : null}

            {product.inventory.valuationPoisha !== null ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="body" color={Colors.textSecondary}>
                  {t('products.valuationLabel')}
                </AppText>
                <AppText variant="sectionTitle" weight="bold" color={Colors.primaryPressed}>
                  {formatMoney(product.inventory.valuationPoisha)}
                </AppText>
              </View>
            ) : null}
          </>
        ) : null}
      </Card>

      {/* Configured Units & Pricing */}
      <Card style={{ gap: 10 }}>
        <AppText variant="sectionTitle" weight="bold">
          {t('products.unitsSectionTitle')}
        </AppText>

        {product.units.map((unitRule) => {
          const unitName = getLocalizedUnitName(unitRule, language);
          const effectivePoisha = getEffectiveUnitSellingPricePoisha(product, unitRule);
          const factorLabel = formatQuantityWithDigits(unitRule.conversionFactorToBase, digitStyle);

          return (
            <View
              key={unitRule.id}
              style={{
                borderTopWidth: 1,
                borderTopColor: Colors.border,
                paddingTop: 10,
                gap: 6,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <AppText variant="body" weight="semibold">
                  {unitName} ({unitRule.unitCode})
                </AppText>
                <AppText variant="sectionTitle" weight="bold" color={Colors.primary}>
                  {formatMoney(effectivePoisha)}
                </AppText>
              </View>
              <AppText variant="caption" color={Colors.textSecondary}>
                {formatQuantityWithDigits('1', digitStyle)} {unitName} = {factorLabel} {baseUnitName}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {unitRule.isBaseUnit ? (
                  <Badge label={t('products.baseUnitLabel').replace(' *', '')} tone="primary" />
                ) : null}
                {unitRule.isDefaultSaleUnit ? (
                  <Badge label={t('products.defaultSaleUnitLabel')} tone="success" />
                ) : null}
                {unitRule.isDefaultPurchaseUnit ? (
                  <Badge label={t('products.defaultPurchaseUnitLabel')} tone="neutral" />
                ) : null}
              </View>
            </View>
          );
        })}
      </Card>

      {/* Owner Actions */}
      {isOwner ? (
        <View style={{ gap: 10 }}>
          <Button
            label={t('products.adjustStockButton')}
            fullWidth
            onPress={() => router.push(`/inventory/adjust?productId=${product.id}`)}
          />
          <Button
            label={t('products.editButton')}
            variant="secondary"
            fullWidth
            onPress={() => router.push(`/products/form?productId=${product.id}`)}
          />
          <Button
            label={t('products.archiveButton')}
            variant="danger"
            fullWidth
            onPress={() => setConfirmArchiveVisible(true)}
          />
        </View>
      ) : null}

      {/* Product Movements Feed */}
      <Card style={{ gap: 10 }}>
        <AppText variant="sectionTitle" weight="bold">
          {t('products.movementsSectionTitle')}
        </AppText>

        {movementsQuery.isLoading ? (
          <LoadingView />
        ) : movementsQuery.isError ? (
          <AppText variant="caption" color={Colors.textMuted}>
            {getLocalizedErrorMessage(movementsQuery.error, t)}
          </AppText>
        ) : (movementsQuery.data?.movements.length ?? 0) === 0 ? (
          <EmptyState title={t('products.noMovements')} />
        ) : (
          <View style={{ gap: 8 }}>
            {movementsQuery.data?.movements.slice(0, 15).map((mov) => {
              const badge = getMovementTypeBadge(mov.movementType, t);
              const isNegative = mov.deltaQtyBase.startsWith('-');
              const deltaDisplay = `${isNegative ? '' : '+'}${formatQuantityWithDigits(
                mov.deltaQtyBase,
                digitStyle,
              )} ${baseUnitName}`;
              const balanceDisplay = `${formatQuantityWithDigits(
                mov.balanceAfterBase,
                digitStyle,
              )} ${baseUnitName}`;

              return (
                <View
                  key={mov.id}
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: Colors.border,
                    paddingTop: 10,
                    gap: 4,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Badge label={badge.label} tone={badge.tone} />
                    <AppText
                      variant="body"
                      weight="bold"
                      color={isNegative ? Colors.danger : Colors.success}
                    >
                      {deltaDisplay}
                    </AppText>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <AppText variant="caption" color={Colors.textSecondary}>
                      {t('products.stockLabel')}: {balanceDisplay}
                    </AppText>
                    {isOwner && mov.valuePoisha !== null ? (
                      <AppText variant="caption" weight="semibold" color={Colors.textPrimary}>
                        {formatMoney(mov.valuePoisha)}
                      </AppText>
                    ) : null}
                  </View>

                  {mov.reason ? (
                    <AppText variant="caption" color={Colors.textMuted}>
                      {mov.reason}
                    </AppText>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </Card>

      <ConfirmDialog
        visible={confirmArchiveVisible}
        title={t('products.archiveConfirmTitle')}
        message={t('products.archiveConfirmMessage')}
        confirmLabel={t('products.archiveConfirmButton')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={archiveMutation.isPending}
        onCancel={() => setConfirmArchiveVisible(false)}
        onConfirm={() => void handleConfirmArchive()}
      />
    </ScreenContainer>
  );
}
