import { compareQuantities, type ProductDto } from '@dokanwala/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { useCategoriesQuery, useProductsQuery } from '@/features/products/hooks/useCatalogQueries';
import {
  findPreferredDisplayUnit,
  formatProductStockDisplay,
  getEffectiveUnitSellingPricePoisha,
  getLocalizedCategoryName,
  getLocalizedProductName,
  getLocalizedUnitName,
} from '@/features/products/utils/catalog-format';
import { CartItemRow } from '@/features/sales/components/CartItemRow';
import { CheckoutModal } from '@/features/sales/components/CheckoutModal';
import { CustomerPickerModal } from '@/features/sales/components/CustomerPickerModal';
import { QuickSaleForm } from '@/features/sales/components/QuickSaleForm';
import { useFrequentSoldProductIdsQuery } from '@/features/sales/hooks/useSalesQueries';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { computeCartSummary, useCartStore } from '@/store/cart.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

export default function SalesPosScreen() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();

  const shop = useAuthStore((s) => s.shop);
  const allowNegativeStock = Boolean(shop?.allowNegativeStock);

  const [saleMode, setSaleMode] = useState<'catalog' | 'quick'>(
    params.mode === 'quick' ? 'quick' : 'catalog',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

  const items = useCartStore((s) => s.items);
  const discountType = useCartStore((s) => s.discountType);
  const discountAscii = useCartStore((s) => s.discountAscii);
  const selectedCustomer = useCartStore((s) => s.selectedCustomer);
  const addProduct = useCartStore((s) => s.addProduct);
  const setLineQty = useCartStore((s) => s.setLineQty);
  const stepLineQty = useCartStore((s) => s.stepLineQty);
  const changeLineUnit = useCartStore((s) => s.changeLineUnit);
  const removeLine = useCartStore((s) => s.removeLine);
  const setSelectedCustomer = useCartStore((s) => s.setSelectedCustomer);
  const clearCart = useCartStore((s) => s.clearCart);

  const categoriesQuery = useCategoriesQuery(false);
  const productsQuery = useProductsQuery({
    ...(searchQuery.trim().length > 0 ? { q: searchQuery.trim() } : {}),
    ...(selectedCategoryId ? { categoryId: selectedCategoryId } : {}),
  });
  const frequentIdsQuery = useFrequentSoldProductIdsQuery();

  const categories = categoriesQuery.data?.categories ?? [];
  const products = useMemo(
    () => productsQuery.data?.products ?? [],
    [productsQuery.data?.products],
  );
  const fromOfflineCache =
    Boolean(productsQuery.data?.fromOfflineCache) ||
    Boolean(categoriesQuery.data?.fromOfflineCache);

  // Merge freshest loaded stock/pricing into cart lines on render without side-effect loops
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const frequentProducts = useMemo(() => {
    const ids = frequentIdsQuery.data ?? [];
    const matched: ProductDto[] = [];
    for (const id of ids) {
      const p = productById.get(id);
      if (p) matched.push(p);
    }
    return matched;
  }, [frequentIdsQuery.data, productById]);
  const hydratedCartItems = useMemo(
    () =>
      items.map((line) => {
        const fresh = productById.get(line.productId);
        return fresh ? { ...line, product: fresh } : line;
      }),
    [items, productById],
  );

  const summary = useMemo(
    () => computeCartSummary(hydratedCartItems, discountType, discountAscii),
    [hydratedCartItems, discountType, discountAscii],
  );

  const handleTapProduct = (product: ProductDto, explicitUnitId?: string) => {
    addProduct(product, digitStyle, explicitUnitId);
  };

  return (
    <ScreenContainer>
      {/* Header */}
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
            {t('pos.title')}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SyncStatusPill />
          <Button
            label={t('pos.historyButton')}
            variant="outline"
            onPress={() => router.push('/sales/history')}
          />
        </View>
      </View>

      {fromOfflineCache ? (
        <Card style={{ backgroundColor: Colors.warningSoft, borderColor: '#FDE68A', padding: 10 }}>
          <AppText variant="caption" weight="semibold" color={Colors.warning}>
            {t('common.offlineCachedBadge')}
          </AppText>
        </Card>
      ) : null}

      {/* Sale Mode Switcher */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: '#F1F5F9',
          borderRadius: 10,
          padding: 3,
          gap: 4,
        }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => setSaleMode('catalog')}
          style={{
            flex: 1,
            paddingVertical: 7,
            alignItems: 'center',
            borderRadius: 8,
            backgroundColor: saleMode === 'catalog' ? Colors.surface : 'transparent',
          }}
        >
          <AppText
            variant="body"
            weight={saleMode === 'catalog' ? 'bold' : 'regular'}
            color={saleMode === 'catalog' ? Colors.primary : Colors.textSecondary}
          >
            {t('pos.modes.catalog', { defaultValue: 'পণ্য তালিকা বিক্রি' })}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSaleMode('quick')}
          style={{
            flex: 1,
            paddingVertical: 7,
            alignItems: 'center',
            borderRadius: 8,
            backgroundColor: saleMode === 'quick' ? Colors.surface : 'transparent',
          }}
        >
          <AppText
            variant="body"
            weight={saleMode === 'quick' ? 'bold' : 'regular'}
            color={saleMode === 'quick' ? Colors.primary : Colors.textSecondary}
          >
            {t('pos.modes.quick', { defaultValue: '⚡ সরাসরি / দৈনিক বিক্রি' })}
          </AppText>
        </Pressable>
      </View>

      {saleMode === 'quick' ? (
        <QuickSaleForm />
      ) : (
        <>
          {/* Bilingual Search & Category Chips */}
          <Input
            placeholder={t('pos.searchPlaceholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            accessibilityLabel={t('pos.searchPlaceholder')}
          />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
      >
        <FilterChip
          label={t('products.allCategories')}
          selected={!selectedCategoryId}
          onPress={() => setSelectedCategoryId(undefined)}
        />
        {categories.map((cat) => (
          <FilterChip
            key={cat.id}
            label={getLocalizedCategoryName(cat, language) ?? cat.nameBn}
            selected={selectedCategoryId === cat.id}
            onPress={() => setSelectedCategoryId((prev) => (prev === cat.id ? undefined : cat.id))}
          />
        ))}
      </ScrollView>

      {/* Frequent / Quick-Tap Products (from recent sales) */}
      {frequentProducts.length > 0 ? (
        <View style={{ gap: 6 }}>
          <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
            {t('pos.frequentItemsTitle')}
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
          >
            {frequentProducts.map((fp) => (
              <FilterChip
                key={`freq-${fp.id}`}
                label={`+ ${getLocalizedProductName(fp, language)}`}
                selected={false}
                tone="primary"
                onPress={() => handleTapProduct(fp)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Product Tap Grid / List */}
      {productsQuery.isLoading ? (
        <LoadingView />
      ) : productsQuery.isError ? (
        <ErrorState
          message={getLocalizedErrorMessage(productsQuery.error, t)}
          onRetry={() => void productsQuery.refetch()}
        />
      ) : products.length === 0 ? (
        <EmptyState
          icon="cube-outline"
          title={t('pos.emptyProductsTitle')}
          description={t('pos.emptyProductsDesc')}
        />
      ) : (
        <View style={{ gap: 8 }}>
          {products.map((product) => {
            const name = getLocalizedProductName(product, language);
            const unit = findPreferredDisplayUnit(product);
            const pricePoisha = unit
              ? getEffectiveUnitSellingPricePoisha(product, unit)
              : product.baseSellingPricePoisha;
            const unitLabel = unit
              ? getLocalizedUnitName(unit, language)
              : getLocalizedUnitName(
                  { nameBn: product.baseUnitNameBn, nameEn: product.baseUnitNameEn },
                  language,
                );
            const isOutOfStock = compareQuantities(product.inventory.qtyBase, '0') <= 0;
            const stockDisplay = formatProductStockDisplay(product, language, digitStyle);

            return (
              <Pressable
                key={product.id}
                accessibilityRole="button"
                testID={`pos-product-${product.id}`}
                onPress={() => handleTapProduct(product)}
              >
                <Card
                  style={{
                    padding: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    opacity: isOutOfStock && !allowNegativeStock ? 0.65 : 1,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="body" weight="bold">
                      {name}
                    </AppText>
                    <AppText variant="caption" color={Colors.textSecondary}>
                      {t('products.stockLabel')}: {stockDisplay}
                    </AppText>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <AppText variant="body" weight="bold" color={Colors.primary}>
                      {formatMoney(pricePoisha)} / {unitLabel}
                    </AppText>
                    {isOutOfStock ? (
                      <Badge label={t('pos.outOfStockTag')} tone="danger" />
                    ) : (
                      <Badge label={t('pos.addTapHint')} tone="primary" />
                    )}
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Cart & Customer Bar */}
      <Card style={{ gap: 10, backgroundColor: Colors.background }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppText variant="sectionTitle" weight="bold">
              {t('pos.cartTitle')}
            </AppText>
            <Badge
              label={t('pos.cartItemsCount', { count: formatDigits(hydratedCartItems.length) })}
              tone="primary"
            />
          </View>
          {hydratedCartItems.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={clearCart}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <AppText variant="caption" weight="semibold" color={Colors.danger}>
                {t('pos.clearCart')}
              </AppText>
            </Pressable>
          ) : null}
        </View>

        {/* Quick Customer Strip */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: Colors.surface,
            padding: 10,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: Colors.border,
            gap: 8,
          }}
        >
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color={Colors.textMuted}>
              {t('pos.customerLabel')}
            </AppText>
            <AppText variant="body" weight="semibold">
              {selectedCustomer
                ? language === 'en' && selectedCustomer.nameEn
                  ? selectedCustomer.nameEn
                  : selectedCustomer.nameBn
                : t('pos.walkInCustomer')}
            </AppText>
          </View>
          <Button
            label={selectedCustomer ? t('pos.changeCustomer') : t('pos.selectCustomer')}
            variant="outline"
            onPress={() => setCustomerPickerOpen(true)}
          />
        </View>

        {hydratedCartItems.length === 0 ? (
          <AppText variant="body" color={Colors.textSecondary}>
            {t('pos.emptyCart')}
          </AppText>
        ) : (
          <View style={{ gap: 10 }}>
            {hydratedCartItems.map((line) => (
              <CartItemRow
                key={line.lineKey}
                line={line}
                totalRequestedBaseForProduct={summary.requestedBaseByProduct[line.productId] ?? '0'}
                allowNegativeStock={allowNegativeStock}
                onChangeQty={(ascii, raw) => setLineQty(line.lineKey, ascii, raw)}
                onStepQty={(delta) => stepLineQty(line.lineKey, delta, digitStyle)}
                onChangeUnit={(newUnitId) => changeLineUnit(line.lineKey, newUnitId, digitStyle)}
                onAddOtherUnit={(unitId) => handleTapProduct(line.product, unitId)}
                onRemove={() => removeLine(line.lineKey)}
              />
            ))}

            {/* Totals Bar & Checkout CTA */}
            <Card style={{ gap: 8, backgroundColor: Colors.surface }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="body" color={Colors.textSecondary}>
                  {t('sales.subtotal')}
                </AppText>
                <AppText variant="body" weight="semibold">
                  {formatMoney(summary.subtotalPoisha)}
                </AppText>
              </View>
              {summary.discountPoisha > 0 ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="body" color={Colors.textSecondary}>
                    {t('sales.discount')}
                  </AppText>
                  <AppText variant="body" weight="semibold" color={Colors.danger}>
                    -{formatMoney(summary.discountPoisha)}
                  </AppText>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="sectionTitle" weight="bold">
                  {t('sales.netTotal')}
                </AppText>
                <AppText variant="sectionTitle" weight="bold" color={Colors.primary}>
                  {formatMoney(summary.totalPoisha)}
                </AppText>
              </View>

              <Button
                label={t('pos.checkoutButton', { total: formatMoney(summary.totalPoisha) })}
                fullWidth
                disabled={!summary.hasValidQuantities}
                onPress={() => setCheckoutOpen(true)}
              />
            </Card>
          </View>
        )}
      </Card>
      </>
      )}

      <CustomerPickerModal
        visible={customerPickerOpen}
        selectedCustomerId={selectedCustomer?.id}
        onSelect={setSelectedCustomer}
        onClose={() => setCustomerPickerOpen(false)}
      />

      <CheckoutModal
        visible={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onCompleted={(saleId) => router.push({ pathname: '/sales/receipt', params: { saleId } })}
      />
    </ScreenContainer>
  );
}
