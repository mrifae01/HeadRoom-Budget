/**
 * DashboardScreen — live monthly budget overview.
 *
 * All figures are derived from BudgetContext (setup data + transactions).
 * "This month" = the current calendar month.
 *
 * Layout:
 *   • Header            — "Dashboard" + current month name
 *   • HeroCard           — Remaining this month + Log Expense button
 *   • MetricRow          — Spent / Remaining / Debt total
 *   • CategoryBreakdown  — one row per configured category, real spend vs budget
 *   • Recent Expenses    — this month's transactions with edit / delete
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Animated,
  Modal,
} from 'react-native';
import { typography, spacing, radius, shadows } from '../theme';
import { Colors } from '../theme';
import { useTheme } from '../context/ThemeContext';
import Card from '../components/Card';
import ProgressBar from '../components/ProgressBar';
import AddExpenseModal from '../components/AddExpenseModal';
import { useBudget } from '../context/BudgetContext';
import { CategoryItem, DebtItem, Transaction } from '../types/budget';

// ─── "Other" catch-all category ───────────────────────────────────────────────
// Always injected at the bottom of the breakdown so there's always somewhere
// to log an unknown expense. Has no budget limit.
const OTHER_CATEGORY: CategoryItem = {
  id: '__other__',
  name: 'Other/Misc',
  icon: '📦',
  color: '#94A3B8',
  amount: '0', // 0 = no limit
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

const NOW = new Date();

/** "March 2026" */
const MONTH_LABEL = NOW.toLocaleString(undefined, { month: 'long', year: 'numeric' });

/** True if an ISO date string ("YYYY-MM-DD") falls in the current month */
function isThisMonth(isoDate: string): boolean {
  const d = new Date(isoDate);
  return d.getFullYear() === NOW.getFullYear() && d.getMonth() === NOW.getMonth();
}

/** Format a number as a compact dollar string */
function dollars(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/** "Mar 23" from an ISO date string */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Given a total balance and monthly payment, returns a human-readable
 * payoff estimate: "8 months", "2 yrs 3 mo", etc.
 */
function payoffLabel(total: number, monthly: number): string {
  const months = Math.ceil(total / monthly);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const yrs = Math.floor(months / 12);
  const mo  = months % 12;
  return mo > 0 ? `${yrs} yr${yrs === 1 ? '' : 's'} ${mo} mo` : `${yrs} yr${yrs === 1 ? '' : 's'}`;
}

/** Today's date as "YYYY-MM-DD" */
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Period types & window helpers ────────────────────────────────────────────

type Period = 'month' | 'biweek' | 'week';

interface PeriodWindow {
  start: Date;
  end: Date;
  /** e.g. "Mar 23 – Mar 29" or "March 2026" */
  label: string;
  /** Number of days in this window */
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
    const start = new Date(year, month, 1);
    const end   = new Date(year, month, dim);
    return { start, end, label: MONTH_LABEL, days: dim };
  }

  if (period === 'biweek') {
    if (day <= 15) {
      const start = new Date(year, month, 1);
      const end   = new Date(year, month, 15);
      return { start, end, label: `${shortDate(start)} – ${shortDate(end)}`, days: 15 };
    }
    const start = new Date(year, month, 16);
    const end   = new Date(year, month, dim);
    return { start, end, label: `${shortDate(start)} – ${shortDate(end)}`, days: dim - 15 };
  }

  // week: Mon–Sun
  const dow   = today.getDay(); // 0=Sun … 6=Sat
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
    const pm  = month === 0 ? 11 : month - 1;
    const py  = month === 0 ? year - 1 : year;
    const dim = getDaysInMonth(py, pm);
    const start = new Date(py, pm, 1);
    const end   = new Date(py, pm, dim);
    return { start, end, label: start.toLocaleString(undefined, { month: 'long', year: 'numeric' }), days: dim };
  }

  if (period === 'biweek') {
    if (day <= 15) {
      // current = 1st–15th → prev = 16th–end of last month
      const pm  = month === 0 ? 11 : month - 1;
      const py  = month === 0 ? year - 1 : year;
      const dim = getDaysInMonth(py, pm);
      const start = new Date(py, pm, 16);
      const end   = new Date(py, pm, dim);
      return { start, end, label: `${shortDate(start)} – ${shortDate(end)}`, days: dim - 15 };
    }
    // current = 16th–end → prev = 1st–15th same month
    const start = new Date(year, month, 1);
    const end   = new Date(year, month, 15);
    return { start, end, label: `${shortDate(start)} – ${shortDate(end)}`, days: 15 };
  }

  // week: previous Mon–Sun
  const dow     = today.getDay();
  const currMon = new Date(today);
  currMon.setDate(day - (dow === 0 ? 6 : dow - 1));
  const start = new Date(currMon);
  start.setDate(currMon.getDate() - 7);
  const end   = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end, label: `${shortDate(start)} – ${shortDate(end)}`, days: 7 };
}

