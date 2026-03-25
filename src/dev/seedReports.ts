/**
 * seedReports.ts — development utility to populate realistic monthly archive data.
 *
 * Generates 4 months (Nov 2025 – Feb 2026) of varied budget records so the
 * MonthDetailScreen and ReportsScreen can be visually tested without waiting
 * for real months to roll over.
 *
 * Call `seedSampleReports()` once from the UI; it's idempotent — already-
 * existing months are left untouched.
 */

import { MonthlyRecord, Transaction } from '../types/budget';
import { saveMonthlyRecord, loadMonthlyRecord } from '../storage/reports';

// ─── Shared budget snapshot (matches the app's DEFAULT_BUDGET) ────────────────

const INCOME      = 4200;
const DEBT_TOTAL  = 770; // Student Loan $320 + Car Payment $450

const CATEGORIES = [
  { name: 'Rent/Mortgage', icon: '🏠', color: '#6366F1', budgetLimit: 1400 },
  { name: 'Groceries',     icon: '🛒', color: '#10B981', budgetLimit: 350  },
  { name: 'Utilities',     icon: '💡', color: '#F59E0B', budgetLimit: 120  },
  { name: 'Dining Out',    icon: '🍽️', color: '#F97316', budgetLimit: 150  },
  { name: 'Entertainment', icon: '🎬', color: '#8B5CF6', budgetLimit: 80   },
];

const TOTAL_BUDGETED = CATEGORIES.reduce((s, c) => s + c.budgetLimit, 0); // $2,100

// ─── Helper ───────────────────────────────────────────────────────────────────

let _seed = 1;
function sid(): string {
  return `seed-${(_seed++).toString(36).padStart(4, '0')}`;
}

function tx(
  date: string,
  categoryName: string,
  amount: number,
  note?: string,
): Transaction {
  return { id: sid(), date, categoryName, amount, note };
}

function buildRecord(
  month: string,
  transactions: Transaction[],
): MonthlyRecord {
  // Compute per-category spend
  const spentMap: Record<string, number> = {};
  for (const t of transactions) {
    spentMap[t.categoryName] = (spentMap[t.categoryName] ?? 0) + t.amount;
  }

  const categoryBreakdown = CATEGORIES.map((c) => ({
    name:  c.name,
    icon:  c.icon,
    color: c.color,
    spent: spentMap[c.name] ?? 0,
    limit: c.budgetLimit,
  }));

  // Other/Misc — anything that doesn't match a known category
  const knownNames = new Set(CATEGORIES.map((c) => c.name));
  const otherSpent = transactions
    .filter((t) => !knownNames.has(t.categoryName))
    .reduce((s, t) => s + t.amount, 0);
  if (otherSpent > 0) {
    categoryBreakdown.push({
      name: 'Other/Misc', icon: '📦', color: '#94A3B8',
      spent: otherSpent, limit: 0,
    });
  }

  const totalSpent = transactions.reduce((s, t) => s + t.amount, 0);

  return {
    month,
    income:     INCOME,
    debtTotal:  DEBT_TOTAL,
    categories: CATEGORIES,
    transactions,
    summary: {
      totalSpent,
      totalBudgeted: TOTAL_BUDGETED,
      savingsRate: INCOME > 0
        ? Math.max(0, Math.min(1, (INCOME - totalSpent) / INCOME))
        : 0,
      categoryBreakdown,
    },
  };
}

// ─── Monthly transaction sets ─────────────────────────────────────────────────

/**
 * November 2025 — steady autumn month, slightly under budget across the board.
 * Debt: both paid in full.  Category total: $2,078
 */
const NOV_2025: Transaction[] = [
  // Debt payments (not in CATEGORIES → counted as "Total Paid")
  tx('2025-11-02', 'Student Loan',  320, 'Auto-payment'),
  tx('2025-11-02', 'Car Payment',   450, 'Auto-payment'),
  // Spending categories
  tx('2025-11-01', 'Rent/Mortgage', 1400),
  tx('2025-11-03', 'Groceries',       82, 'Weekly shop'),
  tx('2025-11-07', 'Utilities',      104),
  tx('2025-11-09', 'Dining Out',      38, 'Lunch'),
  tx('2025-11-12', 'Groceries',       91, 'Weekly shop'),
  tx('2025-11-14', 'Entertainment',   45, 'Cinema'),
  tx('2025-11-17', 'Dining Out',      52, 'Dinner'),
  tx('2025-11-19', 'Groceries',       74, 'Weekly shop'),
  tx('2025-11-22', 'Entertainment',   28, 'Streaming'),
  tx('2025-11-24', 'Dining Out',      32, 'Brunch'),
  tx('2025-11-26', 'Groceries',       68, 'Weekly shop'),
  tx('2025-11-29', 'Dining Out',      44, 'Thanksgiving dinner'),
  tx('2025-11-30', 'Groceries',       20, 'Top-up'),
];

/**
 * December 2025 — holiday month. Entertainment and Dining blow the budget.
 * Debt: both paid in full.  Category total: $2,535
 */
