/**
 * Theme — central design tokens for Headroom.
 *
 * Two palettes are exported: `lightColors` and `darkColors`.
 * The `colors` export remains as the light palette for any legacy static
 * imports, but all components should consume colors via `useTheme()` so
 * dark mode applies instantly on toggle.
 */

export const lightColors = {
  // Primary palette — blues
  primary: '#2563EB',
  primaryLight: '#DBEAFE',
  primaryDark: '#1D4ED8',

  // Accent palette — greens
  accent: '#10B981',
  accentLight: '#D1FAE5',
  accentDark: '#059669',

  // Semantic
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',

  // Neutrals
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  border: '#E2E8F0',
  borderFocus: '#93C5FD',

  // Text
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',

  // Chat bubbles
  bubbleUser: '#2563EB',
  bubbleAI: '#FFFFFF',
};

export const darkColors = {
  // Primary palette — slightly brighter for dark backgrounds
  primary: '#3B82F6',
  primaryLight: '#1E3A5F',
  primaryDark: '#2563EB',

  // Accent palette
  accent: '#10B981',
  accentLight: '#064E3B',
  accentDark: '#059669',

  // Semantic — lighter reds/ambers read better on dark
  danger: '#F87171',
  dangerLight: '#450A0A',
  warning: '#FBBF24',
  warningLight: '#451A03',

  // Neutrals — inverted hierarchy
  background: '#0F172A',   // deep navy — page bg
  surface: '#1E293B',      // dark slate — cards
  surfaceAlt: '#0F172A',   // same as bg — inputs recede into cards
  border: '#334155',
  borderFocus: '#3B82F6',

  // Text
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textInverse: '#FFFFFF',

  // Chat bubbles
  bubbleUser: '#2563EB',
  bubbleAI: '#1E293B',
};

/** Convenience alias — light palette (backward compat for any static imports) */
export const colors = lightColors;

/** The shape of a color palette — used as the generic parameter in ThemeContext */
export type Colors = typeof lightColors;

export const typography = {
  // Font sizes
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  '2xl': 30,
  '3xl': 36,

  // Font weights (React Native uses string literals)
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,

  // Line heights
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
};

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
};
