import {
  bdtToPoisha,
  formatDhakaDate,
  formatDhakaDateTime,
  getDhakaYmd,
  poishaToBdtString,
  shiftDhakaYmd,
  type CashbookEntryDto,
  type ManualCashbookEntryType,
  type PaymentMethod,
} from '@dokanwala/shared';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Modal, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  Input,
  LoadingView,
  NumericInput,
  ScreenContainer,
  SyncStatusPill,
} from '@/components';
import { FilterChip } from '@/features/products/components/FilterChip';
import {
  useCashbookSummaryQuery,
  useCloseCashbookMutation,
  useCreateManualCashbookEntryMutation,
  useOpenCashbookMutation,
  useReopenCashbookMutation,
} from '@/features/reports/hooks/useCashbookReportsQueries';
import { getPaymentMethodLabel } from '@/features/sales/utils/receipt-format';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/theme/tokens';
import { getLocalizedErrorMessage } from '@/utils/api-error-message';

type EntryMethodFilter = 'ALL' | PaymentMethod;

export default function CashbookScreen() {
  const { t, language } = useAppTranslation();
  const { digitStyle, formatMoney, formatDigits } = useFormattedMoney();
  const router = useRouter();
  const isOwner = useAuthStore((s) => s.user?.role === 'OWNER');

  const todayYmd = getDhakaYmd();
  const [businessDate, setBusinessDate] = useState(todayYmd);
  const [methodFilter, setMethodFilter] = useState<EntryMethodFilter>('ALL');

  // Open Drawer inline state
  const [openingCashRaw, setOpeningCashRaw] = useState('0');
  const [openingCashAscii, setOpeningCashAscii] = useState('0');
  const [openingNote, setOpeningNote] = useState('');
  const [openError, setOpenError] = useState<string | null>(null);

  // Close Drawer modal state
  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [actualCashRaw, setActualCashRaw] = useState('');
  const [actualCashAscii, setActualCashAscii] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);

  // Manual Entry modal state
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualEntryType, setManualEntryType] = useState<ManualCashbookEntryType>('OWNER_CASH_IN');
  const [manualMethod, setManualMethod] = useState<PaymentMethod>('CASH');
  const [manualAmountRaw, setManualAmountRaw] = useState('');
  const [manualAmountAscii, setManualAmountAscii] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  const summaryQuery = useCashbookSummaryQuery(businessDate);
  const openMutation = useOpenCashbookMutation(businessDate);
  const closeMutation = useCloseCashbookMutation(businessDate);
  const reopenMutation = useReopenCashbookMutation(businessDate);
  const manualEntryMutation = useCreateManualCashbookEntryMutation(businessDate);

  const summary = summaryQuery.data?.summary;
  const fromOfflineCache = Boolean(summaryQuery.data?.fromOfflineCache);

  const filteredEntries = useMemo(() => {
    const entries = summary?.entries ?? [];
    if (methodFilter === 'ALL') return entries;
    return entries.filter((e) => e.method === methodFilter);
  }, [summary?.entries, methodFilter]);

  const liveVariancePreviewPoisha = useMemo(() => {
    if (!summary || !actualCashAscii) return null;
    try {
      const actual = bdtToPoisha(actualCashAscii);
      return actual - summary.liveExpectedClosingCashPoisha;
    } catch {
      return null;
    }
  }, [summary, actualCashAscii]);

  const handleOpenCashbook = async () => {
    let openingCashPoisha: number;
    try {
      openingCashPoisha = bdtToPoisha(openingCashAscii || '0');
    } catch {
      setOpenError(t('validation.cashbookAmountRequired'));
      return;
    }
    if (openingCashPoisha < 0) {
      setOpenError(t('validation.cashbookAmountRequired'));
      return;
    }
    setOpenError(null);
    try {
      await openMutation.mutateAsync({
        businessDate,
        openingCashPoisha,
        note: openingNote.trim() || null,
      });
    } catch (err) {
      setOpenError(getLocalizedErrorMessage(err, t));
    }
  };

  const handleConfirmClose = async () => {
    let actualClosingCashPoisha: number;
    try {
      actualClosingCashPoisha = bdtToPoisha(actualCashAscii);
    } catch {
      setCloseError(t('validation.cashbookAmountRequired'));
      return;
    }
    if (actualClosingCashPoisha < 0) {
      setCloseError(t('validation.cashbookAmountRequired'));
      return;
    }
    setCloseError(null);
    try {
      await closeMutation.mutateAsync({
        businessDate,
        actualClosingCashPoisha,
        note: closeNote.trim() || null,
      });
      setCloseModalVisible(false);
    } catch (err) {
      setCloseError(getLocalizedErrorMessage(err, t));
    }
  };

  const handleSaveManualEntry = async () => {
    let amountPoisha: number;
    try {
      amountPoisha = bdtToPoisha(manualAmountAscii);
    } catch {
      setManualError(t('validation.cashbookPositiveAmountRequired'));
      return;
    }
    if (amountPoisha <= 0) {
      setManualError(t('validation.cashbookPositiveAmountRequired'));
      return;
    }
    setManualError(null);
    try {
      await manualEntryMutation.mutateAsync({
        payload: {
          businessDate,
          entryType: manualEntryType,
          method: manualMethod,
          amountPoisha,
          note: manualNote.trim() || null,
        },
      });
      setManualAmountRaw('');
      setManualAmountAscii('');
      setManualNote('');
      setManualModalVisible(false);
    } catch (err) {
      setManualError(getLocalizedErrorMessage(err, t));
    }
  };

  const statusKey = summary?.session ? summary.session.status : 'UNOPENED';

  return (
    <ScreenContainer>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <AppText variant="screenTitle" weight="bold" style={{ flex: 1 }}>
          {t('cashbook.title')}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SyncStatusPill />
          <Button label={t('common.back')} variant="outline" onPress={() => router.back()} />
        </View>
      </View>

      {fromOfflineCache ? (
        <Card style={{ backgroundColor: Colors.warningSoft, borderColor: '#FDE68A', padding: 10 }}>
          <AppText variant="caption" weight="semibold" color={Colors.warning}>
            {t('common.offlineCachedBadge')}
          </AppText>
        </Card>
      ) : null}

      {/* Date Navigation */}
      <Card style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Button
            label={t('cashbook.prevDay')}
            variant="outline"
            onPress={() => setBusinessDate((d) => shiftDhakaYmd(d, -1))}
          />
          <View style={{ alignItems: 'center', flex: 1 }}>
            <AppText variant="body" weight="bold">
              {formatDhakaDate(`${businessDate}T12:00:00+06:00`, language, digitStyle)}
            </AppText>
            <Badge
              label={t(`cashbook.status${statusKey}`)}
              tone={
                statusKey === 'OPEN' ? 'success' : statusKey === 'CLOSED' ? 'primary' : 'warning'
              }
            />
          </View>
          <Button
            label={t('cashbook.nextDay')}
            variant="outline"
            disabled={businessDate >= todayYmd}
            onPress={() => setBusinessDate((d) => shiftDhakaYmd(d, 1))}
          />
        </View>
        {businessDate !== todayYmd ? (
          <Button
            label={t('cashbook.todayBtn')}
            variant="secondary"
            onPress={() => setBusinessDate(todayYmd)}
          />
        ) : null}
      </Card>

      {summaryQuery.isLoading ? (
        <LoadingView />
      ) : summaryQuery.isError ? (
        <ErrorState
          message={getLocalizedErrorMessage(summaryQuery.error, t)}
          onRetry={() => void summaryQuery.refetch()}
        />
      ) : summary ? (
        <>
          {/* Open Drawer Form if UNOPENED */}
          {!summary.session ? (
            <Card style={{ gap: 10, borderColor: '#99F6E4' }}>
              <AppText variant="sectionTitle" weight="bold" color={Colors.primaryPressed}>
                {t('cashbook.openSectionTitle')}
              </AppText>
              <AppText variant="caption" color={Colors.textSecondary}>
                {t('cashbook.openSectionHint')}
              </AppText>

              {summary.previousClosedCashPoisha !== null ? (
                <View style={{ gap: 6 }}>
                  <AppText variant="caption" color={Colors.primary}>
                    {t('cashbook.previousClosingHint', {
                      amount: formatMoney(summary.previousClosedCashPoisha),
                    })}
                  </AppText>
                  <Button
                    label={t('cashbook.usePreviousClosing')}
                    variant="outline"
                    onPress={() => {
                      const prevCash = summary.previousClosedCashPoisha;
                      if (prevCash === null) return;
                      const ascii = poishaToBdtString(prevCash);
                      setOpeningCashAscii(ascii);
                      setOpeningCashRaw(formatDigits(ascii));
                    }}
                  />
                </View>
              ) : null}

              <NumericInput
                label={t('cashbook.openingCashLabel')}
                accessibilityLabel={t('cashbook.openingCashLabel')}
                value={openingCashRaw}
                onChangeNormalized={(normalized, raw) => {
                  setOpeningCashAscii(normalized);
                  setOpeningCashRaw(raw);
                }}
              />

              <Input
                label={t('cashbook.noteOptionalLabel')}
                accessibilityLabel={t('cashbook.noteOptionalLabel')}
                value={openingNote}
                onChangeText={setOpeningNote}
              />

              {openError ? (
                <AppText variant="caption" color={Colors.danger}>
                  {openError}
                </AppText>
              ) : null}

              <Button
                label={t('cashbook.openButton')}
                loading={openMutation.isPending}
                onPress={() => void handleOpenCashbook()}
              />
            </Card>
          ) : null}

          {/* Drawer Cash Totals Card */}
          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body" color={Colors.textSecondary}>
                {t('cashbook.openingLabel')}
              </AppText>
              <AppText variant="body" weight="semibold">
                {formatMoney(summary.session?.openingCashPoisha ?? 0)}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body" color={Colors.success}>
                {t('cashbook.cashInLabel')}
              </AppText>
              <AppText variant="body" weight="semibold" color={Colors.success}>
                +{formatMoney(summary.totals.cashInPoisha)}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body" color={Colors.danger}>
                {t('cashbook.cashOutLabel')}
              </AppText>
              <AppText variant="body" weight="semibold" color={Colors.danger}>
                -{formatMoney(summary.totals.cashOutPoisha)}
              </AppText>
            </View>

            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: Colors.border,
                paddingTop: 8,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <AppText variant="sectionTitle" weight="bold" color={Colors.primaryPressed}>
                {t('cashbook.expectedCashLabel')}
              </AppText>
              <AppText variant="sectionTitle" weight="bold" color={Colors.primaryPressed}>
                {formatMoney(summary.liveExpectedClosingCashPoisha)}
              </AppText>
            </View>

            {summary.session?.status === 'CLOSED' &&
            summary.session.actualClosingCashPoisha !== null &&
            summary.session.variancePoisha !== null ? (
              <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="body">{t('cashbook.actualCashLabel')}</AppText>
                  <AppText variant="body" weight="bold">
                    {formatMoney(summary.session.actualClosingCashPoisha)}
                  </AppText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="body">{t('cashbook.varianceLabel')}</AppText>
                  <AppText
                    variant="body"
                    weight="bold"
                    color={
                      summary.session.variancePoisha === 0
                        ? Colors.success
                        : summary.session.variancePoisha < 0
                          ? Colors.danger
                          : Colors.primary
                    }
                  >
                    {formatMoney(summary.session.variancePoisha)} (
                    {summary.session.variancePoisha === 0
                      ? t('cashbook.varianceMatch')
                      : summary.session.variancePoisha < 0
                        ? t('cashbook.varianceShort')
                        : t('cashbook.varianceExcess')}
                    )
                  </AppText>
                </View>
              </View>
            ) : null}

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {summary.session?.status === 'OPEN' ? (
                <Button
                  label={t('cashbook.closeCashbookButton')}
                  variant="secondary"
                  onPress={() => {
                    const ascii = poishaToBdtString(summary.liveExpectedClosingCashPoisha);
                    setActualCashAscii(ascii);
                    setActualCashRaw(formatDigits(ascii));
                    setCloseError(null);
                    setCloseModalVisible(true);
                  }}
                  style={{ flexGrow: 1 }}
                />
              ) : null}
              {summary.session?.status === 'CLOSED' && isOwner ? (
                <Button
                  label={t('cashbook.reopenCashbookButton')}
                  variant="outline"
                  loading={reopenMutation.isPending}
                  onPress={() => void reopenMutation.mutateAsync({ businessDate })}
                  style={{ flexGrow: 1 }}
                />
              ) : null}
              {isOwner ? (
                <Button
                  label={t('cashbook.manualEntryButton')}
                  variant="outline"
                  onPress={() => {
                    setManualError(null);
                    setManualModalVisible(true);
                  }}
                  style={{ flexGrow: 1 }}
                />
              ) : null}
            </View>
          </Card>

          {/* Digital / MFS Breakdown */}
          <Card style={{ gap: 6 }}>
            <AppText variant="sectionTitle" weight="semibold">
              {t('cashbook.digitalSummaryTitle')}
            </AppText>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body">{t('sales.methods.BKASH')}</AppText>
              <AppText variant="body" weight="bold">
                {formatMoney(summary.totals.netBkashPoisha)}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body">{t('sales.methods.NAGAD')}</AppText>
              <AppText variant="body" weight="bold">
                {formatMoney(summary.totals.netNagadPoisha)}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body">{t('sales.methods.OTHER')}</AppText>
              <AppText variant="body" weight="bold">
                {formatMoney(summary.totals.netOtherPoisha)}
              </AppText>
            </View>
          </Card>

          {/* Entries Ledger */}
          <Card style={{ gap: 10 }}>
            <AppText variant="sectionTitle" weight="semibold">
              {t('cashbook.entriesTitle', {
                count: formatDigits(String(filteredEntries.length)),
              })}
            </AppText>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {(['ALL', 'CASH', 'BKASH', 'NAGAD', 'OTHER'] as EntryMethodFilter[]).map((method) => (
                <FilterChip
                  key={method}
                  label={
                    method === 'ALL' ? t('cashbook.filterAll') : getPaymentMethodLabel(method, t)
                  }
                  selected={methodFilter === method}
                  onPress={() => setMethodFilter(method)}
                />
              ))}
            </View>

            {filteredEntries.length === 0 ? (
              <AppText variant="body" color={Colors.textMuted}>
                {t('cashbook.emptyEntries')}
              </AppText>
            ) : (
              filteredEntries.map((entry: CashbookEntryDto) => (
                <View
                  key={entry.id}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: Colors.border,
                    gap: 8,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Badge
                        label={getPaymentMethodLabel(entry.method, t)}
                        tone={entry.direction === 'IN' ? 'success' : 'warning'}
                      />
                      <AppText variant="body" weight="semibold">
                        {t(`cashbook.entryTypes.${entry.entryType}`)}
                      </AppText>
                    </View>
                    <AppText variant="caption" color={Colors.textSecondary}>
                      {entry.referenceNumber ? `${entry.referenceNumber} • ` : ''}
                      {entry.note ? `${entry.note} • ` : ''}
                      {formatDhakaDateTime(entry.occurredAt, language, digitStyle)}
                    </AppText>
                  </View>
                  <AppText
                    variant="body"
                    weight="bold"
                    color={entry.direction === 'IN' ? Colors.success : Colors.danger}
                  >
                    {entry.direction === 'IN' ? '+' : '-'}
                    {formatMoney(entry.amountPoisha)}
                  </AppText>
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}

      {/* Close Cashbook Modal */}
      <Modal
        visible={closeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCloseModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <Card style={{ gap: 12 }}>
            <AppText variant="sectionTitle" weight="bold">
              {t('cashbook.closeModalTitle')}
            </AppText>
            {summary ? (
              <AppText variant="body" color={Colors.primaryPressed}>
                {t('cashbook.expectedCashLabel')}:{' '}
                {formatMoney(summary.liveExpectedClosingCashPoisha)}
              </AppText>
            ) : null}

            <NumericInput
              label={t('cashbook.actualCashCountLabel')}
              accessibilityLabel={t('cashbook.actualCashCountLabel')}
              value={actualCashRaw}
              onChangeNormalized={(normalized, raw) => {
                setActualCashAscii(normalized);
                setActualCashRaw(raw);
              }}
            />

            {liveVariancePreviewPoisha !== null ? (
              <AppText
                variant="body"
                weight="semibold"
                color={
                  liveVariancePreviewPoisha === 0
                    ? Colors.success
                    : liveVariancePreviewPoisha < 0
                      ? Colors.danger
                      : Colors.primary
                }
              >
                {t('cashbook.variancePreviewLabel')}: {formatMoney(liveVariancePreviewPoisha)}
              </AppText>
            ) : null}

            <Input
              label={t('cashbook.noteOptionalLabel')}
              accessibilityLabel={t('cashbook.noteOptionalLabel')}
              value={closeNote}
              onChangeText={setCloseNote}
            />

            {closeError ? (
              <AppText variant="caption" color={Colors.danger}>
                {closeError}
              </AppText>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                label={t('common.cancel')}
                variant="outline"
                onPress={() => setCloseModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                label={t('cashbook.confirmCloseButton')}
                loading={closeMutation.isPending}
                onPress={() => void handleConfirmClose()}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      {/* Manual Owner Cash In / Drawing Modal */}
      <Modal
        visible={manualModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setManualModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <Card style={{ gap: 12 }}>
            <AppText variant="sectionTitle" weight="bold">
              {t('cashbook.manualModalTitle')}
            </AppText>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <FilterChip
                label={t('cashbook.entryTypeCashIn')}
                selected={manualEntryType === 'OWNER_CASH_IN'}
                onPress={() => setManualEntryType('OWNER_CASH_IN')}
              />
              <FilterChip
                label={t('cashbook.entryTypeDrawingOut')}
                selected={manualEntryType === 'OWNER_DRAWING_OUT'}
                onPress={() => setManualEntryType('OWNER_DRAWING_OUT')}
              />
            </View>

            <View style={{ gap: 6 }}>
              <AppText variant="caption" color={Colors.textSecondary}>
                {t('cashbook.methodLabel')}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {(['CASH', 'BKASH', 'NAGAD', 'OTHER'] as PaymentMethod[]).map((method) => (
                  <FilterChip
                    key={method}
                    label={getPaymentMethodLabel(method, t)}
                    selected={manualMethod === method}
                    onPress={() => setManualMethod(method)}
                  />
                ))}
              </View>
            </View>

            <NumericInput
              label={t('cashbook.amountLabel')}
              accessibilityLabel={t('cashbook.amountLabel')}
              value={manualAmountRaw}
              onChangeNormalized={(normalized, raw) => {
                setManualAmountAscii(normalized);
                setManualAmountRaw(raw);
              }}
            />

            <Input
              label={t('cashbook.noteOptionalLabel')}
              accessibilityLabel={t('cashbook.noteOptionalLabel')}
              value={manualNote}
              onChangeText={setManualNote}
            />

            {manualError ? (
              <AppText variant="caption" color={Colors.danger}>
                {manualError}
              </AppText>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                label={t('common.cancel')}
                variant="outline"
                onPress={() => setManualModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                label={t('common.save')}
                loading={manualEntryMutation.isPending}
                onPress={() => void handleSaveManualEntry()}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