/** True if an ISO date string ("YYYY-MM-DD") falls within [start, end] inclusive */
function isInWindow(isoDate: string, start: Date, end: Date): boolean {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date >= start && date <= end;
}

/**
 * Look up icon + color for a category name.
 * Falls back to the Other/Misc values if the category no longer exists.
 */
function getCategoryMeta(
  name: string,
  categories: CategoryItem[],
): { icon: string; color: string } {
  const found = categories.find((c) => c.name === name);
  return found ?? { icon: '📦', color: '#94A3B8' };
}

// ─── TransactionRow ────────────────────────────────────────────────────────────

interface TransactionRowProps {
  transaction: Transaction;
  categories: CategoryItem[];
  onEdit: () => void;
  onDelete: () => void;
}

const createTxStyles = (c: Colors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 18,
  },
  info: {
    flex: 1,
  },
  category: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: c.textPrimary,
  },
  meta: {
    fontSize: typography.xs,
    color: c.textMuted,
    marginTop: 1,
  },
  right: {
    alignItems: 'flex-end',
    gap: spacing[1],
  },
  amount: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: c.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[1],
  },
  editBubble: {
    backgroundColor: c.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: c.primary + '40',
  },
  editBubbleText: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: c.primary,
  },
  deleteBubble: {
    backgroundColor: c.dangerLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: c.danger + '40',
  },
  deleteBubbleText: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: c.danger,
  },
});

