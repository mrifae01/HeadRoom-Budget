/**
 * CapacityScreen — shown when the 100-user cap is reached.
 *
 * Lets visitors join the waitlist and support the developer.
 * TODO: Replace COFFEE_URL with your actual Buy Me a Coffee / Ko-fi link.
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
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { typography, spacing, radius, shadows } from '../../theme';
import { API_BASE_URL } from '../../config/api';
import { AuthStackParamList } from '../../navigation/AuthNavigator';

const COFFEE_URL = 'https://buymeacoffee.com/mrifae';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Capacity'>;

export default function CapacityScreen() {
  const { colors }  = useTheme();
  const navigation  = useNavigation<Nav>();
  const isDesktop   = useIsDesktop();

  const [email,     setEmail]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const handleJoinWaitlist = useCallback(async () => {
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/api/waitlist`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleCoffee = useCallback(() => {
    Linking.openURL(COFFEE_URL).catch(() => null);
  }, []);

  const s = styles(colors);

  // ── Success state ──────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centeredContainer}>
          <View style={[s.iconCircle, { backgroundColor: colors.primaryLight }, shadows.md]}>
            <Text style={s.iconEmoji}>🎉</Text>
          </View>
          <Text style={s.heading}>You're on the list!</Text>
          <Text style={s.body}>
            We'll email you at{' '}
            <Text style={s.accent}>{email.trim()}</Text>
            {' '}the moment a spot opens up.
          </Text>

          <TouchableOpacity style={[s.coffeeBtn, shadows.sm]} onPress={handleCoffee} activeOpacity={0.85}>
            <Text style={s.coffeeBtnText}>☕  Buy Mitchel a coffee</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('SignIn')} activeOpacity={0.7}>
            <Text style={s.linkText}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main capacity screen ───────────────────────────────────────────────────

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
            <View style={[s.logoCircle, shadows.md]}>
              <Text style={s.logoIcon}>✦</Text>
            </View>
            <Text style={s.appName}>HeadRoom</Text>
            <Text style={s.tagline}>Your personal budget companion</Text>
          </View>

          {/* ── Card ── */}
          <View style={[s.card, shadows.md, isDesktop && s.cardDesktop]}>

            <View style={[s.capacityIconCircle, shadows.sm]}>
              <Text style={s.capacityEmoji}>🔒</Text>
            </View>

            <Text style={s.heading}>We're at capacity</Text>
            <Text style={s.subheading}>All 100 spots are currently filled</Text>

            <Text style={s.body}>
              HeadRoom is built and maintained by a single developer. Right now we're
              at our limit, but every coffee and sign-up helps keep the lights on and
              unlock more spots.
            </Text>

            {/* ── Waitlist ── */}
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>get notified when a spot opens</Text>
              <View style={s.dividerLine} />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Your Email</Text>
              <TextInput
                style={s.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="done"
                onSubmitEditing={handleJoinWaitlist}
              />
            </View>

            {error && (
              <View style={s.errorBox}>
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.primaryBtn, loading && s.primaryBtnDisabled]}
              onPress={handleJoinWaitlist}
              activeOpacity={0.85}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={colors.textInverse} />
                : <Text style={s.primaryBtnText}>Notify me when a spot opens</Text>
              }
            </TouchableOpacity>

            {/* ── Coffee ── */}
            <TouchableOpacity style={[s.coffeeBtn, shadows.sm]} onPress={handleCoffee} activeOpacity={0.85}>
              <Text style={s.coffeeBtnText}>☕  Buy Mitchel a coffee</Text>
            </TouchableOpacity>

            {/* ── Back ── */}
            <TouchableOpacity
              style={s.backBtn}
              onPress={() => navigation.navigate('SignIn')}
              activeOpacity={0.7}
            >
              <Text style={s.linkText}>Back to sign in</Text>
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
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[8],
  },

  // Branding
  brand: { alignItems: 'center', marginBottom: spacing[8] },
  logoCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: c.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing[3],
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
    alignItems: 'center',
  },
  cardDesktop: {
    maxWidth: 440,
    width: '100%' as any,
    alignSelf: 'center',
  },

  // Capacity icon
  capacityIconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: c.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: c.border,
  },
  capacityEmoji: { fontSize: 28 },

  // Text
  heading:    {
    fontSize: typography.xl,
    fontWeight: typography.bold as any,
    color: c.textPrimary,
    marginBottom: spacing[1],
    textAlign: 'center',
  },
  subheading: {
    fontSize: typography.sm,
    color: c.textSecondary,
    marginBottom: spacing[4],
    textAlign: 'center',
  },
  body: {
    fontSize: typography.sm,
    color: c.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing[5],
  },
  accent: { color: c.primary, fontWeight: typography.semibold as any },

  // Divider
  divider:     {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[5],
    width: '100%' as any,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: c.border },
  dividerText: { fontSize: typography.xs, color: c.textMuted, textAlign: 'center', flexShrink: 1 },

  // Field
  field: { marginBottom: spacing[4], width: '100%' as any },
  label: {
    fontSize: typography.xs,
    fontWeight: typography.semibold as any,
    color: c.textSecondary,
    marginBottom: spacing[1] + 2,
  },
  input: {
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: typography.base,
    color: c.textPrimary,
    width: '100%' as any,
  },

  // Error
  errorBox: {
    backgroundColor: c.dangerLight,
    borderRadius: radius.md,
    padding: spacing[3],
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: c.danger + '40',
    width: '100%' as any,
  },
  errorText: { fontSize: typography.xs, color: c.danger, fontWeight: typography.medium as any },

  // Buttons
  primaryBtn: {
    backgroundColor: c.primary,
    borderRadius: radius.md,
    paddingVertical: spacing[4],
    alignItems: 'center',
    marginBottom: spacing[4],
    width: '100%' as any,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText:     { fontSize: typography.base, fontWeight: typography.bold as any, color: c.textInverse },

  coffeeBtn: {
    backgroundColor: '#FFDD00',
    borderRadius: radius.md,
    paddingVertical: spacing[3] + 2,
    paddingHorizontal: spacing[6],
    alignItems: 'center',
    marginBottom: spacing[5],
    width: '100%' as any,
  },
  coffeeBtnText: { fontSize: typography.base, fontWeight: typography.bold as any, color: '#1a1a1a' },

  backBtn:  { alignItems: 'center', paddingTop: spacing[1] },
  linkText: { fontSize: typography.sm, color: c.primary, fontWeight: typography.medium as any },

  // Centered container (success state)
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing[6],
  },
  iconEmoji: { fontSize: 36 },
});
