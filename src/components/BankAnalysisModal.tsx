/**
 * BankAnalysisModal — analyses connected bank transactions with Claude and
 * proposes a full budget setup (income, categories, debts) that the user can
 * accept in one tap.
 *
 * States:  prompt → loading → result → (apply / dismiss)
 */

import React, { useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { useBudget } from '../context/BudgetContext';
import { supabase } from '../config/supabase';
import { API_BASE_URL } from '../config/api';
import { typography, spacing, radius, shadows } from '../theme';
import { PRESET_CATEGORIES } from '../data/categories';
import { IncomeSource, DebtItem, CategoryItem } from '../types/budget';

// ─── Types returned by the backend ────────────────────────────────────────────

interface RawIncome   { name: string; amount: string; type: 'income' | 'no_income'; }
interface RawCategory { name: string; amount: string; }
interface RawDebt     { name: string; amount: string; totalAmount?: string; }

interface AnalysisResult {
  summary:       string;
  incomeSources: RawIncome[];
  categories:    RawCategory[];
  debts:         RawDebt[];
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

async function runAnalysis(): Promise<AnalysisResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token ?? null;

  const res = await fetch(`${API_BASE_URL}/api/bank/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Analysis failed');
  return data as AnalysisResult;
}

// ─── BankAnalysisModal ────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Step = 'prompt' | 'loading' | 'result' | 'error';

export default function BankAnalysisModal({ visible, onClose }: Props) {
  const { colors }     = useTheme();
  const { saveBudget } = useBudget();
  const isDesktop      = useIsDesktop();

  const [step,   setStep]   = useState<Step>('prompt');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errMsg, setErrMsg] = useState('');

  const handleAnalyze = useCallback(async () => {
    setStep('loading');
    try {
      const data = await runAnalysis();
      setResult(data);
      setStep('result');
    } catch (err: any) {
      setErrMsg(err?.message ?? 'Something went wrong. Please try again.');
      setStep('error');
    }
  }, []);

  const handleApply = useCallback(async () => {
    if (!result) return;

    const incomeSources: IncomeSource[] = result.incomeSources.map((i) => ({
      id:     uid(),
      name:   i.name,
      amount: i.amount,
      type:   i.type,
    }));

    const categories: CategoryItem[] = result.categories.map((c) => {
      const preset = PRESET_CATEGORIES.find((p) => p.name === c.name);
      return {
        id:     uid(),
        name:   c.name,
        amount: c.amount,
        icon:   preset?.icon  ?? '📦',
        color:  preset?.color ?? '#94A3B8',
      };
    });

    const debts: DebtItem[] = result.debts.map((d) => ({
      id:          uid(),
      name:        d.name,
      amount:      d.amount,
      totalAmount: d.totalAmount,
    }));

    await saveBudget({ incomeSources, categories, debts });
    handleClose();
  }, [result, saveBudget]);

  const handleClose = useCallback(() => {
    setStep('prompt');
    setResult(null);
    setErrMsg('');
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={[m.overlay, isDesktop && m.overlayDesktop]}>
        <View style={[m.sheet, isDesktop && m.sheetDesktop, { backgroundColor: colors.surface, borderColor: colors.border }]}>

          {/* ── Prompt step ── */}
          {step === 'prompt' && (
            <>
              <View style={m.iconRow}>
                <Text style={m.icon}>🤖</Text>
              </View>
              <Text style={[m.title, { color: colors.textPrimary }]}>
                Analyse your bank data?
              </Text>
              <Text style={[m.body, { color: colors.textSecondary }]}>
                We'll look at your recent transactions and suggest income sources,
                spending category limits, and debt payments that match how you actually spend.
              </Text>
              <TouchableOpacity
                style={[m.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleAnalyze}
                activeOpacity={0.85}
              >
                <Text style={m.primaryBtnText}>Yes, analyse my transactions</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[m.secondaryBtn, { borderColor: colors.border }]}
                onPress={handleClose}
                activeOpacity={0.7}
              >
                <Text style={[m.secondaryBtnText, { color: colors.textSecondary }]}>Not now</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Loading step ── */}
          {step === 'loading' && (
            <View style={m.centerBlock}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[m.loadingText, { color: colors.textSecondary }]}>
                Analysing your transactions…
              </Text>
              <Text style={[m.loadingSubtext, { color: colors.textMuted }]}>
                This takes a few seconds.
              </Text>
            </View>
          )}

          {/* ── Error step ── */}
          {step === 'error' && (
            <>
              <View style={m.iconRow}>
                <Text style={m.icon}>⚠️</Text>
              </View>
              <Text style={[m.title, { color: colors.textPrimary }]}>Analysis failed</Text>
              <Text style={[m.body, { color: colors.textSecondary }]}>{errMsg}</Text>
              <TouchableOpacity
                style={[m.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleAnalyze}
                activeOpacity={0.85}
              >
                <Text style={m.primaryBtnText}>Try again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[m.secondaryBtn, { borderColor: colors.border }]}
                onPress={handleClose}
                activeOpacity={0.7}
              >
                <Text style={[m.secondaryBtnText, { color: colors.textSecondary }]}>Dismiss</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Result step ── */}
          {step === 'result' && result && (
            <>
              <View style={m.resultHeader}>
                <Text style={[m.title, { color: colors.textPrimary }]}>Budget suggestion ready</Text>
                <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[m.closeX, { color: colors.textMuted }]}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={[m.summary, { color: colors.textSecondary }]}>{result.summary}</Text>

              <ScrollView style={m.scroll} showsVerticalScrollIndicator={false}>

                {/* Income */}
                {result.incomeSources.length > 0 && (
                  <View style={m.section}>
                    <Text style={[m.sectionLabel, { color: colors.textMuted }]}>INCOME</Text>
                    {result.incomeSources.map((inc, i) => (
                      <View key={i} style={[m.row, { borderBottomColor: colors.border }]}>
                        <Text style={[m.rowName, { color: colors.textPrimary }]}>
                          {inc.type === 'income' ? '💼' : '🏦'}  {inc.name}
                        </Text>
                        <Text style={[m.rowAmount, { color: colors.accent }]}>
                          +${parseInt(inc.amount, 10).toLocaleString()}/mo
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Categories */}
                {result.categories.length > 0 && (
                  <View style={m.section}>
                    <Text style={[m.sectionLabel, { color: colors.textMuted }]}>SPENDING LIMITS</Text>
                    {result.categories.map((cat, i) => {
                      const preset = PRESET_CATEGORIES.find((p) => p.name === cat.name);
                      return (
                        <View key={i} style={[m.row, { borderBottomColor: colors.border }]}>
                          <Text style={[m.rowName, { color: colors.textPrimary }]}>
                            {preset?.icon ?? '📦'}  {cat.name}
                          </Text>
                          <Text style={[m.rowAmount, { color: colors.textPrimary }]}>
                            ${parseInt(cat.amount, 10).toLocaleString()}/mo
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Debts */}
                {result.debts.length > 0 && (
                  <View style={m.section}>
                    <Text style={[m.sectionLabel, { color: colors.textMuted }]}>DEBT PAYMENTS</Text>
                    {result.debts.map((debt, i) => (
                      <View key={i} style={[m.row, { borderBottomColor: colors.border }]}>
                        <Text style={[m.rowName, { color: colors.textPrimary }]}>
                          💳  {debt.name}
                        </Text>
                        <Text style={[m.rowAmount, { color: colors.danger }]}>
                          -${parseInt(debt.amount, 10).toLocaleString()}/mo
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={{ height: spacing[4] }} />
              </ScrollView>

              <View style={m.actions}>
                <TouchableOpacity
                  style={[m.secondaryBtn, { borderColor: colors.border, flex: 1, marginBottom: 0 }]}
                  onPress={handleClose}
                  activeOpacity={0.7}
                >
                  <Text style={[m.secondaryBtnText, { color: colors.textSecondary }]}>Dismiss</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[m.primaryBtn, { backgroundColor: colors.primary, flex: 1, marginBottom: 0 }]}
                  onPress={handleApply}
                  activeOpacity={0.85}
                >
                  <Text style={m.primaryBtnText}>Apply to setup</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const m = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent:  'flex-end',
  },
  overlayDesktop: {
    justifyContent: 'center',
    alignItems:     'center',
    padding:        spacing[6],
  },
  sheet: {
    borderTopLeftRadius:  radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth:          1,
    padding:              spacing[6],
    paddingBottom:        spacing[10],
    maxHeight:            '85%',
    ...shadows.lg,
  },
  sheetDesktop: {
    borderRadius:  radius.xl,
    maxWidth:      520,
    width:         '100%',
    paddingBottom: spacing[6],
    maxHeight:     '80%',
  },
  iconRow: {
    alignItems:   'center',
    marginBottom: spacing[3],
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize:     typography.lg,
    fontWeight:   typography.bold,
    textAlign:    'center',
    marginBottom: spacing[3],
  },
  body: {
    fontSize:     typography.sm,
    lineHeight:   typography.sm * 1.6,
    textAlign:    'center',
    marginBottom: spacing[5],
  },
  primaryBtn: {
    borderRadius:  radius.lg,
    paddingVertical: spacing[4],
    alignItems:    'center',
    marginBottom:  spacing[3],
  },
  primaryBtnText: {
    fontSize:   typography.base,
    fontWeight: typography.semibold,
    color:      '#fff',
  },
  secondaryBtn: {
    borderRadius:    radius.lg,
    borderWidth:     1.5,
    paddingVertical: spacing[4],
    alignItems:      'center',
    marginBottom:    spacing[3],
  },
  secondaryBtnText: {
    fontSize:   typography.base,
    fontWeight: typography.medium,
  },
  centerBlock: {
    paddingVertical: spacing[10],
    alignItems:      'center',
    gap:             spacing[4],
  },
  loadingText: {
    fontSize:   typography.base,
    fontWeight: typography.medium,
  },
  loadingSubtext: {
    fontSize: typography.sm,
  },
  resultHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   spacing[3],
  },
  closeX: {
    fontSize:   typography.lg,
    lineHeight: typography.lg,
  },
  summary: {
    fontSize:     typography.sm,
    lineHeight:   typography.sm * 1.6,
    marginBottom: spacing[4],
  },
  scroll: {
    flexGrow: 0,
    maxHeight: 320,
  },
  section: {
    marginBottom: spacing[3],
  },
  sectionLabel: {
    fontSize:      typography.xs,
    fontWeight:    typography.semibold,
    letterSpacing: 0.6,
    marginBottom:  spacing[2],
  },
  row: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
  },
  rowName: {
    fontSize: typography.sm,
    flex:     1,
  },
  rowAmount: {
    fontSize:   typography.sm,
    fontWeight: typography.semibold,
    marginLeft: spacing[3],
  },
  actions: {
    flexDirection: 'row',
    gap:           spacing[3],
    marginTop:     spacing[4],
  },
});
