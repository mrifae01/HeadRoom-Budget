/**
 * storage/reports.ts — Supabase helpers for monthly archive records.
 *
 * Each archived month is one row in the `monthly_records` table.
 * The two format helpers at the bottom are pure functions — unchanged.
 */

import { supabase } from '../config/supabase';
import { MonthlyRecord } from '../types/budget';

/** Save (or overwrite) a monthly record for a user. */
export async function saveMonthlyRecord(
  record: MonthlyRecord,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('monthly_records')
    .upsert({
      user_id:      userId,
      month:        record.month,
      income:       record.income,
      debt_total:   record.debtTotal,
      categories:   record.categories,
      transactions: record.transactions,
      summary:      record.summary,
    }, { onConflict: 'user_id, month' });

  if (error) throw error;
}

/** Permanently delete a monthly record for a user. */
export async function deleteMonthlyRecord(
  month: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('monthly_records')
    .delete()
    .eq('user_id', userId)
    .eq('month', month);

  if (error) throw error;
}

/** Load one month's record. Returns null if it has never been archived. */
export async function loadMonthlyRecord(
  month: string,
  userId: string,
): Promise<MonthlyRecord | null> {
  const { data, error } = await supabase
    .from('monthly_records')
    .select('*')
    .eq('user_id', userId)
    .eq('month', month)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not archived yet
    throw error;
  }

  return {
    month:        data.month,
    income:       Number(data.income),
    debtTotal:    Number(data.debt_total),
    categories:   data.categories,
    transactions: data.transactions,
    summary:      data.summary,
  };
}

/**
 * Ordered list of months that have been archived for a user, newest first.
 * e.g. ['2026-03', '2026-02', '2026-01']
 */
export async function getMonthsIndex(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('monthly_records')
    .select('month')
    .eq('user_id', userId)
    .order('month', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((r: { month: string }) => r.month);
}

// ─── Pure format helpers (no storage dependency) ──────────────────────────────

/** Human-readable label. "2026-03" → "March 2026" */
export function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m - 1, 1).toLocaleString(undefined, {
    month: 'long',
    year:  'numeric',
  });
}

/** Short label. "2026-03" → "Mar '26" */
export function formatMonthShort(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m - 1, 1).toLocaleString(undefined, {
    month: 'short',
    year:  '2-digit',
  });
}
