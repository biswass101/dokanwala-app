import {
  compareQuantities,
  normalizeUnicodeText,
  type CategoryDto,
  type ProductDto,
  type ProductUnitDto,
  type UnitDto,
} from '@dokanwala/shared';
import { getLocalDatabase } from '../sqlite';
import type { SqliteDatabaseAdapter } from '../sqlite.types';

interface CategoryRow {
  id: string;
  shop_id: string;
  name_bn: string;
  name_en: string | null;
  sort_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface UnitRow {
  id: string;
  shop_id: string;
  code: string;
  name_bn: string;
  name_en: string;
  is_fractional: number;
  is_default: number;
  created_at: string;
  updated_at: string;
}

interface ProductRow {
  id: string;
  shop_id: string;
  category_id: string | null;
  category_name_bn: string | null;
  category_name_en: string | null;
  name_bn: string;
  name_en: string | null;
  barcode: string | null;
  image_url: string | null;
  default_supplier_name: string | null;
  base_unit_id: string;
  base_unit_code: string;
  base_unit_name_bn: string;
  base_unit_name_en: string;
  default_sale_unit_id: string;
  default_purchase_unit_id: string;
  base_selling_price_poisha: number;
  last_purchase_price_poisha: number | null;
  low_stock_threshold_base: string;
  is_low_stock: number;
  is_active: number;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ProductUnitRow {
  id: string;
  product_id: string;
  unit_id: string;
  unit_code: string;
  unit_name_bn: string;
  unit_name_en: string;
  is_fractional: number;
  conversion_factor_to_base: string;
  selling_price_poisha: number | null;
  is_base_unit: number;
  is_default_sale_unit: number;
  is_default_purchase_unit: number;
}

interface InventoryBalanceRow {
  product_id: string;
  shop_id: string;
  qty_base: string;
  avg_cost_per_base_bdt: string | null;
  valuation_poisha: number | null;
  version: number;
  updated_at: string;
}

async function writeSingleProduct(db: SqliteDatabaseAdapter, product: ProductDto): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO products_local (
      id, shop_id, category_id, category_name_bn, category_name_en,
      name_bn, name_en, barcode, image_url, default_supplier_name,
      base_unit_id, base_unit_code, base_unit_name_bn, base_unit_name_en,
      default_sale_unit_id, default_purchase_unit_id, base_selling_price_poisha,
      last_purchase_price_poisha, low_stock_threshold_base, is_low_stock,
      is_active, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    product.id,
    product.shopId,
    product.categoryId,
    product.categoryNameBn,
    product.categoryNameEn,
    product.nameBn,
    product.nameEn,
    product.barcode,
    product.imageUrl,
    product.defaultSupplierName,
    product.baseUnitId,
    product.baseUnitCode,
    product.baseUnitNameBn,
    product.baseUnitNameEn,
    product.defaultSaleUnitId,
    product.defaultPurchaseUnitId,
    product.baseSellingPricePoisha,
    product.lastPurchasePricePoisha,
    product.lowStockThresholdBase,
    product.isLowStock ? 1 : 0,
    product.isActive ? 1 : 0,
    product.version,
    product.createdAt,
    product.updatedAt,
  );

