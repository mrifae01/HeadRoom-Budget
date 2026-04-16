/**
 * DashboardScreen — analytics overview.
 *
 * Shows visual spending insights for the current month:
 *  • Key stats (total spent, remaining, top category)
 *  • Monthly spending trend — 3-month bar chart (uses bank data when connected)
 *  • AI Insights — locally computed smart tips
 *  • Spending by category (bank data when connected, else manually imported)
 *  • Recent expenses (bank data when connected, else manually imported)
 *
 * Budget management (add/edit/delete expenses) lives in BudgetScreen.
 */

import React, { useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { typography, spacing, radius, shadows } from '../theme';
import { Colors } from '../theme';
import { useTheme } from '../context/ThemeContext';
import Card from '../components/Card';
import { useBudget } from '../context/BudgetContext';
import { useBank } from '../context/BankContext';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { CategoryItem } from '../types/budget';
import { dollars, formatDate, isThisMonth } from '../utils/formatters';
import { txSpendAmount, isTxSpending, isTxIncome, isTxTransfer } from '../utils/teller';
import { resolveTxCategory, resolveDisplayCategory, OTHER_META } from '../utils/categoryMapper';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW         = new Date();
const MONTH_LABEL = NOW.toLocaleString(undefined, { month: 'long', year: 'numeric' });

const OTHER_CATEGORY: CategoryItem = {
  id: '__other__', name: 'Other/Misc', icon: '📦', color: '#94A3B8', amount: '0',
};

// ─── StatCard ─────────────────────────────────────────────────────────────────

const createStatStyles = (c: Colors) => StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: c.border,
    gap: spacing[1],
    ...shadows.sm,
  },
  label:     { fontSize: typography.xs, color: c.textMuted, fontWeight: typography.medium, textTransform: 'uppercase', letterSpacing: 0.4 },
  value:     { fontSize: typography.xl, fontWeight: typography.bold },
  sub:       { fontSize: typography.xs, color: c.textMuted, marginTop: 1 },
  badge:     { alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: spacing[2], paddingVertical: 2, marginTop: spacing[1] },
  badgeText: { fontSize: typography.xs, fontWeight: typography.semibold },
});

function StatCard({ label, value, valueColor, sub, badgeText, badgeColor, badgeBg }: {
  label: string; value: string; valueColor: string;
  sub?: string; badgeText?: string; badgeColor?: string; badgeBg?: string;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => createStatStyles(colors), [colors]);
  return (
    <View style={s.card}>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, { color: valueColor }]}>{value}</Text>
      {sub && <Text style={s.sub}>{sub}</Text>}
      {badgeText && badgeColor && badgeBg && (
        <View style={[s.badge, { backgroundColor: badgeBg }]}>
          <Text style={[s.badgeText, { color: badgeColor }]}>{badgeText}</Text>
        </View>
      )}
    </View>
  );
}

// ─── MonthlyBarChart ──────────────────────────────────────────────────────────

