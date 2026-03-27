/**
 * MonthDetailScreen — full data visualisation for one archived month.
 *
 * Sections:
 *   1. Hero summary card  (income / spent / saved ring)
 *   2. Category stacked bar  (proportional colour segments)
 *   3. Budget vs Actual rows  (horizontal fill bar per category)
 *   4. Debt payments summary
 *   5. Full transaction list
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { typography, spacing, radius, shadows } from '../theme';
import { Colors } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth }  from '../context/AuthContext';
import { RootStackParamList } from '../navigation/RootNavigator';
import { MonthlyRecord, Transaction } from '../types/budget';
import { loadMonthlyRecord, formatMonthLabel } from '../storage/reports';
import ProgressBar from '../components/ProgressBar';

// ─── Types ───────────────────────────────────────────────────────────────────

type DetailRoute = RouteProp<RootStackParamList, 'MonthDetail'>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dollars(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric' });
}

// ─── DonutRing ────────────────────────────────────────────────────────────────
// SVG ring chart showing spent vs budget.

function DonutRing({
  progress,
  size = 130,
  strokeWidth = 14,
  color,
  trackColor,
  children,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  trackColor: string;
  children?: React.ReactNode;
}) {
  const r             = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset        = circumference * (1 - Math.min(Math.max(progress, 0), 1));
  const cx            = size / 2;
  const cy            = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation="-90" origin={`${cx}, ${cy}`}>
          {/* Track */}
          <Circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
          {/* Progress arc */}
          <Circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </G>
      </Svg>
      {children}
    </View>
  );
}

// ─── StackedBar ───────────────────────────────────────────────────────────────
// Proportional horizontal segments, one per category.

function StackedBar({
  breakdown,
  total,
  height = 28,
}: {
  breakdown: MonthlyRecord['summary']['categoryBreakdown'];
  total: number;
  height?: number;
}) {
  const nonZero = breakdown.filter((c) => c.spent > 0);
  if (nonZero.length === 0 || total === 0) return null;

  return (
    <View style={{
      flexDirection: 'row',
      height,
      borderRadius: radius.md,
      overflow: 'hidden',
      gap: 2,
    }}>
      {nonZero.map((cat, i) => {
        const flex = cat.spent / total;
        return (
          <View
            key={cat.name}
            style={{
              flex,
              backgroundColor: cat.color,
              borderRadius: i === 0 ? radius.md : 0,
              borderTopRightRadius: i === nonZero.length - 1 ? radius.md : 0,
              borderBottomRightRadius: i === nonZero.length - 1 ? radius.md : 0,
            }}
          />
        );
      })}
    </View>
  );
}

// ─── CategoryBudgetRow ────────────────────────────────────────────────────────

const createCatRowStyles = (c: Colors) => StyleSheet.create({
  row:     { marginBottom: spacing[4] },
  header:  { flexDirection: 'row', alignItems: 'center', marginBottom: spacing[1] + 2 },
  dot:     { width: 10, height: 10, borderRadius: 5, marginRight: spacing[2] },
  icon:    { fontSize: typography.base, marginRight: spacing[2] },
  name:    { flex: 1, fontSize: typography.sm, fontWeight: typography.medium, color: c.textPrimary },
  amounts: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  spent:   { fontSize: typography.sm, fontWeight: typography.bold, color: c.textPrimary },
  limit:   { fontSize: typography.xs, color: c.textMuted },
  over:    { fontSize: typography.xs, fontWeight: typography.bold, color: c.danger },
  pctText: { fontSize: typography.xs, color: c.textMuted, textAlign: 'right', marginTop: 2 },
});

function CategoryBudgetRow({
  cat,
}: {
  cat: MonthlyRecord['summary']['categoryBreakdown'][number] & { limit: number };
}) {
  const { colors } = useTheme();
  const s          = useMemo(() => createCatRowStyles(colors), [colors]);
  const hasLimit   = cat.limit > 0;
  const over       = hasLimit && cat.spent > cat.limit;
  const progress   = hasLimit ? Math.min(cat.spent / cat.limit, 1.05) : 0;

  return (
    <View style={s.row}>
      <View style={s.header}>
        <View style={[s.dot, { backgroundColor: cat.color }]} />
        <Text style={s.icon}>{cat.icon}</Text>
        <Text style={s.name} numberOfLines={1}>{cat.name}</Text>
        <View style={s.amounts}>
          <Text style={[s.spent, over && { color: colors.danger }]}>{dollars(cat.spent)}</Text>
          {hasLimit && <Text style={s.limit}>/ {dollars(cat.limit)}</Text>}
          {over && <Text style={s.over}> OVER</Text>}
        </View>
      </View>
      {hasLimit && (
        <>
          <ProgressBar
            progress={progress}
            color={over ? colors.danger : cat.color}
            trackColor={colors.surfaceAlt}
            height={7}
          />
          <Text style={s.pctText}>{pct(cat.spent, cat.limit)}% of budget</Text>
        </>
      )}
    </View>
  );
}

// ─── TransactionRow ───────────────────────────────────────────────────────────

