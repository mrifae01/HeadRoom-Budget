/**
 * SettingsScreen — app preferences and account management.
 *
 * Sections:
 *  • Account     — sign-in / profile (placeholder for future auth)
 *  • Preferences — dark mode toggle (more to come)
 *  • About       — version info
 */

import React, { useMemo, useCallback, useState } from 'react';
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
  Platform,
  Linking,
  TextInput,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth }  from '../context/AuthContext';
import { typography, spacing, radius, shadows } from '../theme';

// ─── Support links — update COFFEE_URL once your page is live ─────────────────
const FEEDBACK_EMAIL = 'mrifae@gmail.com';
const COFFEE_URL     = 'https://buymeacoffee.com/mrifae';

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

// ─── FeedbackModal ────────────────────────────────────────────────────────────

function FeedbackModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const [message, setMessage] = useState('');

  const handleSend = useCallback(() => {
    const body    = encodeURIComponent(message.trim());
    const subject = encodeURIComponent('HeadRoom Feedback');
    Linking.openURL(`mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`);
    setMessage('');
    onClose();
  }, [message, onClose]);

  const handleClose = useCallback(() => {
    setMessage('');
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={modal.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[modal.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <View style={modal.header}>
            <Text style={[modal.title, { color: colors.textPrimary }]}>Send Feedback</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[modal.closeBtn, { color: colors.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={[modal.subtitle, { color: colors.textSecondary }]}>
            What's on your mind? Bug reports, feature ideas, anything — I read every message.
          </Text>

          {/* Message input */}
          <TextInput
            style={[modal.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="Type your message here..."
            placeholderTextColor={colors.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />

          {/* Actions */}
          <View style={modal.actions}>
            <TouchableOpacity
              style={[modal.cancelBtn, { borderColor: colors.border }]}
              onPress={handleClose}
            >
              <Text style={[modal.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modal.sendBtn, { backgroundColor: colors.primary }, !message.trim() && modal.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!message.trim()}
            >
              <Text style={modal.sendText}>Send ✉️</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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

  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const handleSignOut = useCallback(() => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) signOut();
    } else {
      Alert.alert(
        'Sign Out',
        'Are you sure you want to sign out?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: signOut },
        ],
      );
    }
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
        </SettingGroup>

        {/* ── SUPPORT ─────────────────────────────────────── */}
        <SectionLabel label="Support" />
        <SettingGroup>
          <SettingRow
            icon="✉️"
            label="Send Feedback"
            sublabel="Bug reports, ideas, anything"
            onPress={() => setFeedbackOpen(true)}
            showChevron
          />
          <SettingRow
            icon="☕"
            label="Buy Me a Coffee"
            sublabel="Support the app"
            onPress={() => Linking.openURL(COFFEE_URL)}
            showChevron
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
        </SettingGroup>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>
            Headroom — Built to give your money room to breathe.
          </Text>
        </View>

        <View style={{ height: spacing[8] }} />
      </ScrollView>
      <FeedbackModal visible={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
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

// ─── Feedback modal styles ─────────────────────────────────────────────────────

const modal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    padding: spacing[6],
    paddingBottom: spacing[8],
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  title: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
  },
  closeBtn: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
  },
  subtitle: {
    fontSize: typography.sm,
    lineHeight: typography.sm * 1.6,
    marginBottom: spacing[4],
  },
  input: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing[4],
    fontSize: typography.base,
    minHeight: 120,
    marginBottom: spacing[5],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    alignItems: 'center',
  },
  cancelText: {
    fontSize: typography.base,
    fontWeight: typography.medium,
  },
  sendBtn: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendText: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: '#fff',
  },
});