  await db.runAsync('DELETE FROM product_units_local WHERE product_id = ?', product.id);
  for (const unitRule of product.units) {
    await db.runAsync(
      `INSERT OR REPLACE INTO product_units_local (
        id, product_id, unit_id, unit_code, unit_name_bn, unit_name_en,
        is_fractional, conversion_factor_to_base, selling_price_poisha,
        is_base_unit, is_default_sale_unit, is_default_purchase_unit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      unitRule.id,
      product.id,
      unitRule.unitId,
      unitRule.unitCode,
      unitRule.unitNameBn,
      unitRule.unitNameEn,
      unitRule.isFractional ? 1 : 0,
      unitRule.conversionFactorToBase,
      unitRule.sellingPricePoisha,
      unitRule.isBaseUnit ? 1 : 0,
      unitRule.isDefaultSaleUnit ? 1 : 0,
      unitRule.isDefaultPurchaseUnit ? 1 : 0,
    );
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO inventory_balances_local (
      product_id, shop_id, qty_base, avg_cost_per_base_bdt,
      valuation_poisha, version, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    product.id,
    product.shopId,
    product.inventory.qtyBase,
    product.inventory.avgCostPerBaseBdt,
    product.inventory.valuationPoisha,
    product.inventory.version,
    product.inventory.updatedAt,
  );
}

function hydrateProduct(
  row: ProductRow,
  unitRows: ProductUnitRow[],
  balanceRow: InventoryBalanceRow | undefined,
): ProductDto {
  const units: ProductUnitDto[] = unitRows.map((u) => ({
    id: u.id,
    productId: u.product_id,
    unitId: u.unit_id,
    unitCode: u.unit_code,
    unitNameBn: u.unit_name_bn,
    unitNameEn: u.unit_name_en,
    isFractional: u.is_fractional === 1,
    conversionFactorToBase: u.conversion_factor_to_base,
    sellingPricePoisha: u.selling_price_poisha,
    isBaseUnit: u.is_base_unit === 1,
    isDefaultSaleUnit: u.is_default_sale_unit === 1,
    isDefaultPurchaseUnit: u.is_default_purchase_unit === 1,
  }));

  const qtyBase = balanceRow?.qty_base ?? '0.0000';
  const isLowStock =
    row.is_low_stock === 1 || compareQuantities(qtyBase, row.low_stock_threshold_base) <= 0;

  return {
    id: row.id,
    shopId: row.shop_id,
    categoryId: row.category_id,
    categoryNameBn: row.category_name_bn,
    categoryNameEn: row.category_name_en,
    nameBn: row.name_bn,
    nameEn: row.name_en,
    barcode: row.barcode,
    imageUrl: row.image_url,
    defaultSupplierName: row.default_supplier_name,
    baseUnitId: row.base_unit_id,
    baseUnitCode: row.base_unit_code,
    baseUnitNameBn: row.base_unit_name_bn,
    baseUnitNameEn: row.base_unit_name_en,
    defaultSaleUnitId: row.default_sale_unit_id,
    defaultPurchaseUnitId: row.default_purchase_unit_id,
    baseSellingPricePoisha: row.base_selling_price_poisha,
    lastPurchasePricePoisha: row.last_purchase_price_poisha,
    lowStockThresholdBase: row.low_stock_threshold_base,
    isLowStock,
    isActive: row.is_active === 1,
    version: row.version,
    units,
    inventory: {
      productId: row.id,
      qtyBase,
      avgCostPerBaseBdt: balanceRow?.avg_cost_per_base_bdt ?? null,
      valuationPoisha: balanceRow?.valuation_poisha ?? null,
      version: balanceRow?.version ?? 1,
      updatedAt: balanceRow?.updated_at ?? row.updated_at,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertLocalCategory(cat: CategoryDto): Promise<void> {
  const db = await getLocalDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO categories_local (
      id, shop_id, name_bn, name_en, sort_order, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    cat.id,
    cat.shopId,
    cat.nameBn,
    cat.nameEn,
    cat.sortOrder,
    cat.isActive ? 1 : 0,
    cat.createdAt,
    cat.updatedAt,
  );
}

export async function removeLocalCategory(shopId: string, categoryId: string): Promise<void> {
  const existing = await loadLocalCategories(shopId, true);
  await saveLocalCategories(existing.filter((c) => c.id !== categoryId));
}

export async function upsertLocalUnit(unit: UnitDto): Promise<void> {
  const db = await getLocalDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO units_local (
      id, shop_id, code, name_bn, name_en, is_fractional, is_default, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    unit.id,
    unit.shopId,
    unit.code,
    unit.nameBn,
    unit.nameEn,
    unit.isFractional ? 1 : 0,
    unit.isDefault ? 1 : 0,
    unit.createdAt,
    unit.updatedAt,
  );
}

export async function saveLocalCategories(categories: readonly CategoryDto[]): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM categories_local');
    for (const cat of categories) {
      await db.runAsync(
        `INSERT OR REPLACE INTO categories_local (
          id, shop_id, name_bn, name_en, sort_order, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        cat.id,
        cat.shopId,
        cat.nameBn,
        cat.nameEn,
        cat.sortOrder,
        cat.isActive ? 1 : 0,
        cat.createdAt,
        cat.updatedAt,
      );
    }
  });
}