function TransactionRow({ transaction, categories, onEdit, onDelete }: TransactionRowProps) {
  const { colors } = useTheme();
  const txStyles = useMemo(() => createTxStyles(colors), [colors]);

  const { icon, color } = getCategoryMeta(transaction.categoryName, categories);

  return (
    <View style={txStyles.row}>
      {/* Left: icon + category + optional note */}
      <View style={txStyles.left}>
        <View style={[txStyles.iconWrap, { backgroundColor: color + '22' }]}>
          <Text style={txStyles.icon}>{icon}</Text>
        </View>
        <View style={txStyles.info}>
          <Text style={txStyles.category}>{transaction.categoryName}</Text>
          <Text style={txStyles.meta}>
            {formatDate(transaction.date)}
            {transaction.note ? ` · ${transaction.note}` : ''}
          </Text>
        </View>
      </View>

      {/* Right: amount + action buttons */}
      <View style={txStyles.right}>
        <Text style={txStyles.amount}>{dollars(transaction.amount)}</Text>
        <View style={txStyles.actions}>
          <TouchableOpacity
            style={txStyles.editBubble}
            onPress={onEdit}
            accessibilityLabel="Edit expense"
          >
            <Text style={txStyles.editBubbleText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={txStyles.deleteBubble}
            onPress={onDelete}
            accessibilityLabel="Delete expense"
          >
            <Text style={txStyles.deleteBubbleText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── HeroCard ─────────────────────────────────────────────────────────────────

interface HeroCardProps {
  totalIncome: number;
  totalSpent: number;
  periodLabel: string;
  windowLabel: string;
  surplus: number;
  onLogExpense: () => void;
}

const createHeroStyles = (c: Colors) => StyleSheet.create({
  card: {
    backgroundColor: c.primary,
    borderRadius: radius.xl,
    padding: spacing[6],
    marginBottom: spacing[4],
    overflow: 'hidden',
  },
  blobTop: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: -60,
    right: -40,
  },
  blobBottom: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -30,
    left: -20,
  },
  label: {
    fontSize: typography.sm,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: typography.medium,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  amount: {
    fontSize: typography['3xl'],
    fontWeight: typography.extrabold,
    color: c.textInverse,
    marginTop: spacing[1],
  },
  sub: {
    fontSize: typography.sm,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  barWrap: {
    marginTop: spacing[5],
  },
  barLabel: {
    fontSize: typography.xs,
    color: 'rgba(255,255,255,0.7)',
    marginTop: spacing[1],
  },
  // White pill button sitting at the bottom of the blue hero card
  logBtn: {
    backgroundColor: c.textInverse,
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    alignItems: 'center',
    marginTop: spacing[4],
  },
  logBtnText: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: c.primary,
    letterSpacing: 0.3,
  },
  surplusBadge: {
    marginTop: spacing[2],
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  surplusText: {
    fontSize: typography.xs,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: typography.semibold,
  },
  windowLabel: {
    fontSize: typography.xs,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 3,
  },
});

function HeroCard({ totalIncome, totalSpent, periodLabel, windowLabel, surplus, onLogExpense }: HeroCardProps) {
  const { colors } = useTheme();
  const heroStyles = useMemo(() => createHeroStyles(colors), [colors]);

  const remaining  = Math.max(totalIncome - totalSpent, 0);
  const overBudget = totalSpent > totalIncome;
  const progress   = totalIncome > 0 ? Math.min(totalSpent / totalIncome, 1) : 0;
  const pctUsed    = totalIncome > 0 ? Math.round((totalSpent / totalIncome) * 100) : 0;

  return (
    <View style={[heroStyles.card, shadows.lg]}>
      {/* Decorative blobs */}
      <View style={heroStyles.blobTop} />
      <View style={heroStyles.blobBottom} />

      <Text style={heroStyles.label}>Remaining This {periodLabel}</Text>
      <Text style={heroStyles.amount}>
        {overBudget ? `−${dollars(totalSpent - totalIncome)}` : dollars(remaining)}
      </Text>
      <Text style={heroStyles.sub}>
        {dollars(totalSpent)} spent of {dollars(totalIncome)} budget
      </Text>
      {surplus > 0 && (
        <View style={heroStyles.surplusBadge}>
          <Text style={heroStyles.surplusText}>✦ +{dollars(surplus)} surplus from last period</Text>
        </View>
      )}
      <Text style={heroStyles.windowLabel}>{windowLabel}</Text>

      <View style={heroStyles.barWrap}>
        <ProgressBar
          progress={progress}
          color={pctUsed >= 100 ? colors.danger : pctUsed >= 75 ? colors.warning : 'rgba(255,255,255,0.9)'}
          trackColor="rgba(255,255,255,0.25)"
          height={10}
        />
        <Text style={heroStyles.barLabel}>
          {overBudget ? 'Over budget' : `${100 - pctUsed}% remaining`}
        </Text>
      </View>

      {/* Log Expense button — lives right under the remaining amount */}
      <TouchableOpacity
        style={heroStyles.logBtn}
        onPress={onLogExpense}
        activeOpacity={0.85}
        accessibilityLabel="Log an expense"
      >
        <Text style={heroStyles.logBtnText}>+ Log Expense</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

const createMetricStyles = (c: Colors) => StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing[3],
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: spacing[2],
  },
  value: {
    fontSize: typography.base,
    fontWeight: typography.bold,
  },
  label: {
    fontSize: typography.xs,
    color: c.textSecondary,
    marginTop: 2,
    fontWeight: typography.medium,
  },
});

function MetricCard({
  label,
  value,
  accent,
  bg,
}: {
  label: string;
  value: string;
  accent: string;
  bg: string;
}) {
  const { colors } = useTheme();
  const metricStyles = useMemo(() => createMetricStyles(colors), [colors]);

  return (
    <View style={[metricStyles.card, { backgroundColor: bg }]}>
      <View style={[metricStyles.dot, { backgroundColor: accent }]} />
      <Text style={[metricStyles.value, { color: accent }]}>{value}</Text>
      <Text style={metricStyles.label}>{label}</Text>
    </View>
  );
}

// ─── CategoryRow ──────────────────────────────────────────────────────────────

const createCatStyles = (c: Colors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 120,
    gap: spacing[1],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  icon: {
    fontSize: 16,
  },
  name: {
    flex: 1,
    fontSize: typography.sm,
    color: c.textPrimary,
    fontWeight: typography.medium,
  },
  right: {
    flex: 1,
  },
  amounts: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'baseline',
  },
  spent: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: c.textPrimary,
  },
  spentOver: {
    color: c.danger,
  },
  budget: {
    fontSize: typography.xs,
    color: c.textMuted,
  },
  overTag: {
    fontSize: typography.xs,
    color: c.danger,
    fontWeight: typography.bold,
  },
  pct: {
    fontSize: typography.xs,
    color: c.textMuted,
    marginTop: 2,
    textAlign: 'right',
  },
  // Shown instead of "/ $0" when a category has no budget limit
  noLimit: {
    fontSize: typography.xs,
    color: c.textMuted,
    fontStyle: 'italic',
  },
});

