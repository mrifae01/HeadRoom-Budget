/**
 * StyledInput — a themed text input with an optional label and prefix symbol.
 * Supports currency prefix ("$"), focus ring, and placeholder styling.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { Colors, typography, spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';

interface StyledInputProps extends TextInputProps {
  label?: string;
  prefix?: string;
}

const createStyles = (c: Colors, focused: boolean) => StyleSheet.create({
  wrapper: {
    marginBottom: spacing[3],
  },
  label: {
    fontSize: typography.sm,
    fontWeight: typography.medium,
    color: c.textSecondary,
    marginBottom: spacing[1],
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: focused ? c.surface : c.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: focused ? c.borderFocus : c.border,
    paddingHorizontal: spacing[3],
    height: 48,
  },
  prefix: {
    fontSize: typography.base,
    color: c.textSecondary,
    marginRight: spacing[1],
    fontWeight: typography.medium,
  },
  input: {
    flex: 1,
    fontSize: typography.base,
    color: c.textPrimary,
    height: '100%',
  },
});

export default function StyledInput({ label, prefix, style, ...rest }: StyledInputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const styles = useMemo(() => createStyles(colors, focused), [colors, focused]);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputRow}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
      </View>
    </View>
  );
}