export async function loadLocalCategories(
  shopId: string,
  includeInactive = false,
): Promise<CategoryDto[]> {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<CategoryRow>(
    'SELECT * FROM categories_local WHERE shop_id = ?',
    shopId,
  );
  return rows
    .filter((row) => includeInactive || row.is_active === 1)
    .sort((a, b) => a.sort_order - b.sort_order || a.name_bn.localeCompare(b.name_bn))
    .map((row) => ({
      id: row.id,
      shopId: row.shop_id,
      nameBn: row.name_bn,
      nameEn: row.name_en,
      sortOrder: row.sort_order,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

export async function saveLocalUnits(units: readonly UnitDto[]): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM units_local');
    for (const unit of units) {
      await db.runAsync(
        `INSERT OR REPLACE INTO units_local (
          id, shop_id, code, name_bn, name_en, is_fractional, is_default, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        unit.id,
        unit.shopId,
        unit.code,
        unit.nameBn,
        unit.nameEn,
        unit.isFractional ? 1 : 0,
        unit.isDefault ? 1 : 0,
        unit.createdAt,
        unit.updatedAt,
      );
    }
  });
}

export async function loadLocalUnits(shopId: string): Promise<UnitDto[]> {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<UnitRow>(
    'SELECT * FROM units_local WHERE shop_id = ?',
    shopId,
  );
  return rows
    .sort((a, b) => b.is_default - a.is_default || a.name_bn.localeCompare(b.name_bn))
    .map((row) => ({
      id: row.id,
      shopId: row.shop_id,
      code: row.code,
      nameBn: row.name_bn,
      nameEn: row.name_en,
      isFractional: row.is_fractional === 1,
      isDefault: row.is_default === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

export async function replaceLocalProducts(products: readonly ProductDto[]): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM product_units_local');
    await db.runAsync('DELETE FROM inventory_balances_local');
    await db.runAsync('DELETE FROM products_local');

    for (const product of products) {
      await writeSingleProduct(db, product);
    }
  });
}

export async function writeSingleProductTx(
  db: SqliteDatabaseAdapter,
  product: ProductDto,
): Promise<void> {
  await writeSingleProduct(db, product);
}

export async function upsertLocalProduct(product: ProductDto): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await writeSingleProduct(db, product);
  });
}

export async function removeLocalProductTx(
  db: SqliteDatabaseAdapter,
  productId: string,
): Promise<void> {
  await db.runAsync('DELETE FROM product_units_local WHERE product_id = ?', productId);
  await db.runAsync('DELETE FROM inventory_balances_local WHERE product_id = ?', productId);
  await db.runAsync('DELETE FROM products_local WHERE id = ?', productId);
}

export async function removeLocalProduct(productId: string): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await removeLocalProductTx(db, productId);
  });
}

export async function loadLocalProducts(
  shopId: string,
  filters?: {
    q?: string;
    categoryId?: string;
    lowStockOnly?: boolean;
    includeInactive?: boolean;
  },
): Promise<ProductDto[]> {
  const db = await getLocalDatabase();
  const [productRows, unitRows, balanceRows] = await Promise.all([
    db.getAllAsync<ProductRow>('SELECT * FROM products_local WHERE shop_id = ?', shopId),
    db.getAllAsync<ProductUnitRow>('SELECT * FROM product_units_local'),
    db.getAllAsync<InventoryBalanceRow>(
      'SELECT * FROM inventory_balances_local WHERE shop_id = ?',
      shopId,
    ),
  ]);

  const unitsByProduct = new Map<string, ProductUnitRow[]>();
  for (const unitRow of unitRows) {
    const existing = unitsByProduct.get(unitRow.product_id);
    if (existing) {
      existing.push(unitRow);
    } else {
      unitsByProduct.set(unitRow.product_id, [unitRow]);
    }
  }

  const balanceByProduct = new Map<string, InventoryBalanceRow>();
  for (const balRow of balanceRows) {
    balanceByProduct.set(balRow.product_id, balRow);
  }

  const normalizedQuery = filters?.q ? normalizeUnicodeText(filters.q).toLowerCase() : '';

  return productRows
    .map((row) =>
      hydrateProduct(
        row,
        unitsByProduct.get(row.id) ?? [],
        balanceByProduct.get(row.id),
      ),
    )
    .filter((product) => {
      if (!filters?.includeInactive && !product.isActive) return false;
      if (filters?.categoryId && product.categoryId !== filters.categoryId) return false;
      if (filters?.lowStockOnly && !product.isLowStock) return false;
      if (normalizedQuery.length > 0) {
        const matchBn = normalizeUnicodeText(product.nameBn).toLowerCase().includes(normalizedQuery);
        const matchEn = product.nameEn
          ? normalizeUnicodeText(product.nameEn).toLowerCase().includes(normalizedQuery)
          : false;
        const matchBarcode = product.barcode
          ? product.barcode.toLowerCase().includes(normalizedQuery)
          : false;
        if (!matchBn && !matchEn && !matchBarcode) return false;
      }
      return true;
    })
    .sort((a, b) => a.nameBn.localeCompare(b.nameBn));
}

export async function loadLocalProductById(productId: string): Promise<ProductDto | null> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<ProductRow>(
    'SELECT * FROM products_local WHERE id = ? LIMIT 1',
    productId,
  );
  if (!row) {
    return null;
  }

  const [unitRows, balanceRow] = await Promise.all([
    db.getAllAsync<ProductUnitRow>(
      'SELECT * FROM product_units_local WHERE product_id = ?',
      productId,
    ),
    db.getFirstAsync<InventoryBalanceRow>(
      'SELECT * FROM inventory_balances_local WHERE product_id = ? LIMIT 1',
      productId,
    ),
  ]);

  return hydrateProduct(row, unitRows, balanceRow ?? undefined);
}

export async function clearLocalCatalogData(): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM product_units_local');
    await db.runAsync('DELETE FROM inventory_balances_local');
    await db.runAsync('DELETE FROM products_local');
    await db.runAsync('DELETE FROM categories_local');
    await db.runAsync('DELETE FROM units_local');
  });
}