const DEC_2025: Transaction[] = [
  // Debt payments
  tx('2025-12-02', 'Student Loan',  320, 'Auto-payment'),
  tx('2025-12-02', 'Car Payment',   450, 'Auto-payment'),
  // Spending categories
  tx('2025-12-01', 'Rent/Mortgage', 1400),
  tx('2025-12-03', 'Groceries',       78, 'Weekly shop'),
  tx('2025-12-06', 'Utilities',      142, 'Higher heating bill'),
  tx('2025-12-07', 'Dining Out',      65, 'Holiday dinner out'),
  tx('2025-12-10', 'Entertainment',   55, 'Concert tickets'),
  tx('2025-12-12', 'Groceries',      105, 'Holiday food'),
  tx('2025-12-14', 'Dining Out',      88, 'Company party'),
  tx('2025-12-17', 'Entertainment',   95, 'Family activities'),
  tx('2025-12-19', 'Groceries',       92, 'Christmas groceries'),
  tx('2025-12-21', 'Dining Out',      72, 'Family dinner'),
  tx('2025-12-23', 'Entertainment',   78, 'Holiday events'),
  tx('2025-12-24', 'Groceries',      115, 'Christmas eve shop'),
  tx('2025-12-26', 'Dining Out',      58, 'Boxing Day'),
  tx('2025-12-28', 'Entertainment',   42, 'New Year plans'),
  tx('2025-12-30', 'Groceries',       50, 'NYE supplies'),
];

/**
 * January 2026 — New Year reset. Frugal month.
 * Debt: both paid in full.  Category total: $1,863
 */
const JAN_2026: Transaction[] = [
  // Debt payments
  tx('2026-01-02', 'Student Loan',  320, 'Auto-payment'),
  tx('2026-01-02', 'Car Payment',   450, 'Auto-payment'),
  // Spending categories
  tx('2026-01-01', 'Rent/Mortgage', 1400),
  tx('2026-01-05', 'Groceries',       68, 'First shop of the year'),
  tx('2026-01-08', 'Utilities',       88, 'Mild weather'),
  tx('2026-01-11', 'Groceries',       72, 'Weekly shop'),
  tx('2026-01-15', 'Dining Out',       28, 'Lunch'),
  tx('2026-01-18', 'Groceries',       65, 'Weekly shop'),
  tx('2026-01-20', 'Entertainment',   22, 'Streaming'),
  tx('2026-01-23', 'Dining Out',       32, 'Takeaway'),
  tx('2026-01-26', 'Groceries',       58, 'Weekly shop'),
  tx('2026-01-29', 'Entertainment',   18, 'Rental movie'),
  tx('2026-01-31', 'Groceries',       12, 'Top-up'),
];

/**
 * February 2026 — Valentine's bump. Dining over budget.
 * Debt: only Student Loan paid (Car Payment missed this month).
 * Category total: $2,248
 */
const FEB_2026: Transaction[] = [
  // Debt payments — only Student Loan paid; Car Payment missed
  tx('2026-02-02', 'Student Loan',  320, 'Auto-payment'),
  // Spending categories
  tx('2026-02-01', 'Rent/Mortgage', 1400),
  tx('2026-02-03', 'Groceries',       88, 'Weekly shop'),
  tx('2026-02-05', 'Utilities',      108, 'Monthly bill'),
  tx('2026-02-07', 'Dining Out',       48, 'Dinner'),
  tx('2026-02-09', 'Entertainment',   35, 'Cinema'),
  tx('2026-02-12', 'Groceries',       95, 'Weekly shop'),
  tx('2026-02-14', 'Dining Out',      145, "Valentine's dinner"),
  tx('2026-02-16', 'Entertainment',   62, 'Event tickets'),
  tx('2026-02-18', 'Groceries',       78),
  tx('2026-02-21', 'Dining Out',       52, 'Brunch'),
  tx('2026-02-24', 'Groceries',       68, 'Weekly shop'),
  tx('2026-02-25', 'Entertainment',   45, 'Streaming + rental'),
  tx('2026-02-27', 'Dining Out',       24, 'Quick lunch'),
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Inserts sample monthly records into AsyncStorage.
 * Already-existing months are skipped (idempotent).
 * Returns the number of months actually written.
 */
export async function seedSampleReports(): Promise<number> {
  const months: [string, Transaction[]][] = [
    ['2025-11', NOV_2025],
    ['2025-12', DEC_2025],
    ['2026-01', JAN_2026],
    ['2026-02', FEB_2026],
  ];

  let written = 0;
  for (const [month, transactions] of months) {
    const existing = await loadMonthlyRecord(month);
    if (existing) continue; // already seeded — leave it alone
    const record = buildRecord(month, transactions);
    await saveMonthlyRecord(record);
    written++;
  }
  return written;
}

/** Remove all seeded records (useful for resetting during development). */
export async function clearSampleReports(): Promise<void> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  const months = ['2025-11', '2025-12', '2026-01', '2026-02'];
  await Promise.all(
    months.map((m) => AsyncStorage.removeItem(`@headroom/month_${m}`)),
  );
  // Rebuild index without these months
  const { getMonthsIndex } = await import('../storage/reports');
  const index = await getMonthsIndex();
  const filtered = index.filter((m) => !months.includes(m));
  await AsyncStorage.setItem('@headroom/months_index', JSON.stringify(filtered));
}
