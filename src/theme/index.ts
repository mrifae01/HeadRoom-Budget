/**
 * Theme — central design tokens for Headroom.
 * Import { colors, typography, spacing, radius } from '@/theme' throughout the app.
 */

export const colors = {
  // Primary palette — blues
  primary: '#2563EB',       // vivid blue — main CTAs
  primaryLight: '#DBEAFE',  // pale blue — backgrounds / highlights
  primaryDark: '#1D4ED8',   // deep blue — pressed states

  // Accent palette — greens
  accent: '#10B981',        // emerald green — positive metrics
  accentLight: '#D1FAE5',   // pale green — backgrounds
  accentDark: '#059669',    // deep green — pressed states

  // Semantic
  danger: '#EF4444',        // red — debt / over-budget
  dangerLight: '#FEE2E2',
  warning: '#F59E0B',       // amber — approaching limit
  warningLight: '#FEF3C7',

  // Neutrals
  background: '#F8FAFC',    // page background
  surface: '#FFFFFF',       // card surface
  surfaceAlt: '#F1F5F9',    // secondary surface (e.g. input fill)
  border: '#E2E8F0',        // dividers and borders
  borderFocus: '#93C5FD',   // focused input border

  // Text
  textPrimary: '#0F172A',   // headings
  textSecondary: '#475569', // body / labels
  textMuted: '#94A3B8',     // placeholders / captions
  textInverse: '#FFFFFF',   // text on dark backgrounds

  // Chat bubbles
  bubbleUser: '#2563EB',
  bubbleAI: '#FFFFFF',
};

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
