import { formatDhakaDateTime, formatQuantityDisplay } from '@dokanwala/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingView,
  ScreenContainer,
} from '@/components';
import { useSaleDetailQuery } from '@/features/sales/hooks/useSalesQueries';
import {
  buildShareableReceiptText,
  getPaymentMethodLabel,
  getSaleStatusBadge,
} from '@/features/sales/utils/receipt-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { salesApi } from '@/services/api/sales';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';
import { printPdfBytesOrShare, saveAndShareBytes } from '@/utils/file-export';

export default function ReceiptScreen() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();
  const params = useLocalSearchParams<{ saleId?: string }>();
  const saleId = typeof params.saleId === 'string' ? params.saleId : undefined;

  const shop = useAuthStore((s) => s.shop);
  const detailQuery = useSaleDetailQuery(saleId);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<'share' | 'print' | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const sale = detailQuery.data?.sale;

  const shareText = useMemo(() => {
    if (!sale) return '';
    return buildShareableReceiptText({
      sale,
      shop,
      language,
      digitStyle,
    });
  }, [digitStyle, language, sale, shop]);

  if (detailQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingView />
      </ScreenContainer>
    );
  }

  if (detailQuery.isError || !sale) {
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

  const shopTitle =
    language === 'en' && shop?.nameEn && shop.nameEn.trim().length > 0
      ? shop.nameEn
      : (shop?.nameBn ?? t('app.name'));
  const shopAddress = language === 'en' ? (shop?.addressEn ?? shop?.addressBn) : shop?.addressBn;
  const footerText = shop?.receiptFooterBn?.trim() || t('receipt.defaultFooter');
  const statusBadge = getSaleStatusBadge(sale.status, t);

  const handleShare = async () => {
    setShareFeedback(null);
    setPdfError(null);
    try {
      await Share.share({
        message: shareText,
        title: `${t('receipt.title')} - ${sale.receiptNumber}`,
      });
    } catch {
      const nav = globalThis.navigator as
        { clipboard?: { writeText?: (text: string) => Promise<void> } } | undefined;
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(shareText);
        setShareFeedback(t('receipt.copiedFeedback'));
      }
    }
  };

  const handleReceiptPdf = async (mode: 'share' | 'print') => {
    setShareFeedback(null);
    setPdfError(null);
    setPdfBusy(mode);
    try {
      const pdf = await salesApi.downloadReceiptPdf(sale.id, language);
      if (mode === 'print') {
        await printPdfBytesOrShare({
          bytes: pdf.bytes,
          filename: pdf.filename,
          dialogTitle: `${t('receipt.title')} - ${sale.receiptNumber}`,
        });
      } else {
        await saveAndShareBytes({
          bytes: pdf.bytes,
          filename: pdf.filename,
          mimeType: 'application/pdf',
          dialogTitle: `${t('receipt.title')} - ${sale.receiptNumber}`,
        });
      }
      setShareFeedback(t('receipt.pdfSavedFeedback'));
    } catch (err) {
      setPdfError(getLocalizedErrorMessage(err, t));
    } finally {
      setPdfBusy(null);
    }
  };

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {t('receipt.title')}
        </AppText>
        <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
      </View>

      {shareFeedback ? (
        <Card
          testID="receipt-feedback-banner"
          style={{ backgroundColor: Colors.successSoft, borderColor: '#A7F3D0', padding: 10 }}
        >
          <AppText variant="caption" weight="semibold" color={Colors.success}>
            {shareFeedback}
          </AppText>
        </Card>
      ) : null}

      {pdfError ? (
        <Card style={{ backgroundColor: Colors.dangerSoft, borderColor: '#FECACA', padding: 10 }}>
          <AppText variant="caption" weight="semibold" color={Colors.danger}>
            {pdfError}
          </AppText>
        </Card>
      ) : null}

      {/* Styled Bangla Receipt Card */}
      <Card style={{ gap: 10, padding: 18 }}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <AppText variant="sectionTitle" weight="bold">
            {shopTitle}
          </AppText>
          {shop?.receiptHeaderBn ? (
            <AppText variant="caption" color={Colors.textSecondary}>
              {shop.receiptHeaderBn}
            </AppText>
          ) : null}
          {shopAddress ? (
            <AppText variant="caption" color={Colors.textSecondary}>
              {shopAddress}
            </AppText>
          ) : null}
          {shop?.phone ? (
            <AppText variant="caption" color={Colors.textSecondary}>
              {formatDigits(shop.phone)}
            </AppText>
          ) : null}
          <Badge label={statusBadge.label} tone={statusBadge.tone} />
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8, gap: 4 }}>
          <AppText variant="caption" color={Colors.textSecondary}>
            {t('receipt.receiptNo')}:{' '}
            <AppText variant="caption" weight="bold" color={Colors.textPrimary}>
              {formatDigits(sale.receiptNumber)}
            </AppText>
          </AppText>
          <AppText variant="caption" color={Colors.textSecondary}>
            {t('receipt.time')}: {formatDhakaDateTime(sale.soldAt, language, digitStyle)}
          </AppText>
          <AppText variant="caption" color={Colors.textSecondary}>
            {t('receipt.customer')}: {sale.customerNameSnapshot ?? t('pos.walkInCustomer')}
          </AppText>
          {sale.actorName ? (
            <AppText variant="caption" color={Colors.textSecondary}>
              {t('receipt.cashier')}: {sale.actorName}
            </AppText>
          ) : null}
        </View>

        {/* Line Items */}
        <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8, gap: 8 }}>
          <AppText variant="caption" weight="bold" color={Colors.textSecondary}>
            {t('receipt.itemsHeader')}
          </AppText>
          {sale.items.map((item) => {
            const name =
              language === 'en' && item.productNameEn ? item.productNameEn : item.productNameBn;
            const unitLabel = language === 'en' ? item.unitNameEn : item.unitNameBn;
            return (
              <View
                key={item.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <AppText variant="body" weight="semibold">
                    {name}
                  </AppText>
                  <AppText variant="caption" color={Colors.textSecondary}>
                    {formatDigits(formatQuantityDisplay(item.qtyDisplay, 3))} {unitLabel} ×{' '}
                    {formatMoney(item.unitSellingPricePoisha)}
                  </AppText>
                </View>
                <AppText variant="body" weight="bold">
                  {formatMoney(item.lineSubtotalPoisha)}
                </AppText>
              </View>
            );
          })}
        </View>

        {/* Summary */}
        <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="body" color={Colors.textSecondary}>
              {t('receipt.subtotal')}
            </AppText>
            <AppText variant="body">{formatMoney(sale.subtotalPoisha)}</AppText>
          </View>
          {sale.discountPoisha > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body" color={Colors.textSecondary}>
                {t('receipt.discount')}
              </AppText>
              <AppText variant="body" color={Colors.danger}>
                -{formatMoney(sale.discountPoisha)}
              </AppText>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="sectionTitle" weight="bold">
              {t('receipt.netTotal')}
            </AppText>
            <AppText variant="sectionTitle" weight="bold" color={Colors.primary}>
              {formatMoney(sale.totalPoisha)}
            </AppText>
          </View>

          {sale.payments.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="caption" color={Colors.textSecondary}>
                {t('receipt.paid')} ({getPaymentMethodLabel(p.method, t)})
              </AppText>
              <AppText variant="caption" weight="semibold">
                {formatMoney(p.amountPoisha)}
              </AppText>
            </View>
          ))}

          {sale.tenderedPoisha !== null ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="caption" color={Colors.textSecondary}>
                  {t('receipt.tendered')}
                </AppText>
                <AppText variant="caption">{formatMoney(sale.tenderedPoisha)}</AppText>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="caption" color={Colors.textSecondary}>
                  {t('receipt.change')}
                </AppText>
                <AppText variant="caption" weight="bold">
                  {formatMoney(sale.changePoisha)}
                </AppText>
              </View>
            </>
          ) : null}

          {sale.duePoisha > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body" weight="bold" color={Colors.danger}>
                {t('receipt.due')}
              </AppText>
              <AppText variant="body" weight="bold" color={Colors.danger}>
                {formatMoney(sale.duePoisha)}
              </AppText>
            </View>
          ) : null}

          {sale.returnedTotalPoisha > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="caption" weight="bold" color={Colors.warning}>
                {t('receipt.returned')}
              </AppText>
              <AppText variant="caption" weight="bold" color={Colors.warning}>
                {formatMoney(sale.returnedTotalPoisha)}
              </AppText>
            </View>
          ) : null}
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: Colors.border,
            paddingTop: 10,
            alignItems: 'center',
          }}
        >
          <AppText variant="body" weight="semibold" color={Colors.textPrimary}>
            {footerText}
          </AppText>
        </View>
      </Card>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            label={t('receipt.pdfButton')}
            testID="receipt-pdf-btn"
            variant="secondary"
            loading={pdfBusy === 'share'}
            onPress={() => void handleReceiptPdf('share')}
            style={{ flex: 1 }}
          />
          <Button
            label={t('receipt.printButton')}
            testID="receipt-print-btn"
            variant="outline"
            loading={pdfBusy === 'print'}
            onPress={() => void handleReceiptPdf('print')}
            style={{ flex: 1 }}
          />
        </View>
        <Button label={t('receipt.shareButton')} fullWidth onPress={() => void handleShare()} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            label={t('receipt.viewDetailButton')}
            variant="outline"
            onPress={() => router.replace(`/sales/${sale.id}`)}
            style={{ flex: 1 }}
          />
          <Button
            label={t('receipt.newSaleButton')}
            variant="secondary"
            onPress={() => router.replace('/(tabs)/sales')}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}
