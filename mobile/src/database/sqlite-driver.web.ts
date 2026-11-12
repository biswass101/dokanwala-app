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
  const suppliers = new Map<string, Record<string, unknown>>();
  const purchases = new Map<string, Record<string, unknown>>();
  const purchaseItems = new Map<string, Record<string, unknown>>();
  const purchaseReturns = new Map<string, Record<string, unknown>>();
  const purchaseReturnItems = new Map<string, Record<string, unknown>>();
  const supplierLedgerEntries = new Map<string, Record<string, unknown>>();
  const customerLedgerEntries = new Map<string, Record<string, unknown>>();
  const expenseCategories = new Map<string, Record<string, unknown>>();
  const expenses = new Map<string, Record<string, unknown>>();
  const expenseAuditLogs = new Map<string, Record<string, unknown>>();
  const cashbookDailyCache = new Map<string, Record<string, unknown>>();
  const reportsSnapshotCache = new Map<string, Record<string, unknown>>();
  const syncOutbox = new Map<string, Record<string, unknown>>();
  const syncState = new Map<string, Record<string, unknown>>();
  const syncEntityFlags = new Map<string, Record<string, unknown>>();

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
          settled_due_poisha: params[12],
          due_poisha: params[13],
          tendered_poisha: params[14],
          change_poisha: params[15],
          returned_total_poisha: params[16],
          cash_refunded_poisha: params[17],
          cogs_poisha: params[18],
          estimated_profit_poisha: params[19],
          note: params[20],
          actor_user_id: params[21],
          actor_name: params[22],
          cancelled_at: params[23],
          cancel_reason: params[24],
          sold_at: params[25],
          created_at: params[26],
          updated_at: params[27],
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
      } else if (normalized.includes('INTO SUPPLIERS_LOCAL')) {
        suppliers.set(String(params[0] ?? ''), {
          id: params[0],
          shop_id: params[1],
          name_bn: params[2],
          name_en: params[3],
          phone: params[4],
          address: params[5],
          note: params[6],
          total_purchased_poisha: params[7],
          total_paid_poisha: params[8],
          payable_poisha: params[9],
          is_active: params[10],
          version: params[11],
          created_at: params[12],
          updated_at: params[13],
        });
      } else if (normalized.includes('INTO PURCHASES_LOCAL')) {
        purchases.set(String(params[0] ?? ''), {
          id: params[0],
          shop_id: params[1],
          purchase_number: params[2],
          supplier_id: params[3],
          supplier_name_snapshot: params[4],
          status: params[5],
          subtotal_poisha: params[6],
          discount_poisha: params[7],
          total_poisha: params[8],
          paid_poisha: params[9],
          settled_due_poisha: params[10],
          due_poisha: params[11],
          payment_method: params[12],
          payment_reference: params[13],
          returned_total_poisha: params[14],
          cash_refunded_poisha: params[15],
          note: params[16],
          actor_user_id: params[17],
          actor_name: params[18],
          purchased_at: params[19],
          created_at: params[20],
          updated_at: params[21],
        });
      } else if (normalized.includes('INTO PURCHASE_ITEMS_LOCAL')) {
        purchaseItems.set(String(params[0] ?? ''), {
          id: params[0],
          purchase_id: params[1],
          product_id: params[2],
          unit_id: params[3],
          product_name_bn: params[4],
          product_name_en: params[5],
          unit_name_bn: params[6],
          unit_name_en: params[7],
          line_order: params[8],
          qty_display: params[9],
          conversion_factor_to_base: params[10],
          qty_base: params[11],
          returned_qty_base: params[12],
          unit_cost_poisha: params[13],
          line_total_poisha: params[14],
          net_cost_poisha: params[15],
        });
      } else if (normalized.includes('INTO PURCHASE_RETURNS_LOCAL')) {
        purchaseReturns.set(String(params[0] ?? ''), {
          id: params[0],
          purchase_id: params[1],
          return_number: params[2],
          refund_method: params[3],
          subtotal_poisha: params[4],
          discount_adjustment_poisha: params[5],
          refund_total_poisha: params[6],
          cash_refund_poisha: params[7],
          payable_adjusted_poisha: params[8],
          reason: params[9],
          actor_user_id: params[10],
          actor_name: params[11],
          returned_at: params[12],
        });
      } else if (normalized.includes('INTO PURCHASE_RETURN_ITEMS_LOCAL')) {
        purchaseReturnItems.set(String(params[0] ?? ''), {
          id: params[0],
          purchase_return_id: params[1],
          purchase_item_id: params[2],
          product_id: params[3],
          product_name_bn: params[4],
          product_name_en: params[5],
          unit_name_bn: params[6],
          unit_name_en: params[7],
          qty_display: params[8],
          qty_base: params[9],
          unit_cost_poisha: params[10],
          line_refund_poisha: params[11],
          reversed_cost_poisha: params[12],
        });
      } else if (normalized.includes('INTO SUPPLIER_LEDGER_ENTRIES_LOCAL')) {
        supplierLedgerEntries.set(String(params[0] ?? ''), {
          id: params[0],
          supplier_id: params[1],
          type: params[2],
          reference_id: params[3],
          reference_number: params[4],
          occurred_at: params[5],
          total_poisha: params[6],
          paid_or_refunded_poisha: params[7],
          payable_delta_poisha: params[8],
          running_payable_poisha: params[9],
          method: params[10],
          note: params[11],
        });
      } else if (normalized.includes('INTO CUSTOMER_LEDGER_ENTRIES_LOCAL')) {
        customerLedgerEntries.set(String(params[0] ?? ''), {
          id: params[0],
          customer_id: params[1],
          type: params[2],
          reference_id: params[3],
          reference_number: params[4],
          occurred_at: params[5],
          total_poisha: params[6],
          paid_or_refunded_poisha: params[7],
          due_delta_poisha: params[8],
          running_due_poisha: params[9],
          method: params[10],
          note: params[11],
        });
      } else if (normalized.includes('INTO EXPENSE_CATEGORIES_LOCAL')) {
        expenseCategories.set(String(params[0] ?? ''), {
          id: params[0],
          shop_id: params[1],
          name_bn: params[2],
          name_en: params[3],
          is_default: params[4],
          sort_order: params[5],
          is_active: params[6],
          version: params[7],
          created_at: params[8],
          updated_at: params[9],
        });
      } else if (normalized.includes('INTO EXPENSES_LOCAL')) {
        expenses.set(String(params[0] ?? ''), {
          id: params[0],
          shop_id: params[1],
          category_id: params[2],
          category_name_bn: params[3],
          category_name_en: params[4],
          amount_poisha: params[5],
          method: params[6],
          reference: params[7],
          note: params[8],
          incurred_at: params[9],
          actor_user_id: params[10],
          actor_name: params[11],
          version: params[12],
          created_at: params[13],
          updated_at: params[14],
        });
      } else if (normalized.includes('INTO EXPENSE_AUDIT_LOGS_LOCAL')) {
        expenseAuditLogs.set(String(params[0] ?? ''), {
          id: params[0],
          shop_id: params[1],
          expense_id: params[2],
          action: params[3],
          edited_by_id: params[4],
          edited_by_name: params[5],
          before_json: params[6],
          after_json: params[7],
          reason: params[8],
          occurred_at: params[9],
        });
      } else if (normalized.includes('INTO CASHBOOK_DAILY_CACHE')) {
        const key = `${String(params[0] ?? '')}:${String(params[1] ?? '')}`;
        cashbookDailyCache.set(key, {
          shop_id: params[0],
          business_date: params[1],
          summary_json: params[2],
          cached_at: params[3],
        });
      } else if (normalized.includes('INTO REPORTS_SNAPSHOT_CACHE')) {
        const key = `${String(params[0] ?? '')}:${String(params[1] ?? '')}`;
        reportsSnapshotCache.set(key, {
          shop_id: params[0],
          report_key: params[1],
          payload_json: params[2],
          cached_at: params[3],
        });
      } else if (normalized.includes('INTO SYNC_OUTBOX')) {
        syncOutbox.set(String(params[0] ?? ''), {
          client_op_id: params[0],
          shop_id: params[1],
          idempotency_key: params[2],
          op_type: params[3],
          entity_type: params[4],
          entity_id: params[5],
          depends_on_entity_id: params[6],
          sequence_no: params[7],
          base_version: params[8],
          payload_json: params[9],
          local_snapshot_json: params[10],
          status: params[11],
          retry_count: params[12],
          next_retry_at_ms: params[13],
          conflict_kind: params[14],
          conflict_message: params[15],
          server_version: params[16],
          server_snapshot_json: params[17],
          warnings_json: params[18],
          occurred_at: params[19],
          created_at_ms: params[20],
          updated_at_ms: params[21],
        });
      } else if (normalized.includes('INTO SYNC_STATE')) {
        syncState.set(String(params[0] ?? ''), {
          shop_id: params[0],
          last_sync_seq: params[1],
          last_synced_at: params[2],
          device_id: params[3],
        });
      } else if (normalized.includes('INTO SYNC_ENTITY_FLAGS')) {
        const key = `${String(params[0] ?? '')}:${String(params[1] ?? '')}:${String(params[2] ?? '')}`;
        syncEntityFlags.set(key, {
          shop_id: params[0],
          entity_type: params[1],
          entity_id: params[2],
          pending_count: params[3],
          has_conflict: params[4],
          updated_at_ms: params[5],
        });
      } else if (normalized.startsWith('UPDATE SYNC_OUTBOX')) {
        if (normalized.includes("WHERE STATUS = 'IN_FLIGHT'")) {
          const nowMs = params[0];
          for (const row of syncOutbox.values()) {
            if (row.status === 'IN_FLIGHT') {
              row.status = 'PENDING';
              row.next_retry_at_ms = 0;
              row.updated_at_ms = nowMs;
            }
          }
        } else if (normalized.includes("STATUS = 'FAILED_RETRYABLE'") && normalized.includes('SET NEXT_RETRY_AT_MS = 0')) {
          const updatedAt = params[0];
          const shopId = String(params[1] ?? '');
          for (const row of syncOutbox.values()) {
            if (row.shop_id === shopId && row.status === 'FAILED_RETRYABLE') {
              row.next_retry_at_ms = 0;
              row.updated_at_ms = updatedAt;
            }
          }
        } else if (normalized.includes("SET STATUS = 'IN_FLIGHT'")) {
          const row = syncOutbox.get(String(params[2] ?? ''));
          if (row && row.shop_id === params[1]) {
            row.status = 'IN_FLIGHT';
            row.updated_at_ms = params[0];
          }
        } else if (normalized.includes("SET STATUS = 'SYNCED'")) {
          const row = syncOutbox.get(String(params[3] ?? ''));
          if (row && row.shop_id === params[2]) {
            row.status = 'SYNCED';
            row.conflict_kind = null;
            row.conflict_message = null;
            row.server_version = null;
            row.server_snapshot_json = null;
            row.warnings_json = params[0];
            row.updated_at_ms = params[1];
          }
        } else if (normalized.includes("SET STATUS = 'FAILED_RETRYABLE'")) {
          const row = syncOutbox.get(String(params[5] ?? ''));
          if (row && row.shop_id === params[4]) {
            row.status = 'FAILED_RETRYABLE';
            row.retry_count = params[0];
            row.next_retry_at_ms = params[1];
            row.conflict_message = params[2];
            row.updated_at_ms = params[3];
          }
        } else if (normalized.includes('SET IDEMPOTENCY_KEY = ?')) {
          const row = syncOutbox.get(String(params[5] ?? ''));
          if (row && row.shop_id === params[4]) {
            row.idempotency_key = params[0];
            row.base_version = params[1];
            row.payload_json = params[2];
            row.status = 'PENDING';
            row.retry_count = 0;
            row.next_retry_at_ms = 0;
            row.conflict_kind = null;
            row.conflict_message = null;
            row.server_version = null;
            row.server_snapshot_json = null;
            row.updated_at_ms = params[3];
          }
        } else if (normalized.includes('SET STATUS = ?')) {
          const row = syncOutbox.get(String(params[7] ?? ''));
          if (row && row.shop_id === params[6]) {
            row.status = params[0];
            row.conflict_kind = params[1];
            row.conflict_message = params[2];
            row.server_version = params[3];
            row.server_snapshot_json = params[4];
            row.updated_at_ms = params[5];
          }
        }
      } else if (normalized.startsWith('DELETE FROM SYNC_OUTBOX')) {
        if (normalized.includes('WHERE SHOP_ID = ? AND CLIENT_OP_ID = ?')) {
          const row = syncOutbox.get(String(params[1] ?? ''));
          if (row && row.shop_id === params[0]) {
            syncOutbox.delete(String(params[1] ?? ''));
          }
        } else {
          syncOutbox.clear();
        }
      } else if (normalized.startsWith('DELETE FROM SYNC_STATE')) {
        syncState.clear();
      } else if (normalized.startsWith('DELETE FROM SYNC_ENTITY_FLAGS')) {
        if (normalized.includes('WHERE SHOP_ID = ? AND ENTITY_TYPE = ? AND ENTITY_ID = ?')) {
          const key = `${String(params[0] ?? '')}:${String(params[1] ?? '')}:${String(params[2] ?? '')}`;
          syncEntityFlags.delete(key);
        } else {
          syncEntityFlags.clear();
        }
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
      } else if (normalized.startsWith('DELETE FROM SUPPLIERS_LOCAL')) {
        suppliers.clear();
      } else if (normalized.startsWith('DELETE FROM PURCHASE_RETURN_ITEMS_LOCAL')) {
        if (normalized.includes('WHERE PURCHASE_RETURN_ID IN')) {
          const targetPurchaseId = String(params[0] ?? '');
          const returnIds = new Set(
            Array.from(purchaseReturns.values())
              .filter((r) => r.purchase_id === targetPurchaseId)
              .map((r) => String(r.id ?? '')),
          );
          for (const [key, row] of purchaseReturnItems.entries()) {
            if (returnIds.has(String(row.purchase_return_id ?? ''))) {
              purchaseReturnItems.delete(key);
            }
          }
        } else {
          purchaseReturnItems.clear();
        }
      } else if (normalized.startsWith('DELETE FROM PURCHASE_RETURNS_LOCAL')) {
        if (normalized.includes('WHERE PURCHASE_ID = ?')) {
          const targetPurchaseId = String(params[0] ?? '');
          for (const [key, row] of purchaseReturns.entries()) {
            if (row.purchase_id === targetPurchaseId) purchaseReturns.delete(key);
          }
        } else {
          purchaseReturns.clear();
        }
      } else if (normalized.startsWith('DELETE FROM PURCHASE_ITEMS_LOCAL')) {
        if (normalized.includes('WHERE PURCHASE_ID = ?')) {
          const targetPurchaseId = String(params[0] ?? '');
          for (const [key, row] of purchaseItems.entries()) {
            if (row.purchase_id === targetPurchaseId) purchaseItems.delete(key);
          }
        } else {
          purchaseItems.clear();
        }
      } else if (normalized.startsWith('DELETE FROM PURCHASES_LOCAL')) {
        if (normalized.includes('WHERE ID = ?')) {
          purchases.delete(String(params[0] ?? ''));
        } else {
          purchases.clear();
        }
      } else if (normalized.startsWith('DELETE FROM SUPPLIER_LEDGER_ENTRIES_LOCAL')) {
        if (normalized.includes('WHERE SUPPLIER_ID = ?')) {
          const targetSupId = String(params[0] ?? '');
          for (const [key, row] of supplierLedgerEntries.entries()) {
            if (row.supplier_id === targetSupId) supplierLedgerEntries.delete(key);
          }
        } else {
          supplierLedgerEntries.clear();
        }
      } else if (normalized.startsWith('DELETE FROM CUSTOMER_LEDGER_ENTRIES_LOCAL')) {
        if (normalized.includes('WHERE CUSTOMER_ID = ?')) {
          const targetCustId = String(params[0] ?? '');
          for (const [key, row] of customerLedgerEntries.entries()) {
            if (row.customer_id === targetCustId) customerLedgerEntries.delete(key);
          }
        } else {
          customerLedgerEntries.clear();
        }
      } else if (normalized.startsWith('DELETE FROM EXPENSE_CATEGORIES_LOCAL')) {
        expenseCategories.clear();
      } else if (normalized.startsWith('DELETE FROM EXPENSES_LOCAL')) {
        if (normalized.includes('WHERE ID = ?')) {
          expenses.delete(String(params[0] ?? ''));
        } else {
          expenses.clear();
        }
      } else if (normalized.startsWith('DELETE FROM EXPENSE_AUDIT_LOGS_LOCAL')) {
        if (normalized.includes('WHERE EXPENSE_ID = ?')) {
          const targetExpId = String(params[0] ?? '');
          for (const [key, row] of expenseAuditLogs.entries()) {
            if (row.expense_id === targetExpId) expenseAuditLogs.delete(key);
          }
        } else {
          expenseAuditLogs.clear();
        }
      } else if (normalized.startsWith('DELETE FROM CASHBOOK_DAILY_CACHE')) {
        cashbookDailyCache.clear();
      } else if (normalized.startsWith('DELETE FROM REPORTS_SNAPSHOT_CACHE')) {
        reportsSnapshotCache.clear();
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
      if (normalized.includes('FROM SUPPLIERS_LOCAL')) {
        if (normalized.includes('WHERE ID = ?')) {
          return (suppliers.get(String(params[0] ?? '')) as T | undefined) ?? null;
        }
        return (suppliers.values().next().value as T | undefined) ?? null;
      }
      if (normalized.includes('FROM PURCHASES_LOCAL')) {
        if (normalized.includes('WHERE ID = ?')) {
          return (purchases.get(String(params[0] ?? '')) as T | undefined) ?? null;
        }
        return (purchases.values().next().value as T | undefined) ?? null;
      }
      if (normalized.includes('FROM CUSTOMERS_LOCAL')) {
        if (normalized.includes('WHERE ID = ?')) {
          return (customers.get(String(params[0] ?? '')) as T | undefined) ?? null;
        }
        return (customers.values().next().value as T | undefined) ?? null;
      }
      if (normalized.includes('FROM EXPENSES_LOCAL')) {
        if (normalized.includes('WHERE ID = ?')) {
          return (expenses.get(String(params[0] ?? '')) as T | undefined) ?? null;
        }
        return (expenses.values().next().value as T | undefined) ?? null;
      }
      if (normalized.includes('FROM CASHBOOK_DAILY_CACHE')) {
        const key = `${String(params[0] ?? '')}:${String(params[1] ?? '')}`;
        return (cashbookDailyCache.get(key) as T | undefined) ?? null;
      }
      if (normalized.includes('FROM REPORTS_SNAPSHOT_CACHE')) {
        const key = `${String(params[0] ?? '')}:${String(params[1] ?? '')}`;
        return (reportsSnapshotCache.get(key) as T | undefined) ?? null;
      }
      if (normalized.includes('FROM SYNC_OUTBOX')) {
        if (normalized.includes('COALESCE(MAX(SEQUENCE_NO), 0)')) {
          let maxSeq = 0;
          for (const row of syncOutbox.values()) {
            const seq = Number(row.sequence_no ?? 0);
            if (seq > maxSeq) maxSeq = seq;
          }
          return { max_seq: maxSeq } as T;
        }
        if (normalized.includes('WHERE SHOP_ID = ? AND CLIENT_OP_ID = ?')) {
          const row = syncOutbox.get(String(params[1] ?? ''));
          if (row && row.shop_id === params[0]) {
            return row as T;
          }
          return null;
        }
      }
      if (normalized.includes('FROM SYNC_STATE')) {
        return (syncState.get(String(params[0] ?? '')) as T | undefined) ?? null;
      }
      if (normalized.includes('FROM SYNC_ENTITY_FLAGS')) {
        const key = `${String(params[0] ?? '')}:${String(params[1] ?? '')}:${String(params[2] ?? '')}`;
        return (syncEntityFlags.get(key) as T | undefined) ?? null;
      }
      return null;
    },
    async getAllAsync<T>(source: string, ...params: SqliteBindValue[]): Promise<T[]> {
      const normalized = source.trim().toUpperCase();
      if (normalized.includes('FROM CATEGORIES_LOCAL')) {
        const shopFilter = normalized.includes('WHERE SHOP_ID = ?')
          ? String(params[0] ?? '')
          : null;
        return Array.from(categories.values()).filter(
          (row) => !shopFilter || row.shop_id === shopFilter,
        ) as T[];
      }
      if (normalized.includes('FROM UNITS_LOCAL')) {
        const shopFilter = normalized.includes('WHERE SHOP_ID = ?')
          ? String(params[0] ?? '')
          : null;
        return Array.from(units.values()).filter(
          (row) => !shopFilter || row.shop_id === shopFilter,
        ) as T[];
      }
      if (normalized.includes('FROM PRODUCTS_LOCAL')) {
        const shopFilter = normalized.includes('WHERE SHOP_ID = ?')
          ? String(params[0] ?? '')
          : null;
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
        const shopFilter = normalized.includes('WHERE SHOP_ID = ?')
          ? String(params[0] ?? '')
          : null;
        return Array.from(inventoryBalances.values()).filter(
          (row) => !shopFilter || row.shop_id === shopFilter,
        ) as T[];
      }
      if (normalized.includes('FROM CUSTOMERS_LOCAL')) {
        const shopFilter = normalized.includes('WHERE SHOP_ID = ?')
          ? String(params[0] ?? '')
          : null;
        return Array.from(customers.values()).filter(
          (row) => !shopFilter || row.shop_id === shopFilter,
        ) as T[];
      }
      if (normalized.includes('FROM SALES_LOCAL')) {
        const shopFilter = normalized.includes('WHERE SHOP_ID = ?')
          ? String(params[0] ?? '')
          : null;
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
          return Array.from(saleReturnItems.values()).filter(
            (r) => r.sale_return_id === retId,
          ) as T[];
        }
        return Array.from(saleReturnItems.values()) as T[];
      }
      if (normalized.includes('FROM SUPPLIERS_LOCAL')) {
        const shopFilter = normalized.includes('WHERE SHOP_ID = ?')
          ? String(params[0] ?? '')
          : null;
        return Array.from(suppliers.values()).filter(
          (row) => !shopFilter || row.shop_id === shopFilter,
        ) as T[];
      }
      if (normalized.includes('FROM PURCHASES_LOCAL')) {
        const shopFilter = normalized.includes('WHERE SHOP_ID = ?')
          ? String(params[0] ?? '')
          : null;
        return Array.from(purchases.values()).filter(
          (row) => !shopFilter || row.shop_id === shopFilter,
        ) as T[];
      }
      if (normalized.includes('FROM PURCHASE_ITEMS_LOCAL')) {
        if (normalized.includes('WHERE PURCHASE_ID = ?')) {
          const targetId = String(params[0] ?? '');
          return Array.from(purchaseItems.values())
            .filter((r) => r.purchase_id === targetId)
            .sort((a, b) => Number(a.line_order ?? 0) - Number(b.line_order ?? 0)) as T[];
        }
        return Array.from(purchaseItems.values()) as T[];
      }
      if (normalized.includes('FROM PURCHASE_RETURNS_LOCAL')) {
        if (normalized.includes('WHERE PURCHASE_ID = ?')) {
          const targetId = String(params[0] ?? '');
          return Array.from(purchaseReturns.values()).filter(
            (r) => r.purchase_id === targetId,
          ) as T[];
        }
        return Array.from(purchaseReturns.values()) as T[];
      }
      if (normalized.includes('FROM PURCHASE_RETURN_ITEMS_LOCAL')) {
        if (normalized.includes('WHERE PURCHASE_RETURN_ID = ?')) {
          const retId = String(params[0] ?? '');
          return Array.from(purchaseReturnItems.values()).filter(
            (r) => r.purchase_return_id === retId,
          ) as T[];
        }
        return Array.from(purchaseReturnItems.values()) as T[];
      }
      if (normalized.includes('FROM SUPPLIER_LEDGER_ENTRIES_LOCAL')) {
        if (normalized.includes('WHERE SUPPLIER_ID = ?')) {
          const supId = String(params[0] ?? '');
          return Array.from(supplierLedgerEntries.values()).filter(
            (r) => r.supplier_id === supId,
          ) as T[];
        }
        return Array.from(supplierLedgerEntries.values()) as T[];
      }
      if (normalized.includes('FROM CUSTOMER_LEDGER_ENTRIES_LOCAL')) {
        if (normalized.includes('WHERE CUSTOMER_ID = ?')) {
          const custId = String(params[0] ?? '');
          return Array.from(customerLedgerEntries.values()).filter(
            (r) => r.customer_id === custId,
          ) as T[];
        }
        return Array.from(customerLedgerEntries.values()) as T[];
      }
      if (normalized.includes('FROM EXPENSE_CATEGORIES_LOCAL')) {
        const shopFilter = normalized.includes('WHERE SHOP_ID = ?')
          ? String(params[0] ?? '')
          : null;
        return Array.from(expenseCategories.values()).filter(
          (row) => !shopFilter || row.shop_id === shopFilter,
        ) as T[];
      }
      if (normalized.includes('FROM EXPENSES_LOCAL')) {
        const shopFilter = normalized.includes('WHERE SHOP_ID = ?')
          ? String(params[0] ?? '')
          : null;
        return Array.from(expenses.values()).filter(
          (row) => !shopFilter || row.shop_id === shopFilter,
        ) as T[];
      }
      if (normalized.includes('FROM EXPENSE_AUDIT_LOGS_LOCAL')) {
        if (normalized.includes('WHERE EXPENSE_ID = ?')) {
          const expId = String(params[0] ?? '');
          return Array.from(expenseAuditLogs.values()).filter((r) => r.expense_id === expId) as T[];
        }
        return Array.from(expenseAuditLogs.values()) as T[];
      }
      if (normalized.includes('FROM SYNC_OUTBOX')) {
        if (normalized.includes("WHERE STATUS = 'IN_FLIGHT'")) {
          return Array.from(syncOutbox.values()).filter((r) => r.status === 'IN_FLIGHT') as T[];
        }
        if (normalized.includes('WHERE SHOP_ID = ? AND ENTITY_TYPE = ? AND ENTITY_ID = ?')) {
          return Array.from(syncOutbox.values()).filter(
            (r) =>
              r.shop_id === params[0] && r.entity_type === params[1] && r.entity_id === params[2],
          ) as T[];
        }
        if (normalized.includes('WHERE SHOP_ID = ?')) {
          return Array.from(syncOutbox.values())
            .filter((r) => r.shop_id === params[0])
            .sort((a, b) => Number(a.sequence_no ?? 0) - Number(b.sequence_no ?? 0)) as T[];
        }
        return Array.from(syncOutbox.values()) as T[];
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
