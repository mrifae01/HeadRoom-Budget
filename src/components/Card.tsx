/**
 * Card — a white rounded surface with optional shadow.
 * Used across all screens as the primary container unit.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius, shadows, spacing } from '../theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Applies a stronger shadow */
  elevated?: boolean;
}

export default function Card({ children, style, elevated = false }: CardProps) {
  return (
    <View style={[styles.card, elevated ? shadows.md : shadows.sm, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
  },
});
