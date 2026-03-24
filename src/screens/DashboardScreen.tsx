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

import React, { useState, useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { colors, typography, spacing, radius, shadows } from '../theme';
import Card from '../components/Card';
import ProgressBar from '../components/ProgressBar';
import AddExpenseModal from '../components/AddExpenseModal';
import { useBudget } from '../context/BudgetContext';
import { CategoryItem, Transaction } from '../types/budget';

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

function TransactionRow({ transaction, categories, onEdit, onDelete }: TransactionRowProps) {
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
            style={txStyles.actionBtn}
            onPress={onDelete}
            accessibilityLabel="Delete expense"
          >
            <Text style={txStyles.deleteIcon}>🗑️</Text>
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
  onLogExpense: () => void;
}

function HeroCard({ totalIncome, totalSpent, onLogExpense }: HeroCardProps) {
  const remaining  = Math.max(totalIncome - totalSpent, 0);
  const overBudget = totalSpent > totalIncome;
  const progress   = totalIncome > 0 ? Math.min(totalSpent / totalIncome, 1) : 0;
  const pctUsed    = totalIncome > 0 ? Math.round((totalSpent / totalIncome) * 100) : 0;

  return (
    <View style={[heroStyles.card, shadows.lg]}>
      {/* Decorative blobs */}
      <View style={heroStyles.blobTop} />
      <View style={heroStyles.blobBottom} />

      <Text style={heroStyles.label}>Remaining This Month</Text>
      <Text style={heroStyles.amount}>
        {overBudget ? `−${dollars(totalSpent - totalIncome)}` : dollars(remaining)}
      </Text>
      <Text style={heroStyles.sub}>
        {dollars(totalSpent)} spent of {dollars(totalIncome)} income
      </Text>

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
  return (
    <View style={[metricStyles.card, { backgroundColor: bg }]}>
      <View style={[metricStyles.dot, { backgroundColor: accent }]} />
      <Text style={[metricStyles.value, { color: accent }]}>{value}</Text>
      <Text style={metricStyles.label}>{label}</Text>
    </View>
  );
}

// ─── CategoryRow ──────────────────────────────────────────────────────────────

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
            <Text style={catStyles.noLimit}> · no limit</Text>
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

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyCategories() {
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

// ─── DashboardScreen ─────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { budget, deleteTransaction } = useBudget();

  // Modal state — null = add mode, Transaction = edit mode
  const [modalOpen,          setModalOpen]          = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

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

  /** Transactions that fall in the current calendar month */
  const thisMonth = useMemo(
    () => budget.transactions.filter((t) => isThisMonth(t.date)),
    [budget.transactions],
  );

  /** Total income this month (sum of all income source amounts) */
  const totalIncome = useMemo(
    () => budget.incomeSources.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0),
    [budget.incomeSources],
  );

  /** Total actually spent this month (sum of this month's transactions) */
  const totalSpent = useMemo(
    () => thisMonth.reduce((sum, t) => sum + t.amount, 0),
    [thisMonth],
  );

  /** Total monthly debt payments from setup */
  const totalDebt = useMemo(
    () => budget.debts.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0),
    [budget.debts],
  );

  /**
   * Map of categoryName → amount spent this month.
   * Built once from thisMonth transactions.
   */
  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of thisMonth) {
      map[tx.categoryName] = (map[tx.categoryName] ?? 0) + tx.amount;
    }
    return map;
  }, [thisMonth]);

  /** Transactions sorted newest-first for the Recent Expenses list */
  const thisMonthSorted = useMemo(
    () => [...thisMonth].sort((a, b) => b.date.localeCompare(a.date)),
    [thisMonth],
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

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

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

        {/* Hero — Log Expense button lives inside here */}
        <HeroCard
          totalIncome={totalIncome}
          totalSpent={totalSpent}
          onLogExpense={openAdd}
        />

        {/* Metrics */}
        <View style={styles.metricRow}>
          <MetricCard
            label="Spent"
            value={dollars(totalSpent)}
            accent={colors.danger}
            bg={colors.dangerLight}
          />
          <MetricCard
            label="Remaining"
            value={dollars(Math.max(totalIncome - totalSpent, 0))}
            accent={colors.accent}
            bg={colors.accentLight}
          />
          <MetricCard
            label="Debt"
            value={dollars(totalDebt)}
            accent={colors.primary}
            bg={colors.primaryLight}
          />
        </View>

        {/* Category breakdown — always includes Other/Misc at the bottom */}
        <Card style={styles.breakdownCard}>
          <View style={styles.breakdownHeader}>
            <Text style={styles.breakdownTitle}>Category Breakdown</Text>
            <Text style={styles.breakdownSub}>{MONTH_LABEL}</Text>
          </View>

          {displayCategories.map((cat, idx) => (
            <View key={cat.id}>
              <CategoryRow
                icon={cat.icon}
                name={cat.name}
                color={cat.color}
                spent={spentByCategory[cat.name] ?? 0}
                budget={parseFloat(cat.amount) || 0}
              />
              {idx < displayCategories.length - 1 && (
                <View style={styles.divider} />
              )}
            </View>
          ))}
        </Card>

        {/* ── Recent Expenses ── */}
        <Card style={styles.recentCard}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>Recent Expenses</Text>
            {thisMonthSorted.length > 0 && (
              <Text style={styles.recentCount}>
                {thisMonthSorted.length} {thisMonthSorted.length === 1 ? 'entry' : 'entries'}
              </Text>
            )}
          </View>

          {thisMonthSorted.length === 0 ? (
            <View style={styles.recentEmpty}>
              <Text style={styles.recentEmptyText}>
                No expenses logged yet. Tap "Log Expense" above to get started.
              </Text>
            </View>
          ) : (
            thisMonthSorted.map((tx, idx) => (
              <View key={tx.id}>
                <TransactionRow
                  transaction={tx}
                  categories={displayCategories}
                  onEdit={() => openEdit(tx)}
                  onDelete={() => handleDelete(tx)}
                />
                {idx < thisMonthSorted.length - 1 && (
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
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
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
    color: colors.textPrimary,
  },
  month: {
    fontSize: typography.sm,
    color: colors.textMuted,
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
    color: colors.textPrimary,
  },
  breakdownSub: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: typography.medium,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
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
    color: colors.textPrimary,
  },
  recentCount: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: typography.medium,
  },
  recentEmpty: {
    paddingVertical: spacing[5],
    alignItems: 'center',
  },
  recentEmptyText: {
    fontSize: typography.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: typography.sm * 1.6,
  },
});

const heroStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary,
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
    color: colors.textInverse,
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
    backgroundColor: colors.textInverse,
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    alignItems: 'center',
    marginTop: spacing[4],
  },
  logBtnText: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: colors.primary,
    letterSpacing: 0.3,
  },
});

const metricStyles = StyleSheet.create({
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
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: typography.medium,
  },
});

const catStyles = StyleSheet.create({
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
    color: colors.textPrimary,
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
    color: colors.textPrimary,
  },
  spentOver: {
    color: colors.danger,
  },
  budget: {
    fontSize: typography.xs,
    color: colors.textMuted,
  },
  overTag: {
    fontSize: typography.xs,
    color: colors.danger,
    fontWeight: typography.bold,
  },
  pct: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'right',
  },
  // Shown instead of "/ $0" when a category has no budget limit
  noLimit: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});

const emptyStyles = StyleSheet.create({
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
    color: colors.textPrimary,
  },
  body: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.sm * typography.relaxed,
  },
});

const txStyles = StyleSheet.create({
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
    color: colors.textPrimary,
  },
  meta: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  right: {
    alignItems: 'flex-end',
    gap: spacing[1],
  },
  amount: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[1],
  },
  actionBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBubble: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  editBubbleText: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.primary,
  },
  deleteIcon: {
    fontSize: 14,
  },
});
