export const Colors = {
  primary: '#0F766E',
  primaryPressed: '#115E59',
  primarySoft: '#CCFBF1',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  success: '#15803D',
  successSoft: '#DCFCE7',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  danger: '#B91C1C',
  dangerSoft: '#FEE2E2',
  white: '#FFFFFF',
} as const;

export const Typography = {
  kpiHero: { fontSize: 26, lineHeight: 38 },
  screenTitle: { fontSize: 20, lineHeight: 30 },
  sectionTitle: { fontSize: 17, lineHeight: 26 },
  body: { fontSize: 15, lineHeight: 24 },
  caption: { fontSize: 13, lineHeight: 20 },
} as const;

export const FontFamilies = {
  regular: 'NotoSansBengali_400Regular',
  medium: 'NotoSansBengali_500Medium',
  semibold: 'NotoSansBengali_600SemiBold',
  bold: 'NotoSansBengali_700Bold',
  latinRegular: 'Inter_400Regular',
  latinMedium: 'Inter_500Medium',
  latinSemiBold: 'Inter_600SemiBold',
  latinBold: 'Inter_700Bold',
} as const;

export const Layout = {
  minTouchTarget: 48,
  cardRadius: 12,
  controlRadius: 10,
  screenPadding: 16,
} as const;
