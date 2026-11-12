// Validated mockups: white page, colour only in small accents, light weights.
export const colors = {
  page: '#FFFFFF',
  ink: '#2B2840',
  muted: '#8A8799',
  line: '#ECEBF0',
  accent: '#C7795A',
  danger: '#B4483C',
  positive: '#178A55',
  positiveSoft: '#EEF6F1',
  soft: '#F1F1F5',
  dashed: '#D6D6DE',
  // Investments: one restrained blue.
  invest: '#3D5AC2',
  investSoft: '#DCE2F6',
  // Transfers waiting for the person to confirm.
  pending: '#C2600A',
  pendingSoft: '#FFF6EC',
  pendingLine: '#F3D9BE',
  pendingText: '#8A4A0B',
  // Lines of a statement the app could not read.
  warning: '#9A5B00',
} as const;

export const fonts = {
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
} as const;
