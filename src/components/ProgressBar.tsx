/**
 * ProgressBar — a simple horizontal fill bar.
 * Props:
 *   progress  — 0–1 fill fraction
 *   color     — fill color (defaults to primary blue)
 *   height    — bar height in pixels
 *   trackColor — background track color
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius } from '../theme';

interface ProgressBarProps {
  progress: number;          // 0 to 1
  color?: string;
  height?: number;
  trackColor?: string;
  style?: ViewStyle;
}

export default function ProgressBar({
  progress,
  color = colors.primary,
  height = 8,
  trackColor = colors.surfaceAlt,
  style,
}: ProgressBarProps) {
  // Clamp progress to [0, 1]
  const pct = Math.min(Math.max(progress, 0), 1);

  return (
    <View style={[styles.track, { height, backgroundColor: trackColor, borderRadius: height }, style]}>
      <View
        style={[
          styles.fill,
          {
            width: `${pct * 100}%`,
            backgroundColor: color,
            height,
            borderRadius: height,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    // Width is set inline from props
  },
});