function CategoryRow({
  icon,
  name,
  color,
  spent,
  budget,
}: {
  icon: string;
  name: string;
  color: string;
  spent: number;
  /** 0 means no limit (e.g. the Other/Misc catch-all) */
  budget: number;
}) {
  const { colors } = useTheme();
  const catStyles = useMemo(() => createCatStyles(colors), [colors]);

  const hasLimit   = budget > 0;
  const progress   = hasLimit ? Math.min(spent / budget, 1) : 0;
  const overBudget = hasLimit && spent > budget;
  const pct        = hasLimit ? Math.round((spent / budget) * 100) : null;

  return (
    <View style={catStyles.row}>
      {/* Left: colour dot + icon + name */}
      <View style={catStyles.left}>
        <View style={[catStyles.dot, { backgroundColor: color }]} />
        <Text style={catStyles.icon}>{icon}</Text>
        <Text style={catStyles.name} numberOfLines={1}>{name}</Text>
      </View>

      {/* Right: amounts + bar */}
      <View style={catStyles.right}>
        <View style={catStyles.amounts}>
          <Text style={[catStyles.spent, overBudget && catStyles.spentOver]}>
            {dollars(spent)}
          </Text>
          {hasLimit ? (
            <>
              <Text style={catStyles.budget}> / {dollars(budget)}</Text>
              {overBudget && <Text style={catStyles.overTag}> OVER</Text>}
            </>
          ) : (
            // No budget limit set — show a soft label instead of "/ $0"
            <Text style={catStyles.noLimit}></Text>
          )}
        </View>
        {hasLimit && (
          <>
            <ProgressBar
              progress={progress}
              color={overBudget ? colors.danger : color}
              trackColor={colors.surfaceAlt}
              height={6}
              style={{ marginTop: 4 }}
            />
            <Text style={catStyles.pct}>{pct}%</Text>
          </>
        )}
      </View>
    </View>
  );
}

// ─── CelebrationOverlay ───────────────────────────────────────────────────────

const BURST_PARTICLES = [
  { angle: 0,   color: '#6366F1', size: 12 },
  { angle: 36,  color: '#10B981', size: 9  },
  { angle: 72,  color: '#F59E0B', size: 11 },
  { angle: 108, color: '#EC4899', size: 8  },
  { angle: 144, color: '#3B82F6', size: 13 },
  { angle: 180, color: '#8B5CF6', size: 9  },
  { angle: 216, color: '#F97316', size: 10 },
  { angle: 252, color: '#14B8A6', size: 11 },
  { angle: 288, color: '#EF4444', size: 8  },
  { angle: 324, color: '#6366F1', size: 10 },
];

const createCelebStyles = (c: Colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  burstWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 1,
    height: 1,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    paddingHorizontal: spacing[8],
    paddingVertical: spacing[6],
    alignItems: 'center',
    gap: spacing[2],
    minWidth: 260,
    ...shadows.lg,
  },
  checkCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: c.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[1],
  },
  checkMark: {
    fontSize: 34,
    color: c.accent,
    fontWeight: typography.bold,
    lineHeight: 40,
  },
  cardTitle: {
    fontSize: typography.xl,
    fontWeight: typography.bold,
    color: c.textPrimary,
  },
  cardDebt: {
    fontSize: typography.base,
    fontWeight: typography.medium,
    color: c.textSecondary,
  },
  cardAmount: {
    fontSize: typography.sm,
    color: c.textMuted,
  },
  kudosPill: {
    marginTop: spacing[2],
    backgroundColor: c.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[1] + 2,
  },
  kudosText: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: c.primary,
  },
});

/**
 * Full-screen celebration modal — mounts when a debt is marked paid,
 * auto-dismisses after ~2 seconds, then calls onDone to unmount.
 */
function CelebrationOverlay({
  debtName,
  amount,
  onDone,
}: {
  debtName: string;
  amount: number;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const celebStyles = useMemo(() => createCelebStyles(colors), [colors]);

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
      <Animated.View style={[celebStyles.overlay, { opacity: fadeAnim }]}>

        {/* Burst particles — radiate outward from centre */}
        <View style={celebStyles.burstWrap} pointerEvents="none">
          {BURST_PARTICLES.map((p, i) => {
            const rad = (p.angle * Math.PI) / 180;
            const tx  = burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 110 * Math.cos(rad)] });
            const ty  = burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 110 * Math.sin(rad)] });
            const op  = burstAnim.interpolate({ inputRange: [0, 0.15, 0.65, 1], outputRange: [0, 1, 1, 0] });
            return (
              <Animated.View
                key={i}
                style={{
                  position: 'absolute',
                  width: p.size,
                  height: p.size,
                  borderRadius: p.size / 2,
                  backgroundColor: p.color,
                  opacity: op,
                  transform: [{ translateX: tx }, { translateY: ty }],
                }}
              />
            );
          })}
        </View>

        {/* Card */}
        <Animated.View style={[celebStyles.card, { transform: [{ scale: scaleAnim }] }]}>
          <View style={celebStyles.checkCircle}>
            <Text style={celebStyles.checkMark}>✓</Text>
          </View>
          <Text style={celebStyles.cardTitle}>Payment Logged!</Text>
          <Text style={celebStyles.cardDebt}>{debtName}</Text>
          <Text style={celebStyles.cardAmount}>${amount.toLocaleString()} / month</Text>
          <View style={celebStyles.kudosPill}>
            <Text style={celebStyles.kudosText}>Keep crushing it 💪</Text>
          </View>
        </Animated.View>

      </Animated.View>
    </Modal>
  );
}

