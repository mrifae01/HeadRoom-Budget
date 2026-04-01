/**
 * SetupScreen — dynamic budget configuration.
 *
 * Reads initial data from BudgetContext (which loads from AsyncStorage on
 * startup) and writes back via saveBudget() when the user taps Save.
 *
 * Sections:
 *  1. Income Sources — Income (monthly amount) or No Income (savings draw)
 *  2. Debts          — name + monthly payment
 *  3. Categories     — name + monthly spending limit
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Modal,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { typography, spacing, radius, shadows } from '../theme';
import { Colors } from '../theme';
import { useTheme } from '../context/ThemeContext';
import Card from '../components/Card';
import SectionHeader from '../components/SectionHeader';
import StyledInput from '../components/StyledInput';
import { useBudget } from '../context/BudgetContext';
import { useBank } from '../context/BankContext';
import BankAnalysisModal from '../components/BankAnalysisModal';
import { IncomeSource, IncomeType, DebtItem, CategoryItem } from '../types/budget';
import { PRESET_CATEGORIES, PresetCategory } from '../data/categories';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

/** Format an ISO timestamp into a readable "Last saved" string. */
function formatLastSaved(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ─── Period helpers (Income & Category amounts are stored monthly; displayed per period) ──

type SetupPeriod = 'month' | 'biweek' | 'week';

const SETUP_PERIOD_OPTIONS: { key: SetupPeriod; label: string }[] = [
  { key: 'month',  label: 'Month'   },
  { key: 'biweek', label: 'Bi-Week' },
  { key: 'week',   label: 'Week'    },
];

const PERIOD_LABEL: Record<SetupPeriod, string> = {
  month:  'Monthly',
  biweek: 'Bi-Weekly',
  week:   'Weekly',
};

const AVG_DAYS_PER_MONTH = 30.4375; // 365.25 / 12
const PERIOD_DAYS: Record<SetupPeriod, number> = {
  month:  AVG_DAYS_PER_MONTH,
  biweek: 14,
  week:   7,
};

/** Monthly stored value → display string for the given period */
function toDisplayAmt(monthlyStr: string, period: SetupPeriod): string {
  if (period === 'month') return monthlyStr;
  const monthly = parseFloat(monthlyStr);
  if (!monthlyStr || isNaN(monthly)) return monthlyStr;
  return (monthly * PERIOD_DAYS[period] / AVG_DAYS_PER_MONTH).toFixed(2);
}

/** Period display string → monthly string for storage */
function toMonthlyAmt(displayStr: string, period: SetupPeriod): string {
  if (period === 'month') return displayStr;
  const val = parseFloat(displayStr);
  if (!displayStr || isNaN(val)) return displayStr;
  return (val * AVG_DAYS_PER_MONTH / PERIOD_DAYS[period]).toFixed(2);
}

// ─── Income type selector options ──────────────────────────────────────────────

const INCOME_TYPES: { key: IncomeType; label: string; icon: string }[] = [
  { key: 'income',    label: 'Income',    icon: '💼' },
  { key: 'no_income', label: 'No Income', icon: '🏦' },
];

// ─── IncomeCard ────────────────────────────────────────────────────────────────

interface IncomeCardProps {
  source: IncomeSource;
  onChange: (updated: IncomeSource) => void;
  onRemove: () => void;
  canRemove: boolean;
  period: SetupPeriod;
}

const createIcStyles = (c: Colors) => StyleSheet.create({
  card: {
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.border,
    padding: spacing[3],
    marginBottom: spacing[3],
  },
  cardNoIncome: {
    borderColor: c.warning,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  removeBtn: {
    width: 36,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: c.textMuted,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  typePill: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.border,
    gap: 2,
  },
  typePillActive: {
    backgroundColor: c.primaryLight,
    borderColor: c.primary,
  },
  typePillWarningActive: {
    backgroundColor: c.warningLight,
    borderColor: c.warning,
  },
  typePillIcon: {
    fontSize: 18,
  },
  typePillLabel: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: c.textMuted,
  },
  typePillLabelActive: {
    color: c.primary,
  },
  typePillLabelWarning: {
    color: c.warning,
  },
  noIncomeNote: {
    backgroundColor: c.warningLight,
    borderRadius: radius.sm,
    padding: spacing[3],
    marginBottom: spacing[3],
  },
  noIncomeNoteText: {
    fontSize: typography.sm,
    color: c.textSecondary,
    lineHeight: typography.sm * typography.relaxed,
  },
});

function IncomeCard({ source, onChange, onRemove, canRemove, period }: IncomeCardProps) {
  const { colors } = useTheme();
  const icStyles = useMemo(() => createIcStyles(colors), [colors]);

  const patch = (fields: Partial<IncomeSource>) => onChange({ ...source, ...fields });
  const isNoIncome = source.type === 'no_income';

  // Local display amount — tracks what the user sees/types in the current period.
  // Re-computed from the stored monthly value whenever `period` changes.
  const [displayAmount, setDisplayAmount] = useState(() => toDisplayAmt(source.amount, period));
  useEffect(() => {
    setDisplayAmount(toDisplayAmt(source.amount, period));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  return (
    <View style={[icStyles.card, isNoIncome && icStyles.cardNoIncome]}>

      {/* ── Source name + remove ── */}
      <View style={icStyles.nameRow}>
        <View style={{ flex: 1 }}>
          <StyledInput
            placeholder={isNoIncome ? 'e.g. Savings account' : 'e.g. Day job, Freelance…'}
            value={source.name}
            onChangeText={(v) => patch({ name: v })}
            returnKeyType="next"
          />
        </View>
        {canRemove && (
          <TouchableOpacity
            style={icStyles.removeBtn}
            onPress={onRemove}
            accessibilityLabel="Remove income source"
          >
            <Text style={icStyles.removeBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Income / No Income pills ── */}
      <View style={icStyles.typeRow}>
        {INCOME_TYPES.map((opt) => {
          const active = source.type === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                icStyles.typePill,
                active && (opt.key === 'no_income'
                  ? icStyles.typePillWarningActive
                  : icStyles.typePillActive),
              ]}
              onPress={() => patch({ type: opt.key })}
              activeOpacity={0.75}
              accessibilityLabel={`Set income type to ${opt.label}`}
            >
              <Text style={icStyles.typePillIcon}>{opt.icon}</Text>
              <Text style={[
                icStyles.typePillLabel,
                active && (opt.key === 'no_income'
                  ? icStyles.typePillLabelWarning
                  : icStyles.typePillLabelActive),
              ]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Regular income: take-home (period-scaled) ── */}
      {source.type === 'income' && (
        <StyledInput
          label={`${PERIOD_LABEL[period]} take-home`}
          placeholder="0.00"
          prefix="$"
          keyboardType="decimal-pad"
          returnKeyType="done"
          value={displayAmount}
          onChangeText={(v) => {
            setDisplayAmount(v);
            patch({ amount: toMonthlyAmt(v, period) });
          }}
        />
      )}

      {/* ── No Income: draw from savings (period-scaled) ── */}
      {source.type === 'no_income' && (
        <>
          <View style={icStyles.noIncomeNote}>
            <Text style={icStyles.noIncomeNoteText}>
              💡 No active income? Enter how much you plan to draw from savings or reserves each{' '}
              {period === 'month' ? 'month' : period === 'biweek' ? 'two weeks' : 'week'} to cover your budget.
            </Text>
          </View>
          <StyledInput
            label={`${PERIOD_LABEL[period]} draw amount`}
            placeholder="0.00"
            prefix="$"
            keyboardType="decimal-pad"
            returnKeyType="done"
            value={displayAmount}
            onChangeText={(v) => {
              setDisplayAmount(v);
              patch({ amount: toMonthlyAmt(v, period) });
            }}
          />
        </>
      )}
    </View>
  );
}

// ─── DebtRow ───────────────────────────────────────────────────────────────────

interface DebtRowProps {
  item: DebtItem;
  onChange: (updated: DebtItem) => void;
  onRemove: () => void;
}

const createDebtStyles = (c: Colors) => StyleSheet.create({
  card: {
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.border,
    padding: spacing[3],
    marginBottom: spacing[3],
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  removeBtn: {
    width: 36,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: c.textMuted,
  },
  amountLabels: {
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[1],
  },
  amountLabel: {
    flex: 1,
    fontSize: typography.sm,
    fontWeight: typography.medium,
    color: c.textSecondary,
  },
  amountLabelOptional: {
    fontWeight: typography.regular,
    color: c.textMuted,
  },
  amountRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  payoffHint: {
    marginTop: spacing[2],
    backgroundColor: c.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  payoffHintText: {
    fontSize: typography.xs,
    color: c.primary,
    lineHeight: typography.xs * 1.5,
  },
  payoffHintBold: {
    fontWeight: typography.bold,
  },
});

function DebtRow({ item, onChange, onRemove }: DebtRowProps) {
  const { colors } = useTheme();
  const debtStyles = useMemo(() => createDebtStyles(colors), [colors]);

  const monthly  = parseFloat(item.amount) || 0;
  const total    = parseFloat(item.totalAmount ?? '') || 0;
  const current  = parseFloat(item.currentBalance ?? '') || 0;
  // Use currentBalance for payoff timeline if available, otherwise totalAmount
  const remaining = current > 0 ? current : total;
  const hasPayoff = monthly > 0 && remaining > 0;
  const monthsLeft = hasPayoff ? Math.ceil(remaining / monthly) : null;

  return (
    <View style={debtStyles.card}>

      {/* ── Name + remove ── */}
      <View style={debtStyles.nameRow}>
        <View style={{ flex: 1 }}>
          <StyledInput
            placeholder="e.g. Student Loan, Credit Card…"
            value={item.name}
            onChangeText={(v) => onChange({ ...item, name: v })}
            returnKeyType="next"
          />
        </View>
        <TouchableOpacity
          style={debtStyles.removeBtn}
          onPress={onRemove}
          accessibilityLabel="Remove debt"
        >
          <Text style={debtStyles.removeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* ── Three amount inputs side-by-side ── */}
      <View style={debtStyles.amountLabels}>
        <Text style={debtStyles.amountLabel}>Monthly Payment</Text>
        <Text style={debtStyles.amountLabel}>
          Current Balance <Text style={debtStyles.amountLabelOptional}>(optional)</Text>
        </Text>
        <Text style={debtStyles.amountLabel}>
          Total Balance <Text style={debtStyles.amountLabelOptional}>(optional)</Text>
        </Text>
      </View>
      <View style={debtStyles.amountRow}>
        <View style={{ flex: 1 }}>
          <StyledInput
            placeholder="0"
            prefix="$"
            keyboardType="decimal-pad"
            returnKeyType="done"
            value={item.amount}
            onChangeText={(v) => onChange({ ...item, amount: v })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <StyledInput
            placeholder="0"
            prefix="$"
            keyboardType="decimal-pad"
            returnKeyType="done"
            value={item.currentBalance ?? ''}
            onChangeText={(v) => onChange({ ...item, currentBalance: v || undefined })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <StyledInput
            placeholder="0"
            prefix="$"
            keyboardType="decimal-pad"
            returnKeyType="done"
            value={item.totalAmount ?? ''}
            onChangeText={(v) => onChange({ ...item, totalAmount: v || undefined })}
          />
        </View>
      </View>

      {/* ── Payoff preview — only when both fields are filled ── */}
      {hasPayoff && monthsLeft !== null && (
        <View style={debtStyles.payoffHint}>
          <Text style={debtStyles.payoffHintText}>
            📅 At ${monthly.toLocaleString()}/mo you'll pay this off in{' '}
            <Text style={debtStyles.payoffHintBold}>
              {monthsLeft < 12
                ? `${monthsLeft} month${monthsLeft === 1 ? '' : 's'}`
                : `${Math.floor(monthsLeft / 12)} yr${Math.floor(monthsLeft / 12) === 1 ? '' : 's'}${monthsLeft % 12 > 0 ? ` ${monthsLeft % 12} mo` : ''}`}
            </Text>
          </Text>
        </View>
      )}

    </View>
  );
}

// ─── CategoryPickerModal ───────────────────────────────────────────────────────

interface CategoryPickerModalProps {
  visible: boolean;
  /** Names already in use by other rows — shown as disabled in the grid */
  usedNames: string[];
  onSelect: (preset: PresetCategory) => void;
  onClose: () => void;
}

// ─── Custom category options ───────────────────────────────────────────────────

const EMOJI_OPTIONS = [
  '💼', '🏡', '🚗', '✈️', '🎓', '💊', '👕', '📚',
  '🎵', '🏋️', '🍕', '☕', '💇', '🎁', '🌴', '🔧',
  '💻', '📱', '🌙', '🏖️', '🎮', '🐕', '🌱', '⚽',
  '🎨', '📸', '🏥', '🚀', '🛍️', '🧴',
];

const COLOR_OPTIONS = [
  '#6366F1', '#3B82F6', '#0EA5E9', '#06B6D4',
  '#10B981', '#84CC16', '#F59E0B', '#F97316',
  '#EF4444', '#EC4899', '#8B5CF6', '#A78BFA',
];

const createPickerStyles = (c: Colors) => StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    backgroundColor: c.surface,
  },
  headerTitle: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: c.textPrimary,
  },
  headerClose: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: c.primary,
  },
  grid: {
    padding: spacing[4],
    gap: spacing[3],
  },
  gridRow: {
    gap: spacing[3],
  },
  cell: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: c.border,
    padding: spacing[4],
    alignItems: 'center',
    gap: spacing[1],
    ...shadows.sm,
  },
  cellUsed: {
    backgroundColor: c.surfaceAlt,
    borderColor: c.border,
    opacity: 0.5,
  },
  cellDot: {
    position: 'absolute',
    top: spacing[3],
    right: spacing[3],
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cellIcon: {
    fontSize: 32,
    marginBottom: spacing[1],
  },
  cellName: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: c.textPrimary,
    textAlign: 'center',
  },
  cellNameUsed: {
    color: c.textMuted,
  },
  cellUsedBadge: {
    fontSize: typography.xs,
    color: c.textMuted,
    marginTop: 2,
  },

  // ── Custom form ──
  customForm: {
    padding: spacing[5],
    paddingBottom: spacing[10],
  },
  formLabel: {
    fontSize: typography.sm,
    fontWeight: typography.semibold as any,
    color: c.textSecondary,
    marginBottom: spacing[2],
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  emojiCell: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiCellSelected: {
    backgroundColor: c.primaryLight,
    borderWidth: 2,
  },
  emojiCellText: { fontSize: 24 },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: c.textPrimary,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[5],
    padding: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  previewDot: { width: 8, height: 8, borderRadius: 4 },
  previewIcon: { fontSize: 20 },
  previewName: {
    fontSize: typography.base,
    fontWeight: typography.semibold as any,
  },
  confirmBtn: {
    marginTop: spacing[6],
    paddingVertical: spacing[4],
    borderRadius: radius.md,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: typography.base,
    fontWeight: typography.bold as any,
  },
});

/**
 * Full-screen modal with two modes:
 *  'pick'   — 2-column grid of preset categories (grayed out if already used)
 *  'create' — custom form: name + emoji picker + color swatch + live preview
 */
function CategoryPickerModal({ visible, usedNames, onSelect, onClose }: CategoryPickerModalProps) {
  const { colors } = useTheme();
  const pickerStyles = useMemo(() => createPickerStyles(colors), [colors]);

  const [mode,        setMode]        = useState<'pick' | 'create'>('pick');
  const [customName,  setCustomName]  = useState('');
  const [customIcon,  setCustomIcon]  = useState('💼');
  const [customColor, setCustomColor] = useState('#6366F1');

  // Reset the custom form every time the modal opens
  useEffect(() => {
    if (visible) {
      setMode('pick');
      setCustomName('');
      setCustomIcon('💼');
      setCustomColor('#6366F1');
    }
  }, [visible]);

  const handleConfirmCustom = () => {
    if (!customName.trim()) return;
    onSelect({ name: customName.trim(), icon: customIcon, color: customColor });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={pickerStyles.sheet}>

        {/* ── Header ── */}
        <View style={pickerStyles.header}>
          {mode === 'create' ? (
            <TouchableOpacity onPress={() => setMode('pick')} accessibilityLabel="Back to presets">
              <Text style={pickerStyles.headerClose}>← Presets</Text>
            </TouchableOpacity>
          ) : (
            <Text style={pickerStyles.headerTitle}>Choose a Category</Text>
          )}

          {mode === 'pick' ? (
            <TouchableOpacity onPress={() => setMode('create')} accessibilityLabel="Create custom category">
              <Text style={pickerStyles.headerClose}>+ Custom</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close picker">
              <Text style={pickerStyles.headerClose}>Done</Text>
            </TouchableOpacity>
          )}
        </View>

        {mode === 'pick' ? (

          /* ── Preset grid ── */
          <FlatList
            data={PRESET_CATEGORIES}
            keyExtractor={(item) => item.name}
            numColumns={2}
            contentContainerStyle={pickerStyles.grid}
            columnWrapperStyle={pickerStyles.gridRow}
            renderItem={({ item: preset }) => {
              const isUsed = usedNames.includes(preset.name);
              return (
                <TouchableOpacity
                  style={[pickerStyles.cell, isUsed && pickerStyles.cellUsed]}
                  onPress={() => !isUsed && onSelect(preset)}
                  activeOpacity={isUsed ? 1 : 0.7}
                  accessibilityLabel={`Select ${preset.name}`}
                  accessibilityState={{ disabled: isUsed }}
                >
                  <View style={[pickerStyles.cellDot, { backgroundColor: preset.color }]} />
                  <Text style={pickerStyles.cellIcon}>{preset.icon}</Text>
                  <Text style={[pickerStyles.cellName, isUsed && pickerStyles.cellNameUsed]}>
                    {preset.name}
                  </Text>
                  {isUsed && <Text style={pickerStyles.cellUsedBadge}>Added</Text>}
                </TouchableOpacity>
              );
            }}
          />

        ) : (

          /* ── Custom category form ── */
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              contentContainerStyle={pickerStyles.customForm}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Name */}
              <Text style={pickerStyles.formLabel}>Category Name</Text>
              <StyledInput
                placeholder="e.g. Kids Activities, Side Hustle…"
                value={customName}
                onChangeText={setCustomName}
                returnKeyType="done"
              />

              {/* Emoji picker */}
              <Text style={[pickerStyles.formLabel, { marginTop: spacing[5] }]}>Icon</Text>
              <View style={pickerStyles.emojiGrid}>
                {EMOJI_OPTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[
                      pickerStyles.emojiCell,
                      customIcon === emoji && pickerStyles.emojiCellSelected,
                      customIcon === emoji && { borderColor: customColor },
                    ]}
                    onPress={() => setCustomIcon(emoji)}
                    activeOpacity={0.7}
                  >
                    <Text style={pickerStyles.emojiCellText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Color picker */}
              <Text style={[pickerStyles.formLabel, { marginTop: spacing[5] }]}>Colour</Text>
              <View style={pickerStyles.colorGrid}>
                {COLOR_OPTIONS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      pickerStyles.colorSwatch,
                      { backgroundColor: color },
                      customColor === color && pickerStyles.colorSwatchSelected,
                    ]}
                    onPress={() => setCustomColor(color)}
                    activeOpacity={0.8}
                  />
                ))}
              </View>

              {/* Live preview */}
              {customName.trim().length > 0 && (
                <View style={[
                  pickerStyles.preview,
                  { borderColor: customColor, backgroundColor: customColor + '18' },
                ]}>
                  <View style={[pickerStyles.previewDot, { backgroundColor: customColor }]} />
                  <Text style={pickerStyles.previewIcon}>{customIcon}</Text>
                  <Text style={[pickerStyles.previewName, { color: colors.textPrimary }]}>
                    {customName.trim()}
                  </Text>
                </View>
              )}

              {/* Add button */}
              <TouchableOpacity
                style={[
                  pickerStyles.confirmBtn,
                  { backgroundColor: colors.primary },
                  !customName.trim() && { opacity: 0.4 },
                ]}
                onPress={handleConfirmCustom}
                disabled={!customName.trim()}
                activeOpacity={0.85}
              >
                <Text style={[pickerStyles.confirmBtnText, { color: colors.textInverse }]}>
                  Add Category
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>

        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── CategoryRow ───────────────────────────────────────────────────────────────

interface CategoryRowProps {
  item: CategoryItem;
  /** Names in use by *other* rows (not this one) — passed to the picker */
  usedNames: string[];
  onChange: (updated: CategoryItem) => void;
  onRemove: () => void;
  period: SetupPeriod;
}

const createRowStyles = (c: Colors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    marginBottom: spacing[1],
  },
  // ── Category selector button (replaces free-text input) ──
  categoryBtn: {
    flex: 1.4,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.border,
    paddingHorizontal: spacing[3],
    marginBottom: spacing[3],
  },
  categoryBtnEmpty: {
    borderStyle: 'dashed',
  },
  categoryBtnInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryIcon: {
    fontSize: 16,
  },
  categoryName: {
    flex: 1,
    fontSize: typography.sm,
    fontWeight: typography.medium,
    color: c.textPrimary,
  },
  categoryPlaceholder: {
    flex: 1,
    fontSize: typography.sm,
    color: c.textMuted,
  },
  categoryChevron: {
    fontSize: 20,
    color: c.textMuted,
    lineHeight: 22,
  },
  // ── Debt row name input (free-text, unlike category selector) ──
  name: {
    flex: 1.4,
  },
  // ── Amount + remove (shared with DebtRow) ──
  amount: {
    flex: 1,
  },
  removeBtn: {
    width: 36,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: c.textMuted,
  },
});

function CategoryRow({ item, usedNames, onChange, onRemove, period }: CategoryRowProps) {
  const { colors } = useTheme();
  const rowStyles = useMemo(() => createRowStyles(colors), [colors]);

  const [pickerOpen, setPickerOpen] = useState(false);

  // Local display amount — re-computed from stored monthly value when period changes.
  const [displayAmount, setDisplayAmount] = useState(() => toDisplayAmt(item.amount, period));
  useEffect(() => {
    setDisplayAmount(toDisplayAmt(item.amount, period));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const handleSelect = (preset: PresetCategory) => {
    onChange({ ...item, name: preset.name, icon: preset.icon, color: preset.color });
    setPickerOpen(false);
  };

  return (
    <>
      <View style={rowStyles.row}>
        {/* Category selector button — replaces free-text input */}
        <TouchableOpacity
          style={[rowStyles.categoryBtn, !item.name && rowStyles.categoryBtnEmpty]}
          onPress={() => setPickerOpen(true)}
          activeOpacity={0.75}
          accessibilityLabel="Select category"
        >
          {item.name ? (
            <View style={rowStyles.categoryBtnInner}>
              {/* Color swatch */}
              <View style={[rowStyles.categoryDot, { backgroundColor: item.color }]} />
              <Text style={rowStyles.categoryIcon}>{item.icon}</Text>
              <Text style={rowStyles.categoryName} numberOfLines={1}>{item.name}</Text>
            </View>
          ) : (
            <Text style={rowStyles.categoryPlaceholder}>Select category…</Text>
          )}
          <Text style={rowStyles.categoryChevron}>›</Text>
        </TouchableOpacity>

        {/* Period-scaled limit input */}
        <View style={rowStyles.amount}>
          <StyledInput
            placeholder="0"
            value={displayAmount}
            prefix="$"
            keyboardType="decimal-pad"
            returnKeyType="done"
            onChangeText={(v) => {
              setDisplayAmount(v);
              onChange({ ...item, amount: toMonthlyAmt(v, period) });
            }}
          />
        </View>

        <TouchableOpacity
          style={rowStyles.removeBtn}
          onPress={onRemove}
          accessibilityLabel="Remove category"
        >
          <Text style={rowStyles.removeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <CategoryPickerModal
        visible={pickerOpen}
        usedNames={usedNames}
        onSelect={handleSelect}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

// ─── AddButton ─────────────────────────────────────────────────────────────────

const createAddButtonStyles = (c: Colors) => StyleSheet.create({
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.primary,
    marginTop: spacing[1],
  },
  addButtonText: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: c.primary,
  },
});

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createAddButtonStyles(colors), [colors]);

  return (
    <TouchableOpacity style={styles.addButton} onPress={onPress} activeOpacity={0.75}>
      <Text style={styles.addButtonText}>+ {label}</Text>
    </TouchableOpacity>
  );
}

// ─── SetupScreen ───────────────────────────────────────────────────────────────

/** Possible states for the Save button */
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const createStyles = (c: Colors) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: c.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
  },
  loadingText: {
    fontSize: typography.base,
    color: c.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[6],
  },
  pageHeader: {
    marginBottom: spacing[5],
  },
  pageTitle: {
    fontSize: typography['2xl'],
    fontWeight: typography.bold,
    color: c.textPrimary,
  },
  pageSubtitle: {
    fontSize: typography.sm,
    color: c.textSecondary,
    marginTop: spacing[1],
    lineHeight: typography.sm * typography.relaxed,
  },
  bankBanner: {
    flexDirection:  'row',
    alignItems:     'center',
    borderRadius:   radius.lg,
    borderWidth:    1.5,
    padding:        spacing[4],
    marginBottom:   spacing[5],
    gap:            spacing[3],
  },
  bankBannerIcon: {
    fontSize: 22,
  },
  bankBannerText: {
    flex: 1,
    gap:  2,
  },
  bankBannerTitle: {
    fontSize:   typography.sm,
    fontWeight: typography.semibold,
  },
  bankBannerSub: {
    fontSize: typography.xs,
    opacity:  0.8,
  },
  bankBannerChevron: {
    fontSize:   22,
    lineHeight: 24,
  },
  section: {
    marginBottom: spacing[4],
  },
  saveButton: {
    backgroundColor: c.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing[4],
    alignItems: 'center',
    marginTop: spacing[2],
    ...shadows.md,
  },
  saveButtonSuccess: {
    backgroundColor: c.accent,
  },
  saveButtonError: {
    backgroundColor: c.danger,
  },
  saveButtonText: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: c.textInverse,
    letterSpacing: 0.3,
  },
  lastSaved: {
    fontSize: typography.xs,
    color: c.textMuted,
    textAlign: 'center',
    marginTop: spacing[2],
  },
  simulateBtn: {
    marginTop: spacing[5],
    borderRadius: radius.lg,
    paddingVertical: spacing[3],
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.warning,
    backgroundColor: c.warningLight,
  },
  simulateBtnText: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: c.warning,
  },
  periodRow: {
    flexDirection: 'row',
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.full,
    padding: 3,
    marginBottom: spacing[3],
    borderWidth: 1,
    borderColor: c.border,
  },
  periodPill: {
    flex: 1,
    paddingVertical: spacing[1] + 1,
    alignItems: 'center',
    borderRadius: radius.full,
  },
  periodPillActive: {
    backgroundColor: c.primary,
  },
  periodPillText: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: c.textSecondary,
    letterSpacing: 0.3,
  },
  periodPillTextActive: {
    color: c.textInverse,
  },
});

