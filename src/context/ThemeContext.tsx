/**
 * ThemeContext — app-wide dark / light mode state.
 *
 * Usage:
 *   const { colors, isDark, toggleDark } = useTheme();
 *
 * Wrap the app root with <ThemeProvider>. The preference is persisted to
 * AsyncStorage so it survives app restarts.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, Colors } from '../theme';

const STORAGE_KEY = '@headroom_dark_mode';

// ─── Context shape ────────────────────────────────────────────────────────────

interface ThemeContextValue {
  /** The active color palette — swap this for all color references */
  colors: Colors;
  /** True when dark mode is active */
  isDark: boolean;
  /** Toggle dark mode on / off and persist the preference */
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Access the active theme from any component. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  // Load saved preference on startup
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((val) => { if (val === 'true') setIsDark(true); })
      .catch(() => {/* non-fatal — default to light */});
  }, []);

  const toggleDark = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY, String(next)).catch(() => {});
      return next;
    });
  }, []);

  // Only swap the palette reference when isDark flips — stable otherwise
  const colors = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);

  return (
    <ThemeContext.Provider value={{ colors, isDark, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}