function MonthlyBarChart({ months, colors }: {
  months: Array<{ label: string; spent: number; income: number; isCurrent: boolean }>;
  colors: Colors;
}) {
  const maxVal = Math.max(...months.flatMap((m) => [m.spent, m.income]), 1);

  return (
    <View>
      {/* Grouped bars */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing[3], height: 90 }}>
        {months.map((month) => {
          const spentH  = Math.max(Math.round((month.spent  / maxVal) * 72), month.spent  > 0 ? 3 : 0);
          const incomeH = Math.max(Math.round((month.income / maxVal) * 72), month.income > 0 ? 3 : 0);
          return (
            <View key={month.label} style={{ flex: 1, alignItems: 'center', gap: spacing[1] }}>
              {/* Two bars side by side */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 72, width: '100%' }}>
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                  <View style={{ height: incomeH, backgroundColor: colors.accent, borderRadius: 3 }} />
                </View>
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                  <View style={{ height: spentH, backgroundColor: month.isCurrent ? colors.primary : colors.primaryLight, borderRadius: 3 }} />
                </View>
              </View>
              <Text style={{ fontSize: typography.xs, color: month.isCurrent ? colors.primary : colors.textMuted, fontWeight: month.isCurrent ? typography.bold : typography.regular }}>
                {month.label}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: spacing[4], marginTop: spacing[3], marginBottom: spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colors.accent }} />
          <Text style={{ fontSize: typography.xs, color: colors.textMuted }}>Income</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colors.primary }} />
          <Text style={{ fontSize: typography.xs, color: colors.textMuted }}>Spending</Text>
        </View>
      </View>

      {/* Per-month summary cards */}
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        {months.map((month) => {
          const hasData = month.income > 0 || month.spent > 0;
          const net     = month.income - month.spent;
          return (
            <View key={month.label} style={{ flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing[3], gap: 3 }}>
              <Text style={{ fontSize: typography.xs, color: month.isCurrent ? colors.primary : colors.textMuted, fontWeight: typography.semibold, marginBottom: 2 }}>
                {month.label}
              </Text>
              {month.income > 0 ? (
                <Text style={{ fontSize: typography.xs, color: colors.accent }}>↑ {dollars(month.income)}</Text>
              ) : (
                <Text style={{ fontSize: typography.xs, color: colors.textMuted }}>↑ —</Text>
              )}
              {month.spent > 0 ? (
                <Text style={{ fontSize: typography.xs, color: colors.danger }}>↓ {dollars(month.spent)}</Text>
              ) : (
                <Text style={{ fontSize: typography.xs, color: colors.textMuted }}>↓ —</Text>
              )}
              {hasData && (
                <View style={{ marginTop: 3, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Text style={{ fontSize: typography.xs, fontWeight: typography.bold, color: net >= 0 ? colors.accent : colors.danger }}>
                    {net >= 0 ? '+' : ''}{dollars(net)} net
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── InsightCard ──────────────────────────────────────────────────────────────

function InsightCard({ type, text, colors }: {
  type: 'good' | 'warn' | 'tip'; text: string; colors: Colors;
}) {
  const icon    = type === 'good' ? '✅' : type === 'warn' ? '⚠️' : '💡';
  const bg      = type === 'good' ? colors.accentLight : type === 'warn' ? colors.dangerLight : colors.primaryLight;
  const txtColor = type === 'good' ? colors.accentDark  : type === 'warn' ? colors.danger      : colors.primary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], backgroundColor: bg, borderRadius: radius.md, padding: spacing[3], marginBottom: spacing[2] }}>
      <Text style={{ fontSize: 13, marginTop: 1 }}>{icon}</Text>
      <Text style={{ flex: 1, fontSize: typography.sm, color: txtColor, lineHeight: typography.sm * 1.55 }}>
        {text}
      </Text>
    </View>
  );
}

// ─── CategoryBar ──────────────────────────────────────────────────────────────

const createBarStyles = (c: Colors) => StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] },
  iconWrap:{ width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  icon:    { fontSize: 13 },
  info:    { flex: 1 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  name:    { fontSize: typography.sm, fontWeight: typography.medium, color: c.textPrimary },
  amount:  { fontSize: typography.xs, fontWeight: typography.semibold, color: c.textSecondary },
  track:   { height: 6, borderRadius: radius.full, backgroundColor: c.surfaceAlt, overflow: 'hidden' as const },
  fill:    { height: '100%' as unknown as number, borderRadius: radius.full },
});

function CategoryBar({ icon, name, color, spent, maxSpent }: {
  icon: string; name: string; color: string; spent: number; maxSpent: number;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => createBarStyles(colors), [colors]);
  const pct = maxSpent > 0 ? (spent / maxSpent) * 100 : 0;
  return (
    <View style={s.row}>
      <View style={[s.iconWrap, { backgroundColor: color + '22' }]}>
        <Text style={s.icon}>{icon}</Text>
      </View>
      <View style={s.info}>
        <View style={s.nameRow}>
          <Text style={s.name} numberOfLines={1}>{name}</Text>
          <Text style={s.amount}>{dollars(spent)}</Text>
        </View>
        <View style={s.track}>
          <View style={[s.fill, { width: `${pct}%` as unknown as number, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

// ─── RecentTxRow ──────────────────────────────────────────────────────────────

const createTxStyles = (c: Colors) => StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[2], gap: spacing[3] },
  iconWrap:{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  icon:    { fontSize: 14 },
  info:    { flex: 1 },
  category:{ fontSize: typography.sm, fontWeight: typography.medium, color: c.textPrimary },
  sub:     { fontSize: typography.xs, color: c.textMuted, marginTop: 1 },
  amount:  { fontSize: typography.sm, fontWeight: typography.bold, color: c.textPrimary },
  divider: { height: 1, backgroundColor: c.border },
});

function RecentTxRow({ icon, color, category, sub, amount, isCredit }: {
  icon: string; color: string; category: string; sub: string; amount: number; isCredit?: boolean;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => createTxStyles(colors), [colors]);
  return (
    <View style={s.row}>
      <View style={[s.iconWrap, { backgroundColor: color + '22' }]}>
        <Text style={s.icon}>{icon}</Text>
      </View>
      <View style={s.info}>
        <Text style={s.category}>{category}</Text>
        <Text style={s.sub}>{sub}</Text>
      </View>
      <Text style={[s.amount, { color: isCredit ? colors.accent : colors.textPrimary }]}>
        {isCredit ? '+' : ''}{dollars(amount)}
      </Text>
    </View>
  );
}

// ─── Screen styles ────────────────────────────────────────────────────────────

const createStyles = (c: Colors) => StyleSheet.create({
  safe:    { flex: 1, backgroundColor: c.background },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: spacing[5], paddingTop: spacing[5], paddingBottom: spacing[8] },
  contentDesktop: { paddingHorizontal: spacing[8], paddingTop: spacing[6], paddingBottom: spacing[8] },

  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[5] },
  titleBlock: { gap: 2 },
  title:      { fontSize: typography['2xl'], fontWeight: typography.bold, color: c.textPrimary },
  month:      { fontSize: typography.xs, color: c.textMuted, fontWeight: typography.medium },

  statsRow:    { flexDirection: 'row', gap: spacing[3], marginBottom: spacing[5] },

  sectionTitle:  { fontSize: typography.base, fontWeight: typography.bold, color: c.textPrimary, marginBottom: spacing[3] },
  sectionSub:    { fontSize: typography.xs, color: c.textMuted, fontWeight: typography.medium },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing[3] },

  // Bank connected pill
  bankBadge:      { flexDirection: 'row', alignItems: 'center', gap: spacing[1], backgroundColor: c.accentLight, paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderRadius: radius.full },
  bankDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent },
  bankBadgeText:  { fontSize: typography.xs, color: c.accentDark, fontWeight: typography.semibold },

  card:    { marginBottom: spacing[4] },
  divider: { height: 1, backgroundColor: c.border },

  emptyWrap: { paddingVertical: spacing[6], alignItems: 'center', gap: spacing[2] },
  emptyIcon: { fontSize: 32 },
  emptyText: { fontSize: typography.sm, color: c.textMuted, textAlign: 'center' },

  columns: { flexDirection: 'row', gap: spacing[5], alignItems: 'flex-start' },
  leftCol: { flex: 3 },
  rightCol:{ flex: 2 },
});

// ─── DashboardScreen ──────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { budget }            = useBudget();
  const {
    isConnected: bankIsConnected,
    transactions: bankTx,
    institutionName,
    categoryOverrides,
  } = useBank();
  const isDesktop             = useIsDesktop();
  const { colors, isDark }    = useTheme();
  const styles                = useMemo(() => createStyles(colors), [colors]);
  const txStyles              = useMemo(() => createTxStyles(colors), [colors]);

  // Build debtId → name lookup so resolveDisplayCategory can display debt names
  const debtNames = useMemo<Record<string, string>>(
    () => Object.fromEntries(budget.debts.map((d) => [d.id, d.name])),
    [budget.debts],
  );

  // ── Budget-derived data (manually imported transactions) ───────────────────

  const thisMonthTx = useMemo(
    () => budget.transactions.filter((t) => isThisMonth(t.date)),
    [budget.transactions],
  );

  const totalIncome = useMemo(
    () => budget.incomeSources.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0),
    [budget.incomeSources],
  );
  const totalDebt = useMemo(
    () => budget.debts.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0),
    [budget.debts],
  );
  const spendableBudget = Math.max(totalIncome - totalDebt, 0);

  const debtNamesSet = useMemo(() => new Set(budget.debts.map((d) => d.name)), [budget.debts]);

  const categoryTx = useMemo(
    () => thisMonthTx.filter((tx) => !debtNamesSet.has(tx.categoryName)),
    [thisMonthTx, debtNamesSet],
  );

  const totalSpent = useMemo(() => categoryTx.reduce((s, tx) => s + tx.amount, 0), [categoryTx]);
  const remaining  = Math.max(spendableBudget - totalSpent, 0);
  const pctUsed    = spendableBudget > 0 ? Math.round((totalSpent / spendableBudget) * 100) : 0;

  const allCategories = useMemo(() => {
    const has = budget.categories.some((c) => c.name === OTHER_CATEGORY.name);
    return has ? budget.categories : [...budget.categories, OTHER_CATEGORY];
  }, [budget.categories]);

  // Manually-imported category spend (for insights computation)
  const categorySpend = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of categoryTx) map[tx.categoryName] = (map[tx.categoryName] ?? 0) + tx.amount;
    return Object.entries(map).map(([name, amount]) => {
      const cat = allCategories.find((c) => c.name === name) ?? { icon: '📦', color: '#94A3B8' };
      return { name, amount, icon: cat.icon, color: cat.color };
    }).sort((a, b) => b.amount - a.amount);
  }, [categoryTx, allCategories]);

  // ── Bank-derived data ──────────────────────────────────────────────────────

  // Group bank spending transactions by Teller category (credit-card aware)
  const bankCategorySpend = useMemo(() => {
    if (!bankIsConnected || bankTx.length === 0) return [];
    const map: Record<string, { total: number; meta: ReturnType<typeof resolveTxCategory> }> = {};
    for (const tx of bankTx) {
      if (isTxTransfer(tx)) continue;                          // skip internal transfers
      const overriddenMeta = resolveDisplayCategory(tx, categoryOverrides, debtNames);
      if (overriddenMeta.key === 'transfer') continue;         // user manually marked as transfer
      const spend = txSpendAmount(tx);
      if (spend === 0) continue;
      const key = overriddenMeta.key;
      if (!map[key]) map[key] = { total: 0, meta: overriddenMeta };
      map[key].total += spend;
    }
    return Object.entries(map)
      .map(([, { total, meta }]) => ({ ...meta, amount: total }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [bankIsConnected, bankTx, categoryOverrides]);

  // Last 5 bank transactions (spending + income, excluding internal transfers, sorted newest-first)
  const recentBankTx = useMemo(() => {
    if (!bankIsConnected) return [];
    return [...bankTx]
      .filter((tx) => {
        if (isTxTransfer(tx)) return false;
        const meta = resolveDisplayCategory(tx, categoryOverrides, debtNames);
        return meta.key !== 'transfer';
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [bankIsConnected, bankTx, categoryOverrides]);

  // ── Monthly trend: spent + income for last 3 months ──────────────────────

  const monthlyTrend = useMemo(() => {
    return Array.from({ length: 3 }, (_, i) => {
      const d     = new Date(NOW.getFullYear(), NOW.getMonth() - (2 - i), 1);
      const year  = d.getFullYear();
      const month = d.getMonth();
      const label = d.toLocaleString(undefined, { month: 'short' });

      let spent  = 0;
      let income = 0;

      if (bankIsConnected && bankTx.length > 0) {
        for (const tx of bankTx) {
          const txd = new Date(tx.date);
          if (txd.getFullYear() !== year || txd.getMonth() !== month) continue;
          // Skip internal transfers — they don't affect real money in/out
          if (isTxTransfer(tx)) continue;
          const overrideMeta = resolveDisplayCategory(tx, categoryOverrides, debtNames);
          if (overrideMeta.key === 'transfer') continue;
          const spend = txSpendAmount(tx);
          if (spend > 0) {
            spent += spend;
          } else if (isTxIncome(tx)) {
            income += Math.abs(parseFloat(tx.amount));
          }
        }
      } else {
        // No bank: use manually logged transactions for spending, income sources for income
        for (const tx of budget.transactions) {
          const txd = new Date(tx.date);
          if (txd.getFullYear() === year && txd.getMonth() === month) spent += tx.amount;
        }
        income = totalIncome; // monthly income from setup (same each month)
      }

      return { label, spent, income, isCurrent: i === 2 };
    });
  }, [bankIsConnected, bankTx, categoryOverrides, budget.transactions, totalIncome]);

  const hasTrendData = monthlyTrend.some((m) => m.spent > 0 || m.income > 0);

  // ── AI Insights (locally computed) ────────────────────────────────────────

  const insights = useMemo(() => {
    const items: Array<{ type: 'good' | 'warn' | 'tip'; text: string }> = [];

    // Category vs budget-limit performance
    for (const cat of budget.categories) {
      const budgeted = parseFloat(cat.amount) || 0;
      if (budgeted <= 0) continue;
      const spent = categorySpend.find((c) => c.name === cat.name)?.amount ?? 0;
      if (spent < 1) continue;
      const pct = spent / budgeted;
      if (pct > 1.15) {
        items.push({ type: 'warn', text: `${cat.icon} ${cat.name} is ${Math.round((pct - 1) * 100)}% over your monthly budget` });
      } else if (pct < 0.5 && spent > 5) {
        items.push({ type: 'good', text: `${cat.icon} ${cat.name} — on track, ${Math.round((1 - pct) * 100)}% of budget still available` });
      }
    }

    // Overall budget health
    if (spendableBudget > 0 && totalSpent > 0) {
      const leftPct = Math.round(((spendableBudget - totalSpent) / spendableBudget) * 100);
      if (leftPct > 30) {
        items.push({ type: 'good', text: `You've used ${100 - leftPct}% of your spendable budget — on track for a surplus` });
      } else if (leftPct < -5) {
        items.push({ type: 'warn', text: `Over budget by ${Math.abs(leftPct)}% — consider trimming discretionary spending` });
      }
    }

    // Month-over-month trend
    if (hasTrendData && monthlyTrend.length >= 2) {
      const prev = monthlyTrend[monthlyTrend.length - 2].spent;
      const curr = monthlyTrend[monthlyTrend.length - 1].spent;
      if (prev > 0 && curr > 0) {
        const changePct = Math.round(((curr - prev) / prev) * 100);
        if (changePct > 20) {
          items.push({ type: 'warn', text: `Spending is up ${changePct}% vs last month` });
        } else if (changePct < -15) {
          items.push({ type: 'good', text: `Spending is down ${Math.abs(changePct)}% vs last month — great improvement` });
        }
      }
    }

    // Bank top category tip
    if (bankIsConnected && bankCategorySpend.length > 0) {
      const top = bankCategorySpend[0];
      items.push({ type: 'tip', text: `${top.icon} Biggest bank spend category: ${top.name} at ${dollars(top.amount)} this period` });
    }

    if (items.length === 0) {
      if (!bankIsConnected && budget.transactions.length === 0) {
        items.push({ type: 'tip', text: 'Connect your bank or log expenses to see personalized spending insights' });
      } else {
        items.push({ type: 'good', text: 'Budget looks healthy — keep it up!' });
      }
    }

    return items.slice(0, 4);
  }, [budget.categories, categorySpend, spendableBudget, totalSpent, hasTrendData, monthlyTrend, bankIsConnected, bankCategorySpend, budget.transactions]);

  // ── Derived for display ────────────────────────────────────────────────────

  // Which category data to display (bank when connected, manual otherwise)
  const displayCategories = bankIsConnected && bankCategorySpend.length > 0
    ? bankCategorySpend
    : categorySpend;
  const maxDisplaySpend = displayCategories[0]?.amount ?? 0;
  const topCategory     = displayCategories[0];

  // Which recent transactions to display
  const displayRecentTx = bankIsConnected && recentBankTx.length > 0
    ? recentBankTx
    : [...thisMonthTx].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  // ── Sections ───────────────────────────────────────────────────────────────

  const statsRow = (
    <View style={styles.statsRow}>
      <StatCard
        label="Spent"
        value={dollars(totalSpent)}
        valueColor={colors.danger}
        sub={`${pctUsed}% of budget`}
      />
      <StatCard
        label="Remaining"
        value={dollars(remaining)}
        valueColor={colors.accent}
        sub={`of ${dollars(spendableBudget)}`}
      />
      {topCategory ? (
        <StatCard
          label="Top Category"
          value={topCategory.icon + ' ' + topCategory.name}
          valueColor={colors.textPrimary}
          sub={dollars(topCategory.amount)}
          badgeText="Most spent"
          badgeColor={colors.warning}
          badgeBg={colors.warningLight}
        />
      ) : (
        <StatCard label="Top Category" value="—" valueColor={colors.textMuted} sub="No expenses yet" />
      )}
    </View>
  );

  const trendSection = hasTrendData ? (
    <Card style={styles.card}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Monthly Spending</Text>
        {bankIsConnected && (
          <View style={styles.bankBadge}>
            <View style={styles.bankDot} />
            <Text style={styles.bankBadgeText}>{institutionName ?? 'Bank'}</Text>
          </View>
        )}
      </View>
      <MonthlyBarChart months={monthlyTrend} colors={colors} />
    </Card>
  ) : null;

  const insightsSection = (
    <Card style={styles.card}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>AI Insights</Text>
        <Text style={styles.sectionSub}>✦ Smart tips</Text>
      </View>
      {insights.map((item, i) => (
        <InsightCard key={i} type={item.type} text={item.text} colors={colors} />
      ))}
    </Card>
  );

  const categoryBreakdownSection = (
    <Card style={styles.card}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Spending by Category</Text>
        <Text style={styles.sectionSub}>
          {bankIsConnected && bankCategorySpend.length > 0 ? 'From bank' : MONTH_LABEL}
        </Text>
      </View>
      {displayCategories.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyText}>
            {bankIsConnected ? 'No transactions yet from your bank.' : 'No spending data yet this month.'}
          </Text>
        </View>
      ) : (
        displayCategories.map((item, idx) => (
          <View key={item.name}>
            <CategoryBar
              icon={item.icon}
              name={item.name}
              color={item.color}
              spent={item.amount}
              maxSpent={maxDisplaySpend}
            />
            {idx < displayCategories.length - 1 && <View style={styles.divider} />}
          </View>
        ))
      )}
    </Card>
  );

  const recentSection = (
    <Card style={styles.card}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Expenses</Text>
        {displayRecentTx.length > 0 && (
          <Text style={styles.sectionSub}>
            {bankIsConnected && recentBankTx.length > 0 ? 'From bank' : `Last ${displayRecentTx.length}`}
          </Text>
        )}
      </View>
      {displayRecentTx.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>🧾</Text>
          <Text style={styles.emptyText}>
            {bankIsConnected ? 'No bank transactions found.' : 'No expenses logged yet this month.'}
          </Text>
        </View>
      ) : bankIsConnected && recentBankTx.length > 0 ? (
        // Bank transactions
        recentBankTx.map((tx, idx) => {
          const spend    = txSpendAmount(tx);
          const isCredit = isTxIncome(tx);
          const amount   = isCredit ? Math.abs(parseFloat(tx.amount)) : spend;
          const info     = resolveDisplayCategory(tx, categoryOverrides, debtNames);
          const name     = tx.details?.counterparty?.name ?? tx.description ?? '—';
          return (
            <View key={tx.id}>
              <RecentTxRow
                icon={info.icon}
                color={info.color}
                category={name}
                sub={`${tx.date}  ·  ${tx.accountName}`}
                amount={amount}
                isCredit={isCredit}
              />
              {idx < recentBankTx.length - 1 && <View style={txStyles.divider} />}
            </View>
          );
        })
      ) : (
        // Budget (manually imported) transactions
        (displayRecentTx as typeof thisMonthTx).map((tx, idx) => {
          const cat = allCategories.find((c) => c.name === (tx as any).categoryName) ?? { icon: '📦', color: '#94A3B8' };
          return (
            <View key={(tx as any).id}>
              <RecentTxRow
                icon={cat.icon}
                color={cat.color}
                category={(tx as any).categoryName}
                sub={formatDate((tx as any).date)}
                amount={(tx as any).amount}
              />
              {idx < displayRecentTx.length - 1 && <View style={txStyles.divider} />}
            </View>
          );
        })
      )}
    </Card>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={isDesktop ? styles.contentDesktop : styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Dashboard</Text>
            <Text style={styles.month}>{MONTH_LABEL}</Text>
          </View>
          {bankIsConnected && (
            <View style={styles.bankBadge}>
              <View style={styles.bankDot} />
              <Text style={styles.bankBadgeText}>{institutionName ?? 'Bank connected'}</Text>
            </View>
          )}
        </View>

        {statsRow}

        {isDesktop ? (
          <>
            {/* Full-width: trend + insights */}
            {trendSection}
            {insightsSection}
            {/* Two columns: categories + recent */}
            <View style={styles.columns}>
              <View style={styles.leftCol}>{categoryBreakdownSection}</View>
              <View style={styles.rightCol}>{recentSection}</View>
            </View>
          </>
        ) : (
          <>
            {trendSection}
            {insightsSection}
            {categoryBreakdownSection}
            {recentSection}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