// ─── DebtPaymentCard ──────────────────────────────────────────────────────────

interface DebtPaymentCardProps {
  debts: DebtItem[];
  /** Set of debt names already paid this month */
  paidThisMonth: Set<string>;
  onPaid: (debt: DebtItem) => void;
}

const createDebtCardStyles = (c: Colors) => StyleSheet.create({
  card: {
    marginTop: spacing[4],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing[4],
  },
  title: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: c.textPrimary,
  },
  sub: {
    fontSize: typography.xs,
    color: c.textMuted,
    fontWeight: typography.medium,
  },
  divider: {
    height: 1,
    backgroundColor: c.border,
    marginVertical: spacing[3],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  left: {
    flex: 1,
  },
  name: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: c.textPrimary,
  },
  timeline: {
    fontSize: typography.xs,
    color: c.textMuted,
    marginTop: 2,
  },
  timelineBold: {
    fontWeight: typography.bold,
    color: c.primary,
  },
  right: {
    alignItems: 'flex-end',
    gap: spacing[2],
  },
  monthlyAmount: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: c.textPrimary,
  },
  paidBtn: {
    backgroundColor: c.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[1] + 2,
    borderWidth: 1,
    borderColor: c.primary + '40',
  },
  paidBtnDone: {
    backgroundColor: c.accentLight,
    borderColor: c.accent + '40',
  },
  paidBtnText: {
    fontSize: typography.xs,
    fontWeight: typography.bold,
    color: c.primary,
  },
  paidBtnTextDone: {
    color: c.accent,
  },
});

function DebtPaymentCard({ debts, paidThisMonth, onPaid }: DebtPaymentCardProps) {
  const { colors } = useTheme();
  const debtCardStyles = useMemo(() => createDebtCardStyles(colors), [colors]);

  // Only render debts that have a monthly payment amount
  const payable = debts.filter((d) => parseFloat(d.amount) > 0);
  if (payable.length === 0) return null;

  return (
    <Card style={debtCardStyles.card}>
      <View style={debtCardStyles.header}>
        <Text style={debtCardStyles.title}>Debt Payments</Text>
        <Text style={debtCardStyles.sub}>tap when paid</Text>
      </View>

      {payable.map((debt, idx) => {
        const monthly    = parseFloat(debt.amount);
        const total      = parseFloat(debt.totalAmount ?? '') || 0;
        const hasForecast = monthly > 0 && total > 0;
        const isPaid     = paidThisMonth.has(debt.name);

        return (
          <View key={debt.id}>
            {idx > 0 && <View style={debtCardStyles.divider} />}
            <View style={debtCardStyles.row}>

              {/* Left: name + optional payoff forecast */}
              <View style={debtCardStyles.left}>
                <Text style={debtCardStyles.name} numberOfLines={1}>
                  {debt.name || 'Unnamed Debt'}
                </Text>
                {hasForecast && (
                  <Text style={debtCardStyles.timeline}>
                    Paid off in{' '}
                    <Text style={debtCardStyles.timelineBold}>
                      {payoffLabel(total, monthly)}
                    </Text>
                  </Text>
                )}
              </View>

              {/* Right: amount + I Paid button */}
              <View style={debtCardStyles.right}>
                <Text style={debtCardStyles.monthlyAmount}>
                  ${monthly.toLocaleString()}/mo
                </Text>
                <TouchableOpacity
                  style={[debtCardStyles.paidBtn, isPaid && debtCardStyles.paidBtnDone]}
                  onPress={() => !isPaid && onPaid(debt)}
                  disabled={isPaid}
                  activeOpacity={0.8}
                  accessibilityLabel={isPaid ? `${debt.name} paid this month` : `Mark ${debt.name} as paid`}
                >
                  <Text style={[debtCardStyles.paidBtnText, isPaid && debtCardStyles.paidBtnTextDone]}>
                    {isPaid ? '✓  Paid' : 'I Paid'}
                  </Text>
                </TouchableOpacity>
              </View>

            </View>
          </View>
        );
      })}
    </Card>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

const createEmptyStyles = (c: Colors) => StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing[8],
    gap: spacing[3],
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: c.textPrimary,
  },
  body: {
    fontSize: typography.sm,
    color: c.textSecondary,
    textAlign: 'center',
    lineHeight: typography.sm * typography.relaxed,
  },
});

