/**
 * SectionHeader — a labelled divider used inside form screens.
 * Renders a title with an optional subtitle and a colored left accent bar.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, typography, spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  accentColor?: string;
}

const createStyles = (c: Colors) => StyleSheet.create({
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
    color: c.textPrimary,
  },
  subtitle: {
    fontSize: typography.sm,
    color: c.textSecondary,
    marginTop: 2,
  },
});

export default function SectionHeader({
  title,
  subtitle,
  accentColor,
}: SectionHeaderProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accent = accentColor ?? colors.primary;

  return (
    <View style={styles.container}>
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}
