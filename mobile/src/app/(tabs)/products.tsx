import { bdtToPoisha, compareQuantities, type ProductDto } from '@dokanwala/shared';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingView,
  ScreenContainer,
  SyncStatusPill,
} from '@/components';
import { FilterChip } from '@/features/products/components/FilterChip';
import {
  useCategoriesQuery,
  useLowStockAlertsQuery,
  useProductsQuery,
} from '@/features/products/hooks/useCatalogQueries';
import {
  findPreferredDisplayUnit,
  formatProductStockDisplay,
  getEffectiveUnitSellingPricePoisha,
  getLocalizedCategoryName,
  getLocalizedProductName,
  getLocalizedUnitName,
} from '@/features/products/utils/catalog-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export default function ProductsScreen() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isOwner = user?.role === 'OWNER';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const categoriesQuery = useCategoriesQuery(false);
  const lowStockQuery = useLowStockAlertsQuery();
  const productsQuery = useProductsQuery({
    q: searchQuery,
    ...(selectedCategoryId ? { categoryId: selectedCategoryId } : {}),
    lowStockOnly,
  });

  const categories = categoriesQuery.data?.categories ?? [];
  const products = productsQuery.data?.products ?? [];
  const lowStockCount = lowStockQuery.data?.products.length ?? 0;
  const fromOfflineCache =
    Boolean(productsQuery.data?.fromOfflineCache) ||
    Boolean(categoriesQuery.data?.fromOfflineCache);

  const hasActiveFilter = useMemo(
    () => searchQuery.trim().length > 0 || Boolean(selectedCategoryId) || lowStockOnly,
    [searchQuery, selectedCategoryId, lowStockOnly],
  );

  const renderStockBadge = (product: ProductDto) => {
    const isOut = compareQuantities(product.inventory.qtyBase, '0') <= 0;
    if (isOut) {
      return <Badge label={t('products.outOfStockBadge')} tone="danger" />;
    }
    if (product.isLowStock) {
      return <Badge label={t('products.lowStockBadge')} tone="warning" />;
    }
    return <Badge label={t('products.inStockBadge')} tone="success" />;
  };

  return (
    <ScreenContainer>
      {/* Header Row */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <View style={{ flex: 1 }}>
          <AppText variant="screenTitle" weight="bold">
            {t('products.title')}
          </AppText>
        </View>
        <SyncStatusPill />
      </View>

      {/* Primary Action Strip */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {isOwner ? (
          <Button
            label={t('products.addButton')}
            onPress={() => router.push('/products/form')}
            style={{ flexGrow: 1 }}
          />
        ) : null}
        <Button
          label={t('products.valuationAndHistory')}
          variant={isOwner ? 'secondary' : 'primary'}
          onPress={() => router.push('/inventory/history')}
          style={{ flexGrow: 1 }}
        />
        {isOwner ? (
          <Button
            label={t('products.manageCategoriesUnits')}
            variant="outline"
            onPress={() => router.push('/categories-units')}
            style={{ flexGrow: 1 }}
          />
        ) : null}
      </View>

      {fromOfflineCache ? (
        <Card style={{ backgroundColor: Colors.warningSoft, borderColor: '#FDE68A', padding: 12 }}>
          <AppText variant="caption" weight="semibold" color={Colors.warning}>
            {t('common.offlineCachedBadge')}
          </AppText>
        </Card>
      ) : null}

      {/* Bilingual Search */}
      <Input
        placeholder={t('common.searchPlaceholder')}
        value={searchQuery}
        onChangeText={setSearchQuery}
        accessibilityLabel={t('common.searchPlaceholder')}
      />

      {/* Category & Low-Stock Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
      >
        <FilterChip
          label={t('products.allCategories')}
          selected={!selectedCategoryId && !lowStockOnly}
          onPress={() => {
            setSelectedCategoryId(undefined);
            setLowStockOnly(false);
          }}
        />
        <FilterChip
          label={t('products.lowStockFilter', { count: formatDigits(lowStockCount) })}
          selected={lowStockOnly}
          tone="warning"
          onPress={() => setLowStockOnly((prev) => !prev)}
        />
        {categories.map((cat) => {
          const catLabel = getLocalizedCategoryName(cat, language) ?? cat.nameBn;
          return (
            <FilterChip
              key={cat.id}
              label={catLabel}
              selected={selectedCategoryId === cat.id}
              onPress={() =>
                setSelectedCategoryId((prev) => (prev === cat.id ? undefined : cat.id))
              }
            />
          );
        })}
      </ScrollView>

      {/* Product List */}
      {productsQuery.isLoading ? (
        <LoadingView />
      ) : productsQuery.isError ? (
        <ErrorState
          message={getLocalizedErrorMessage(productsQuery.error, t)}
          onRetry={() => {
            void productsQuery.refetch();
            void categoriesQuery.refetch();
          }}
        />
      ) : products.length === 0 ? (
        <EmptyState
          icon="cube-outline"
          title={t('products.emptyTitle')}
          description={hasActiveFilter ? t('products.searchEmptyDesc') : t('products.emptyDesc')}
          actionLabel={isOwner && !hasActiveFilter ? t('products.addButton') : undefined}
          onAction={isOwner && !hasActiveFilter ? () => router.push('/products/form') : undefined}
        />
      ) : (
        <View style={{ gap: 10 }}>
          {products.map((product) => {
            const primaryName = getLocalizedProductName(product, language);
            const secondaryName =
              language === 'bn'
                ? product.nameEn
                : product.nameBn !== primaryName
                  ? product.nameBn
                  : null;
            const categoryLabel =
              getLocalizedCategoryName(product, language) ?? t('products.uncategorized');
            const displayUnit = findPreferredDisplayUnit(product);
            const displayPricePoisha = displayUnit
              ? getEffectiveUnitSellingPricePoisha(product, displayUnit)
              : product.baseSellingPricePoisha;
            const displayUnitName = displayUnit
              ? getLocalizedUnitName(displayUnit, language)
              : getLocalizedUnitName(
                  { nameBn: product.baseUnitNameBn, nameEn: product.baseUnitNameEn },
                  language,
                );
            const stockDisplay = formatProductStockDisplay(product, language, digitStyle);

            return (
              <Pressable
                key={product.id}
                accessibilityRole="button"
                testID={`product-card-${product.id}`}
                onPress={() => router.push(`/products/${product.id}`)}
              >
                <Card style={{ gap: 8 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 10,
                    }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="sectionTitle" weight="bold">
                        {primaryName}
                      </AppText>
                      {secondaryName ? (
                        <AppText variant="caption" color={Colors.textSecondary}>
                          {secondaryName}
                        </AppText>
                      ) : null}
                      <AppText variant="caption" color={Colors.textMuted}>
                        {categoryLabel}
                        {product.barcode ? ` • ${product.barcode}` : ''}
                      </AppText>
                    </View>

                    {renderStockBadge(product)}
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderTopWidth: 1,
                      borderTopColor: Colors.border,
                      paddingTop: 8,
                      gap: 8,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText variant="caption" color={Colors.textMuted}>
                        {t('products.stockLabel')}
                      </AppText>
                      <AppText variant="body" weight="semibold" color={Colors.textPrimary}>
                        {stockDisplay}
                      </AppText>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <AppText variant="caption" color={Colors.textMuted}>
                        {t('products.sellingPriceLabel')}
                      </AppText>
                      <AppText variant="sectionTitle" weight="bold" color={Colors.primary}>
                        {formatMoney(displayPricePoisha)}{' '}
                        <AppText variant="caption" color={Colors.textSecondary}>
                          {t('products.perUnit', { unit: displayUnitName })}
                        </AppText>
                      </AppText>
                    </View>
                  </View>

                  {isOwner && product.inventory.valuationPoisha !== null ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <AppText variant="caption" color={Colors.textSecondary}>
                        {t('products.avgCostLabel')}:{' '}
                        {formatMoney(bdtToPoisha(product.inventory.avgCostPerBaseBdt ?? '0'))}
                      </AppText>
                      <AppText variant="caption" color={Colors.textSecondary}>
                        {t('products.valuationLabel')}: {formatMoney(product.inventory.valuationPoisha)}
                      </AppText>
                    </View>
                  ) : null}
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScreenContainer>
  );
}
