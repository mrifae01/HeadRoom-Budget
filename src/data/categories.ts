/**
 * categories.ts — the canonical list of budget categories.
 *
 * Each entry carries:
 *   name  — display name and the value stored in CategoryItem
 *   icon  — emoji shown in the picker, rows, and dashboard
 *   color — hex used for progress bars and pie/bar charts on the dashboard
 *
 * Adding a new category here automatically makes it available everywhere.
 */

export interface PresetCategory {
  name: string;
  icon: string;
  /** Hex color used for charts and progress bars */
  color: string;
}

export const PRESET_CATEGORIES: PresetCategory[] = [
  { name: 'Rent/Mortgage',  icon: '🏠', color: '#6366F1' }, // indigo
  { name: 'Groceries',      icon: '🛒', color: '#10B981' }, // emerald
  { name: 'Utilities',      icon: '💡', color: '#F59E0B' }, // amber
  { name: 'Transportation', icon: '🚌', color: '#3B82F6' }, // blue
  { name: 'Car/Gas',        icon: '⛽', color: '#EF4444' }, // red
  { name: 'Dining Out',     icon: '🍽️', color: '#F97316' }, // orange
  { name: 'Entertainment',  icon: '🎬', color: '#8B5CF6' }, // violet
  { name: 'Fun',            icon: '🎉', color: '#EC4899' }, // pink
  { name: 'Insurance',      icon: '🛡️', color: '#14B8A6' }, // teal
  { name: 'Child',          icon: '👶', color: '#06B6D4' }, // cyan
  { name: 'Pet',            icon: '🐾', color: '#A78BFA' }, // purple
  { name: 'Other/Misc',     icon: '📦', color: '#94A3B8' }, // slate
];

/** Look up a preset by name — returns undefined if not found. */
export function findPreset(name: string): PresetCategory | undefined {
  return PRESET_CATEGORIES.find((c) => c.name === name);
}
