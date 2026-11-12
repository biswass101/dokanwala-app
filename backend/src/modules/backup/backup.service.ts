import { randomUUID } from 'node:crypto';
import type {
  BackupRestoreResponse,
  ShopBackupData,
  ShopBackupDocument,
} from '@dokanwala/shared';
import { prisma } from '../../database/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
import { formatDhakaYmd } from '../../shared/utils/timezone.js';
import { computeBackupChecksumSha256, type RestoreBackupInput } from './backup.schema.js';

export interface BackupExportResult {
  document: ShopBackupDocument;
  filename: string;
}

export async function exportShopBackup(
  shopId: string,
  actorUserId: string,
  requestMeta?: { deviceId?: string; ipAddress?: string },
): Promise<BackupExportResult> {
  const exportedAt = new Date().toISOString();

  const data = await prisma.$transaction(async (tx): Promise<ShopBackupData> => {
    const shop = await tx.shop.findUnique({
      where: { id: shopId },
      select: {
        nameBn: true,
        nameEn: true,
        addressBn: true,
        addressEn: true,
        phone: true,
        logoUrl: true,
        currencyCode: true,
        timezone: true,
        defaultLanguage: true,
        defaultDigitStyle: true,
        receiptHeaderBn: true,
        receiptFooterBn: true,
        allowNegativeStock: true,
        employeeCanGiveCredit: true,
        employeeMaxDiscountPercent: true,
      },
    });

    if (!shop) {
      throw new NotFoundError('Shop not found');
    }

    const [
      categories,
      units,
      products,
      productUnits,
      inventoryBalances,
      stockMovements,
      stockAdjustments,
      customers,
      suppliers,
      sales,
      saleItems,
      payments,
      saleReturns,
      saleReturnItems,
      purchases,
      purchaseItems,
      purchaseReturns,
      purchaseReturnItems,
      customerPayments,
      supplierPayments,
      expenseCategories,
      expenses,
      expenseAuditLogs,
      cashbookSessions,
      cashbookEntries,
    ] = await Promise.all([
      tx.category.findMany({ where: { shopId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      tx.unit.findMany({ where: { shopId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      tx.product.findMany({ where: { shopId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      tx.productUnit.findMany({ where: { shopId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      tx.inventoryBalance.findMany({ where: { shopId }, orderBy: [{ productId: 'asc' }] }),
      tx.stockMovement.findMany({ where: { shopId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      tx.stockAdjustment.findMany({
        where: { shopId },
        orderBy: [{ adjustedAt: 'asc' }, { id: 'asc' }],
      }),
      tx.customer.findMany({ where: { shopId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      tx.supplier.findMany({ where: { shopId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      tx.sale.findMany({ where: { shopId }, orderBy: [{ soldAt: 'asc' }, { id: 'asc' }] }),
      tx.saleItem.findMany({ where: { shopId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      tx.payment.findMany({ where: { shopId }, orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }] }),
      tx.saleReturn.findMany({ where: { shopId }, orderBy: [{ returnedAt: 'asc' }, { id: 'asc' }] }),
      tx.saleReturnItem.findMany({ where: { shopId }, orderBy: [{ id: 'asc' }] }),
      tx.purchase.findMany({ where: { shopId }, orderBy: [{ purchasedAt: 'asc' }, { id: 'asc' }] }),
      tx.purchaseItem.findMany({ where: { shopId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      tx.purchaseReturn.findMany({
        where: { shopId },
        orderBy: [{ returnedAt: 'asc' }, { id: 'asc' }],
      }),
      tx.purchaseReturnItem.findMany({ where: { shopId }, orderBy: [{ id: 'asc' }] }),
      tx.customerPayment.findMany({ where: { shopId }, orderBy: [{ paidAt: 'asc' }, { id: 'asc' }] }),
      tx.supplierPayment.findMany({ where: { shopId }, orderBy: [{ paidAt: 'asc' }, { id: 'asc' }] }),
      tx.expenseCategory.findMany({
        where: { shopId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      tx.expense.findMany({ where: { shopId }, orderBy: [{ incurredAt: 'asc' }, { id: 'asc' }] }),
      tx.expenseAuditLog.findMany({
        where: { shopId },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      }),
      tx.cashbookSession.findMany({
        where: { shopId },
        orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
      }),
      tx.cashbookEntry.findMany({
        where: { shopId },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    await tx.auditLog.create({
      data: {
        shopId,
        actorUserId,
        deviceId: requestMeta?.deviceId ?? null,
        ipAddress: requestMeta?.ipAddress ?? null,
        action: 'BACKUP_EXPORTED',
        entityType: 'shop',
        entityId: shopId,
      },
    });

    return {
      shop: { ...shop },
      categories: categories.map((c) => ({
        id: c.id,
        nameBn: c.nameBn,
        nameEn: c.nameEn,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      units: units.map((u) => ({
        id: u.id,
        code: u.code,
        nameBn: u.nameBn,
        nameEn: u.nameEn,
        isFractional: u.isFractional,
        isDefault: u.isDefault,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      })),
      products: products.map((p) => ({
        id: p.id,
        categoryId: p.categoryId,
        nameBn: p.nameBn,
        nameEn: p.nameEn,
        barcode: p.barcode,
        imageUrl: p.imageUrl,
        defaultSupplierName: p.defaultSupplierName,
        baseUnitId: p.baseUnitId,
        defaultSaleUnitId: p.defaultSaleUnitId,
        defaultPurchaseUnitId: p.defaultPurchaseUnitId,
        baseSellingPricePoisha: p.baseSellingPricePoisha,
        lastPurchasePricePoisha: p.lastPurchasePricePoisha,
        lowStockThresholdBase: p.lowStockThresholdBase.toFixed(4),
        isActive: p.isActive,
        deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
        version: p.version,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      productUnits: productUnits.map((pu) => ({
        id: pu.id,
        productId: pu.productId,
        unitId: pu.unitId,
        conversionFactorToBase: pu.conversionFactorToBase.toFixed(4),
        sellingPricePoisha: pu.sellingPricePoisha,
        isActive: pu.isActive,
        createdAt: pu.createdAt.toISOString(),
        updatedAt: pu.updatedAt.toISOString(),
      })),
      inventoryBalances: inventoryBalances.map((ib) => ({
        productId: ib.productId,
        qtyBase: ib.qtyBase.toFixed(4),
        avgCostPerBaseBdt: ib.avgCostPerBaseBdt.toFixed(6),
        version: ib.version,
        updatedAt: ib.updatedAt.toISOString(),
      })),
      stockMovements: stockMovements.map((sm) => ({
        id: sm.id,
        productId: sm.productId,
        movementType: sm.movementType,
        deltaQtyBase: sm.deltaQtyBase.toFixed(4),
        balanceAfterBase: sm.balanceAfterBase.toFixed(4),
        unitCostBdt: sm.unitCostBdt.toFixed(6),
        valuePoisha: sm.valuePoisha,
        referenceType: sm.referenceType,
        referenceId: sm.referenceId,
        reason: sm.reason,
        actorUserId: sm.actorUserId,
        createdAt: sm.createdAt.toISOString(),
      })),
      stockAdjustments: stockAdjustments.map((sa) => ({
        id: sa.id,
        productId: sa.productId,
        adjustmentType: sa.adjustmentType,
        qtyBase: sa.qtyBase.toFixed(4),
        deltaQtyBase: sa.deltaQtyBase.toFixed(4),
        unitCostBdt: sa.unitCostBdt.toFixed(6),
        lossPoisha: sa.lossPoisha,
        reason: sa.reason,
        idempotencyKey: sa.idempotencyKey,
        actorUserId: sa.actorUserId,
        adjustedAt: sa.adjustedAt.toISOString(),
      })),
      customers: customers.map((c) => ({
        id: c.id,
        nameBn: c.nameBn,
        nameEn: c.nameEn,
        phone: c.phone,
        address: c.address,
        note: c.note,
        totalPurchasedPoisha: c.totalPurchasedPoisha,
        totalPaidPoisha: c.totalPaidPoisha,
        duePoisha: c.duePoisha,
        isActive: c.isActive,
        deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
        version: c.version,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      suppliers: suppliers.map((s) => ({
        id: s.id,
        nameBn: s.nameBn,
        nameEn: s.nameEn,
        phone: s.phone,
        address: s.address,
        note: s.note,
        totalPurchasedPoisha: s.totalPurchasedPoisha,
        totalPaidPoisha: s.totalPaidPoisha,
        payablePoisha: s.payablePoisha,
        isActive: s.isActive,
        deletedAt: s.deletedAt ? s.deletedAt.toISOString() : null,
        version: s.version,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      sales: sales.map((s) => ({
        id: s.id,
        receiptNumber: s.receiptNumber,
        customerId: s.customerId,
        customerNameSnapshot: s.customerNameSnapshot,
        status: s.status,
        subtotalPoisha: s.subtotalPoisha,
        discountType: s.discountType,
        discountValue: s.discountValue.toFixed(2),
        discountPoisha: s.discountPoisha,
        totalPoisha: s.totalPoisha,
        paidPoisha: s.paidPoisha,
        settledDuePoisha: s.settledDuePoisha,
        duePoisha: s.duePoisha,
        tenderedPoisha: s.tenderedPoisha,
        changePoisha: s.changePoisha,
        returnedTotalPoisha: s.returnedTotalPoisha,
        cashRefundedPoisha: s.cashRefundedPoisha,
        cogsPoisha: s.cogsPoisha,
        note: s.note,
        idempotencyKey: s.idempotencyKey,
        cancelIdempotencyKey: s.cancelIdempotencyKey,
        cancelReason: s.cancelReason,
        cancelledAt: s.cancelledAt ? s.cancelledAt.toISOString() : null,
        cancelledByUserId: s.cancelledByUserId,
        actorUserId: s.actorUserId,
        soldAt: s.soldAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      saleItems: saleItems.map((si) => ({
        id: si.id,
        saleId: si.saleId,
        productId: si.productId,
        unitId: si.unitId,
        productNameBn: si.productNameBn,
        productNameEn: si.productNameEn,
        unitNameBn: si.unitNameBn,
        unitNameEn: si.unitNameEn,
        qtyDisplay: si.qtyDisplay.toFixed(4),
        conversionFactorToBase: si.conversionFactorToBase.toFixed(4),
        qtyBase: si.qtyBase.toFixed(4),
        returnedQtyBase: si.returnedQtyBase.toFixed(4),
        unitSellingPricePoisha: si.unitSellingPricePoisha,
        unitCostAtSaleBdt: si.unitCostAtSaleBdt.toFixed(6),
        lineSubtotalPoisha: si.lineSubtotalPoisha,
        lineCogsPoisha: si.lineCogsPoisha,
        createdAt: si.createdAt.toISOString(),
      })),
      payments: payments.map((p) => ({
        id: p.id,
        saleId: p.saleId,
        method: p.method,
        amountPoisha: p.amountPoisha,
        reference: p.reference,
        receivedAt: p.receivedAt.toISOString(),
      })),
      saleReturns: saleReturns.map((sr) => ({
        id: sr.id,
        saleId: sr.saleId,
        returnNumber: sr.returnNumber,
        refundMethod: sr.refundMethod,
        subtotalPoisha: sr.subtotalPoisha,
        discountAdjustmentPoisha: sr.discountAdjustmentPoisha,
        refundTotalPoisha: sr.refundTotalPoisha,
        cashRefundPoisha: sr.cashRefundPoisha,
        creditAdjustedPoisha: sr.creditAdjustedPoisha,
        reason: sr.reason,
        idempotencyKey: sr.idempotencyKey,
        actorUserId: sr.actorUserId,
        returnedAt: sr.returnedAt.toISOString(),
      })),
      saleReturnItems: saleReturnItems.map((sri) => ({
        id: sri.id,
        saleReturnId: sri.saleReturnId,
        saleItemId: sri.saleItemId,
        productId: sri.productId,
        qtyDisplay: sri.qtyDisplay.toFixed(4),
        qtyBase: sri.qtyBase.toFixed(4),
        unitSellingPricePoisha: sri.unitSellingPricePoisha,
        lineRefundPoisha: sri.lineRefundPoisha,
        restoredCogsPoisha: sri.restoredCogsPoisha,
      })),
      purchases: purchases.map((pur) => ({
        id: pur.id,
        purchaseNumber: pur.purchaseNumber,
        supplierId: pur.supplierId,
        supplierNameSnapshot: pur.supplierNameSnapshot,
        status: pur.status,
        subtotalPoisha: pur.subtotalPoisha,
        discountPoisha: pur.discountPoisha,
        totalPoisha: pur.totalPoisha,
        paidPoisha: pur.paidPoisha,
        settledDuePoisha: pur.settledDuePoisha,
        duePoisha: pur.duePoisha,
        paymentMethod: pur.paymentMethod,
        paymentReference: pur.paymentReference,
        returnedTotalPoisha: pur.returnedTotalPoisha,
        cashRefundedPoisha: pur.cashRefundedPoisha,
        note: pur.note,
        idempotencyKey: pur.idempotencyKey,
        actorUserId: pur.actorUserId,
        purchasedAt: pur.purchasedAt.toISOString(),
        createdAt: pur.createdAt.toISOString(),
        updatedAt: pur.updatedAt.toISOString(),
      })),
      purchaseItems: purchaseItems.map((pi) => ({
        id: pi.id,
        purchaseId: pi.purchaseId,
        productId: pi.productId,
        unitId: pi.unitId,
        productNameBn: pi.productNameBn,
        productNameEn: pi.productNameEn,
        unitNameBn: pi.unitNameBn,
        unitNameEn: pi.unitNameEn,
        lineOrder: pi.lineOrder,
        qtyDisplay: pi.qtyDisplay.toFixed(4),
        conversionFactorToBase: pi.conversionFactorToBase.toFixed(4),
        qtyBase: pi.qtyBase.toFixed(4),
        returnedQtyBase: pi.returnedQtyBase.toFixed(4),
        unitCostPoisha: pi.unitCostPoisha,
        lineTotalPoisha: pi.lineTotalPoisha,
        netCostPoisha: pi.netCostPoisha,
        createdAt: pi.createdAt.toISOString(),
      })),
      purchaseReturns: purchaseReturns.map((pr) => ({
        id: pr.id,
        purchaseId: pr.purchaseId,
        returnNumber: pr.returnNumber,
        refundMethod: pr.refundMethod,
        subtotalPoisha: pr.subtotalPoisha,
        discountAdjustmentPoisha: pr.discountAdjustmentPoisha,
        refundTotalPoisha: pr.refundTotalPoisha,
        cashRefundPoisha: pr.cashRefundPoisha,
        payableAdjustedPoisha: pr.payableAdjustedPoisha,
        reason: pr.reason,
        idempotencyKey: pr.idempotencyKey,
        actorUserId: pr.actorUserId,
        returnedAt: pr.returnedAt.toISOString(),
      })),
      purchaseReturnItems: purchaseReturnItems.map((pri) => ({
        id: pri.id,
        purchaseReturnId: pri.purchaseReturnId,
        purchaseItemId: pri.purchaseItemId,
        productId: pri.productId,
        qtyDisplay: pri.qtyDisplay.toFixed(4),
        qtyBase: pri.qtyBase.toFixed(4),
        unitCostPoisha: pri.unitCostPoisha,
        lineRefundPoisha: pri.lineRefundPoisha,
        reversedCostPoisha: pri.reversedCostPoisha,
      })),
      customerPayments: customerPayments.map((cp) => ({
        id: cp.id,
        customerId: cp.customerId,
        saleId: cp.saleId,
        method: cp.method,
        amountPoisha: cp.amountPoisha,
        reference: cp.reference,
        note: cp.note,
        idempotencyKey: cp.idempotencyKey,
        actorUserId: cp.actorUserId,
        paidAt: cp.paidAt.toISOString(),
        createdAt: cp.createdAt.toISOString(),
      })),
      supplierPayments: supplierPayments.map((sp) => ({
        id: sp.id,
        supplierId: sp.supplierId,
        purchaseId: sp.purchaseId,
        method: sp.method,
        amountPoisha: sp.amountPoisha,
        reference: sp.reference,
        note: sp.note,
        idempotencyKey: sp.idempotencyKey,
        actorUserId: sp.actorUserId,
        paidAt: sp.paidAt.toISOString(),
        createdAt: sp.createdAt.toISOString(),
      })),
      expenseCategories: expenseCategories.map((ec) => ({
        id: ec.id,
        nameBn: ec.nameBn,
        nameEn: ec.nameEn,
        isDefault: ec.isDefault,
        sortOrder: ec.sortOrder,
        isActive: ec.isActive,
        deletedAt: ec.deletedAt ? ec.deletedAt.toISOString() : null,
        version: ec.version,
        createdAt: ec.createdAt.toISOString(),
        updatedAt: ec.updatedAt.toISOString(),
      })),
      expenses: expenses.map((e) => ({
        id: e.id,
        categoryId: e.categoryId,
        categoryNameSnapshot: e.categoryNameSnapshot,
        amountPoisha: e.amountPoisha,
        method: e.method,
        reference: e.reference,
        note: e.note,
        incurredAt: e.incurredAt.toISOString(),
        idempotencyKey: e.idempotencyKey,
        actorUserId: e.actorUserId,
        version: e.version,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
      expenseAuditLogs: expenseAuditLogs.map((eal) => ({
        id: eal.id,
        expenseId: eal.expenseId,
        action: eal.action,
        editedById: eal.editedById,
        beforeJson: (eal.beforeJson as Record<string, unknown> | null) ?? null,
        afterJson: eal.afterJson as Record<string, unknown>,
        reason: eal.reason,
        occurredAt: eal.occurredAt.toISOString(),
      })),
      cashbookSessions: cashbookSessions.map((cs) => ({
        id: cs.id,
        businessDate: cs.businessDate,
        status: cs.status,
        openingCashPoisha: cs.openingCashPoisha,
        expectedClosingCashPoisha: cs.expectedClosingCashPoisha,
        actualClosingCashPoisha: cs.actualClosingCashPoisha,
        variancePoisha: cs.variancePoisha,
        note: cs.note,
        openedByUserId: cs.openedByUserId,
        closedByUserId: cs.closedByUserId,
        openedAt: cs.openedAt.toISOString(),
        closedAt: cs.closedAt ? cs.closedAt.toISOString() : null,
        version: cs.version,
        createdAt: cs.createdAt.toISOString(),
        updatedAt: cs.updatedAt.toISOString(),
      })),
      cashbookEntries: cashbookEntries.map((ce) => ({
        id: ce.id,
        sessionId: ce.sessionId,
        direction: ce.direction,
        entryType: ce.entryType,
        method: ce.method,
        amountPoisha: ce.amountPoisha,
        referenceType: ce.referenceType,
        referenceId: ce.referenceId,
        referenceNumber: ce.referenceNumber,
        note: ce.note,
        idempotencyKey: ce.idempotencyKey,
        actorUserId: ce.actorUserId,
        occurredAt: ce.occurredAt.toISOString(),
        createdAt: ce.createdAt.toISOString(),
      })),
    };
  });

  const checksumSha256 = computeBackupChecksumSha256(data);
  const document: ShopBackupDocument = {
    schemaVersion: 1,
    exportedAt,
    sourceShopId: shopId,
    checksumSha256,
    data,
  };

  return {
    document,
    filename: `dokanwala-backup-${formatDhakaYmd()}.json`,
  };
}

export async function restoreShopBackup(
  targetShopId: string,
  actorUserId: string,
  payload: RestoreBackupInput,
  requestMeta?: { deviceId?: string; ipAddress?: string },
): Promise<BackupRestoreResponse> {
  const computedChecksum = computeBackupChecksumSha256(payload.data);
  if (computedChecksum !== payload.checksumSha256) {
    throw new ValidationError(
      'Backup checksum verification failed; file may be corrupted or modified',
    );
  }

  const shouldRemapIds = payload.sourceShopId !== targetShopId;
  const idMap = new Map<string, string>();
  const mapEntityId = (rawId: string): string => {
    if (!shouldRemapIds) {
      return rawId;
    }
    const existing = idMap.get(rawId);
    if (existing) {
      return existing;
    }
    const nextId = randomUUID();
    idMap.set(rawId, nextId);
    return nextId;
  };
  const mapNullableEntityId = (rawId: string | null): string | null =>
    rawId === null ? null : mapEntityId(rawId);

  const restoredAt = new Date().toISOString();
  const { data } = payload;

  await prisma.$transaction(
    async (tx) => {
      const targetShop = await tx.shop.findUnique({
        where: { id: targetShopId },
        select: { id: true },
      });
      if (!targetShop) {
        throw new NotFoundError('Target shop not found');
      }

      const shopUsers = await tx.user.findMany({
        where: { shopId: targetShopId },
        select: { id: true },
      });
      const validUserIds = new Set(shopUsers.map((u) => u.id));
      const safeUserId = (id: string | null): string | null =>
        id && validUserIds.has(id) ? id : null;

      // Clear existing domain tables in strict reverse-FK order for targetShopId ONLY.
      await tx.cashbookEntry.deleteMany({ where: { shopId: targetShopId } });
      await tx.cashbookSession.deleteMany({ where: { shopId: targetShopId } });
      await tx.expenseAuditLog.deleteMany({ where: { shopId: targetShopId } });
      await tx.expense.deleteMany({ where: { shopId: targetShopId } });
      await tx.expenseCategory.deleteMany({ where: { shopId: targetShopId } });
      await tx.customerPayment.deleteMany({ where: { shopId: targetShopId } });
      await tx.supplierPayment.deleteMany({ where: { shopId: targetShopId } });
      await tx.saleReturnItem.deleteMany({ where: { shopId: targetShopId } });
      await tx.saleReturn.deleteMany({ where: { shopId: targetShopId } });
      await tx.payment.deleteMany({ where: { shopId: targetShopId } });
      await tx.saleItem.deleteMany({ where: { shopId: targetShopId } });
      await tx.sale.deleteMany({ where: { shopId: targetShopId } });
      await tx.purchaseReturnItem.deleteMany({ where: { shopId: targetShopId } });
      await tx.purchaseReturn.deleteMany({ where: { shopId: targetShopId } });
      await tx.purchaseItem.deleteMany({ where: { shopId: targetShopId } });
      await tx.purchase.deleteMany({ where: { shopId: targetShopId } });
      await tx.stockAdjustment.deleteMany({ where: { shopId: targetShopId } });
      await tx.stockMovement.deleteMany({ where: { shopId: targetShopId } });
      await tx.inventoryBalance.deleteMany({ where: { shopId: targetShopId } });
      await tx.productUnit.deleteMany({ where: { shopId: targetShopId } });
      await tx.product.deleteMany({ where: { shopId: targetShopId } });
      await tx.unit.deleteMany({ where: { shopId: targetShopId } });
      await tx.category.deleteMany({ where: { shopId: targetShopId } });
      await tx.customer.deleteMany({ where: { shopId: targetShopId } });
      await tx.supplier.deleteMany({ where: { shopId: targetShopId } });

      // Update shop settings
      await tx.shop.update({
        where: { id: targetShopId },
        data: { ...data.shop },
      });

      // Insert parent entities first
      if (data.categories.length > 0) {
        await tx.category.createMany({
          data: data.categories.map((c) => ({
            id: mapEntityId(c.id),
            shopId: targetShopId,
            nameBn: c.nameBn,
            nameEn: c.nameEn,
            sortOrder: c.sortOrder,
            isActive: c.isActive,
            deletedAt: c.deletedAt ? new Date(c.deletedAt) : null,
            createdAt: new Date(c.createdAt),
            updatedAt: new Date(c.updatedAt),
          })),
        });
      }

      if (data.units.length > 0) {
        await tx.unit.createMany({
          data: data.units.map((u) => ({
            id: mapEntityId(u.id),
            shopId: targetShopId,
            code: u.code,
            nameBn: u.nameBn,
            nameEn: u.nameEn,
            isFractional: u.isFractional,
            isDefault: u.isDefault,
            createdAt: new Date(u.createdAt),
            updatedAt: new Date(u.updatedAt),
          })),
        });
      }

      if (data.customers.length > 0) {
        await tx.customer.createMany({
          data: data.customers.map((c) => ({
            id: mapEntityId(c.id),
            shopId: targetShopId,
            nameBn: c.nameBn,
            nameEn: c.nameEn,
            phone: c.phone,
            address: c.address,
            note: c.note,
            totalPurchasedPoisha: c.totalPurchasedPoisha,
            totalPaidPoisha: c.totalPaidPoisha,
            duePoisha: c.duePoisha,
            isActive: c.isActive,
            deletedAt: c.deletedAt ? new Date(c.deletedAt) : null,
            version: c.version,
            createdAt: new Date(c.createdAt),
            updatedAt: new Date(c.updatedAt),
          })),
        });
      }

      if (data.suppliers.length > 0) {
        await tx.supplier.createMany({
          data: data.suppliers.map((s) => ({
            id: mapEntityId(s.id),
            shopId: targetShopId,
            nameBn: s.nameBn,
            nameEn: s.nameEn,
            phone: s.phone,
            address: s.address,
            note: s.note,
            totalPurchasedPoisha: s.totalPurchasedPoisha,
            totalPaidPoisha: s.totalPaidPoisha,
            payablePoisha: s.payablePoisha,
            isActive: s.isActive,
            deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
            version: s.version,
            createdAt: new Date(s.createdAt),
            updatedAt: new Date(s.updatedAt),
          })),
        });
      }

      if (data.expenseCategories.length > 0) {
        await tx.expenseCategory.createMany({
          data: data.expenseCategories.map((ec) => ({
            id: mapEntityId(ec.id),
            shopId: targetShopId,
            nameBn: ec.nameBn,
            nameEn: ec.nameEn,
            isDefault: ec.isDefault,
            sortOrder: ec.sortOrder,
            isActive: ec.isActive,
            deletedAt: ec.deletedAt ? new Date(ec.deletedAt) : null,
            version: ec.version,
            createdAt: new Date(ec.createdAt),
            updatedAt: new Date(ec.updatedAt),
          })),
        });
      }

      if (data.products.length > 0) {
        await tx.product.createMany({
          data: data.products.map((p) => ({
            id: mapEntityId(p.id),
            shopId: targetShopId,
            categoryId: mapNullableEntityId(p.categoryId),
            nameBn: p.nameBn,
            nameEn: p.nameEn,
            barcode: p.barcode,
            imageUrl: p.imageUrl,
            defaultSupplierName: p.defaultSupplierName,
            baseUnitId: mapEntityId(p.baseUnitId),
            defaultSaleUnitId: mapEntityId(p.defaultSaleUnitId),
            defaultPurchaseUnitId: mapEntityId(p.defaultPurchaseUnitId),
            baseSellingPricePoisha: p.baseSellingPricePoisha,
            lastPurchasePricePoisha: p.lastPurchasePricePoisha,
            lowStockThresholdBase: p.lowStockThresholdBase,
            isActive: p.isActive,
            deletedAt: p.deletedAt ? new Date(p.deletedAt) : null,
            version: p.version,
            createdAt: new Date(p.createdAt),
            updatedAt: new Date(p.updatedAt),
          })),
        });
      }

      if (data.productUnits.length > 0) {
        await tx.productUnit.createMany({
          data: data.productUnits.map((pu) => ({
            id: mapEntityId(pu.id),
            shopId: targetShopId,
            productId: mapEntityId(pu.productId),
            unitId: mapEntityId(pu.unitId),
            conversionFactorToBase: pu.conversionFactorToBase,
            sellingPricePoisha: pu.sellingPricePoisha,
            isActive: pu.isActive,
            createdAt: new Date(pu.createdAt),
            updatedAt: new Date(pu.updatedAt),
          })),
        });
      }

      if (data.inventoryBalances.length > 0) {
        await tx.inventoryBalance.createMany({
          data: data.inventoryBalances.map((ib) => ({
            productId: mapEntityId(ib.productId),
            shopId: targetShopId,
            qtyBase: ib.qtyBase,
            avgCostPerBaseBdt: ib.avgCostPerBaseBdt,
            version: ib.version,
            updatedAt: new Date(ib.updatedAt),
          })),
        });
      }

      if (data.stockMovements.length > 0) {
        await tx.stockMovement.createMany({
          data: data.stockMovements.map((sm) => ({
            id: mapEntityId(sm.id),
            shopId: targetShopId,
            productId: mapEntityId(sm.productId),
            movementType: sm.movementType,
            deltaQtyBase: sm.deltaQtyBase,
            balanceAfterBase: sm.balanceAfterBase,
            unitCostBdt: sm.unitCostBdt,
            valuePoisha: sm.valuePoisha,
            referenceType: sm.referenceType,
            referenceId:
              sm.referenceId && shouldRemapIds && idMap.has(sm.referenceId)
                ? idMap.get(sm.referenceId) ?? sm.referenceId
                : sm.referenceId,
            reason: sm.reason,
            actorUserId: safeUserId(sm.actorUserId),
            createdAt: new Date(sm.createdAt),
          })),
        });
      }

      if (data.stockAdjustments.length > 0) {
        await tx.stockAdjustment.createMany({
          data: data.stockAdjustments.map((sa) => ({
            id: mapEntityId(sa.id),
            shopId: targetShopId,
            productId: mapEntityId(sa.productId),
            adjustmentType: sa.adjustmentType,
            qtyBase: sa.qtyBase,
            deltaQtyBase: sa.deltaQtyBase,
            unitCostBdt: sa.unitCostBdt,
            lossPoisha: sa.lossPoisha,
            reason: sa.reason,
            idempotencyKey: sa.idempotencyKey,
            actorUserId: safeUserId(sa.actorUserId),
            adjustedAt: new Date(sa.adjustedAt),
          })),
        });
      }

      if (data.sales.length > 0) {
        await tx.sale.createMany({
          data: data.sales.map((s) => ({
            id: mapEntityId(s.id),
            shopId: targetShopId,
            receiptNumber: s.receiptNumber,
            customerId: mapNullableEntityId(s.customerId),
            customerNameSnapshot: s.customerNameSnapshot,
            status: s.status,
            subtotalPoisha: s.subtotalPoisha,
            discountType: s.discountType,
            discountValue: s.discountValue,
            discountPoisha: s.discountPoisha,
            totalPoisha: s.totalPoisha,
            paidPoisha: s.paidPoisha,
            settledDuePoisha: s.settledDuePoisha,
            duePoisha: s.duePoisha,
            tenderedPoisha: s.tenderedPoisha,
            changePoisha: s.changePoisha,
            returnedTotalPoisha: s.returnedTotalPoisha,
            cashRefundedPoisha: s.cashRefundedPoisha,
            cogsPoisha: s.cogsPoisha,
            note: s.note,
            idempotencyKey: s.idempotencyKey,
            cancelIdempotencyKey: s.cancelIdempotencyKey,
            cancelReason: s.cancelReason,
            cancelledAt: s.cancelledAt ? new Date(s.cancelledAt) : null,
            cancelledByUserId: safeUserId(s.cancelledByUserId),
            actorUserId: safeUserId(s.actorUserId),
            soldAt: new Date(s.soldAt),
            createdAt: new Date(s.createdAt),
            updatedAt: new Date(s.updatedAt),
          })),
        });
      }

      if (data.saleItems.length > 0) {
        await tx.saleItem.createMany({
          data: data.saleItems.map((si) => ({
            id: mapEntityId(si.id),
            shopId: targetShopId,
            saleId: mapEntityId(si.saleId),
            productId: mapEntityId(si.productId),
            unitId: mapEntityId(si.unitId),
            productNameBn: si.productNameBn,
            productNameEn: si.productNameEn,
            unitNameBn: si.unitNameBn,
            unitNameEn: si.unitNameEn,
            qtyDisplay: si.qtyDisplay,
            conversionFactorToBase: si.conversionFactorToBase,
            qtyBase: si.qtyBase,
            returnedQtyBase: si.returnedQtyBase,
            unitSellingPricePoisha: si.unitSellingPricePoisha,
            unitCostAtSaleBdt: si.unitCostAtSaleBdt,
            lineSubtotalPoisha: si.lineSubtotalPoisha,
            lineCogsPoisha: si.lineCogsPoisha,
            createdAt: new Date(si.createdAt),
          })),
        });
      }

      if (data.payments.length > 0) {
        await tx.payment.createMany({
          data: data.payments.map((p) => ({
            id: mapEntityId(p.id),
            shopId: targetShopId,
            saleId: mapEntityId(p.saleId),
            method: p.method,
            amountPoisha: p.amountPoisha,
            reference: p.reference,
            receivedAt: new Date(p.receivedAt),
          })),
        });
      }

      if (data.saleReturns.length > 0) {
        await tx.saleReturn.createMany({
          data: data.saleReturns.map((sr) => ({
            id: mapEntityId(sr.id),
            shopId: targetShopId,
            saleId: mapEntityId(sr.saleId),
            returnNumber: sr.returnNumber,
            refundMethod: sr.refundMethod,
            subtotalPoisha: sr.subtotalPoisha,
            discountAdjustmentPoisha: sr.discountAdjustmentPoisha,
            refundTotalPoisha: sr.refundTotalPoisha,
            cashRefundPoisha: sr.cashRefundPoisha,
            creditAdjustedPoisha: sr.creditAdjustedPoisha,
            reason: sr.reason,
            idempotencyKey: sr.idempotencyKey,
            actorUserId: safeUserId(sr.actorUserId),
            returnedAt: new Date(sr.returnedAt),
          })),
        });
      }

      if (data.saleReturnItems.length > 0) {
        await tx.saleReturnItem.createMany({
          data: data.saleReturnItems.map((sri) => ({
            id: mapEntityId(sri.id),
            shopId: targetShopId,
            saleReturnId: mapEntityId(sri.saleReturnId),
            saleItemId: mapEntityId(sri.saleItemId),
            productId: mapEntityId(sri.productId),
            qtyDisplay: sri.qtyDisplay,
            qtyBase: sri.qtyBase,
            unitSellingPricePoisha: sri.unitSellingPricePoisha,
            lineRefundPoisha: sri.lineRefundPoisha,
            restoredCogsPoisha: sri.restoredCogsPoisha,
          })),
        });
      }

      if (data.purchases.length > 0) {
        await tx.purchase.createMany({
          data: data.purchases.map((pur) => ({
            id: mapEntityId(pur.id),
            shopId: targetShopId,
            purchaseNumber: pur.purchaseNumber,
            supplierId: mapNullableEntityId(pur.supplierId),
            supplierNameSnapshot: pur.supplierNameSnapshot,
            status: pur.status,
            subtotalPoisha: pur.subtotalPoisha,
            discountPoisha: pur.discountPoisha,
            totalPoisha: pur.totalPoisha,
            paidPoisha: pur.paidPoisha,
            settledDuePoisha: pur.settledDuePoisha,
            duePoisha: pur.duePoisha,
            paymentMethod: pur.paymentMethod,
            paymentReference: pur.paymentReference,
            returnedTotalPoisha: pur.returnedTotalPoisha,
            cashRefundedPoisha: pur.cashRefundedPoisha,
            note: pur.note,
            idempotencyKey: pur.idempotencyKey,
            actorUserId: safeUserId(pur.actorUserId),
            purchasedAt: new Date(pur.purchasedAt),
            createdAt: new Date(pur.createdAt),
            updatedAt: new Date(pur.updatedAt),
          })),
        });
      }

      if (data.purchaseItems.length > 0) {
        await tx.purchaseItem.createMany({
          data: data.purchaseItems.map((pi) => ({
            id: mapEntityId(pi.id),
            shopId: targetShopId,
            purchaseId: mapEntityId(pi.purchaseId),
            productId: mapEntityId(pi.productId),
            unitId: mapEntityId(pi.unitId),
            productNameBn: pi.productNameBn,
            productNameEn: pi.productNameEn,
            unitNameBn: pi.unitNameBn,
            unitNameEn: pi.unitNameEn,
            lineOrder: pi.lineOrder,
            qtyDisplay: pi.qtyDisplay,
            conversionFactorToBase: pi.conversionFactorToBase,
            qtyBase: pi.qtyBase,
            returnedQtyBase: pi.returnedQtyBase,
            unitCostPoisha: pi.unitCostPoisha,
            lineTotalPoisha: pi.lineTotalPoisha,
            netCostPoisha: pi.netCostPoisha,
            createdAt: new Date(pi.createdAt),
          })),
        });
      }

      if (data.purchaseReturns.length > 0) {
        await tx.purchaseReturn.createMany({
          data: data.purchaseReturns.map((pr) => ({
            id: mapEntityId(pr.id),
            shopId: targetShopId,
            purchaseId: mapEntityId(pr.purchaseId),
            returnNumber: pr.returnNumber,
            refundMethod: pr.refundMethod,
            subtotalPoisha: pr.subtotalPoisha,
            discountAdjustmentPoisha: pr.discountAdjustmentPoisha,
            refundTotalPoisha: pr.refundTotalPoisha,
            cashRefundPoisha: pr.cashRefundPoisha,
            payableAdjustedPoisha: pr.payableAdjustedPoisha,
            reason: pr.reason,
            idempotencyKey: pr.idempotencyKey,
            actorUserId: safeUserId(pr.actorUserId),
            returnedAt: new Date(pr.returnedAt),
          })),
        });
      }

      if (data.purchaseReturnItems.length > 0) {
        await tx.purchaseReturnItem.createMany({
          data: data.purchaseReturnItems.map((pri) => ({
            id: mapEntityId(pri.id),
            shopId: targetShopId,
            purchaseReturnId: mapEntityId(pri.purchaseReturnId),
            purchaseItemId: mapEntityId(pri.purchaseItemId),
            productId: mapEntityId(pri.productId),
            qtyDisplay: pri.qtyDisplay,
            qtyBase: pri.qtyBase,
            unitCostPoisha: pri.unitCostPoisha,
            lineRefundPoisha: pri.lineRefundPoisha,
            reversedCostPoisha: pri.reversedCostPoisha,
          })),
        });
      }

      if (data.customerPayments.length > 0) {
        await tx.customerPayment.createMany({
          data: data.customerPayments.map((cp) => ({
            id: mapEntityId(cp.id),
            shopId: targetShopId,
            customerId: mapEntityId(cp.customerId),
            saleId: mapNullableEntityId(cp.saleId),
            method: cp.method,
            amountPoisha: cp.amountPoisha,
            reference: cp.reference,
            note: cp.note,
            idempotencyKey: cp.idempotencyKey,
            actorUserId: safeUserId(cp.actorUserId),
            paidAt: new Date(cp.paidAt),
            createdAt: new Date(cp.createdAt),
          })),
        });
      }

      if (data.supplierPayments.length > 0) {
        await tx.supplierPayment.createMany({
          data: data.supplierPayments.map((sp) => ({
            id: mapEntityId(sp.id),
            shopId: targetShopId,
            supplierId: mapEntityId(sp.supplierId),
            purchaseId: mapNullableEntityId(sp.purchaseId),
            method: sp.method,
            amountPoisha: sp.amountPoisha,
            reference: sp.reference,
            note: sp.note,
            idempotencyKey: sp.idempotencyKey,
            actorUserId: safeUserId(sp.actorUserId),
            paidAt: new Date(sp.paidAt),
            createdAt: new Date(sp.createdAt),
          })),
        });
      }

      if (data.expenses.length > 0) {
        await tx.expense.createMany({
          data: data.expenses.map((e) => ({
            id: mapEntityId(e.id),
            shopId: targetShopId,
            categoryId: mapEntityId(e.categoryId),
            categoryNameSnapshot: e.categoryNameSnapshot,
            amountPoisha: e.amountPoisha,
            method: e.method,
            reference: e.reference,
            note: e.note,
            incurredAt: new Date(e.incurredAt),
            idempotencyKey: e.idempotencyKey,
            actorUserId: safeUserId(e.actorUserId),
            version: e.version,
            createdAt: new Date(e.createdAt),
            updatedAt: new Date(e.updatedAt),
          })),
        });
      }

      if (data.expenseAuditLogs.length > 0) {
        await tx.expenseAuditLog.createMany({
          data: data.expenseAuditLogs.map((eal) => ({
            id: mapEntityId(eal.id),
            shopId: targetShopId,
            expenseId: mapEntityId(eal.expenseId),
            action: eal.action,
            editedById: safeUserId(eal.editedById),
            beforeJson:
              eal.beforeJson === null
                ? Prisma.JsonNull
                : (eal.beforeJson as Prisma.InputJsonValue),
            afterJson: eal.afterJson as Prisma.InputJsonValue,
            reason: eal.reason,
            occurredAt: new Date(eal.occurredAt),
          })),
        });
      }

      if (data.cashbookSessions.length > 0) {
        await tx.cashbookSession.createMany({
          data: data.cashbookSessions.map((cs) => ({
            id: mapEntityId(cs.id),
            shopId: targetShopId,
            businessDate: cs.businessDate,
            status: cs.status,
            openingCashPoisha: cs.openingCashPoisha,
            expectedClosingCashPoisha: cs.expectedClosingCashPoisha,
            actualClosingCashPoisha: cs.actualClosingCashPoisha,
            variancePoisha: cs.variancePoisha,
            note: cs.note,
            openedByUserId: safeUserId(cs.openedByUserId),
            closedByUserId: safeUserId(cs.closedByUserId),
            openedAt: new Date(cs.openedAt),
            closedAt: cs.closedAt ? new Date(cs.closedAt) : null,
            version: cs.version,
            createdAt: new Date(cs.createdAt),
            updatedAt: new Date(cs.updatedAt),
          })),
        });
      }

      if (data.cashbookEntries.length > 0) {
        await tx.cashbookEntry.createMany({
          data: data.cashbookEntries.map((ce) => ({
            id: mapEntityId(ce.id),
            shopId: targetShopId,
            sessionId: mapNullableEntityId(ce.sessionId),
            direction: ce.direction,
            entryType: ce.entryType,
            method: ce.method,
            amountPoisha: ce.amountPoisha,
            referenceType: ce.referenceType,
            referenceId:
              ce.referenceId && shouldRemapIds && idMap.has(ce.referenceId)
                ? idMap.get(ce.referenceId) ?? ce.referenceId
                : ce.referenceId,
            referenceNumber: ce.referenceNumber,
            note: ce.note,
            idempotencyKey: ce.idempotencyKey,
            actorUserId: safeUserId(ce.actorUserId),
            occurredAt: new Date(ce.occurredAt),
            createdAt: new Date(ce.createdAt),
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          shopId: targetShopId,
          actorUserId,
          deviceId: requestMeta?.deviceId ?? null,
          ipAddress: requestMeta?.ipAddress ?? null,
          action: 'BACKUP_RESTORED',
          entityType: 'shop',
          entityId: targetShopId,
          afterJson: {
            sourceShopId: payload.sourceShopId,
            exportedAt: payload.exportedAt,
            restoredAt,
          },
        },
      });
    },
    { timeout: 30_000 },
  );

  return {
    restoredAt,
    targetShopId,
    sourceShopId: payload.sourceShopId,
    counts: {
      categories: data.categories.length,
      units: data.units.length,
      products: data.products.length,
      customers: data.customers.length,
      suppliers: data.suppliers.length,
      sales: data.sales.length,
      purchases: data.purchases.length,
      expenses: data.expenses.length,
      cashbookSessions: data.cashbookSessions.length,
      cashbookEntries: data.cashbookEntries.length,
    },
  };
}
