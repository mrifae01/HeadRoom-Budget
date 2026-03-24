/**
 * SectionHeader — a labelled divider used inside form screens.
 * Renders a title with an optional subtitle and a colored left accent bar.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, radius } from '../theme';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  accentColor?: string;
}

export default function SectionHeader({
  title,
  subtitle,
  accentColor = colors.primary,
}: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <View>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[3],
    gap: spacing[3],
  },
  accent: {
    width: 4,
    height: 36,
    borderRadius: radius.full,
  },
  title: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
