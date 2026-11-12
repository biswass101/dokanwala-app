import type {
  DashboardSummaryResponse,
  DuesReportResponse,
  ProductsReportResponse,
  ProfitLossReportResponse,
  ReportExportFormat,
  ReportExportKind,
  ReportExportLang,
  SalesReportPeriod,
  SalesReportResponse,
} from '@dokanwala/shared';
import { apiClient, unwrapApiGet } from './client';

export const reportsApi = {
  getDashboard(): Promise<{ dashboard: DashboardSummaryResponse }> {
    return unwrapApiGet('/reports/dashboard');
  },

  getSalesReport(params: {
    period: SalesReportPeriod;
    from?: string;
    to?: string;
  }): Promise<{ report: SalesReportResponse }> {
    const query: Record<string, string> = { period: params.period };
    if (params.from) query.from = params.from;
    if (params.to) query.to = params.to;
    return unwrapApiGet('/reports/sales', query);
  },

  getProductsReport(params?: {
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<{ report: ProductsReportResponse }> {
    const query: Record<string, string | number> = {};
    if (params?.from) query.from = params.from;
    if (params?.to) query.to = params.to;
    if (params?.limit) query.limit = params.limit;
    return unwrapApiGet('/reports/products', query);
  },

  getProfitLossReport(params?: {
    from?: string;
    to?: string;
  }): Promise<{ report: ProfitLossReportResponse }> {
    const query: Record<string, string> = {};
    if (params?.from) query.from = params.from;
    if (params?.to) query.to = params.to;
    return unwrapApiGet('/reports/profit-loss', query);
  },

  getDuesReport(): Promise<{ report: DuesReportResponse }> {
    return unwrapApiGet('/reports/dues');
  },

  async downloadExport(params: {
    report: ReportExportKind;
    format: ReportExportFormat;
    lang: ReportExportLang;
    period?: SalesReportPeriod;
    from?: string;
    to?: string;
  }): Promise<{ bytes: Uint8Array; filename: string; mimeType: string }> {
    const query: Record<string, string> = {
      report: params.report,
      format: params.format,
      lang: params.lang,
    };
    if (params.period) query.period = params.period;
    if (params.from) query.from = params.from;
    if (params.to) query.to = params.to;

    const response = await apiClient.get<ArrayBuffer>('/reports/export', {
      params: query,
      responseType: 'arraybuffer',
    });

    const disposition = String(response.headers['content-disposition'] ?? '');
    const match = /filename="([^"]+)"/.exec(disposition);
    const filename = match?.[1] ?? `dokanwala-${params.report}.${params.format}`;
    const mimeType =
      params.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/pdf';

    return {
      bytes: new Uint8Array(response.data),
      filename,
      mimeType,
    };
  },
};