const createTxStyles = (c: Colors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2] + 2,
  },
  iconWrap: {
    width: 34, height: 34, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing[3],
  },
  icon:     { fontSize: 16 },
  info:     { flex: 1 },
  category: { fontSize: typography.sm, fontWeight: typography.medium, color: c.textPrimary },
  meta:     { fontSize: typography.xs, color: c.textMuted, marginTop: 2 },
  amount:   { fontSize: typography.sm, fontWeight: typography.semibold, color: c.textPrimary },
  divider:  { height: 1, backgroundColor: c.border },
});

function TxRow({
  tx,
  catColor,
  catIcon,
}: {
  tx: Transaction;
  catColor: string;
  catIcon: string;
}) {
  const { colors } = useTheme();
  const s          = useMemo(() => createTxStyles(colors), [colors]);

  return (
    <View style={s.row}>
      <View style={[s.iconWrap, { backgroundColor: catColor + '22' }]}>
        <Text style={s.icon}>{catIcon}</Text>
      </View>
      <View style={s.info}>
        <Text style={s.category}>{tx.categoryName}</Text>
        <Text style={s.meta}>
          {formatDate(tx.date)}{tx.note ? ` · ${tx.note}` : ''}
        </Text>
      </View>
      <Text style={s.amount}>{dollars(tx.amount)}</Text>
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionLabel({ title, colors }: { title: string; colors: Colors }) {
  return (
    <Text style={{
      fontSize: typography.xs,
      fontWeight: typography.semibold,
      color: colors.textMuted,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: spacing[3],
      marginTop: spacing[5],
    }}>
      {title}
    </Text>
  );
}

// ─── Screen styles ────────────────────────────────────────────────────────────

const createStyles = (c: Colors) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: c.background },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
    gap: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    backgroundColor: c.surface,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: c.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.border,
  },
  backText:    { fontSize: typography.lg, color: c.textPrimary, lineHeight: 22 },
  headerTitle: { fontSize: typography.xl, fontWeight: typography.bold, color: c.textPrimary },
  // Hero card
  heroCard: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing[5],
    marginTop: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[5],
    ...shadows.sm,
  },
  heroStats: { flex: 1, gap: spacing[3] },
  heroStatRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  heroLabel: { fontSize: typography.sm, color: c.textMuted },
  heroValue: { fontSize: typography.base, fontWeight: typography.bold, color: c.textPrimary },
  heroValueGreen: { color: c.accent },
  heroValueRed:   { color: c.danger },
  heroSavingsRate: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: c.textMuted,
    marginTop: spacing[1],
    textAlign: 'right',
  },
  // Stacked bar section
  stackedCard: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing[4],
    ...shadows.sm,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2] + 2,
    marginTop: spacing[3],
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] + 1 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: typography.xs, color: c.textSecondary },
  // Budget bars card
  barsCard: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing[4],
    ...shadows.sm,
  },
  // Debt card
  debtCard: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing[4],
    ...shadows.sm,
  },
  debtRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  debtName: { fontSize: typography.sm, color: c.textPrimary, fontWeight: typography.medium },
  debtAmt:  { fontSize: typography.sm, color: c.textMuted },
  debtPaid: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: c.accent,
    backgroundColor: c.accentLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing[2] + 2,
    paddingVertical: 3,
  },
  divider: { height: 1, backgroundColor: c.border },
  // Transaction list
  txCard: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: spacing[4],
    ...shadows.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function MonthDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route      = useRoute<DetailRoute>();
  const { month }  = route.params;

  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [record,    setRecord]    = useState<MonthlyRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadMonthlyRecord(month, user.id)
      .then(setRecord)
      .catch((err) => console.error('[MonthDetailScreen] load failed:', err))
      .finally(() => setIsLoading(false));
  }, [month, user]);

  // Build a lookup for cat meta (icon, color) by name
  const catMeta = useMemo(() => {
    if (!record) return {};
    return Object.fromEntries(
      record.summary.categoryBreakdown.map((c) => [c.name, c]),
    );
  }, [record]);

  // Sort transactions newest first
  const sortedTx = useMemo(
    () => record
      ? [...record.transactions].sort((a, b) => b.date.localeCompare(a.date))
      : [],
    [record],
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!record) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Report not found</Text>
        </View>
        <View style={styles.center}>
          <Text style={{ color: colors.textMuted }}>This report could not be loaded.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { income, debtTotal, summary } = record;
  const { totalSpent, totalBudgeted, savingsRate, categoryBreakdown } = summary;
  const saved        = income - totalSpent;
  const ringProgress = totalBudgeted > 0 ? Math.min(totalSpent / totalBudgeted, 1) : 0;
  const ringColor    = totalSpent > totalBudgeted ? colors.danger : colors.primary;

  // Total debt actually paid this month = transactions whose categoryName does
  // NOT appear in the spending categories list (i.e. they were debt payments
  // added via the "I Paid" button on the Dashboard).
  const categoryNames   = new Set(record.categories.map((c) => c.name));
  const totalDebtPaid   = record.transactions
    .filter((t) => !categoryNames.has(t.categoryName))
    .reduce((s, t) => s + t.amount, 0);
  const debtFullyPaid   = debtTotal > 0 && totalDebtPaid >= debtTotal;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.surface}
      />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        >
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{formatMonthLabel(month)}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >

        {/* ── 1. Hero summary card ── */}
        <SectionLabel title="Overview" colors={colors} />
        <View style={styles.heroCard}>
          {/* Donut ring */}
          <DonutRing
            progress={ringProgress}
            color={ringColor}
            trackColor={colors.surfaceAlt}
          >
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: typography['2xl'], fontWeight: typography.bold, color: ringColor }}>
                {Math.round(ringProgress * 100)}%
              </Text>
              <Text style={{ fontSize: typography.xs, color: colors.textMuted }}>used</Text>
            </View>
          </DonutRing>

          {/* Stats */}
          <View style={styles.heroStats}>
            <View style={styles.heroStatRow}>
              <Text style={styles.heroLabel}>Income</Text>
              <Text style={styles.heroValue}>{dollars(income)}</Text>
            </View>
            <View style={styles.heroStatRow}>
              <Text style={styles.heroLabel}>Budgeted</Text>
              <Text style={styles.heroValue}>{dollars(totalBudgeted)}</Text>
            </View>
            <View style={styles.heroStatRow}>
              <Text style={styles.heroLabel}>Spent</Text>
              <Text style={[styles.heroValue, totalSpent > totalBudgeted && styles.heroValueRed]}>
                {dollars(totalSpent)}
              </Text>
            </View>
            <View style={styles.heroStatRow}>
              <Text style={styles.heroLabel}>{saved >= 0 ? 'Saved' : 'Over'}</Text>
              <Text style={[styles.heroValue, saved >= 0 ? styles.heroValueGreen : styles.heroValueRed]}>
                {dollars(Math.abs(saved))}
              </Text>
            </View>
            <Text style={styles.heroSavingsRate}>
              {Math.round(savingsRate * 100)}% savings rate
            </Text>
          </View>
        </View>

        {/* ── 2. Category stacked bar ── */}
        <SectionLabel title="Where Your Money Went" colors={colors} />
        <View style={styles.stackedCard}>
          <StackedBar breakdown={categoryBreakdown} total={totalSpent} />

          {/* Legend */}
          <View style={styles.legendRow}>
            {categoryBreakdown
              .filter((c) => c.spent > 0)
              .sort((a, b) => b.spent - a.spent)
              .map((cat) => (
                <View key={cat.name} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: cat.color }]} />
                  <Text style={styles.legendText}>
                    {cat.icon} {cat.name}  {pct(cat.spent, totalSpent)}%
                  </Text>
                </View>
              ))
            }
          </View>
        </View>

        {/* ── 3. Budget vs Actual ── */}
        <SectionLabel title="Budget vs Actual" colors={colors} />
        <View style={styles.barsCard}>
          {categoryBreakdown
            .filter((c) => c.spent > 0 || c.limit > 0)
            .sort((a, b) => b.spent - a.spent)
            .map((cat) => (
              <CategoryBudgetRow key={cat.name} cat={cat} />
            ))
          }
        </View>

        {/* ── 4. Debt payments ── */}
        {debtTotal > 0 && (
          <>
            <SectionLabel title="Debt Obligations" colors={colors} />
            <View style={styles.debtCard}>

              {/* Total Committed */}
              <View style={styles.debtRow}>
                <Text style={styles.debtName}>Total Committed</Text>
                <Text style={styles.debtAmt}>{dollars(debtTotal)}/mo</Text>
              </View>

              <View style={styles.divider} />

              {/* Total Paid */}
              <View style={styles.debtRow}>
                <Text style={styles.debtName}>Total Paid</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                  {debtFullyPaid && (
                    <View style={styles.debtPaid}>
                      <Text style={{ fontSize: typography.xs, color: colors.accent, fontWeight: typography.semibold }}>
                        ✓ Fully Paid
                      </Text>
                    </View>
                  )}
                  <Text style={[
                    styles.debtAmt,
                    totalDebtPaid > 0 && { color: debtFullyPaid ? colors.accent : colors.textPrimary },
                  ]}>
                    {totalDebtPaid > 0 ? dollars(totalDebtPaid) : '—'}
                  </Text>
                </View>
              </View>

            </View>
          </>
        )}

        {/* ── 5. All transactions ── */}
        <SectionLabel title={`All Transactions (${sortedTx.length})`} colors={colors} />
        {sortedTx.length === 0 ? (
          <View style={{ paddingVertical: spacing[4], alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted, fontSize: typography.sm }}>
              No transactions recorded this month.
            </Text>
          </View>
        ) : (
          <View style={styles.txCard}>
            {sortedTx.map((tx, idx) => {
              const meta = catMeta[tx.categoryName];
              return (
                <View key={tx.id}>
                  <TxRow
                    tx={tx}
                    catColor={meta?.color ?? '#94A3B8'}
                    catIcon={meta?.icon ?? '📦'}
                  />
                  {idx < sortedTx.length - 1 && <View style={styles.divider} />}
                </View>
              );
            })}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
