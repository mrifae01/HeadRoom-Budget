/**
 * Card — a rounded surface with optional shadow.
 * Used across all screens as the primary container unit.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, radius, shadows, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
}

const createStyles = (c: Colors) => StyleSheet.create({
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: c.border,
  },
});

export default function Card({ children, style, elevated = false }: CardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.card, elevated ? shadows.md : shadows.sm, style]}>
      {children}
    </View>
  );
}
