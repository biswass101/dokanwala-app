import {
  formatDhakaMonthLabel,
  getDhakaMonthKey,
  getDhakaMonthStartYmd,
  getDhakaWeekStartYmd,
  shiftDhakaYmd,
  type CustomerDueReportItemDto,
  type DashboardSummaryResponse,
  type DuesReportResponse,
  type ProductPerformanceItemDto,
  type ProductsReportResponse,
  type ProfitLossExpenseCategoryDto,
  type ProfitLossReportResponse,
  type RecentDashboardTransactionDto,
  type SalesReportBucketDto,
  type SalesReportPeriod,
  type SalesReportResponse,
  type SupplierPayableReportItemDto,
  type UserRole,
} from '@dokanwala/shared';
import { Decimal } from 'decimal.js';
import { prisma } from '../../database/prisma.js';
import { ValidationError } from '../../shared/errors/app-error.js';
import { formatDhakaYmd, getDhakaDayRangeUtc } from '../../shared/utils/timezone.js';
import { getCashbookSummary } from '../cashbook/cashbook.service.js';

function resolveDateRange(
  from?: string,
  to?: string,
  defaultSpanDays = 1,
): { fromDate: string; toDate: string; startUtc: Date; endUtc: Date } {
  const today = formatDhakaYmd();
  const toDate = to ?? today;
  const fromDate = from ?? (defaultSpanDays <= 1 ? toDate : shiftDhakaYmd(toDate, -(defaultSpanDays - 1)));

  if (fromDate > toDate) {
    throw new ValidationError('Start date (from) must be on or before end date (to)');
  }

  try {
    const startUtc = getDhakaDayRangeUtc(fromDate).startUtc;
    const endUtc = getDhakaDayRangeUtc(toDate).endUtc;
    return { fromDate, toDate, startUtc, endUtc };
  } catch (err) {
    throw new ValidationError(err instanceof Error ? err.message : 'Invalid date range');
  }
}

function getMonthRangeStartYmd(todayYmd: string, monthsBack: number): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(todayYmd);
  if (!match?.[1] || !match[2]) {
    return getDhakaMonthStartYmd(todayYmd);
  }
  let year = Number(match[1]);
  let month = Number(match[2]) - monthsBack;
  while (month <= 0) {
    month += 12;
    year -= 1;
  }
  return `${String(year)}-${String(month).padStart(2, '0')}-01`;
}