function EmptyCategories() {
  const { colors } = useTheme();
  const emptyStyles = useMemo(() => createEmptyStyles(colors), [colors]);

  return (
    <View style={emptyStyles.wrap}>
      <Text style={emptyStyles.icon}>📋</Text>
      <Text style={emptyStyles.title}>No categories set up</Text>
      <Text style={emptyStyles.body}>
        Head to the Setup tab to add your budget categories and income.
      </Text>
    </View>
  );
}

// ─── PeriodSelector ──────────────────────────────────────────────────────────

const createPSStyles = (c: Colors) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.full,
    padding: 3,
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: c.border,
  },
  pill: {
    flex: 1,
    paddingVertical: spacing[2],
    alignItems: 'center',
    borderRadius: radius.full,
  },
  pillActive: {
    backgroundColor: c.primary,
  },
  pillText: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: c.textSecondary,
    letterSpacing: 0.3,
  },
  pillTextActive: {
    color: c.textInverse,
  },
});

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: 'month',  label: 'Month'   },
  { key: 'biweek', label: 'Bi-Week' },
  { key: 'week',   label: 'Week'    },
];

function PeriodSelector({
  period,
  onChange,
}: {
  period: Period;
  onChange: (p: Period) => void;
}) {
  const { colors } = useTheme();
  const psStyles = useMemo(() => createPSStyles(colors), [colors]);

  return (
    <View style={psStyles.wrap}>
      {PERIOD_OPTIONS.map(({ key, label }) => (
        <TouchableOpacity
          key={key}
          style={[psStyles.pill, period === key && psStyles.pillActive]}
          onPress={() => onChange(key)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ selected: period === key }}
        >
          <Text style={[psStyles.pillText, period === key && psStyles.pillTextActive]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── DashboardScreen ─────────────────────────────────────────────────────────

const createStyles = (c: Colors) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: c.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[6],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing[4],
  },
  title: {
    fontSize: typography['2xl'],
    fontWeight: typography.bold,
    color: c.textPrimary,
  },
  month: {
    fontSize: typography.sm,
    color: c.textMuted,
    fontWeight: typography.medium,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  breakdownCard: {
    // Card provides padding + border
  },
  breakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing[4],
  },
  breakdownTitle: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: c.textPrimary,
  },
  breakdownSub: {
    fontSize: typography.xs,
    color: c.textMuted,
    fontWeight: typography.medium,
  },
  divider: {
    height: 1,
    backgroundColor: c.border,
  },
  recentCard: {
    marginTop: spacing[4],
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing[3],
  },
  recentTitle: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: c.textPrimary,
  },
  recentCount: {
    fontSize: typography.xs,
    color: c.textMuted,
    fontWeight: typography.medium,
  },
  recentEmpty: {
    paddingVertical: spacing[5],
    alignItems: 'center',
  },
  recentEmptyText: {
    fontSize: typography.sm,
    color: c.textMuted,
    textAlign: 'center',
    lineHeight: typography.sm * 1.6,
  },
});