export default function SetupScreen() {
  // ── Pull data + actions from context ────────────────────────────────────────
  const { budget, isLoading, saveBudget/*, simulateMonthEnd*/ } = useBudget();
  const { isConnected: bankConnected } = useBank();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [analysisVisible, setAnalysisVisible] = useState(false);

  // ── Local form state (mirrors context, edited in-place before saving) ───────
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>(budget.incomeSources);
  const [debts,         setDebts]         = useState<DebtItem[]>(budget.debts);
  const [categories,    setCategories]    = useState<CategoryItem[]>(budget.categories);
  const [saveState,     setSaveState]     = useState<SaveState>('idle');

  // ── Per-section period selectors ─────────────────────────────────────────────
  const [incomePeriod, setIncomePeriod] = useState<SetupPeriod>('month');
  const [catPeriod,    setCatPeriod]    = useState<SetupPeriod>('month');

  /**
   * Once the async load from AsyncStorage completes, sync the form
   * with whatever was actually saved. Runs exactly once.
   */
  useEffect(() => {
    if (!isLoading) {
      setIncomeSources(budget.incomeSources);
      setDebts(budget.debts);
      setCategories(budget.categories);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // Re-sync all form fields whenever the screen comes into focus so any
  // external changes (AI adjustments, Dashboard payments, etc.) are reflected.
  useFocusEffect(
    useCallback(() => {
      if (!isLoading) {
        setIncomeSources(budget.incomeSources);
        setDebts(budget.debts);
        setCategories(budget.categories);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, budget.incomeSources, budget.debts, budget.categories]),
  );

  // ── Income handlers ──────────────────────────────────────────────────────────

  const updateIncome = useCallback((id: string, updated: IncomeSource) =>
    setIncomeSources((prev) => prev.map((s) => (s.id === id ? updated : s))), []);

  const removeIncome = useCallback((id: string) =>
    setIncomeSources((prev) => prev.filter((s) => s.id !== id)), []);

  const addIncome = useCallback(() =>
    setIncomeSources((prev) => [
      ...prev,
      { id: uid(), name: '', type: 'income', amount: '' },
    ]), []);

  // ── Debt handlers ────────────────────────────────────────────────────────────

  const updateDebt = useCallback((id: string, updated: DebtItem) =>
    setDebts((prev) => prev.map((d) => (d.id === id ? updated : d))), []);

  const removeDebt = useCallback((id: string) =>
    setDebts((prev) => prev.filter((d) => d.id !== id)), []);

  const addDebt = useCallback(() =>
    setDebts((prev) => [...prev, { id: uid(), name: '', amount: '' }]), []);

  // ── Category handlers ────────────────────────────────────────────────────────

  const updateCategory = useCallback((id: string, updated: CategoryItem) =>
    setCategories((prev) => prev.map((c) => (c.id === id ? updated : c))), []);

  const removeCategory = useCallback((id: string) =>
    setCategories((prev) => prev.filter((c) => c.id !== id)), []);

  const addCategory = useCallback(() =>
    setCategories((prev) => [...prev, { id: uid(), name: '', amount: '', icon: '', color: '' }]), []);

  // ── Save handler ─────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaveState('saving');
    try {
      await saveBudget({ incomeSources, debts, categories });
      setSaveState('saved');
      // Return button to idle after 2 s
      setTimeout(() => setSaveState('idle'), 2000);
    } catch (err) {
      console.error('[SetupScreen] Save failed:', err);
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }, [saveBudget, incomeSources, debts, categories]);

  // ── Save button label / style ─────────────────────────────────────────────────

  const saveButtonLabel =
    saveState === 'saving' ? 'Saving…'         :
    saveState === 'saved'  ? '✓ Saved!'         :
    saveState === 'error'  ? 'Save failed — retry' :
    'Save Budget';

  const saveButtonStyle = [
    styles.saveButton,
    saveState === 'saved' && styles.saveButtonSuccess,
    saveState === 'error' && styles.saveButtonError,
  ];

  // ── Loading overlay while AsyncStorage read is in progress ───────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your budget…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      {/*
        KeyboardAvoidingView sits between SafeAreaView and the ScrollView.
        On iOS 'padding' adds bottom padding equal to the keyboard height so
        the scroll area shrinks and the focused input is never hidden.
        On Android the OS already resizes the window (adjustResize), so we
        pass undefined and let the system handle it.
      */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={true}
      >

        {/* ── Page header ── */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Budget Setup</Text>
          <Text style={styles.pageSubtitle}>
            Configure your income sources, debts, and spending categories.
          </Text>
        </View>

        {/* ── Bank analysis banner (shown when a bank is connected) ── */}
        {bankConnected && (
          <TouchableOpacity
            onPress={() => setAnalysisVisible(true)}
            style={[styles.bankBanner, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
            activeOpacity={0.85}
          >
            <Text style={styles.bankBannerIcon}>🏦</Text>
            <View style={styles.bankBannerText}>
              <Text style={[styles.bankBannerTitle, { color: colors.primary }]}>
                Bank connected
              </Text>
              <Text style={[styles.bankBannerSub, { color: colors.primary }]}>
                Tap to analyse transactions and auto-fill your setup
              </Text>
            </View>
            <Text style={[styles.bankBannerChevron, { color: colors.primary }]}>›</Text>
          </TouchableOpacity>
        )}

        {/* ── Section 1: Income Sources ── */}
        <Card style={styles.section}>
          <SectionHeader
            title="Income Sources"
            subtitle={`Add every source of ${PERIOD_LABEL[incomePeriod].toLowerCase()} income`}
            accentColor={colors.accent}
          />
          {/* Period pill selector */}
          <View style={styles.periodRow}>
            {SETUP_PERIOD_OPTIONS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[styles.periodPill, incomePeriod === key && styles.periodPillActive]}
                onPress={() => setIncomePeriod(key)}
                activeOpacity={0.75}
              >
                <Text style={[styles.periodPillText, incomePeriod === key && styles.periodPillTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {incomeSources.map((source) => (
            <IncomeCard
              key={source.id}
              source={source}
              period={incomePeriod}
              onChange={(updated) => updateIncome(source.id, updated)}
              onRemove={() => removeIncome(source.id)}
              canRemove={incomeSources.length > 1}
            />
          ))}
          <AddButton label="Add Income Source" onPress={addIncome} />
        </Card>

        {/* ── Section 2: Budget Categories ── */}
        <Card style={styles.section}>
          <SectionHeader
            title="Budget Categories"
            subtitle={`Set a ${PERIOD_LABEL[catPeriod].toLowerCase()} limit for each category`}
            accentColor={colors.primary}
          />
          {/* Period pill selector */}
          <View style={styles.periodRow}>
            {SETUP_PERIOD_OPTIONS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[styles.periodPill, catPeriod === key && styles.periodPillActive]}
                onPress={() => setCatPeriod(key)}
                activeOpacity={0.75}
              >
                <Text style={[styles.periodPillText, catPeriod === key && styles.periodPillTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {categories.map((c) => (
            <CategoryRow
              key={c.id}
              item={c}
              period={catPeriod}
              // Pass names from every OTHER row so the picker grays them out
              usedNames={categories.filter((x) => x.id !== c.id).map((x) => x.name)}
              onChange={(updated) => updateCategory(c.id, updated)}
              onRemove={() => removeCategory(c.id)}
            />
          ))}
          <AddButton label="Add Category" onPress={addCategory} />
        </Card>

        {/* ── Section 3: Debts ── */}
        <Card style={styles.section}>
          <SectionHeader
            title="Debts"
            subtitle="Monthly minimum payments"
            accentColor={colors.danger}
          />
          {debts.map((d) => (
            <DebtRow
              key={d.id}
              item={d}
              onChange={(updated) => updateDebt(d.id, updated)}
              onRemove={() => removeDebt(d.id)}
            />
          ))}
          <AddButton label="Add Debt" onPress={addDebt} />
        </Card>

        {/* ── Save button ── */}
        <TouchableOpacity
          style={saveButtonStyle}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={saveState === 'saving'}
          accessibilityLabel="Save budget"
        >
          {saveState === 'saving' ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.saveButtonText}>{saveButtonLabel}</Text>
          )}
        </TouchableOpacity>

        {/* ── Last saved timestamp ── */}
        {budget.lastSaved && (
          <Text style={styles.lastSaved}>
            Last saved {formatLastSaved(budget.lastSaved)}
          </Text>
        )}

        {/* ── Dev: Simulate month end ── */}
        {/* Commented out for production — uncomment to re-enable:
        <TouchableOpacity
          style={styles.simulateBtn}
          onPress={simulateMonthEnd}
          activeOpacity={0.8}
        >
          <Text style={styles.simulateBtnText}>🧪 Simulate Month End</Text>
        </TouchableOpacity>
        */}

        <View style={{ height: spacing[8] }} />
      </ScrollView>
      </KeyboardAvoidingView>

      <BankAnalysisModal
        visible={analysisVisible}
        onClose={() => setAnalysisVisible(false)}
      />

    </SafeAreaView>
  );
}