export async function getDashboardSummary(
  shopId: string,
  role: UserRole,
): Promise<DashboardSummaryResponse> {
  const businessDate = formatDhakaYmd();
  const { startUtc, endUtc } = getDhakaDayRangeUtc(businessDate);
  const isOwner = role === 'OWNER';

  const [
    salesToday,
    returnsToday,
    wastageRowsToday,
    expensesToday,
    customerPaymentsToday,
    productsWithBalances,
    customerDueAgg,
    supplierPayableAgg,
    cashbookSummary,
    recentSales,
    recentExpenses,
    recentCustomerPayments,
    recentPurchases,
    recentSupplierPayments,
  ] = await Promise.all([
    prisma.sale.findMany({
      where: {
        shopId,
        status: { not: 'CANCELLED' },
        soldAt: { gte: startUtc, lte: endUtc },
      },
      select: {
        subtotalPoisha: true,
        discountPoisha: true,
        totalPoisha: true,
        paidPoisha: true,
        cogsPoisha: true,
      },
    }),
    prisma.saleReturn.findMany({
      where: {
        shopId,
        returnedAt: { gte: startUtc, lte: endUtc },
        sale: { status: { not: 'CANCELLED' } },
      },
      select: {
        refundTotalPoisha: true,
        items: { select: { restoredCogsPoisha: true } },
      },
    }),
    prisma.stockAdjustment.findMany({
      where: {
        shopId,
        adjustedAt: { gte: startUtc, lte: endUtc },
        lossPoisha: { gt: 0 },
      },
      select: { lossPoisha: true },
    }),
    prisma.expense.aggregate({
      where: {
        shopId,
        incurredAt: { gte: startUtc, lte: endUtc },
      },
      _sum: { amountPoisha: true },
    }),
    prisma.customerPayment.aggregate({
      where: {
        shopId,
        paidAt: { gte: startUtc, lte: endUtc },
      },
      _sum: { amountPoisha: true },
    }),
    prisma.product.findMany({
      where: { shopId, deletedAt: null, isActive: true },
      select: {
        id: true,
        lowStockThresholdBase: true,
        inventoryBalance: { select: { qtyBase: true } },
      },
    }),
    prisma.customer.aggregate({
      where: { shopId, deletedAt: null, duePoisha: { gt: 0 } },
      _sum: { duePoisha: true },
    }),
    prisma.supplier.aggregate({
      where: { shopId, deletedAt: null, payablePoisha: { gt: 0 } },
      _sum: { payablePoisha: true },
    }),
    getCashbookSummary(shopId, businessDate),
    prisma.sale.findMany({
      where: { shopId, status: { not: 'CANCELLED' } },
      orderBy: [{ soldAt: 'desc' }],
      take: 5,
      select: {
        id: true,
        receiptNumber: true,
        customerNameSnapshot: true,
        totalPoisha: true,
        soldAt: true,
      },
    }),
    prisma.expense.findMany({
      where: { shopId },
      orderBy: [{ incurredAt: 'desc' }],
      take: 4,
      select: {
        id: true,
        categoryNameSnapshot: true,
        note: true,
        amountPoisha: true,
        incurredAt: true,
      },
    }),
    prisma.customerPayment.findMany({
      where: { shopId },
      orderBy: [{ paidAt: 'desc' }],
      take: 4,
      select: {
        id: true,
        amountPoisha: true,
        paidAt: true,
        customer: { select: { nameBn: true } },
      },
    }),
    isOwner
      ? prisma.purchase.findMany({
          where: { shopId },
          orderBy: [{ purchasedAt: 'desc' }],
          take: 4,
          select: {
            id: true,
            purchaseNumber: true,
            supplierNameSnapshot: true,
            totalPoisha: true,
            purchasedAt: true,
          },
        })
      : Promise.resolve([]),
    isOwner
      ? prisma.supplierPayment.findMany({
          where: { shopId },
          orderBy: [{ paidAt: 'desc' }],
          take: 4,
          select: {
            id: true,
            amountPoisha: true,
            paidAt: true,
            supplier: { select: { nameBn: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  let grossSalesToday = 0;
  let discountsToday = 0;
  let paidAtSaleToday = 0;
  let dueGivenToday = 0;
  let grossCogsToday = 0;

  for (const s of salesToday) {
    grossSalesToday += s.subtotalPoisha;
    discountsToday += s.discountPoisha;
    paidAtSaleToday += s.paidPoisha;
    dueGivenToday += Math.max(0, s.totalPoisha - s.paidPoisha);
    grossCogsToday += s.cogsPoisha;
  }

  let returnsTotalToday = 0;
  let restoredCogsToday = 0;
  for (const ret of returnsToday) {
    returnsTotalToday += ret.refundTotalPoisha;
    for (const item of ret.items) {
      restoredCogsToday += item.restoredCogsPoisha;
    }
  }

  let wastageLossToday = 0;
  for (const adj of wastageRowsToday) {
    wastageLossToday += adj.lossPoisha;
  }

  const todayNetSalesPoisha = grossSalesToday - discountsToday - returnsTotalToday;
  const todayNetCogsPoisha = grossCogsToday - restoredCogsToday;
  const todayGrossProfitPoisha = todayNetSalesPoisha - todayNetCogsPoisha;
  const todayExpensesPoisha = expensesToday._sum.amountPoisha ?? 0;
  const todayNetProfitPoisha = todayGrossProfitPoisha - todayExpensesPoisha - wastageLossToday;
  const todayDueCollectedPoisha = customerPaymentsToday._sum.amountPoisha ?? 0;

  let lowStockCount = 0;
  for (const product of productsWithBalances) {
    const qtyDec = new Decimal(product.inventoryBalance?.qtyBase.toFixed(4) ?? '0');
    const threshDec = new Decimal(product.lowStockThresholdBase.toFixed(4));
    if (qtyDec.lte(threshDec)) {
      lowStockCount += 1;
    }
  }

  const recentItems: RecentDashboardTransactionDto[] = [];
  for (const s of recentSales) {
    recentItems.push({
      id: `sale:${s.id}`,
      kind: 'SALE',
      title: s.receiptNumber,
      subtitle: s.customerNameSnapshot,
      amountPoisha: s.totalPoisha,
      direction: 'IN',
      occurredAt: s.soldAt.toISOString(),
      referenceId: s.id,
    });
  }
  for (const e of recentExpenses) {
    recentItems.push({
      id: `exp:${e.id}`,
      kind: 'EXPENSE',
      title: e.categoryNameSnapshot,
      subtitle: e.note,
      amountPoisha: e.amountPoisha,
      direction: 'OUT',
      occurredAt: e.incurredAt.toISOString(),
      referenceId: e.id,
    });
  }
  for (const cp of recentCustomerPayments) {
    recentItems.push({
      id: `cp:${cp.id}`,
      kind: 'CUSTOMER_PAYMENT',
      title: cp.customer.nameBn,
      subtitle: null,
      amountPoisha: cp.amountPoisha,
      direction: 'IN',
      occurredAt: cp.paidAt.toISOString(),
      referenceId: cp.id,
    });
  }
  for (const pur of recentPurchases) {
    recentItems.push({
      id: `pur:${pur.id}`,
      kind: 'PURCHASE',
      title: pur.purchaseNumber,
      subtitle: pur.supplierNameSnapshot,
      amountPoisha: pur.totalPoisha,
      direction: 'OUT',
      occurredAt: pur.purchasedAt.toISOString(),
      referenceId: pur.id,
    });
  }
  for (const sp of recentSupplierPayments) {
    recentItems.push({
      id: `sp:${sp.id}`,
      kind: 'SUPPLIER_PAYMENT',
      title: sp.supplier.nameBn,
      subtitle: null,
      amountPoisha: sp.amountPoisha,
      direction: 'OUT',
      occurredAt: sp.paidAt.toISOString(),
      referenceId: sp.id,
    });
  }

  recentItems.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return {
    businessDate,
    todaySalesPoisha: grossSalesToday - discountsToday,
    todaySalesCount: salesToday.length,
    todayReturnsPoisha: returnsTotalToday,
    todayNetSalesPoisha,
    todayCogsPoisha: isOwner ? todayNetCogsPoisha : null,
    todayGrossProfitPoisha: isOwner ? todayGrossProfitPoisha : null,
    todayWastageLossPoisha: isOwner ? wastageLossToday : null,
    todayExpensesPoisha,
    todayNetProfitPoisha: isOwner ? todayNetProfitPoisha : null,
    todayCashReceivedPoisha: paidAtSaleToday + todayDueCollectedPoisha,
    todayDueGivenPoisha: dueGivenToday,
    todayDueCollectedPoisha,
    totalProducts: productsWithBalances.length,
    lowStockCount,
    customerDueTotalPoisha: customerDueAgg._sum.duePoisha ?? 0,
    supplierPayableTotalPoisha: supplierPayableAgg._sum.payablePoisha ?? 0,
    cashbookStatus: cashbookSummary.session ? cashbookSummary.session.status : 'UNOPENED',
    cashbookExpectedCashPoisha: cashbookSummary.liveExpectedClosingCashPoisha,
    recentTransactions: recentItems.slice(0, 8),
  };
}

export async function getSalesReport(
  shopId: string,
  role: UserRole,
  period: SalesReportPeriod,
  from?: string,
  to?: string,
): Promise<SalesReportResponse> {
  const today = formatDhakaYmd();
  const defaultFrom =
    period === 'daily'
      ? shiftDhakaYmd(today, -6)
      : period === 'weekly'
        ? shiftDhakaYmd(today, -27)
        : getMonthRangeStartYmd(today, 5);

  const { fromDate, toDate, startUtc, endUtc } = resolveDateRange(
    from ?? defaultFrom,
    to ?? today,
  );
  const isOwner = role === 'OWNER';

  const [sales, returns, payments, dueCollectedAgg] = await Promise.all([
    prisma.sale.findMany({
      where: {
        shopId,
        status: { not: 'CANCELLED' },
        soldAt: { gte: startUtc, lte: endUtc },
      },
      select: {
        subtotalPoisha: true,
        discountPoisha: true,
        totalPoisha: true,
        paidPoisha: true,
        cogsPoisha: true,
        soldAt: true,
      },
      orderBy: [{ soldAt: 'asc' }],
    }),
    prisma.saleReturn.findMany({
      where: {
        shopId,
        returnedAt: { gte: startUtc, lte: endUtc },
        sale: { status: { not: 'CANCELLED' } },
      },
      select: {
        refundTotalPoisha: true,
        returnedAt: true,
        items: { select: { restoredCogsPoisha: true } },
      },
    }),
    prisma.payment.findMany({
      where: {
        shopId,
        receivedAt: { gte: startUtc, lte: endUtc },
        sale: { status: { not: 'CANCELLED' } },
      },
      select: {
        method: true,
        amountPoisha: true,
      },
    }),
    prisma.customerPayment.aggregate({
      where: {
        shopId,
        paidAt: { gte: startUtc, lte: endUtc },
      },
      _sum: { amountPoisha: true },
    }),
  ]);

  const bucketMap = new Map<
    string,
    {
      bucketKey: string;
      label: string;
      salesCount: number;
      grossSalesPoisha: number;
      discountsPoisha: number;
      returnsPoisha: number;
      cashAndMfsReceivedPoisha: number;
      creditIssuedPoisha: number;
      grossCogsPoisha: number;
      restoredCogsPoisha: number;
    }
  >();

  const resolveBucketInfo = (date: Date): { key: string; label: string } => {
    const ymd = formatDhakaYmd(date);
    if (period === 'daily') {
      return { key: ymd, label: ymd };
    }
    if (period === 'weekly') {
      const weekStart = getDhakaWeekStartYmd(ymd);
      return { key: weekStart, label: weekStart };
    }
    const monthKey = getDhakaMonthKey(ymd);
    return { key: monthKey, label: formatDhakaMonthLabel(monthKey, 'bn', 'bn') };
  };

  const getOrInitBucket = (key: string, label: string) => {
    const existing = bucketMap.get(key);
    if (existing) return existing;
    const created = {
      bucketKey: key,
      label,
      salesCount: 0,
      grossSalesPoisha: 0,
      discountsPoisha: 0,
      returnsPoisha: 0,
      cashAndMfsReceivedPoisha: 0,
      creditIssuedPoisha: 0,
      grossCogsPoisha: 0,
      restoredCogsPoisha: 0,
    };
    bucketMap.set(key, created);
    return created;
  };

  for (const s of sales) {
    const { key, label } = resolveBucketInfo(s.soldAt);
    const b = getOrInitBucket(key, label);
    b.salesCount += 1;
    b.grossSalesPoisha += s.subtotalPoisha;
    b.discountsPoisha += s.discountPoisha;
    b.cashAndMfsReceivedPoisha += s.paidPoisha;
    b.creditIssuedPoisha += Math.max(0, s.totalPoisha - s.paidPoisha);
    b.grossCogsPoisha += s.cogsPoisha;
  }

  for (const r of returns) {
    const { key, label } = resolveBucketInfo(r.returnedAt);
    const b = getOrInitBucket(key, label);
    b.returnsPoisha += r.refundTotalPoisha;
    for (const item of r.items) {
      b.restoredCogsPoisha += item.restoredCogsPoisha;
    }
  }

  const sortedKeys = Array.from(bucketMap.keys()).sort((a, b) => b.localeCompare(a));

  let totalGrossSales = 0;
  let totalDiscounts = 0;
  let totalReturns = 0;
  let totalCashAndMfs = 0;
  let totalCreditIssued = 0;
  let totalGrossCogs = 0;
  let totalRestoredCogs = 0;

  const buckets: SalesReportBucketDto[] = sortedKeys.map((key) => {
    const b = bucketMap.get(key);
    if (!b) {
      throw new Error(`Missing bucket ${key}`);
    }
    const netSales = b.grossSalesPoisha - b.discountsPoisha - b.returnsPoisha;
    const netCogs = b.grossCogsPoisha - b.restoredCogsPoisha;
    totalGrossSales += b.grossSalesPoisha;
    totalDiscounts += b.discountsPoisha;
    totalReturns += b.returnsPoisha;
    totalCashAndMfs += b.cashAndMfsReceivedPoisha;
    totalCreditIssued += b.creditIssuedPoisha;
    totalGrossCogs += b.grossCogsPoisha;
    totalRestoredCogs += b.restoredCogsPoisha;

    return {
      bucketKey: b.bucketKey,
      label: b.label,
      salesCount: b.salesCount,
      grossSalesPoisha: b.grossSalesPoisha,
      discountsPoisha: b.discountsPoisha,
      returnsPoisha: b.returnsPoisha,
      netSalesPoisha: netSales,
      cashAndMfsReceivedPoisha: b.cashAndMfsReceivedPoisha,
      creditIssuedPoisha: b.creditIssuedPoisha,
      cogsPoisha: isOwner ? netCogs : null,
      grossProfitPoisha: isOwner ? netSales - netCogs : null,
    };
  });

  let cashPoisha = 0;
  let bkashPoisha = 0;
  let nagadPoisha = 0;
  let otherPoisha = 0;
  for (const p of payments) {
    switch (p.method) {
      case 'CASH':
        cashPoisha += p.amountPoisha;
        break;
      case 'BKASH':
        bkashPoisha += p.amountPoisha;
        break;
      case 'NAGAD':
        nagadPoisha += p.amountPoisha;
        break;
      case 'OTHER':
        otherPoisha += p.amountPoisha;
        break;
    }
  }

  const totalNetSales = totalGrossSales - totalDiscounts - totalReturns;
  const totalNetCogs = totalGrossCogs - totalRestoredCogs;

  return {
    period,
    fromDate,
    toDate,
    totals: {
      salesCount: sales.length,
      grossSalesPoisha: totalGrossSales,
      discountsPoisha: totalDiscounts,
      returnsPoisha: totalReturns,
      netSalesPoisha: totalNetSales,
      cashAndMfsReceivedPoisha: totalCashAndMfs,
      creditIssuedPoisha: totalCreditIssued,
      dueCollectedPoisha: dueCollectedAgg._sum.amountPoisha ?? 0,
      cogsPoisha: isOwner ? totalNetCogs : null,
      grossProfitPoisha: isOwner ? totalNetSales - totalNetCogs : null,
    },
    paymentBreakdown: {
      cashPoisha,
      bkashPoisha,
      nagadPoisha,
      otherPoisha,
    },
    buckets,
  };
}

export async function getProductsReport(
  shopId: string,
  role: UserRole,
  from?: string,
  to?: string,
  limit = 50,
): Promise<ProductsReportResponse> {
  const today = formatDhakaYmd();
  const { fromDate, toDate, startUtc, endUtc } = resolveDateRange(
    from ?? getDhakaMonthStartYmd(today),
    to ?? today,
  );
  const isOwner = role === 'OWNER';

  const [saleItems, returnItems, salesDiscountAgg, returnDiscountAgg] = await Promise.all([
    prisma.saleItem.findMany({
      where: {
        shopId,
        sale: {
          status: { not: 'CANCELLED' },
          soldAt: { gte: startUtc, lte: endUtc },
        },
      },
      select: {
        productId: true,
        productNameBn: true,
        productNameEn: true,
        qtyBase: true,
        lineSubtotalPoisha: true,
        lineCogsPoisha: true,
        product: {
          select: {
            baseUnit: { select: { nameBn: true } },
          },
        },
      },
    }),
    prisma.saleReturnItem.findMany({
      where: {
        shopId,
        saleReturn: {
          returnedAt: { gte: startUtc, lte: endUtc },
          sale: { status: { not: 'CANCELLED' } },
        },
      },
      select: {
        productId: true,
        qtyBase: true,
        lineRefundPoisha: true,
        restoredCogsPoisha: true,
        product: {
          select: {
            nameBn: true,
            nameEn: true,
            baseUnit: { select: { nameBn: true } },
          },
        },
      },
    }),
    prisma.sale.aggregate({
      where: {
        shopId,
        status: { not: 'CANCELLED' },
        soldAt: { gte: startUtc, lte: endUtc },
      },
      _sum: { discountPoisha: true },
    }),
    prisma.saleReturn.aggregate({
      where: {
        shopId,
        returnedAt: { gte: startUtc, lte: endUtc },
        sale: { status: { not: 'CANCELLED' } },
      },
      _sum: { discountAdjustmentPoisha: true },
    }),
  ]);

  const productMap = new Map<
    string,
    {
      productId: string;
      productNameBn: string;
      productNameEn: string | null;
      baseUnitNameBn: string;
      soldQtyDec: Decimal;
      returnedQtyDec: Decimal;
      grossRevenuePoisha: number;
      returnedRevenuePoisha: number;
      grossCogsPoisha: number;
      restoredCogsPoisha: number;
    }
  >();

  for (const item of saleItems) {
    const existing = productMap.get(item.productId) ?? {
      productId: item.productId,
      productNameBn: item.productNameBn,
      productNameEn: item.productNameEn,
      baseUnitNameBn: item.product.baseUnit.nameBn,
      soldQtyDec: new Decimal(0),
      returnedQtyDec: new Decimal(0),
      grossRevenuePoisha: 0,
      returnedRevenuePoisha: 0,
      grossCogsPoisha: 0,
      restoredCogsPoisha: 0,
    };
    existing.soldQtyDec = existing.soldQtyDec.plus(new Decimal(item.qtyBase.toFixed(4)));
    existing.grossRevenuePoisha += item.lineSubtotalPoisha;
    existing.grossCogsPoisha += item.lineCogsPoisha;
    productMap.set(item.productId, existing);
  }

  for (const retItem of returnItems) {
    const existing = productMap.get(retItem.productId) ?? {
      productId: retItem.productId,
      productNameBn: retItem.product.nameBn,
      productNameEn: retItem.product.nameEn,
      baseUnitNameBn: retItem.product.baseUnit.nameBn,
      soldQtyDec: new Decimal(0),
      returnedQtyDec: new Decimal(0),
      grossRevenuePoisha: 0,
      returnedRevenuePoisha: 0,
      grossCogsPoisha: 0,
      restoredCogsPoisha: 0,
    };
    existing.returnedQtyDec = existing.returnedQtyDec.plus(new Decimal(retItem.qtyBase.toFixed(4)));
    existing.returnedRevenuePoisha += retItem.lineRefundPoisha;
    existing.restoredCogsPoisha += retItem.restoredCogsPoisha;
    productMap.set(retItem.productId, existing);
  }

  let totalGrossItemRevenuePoisha = 0;
  let totalReturnedItemRevenuePoisha = 0;
  let totalGrossCogsPoisha = 0;
  let totalRestoredCogsPoisha = 0;

  const allItems: ProductPerformanceItemDto[] = [];
  for (const entry of productMap.values()) {
    const netQtyDec = entry.soldQtyDec
      .minus(entry.returnedQtyDec)
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    const netRevenuePoisha = entry.grossRevenuePoisha - entry.returnedRevenuePoisha;
    const netCogsPoisha = entry.grossCogsPoisha - entry.restoredCogsPoisha;
    totalGrossItemRevenuePoisha += entry.grossRevenuePoisha;
    totalReturnedItemRevenuePoisha += entry.returnedRevenuePoisha;
    totalGrossCogsPoisha += entry.grossCogsPoisha;
    totalRestoredCogsPoisha += entry.restoredCogsPoisha;

    allItems.push({
      productId: entry.productId,
      productNameBn: entry.productNameBn,
      productNameEn: entry.productNameEn,
      baseUnitNameBn: entry.baseUnitNameBn,
      soldQtyBase: entry.soldQtyDec.toFixed(4),
      returnedQtyBase: entry.returnedQtyDec.toFixed(4),
      netQtyBase: netQtyDec.toFixed(4),
      grossRevenuePoisha: entry.grossRevenuePoisha,
      returnedRevenuePoisha: entry.returnedRevenuePoisha,
      netRevenuePoisha,
      netCogsPoisha: isOwner ? netCogsPoisha : null,
      grossProfitPoisha: isOwner ? netRevenuePoisha - netCogsPoisha : null,
    });
  }

  allItems.sort((a, b) => {
    if (b.netRevenuePoisha !== a.netRevenuePoisha) {
      return b.netRevenuePoisha - a.netRevenuePoisha;
    }
    return new Decimal(b.netQtyBase).comparedTo(new Decimal(a.netQtyBase));
  });

  const totalNetItemRevenuePoisha = totalGrossItemRevenuePoisha - totalReturnedItemRevenuePoisha;
  const totalInvoiceDiscountsNetPoisha =
    (salesDiscountAgg._sum.discountPoisha ?? 0) -
    (returnDiscountAgg._sum.discountAdjustmentPoisha ?? 0);
  const totalNetSalesPoisha = totalNetItemRevenuePoisha - totalInvoiceDiscountsNetPoisha;
  const totalNetCogsPoisha = totalGrossCogsPoisha - totalRestoredCogsPoisha;

  return {
    fromDate,
    toDate,
    totalGrossItemRevenuePoisha,
    totalReturnedItemRevenuePoisha,
    totalNetItemRevenuePoisha,
    totalInvoiceDiscountsNetPoisha,
    totalNetSalesPoisha,
    totalNetCogsPoisha: isOwner ? totalNetCogsPoisha : null,
    totalGrossProfitPoisha: isOwner ? totalNetSalesPoisha - totalNetCogsPoisha : null,
    items: allItems.slice(0, limit),
  };
}

export async function getProfitLossReport(
  shopId: string,
  from?: string,
  to?: string,
): Promise<ProfitLossReportResponse> {
  const today = formatDhakaYmd();
  const { fromDate, toDate, startUtc, endUtc } = resolveDateRange(
    from ?? getDhakaMonthStartYmd(today),
    to ?? today,
  );

  const [
    sales,
    saleReturns,
    stockAdjustments,
    expenses,
    purchases,
    purchaseReturns,
    supplierPaymentsAgg,
  ] = await Promise.all([
    prisma.sale.findMany({
      where: {
        shopId,
        status: { not: 'CANCELLED' },
        soldAt: { gte: startUtc, lte: endUtc },
      },
      select: {
        subtotalPoisha: true,
        discountPoisha: true,
        cogsPoisha: true,
      },
    }),
    prisma.saleReturn.findMany({
      where: {
        shopId,
        returnedAt: { gte: startUtc, lte: endUtc },
        sale: { status: { not: 'CANCELLED' } },
      },
      select: {
        refundTotalPoisha: true,
        items: { select: { restoredCogsPoisha: true } },
      },
    }),
    prisma.stockAdjustment.findMany({
      where: {
        shopId,
        adjustedAt: { gte: startUtc, lte: endUtc },
        lossPoisha: { gt: 0 },
      },
      select: {
        adjustmentType: true,
        lossPoisha: true,
      },
    }),
    prisma.expense.findMany({
      where: {
        shopId,
        incurredAt: { gte: startUtc, lte: endUtc },
      },
      select: {
        categoryId: true,
        categoryNameSnapshot: true,
        amountPoisha: true,
      },
    }),
    prisma.purchase.findMany({
      where: {
        shopId,
        purchasedAt: { gte: startUtc, lte: endUtc },
      },
      select: {
        subtotalPoisha: true,
        discountPoisha: true,
        totalPoisha: true,
        paidPoisha: true,
      },
    }),
    prisma.purchaseReturn.findMany({
      where: {
        shopId,
        returnedAt: { gte: startUtc, lte: endUtc },
      },
      select: {
        refundTotalPoisha: true,
      },
    }),
    prisma.supplierPayment.aggregate({
      where: {
        shopId,
        paidAt: { gte: startUtc, lte: endUtc },
      },
      _sum: { amountPoisha: true },
    }),
  ]);

  let grossSalesPoisha = 0;
  let discountsPoisha = 0;
  let grossCogsPoisha = 0;
  for (const s of sales) {
    grossSalesPoisha += s.subtotalPoisha;
    discountsPoisha += s.discountPoisha;
    grossCogsPoisha += s.cogsPoisha;
  }

  let salesReturnsPoisha = 0;
  let restoredCogsPoisha = 0;
  for (const sr of saleReturns) {
    salesReturnsPoisha += sr.refundTotalPoisha;
    for (const item of sr.items) {
      restoredCogsPoisha += item.restoredCogsPoisha;
    }
  }

  const netSalesPoisha = grossSalesPoisha - discountsPoisha - salesReturnsPoisha;
  const netCogsPoisha = grossCogsPoisha - restoredCogsPoisha;
  const grossProfitPoisha = netSalesPoisha - netCogsPoisha;

  let wastageLossPoisha = 0;
  let damageLossPoisha = 0;
  let expiredLossPoisha = 0;
  let countShrinkageLossPoisha = 0;
  for (const adj of stockAdjustments) {
    switch (adj.adjustmentType) {
      case 'WASTAGE':
        wastageLossPoisha += adj.lossPoisha;
        break;
      case 'DAMAGE':
        damageLossPoisha += adj.lossPoisha;
        break;
      case 'EXPIRED':
        expiredLossPoisha += adj.lossPoisha;
        break;
      case 'COUNT_ADJUST':
        countShrinkageLossPoisha += adj.lossPoisha;
        break;
    }
  }
  const totalInventoryLossPoisha =
    wastageLossPoisha + damageLossPoisha + expiredLossPoisha + countShrinkageLossPoisha;

  const expenseCategoryMap = new Map<string, ProfitLossExpenseCategoryDto>();
  let totalOperatingExpensesPoisha = 0;
  for (const exp of expenses) {
    totalOperatingExpensesPoisha += exp.amountPoisha;
    const existing = expenseCategoryMap.get(exp.categoryId);
    if (existing) {
      existing.amountPoisha += exp.amountPoisha;
    } else {
      expenseCategoryMap.set(exp.categoryId, {
        categoryId: exp.categoryId,
        categoryNameBn: exp.categoryNameSnapshot,
        amountPoisha: exp.amountPoisha,
      });
    }
  }
  const expensesByCategory = Array.from(expenseCategoryMap.values()).sort(
    (a, b) => b.amountPoisha - a.amountPoisha,
  );

  const netProfitPoisha =
    grossProfitPoisha - totalInventoryLossPoisha - totalOperatingExpensesPoisha;

  let grossPurchasesPoisha = 0;
  let purchaseDiscountsPoisha = 0;
  let purchasePaidAtBillPoisha = 0;
  for (const pur of purchases) {
    grossPurchasesPoisha += pur.subtotalPoisha;
    purchaseDiscountsPoisha += pur.discountPoisha;
    purchasePaidAtBillPoisha += pur.paidPoisha;
  }

  let purchaseReturnsPoisha = 0;
  for (const pr of purchaseReturns) {
    purchaseReturnsPoisha += pr.refundTotalPoisha;
  }

  return {
    fromDate,
    toDate,
    grossSalesPoisha,
    discountsPoisha,
    salesReturnsPoisha,
    netSalesPoisha,
    grossCogsPoisha,
    restoredCogsPoisha,
    netCogsPoisha,
    grossProfitPoisha,
    wastageLossPoisha,
    damageLossPoisha,
    expiredLossPoisha,
    countShrinkageLossPoisha,
    totalInventoryLossPoisha,
    totalOperatingExpensesPoisha,
    expensesByCategory,
    netProfitPoisha,
    purchasesSummary: {
      purchaseCount: purchases.length,
      grossPurchasesPoisha,
      purchaseDiscountsPoisha,
      purchaseReturnsPoisha,
      netPurchasesPoisha: grossPurchasesPoisha - purchaseDiscountsPoisha - purchaseReturnsPoisha,
      cashPaidToSuppliersPoisha:
        purchasePaidAtBillPoisha + (supplierPaymentsAgg._sum.amountPoisha ?? 0),
    },
  };
}

export async function getDuesReport(shopId: string): Promise<DuesReportResponse> {
  const [customersWithDue, suppliersWithPayable] = await Promise.all([
    prisma.customer.findMany({
      where: { shopId, deletedAt: null, duePoisha: { gt: 0 } },
      orderBy: [{ duePoisha: 'desc' }, { nameBn: 'asc' }],
      select: {
        id: true,
        nameBn: true,
        nameEn: true,
        phone: true,
        totalPurchasedPoisha: true,
        totalPaidPoisha: true,
        duePoisha: true,
      },
    }),
    prisma.supplier.findMany({
      where: { shopId, deletedAt: null, payablePoisha: { gt: 0 } },
      orderBy: [{ payablePoisha: 'desc' }, { nameBn: 'asc' }],
      select: {
        id: true,
        nameBn: true,
        nameEn: true,
        phone: true,
        totalPurchasedPoisha: true,
        totalPaidPoisha: true,
        payablePoisha: true,
      },
    }),
  ]);

  let totalCustomerDuePoisha = 0;
  const customers: CustomerDueReportItemDto[] = customersWithDue.map((c) => {
    totalCustomerDuePoisha += c.duePoisha;
    return {
      customerId: c.id,
      nameBn: c.nameBn,
      nameEn: c.nameEn,
      phone: c.phone,
      totalPurchasedPoisha: c.totalPurchasedPoisha,
      totalPaidPoisha: c.totalPaidPoisha,
      duePoisha: c.duePoisha,
    };
  });

  let totalSupplierPayablePoisha = 0;
  const suppliers: SupplierPayableReportItemDto[] = suppliersWithPayable.map((s) => {
    totalSupplierPayablePoisha += s.payablePoisha;
    return {
      supplierId: s.id,
      nameBn: s.nameBn,
      nameEn: s.nameEn,
      phone: s.phone,
      totalPurchasedPoisha: s.totalPurchasedPoisha,
      totalPaidPoisha: s.totalPaidPoisha,
      payablePoisha: s.payablePoisha,
    };
  });

  return {
    totalCustomerDuePoisha,
    customersWithDueCount: customers.length,
    customers,
    totalSupplierPayablePoisha,
    suppliersWithPayableCount: suppliers.length,
    suppliers,
  };
}
