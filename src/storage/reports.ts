/**
 * storage/reports.ts — AsyncStorage helpers for monthly archive records.
 *
 * Each month gets its own key: @headroom/month_2026-03
 * A separate index key tracks which months exist for fast list rendering.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MonthlyRecord } from '../types/budget';

const INDEX_KEY = '@headroom/months_index';
const monthKey  = (month: string) => `@headroom/month_${month}`;

/** Save (or overwrite) a monthly record and add it to the index. */
export async function saveMonthlyRecord(record: MonthlyRecord): Promise<void> {
  await AsyncStorage.setItem(monthKey(record.month), JSON.stringify(record));

  // Keep the index sorted newest-first
  const existing = await getMonthsIndex();
  if (!existing.includes(record.month)) {
    const updated = [record.month, ...existing].sort().reverse();
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(updated));
  }
}

/**
 * Permanently delete a monthly record and remove it from the index.
 * No-op if the record doesn't exist.
 */
export async function deleteMonthlyRecord(month: string): Promise<void> {
  await AsyncStorage.removeItem(monthKey(month));
  const existing = await getMonthsIndex();
  const updated  = existing.filter((m) => m !== month);
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(updated));
}

/** Load one month's record. Returns null if it has never been archived. */
export async function loadMonthlyRecord(month: string): Promise<MonthlyRecord | null> {
  const raw = await AsyncStorage.getItem(monthKey(month));
  if (!raw) return null;
  return JSON.parse(raw) as MonthlyRecord;
}

/**
 * Ordered list of months that have been archived, newest first.
 * e.g. ['2026-03', '2026-02', '2026-01']
 */
export async function getMonthsIndex(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as string[];
}

/** Human-readable label for a month string. "2026-03" → "March 2026" */
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
