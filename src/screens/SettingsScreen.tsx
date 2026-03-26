/**
 * SettingsScreen — app preferences and account management.
 *
 * Sections:
 *  • Account     — sign-in / profile (placeholder for future auth)
 *  • Preferences — dark mode toggle (more to come)
 *  • About       — version info
 */

import React, { useMemo, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth }  from '../context/AuthContext';
import { typography, spacing, radius } from '../theme';

// ─── Small presentational pieces ─────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[sectionLabelStyle, { color: colors.textMuted }]}>{label}</Text>
  );
}

const sectionLabelStyle: object = {
  fontSize: typography.xs,
  fontWeight: typography.semibold as any,
  letterSpacing: 0.8,
  textTransform: 'uppercase' as const,
  paddingHorizontal: spacing[4],
  paddingBottom: spacing[2],
  paddingTop: spacing[5],
};

// ─── SettingRow — a single row inside a settings group ───────────────────────

interface SettingRowProps {
  icon: string;
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}

function SettingRow({
  icon,
  label,
  sublabel,
  right,
  onPress,
  showChevron = false,
  isFirst = false,
  isLast = false,
}: SettingRowProps) {
  const { colors } = useTheme();

  const rowStyles = useMemo(() => ({
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3] + 2,
      borderTopLeftRadius: isFirst ? radius.lg : 0,
      borderTopRightRadius: isFirst ? radius.lg : 0,
      borderBottomLeftRadius: isLast ? radius.lg : 0,
      borderBottomRightRadius: isLast ? radius.lg : 0,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: spacing[4] + 36 + spacing[3],
    },
  }), [colors, isFirst, isLast]);

  const content = (
    <View style={rowStyles.row}>
      {/* Icon bubble */}
      <View style={[styles.iconBubble, { backgroundColor: colors.surfaceAlt }]}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>

      {/* Labels */}
      <View style={styles.labelWrap}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
        {sublabel ? (
          <Text style={[styles.sublabel, { color: colors.textMuted }]}>{sublabel}</Text>
        ) : null}
      </View>

      {/* Right slot: custom node or chevron */}
      {right ?? (showChevron ? (
        <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
      ) : null)}
    </View>
  );

  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {content}
    </TouchableOpacity>
  ) : content;
}

// ─── SettingGroup — a rounded card of rows with dividers ─────────────────────

function SettingGroup({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.group, {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    }]}>
      {React.Children.map(children, (child, idx) => {
        const arr = React.Children.toArray(children);
        const isFirst = idx === 0;
        const isLast  = idx === arr.length - 1;
        return (
          <>
            {React.cloneElement(child as React.ReactElement<SettingRowProps>, { isFirst, isLast })}
            {!isLast && (
              <View style={[styles.groupDivider, { backgroundColor: colors.border, marginLeft: spacing[4] + 36 + spacing[3] }]} />
            )}
          </>
        );
      })}
    </View>
  );
}

// ─── SettingsScreen ───────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { colors, isDark, toggleDark } = useTheme();
  const { user, signOut } = useAuth();

  // Derive display values from the Supabase user object
  const email      = user?.email ?? '—';
  const initials   = email !== '—' ? email[0].toUpperCase() : '?';
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ],
    );
  }, [signOut]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Page header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Settings</Text>
        </View>

        {/* ── ACCOUNT ─────────────────────────────────────── */}
        <SectionLabel label="Account" />

        {/* User profile card */}
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.avatarText, { color: colors.textInverse }]}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileEmail, { color: colors.textPrimary }]} numberOfLines={1}>
              {email}
            </Text>
            <Text style={[styles.profileMeta, { color: colors.textMuted }]}>
              Member since {memberSince}
            </Text>
          </View>
        </View>

        <SettingGroup>
          <SettingRow
            icon="☁️"
            label="Cloud Sync"
            sublabel="Your data is saved to the cloud"
          />
        </SettingGroup>

        {/* Sign out — separate group so it's visually distinct */}
        <View style={{ marginTop: spacing[3] }}>
          <SettingGroup>
            <SettingRow
              icon="🚪"
              label="Sign Out"
              onPress={handleSignOut}
              right={<Text style={[styles.signOutChevron, { color: colors.danger }]}>›</Text>}
              isFirst
              isLast
            />
          </SettingGroup>
        </View>

        {/* ── PREFERENCES ─────────────────────────────────── */}
        <SectionLabel label="Preferences" />
        <SettingGroup>
          <SettingRow
            icon={isDark ? '🌙' : '☀️'}
            label="Dark Mode"
            sublabel={isDark ? 'On' : 'Off'}
            right={
              <Switch
                value={isDark}
                onValueChange={toggleDark}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.surface}
                ios_backgroundColor={colors.border}
              />
            }
          />
          <SettingRow
            icon="🔔"
            label="Notifications"
            sublabel="Coming soon"
          />
          <SettingRow
            icon="💱"
            label="Currency"
            sublabel="USD — Coming soon"
          />
        </SettingGroup>

        {/* ── ABOUT ───────────────────────────────────────── */}
        <SectionLabel label="About" />
        <SettingGroup>
          <SettingRow
            icon="📋"
            label="Version"
            sublabel="1.0.0"
          />
          <SettingRow
            icon="🔒"
            label="Privacy Policy"
            showChevron
            onPress={() => {/* future */}}
          />
          <SettingRow
            icon="📄"
            label="Terms of Service"
            showChevron
            onPress={() => {/* future */}}
          />
        </SettingGroup>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>
            Headroom — Built to give your money room to breathe.
          </Text>
        </View>

        <View style={{ height: spacing[8] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles (layout only — colors are inline) ─────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[6],
  },
  header: {
    marginBottom: spacing[2],
  },
  title: {
    fontSize: typography['2xl'],
    fontWeight: typography.bold,
  },
  group: {
    marginHorizontal: 0,
  },
  groupDivider: {
    height: 1,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  iconText: {
    fontSize: 18,
  },
  labelWrap: {
    flex: 1,
  },
  label: {
    fontSize: typography.base,
    fontWeight: typography.medium,
  },
  sublabel: {
    fontSize: typography.xs,
    marginTop: 1,
  },
  chevron: {
    fontSize: 22,
    lineHeight: 24,
    marginLeft: spacing[2],
  },
  footer: {
    marginTop: spacing[8],
    alignItems: 'center',
  },
  footerText: {
    fontSize: typography.xs,
    textAlign: 'center',
    lineHeight: typography.xs * 1.6,
  },

  // Account / profile
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing[4],
    marginBottom: spacing[3],
    gap: spacing[3],
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
  },
  profileInfo: {
    flex: 1,
  },
  profileEmail: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    marginBottom: 2,
  },
  profileMeta: {
    fontSize: typography.xs,
  },
  signOutChevron: {
    fontSize: 22,
    lineHeight: 24,
    marginLeft: spacing[2],
  },
});
