/**
 * SignInScreen — email / password sign in.
 */

import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { typography, spacing, radius, shadows } from '../../theme';
import { AuthStackParamList } from '../../../src/navigation/AuthNavigator';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'SignIn'>;

export default function SignInScreen() {
  const { colors }  = useTheme();
  const { signIn }  = useAuth();
  const navigation  = useNavigation<Nav>();
  const isDesktop   = useIsDesktop();

  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);

  const handleSignIn = useCallback(async () => {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError(null);
    setLoading(true);
    const err = await signIn(email.trim(), password);
    setLoading(false);
    if (err) setError(err);
    // On success, AuthContext updates session → RootNavigator swaps to main app
  }, [email, password, signIn]);

  const s = styles(colors);

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
            <Text style={s.heading}>Welcome back</Text>
            <Text style={s.subheading}>Sign in to your account</Text>

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
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPass}
                  returnKeyType="done"
                  onSubmitEditing={handleSignIn}
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

            {/* Error */}
            {error && (
              <View style={s.errorBox}>
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            {/* Sign In button */}
            <TouchableOpacity
              style={[s.primaryBtn, loading && s.primaryBtnDisabled]}
              onPress={handleSignIn}
              activeOpacity={0.85}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={colors.textInverse} />
                : <Text style={s.primaryBtnText}>Sign In</Text>
              }
            </TouchableOpacity>

            {/* Divider */}
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>or</Text>
              <View style={s.dividerLine} />
            </View>

            {/* Switch to Sign Up */}
            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={() => navigation.navigate('SignUp')}
              activeOpacity={0.7}
            >
              <Text style={s.secondaryBtnText}>
                Don't have an account?{' '}
                <Text style={s.secondaryBtnAccent}>Create one</Text>
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
  passwordRow:  { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1 },
  eyeBtn:       { position: 'absolute', right: spacing[3] },
  eyeIcon:      { fontSize: typography.xs, fontWeight: typography.semibold as any, color: c.primary },

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
});