export default function DashboardScreen() {
  const { budget, addTransaction, deleteTransaction } = useBudget();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Expense modal state — null = add mode, Transaction = edit mode
  const [modalOpen,          setModalOpen]          = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // Celebration overlay — set to the debt being celebrated, cleared when animation ends
  const [celebration, setCelebration] = useState<{ name: string; amount: number } | null>(null);

  // Period selector — defaults to full month view
  const [period, setPeriod] = useState<Period>('month');

  const openAdd  = () => { setEditingTransaction(null);  setModalOpen(true); };
  const openEdit = (tx: Transaction) => { setEditingTransaction(tx); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditingTransaction(null); };

  const handleDelete = (tx: Transaction) => {
    Alert.alert(
      'Delete Expense',
      `Remove $${tx.amount} from ${tx.categoryName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteTransaction(tx.id) },
      ],
    );
  };

  // ── Derived figures — all memoised ───────────────────────────────────────────

  /** Transactions that fall in the current calendar month (for debt tracking) */
  const thisMonth = useMemo(
    () => budget.transactions.filter((t) => isThisMonth(t.date)),
    [budget.transactions],
  );

  /** Total income (sum of all income source amounts) */
  const totalIncome = useMemo(
    () => budget.incomeSources.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0),
    [budget.incomeSources],
  );

  /** Sum of all monthly debt payment amounts defined in setup */
  const totalDebt = useMemo(
    () => budget.debts.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0),
    [budget.debts],
  );

  /** Debt names as a Set — used to split debt vs category transactions */
  const debtNamesSet = useMemo(
    () => new Set(budget.debts.map((d) => d.name)),
    [budget.debts],
  );

  /**
   * Total debt payments actually logged this month via "I Paid".
   * Always monthly — debt obligations are a monthly concern.
   */
  const debtPaidThisMonth = useMemo(
    () => thisMonth
      .filter((tx) => debtNamesSet.has(tx.categoryName))
      .reduce((sum, tx) => sum + tx.amount, 0),
    [thisMonth, debtNamesSet],
  );

  /**
   * Categories to display in the breakdown.
   * Always ends with the "Other/Misc" catch-all unless the user has
   * already added it to their setup (avoids a duplicate row).
   */
  const displayCategories = useMemo(() => {
    const alreadyHasOther = budget.categories.some(
      (c) => c.name === OTHER_CATEGORY.name,
    );
    return alreadyHasOther
      ? budget.categories
      : [...budget.categories, OTHER_CATEGORY];
  }, [budget.categories]);

  /**
   * Set of debt names that already have a payment transaction this month.
   * Used to show "✓ Paid" and disable the button after it's been tapped.
   */
  const paidDebtNames = useMemo(() => {
    const paid = new Set<string>();
    for (const tx of thisMonth) {
      if (debtNamesSet.has(tx.categoryName)) paid.add(tx.categoryName);
    }
    return paid;
  }, [thisMonth, debtNamesSet]);

  /** Log a debt payment as a transaction and trigger the celebration. */
  const handleDebtPaid = useCallback(async (debt: DebtItem) => {
    await addTransaction({
      categoryName: debt.name,
      amount: parseFloat(debt.amount),
      date: todayISO(),
      note: 'Debt payment',
    });
    setCelebration({ name: debt.name, amount: parseFloat(debt.amount) });
  }, [addTransaction]);

  /**
   * The true discretionary budget — income after committed debt obligations.
   * This is what the user actually has available to spend on categories.
   */
  const spendableBudget = useMemo(
    () => Math.max(totalIncome - totalDebt, 0),
    [totalIncome, totalDebt],
  );

  // ── Period-scoped data ───────────────────────────────────────────────────────

  const daysInCurrentMonth = useMemo(
    () => getDaysInMonth(NOW.getFullYear(), NOW.getMonth()),
    [],
  );

  const periodWindow     = useMemo(() => getCurrentPeriodWindow(period),  [period]);
  const prevPeriodWindow = useMemo(() => getPreviousPeriodWindow(period),  [period]);

  const periodTransactions = useMemo(
    () => budget.transactions.filter(
      (t) => isInWindow(t.date, periodWindow.start, periodWindow.end),
    ),
    [budget.transactions, periodWindow],
  );

  const prevPeriodTransactions = useMemo(
    () => budget.transactions.filter(
      (t) => isInWindow(t.date, prevPeriodWindow.start, prevPeriodWindow.end),
    ),
    [budget.transactions, prevPeriodWindow],
  );

  /** Category budget proportional to period days */
  const periodBudget = useMemo(
    () => daysInCurrentMonth > 0
      ? (spendableBudget / daysInCurrentMonth) * periodWindow.days
      : 0,
    [spendableBudget, daysInCurrentMonth, periodWindow.days],
  );

  const prevPeriodBudget = useMemo(
    () => daysInCurrentMonth > 0
      ? (spendableBudget / daysInCurrentMonth) * prevPeriodWindow.days
      : 0,
    [spendableBudget, daysInCurrentMonth, prevPeriodWindow.days],
  );

  /** Map of categoryName → amount spent in the current period (no debt) */
  const periodSpentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of periodTransactions) {
      if (!debtNamesSet.has(tx.categoryName)) {
        map[tx.categoryName] = (map[tx.categoryName] ?? 0) + tx.amount;
      }
    }
    return map;
  }, [periodTransactions, debtNamesSet]);

  const periodCategorySpentTotal = useMemo(
    () => Object.values(periodSpentByCategory).reduce((s, v) => s + v, 0),
    [periodSpentByCategory],
  );

  const prevPeriodCategorySpentTotal = useMemo(
    () => prevPeriodTransactions
      .filter((tx) => !debtNamesSet.has(tx.categoryName))
      .reduce((sum, tx) => sum + tx.amount, 0),
    [prevPeriodTransactions, debtNamesSet],
  );

  /**
   * Carry-forward surplus from the immediately previous period.
   * Only applies for sub-monthly periods, and only when the previous
   * period's start date falls in the same calendar month as today
   * (so weekly surpluses never cross month boundaries).
   */
  const surplus = useMemo(() => {
    if (period === 'month') return 0;
    const sameMonth =
      prevPeriodWindow.start.getFullYear() === NOW.getFullYear() &&
      prevPeriodWindow.start.getMonth()    === NOW.getMonth();
    if (!sameMonth) return 0;
    return Math.max(0, prevPeriodBudget - prevPeriodCategorySpentTotal);
  }, [period, prevPeriodWindow, prevPeriodBudget, prevPeriodCategorySpentTotal]);

  /** Period budget plus any carried surplus */
  const effectivePeriodBudget = useMemo(
    () => periodBudget + surplus,
    [periodBudget, surplus],
  );

  /** Convenience label for the hero card title */
  const periodLabel = period === 'month' ? 'Month' : period === 'biweek' ? 'Bi-Week' : 'Week';

  /** Period-scoped transactions newest-first for the Recent Expenses list */
  const periodTransactionsSorted = useMemo(
    () => [...periodTransactions].sort((a, b) => b.date.localeCompare(a.date)),
    [periodTransactions],
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.month}>{MONTH_LABEL}</Text>
        </View>

        {/* Period selector — [Month | Bi-Week | Week] */}
        <PeriodSelector period={period} onChange={setPeriod} />

        {/*
          Hero uses effectivePeriodBudget (period slice of spendable budget
          + any surplus from the previous period). periodCategorySpentTotal
          drives the bar — debt payments are tracked separately below.
        */}
        <HeroCard
          totalIncome={effectivePeriodBudget}
          totalSpent={periodCategorySpentTotal}
          periodLabel={periodLabel}
          windowLabel={periodWindow.label}
          surplus={surplus}
          onLogExpense={openAdd}
        />

        {/* Metrics — Spent & Remaining are period-scoped; Debt Left is monthly */}
        <View style={styles.metricRow}>
          <MetricCard
            label="Spent"
            value={dollars(periodCategorySpentTotal)}
            accent={colors.danger}
            bg={colors.dangerLight}
          />
          <MetricCard
            label="Remaining"
            value={dollars(Math.max(effectivePeriodBudget - periodCategorySpentTotal, 0))}
            accent={colors.accent}
            bg={colors.accentLight}
          />
          <MetricCard
            label="Debt Left"
            value={dollars(Math.max(totalDebt - debtPaidThisMonth, 0))}
            accent={colors.primary}
            bg={colors.primaryLight}
          />
        </View>

        {/* Category breakdown — budget scaled to current period */}
        <Card style={styles.breakdownCard}>
          <View style={styles.breakdownHeader}>
            <Text style={styles.breakdownTitle}>Category Breakdown</Text>
            <Text style={styles.breakdownSub}>{periodWindow.label}</Text>
          </View>

          {displayCategories.map((cat, idx) => {
            const monthlyLimit = parseFloat(cat.amount) || 0;
            const periodLimit  = monthlyLimit > 0 && daysInCurrentMonth > 0
              ? (monthlyLimit / daysInCurrentMonth) * periodWindow.days
              : monthlyLimit;
            return (
              <View key={cat.id}>
                <CategoryRow
                  icon={cat.icon}
                  name={cat.name}
                  color={cat.color}
                  spent={periodSpentByCategory[cat.name] ?? 0}
                  budget={periodLimit}
                />
                {idx < displayCategories.length - 1 && (
                  <View style={styles.divider} />
                )}
              </View>
            );
          })}
        </Card>

        {/* ── Debt Payments — "I Paid" buttons + optional payoff forecast ── */}
        <DebtPaymentCard
          debts={budget.debts}
          paidThisMonth={paidDebtNames}
          onPaid={handleDebtPaid}
        />

        {/* ── Recent Expenses (scoped to the selected period) ── */}
        <Card style={styles.recentCard}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>Recent Expenses</Text>
            {periodTransactionsSorted.length > 0 && (
              <Text style={styles.recentCount}>
                {periodTransactionsSorted.length}{' '}
                {periodTransactionsSorted.length === 1 ? 'entry' : 'entries'}
              </Text>
            )}
          </View>

          {periodTransactionsSorted.length === 0 ? (
            <View style={styles.recentEmpty}>
              <Text style={styles.recentEmptyText}>
                No expenses logged yet. Tap "Log Expense" above to get started.
              </Text>
            </View>
          ) : (
            periodTransactionsSorted.map((tx, idx) => (
              <View key={tx.id}>
                <TransactionRow
                  transaction={tx}
                  categories={displayCategories}
                  onEdit={() => openEdit(tx)}
                  onDelete={() => handleDelete(tx)}
                />
                {idx < periodTransactionsSorted.length - 1 && (
                  <View style={styles.divider} />
                )}
              </View>
            ))
          )}
        </Card>

        <View style={{ height: spacing[8] }} />
      </ScrollView>

      {/* Add / Edit Expense Modal */}
      <AddExpenseModal
        visible={modalOpen}
        onClose={closeModal}
        editingTransaction={editingTransaction}
      />
    </SafeAreaView>

    {/* Celebration overlay — mounts on debt paid, auto-dismisses */}
    {celebration && (
      <CelebrationOverlay
        debtName={celebration.name}
        amount={celebration.amount}
        onDone={() => setCelebration(null)}
      />
    )}
    </>
  );
}
