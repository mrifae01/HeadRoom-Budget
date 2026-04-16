/**
 * BudgetScreen — budget management and expense tracking.
 *
 * Desktop: two-column layout (left = hero + metrics + debt + expenses,
 *                              right = category breakdown + reports)
 * Mobile:  single-column scroll
 *
 * Key difference from old DashboardScreen:
 *  • "+ Log Expense" lives in the page header as a compact pill button
 *  • HeroCard is more compact and horizontal — no button inside
 *  • Desktop uses a two-column layout for better use of screen space
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Animated,
  Modal,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { typography, spacing, radius, shadows } from '../theme';
import { Colors } from '../theme';
import { useTheme } from '../context/ThemeContext';
import Card from '../components/Card';
import ProgressBar from '../components/ProgressBar';
import AddExpenseModal from '../components/AddExpenseModal';
import { useBudget } from '../context/BudgetContext';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { CategoryItem, DebtItem, Transaction } from '../types/budget';
import { dollars, formatDate, todayISO } from '../utils/formatters';

// ─── "Other" catch-all category ──────────────────────────────────────────────
const OTHER_CATEGORY: CategoryItem = {
  id: '__other__',
  name: 'Other/Misc',
  icon: '📦',
  color: '#94A3B8',
  amount: '0',
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

const NOW = new Date();
const MONTH_LABEL      = NOW.toLocaleString(undefined, { month: 'long', year: 'numeric' });
const PREV_MONTH_LABEL = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1)
  .toLocaleString(undefined, { month: 'long', year: 'numeric' });
const NEW_MONTH_NAME   = NOW.toLocaleString(undefined, { month: 'long' });

function isThisMonthLocal(isoDate: string): boolean {
  const d = new Date(isoDate);
  return d.getFullYear() === NOW.getFullYear() && d.getMonth() === NOW.getMonth();
}

function payoffLabel(total: number, monthly: number): string {
  const months = Math.ceil(total / monthly);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const yrs = Math.floor(months / 12);
  const mo  = months % 12;
  return mo > 0 ? `${yrs} yr${yrs === 1 ? '' : 's'} ${mo} mo` : `${yrs} yr${yrs === 1 ? '' : 's'}`;
}

// ─── Period helpers ───────────────────────────────────────────────────────────

type Period = 'month' | 'biweek' | 'week';

interface PeriodWindow {
  start: Date;
  end: Date;
  label: string;
  days: number;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function shortDate(d: Date): string {
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric' });
}

function getCurrentPeriodWindow(period: Period): PeriodWindow {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year  = today.getFullYear();
  const month = today.getMonth();
  const day   = today.getDate();
  const dim   = getDaysInMonth(year, month);

  if (period === 'month') {
    return { start: new Date(year, month, 1), end: new Date(year, month, dim), label: MONTH_LABEL, days: dim };
  }
  if (period === 'biweek') {
    if (day <= 15) {
      const s = new Date(year, month, 1), e = new Date(year, month, 15);
      return { start: s, end: e, label: `${shortDate(s)} – ${shortDate(e)}`, days: 15 };
    }
    const s = new Date(year, month, 16), e = new Date(year, month, dim);
    return { start: s, end: e, label: `${shortDate(s)} – ${shortDate(e)}`, days: dim - 15 };
  }
  const dow   = today.getDay();
  const start = new Date(today);
  start.setDate(day - (dow === 0 ? 6 : dow - 1));
  const end   = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end, label: `${shortDate(start)} – ${shortDate(end)}`, days: 7 };
}

function getPreviousPeriodWindow(period: Period): PeriodWindow {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year  = today.getFullYear();
  const month = today.getMonth();
  const day   = today.getDate();

  if (period === 'month') {
    const pm = month === 0 ? 11 : month - 1;
    const py = month === 0 ? year - 1 : year;
    const dim = getDaysInMonth(py, pm);
    const s = new Date(py, pm, 1), e = new Date(py, pm, dim);
    return { start: s, end: e, label: s.toLocaleString(undefined, { month: 'long', year: 'numeric' }), days: dim };
  }
  if (period === 'biweek') {
    if (day <= 15) {
      const pm = month === 0 ? 11 : month - 1;
      const py = month === 0 ? year - 1 : year;
      const dim = getDaysInMonth(py, pm);
      const s = new Date(py, pm, 16), e = new Date(py, pm, dim);
      return { start: s, end: e, label: `${shortDate(s)} – ${shortDate(e)}`, days: dim - 15 };
    }
    const s = new Date(year, month, 1), e = new Date(year, month, 15);
    return { start: s, end: e, label: `${shortDate(s)} – ${shortDate(e)}`, days: 15 };
  }
  const dow     = today.getDay();
  const currMon = new Date(today);
  currMon.setDate(day - (dow === 0 ? 6 : dow - 1));
  const start = new Date(currMon);
  start.setDate(currMon.getDate() - 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end, label: `${shortDate(start)} – ${shortDate(end)}`, days: 7 };
}

function isInWindow(isoDate: string, start: Date, end: Date): boolean {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date >= start && date <= end;
}

function getCategoryMeta(name: string, categories: CategoryItem[]): { icon: string; color: string } {
  return categories.find((c) => c.name === name) ?? { icon: '📦', color: '#94A3B8' };
}

// ─── TransactionRow ───────────────────────────────────────────────────────────

const createTxStyles = (c: Colors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
    gap: spacing[3],
  },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  iconWrap: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 16 },
  info: { flex: 1 },
  category: { fontSize: typography.sm, fontWeight: typography.semibold, color: c.textPrimary },
  meta: { fontSize: typography.xs, color: c.textMuted, marginTop: 1 },
  right: { alignItems: 'flex-end', gap: spacing[1] },
  amount: { fontSize: typography.sm, fontWeight: typography.bold, color: c.textPrimary },
  actions: { flexDirection: 'row', gap: spacing[1] },
  editBubble: {
    backgroundColor: c.primaryLight, borderRadius: radius.full,
    paddingHorizontal: spacing[2], paddingVertical: 2,
    borderWidth: 1, borderColor: c.primary + '40',
  },
  editBubbleText: { fontSize: typography.xs, fontWeight: typography.semibold, color: c.primary },
  deleteBubble: {
    backgroundColor: c.dangerLight, borderRadius: radius.full,
    paddingHorizontal: spacing[2], paddingVertical: 2,
    borderWidth: 1, borderColor: c.danger + '40',
  },
  deleteBubbleText: { fontSize: typography.xs, fontWeight: typography.semibold, color: c.danger },
});

function TransactionRow({
  transaction, categories, onEdit, onDelete,
}: {
  transaction: Transaction;
  categories: CategoryItem[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const txStyles = useMemo(() => createTxStyles(colors), [colors]);
  const { icon, color } = getCategoryMeta(transaction.categoryName, categories);

  return (
    <View style={txStyles.row}>
      <View style={txStyles.left}>
        <View style={[txStyles.iconWrap, { backgroundColor: color + '22' }]}>
          <Text style={txStyles.icon}>{icon}</Text>
        </View>
        <View style={txStyles.info}>
          <Text style={txStyles.category}>{transaction.categoryName}</Text>
          <Text style={txStyles.meta}>
            {formatDate(transaction.date)}{transaction.note ? ` · ${transaction.note}` : ''}
          </Text>
        </View>
      </View>
      <View style={txStyles.right}>
        <Text style={txStyles.amount}>{dollars(transaction.amount)}</Text>
        <View style={txStyles.actions}>
          <TouchableOpacity style={txStyles.editBubble} onPress={onEdit}>
            <Text style={txStyles.editBubbleText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={txStyles.deleteBubble} onPress={onDelete}>
            <Text style={txStyles.deleteBubbleText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── HeroCard (compact — no button inside) ────────────────────────────────────

const createHeroStyles = (c: Colors) => StyleSheet.create({
  card: {
    backgroundColor: c.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    marginBottom: spacing[4],
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
  },
  blob: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -60,
    right: -40,
  },
  leftCol: { flex: 1 },
  label: {
    fontSize: typography.xs,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: typography.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amount: {
    fontSize: typography['2xl'],
    fontWeight: typography.extrabold,
    color: '#fff',
    marginTop: 2,
  },
  sub: { fontSize: typography.xs, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  surplusBadge: {
    marginTop: spacing[2],
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.full,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  surplusText: { fontSize: typography.xs, color: 'rgba(255,255,255,0.95)', fontWeight: typography.semibold },
  rightCol: { width: 130 },
  pctText: { fontSize: typography.xs, color: 'rgba(255,255,255,0.7)', marginTop: spacing[1], textAlign: 'right' },
  windowLabel: { fontSize: typography.xs, color: 'rgba(255,255,255,0.5)', marginTop: 2, textAlign: 'right' },
});

function HeroCard({
  totalIncome, totalSpent, periodLabel, windowLabel, surplus,
}: {
  totalIncome: number;
  totalSpent: number;
  periodLabel: string;
  windowLabel: string;
  surplus: number;
}) {
  const { colors } = useTheme();
  const heroStyles = useMemo(() => createHeroStyles(colors), [colors]);
  const remaining  = Math.max(totalIncome - totalSpent, 0);
  const overBudget = totalSpent > totalIncome;
  const progress   = totalIncome > 0 ? Math.min(totalSpent / totalIncome, 1) : 0;
  const pctUsed    = totalIncome > 0 ? Math.round((totalSpent / totalIncome) * 100) : 0;

  return (
    <View style={[heroStyles.card, shadows.md]}>
      <View style={heroStyles.blob} />

      <View style={heroStyles.leftCol}>
        <Text style={heroStyles.label}>Remaining This {periodLabel}</Text>
        <Text style={heroStyles.amount}>
          {overBudget ? `−${dollars(totalSpent - totalIncome)}` : dollars(remaining)}
        </Text>
        <Text style={heroStyles.sub}>{dollars(totalSpent)} of {dollars(totalIncome)}</Text>
        {surplus > 0 && (
          <View style={heroStyles.surplusBadge}>
            <Text style={heroStyles.surplusText}>+{dollars(surplus)} surplus</Text>
          </View>
        )}
      </View>

      <View style={heroStyles.rightCol}>
        <ProgressBar
          progress={progress}
          color={pctUsed >= 100 ? colors.danger : pctUsed >= 75 ? colors.warning : 'rgba(255,255,255,0.9)'}
          trackColor="rgba(255,255,255,0.25)"
          height={8}
        />
        <Text style={heroStyles.pctText}>
          {overBudget ? 'Over budget' : `${100 - pctUsed}% left`}
        </Text>
        <Text style={heroStyles.windowLabel}>{windowLabel}</Text>
      </View>
    </View>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

const createMetricStyles = (c: Colors) => StyleSheet.create({
  card: { flex: 1, borderRadius: radius.md, padding: spacing[3], alignItems: 'center' },
  dot:  { width: 6, height: 6, borderRadius: 3, marginBottom: spacing[1] },
  value: { fontSize: typography.base, fontWeight: typography.bold },
  label: { fontSize: typography.xs, color: c.textSecondary, marginTop: 1, fontWeight: typography.medium },
});

function MetricCard({ label, value, accent, bg }: { label: string; value: string; accent: string; bg: string }) {
  const { colors } = useTheme();
  const s = useMemo(() => createMetricStyles(colors), [colors]);
  return (
    <View style={[s.card, { backgroundColor: bg }]}>
      <View style={[s.dot, { backgroundColor: accent }]} />
      <Text style={[s.value, { color: accent }]}>{value}</Text>
      <Text style={s.label}>{label}</Text>
    </View>
  );
}

// ─── CategoryRow ──────────────────────────────────────────────────────────────

const createCatStyles = (c: Colors) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[2], gap: spacing[3] },
  left: { flexDirection: 'row', alignItems: 'center', width: 120, gap: spacing[1] },
  dot:  { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  icon: { fontSize: 14 },
  name: { flex: 1, fontSize: typography.xs, color: c.textPrimary, fontWeight: typography.medium },
  right: { flex: 1 },
  amounts: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'baseline' },
  spent:   { fontSize: typography.xs, fontWeight: typography.semibold, color: c.textPrimary },
  spentOver: { color: c.danger },
  budget: { fontSize: typography.xs, color: c.textMuted },
  overTag: { fontSize: typography.xs, color: c.danger, fontWeight: typography.bold },
  pct: { fontSize: typography.xs, color: c.textMuted, marginTop: 2, textAlign: 'right' },
  noLimit: { fontSize: typography.xs, color: c.textMuted, fontStyle: 'italic' },
});

function CategoryRow({ icon, name, color, spent, budget }: {
  icon: string; name: string; color: string; spent: number; budget: number;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => createCatStyles(colors), [colors]);
  const hasLimit   = budget > 0;
  const progress   = hasLimit ? Math.min(spent / budget, 1) : 0;
  const overBudget = hasLimit && spent > budget;
  const pct        = hasLimit ? Math.round((spent / budget) * 100) : null;

  return (
    <View style={s.row}>
      <View style={s.left}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={s.icon}>{icon}</Text>
        <Text style={s.name} numberOfLines={1}>{name}</Text>
      </View>
      <View style={s.right}>
        <View style={s.amounts}>
          <Text style={[s.spent, overBudget && s.spentOver]}>{dollars(spent)}</Text>
          {hasLimit ? (
            <>
              <Text style={s.budget}> / {dollars(budget)}</Text>
              {overBudget && <Text style={s.overTag}> OVER</Text>}
            </>
          ) : (
            <Text style={s.noLimit}></Text>
          )}
        </View>
        {hasLimit && (
          <>
            <ProgressBar progress={progress} color={overBudget ? colors.danger : color} trackColor={colors.surfaceAlt} height={5} style={{ marginTop: 3 }} />
            <Text style={s.pct}>{pct}%</Text>
          </>
        )}
      </View>
    </View>
  );
}

// ─── PeriodSelector ───────────────────────────────────────────────────────────

const createPSStyles = (c: Colors) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.full,
    padding: 3,
    marginBottom: spacing[3],
    borderWidth: 1,
    borderColor: c.border,
    alignSelf: 'flex-start',
  },
  pill: { paddingVertical: spacing[1] + 2, paddingHorizontal: spacing[3], borderRadius: radius.full },
  pillActive: { backgroundColor: c.primary },
  pillText: { fontSize: typography.xs, fontWeight: typography.semibold, color: c.textSecondary },
  pillTextActive: { color: '#fff' },
});

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: 'month',  label: 'Month'   },
  { key: 'biweek', label: 'Bi-Week' },
  { key: 'week',   label: 'Week'    },
];

function PeriodSelector({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => createPSStyles(colors), [colors]);
  return (
    <View style={s.wrap}>
      {PERIOD_OPTIONS.map(({ key, label }) => (
        <TouchableOpacity key={key} style={[s.pill, period === key && s.pillActive]} onPress={() => onChange(key)} activeOpacity={0.8}>
          <Text style={[s.pillText, period === key && s.pillTextActive]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── CelebrationOverlay ───────────────────────────────────────────────────────

const BURST_PARTICLES = [
  { angle: 0,   color: '#6366F1', size: 12 },
  { angle: 36,  color: '#10B981', size: 9  },
  { angle: 72,  color: '#F59E0B', size: 11 },
  { angle: 108, color: '#EC4899', size: 8  },
  { angle: 144, color: '#7C3AED', size: 13 },
  { angle: 180, color: '#8B5CF6', size: 9  },
  { angle: 216, color: '#F97316', size: 10 },
  { angle: 252, color: '#14B8A6', size: 11 },
  { angle: 288, color: '#EF4444', size: 8  },
  { angle: 324, color: '#6366F1', size: 10 },
];

const createCelebStyles = (c: Colors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  burstWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width: 1, height: 1 },
  card: {
    backgroundColor: c.surface, borderRadius: radius.xl,
    paddingHorizontal: spacing[8], paddingVertical: spacing[6],
    alignItems: 'center', gap: spacing[2], minWidth: 260, ...shadows.lg,
  },
  checkCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: c.accentLight, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[1] },
  checkMark: { fontSize: 30, color: c.accent, fontWeight: typography.bold, lineHeight: 36 },
  cardTitle: { fontSize: typography.xl, fontWeight: typography.bold, color: c.textPrimary },
  cardDebt: { fontSize: typography.base, fontWeight: typography.medium, color: c.textSecondary },
  cardAmount: { fontSize: typography.sm, color: c.textMuted },
  kudosPill: { marginTop: spacing[2], backgroundColor: c.primaryLight, borderRadius: radius.full, paddingHorizontal: spacing[4], paddingVertical: spacing[1] + 2 },
  kudosText: { fontSize: typography.sm, fontWeight: typography.semibold, color: c.primary },
});

function CelebrationOverlay({ debtName, amount, onDone }: { debtName: string; amount: number; onDone: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => createCelebStyles(colors), [colors]);
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const burstAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 100, useNativeDriver: true }),
        Animated.timing(burstAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]),
      Animated.delay(1400),
      Animated.timing(fadeAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start(onDone);
  }, []);

  return (
    <Modal transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[s.overlay, { opacity: fadeAnim }]}>
        <View style={s.burstWrap} pointerEvents="none">
          {BURST_PARTICLES.map((p, i) => {
            const rad = (p.angle * Math.PI) / 180;
            const tx  = burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 110 * Math.cos(rad)] });
            const ty  = burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 110 * Math.sin(rad)] });
            const op  = burstAnim.interpolate({ inputRange: [0, 0.15, 0.65, 1], outputRange: [0, 1, 1, 0] });
            return (
              <Animated.View key={i} style={{ position: 'absolute', width: p.size, height: p.size, borderRadius: p.size / 2, backgroundColor: p.color, opacity: op, transform: [{ translateX: tx }, { translateY: ty }] }} />
            );
          })}
        </View>
        <Animated.View style={[s.card, { transform: [{ scale: scaleAnim }] }]}>
          <View style={s.checkCircle}><Text style={s.checkMark}>✓</Text></View>
          <Text style={s.cardTitle}>Payment Logged!</Text>
          <Text style={s.cardDebt}>{debtName}</Text>
          <Text style={s.cardAmount}>${amount.toLocaleString()} / month</Text>
          <View style={s.kudosPill}><Text style={s.kudosText}>Keep crushing it 💪</Text></View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ─── DebtPaymentCard ──────────────────────────────────────────────────────────

const createDebtCardStyles = (c: Colors) => StyleSheet.create({
  card: { marginTop: spacing[3] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing[3] },
  title: { fontSize: typography.base, fontWeight: typography.bold, color: c.textPrimary },
  sub: { fontSize: typography.xs, color: c.textMuted, fontWeight: typography.medium },
  divider: { height: 1, backgroundColor: c.border, marginVertical: spacing[2] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  left: { flex: 1 },
  name: { fontSize: typography.sm, fontWeight: typography.semibold, color: c.textPrimary },
  timeline: { fontSize: typography.xs, color: c.textMuted, marginTop: 2 },
  timelineBold: { fontWeight: typography.bold, color: c.primary },
  right: { alignItems: 'flex-end', gap: spacing[1] },
  monthlyAmount: { fontSize: typography.sm, fontWeight: typography.semibold, color: c.textPrimary },
  paidBtn: { backgroundColor: c.primaryLight, borderRadius: radius.full, paddingHorizontal: spacing[3], paddingVertical: spacing[1] + 1, borderWidth: 1, borderColor: c.primary + '40' },
  paidBtnDone: { backgroundColor: c.accentLight, borderColor: c.accent + '40' },
  paidBtnText: { fontSize: typography.xs, fontWeight: typography.bold, color: c.primary },
  paidBtnTextDone: { color: c.accent },
  progressWrap: { marginTop: spacing[1], gap: spacing[1] },
  progressTrack: { height: 5, borderRadius: radius.full, backgroundColor: c.border, overflow: 'hidden' as const },
  progressFill: { height: '100%' as unknown as number, borderRadius: radius.full, backgroundColor: c.primary },
  progressText: { fontSize: typography.xs, color: c.textMuted },
  progressTextBold: { fontWeight: typography.semibold, color: c.textSecondary },
  customAmountBtn: { paddingVertical: spacing[1], alignSelf: 'flex-end' },
  customAmountBtnText: { fontSize: typography.xs, color: c.textMuted, textDecorationLine: 'underline' as const },
  customWrap: { flexDirection: 'row' as const, alignItems: 'center', gap: spacing[2], marginTop: spacing[2], paddingTop: spacing[2], borderTopWidth: 1, borderTopColor: c.border },
  customInputField: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: radius.sm, paddingHorizontal: spacing[3], paddingVertical: spacing[1] + 1, fontSize: typography.sm, color: c.textPrimary, backgroundColor: c.surface },
  customConfirmBtn: { backgroundColor: c.primary, borderRadius: radius.full, paddingHorizontal: spacing[3], paddingVertical: spacing[1] + 1 },
  customConfirmText: { fontSize: typography.xs, fontWeight: typography.bold, color: '#fff' },
  customCancelBtn: { paddingHorizontal: spacing[2], paddingVertical: spacing[1] + 1 },
  customCancelText: { fontSize: typography.xs, color: c.textMuted },
});

function DebtPaymentCard({ debts, paidThisMonth, onPaid }: {
  debts: DebtItem[];
  paidThisMonth: Set<string>;
  onPaid: (debt: DebtItem, amount: number) => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => createDebtCardStyles(colors), [colors]);
  const [customDebtId, setCustomDebtId] = useState<string | null>(null);
  const [customInput,  setCustomInput]  = useState('');

  const payable = debts.filter((d) => parseFloat(d.amount) > 0);
  if (payable.length === 0) return null;

  return (
    <Card style={s.card}>
      <View style={s.header}>
        <Text style={s.title}>Debt Payments</Text>
        <Text style={s.sub}>tap when paid</Text>
      </View>
      {payable.map((debt, idx) => {
        const monthly   = parseFloat(debt.amount);
        const total     = parseFloat(debt.totalAmount ?? '') || 0;
        const current   = parseFloat(debt.currentBalance ?? '') || 0;
        const remaining = current > 0 ? current : total;
        const hasForecast = monthly > 0 && remaining > 0;
        const hasProgress = total > 0 && current > 0 && current <= total;
        const paidOff   = hasProgress ? total - current : 0;
        const pct       = hasProgress ? Math.round((paidOff / total) * 100) : 0;
        const isPaid    = paidThisMonth.has(debt.name);

        return (
          <View key={debt.id}>
            {idx > 0 && <View style={s.divider} />}
            <View style={s.row}>
              <View style={s.left}>
                <Text style={s.name} numberOfLines={1}>{debt.name || 'Unnamed Debt'}</Text>
                {hasForecast && (
                  <Text style={s.timeline}>Paid off in <Text style={s.timelineBold}>{payoffLabel(remaining, monthly)}</Text></Text>
                )}
                {hasProgress && (
                  <View style={s.progressWrap}>
                    <View style={s.progressTrack}>
                      <View style={[s.progressFill, { width: `${pct}%` as unknown as number }]} />
                    </View>
                    <Text style={s.progressText}>
                      <Text style={s.progressTextBold}>{pct}% paid off</Text>{'  '}${paidOff.toLocaleString()} of ${total.toLocaleString()}
                    </Text>
                  </View>
                )}
              </View>
              <View style={s.right}>
                <Text style={s.monthlyAmount}>${monthly.toLocaleString()}/mo</Text>
                <TouchableOpacity style={[s.paidBtn, isPaid && s.paidBtnDone]} onPress={() => !isPaid && onPaid(debt, monthly)} disabled={isPaid} activeOpacity={0.8}>
                  <Text style={[s.paidBtnText, isPaid && s.paidBtnTextDone]}>{isPaid ? '✓  Paid' : 'I Paid'}</Text>
                </TouchableOpacity>
                {!isPaid && (
                  <TouchableOpacity style={s.customAmountBtn} onPress={() => { setCustomDebtId(debt.id === customDebtId ? null : debt.id); setCustomInput(''); }} activeOpacity={0.7}>
                    <Text style={s.customAmountBtnText}>Custom amount</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            {customDebtId === debt.id && (
              <View style={s.customWrap}>
                <TextInput style={s.customInputField} placeholder={`e.g. ${monthly}`} placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={customInput} onChangeText={setCustomInput} autoFocus />
                <TouchableOpacity style={s.customConfirmBtn} onPress={() => { const amt = parseFloat(customInput); if (amt > 0) { onPaid(debt, amt); setCustomDebtId(null); setCustomInput(''); } }} activeOpacity={0.8}>
                  <Text style={s.customConfirmText}>Confirm</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.customCancelBtn} onPress={() => { setCustomDebtId(null); setCustomInput(''); }} activeOpacity={0.7}>
                  <Text style={s.customCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </Card>
  );
}

// ─── Screen styles ────────────────────────────────────────────────────────────

const createStyles = (c: Colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing[5], paddingTop: spacing[5], paddingBottom: spacing[8] },
  contentDesktop: { paddingHorizontal: spacing[8], paddingTop: spacing[6], paddingBottom: spacing[8] },

  // Header row: title left, Log Expense button right
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[4] },
  titleBlock: { gap: 2 },
  title: { fontSize: typography['2xl'], fontWeight: typography.bold, color: c.textPrimary },
  month: { fontSize: typography.xs, color: c.textMuted, fontWeight: typography.medium },

  // Compact pill button in header
  logBtn: {
    backgroundColor: c.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    ...shadows.sm,
  },
  logBtnText: { fontSize: typography.sm, fontWeight: typography.bold, color: '#fff' },

  // Desktop two-column layout
  columns: { flexDirection: 'row', gap: spacing[5], alignItems: 'flex-start' },
  leftCol: { flex: 3 },
  rightCol: { flex: 2 },

  metricRow: { flexDirection: 'row', gap: spacing[2], marginBottom: spacing[3] },
  divider:   { height: 1, backgroundColor: c.border },

  breakdownCard: {},
  breakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing[3] },
  breakdownTitle: { fontSize: typography.base, fontWeight: typography.bold, color: c.textPrimary },
  breakdownSub: { fontSize: typography.xs, color: c.textMuted },

  recentCard: { marginTop: spacing[3] },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing[2] },
  recentTitle: { fontSize: typography.base, fontWeight: typography.bold, color: c.textPrimary },
  recentCount: { fontSize: typography.xs, color: c.textMuted },
  recentEmpty: { paddingVertical: spacing[4], alignItems: 'center' },
  recentEmptyText: { fontSize: typography.sm, color: c.textMuted, textAlign: 'center' },
  recentToggle: { paddingVertical: spacing[2], alignItems: 'center' },
  recentToggleText: { fontSize: typography.sm, fontWeight: typography.semibold, color: c.primary },

  monthEndBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.warningLight, borderRadius: radius.lg,
    borderWidth: 1, borderColor: c.warning,
    paddingHorizontal: spacing[4], paddingVertical: spacing[2],
    marginBottom: spacing[3], gap: spacing[3],
  },
  monthEndBannerEmoji: { fontSize: 20 },
  monthEndBannerText: { flex: 1 },
  monthEndBannerTitle: { fontSize: typography.sm, fontWeight: typography.semibold, color: c.textPrimary },
  monthEndBannerSub: { fontSize: typography.xs, color: c.textSecondary, marginTop: 1 },
  monthEndBannerChevron: { fontSize: typography.xl, color: c.textMuted },

  meOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing[6] },
  meCard: { backgroundColor: c.surface, borderRadius: radius.xl, padding: spacing[6], alignItems: 'center', width: '100%', ...shadows.lg },
  meCardDesktop: { maxWidth: 480 },
  meEmoji: { fontSize: 40, marginBottom: spacing[3] },
  meTitle: { fontSize: typography.xl, fontWeight: typography.bold, color: c.textPrimary, marginBottom: spacing[3], textAlign: 'center' },
  meBody: { fontSize: typography.sm, color: c.textSecondary, textAlign: 'center', lineHeight: typography.sm * 1.6, marginBottom: spacing[5] },
  meBold: { fontWeight: typography.bold, color: c.textPrimary },
  meConfirmBtn: { backgroundColor: c.primary, borderRadius: radius.lg, paddingVertical: spacing[3], paddingHorizontal: spacing[6], width: '100%', alignItems: 'center', marginBottom: spacing[3], ...shadows.sm },
  meConfirmText: { fontSize: typography.base, fontWeight: typography.bold, color: '#fff' },
  meDismissBtn: { paddingVertical: spacing[2], paddingHorizontal: spacing[4] },
  meDismissText: { fontSize: typography.sm, fontWeight: typography.medium, color: c.textMuted },
});

// ─── BudgetScreen ─────────────────────────────────────────────────────────────

export default function BudgetScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { budget, addTransaction, deleteTransaction, updateDebtBalance, monthEndPending, confirmMonthEnd } = useBudget();
  const isDesktop = useIsDesktop();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [modalOpen,           setModalOpen]           = useState(false);
  const [editingTransaction,  setEditingTransaction]  = useState<Transaction | null>(null);
  const [celebration,         setCelebration]         = useState<{ name: string; amount: number } | null>(null);
  const [period,              setPeriod]              = useState<Period>('month');
  const [showAllExpenses,     setShowAllExpenses]     = useState(false);
  const [showMonthEndModal,   setShowMonthEndModal]   = useState(false);
  const prevMonthEndPendingRef = useRef(false);
  const EXPENSE_PREVIEW = 5;

  useEffect(() => {
    if (monthEndPending && !prevMonthEndPendingRef.current) setShowMonthEndModal(true);
    prevMonthEndPendingRef.current = monthEndPending;
  }, [monthEndPending]);

  const handleConfirmMonthEnd = useCallback(async () => {
    setShowMonthEndModal(false);
    await confirmMonthEnd();
    if (Platform.OS === 'web') {
      if (window.confirm(`${PREV_MONTH_LABEL} archived. View it in Monthly Reports?`)) {
        navigation.navigate('Reports');
      }
    } else {
      Alert.alert(`Welcome to ${NEW_MONTH_NAME}! 🎉`, `${PREV_MONTH_LABEL} has been archived.`, [
        { text: 'View Report', onPress: () => navigation.navigate('Reports') },
        { text: 'Stay here', style: 'cancel' },
      ]);
    }
  }, [confirmMonthEnd, navigation]);

  const openAdd   = () => { setEditingTransaction(null); setModalOpen(true); };
  const openEdit  = (tx: Transaction) => { setEditingTransaction(tx); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditingTransaction(null); };

  const handleDelete = (tx: Transaction) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Remove ${dollars(tx.amount)} from ${tx.categoryName}?`)) deleteTransaction(tx.id);
    } else {
      Alert.alert('Delete Expense', `Remove ${dollars(tx.amount)} from ${tx.categoryName}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteTransaction(tx.id) },
      ]);
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────────────

  const thisMonth = useMemo(() => budget.transactions.filter((t) => isThisMonthLocal(t.date)), [budget.transactions]);
  const totalIncome = useMemo(() => budget.incomeSources.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0), [budget.incomeSources]);
  const totalDebt   = useMemo(() => budget.debts.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0), [budget.debts]);
  const debtNamesSet = useMemo(() => new Set(budget.debts.map((d) => d.name)), [budget.debts]);

  const debtPaidThisMonth = useMemo(
    () => thisMonth.filter((tx) => debtNamesSet.has(tx.categoryName)).reduce((s, tx) => s + tx.amount, 0),
    [thisMonth, debtNamesSet],
  );

  const displayCategories = useMemo(() => {
    const has = budget.categories.some((c) => c.name === OTHER_CATEGORY.name);
    return has ? budget.categories : [...budget.categories, OTHER_CATEGORY];
  }, [budget.categories]);

  const paidDebtNames = useMemo(() => {
    const paid = new Set<string>();
    for (const tx of thisMonth) { if (debtNamesSet.has(tx.categoryName)) paid.add(tx.categoryName); }
    return paid;
  }, [thisMonth, debtNamesSet]);

  const handleDebtPaid = useCallback(async (debt: DebtItem, amount: number) => {
    await addTransaction({ categoryName: debt.name, amount, date: todayISO(), note: 'Debt payment' });
    if (debt.currentBalance !== undefined) {
      await updateDebtBalance(debt.id, Math.max(0, parseFloat(debt.currentBalance) - amount).toString());
    }
    setCelebration({ name: debt.name, amount });
  }, [addTransaction, updateDebtBalance]);

  const spendableBudget = useMemo(() => Math.max(totalIncome - totalDebt, 0), [totalIncome, totalDebt]);
  const daysInCurrentMonth = useMemo(() => getDaysInMonth(NOW.getFullYear(), NOW.getMonth()), []);

  const periodWindow     = useMemo(() => getCurrentPeriodWindow(period),  [period]);
  const prevPeriodWindow = useMemo(() => getPreviousPeriodWindow(period), [period]);

  const periodTransactions = useMemo(
    () => budget.transactions.filter((t) => isInWindow(t.date, periodWindow.start, periodWindow.end)),
    [budget.transactions, periodWindow],
  );

  const prevPeriodTransactions = useMemo(
    () => budget.transactions.filter((t) => isInWindow(t.date, prevPeriodWindow.start, prevPeriodWindow.end)),
    [budget.transactions, prevPeriodWindow],
  );

  const periodBudget = useMemo(
    () => daysInCurrentMonth > 0 ? (spendableBudget / daysInCurrentMonth) * periodWindow.days : 0,
    [spendableBudget, daysInCurrentMonth, periodWindow.days],
  );

  const prevPeriodBudget = useMemo(
    () => daysInCurrentMonth > 0 ? (spendableBudget / daysInCurrentMonth) * prevPeriodWindow.days : 0,
    [spendableBudget, daysInCurrentMonth, prevPeriodWindow.days],
  );

  const periodSpentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of periodTransactions) {
      if (!debtNamesSet.has(tx.categoryName)) map[tx.categoryName] = (map[tx.categoryName] ?? 0) + tx.amount;
    }
    return map;
  }, [periodTransactions, debtNamesSet]);

  const periodCategorySpentTotal = useMemo(() => Object.values(periodSpentByCategory).reduce((s, v) => s + v, 0), [periodSpentByCategory]);

  const prevPeriodCategorySpentTotal = useMemo(
    () => prevPeriodTransactions.filter((tx) => !debtNamesSet.has(tx.categoryName)).reduce((s, tx) => s + tx.amount, 0),
    [prevPeriodTransactions, debtNamesSet],
  );

  const surplus = useMemo(() => {
    if (period === 'month') return 0;
    const sameMonth = prevPeriodWindow.start.getFullYear() === NOW.getFullYear() && prevPeriodWindow.start.getMonth() === NOW.getMonth();
    if (!sameMonth) return 0;
    return Math.max(0, prevPeriodBudget - prevPeriodCategorySpentTotal);
  }, [period, prevPeriodWindow, prevPeriodBudget, prevPeriodCategorySpentTotal]);

  const effectivePeriodBudget = useMemo(() => periodBudget + surplus, [periodBudget, surplus]);
  const periodLabel = period === 'month' ? 'Month' : period === 'biweek' ? 'Bi-Week' : 'Week';

  const periodTransactionsSorted = useMemo(
    () => [...periodTransactions].sort((a, b) => b.date.localeCompare(a.date)),
    [periodTransactions],
  );

  // ── Render helpers ────────────────────────────────────────────────────────────

  const categoryBreakdown = (
    <Card style={styles.breakdownCard}>
      <View style={styles.breakdownHeader}>
        <Text style={styles.breakdownTitle}>Category Breakdown</Text>
        <Text style={styles.breakdownSub}>{periodWindow.label}</Text>
      </View>
      {displayCategories.map((cat, idx) => {
        const monthlyLimit = parseFloat(cat.amount) || 0;
        const periodLimit  = monthlyLimit > 0 && daysInCurrentMonth > 0
          ? (monthlyLimit / daysInCurrentMonth) * periodWindow.days : monthlyLimit;
        return (
          <View key={cat.id}>
            <CategoryRow icon={cat.icon} name={cat.name} color={cat.color} spent={periodSpentByCategory[cat.name] ?? 0} budget={periodLimit} />
            {idx < displayCategories.length - 1 && <View style={styles.divider} />}
          </View>
        );
      })}
    </Card>
  );

  const reportsLink = (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => navigation.navigate('Reports')}
      style={{ marginTop: spacing[3], backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing[4], paddingVertical: spacing[3], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...shadows.sm }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18 }}>📊</Text>
        </View>
        <View>
          <Text style={{ fontSize: typography.sm, fontWeight: typography.bold, color: colors.textPrimary }}>Monthly Reports</Text>
          <Text style={{ fontSize: typography.xs, color: colors.textMuted, marginTop: 1 }}>View spending history</Text>
        </View>
      </View>
      <Text style={{ fontSize: typography.xl, color: colors.textMuted }}>›</Text>
    </TouchableOpacity>
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

        <ScrollView style={styles.scroll} contentContainerStyle={isDesktop ? styles.contentDesktop : styles.content} showsVerticalScrollIndicator={false}>

          {/* Header with compact Log Expense button */}
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>Budget</Text>
              <Text style={styles.month}>{MONTH_LABEL}</Text>
            </View>
            <TouchableOpacity style={styles.logBtn} onPress={openAdd} activeOpacity={0.85} accessibilityLabel="Log an expense">
              <Text style={styles.logBtnText}>+ Log Expense</Text>
            </TouchableOpacity>
          </View>

          {/* Month-end banner */}
          {monthEndPending && !showMonthEndModal && (
            <TouchableOpacity style={styles.monthEndBanner} onPress={handleConfirmMonthEnd} activeOpacity={0.85}>
              <Text style={styles.monthEndBannerEmoji}>📅</Text>
              <View style={styles.monthEndBannerText}>
                <Text style={styles.monthEndBannerTitle}>Still wrapping up {PREV_MONTH_LABEL}</Text>
                <Text style={styles.monthEndBannerSub}>Tap to start {NEW_MONTH_NAME}</Text>
              </View>
              <Text style={styles.monthEndBannerChevron}>›</Text>
            </TouchableOpacity>
          )}

          <PeriodSelector period={period} onChange={setPeriod} />
          <HeroCard totalIncome={effectivePeriodBudget} totalSpent={periodCategorySpentTotal} periodLabel={periodLabel} windowLabel={periodWindow.label} surplus={surplus} />

          {/* Metric row */}
          <View style={styles.metricRow}>
            <MetricCard label="Spent" value={dollars(periodCategorySpentTotal)} accent={colors.danger} bg={colors.dangerLight} />
            <MetricCard label="Remaining" value={dollars(Math.max(effectivePeriodBudget - periodCategorySpentTotal, 0))} accent={colors.accent} bg={colors.accentLight} />
            <MetricCard label="Debt Left" value={dollars(Math.max(totalDebt - debtPaidThisMonth, 0))} accent={colors.primary} bg={colors.primaryLight} />
          </View>

          {/* Desktop: two columns; Mobile: single column */}
          {isDesktop ? (
            <View style={styles.columns}>
              {/* Left column */}
              <View style={styles.leftCol}>
                <DebtPaymentCard debts={budget.debts} paidThisMonth={paidDebtNames} onPaid={handleDebtPaid} />

                <Card style={styles.recentCard}>
                  <View style={styles.recentHeader}>
                    <Text style={styles.recentTitle}>Recent Expenses</Text>
                    {periodTransactionsSorted.length > 0 && (
                      <Text style={styles.recentCount}>{periodTransactionsSorted.length} {periodTransactionsSorted.length === 1 ? 'entry' : 'entries'}</Text>
                    )}
                  </View>
                  {periodTransactionsSorted.length === 0 ? (
                    <View style={styles.recentEmpty}>
                      <Text style={styles.recentEmptyText}>No expenses yet. Hit "+ Log Expense" to get started.</Text>
                    </View>
                  ) : (
                    <>
                      {(showAllExpenses ? periodTransactionsSorted : periodTransactionsSorted.slice(0, EXPENSE_PREVIEW)).map((tx, idx, arr) => (
                        <View key={tx.id}>
                          <TransactionRow transaction={tx} categories={displayCategories} onEdit={() => openEdit(tx)} onDelete={() => handleDelete(tx)} />
                          {idx < arr.length - 1 && <View style={styles.divider} />}
                        </View>
                      ))}
                      {periodTransactionsSorted.length > EXPENSE_PREVIEW && (
                        <>
                          <View style={styles.divider} />
                          <TouchableOpacity style={styles.recentToggle} onPress={() => setShowAllExpenses((v) => !v)} activeOpacity={0.7}>
                            <Text style={styles.recentToggleText}>{showAllExpenses ? 'Show less' : `View all ${periodTransactionsSorted.length} expenses`}</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </>
                  )}
                </Card>
              </View>

              {/* Right column */}
              <View style={styles.rightCol}>
                {categoryBreakdown}
                {reportsLink}
              </View>
            </View>
          ) : (
            <>
              {categoryBreakdown}
              <DebtPaymentCard debts={budget.debts} paidThisMonth={paidDebtNames} onPaid={handleDebtPaid} />
              <Card style={styles.recentCard}>
                <View style={styles.recentHeader}>
                  <Text style={styles.recentTitle}>Recent Expenses</Text>
                  {periodTransactionsSorted.length > 0 && (
                    <Text style={styles.recentCount}>{periodTransactionsSorted.length} {periodTransactionsSorted.length === 1 ? 'entry' : 'entries'}</Text>
                  )}
                </View>
                {periodTransactionsSorted.length === 0 ? (
                  <View style={styles.recentEmpty}>
                    <Text style={styles.recentEmptyText}>No expenses yet. Tap "+ Log Expense" to get started.</Text>
                  </View>
                ) : (
                  <>
                    {(showAllExpenses ? periodTransactionsSorted : periodTransactionsSorted.slice(0, EXPENSE_PREVIEW)).map((tx, idx, arr) => (
                      <View key={tx.id}>
                        <TransactionRow transaction={tx} categories={displayCategories} onEdit={() => openEdit(tx)} onDelete={() => handleDelete(tx)} />
                        {idx < arr.length - 1 && <View style={styles.divider} />}
                      </View>
                    ))}
                    {periodTransactionsSorted.length > EXPENSE_PREVIEW && (
                      <>
                        <View style={styles.divider} />
                        <TouchableOpacity style={styles.recentToggle} onPress={() => setShowAllExpenses((v) => !v)} activeOpacity={0.7}>
                          <Text style={styles.recentToggleText}>{showAllExpenses ? 'Show less' : `View all ${periodTransactionsSorted.length} expenses`}</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </>
                )}
              </Card>
              {reportsLink}
            </>
          )}

        </ScrollView>

        <AddExpenseModal visible={modalOpen} onClose={closeModal} editingTransaction={editingTransaction} />
      </SafeAreaView>

      {celebration && (
        <CelebrationOverlay debtName={celebration.name} amount={celebration.amount} onDone={() => setCelebration(null)} />
      )}

      <Modal visible={showMonthEndModal} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.meOverlay}>
          <View style={[styles.meCard, isDesktop && styles.meCardDesktop]}>
            <Text style={styles.meEmoji}>📅</Text>
            <Text style={styles.meTitle}>It's a new month!</Text>
            <Text style={styles.meBody}>
              Ready to move into <Text style={styles.meBold}>{NEW_MONTH_NAME}</Text>? Or need to make final changes to <Text style={styles.meBold}>{PREV_MONTH_LABEL}</Text>?
            </Text>
            <TouchableOpacity style={styles.meConfirmBtn} onPress={handleConfirmMonthEnd} activeOpacity={0.85}>
              <Text style={styles.meConfirmText}>Let's go, {NEW_MONTH_NAME}! 🚀</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.meDismissBtn} onPress={() => setShowMonthEndModal(false)} activeOpacity={0.75}>
              <Text style={styles.meDismissText}>Final changes first</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
