import { StyleSheet } from 'react-native';

import { PAGE_MAX, PAGE_PAD } from '@/lib/dashboard';
import { colors, fonts } from '@/theme';

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40, alignItems: 'center' },
  wideContent: { paddingHorizontal: PAGE_PAD, paddingTop: 28, paddingBottom: 48 },
  column: { width: '100%', maxWidth: 520 },
  wideColumn: { width: '100%', maxWidth: PAGE_MAX - PAGE_PAD * 2, gap: 16 },
  back: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, marginBottom: 12 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  title: { fontFamily: fonts.semibold, fontSize: 20, color: colors.ink },
  lead: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
  chips: { flexDirection: 'row', gap: 6 },
  phoneChips: { flexDirection: 'row', gap: 6, marginTop: 14 },
  empty: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.muted },
  emptyBox: { marginTop: 24 },

  // Bill month picker.
  nav: { flexDirection: 'row', alignItems: 'center' },
  arrow: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontFamily: fonts.regular, fontSize: 22, color: colors.muted },
  off: { opacity: 0.3 },
  navText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },

  // One card.
  card: { marginTop: 22 },
  wideCard: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 18 },
  cardName: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.7,
    color: colors.muted,
    marginBottom: 6,
  },
  heroLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  heroValue: { fontFamily: fonts.regular, fontSize: 34, color: colors.ink, marginTop: 4 },
  status: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 4 },
  paid: { color: colors.positive },
  late: { color: colors.pendingText },
  nextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  nextText: { flex: 1, gap: 2 },
  nextTitle: { fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  nextValue: { fontFamily: fonts.regular, fontSize: 15, color: colors.ink },

  // Computer: three figures in a row, then the purchases.
  figures: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line, borderRadius: 12 },
  figure: { flex: 1, minWidth: 0, paddingVertical: 14, paddingHorizontal: 16, gap: 4 },
  divider: { borderLeftWidth: 1, borderLeftColor: colors.line },
  figureLabel: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0.7, color: colors.muted },
  figureValue: { fontFamily: fonts.regular, fontSize: 24, color: colors.ink },

  segment: { marginTop: 18 },
  listTitle: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.7,
    color: colors.muted,
    marginTop: 20,
    marginBottom: 2,
  },
  listEmpty: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 12 },

  // Início's line about the card bill.
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
  },
  linkText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  linkAction: { fontFamily: fonts.medium, fontSize: 14, color: colors.accent },
});
