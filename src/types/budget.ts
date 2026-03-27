/**
 * budget.ts — shared data types for the Headroom budget model.
 *
 * These are the single source of truth for the shape of user data.
 * Imported by: SetupScreen, BudgetContext, storage helpers, and
 * eventually the Dashboard and AI Advisor screens.
 */

// ─── Income ───────────────────────────────────────────────────────────────────

/** Whether the source is regular income or a savings draw. */
export type IncomeType = 'income' | 'no_income';

export interface IncomeSource {
  id: string;
  name: string;
  type: IncomeType;
  /** Income: monthly take-home. No-Income: monthly draw amount. */
  amount: string;
}

// ─── Debts ────────────────────────────────────────────────────────────────────

export interface DebtItem {
  id: string;
  name: string;
  /** Monthly minimum payment */
  amount: string;
  /**
   * Optional original total balance when the debt was added.
   * Used alongside currentBalance to show payoff progress.
   */
  totalAmount?: string;
  /**
   * Optional current outstanding balance.
   * When provided alongside totalAmount, the dashboard shows a progress bar.
   * Used instead of totalAmount for payoff timeline calculations.
   */
  currentBalance?: string;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export interface CategoryItem {
  id: string;
  /** Matches a PresetCategory name — used to look up icon and color */
  name: string;
  /** Monthly spending limit */
  amount: string;
  /** Emoji icon from the preset list — stored so it renders without a lookup */
  icon: string;
  /** Hex color for dashboard charts and progress bars */
  color: string;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  /** Links to a CategoryItem.name in the user's budget */
  categoryName: string;
  /** Positive dollar amount spent */
  amount: number;
  /** ISO date string: "YYYY-MM-DD" */
  date: string;
  /** Optional memo — used later by the AI Advisor for context */
  note?: string;
}

// ─── Savings goals ────────────────────────────────────────────────────────────

/**
 * A savings goal or "saving for" target.
 * - 'goal'  → structured with a target amount (e.g. Emergency Fund)
 * - 'want'  → discretionary, user decides how much surplus to allocate
 */
export type SavingsGoalType = 'goal' | 'want';

export interface SavingsGoal {
  id: string;
  name: string;
  /** Emoji icon chosen by the user */
  icon: string;
  /** Target dollar amount. 0 = open-ended savings goal */
  targetAmount: number;
  /** Running total contributed so far */
  currentAmount: number;
  type: SavingsGoalType;
  /** ISO date string set when currentAmount first reaches targetAmount */
  completedAt?: string;
  createdAt: string;
}

// ─── Monthly archive record ───────────────────────────────────────────────────

/**
 * A fully self-contained snapshot of one calendar month.
 * Created automatically on the first app-open after a month rolls over.
 * Stored per-month so reports always show historically accurate figures.
 */
export interface MonthlyRecord {
  /** Calendar month, e.g. "2026-03" */
  month: string;

  // Budget snapshot that was active this month
  income: number;
  debtTotal: number;
  categories: {
    name: string;
    icon: string;
    color: string;
    /** Monthly budget limit for this category */
    budgetLimit: number;
  }[];

  /** Every transaction that occurred during this month */
  transactions: Transaction[];

  /** Pre-computed summary — fast to render without re-scanning transactions */
  summary: {
    totalSpent: number;
    totalBudgeted: number;
    /** (income - totalSpent) / income, clamped to [0, 1] */
    savingsRate: number;
    categoryBreakdown: {
      name: string;
      icon: string;
      color: string;
      spent: number;
      limit: number;
    }[];
    /** Goals that were completed during this month */
    goalsAchieved?: { id: string; name: string; icon: string; targetAmount: number }[];
  };
}

// ─── Top-level budget document ────────────────────────────────────────────────

/**
 * The full shape of everything saved to / loaded from storage.
 * When we move to Supabase this becomes one row per user.
 */
export interface BudgetData {
  incomeSources: IncomeSource[];
  debts: DebtItem[];
  categories: CategoryItem[];
  transactions: Transaction[];
  /** ISO timestamp of the last *setup* save — shown on the Setup screen */
  lastSaved: string | null;
  /**
   * The calendar month (YYYY-MM) the user last confirmed moving into.
   * e.g. "2026-04" means the user confirmed starting April.
   * When this differs from the current month, a month-end prompt is shown.
   * Null on first launch — initialised silently without showing the prompt.
   */
  lastArchivedMonth: string | null;

  // ─── Goals ────────────────────────────────────────────────────────────────
  savingsGoals: SavingsGoal[];
  /**
   * "Potential Savings" — unallocated surplus waiting to be assigned to a goal.
   * Grows when a bi-weekly period closes with leftover budget.
   */
  savingsPool: number;
  /**
   * Bi-weekly period key of the last surplus prompt shown.
   * Format: "YYYY-MM-A" (1st–15th) or "YYYY-MM-B" (16th–end).
   * Prevents the same period from triggering the prompt twice.
   */
  lastSurplusPromptPeriod: string | null;
}
