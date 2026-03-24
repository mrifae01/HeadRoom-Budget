/**
 * StyledInput — a themed text input with an optional label and prefix symbol.
 * Supports currency prefix ("$"), focus ring, and placeholder styling.
 */

import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { colors, typography, spacing, radius } from '../theme';

interface StyledInputProps extends TextInputProps {
  label?: string;
  prefix?: string;  // e.g. "$" for currency fields
}

export default function StyledInput({ label, prefix, style, ...rest }: StyledInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[
        styles.inputRow,
        focused ? styles.inputRowFocused : null,
      ]}>
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

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing[3],
  },
  label: {
    fontSize: typography.sm,
    fontWeight: typography.medium,
    color: colors.textSecondary,
    marginBottom: spacing[1],
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing[3],
    height: 48,
  },
  inputRowFocused: {
    borderColor: colors.borderFocus,
    backgroundColor: colors.surface,
  },
  prefix: {
    fontSize: typography.base,
    color: colors.textSecondary,
    marginRight: spacing[1],
    fontWeight: typography.medium,
  },
  input: {
    flex: 1,
    fontSize: typography.base,
    color: colors.textPrimary,
    height: '100%',
  },
});
