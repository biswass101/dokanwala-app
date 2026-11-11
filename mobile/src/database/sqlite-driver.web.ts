import type { SqliteBindValue, SqliteDatabaseAdapter } from './sqlite.types';

function createInMemoryWebFallback(): SqliteDatabaseAdapter {
  const store = new Map<string, string>();
  const shops = new Map<string, Record<string, unknown>>();
  const users = new Map<string, Record<string, unknown>>();
  const categories = new Map<string, Record<string, unknown>>();
  const units = new Map<string, Record<string, unknown>>();
  const products = new Map<string, Record<string, unknown>>();
  const productUnits = new Map<string, Record<string, unknown>>();
  const inventoryBalances = new Map<string, Record<string, unknown>>();
  const customers = new Map<string, Record<string, unknown>>();
  const sales = new Map<string, Record<string, unknown>>();
  const saleItems = new Map<string, Record<string, unknown>>();
  const payments = new Map<string, Record<string, unknown>>();
  const saleReturns = new Map<string, Record<string, unknown>>();
  const saleReturnItems = new Map<string, Record<string, unknown>>();

  return {
    async execAsync() {
      // No-op in web preview fallback
    },
    async runAsync(source: string, ...params: SqliteBindValue[]) {
      const normalized = source.trim().toUpperCase();
      if (normalized.includes('INTO APP_PREFERENCES')) {
        const key = String(params[0] ?? '');
        const value = String(params[1] ?? '');
        store.set(key, value);
      } else if (normalized.includes('INTO SHOPS_LOCAL')) {
        shops.set(String(params[0] ?? ''), {
          id: params[0],
          name_bn: params[1],
          name_en: params[2],
          address_bn: params[3],
          address_en: params[4],
          phone: params[5],
          logo_url: params[6],
          currency_code: params[7],
          timezone: params[8],
          default_language: params[9],
          default_digit_style: params[10],
          receipt_header_bn: params[11],
          receipt_footer_bn: params[12],
          allow_negative_stock: params[13],
          employee_can_give_credit: params[14],
          employee_max_discount_percent: params[15],
          is_active: params[16],
          created_at: params[17],
          updated_at: params[18],
        });
      } else if (normalized.includes('INTO USERS_LOCAL')) {
        users.set(String(params[0] ?? ''), {
          id: params[0],
          shop_id: params[1],
          name: params[2],
          phone: params[3],
          role: params[4],
          has_pin: params[5],
          preferred_language: params[6],
          preferred_digit_style: params[7],
          is_active: params[8],
          created_at: params[9],
        });
      } else if (normalized.includes('INTO CATEGORIES_LOCAL')) {
        categories.set(String(params[0] ?? ''), {
          id: params[0],
          shop_id: params[1],
          name_bn: params[2],
          name_en: params[3],
          sort_order: params[4],
          is_active: params[5],
          created_at: params[6],
          updated_at: params[7],
        });
      } else if (normalized.includes('INTO UNITS_LOCAL')) {
        units.set(String(params[0] ?? ''), {
          id: params[0],
          shop_id: params[1],
          code: params[2],
          name_bn: params[3],
          name_en: params[4],
          is_fractional: params[5],
          is_default: params[6],
          created_at: params[7],
          updated_at: params[8],
        });
      } else if (normalized.includes('INTO PRODUCTS_LOCAL')) {
        products.set(String(params[0] ?? ''), {
          id: params[0],
          shop_id: params[1],
          category_id: params[2],
          category_name_bn: params[3],
          category_name_en: params[4],
          name_bn: params[5],
          name_en: params[6],
          barcode: params[7],
          image_url: params[8],
          default_supplier_name: params[9],
          base_unit_id: params[10],
          base_unit_code: params[11],
          base_unit_name_bn: params[12],
          base_unit_name_en: params[13],
          default_sale_unit_id: params[14],
          default_purchase_unit_id: params[15],
          base_selling_price_poisha: params[16],
          last_purchase_price_poisha: params[17],
          low_stock_threshold_base: params[18],
          is_low_stock: params[19],
          is_active: params[20],
          version: params[21],
          created_at: params[22],
          updated_at: params[23],
        });
      } else if (normalized.includes('INTO PRODUCT_UNITS_LOCAL')) {
        productUnits.set(String(params[0] ?? ''), {
          id: params[0],
          product_id: params[1],
          unit_id: params[2],
          unit_code: params[3],
          unit_name_bn: params[4],
          unit_name_en: params[5],
          is_fractional: params[6],
          conversion_factor_to_base: params[7],
          selling_price_poisha: params[8],
          is_base_unit: params[9],
          is_default_sale_unit: params[10],
          is_default_purchase_unit: params[11],
        });
      } else if (normalized.includes('INTO INVENTORY_BALANCES_LOCAL')) {
        inventoryBalances.set(String(params[0] ?? ''), {
          product_id: params[0],
          shop_id: params[1],
          qty_base: params[2],
          avg_cost_per_base_bdt: params[3],
          valuation_poisha: params[4],
          version: params[5],
          updated_at: params[6],
        });
      } else if (normalized.includes('INTO CUSTOMERS_LOCAL')) {
        customers.set(String(params[0] ?? ''), {
          id: params[0],
          shop_id: params[1],
          name_bn: params[2],
          name_en: params[3],
          phone: params[4],
          address: params[5],
          note: params[6],
          total_purchased_poisha: params[7],
          total_paid_poisha: params[8],
          due_poisha: params[9],
          is_active: params[10],
          version: params[11],
          created_at: params[12],
          updated_at: params[13],
        });
      } else if (normalized.includes('INTO SALES_LOCAL')) {
        sales.set(String(params[0] ?? ''), {
          id: params[0],
          shop_id: params[1],
          receipt_number: params[2],
          customer_id: params[3],
          customer_name_snapshot: params[4],
          status: params[5],
          subtotal_poisha: params[6],
          discount_type: params[7],
          discount_value: params[8],
          discount_poisha: params[9],
          total_poisha: params[10],
          paid_poisha: params[11],
          due_poisha: params[12],
          tendered_poisha: params[13],
          change_poisha: params[14],
          returned_total_poisha: params[15],
          cash_refunded_poisha: params[16],
          cogs_poisha: params[17],
          estimated_profit_poisha: params[18],
          note: params[19],
          actor_user_id: params[20],
          actor_name: params[21],
          cancelled_at: params[22],
          cancel_reason: params[23],
          sold_at: params[24],
          created_at: params[25],
          updated_at: params[26],
        });
      } else if (normalized.includes('INTO SALE_ITEMS_LOCAL')) {
        saleItems.set(String(params[0] ?? ''), {
          id: params[0],
          sale_id: params[1],
          product_id: params[2],
          unit_id: params[3],
          product_name_bn: params[4],
          product_name_en: params[5],
          unit_name_bn: params[6],
          unit_name_en: params[7],
          qty_display: params[8],
          conversion_factor_to_base: params[9],
          qty_base: params[10],
          returned_qty_base: params[11],
          unit_selling_price_poisha: params[12],
          unit_cost_at_sale_bdt: params[13],
          line_subtotal_poisha: params[14],
          line_cogs_poisha: params[15],
        });
      } else if (normalized.includes('INTO PAYMENTS_LOCAL')) {
        payments.set(String(params[0] ?? ''), {
          id: params[0],
          sale_id: params[1],
          method: params[2],
          amount_poisha: params[3],
          reference: params[4],
          received_at: params[5],
        });
      } else if (normalized.includes('INTO SALE_RETURNS_LOCAL')) {
        saleReturns.set(String(params[0] ?? ''), {
          id: params[0],
          sale_id: params[1],
          return_number: params[2],
          refund_method: params[3],
          subtotal_poisha: params[4],
          discount_adjustment_poisha: params[5],
          refund_total_poisha: params[6],
          cash_refund_poisha: params[7],
          credit_adjusted_poisha: params[8],
          reason: params[9],
          actor_user_id: params[10],
          actor_name: params[11],
          returned_at: params[12],
        });
      } else if (normalized.includes('INTO SALE_RETURN_ITEMS_LOCAL')) {
        saleReturnItems.set(String(params[0] ?? ''), {
          id: params[0],
          sale_return_id: params[1],
          sale_item_id: params[2],
          product_id: params[3],
          product_name_bn: params[4],
          product_name_en: params[5],
          unit_name_bn: params[6],
          unit_name_en: params[7],
          qty_display: params[8],
          qty_base: params[9],
          unit_selling_price_poisha: params[10],
          line_refund_poisha: params[11],
          restored_cogs_poisha: params[12],
        });
      } else if (normalized.startsWith('DELETE FROM SHOPS_LOCAL')) {
        shops.clear();
      } else if (normalized.startsWith('DELETE FROM USERS_LOCAL')) {
        users.clear();
      } else if (normalized.startsWith('DELETE FROM CATEGORIES_LOCAL')) {
        categories.clear();
      } else if (normalized.startsWith('DELETE FROM UNITS_LOCAL')) {
        units.clear();
      } else if (normalized.startsWith('DELETE FROM PRODUCT_UNITS_LOCAL')) {
        if (normalized.includes('WHERE PRODUCT_ID = ?')) {
          const targetProductId = String(params[0] ?? '');
          for (const [key, row] of productUnits.entries()) {
            if (row.product_id === targetProductId) {
              productUnits.delete(key);
            }
          }
        } else {
          productUnits.clear();
        }
      } else if (normalized.startsWith('DELETE FROM INVENTORY_BALANCES_LOCAL')) {
        if (normalized.includes('WHERE PRODUCT_ID = ?')) {
          inventoryBalances.delete(String(params[0] ?? ''));
        } else {
          inventoryBalances.clear();
        }
      } else if (normalized.startsWith('DELETE FROM PRODUCTS_LOCAL')) {
        if (normalized.includes('WHERE ID = ?')) {
          products.delete(String(params[0] ?? ''));
        } else {
          products.clear();
        }
      } else if (normalized.startsWith('DELETE FROM CUSTOMERS_LOCAL')) {
        customers.clear();
      } else if (normalized.startsWith('DELETE FROM SALE_RETURN_ITEMS_LOCAL')) {
        if (normalized.includes('WHERE SALE_RETURN_ID IN')) {
          const targetSaleId = String(params[0] ?? '');
          const returnIds = new Set(
            Array.from(saleReturns.values())
              .filter((r) => r.sale_id === targetSaleId)
              .map((r) => String(r.id ?? '')),
          );
          for (const [key, row] of saleReturnItems.entries()) {
            if (returnIds.has(String(row.sale_return_id ?? ''))) {
              saleReturnItems.delete(key);
            }
          }
        } else {
          saleReturnItems.clear();
        }
      } else if (normalized.startsWith('DELETE FROM SALE_RETURNS_LOCAL')) {
        if (normalized.includes('WHERE SALE_ID = ?')) {
          const targetSaleId = String(params[0] ?? '');
          for (const [key, row] of saleReturns.entries()) {
            if (row.sale_id === targetSaleId) saleReturns.delete(key);
          }
        } else {
          saleReturns.clear();
        }
      } else if (normalized.startsWith('DELETE FROM PAYMENTS_LOCAL')) {
        if (normalized.includes('WHERE SALE_ID = ?')) {
          const targetSaleId = String(params[0] ?? '');
          for (const [key, row] of payments.entries()) {
            if (row.sale_id === targetSaleId) payments.delete(key);
          }
        } else {
          payments.clear();
        }
      } else if (normalized.startsWith('DELETE FROM SALE_ITEMS_LOCAL')) {
        if (normalized.includes('WHERE SALE_ID = ?')) {
          const targetSaleId = String(params[0] ?? '');
          for (const [key, row] of saleItems.entries()) {
            if (row.sale_id === targetSaleId) saleItems.delete(key);
          }
        } else {
          saleItems.clear();
        }
      } else if (normalized.startsWith('DELETE FROM SALES_LOCAL')) {
        if (normalized.includes('WHERE ID = ?')) {
          sales.delete(String(params[0] ?? ''));
        } else {
          sales.clear();
        }
      }
      return { changes: 1, lastInsertRowId: 1 };
    },
    async getFirstAsync<T>(source: string, ...params: SqliteBindValue[]): Promise<T | null> {
      const normalized = source.trim().toUpperCase();
      if (normalized.includes('FROM APP_PREFERENCES')) {
        const val = store.get(String(params[0] ?? ''));
        return val !== undefined ? ({ value: val } as T) : null;
      }
      if (normalized.includes('FROM SHOPS_LOCAL')) {
        const first = shops.values().next().value;
        return (first as T | undefined) ?? null;
      }
      if (normalized.includes('FROM USERS_LOCAL')) {
        const first = users.values().next().value;
        return (first as T | undefined) ?? null;
      }
      if (normalized.includes('FROM PRODUCTS_LOCAL')) {
        if (normalized.includes('WHERE ID = ?')) {
          return (products.get(String(params[0] ?? '')) as T | undefined) ?? null;
        }
        return (products.values().next().value as T | undefined) ?? null;
      }
      if (normalized.includes('FROM INVENTORY_BALANCES_LOCAL')) {
        if (normalized.includes('WHERE PRODUCT_ID = ?')) {
          return (inventoryBalances.get(String(params[0] ?? '')) as T | undefined) ?? null;
        }
        return (inventoryBalances.values().next().value as T | undefined) ?? null;
      }
      if (normalized.includes('FROM SALES_LOCAL')) {
        if (normalized.includes('WHERE ID = ?')) {
          return (sales.get(String(params[0] ?? '')) as T | undefined) ?? null;
        }
        return (sales.values().next().value as T | undefined) ?? null;
      }
      return null;
    },
    async getAllAsync<T>(source: string, ...params: SqliteBindValue[]): Promise<T[]> {
      const normalized = source.trim().toUpperCase();
      if (normalized.includes('FROM CATEGORIES_LOCAL')) {
        const shopFilter = normalized.includes('WHERE SHOP_ID = ?') ? String(params[0] ?? '') : null;
        return Array.from(categories.values()).filter(
          (row) => !shopFilter || row.shop_id === shopFilter,
        ) as T[];
      }
      if (normalized.includes('FROM UNITS_LOCAL')) {
        const shopFilter = normalized.includes('WHERE SHOP_ID = ?') ? String(params[0] ?? '') : null;
        return Array.from(units.values()).filter(
          (row) => !shopFilter || row.shop_id === shopFilter,
        ) as T[];
      }
      if (normalized.includes('FROM PRODUCTS_LOCAL')) {
        const shopFilter = normalized.includes('WHERE SHOP_ID = ?') ? String(params[0] ?? '') : null;
        return Array.from(products.values()).filter(
          (row) => !shopFilter || row.shop_id === shopFilter,
        ) as T[];
      }
      if (normalized.includes('FROM PRODUCT_UNITS_LOCAL')) {
        if (normalized.includes('WHERE PRODUCT_ID = ?')) {
          const targetProductId = String(params[0] ?? '');
          return Array.from(productUnits.values()).filter(
            (row) => row.product_id === targetProductId,
          ) as T[];
        }
        return Array.from(productUnits.values()) as T[];
      }
      if (normalized.includes('FROM INVENTORY_BALANCES_LOCAL')) {
        const shopFilter = normalized.includes('WHERE SHOP_ID = ?') ? String(params[0] ?? '') : null;
        return Array.from(inventoryBalances.values()).filter(
          (row) => !shopFilter || row.shop_id === shopFilter,
        ) as T[];
      }
      if (normalized.includes('FROM CUSTOMERS_LOCAL')) {
        const shopFilter = normalized.includes('WHERE SHOP_ID = ?') ? String(params[0] ?? '') : null;
        return Array.from(customers.values()).filter(
          (row) => !shopFilter || row.shop_id === shopFilter,
        ) as T[];
      }
      if (normalized.includes('FROM SALES_LOCAL')) {
        const shopFilter = normalized.includes('WHERE SHOP_ID = ?') ? String(params[0] ?? '') : null;
        return Array.from(sales.values()).filter(
          (row) => !shopFilter || row.shop_id === shopFilter,
        ) as T[];
      }
      if (normalized.includes('FROM SALE_ITEMS_LOCAL')) {
        if (normalized.includes('WHERE SALE_ID = ?')) {
          const targetSaleId = String(params[0] ?? '');
          return Array.from(saleItems.values()).filter((r) => r.sale_id === targetSaleId) as T[];
        }
        return Array.from(saleItems.values()) as T[];
      }
      if (normalized.includes('FROM PAYMENTS_LOCAL')) {
        if (normalized.includes('WHERE SALE_ID = ?')) {
          const targetSaleId = String(params[0] ?? '');
          return Array.from(payments.values()).filter((r) => r.sale_id === targetSaleId) as T[];
        }
        return Array.from(payments.values()) as T[];
      }
      if (normalized.includes('FROM SALE_RETURNS_LOCAL')) {
        if (normalized.includes('WHERE SALE_ID = ?')) {
          const targetSaleId = String(params[0] ?? '');
          return Array.from(saleReturns.values()).filter((r) => r.sale_id === targetSaleId) as T[];
        }
        return Array.from(saleReturns.values()) as T[];
      }
      if (normalized.includes('FROM SALE_RETURN_ITEMS_LOCAL')) {
        if (normalized.includes('WHERE SALE_RETURN_ID = ?')) {
          const retId = String(params[0] ?? '');
          return Array.from(saleReturnItems.values()).filter((r) => r.sale_return_id === retId) as T[];
        }
        return Array.from(saleReturnItems.values()) as T[];
      }
      return [] as T[];
    },
    async withTransactionAsync(task: () => Promise<void>) {
      await task();
    },
  };
}

export async function openPlatformSqliteDatabase(): Promise<SqliteDatabaseAdapter> {
  // Minimal web preview fallback; native iOS/Android execute real Expo SQLite via sqlite-driver.ts
  return createInMemoryWebFallback();
}
