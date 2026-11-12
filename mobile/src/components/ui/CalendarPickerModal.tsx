import {
  getDhakaYmd,
  shiftDhakaYmd,
  toBanglaDigits,
  toEnglishDigits,
} from '@dokanwala/shared';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { Colors } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';

const MONTHS_BN = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
] as const;

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAYS_BN = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহ', 'শুক্র', 'শনি'] as const;
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function parseYmdParts(raw: string): { year: number; month: number; day: number } {
  const clean = toEnglishDigits(raw.trim());
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (
      dt.getUTCFullYear() === year &&
      dt.getUTCMonth() === month - 1 &&
      dt.getUTCDate() === day
    ) {
      return { year, month, day };
    }
  }
  const today = getDhakaYmd();
  const [y, m, d] = today.split('-').map(Number);
  return { year: y ?? 2026, month: m ?? 1, day: d ?? 1 };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatReadableDhakaYmd(
  rawYmd: string,
  language: 'bn' | 'en',
  digitStyle: 'bn' | 'en',
): string {
  const { year, month, day } = parseYmdParts(rawYmd);
  const monthLabel =
    language === 'bn' ? (MONTHS_BN[month - 1] ?? '') : (MONTHS_EN[month - 1] ?? '');
  const formatted =
    language === 'bn'
      ? `${day} ${monthLabel} ${year}`
      : `${day} ${monthLabel} ${year}`;
  return digitStyle === 'bn' ? toBanglaDigits(formatted) : formatted;
}

interface CalendarPickerModalProps {
  visible: boolean;
  selectedYmd: string;
  onSelectYmd: (ymd: string) => void;
  onClose: () => void;
  title?: string;
}

export function CalendarPickerModal({
  visible,
  selectedYmd,
  onSelectYmd,
  onClose,
  title,
}: CalendarPickerModalProps) {
  const { t, language } = useAppTranslation();
  const { digitStyle } = useFormattedMoney();

  const todayYmd = getDhakaYmd();
  const parsedSelected = parseYmdParts(selectedYmd);
  const normalizedSelected = `${parsedSelected.year}-${pad2(parsedSelected.month)}-${pad2(parsedSelected.day)}`;

  const [cursorYear, setCursorYear] = useState(parsedSelected.year);
  const [cursorMonth, setCursorMonth] = useState(parsedSelected.month);

  const monthLabel = useMemo(() => {
    const name =
      language === 'bn'
        ? (MONTHS_BN[cursorMonth - 1] ?? '')
        : (MONTHS_EN[cursorMonth - 1] ?? '');
    const text = `${name} ${cursorYear}`;
    return digitStyle === 'bn' ? toBanglaDigits(text) : text;
  }, [cursorMonth, cursorYear, digitStyle, language]);

  const weekdays = language === 'bn' ? WEEKDAYS_BN : WEEKDAYS_EN;

  const calendarCells = useMemo(() => {
    const firstWeekday = new Date(Date.UTC(cursorYear, cursorMonth - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(cursorYear, cursorMonth, 0)).getUTCDate();
    const cells: ({ day: number; ymd: string } | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) {
      cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({
        day,
        ymd: `${cursorYear}-${pad2(cursorMonth)}-${pad2(day)}`,
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    return cells;
  }, [cursorMonth, cursorYear]);

  const weeks = useMemo(() => {
    const rows: ({ day: number; ymd: string } | null)[][] = [];
    for (let i = 0; i < calendarCells.length; i += 7) {
      rows.push(calendarCells.slice(i, i + 7));
    }
    return rows;
  }, [calendarCells]);

  const goPrevMonth = () => {
    if (cursorMonth === 1) {
      setCursorYear((y) => y - 1);
      setCursorMonth(12);
    } else {
      setCursorMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (cursorMonth === 12) {
      setCursorYear((y) => y + 1);
      setCursorMonth(1);
    } else {
      setCursorMonth((m) => m + 1);
    }
  };

  const pickAndClose = (ymd: string) => {
    const p = parseYmdParts(ymd);
    setCursorYear(p.year);
    setCursorMonth(p.month);
    onSelectYmd(ymd);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: Colors.surface,
            borderRadius: 18,
            padding: 16,
            gap: 12,
            borderWidth: 1,
            borderColor: Colors.border,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <AppText variant="sectionTitle" weight="bold">
              {title ?? t('expenses.calendarModalTitle')}
            </AppText>
            <Pressable accessibilityRole="button" onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>

          {/* Month Navigation */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: Colors.background,
              borderRadius: 12,
              padding: 8,
            }}
          >
            <Pressable
              accessibilityRole="button"
              testID="calendar-prev-month-btn"
              onPress={goPrevMonth}
              style={{
                padding: 8,
                borderRadius: 8,
                backgroundColor: Colors.surface,
                borderWidth: 1,
                borderColor: Colors.border,
              }}
            >
              <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />
            </Pressable>

            <AppText variant="body" weight="bold">
              {monthLabel}
            </AppText>

            <Pressable
              accessibilityRole="button"
              testID="calendar-next-month-btn"
              onPress={goNextMonth}
              style={{
                padding: 8,
                borderRadius: 8,
                backgroundColor: Colors.surface,
                borderWidth: 1,
                borderColor: Colors.border,
              }}
            >
              <Ionicons name="chevron-forward" size={18} color={Colors.textPrimary} />
            </Pressable>
          </View>

          {/* Quick Jump Row */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label={t('expenses.dateQuickToday')}
              variant="outline"
              onPress={() => pickAndClose(todayYmd)}
            />
            <Button
              label={t('expenses.dateQuickYesterday')}
              variant="outline"
              onPress={() => pickAndClose(shiftDhakaYmd(todayYmd, -1))}
            />
          </View>

          {/* Weekday Headers */}
          <View style={{ flexDirection: 'row' }}>
            {weekdays.map((wd) => (
              <View key={wd} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                <AppText variant="caption" weight="semibold" color={Colors.textSecondary}>
                  {wd}
                </AppText>
              </View>
            ))}
          </View>

          {/* Month Grid */}
          <View style={{ gap: 4 }}>
            {weeks.map((week, rowIdx) => (
              <View key={rowIdx} style={{ flexDirection: 'row', gap: 4 }}>
                {week.map((cell, colIdx) => {
                  if (!cell) {
                    return <View key={`empty-${rowIdx}-${colIdx}`} style={{ flex: 1, height: 38 }} />;
                  }
                  const isSelected = cell.ymd === normalizedSelected;
                  const isToday = cell.ymd === todayYmd;
                  const dayLabel =
                    digitStyle === 'bn' ? toBanglaDigits(String(cell.day)) : String(cell.day);
                  return (
                    <Pressable
                      key={cell.ymd}
                      accessibilityRole="button"
                      testID={`calendar-day-${cell.ymd}`}
                      onPress={() => pickAndClose(cell.ymd)}
                      style={{
                        flex: 1,
                        height: 38,
                        borderRadius: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected ? Colors.primary : Colors.background,
                        borderWidth: isToday && !isSelected ? 1.5 : 1,
                        borderColor: isSelected
                          ? Colors.primary
                          : isToday
                            ? Colors.primary
                            : Colors.border,
                      }}
                    >
                      <AppText
                        variant="body"
                        weight={isSelected || isToday ? 'bold' : 'regular'}
                        color={isSelected ? Colors.surface : Colors.textPrimary}
                      >
                        {dayLabel}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <Button label={t('common.cancel')} variant="outline" fullWidth onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
