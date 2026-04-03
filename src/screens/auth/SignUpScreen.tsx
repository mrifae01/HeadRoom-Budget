/**
 * SignUpScreen — create a new account.
 *
 * After a successful sign-up Supabase may require email confirmation.
 * If so, we show a "check your email" state instead of navigating.
 * You can disable email confirmation in:
 *   Supabase Dashboard → Auth → Settings → "Enable email confirmations" (off)
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { typography, spacing, radius, shadows } from '../../theme';
import { AuthStackParamList } from '../../../src/navigation/AuthNavigator';
import { API_BASE_URL } from '../../config/api';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;

export default function SignUpScreen() {
  const { colors } = useTheme();
  const { signUp } = useAuth();
  const navigation = useNavigation<Nav>();
  const isDesktop  = useIsDesktop();

  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [confirm,    setConfirm]    = useState('');
  const [showPass,   setShowPass]   = useState(false);
  const [agreed,     setAgreed]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [confirmed,  setConfirmed]  = useState(false); // email confirm sent

  // Check capacity on mount — redirect immediately if full.
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/auth/capacity`)
      .then((r) => r.json())
      .then((data) => { if (data.atCapacity) navigation.replace('Capacity'); })
      .catch(() => null); // fail silently — don't block sign-up if check fails
  }, [navigation]);

  const handleSignUp = useCallback(async () => {
    if (!email.trim() || !password || !confirm) {
      setError('Please fill in all fields.');
      return;
    }
    if (!agreed) {
      setError('Please agree to the Terms of Service and Privacy Policy.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setError(null);
    setLoading(true);
    const { error: err, needsConfirmation } = await signUp(email.trim(), password);
    setLoading(false);
    if (err) {
      setError(err);
    } else if (needsConfirmation) {
      setConfirmed(true); // show "check your email" state
    }
    // If no confirmation required, AuthContext updates session → RootNavigator navigates automatically
  }, [email, password, confirm, signUp]);

  const s = styles(colors);

  // ── Email confirmation sent state ─────────────────────────────────────────

  if (confirmed) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.confirmContainer}>
          <View style={[s.confirmIconCircle, shadows.md]}>
            <Text style={s.confirmIcon}>✉️</Text>
          </View>
          <Text style={s.confirmHeading}>Check your email</Text>
          <Text style={s.confirmBody}>
            We sent a confirmation link to{'\n'}
            <Text style={s.confirmEmail}>{email}</Text>
          </Text>
          <Text style={s.confirmHint}>
            Click the link in the email, then come back and sign in.
          </Text>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => navigation.navigate('SignIn')}
            activeOpacity={0.85}
          >
            <Text style={s.primaryBtnText}>Go to Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Sign up form ──────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Branding ── */}
          <View style={s.brand}>
            <View style={s.logoCircle}>
              <Text style={s.logoIcon}>✦</Text>
            </View>
            <Text style={s.appName}>HeadRoom</Text>
            <Text style={s.tagline}>Your personal budget companion</Text>
          </View>

          {/* ── Card ── */}
          <View style={[s.card, shadows.md, isDesktop && s.cardDesktop]}>
            <Text style={s.heading}>Create your account</Text>
            <Text style={s.subheading}>Start taking control of your budget</Text>

            {/* Email */}
            <View style={s.field}>
              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="next"
              />
            </View>

            {/* Password */}
            <View style={s.field}>
              <Text style={s.label}>Password</Text>
              <View style={s.passwordRow}>
                <TextInput
                  style={[s.input, s.passwordInput]}
                  placeholder="Min. 6 characters"
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPass}
                  returnKeyType="next"
                />
                <TouchableOpacity
                  style={s.eyeBtn}
                  onPress={() => setShowPass((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={s.eyeIcon}>{showPass ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm Password */}
            <View style={s.field}>
              <Text style={s.label}>Confirm Password</Text>
              <TextInput
                style={s.input}
                placeholder="Re-enter your password"
                placeholderTextColor={colors.textMuted}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showPass}
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
              />
            </View>

            {/* Agree to ToS + PP */}
            <TouchableOpacity
              style={s.checkboxRow}
              onPress={() => setAgreed(v => !v)}
              activeOpacity={0.7}
            >
              <View style={[s.checkbox, { borderColor: agreed ? colors.primary : colors.border, backgroundColor: agreed ? colors.primary : 'transparent' }]}>
                {agreed && <Text style={s.checkboxTick}>✓</Text>}
              </View>
              <Text style={[s.checkboxLabel, { color: colors.textSecondary }]}>
                {'I agree to the '}
                <Text style={[s.checkboxLink, { color: colors.primary }]} onPress={() => Linking.openURL('https://headroombudget.com/terms')}>
                  Terms of Service
                </Text>
                {' and '}
                <Text style={[s.checkboxLink, { color: colors.primary }]} onPress={() => Linking.openURL('https://headroombudget.com/privacy')}>
                  Privacy Policy
                </Text>
              </Text>
            </TouchableOpacity>

            {/* Error */}
            {error && (
              <View style={s.errorBox}>
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            {/* Create Account button */}
            <TouchableOpacity
              style={[s.primaryBtn, (!agreed || loading) && s.primaryBtnDisabled]}
              onPress={handleSignUp}
              activeOpacity={0.85}
              disabled={!agreed || loading}
            >
              {loading
                ? <ActivityIndicator color={colors.textInverse} />
                : <Text style={s.primaryBtnText}>Create Account</Text>
              }
            </TouchableOpacity>

            {/* Divider */}
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>or</Text>
              <View style={s.dividerLine} />
            </View>

            {/* Switch to Sign In */}
            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Text style={s.secondaryBtnText}>
                Already have an account?{' '}
                <Text style={s.secondaryBtnAccent}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: c.background },
  flex:   { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing[6], paddingVertical: spacing[8] },

  // Branding
  brand:      { alignItems: 'center', marginBottom: spacing[8] },
  logoCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: c.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing[3],
    ...shadows.md,
  },
  logoIcon: { fontSize: 28, color: c.textInverse },
  appName:  { fontSize: typography['2xl'], fontWeight: typography.bold as any, color: c.textPrimary, letterSpacing: -0.5 },
  tagline:  { fontSize: typography.sm, color: c.textMuted, marginTop: spacing[1] },

  // Card
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    padding: spacing[6],
    borderWidth: 1,
    borderColor: c.border,
  },
  cardDesktop: {
    maxWidth: 440,
    width: '100%' as any,
    alignSelf: 'center',
  },
  heading:    { fontSize: typography.xl, fontWeight: typography.bold as any, color: c.textPrimary, marginBottom: spacing[1] },
  subheading: { fontSize: typography.sm, color: c.textSecondary, marginBottom: spacing[6] },

  // Fields
  field:        { marginBottom: spacing[4] },
  label:        { fontSize: typography.xs, fontWeight: typography.semibold as any, color: c.textSecondary, marginBottom: spacing[1] + 2 },
  input: {
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: typography.base,
    color: c.textPrimary,
  },
  passwordRow:   { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1 },
  eyeBtn:        { position: 'absolute', right: spacing[3] },
  eyeIcon:       { fontSize: typography.xs, fontWeight: typography.semibold as any, color: c.primary },

  // Consent checkbox
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxTick: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '700',
    lineHeight: 14,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: typography.sm,
    lineHeight: 20,
  },
  checkboxLink: {
    fontWeight: typography.semibold as any,
  },

  // Error
  errorBox:  {
    backgroundColor: c.dangerLight,
    borderRadius: radius.md,
    padding: spacing[3],
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: c.danger + '40',
  },
  errorText: { fontSize: typography.xs, color: c.danger, fontWeight: typography.medium as any },

  // Buttons
  primaryBtn: {
    backgroundColor: c.primary,
    borderRadius: radius.md,
    paddingVertical: spacing[4],
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText:     { fontSize: typography.base, fontWeight: typography.bold as any, color: c.textInverse },

  divider:     { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[4] },
  dividerLine: { flex: 1, height: 1, backgroundColor: c.border },
  dividerText: { fontSize: typography.xs, color: c.textMuted },

  secondaryBtn:       { alignItems: 'center' },
  secondaryBtnText:   { fontSize: typography.sm, color: c.textSecondary },
  secondaryBtnAccent: { color: c.primary, fontWeight: typography.semibold as any },

  // Email confirmation state
  confirmContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  confirmIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: c.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing[6],
  },
  confirmIcon:    { fontSize: 36 },
  confirmHeading: { fontSize: typography.xl, fontWeight: typography.bold as any, color: c.textPrimary, marginBottom: spacing[3], textAlign: 'center' },
  confirmBody:    { fontSize: typography.base, color: c.textSecondary, textAlign: 'center', marginBottom: spacing[2], lineHeight: 22 },
  confirmEmail:   { color: c.primary, fontWeight: typography.semibold as any },
  confirmHint:    { fontSize: typography.sm, color: c.textMuted, textAlign: 'center', marginBottom: spacing[8] },
});
