/**
 * BankScreen — Connect a bank account via Teller and import transactions.
 *
 * Two states:
 *  - Not connected: shows a card prompting the user to link their bank.
 *  - Connected: shows recent transactions with an "Import" button on each
 *    debit row. Importing opens a category-picker modal that calls
 *    addTransaction() from BudgetContext.
 *
 * Teller Connect widget is web-only. Mobile shows an informational message.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useBank }  from '../context/BankContext';
import { useBudget } from '../context/BudgetContext';
import { useTellerConnect } from '../hooks/useTellerConnect';
import BankAnalysisModal from '../components/BankAnalysisModal';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { typography, spacing, radius, shadows } from '../theme';
import { TellerTransaction } from '../types/teller';
import { CategoryItem } from '../types/budget';
import { txSpendAmount, isTxSpending, isTxTransfer } from '../utils/teller';
import { resolveDisplayCategory, DISPLAY_CATEGORIES, CategoryMeta } from '../utils/categoryMapper';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function simpleUuid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function fmtCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style:                 'currency',
    currency:              'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso: string): string {
  // "2025-03-15" → "Mar 15"
  const [, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

function getDisplayName(tx: TellerTransaction): string {
  return tx.details?.counterparty?.name ?? tx.description ?? '';
}

function isDebit(tx: TellerTransaction): boolean {
  return isTxSpending(tx);
}

// ─── Category picker modal ────────────────────────────────────────────────────

interface ImportModalProps {
  visible:    boolean;
  tx:         TellerTransaction | null;
  categories: CategoryItem[];
  onImport:   (categoryName: string) => void;
  onClose:    () => void;
}

function ImportModal({ visible, tx, categories, onImport, onClose }: ImportModalProps) {
  const { colors } = useTheme();

  if (!tx) return null;

  const amount   = txSpendAmount(tx) || Math.abs(parseFloat(tx.amount));
  const name     = getDisplayName(tx);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={modal.overlay}>
        <View style={[modal.sheet, { backgroundColor: colors.surface }]}>

          {/* Header */}
          <View style={[modal.header, { borderBottomColor: colors.border }]}>
            <Text style={[modal.title, { color: colors.textPrimary }]}>
              Import Transaction
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={[modal.close, { color: colors.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Transaction summary */}
          <View style={[modal.txCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Text style={[modal.txName, { color: colors.textPrimary }]} numberOfLines={2}>
              {name}
            </Text>
            <View style={modal.txMeta}>
              <Text style={[modal.txDate, { color: colors.textMuted }]}>
                {fmtDate(tx.date)}  ·  {tx.accountName}
              </Text>
              <Text style={[modal.txAmount, { color: colors.danger }]}>
                -{fmtCurrency(amount)}
              </Text>
            </View>
          </View>

          {/* Category picker label */}
          <Text style={[modal.pickerLabel, { color: colors.textSecondary }]}>
            Choose a category:
          </Text>

          {/* Category list */}
          <FlatList
            data={categories}
            keyExtractor={(item) => item.id}
            style={modal.list}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onImport(item.name)}
                style={[modal.catRow, { borderBottomColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Text style={modal.catIcon}>{item.icon}</Text>
                <Text style={[modal.catName, { color: colors.textPrimary }]}>
                  {item.name}
                </Text>
                <Text style={[modal.catBudget, { color: colors.textMuted }]}>
                  ${parseFloat(item.amount).toLocaleString()}/mo
                </Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={[modal.empty, { color: colors.textMuted }]}>
                No categories set up yet. Add some in Setup first.
              </Text>
            }
          />

        </View>
      </View>
    </Modal>
  );
}

const modal = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent:  'flex-end',
  },
  sheet: {
    borderTopLeftRadius:  radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight:            '80%',
    paddingBottom:        spacing[8],
  },
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingHorizontal: spacing[6],
    paddingVertical:   spacing[4],
    borderBottomWidth: 1,
  },
  title: {
    fontSize:   typography.md,
    fontWeight: typography.semibold,
  },
  close: {
    fontSize: typography.lg,
  },
  txCard: {
    margin:       spacing[4],
    padding:      spacing[4],
    borderRadius: radius.lg,
    borderWidth:  1,
    gap:          spacing[2],
  },
  txName: {
    fontSize:   typography.base,
    fontWeight: typography.medium,
  },
  txMeta: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  txDate: {
    fontSize: typography.sm,
  },
  txAmount: {
    fontSize:   typography.base,
    fontWeight: typography.semibold,
  },
  pickerLabel: {
    fontSize:          typography.sm,
    fontWeight:        typography.medium,
    paddingHorizontal: spacing[6],
    paddingBottom:     spacing[2],
  },
  list: {
    flexGrow: 0,
  },
  catRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: spacing[6],
    paddingVertical:   spacing[3],
    borderBottomWidth: 1,
    gap:               spacing[3],
  },
  catIcon: {
    fontSize: 20,
  },
  catName: {
    flex:       1,
    fontSize:   typography.base,
    fontWeight: typography.medium,
  },
  catBudget: {
    fontSize: typography.sm,
  },
  empty: {
    padding:   spacing[6],
    textAlign: 'center',
    fontSize:  typography.sm,
  },
});

// ─── Remap category modal ────────────────────────────────────────────────────

interface RemapModalProps {
  visible:   boolean;
  tx:        TellerTransaction | null;
  overrides: Record<string, string>;
  debts:     import('../types/budget').DebtItem[];
  onSelect:  (txId: string, catKey: string) => void;
  onClear:   (txId: string) => void;
  onClose:   () => void;
}

function RemapModal({ visible, tx, overrides, debts, onSelect, onClear, onClose }: RemapModalProps) {
  const { colors } = useTheme();
  const [search,        setSearch]        = useState('');
  const [showDebtPicker, setShowDebtPicker] = useState(false);

  // Reset sub-state when modal closes/opens
  useEffect(() => {
    if (!visible) { setSearch(''); setShowDebtPicker(false); }
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return DISPLAY_CATEGORIES;
    return DISPLAY_CATEGORIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.key.includes(q)
    );
  }, [search]);

  if (!tx) return null;
  const currentKey = overrides[tx.id] ?? null;
  const name       = getDisplayName(tx);

  // ── Debt sub-picker ────────────────────────────────────────────────────────
  if (showDebtPicker) {
    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setShowDebtPicker(false)}>
        <View style={remap.overlay}>
          <View style={[remap.sheet, { backgroundColor: colors.surface }]}>
            <View style={[remap.header, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setShowDebtPicker(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={{ fontSize: 20, color: colors.textMuted }}>←</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: spacing[3] }}>
                <Text style={[remap.title, { color: colors.textPrimary }]}>Which debt?</Text>
                <Text style={[remap.sub, { color: colors.textMuted }]} numberOfLines={1}>{name}</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={[remap.close, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {debts.length === 0 ? (
              <View style={{ padding: spacing[6] }}>
                <Text style={{ color: colors.textMuted, fontSize: typography.sm, textAlign: 'center' }}>
                  No debts set up yet.{'\n'}Add debts in Setup to tag payments here.
                </Text>
              </View>
            ) : (
              <FlatList
                data={debts}
                keyExtractor={(d) => d.id}
                style={remap.list}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const debtKey  = `debt:${item.id}`;
                  const isActive = currentKey === debtKey;
                  const balance  = item.currentBalance
                    ? `$${parseFloat(item.currentBalance).toLocaleString()} remaining`
                    : item.totalAmount
                    ? `$${parseFloat(item.totalAmount).toLocaleString()} total`
                    : `$${parseFloat(item.amount).toLocaleString()}/mo`;
                  return (
                    <TouchableOpacity
                      onPress={() => { onSelect(tx.id, debtKey); setShowDebtPicker(false); onClose(); }}
                      style={[
                        remap.catRow,
                        { borderBottomColor: colors.border },
                        isActive && { backgroundColor: colors.primaryLight },
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={[remap.catIcon, { backgroundColor: '#0891B222' }]}>
                        <Text style={{ fontSize: 16 }}>💳</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[remap.catName, { color: isActive ? colors.primary : colors.textPrimary }]}>
                          {item.name}
                        </Text>
                        <Text style={{ fontSize: typography.xs, color: colors.textMuted }}>{balance}</Text>
                      </View>
                      {isActive && <Text style={{ fontSize: 14, color: colors.primary }}>✓</Text>}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    );
  }

  // ── Main category picker ───────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={remap.overlay}>
        <View style={[remap.sheet, { backgroundColor: colors.surface }]}>

          {/* Header */}
          <View style={[remap.header, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[remap.title, { color: colors.textPrimary }]}>Change Category</Text>
              <Text style={[remap.sub, { color: colors.textMuted }]} numberOfLines={1}>{name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={[remap.close, { color: colors.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={[remap.searchWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Text style={{ fontSize: 14, color: colors.textMuted }}>🔍</Text>
            <TextInput
              style={[remap.searchInput, { color: colors.textPrimary }]}
              placeholder="Search categories…"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
          </View>

          {/* Clear override row (only shown when there's a manual override) */}
          {currentKey && (
            <TouchableOpacity
              style={[remap.clearRow, { borderBottomColor: colors.border }]}
              onPress={() => { onClear(tx.id); onClose(); }}
            >
              <Text style={{ fontSize: 18 }}>↩️</Text>
              <Text style={[remap.clearText, { color: colors.primary }]}>Reset to auto-detected</Text>
            </TouchableOpacity>
          )}

          {/* Category list */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.key}
            style={remap.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              // "Debt Payment" row drills into the debt sub-picker
              if (item.key === 'debt_payment') {
                const isDebtActive = currentKey?.startsWith('debt:');
                return (
                  <TouchableOpacity
                    onPress={() => setShowDebtPicker(true)}
                    style={[
                      remap.catRow,
                      { borderBottomColor: colors.border },
                      isDebtActive && { backgroundColor: colors.primaryLight },
                    ]}
                    activeOpacity={0.7}
                  >
                    <View style={[remap.catIcon, { backgroundColor: '#0891B222' }]}>
                      <Text style={{ fontSize: 16 }}>💳</Text>
                    </View>
                    <Text style={[remap.catName, { color: isDebtActive ? colors.primary : colors.textPrimary }]}>
                      Debt Payment
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>›</Text>
                  </TouchableOpacity>
                );
              }

              const isActive = item.key === currentKey;
              return (
                <TouchableOpacity
                  onPress={() => { onSelect(tx.id, item.key); onClose(); setSearch(''); }}
                  style={[
                    remap.catRow,
                    { borderBottomColor: colors.border },
                    isActive && { backgroundColor: colors.primaryLight },
                  ]}
                  activeOpacity={0.7}
                >
                  <View style={[remap.catIcon, { backgroundColor: item.color + '22' }]}>
                    <Text style={{ fontSize: 16 }}>{item.icon}</Text>
                  </View>
                  <Text style={[remap.catName, { color: isActive ? colors.primary : colors.textPrimary }]}>
                    {item.name}
                  </Text>
                  {isActive && (
                    <Text style={{ fontSize: 14, color: colors.primary }}>✓</Text>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const remap = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:     { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '82%', paddingBottom: spacing[8] },
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[5], paddingVertical: spacing[4], borderBottomWidth: 1, gap: spacing[3] },
  title:     { fontSize: typography.base, fontWeight: typography.semibold },
  sub:       { fontSize: typography.xs, marginTop: 2 },
  close:     { fontSize: typography.lg },
  searchWrap:{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], margin: spacing[4], paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.lg, borderWidth: 1 },
  searchInput:{ flex: 1, fontSize: typography.sm },
  clearRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[5], paddingVertical: spacing[3], borderBottomWidth: 1 },
  clearText: { fontSize: typography.sm, fontWeight: typography.medium },
  list:      { flexGrow: 0 },
  catRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[5], paddingVertical: spacing[3], borderBottomWidth: 1, gap: spacing[3] },
  catIcon:   { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  catName:   { flex: 1, fontSize: typography.sm, fontWeight: typography.medium },
});

// ─── Transaction row ──────────────────────────────────────────────────────────

interface TxRowProps {
  tx:              TellerTransaction;
  overrides:       Record<string, string>;
  debtNames:       Record<string, string>;
  onImport:        (tx: TellerTransaction) => void;
  onRemap:         (tx: TellerTransaction) => void;
  colors:          ReturnType<typeof useTheme>['colors'];
}

function TxRow({ tx, overrides, debtNames, onImport, onRemap, colors }: TxRowProps) {
  const isTransfer = isTxTransfer(tx);
  const catMeta    = resolveDisplayCategory(tx, overrides, debtNames);
  const isManualTransfer = catMeta.key === 'transfer';
  const excluded   = isTransfer || isManualTransfer;

  const debit      = !excluded && isTxSpending(tx);
  const absAmount  = debit ? txSpendAmount(tx) : Math.abs(parseFloat(tx.amount));
  const name       = getDisplayName(tx);
  const hasOverride = !!overrides[tx.id];

  return (
    <View style={[row.container, { borderBottomColor: colors.border, opacity: excluded ? 0.55 : 1 }]}>
      {/* Category icon bubble */}
      <TouchableOpacity
        onPress={() => onRemap(tx)}
        style={[row.iconBubble, { backgroundColor: catMeta.color + '22' }]}
        activeOpacity={0.7}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Text style={row.iconEmoji}>{catMeta.icon}</Text>
      </TouchableOpacity>

      <View style={row.left}>
        <View style={row.nameRow}>
          <Text style={[row.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          {hasOverride && (
            <View style={[row.overrideBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={[row.overrideBadgeText, { color: colors.primary }]}>edited</Text>
            </View>
          )}
        </View>
        <Text style={[row.meta, { color: colors.textMuted }]}>
          {fmtDate(tx.date)}  ·  {catMeta.name}  ·  {tx.accountName}
        </Text>
      </View>

      <View style={row.right}>
        {excluded ? (
          <View style={[row.transferBadge, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[row.transferBadgeText, { color: colors.textMuted }]}>Transfer</Text>
          </View>
        ) : (
          <>
            <Text style={[row.amount, { color: debit ? colors.danger : colors.accent }]}>
              {debit ? '-' : '+'}{fmtCurrency(absAmount)}
            </Text>
            {debit && (
              <TouchableOpacity
                onPress={() => onImport(tx)}
                style={[row.importBtn, { backgroundColor: colors.primaryLight }]}
                activeOpacity={0.8}
              >
                <Text style={[row.importLabel, { color: colors.primary }]}>Import</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const row = StyleSheet.create({
  container: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: spacing[6],
    paddingVertical:   spacing[3],
    borderBottomWidth: 1,
    gap:               spacing[3],
  },
  iconBubble: {
    width:          40,
    height:         40,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  iconEmoji: {
    fontSize: 18,
  },
  left: {
    flex: 1,
    gap:  2,
  },
  name: {
    fontSize:   typography.base,
    fontWeight: typography.medium,
  },
  meta: {
    fontSize: typography.sm,
  },
  right: {
    alignItems: 'flex-end',
    gap:        spacing[1],
  },
  amount: {
    fontSize:   typography.base,
    fontWeight: typography.semibold,
  },
  importBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical:   spacing[1],
    borderRadius:      radius.full,
  },
  importLabel: {
    fontSize:   typography.xs,
    fontWeight: typography.semibold,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing[2],
    flexWrap:      'wrap' as const,
  },
  overrideBadge: {
    paddingHorizontal: 6,
    paddingVertical:   1,
    borderRadius:      radius.full,
  },
  overrideBadgeText: {
    fontSize:   typography.xs,
    fontWeight: typography.medium,
  },
  transferBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical:   spacing[1],
    borderRadius:      radius.full,
  },
  transferBadgeText: {
    fontSize:   typography.xs,
    fontWeight: typography.medium,
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function BankScreen() {
  const { colors }           = useTheme();
  const insets               = useSafeAreaInsets();
  const isDesktop            = useIsDesktop();
  const bank                 = useBank();
  const { budget, addTransaction } = useBudget();
  const { open: openTeller } = useTellerConnect();

  const [selectedTx,      setSelectedTx]      = useState<TellerTransaction | null>(null);
  const [modalVisible,    setModalVisible]    = useState(false);
  const [remapTx,         setRemapTx]         = useState<TellerTransaction | null>(null);
  const [remapVisible,    setRemapVisible]    = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);
  const [analysisVisible, setAnalysisVisible] = useState(false);

  const {
    isConnected, isLoading, institutionName, transactions, justConnected, clearJustConnected,
    categoryOverrides, setCategoryOverride, clearCategoryOverride,
  } = bank;

  // Build debtId → name lookup for resolveDisplayCategory + RemapModal display
  const debtNames = useMemo<Record<string, string>>(
    () => Object.fromEntries(budget.debts.map((d) => [d.id, d.name])),
    [budget.debts],
  );

  // Auto-show analysis modal right after a fresh connection
  useEffect(() => {
    if (justConnected) {
      clearJustConnected();
      setAnalysisVisible(true);
    }
  }, [justConnected, clearJustConnected]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleConnect = useCallback(async () => {
    if (isConnected) {
      if (Platform.OS === 'web') {
        window.alert(`HeadRoom currently supports one connected bank. You're already linked to ${institutionName ?? 'a bank'}. To connect a different bank, disconnect your current one first.`);
      } else {
        Alert.alert(
          'One bank at a time',
          `HeadRoom currently supports one connected bank. You're already linked to ${institutionName ?? 'a bank'}.\n\nTo connect a different bank, disconnect your current one first.`,
          [{ text: 'Got it', style: 'cancel' }],
        );
      }
      return;
    }

    // Try to reactivate a previously disconnected enrollment before opening
    // the Teller widget — avoids consuming a new development enrollment slot.
    const didReconnect = await bank.reconnect();
    if (didReconnect) return;

    openTeller(async (enrollment) => {
      try {
        await bank.connect(enrollment);
      } catch {
        if (Platform.OS === 'web') {
          window.alert('Could not link your bank. Please try again.');
        } else {
          Alert.alert('Connection failed', 'Could not link your bank. Please try again.');
        }
      }
    });
  }, [openTeller, bank, isConnected, institutionName]);

  const handleDisconnect = useCallback(() => {
    const doDisconnect = async () => {
      try {
        await bank.disconnect();
      } catch {
        Alert.alert('Error', 'Could not disconnect. Please try again.');
      }
    };

    if (Platform.OS === 'web') {
      // Alert.alert is unreliable on web (window.confirm is often blocked)
      if (window.confirm('Disconnect your bank? Your imported transactions will remain.')) {
        doDisconnect();
      }
    } else {
      Alert.alert(
        'Disconnect bank',
        'This will remove your bank connection. Your imported transactions will remain.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Disconnect', style: 'destructive', onPress: doDisconnect },
        ],
      );
    }
  }, [bank]);

  const handleImportPress = useCallback((tx: TellerTransaction) => {
    setSelectedTx(tx);
    setModalVisible(true);
  }, []);

  const handleRemapPress = useCallback((tx: TellerTransaction) => {
    setRemapTx(tx);
    setRemapVisible(true);
  }, []);

  const handleImport = useCallback(async (categoryName: string) => {
    if (!selectedTx) return;
    const amount = txSpendAmount(selectedTx) || Math.abs(parseFloat(selectedTx.amount));
    await addTransaction({
      id:           simpleUuid(),
      categoryName,
      amount,
      date:         selectedTx.date,
      note:         getDisplayName(selectedTx),
    } as any);
    setModalVisible(false);
    setSelectedTx(null);
  }, [selectedTx, addTransaction]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await bank.refresh();
    setRefreshing(false);
  }, [bank]);

  // ── Loading state ────────────────────────────────────────────────────────────

  if (isLoading && !refreshing) {
    return (
      <View style={[screen.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[screen.loadingText, { color: colors.textMuted }]}>Loading bank data…</Text>
      </View>
    );
  }

  // ── Not connected state ──────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <View style={[screen.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={[screen.notConnectedContent, isDesktop && screen.notConnectedContentDesktop]}
          showsVerticalScrollIndicator={false}
        >
          {/* Page header */}
          <View style={screen.notConnectedHeader}>
            <Text style={[screen.pageTitle, { color: colors.textPrimary, marginBottom: 0 }]}>Bank</Text>
            <Text style={[screen.pageSubtitle, { color: colors.textMuted }]}>Connect to import transactions</Text>
          </View>

          {/* Connect card */}
          <View style={[card.container, { backgroundColor: colors.surface, borderColor: colors.border }, shadows.md]}>
            <Text style={card.icon}>🏦</Text>
            <Text style={[card.heading, { color: colors.textPrimary }]}>
              Connect your bank
            </Text>
            <Text style={[card.subtext, { color: colors.textSecondary }]}>
              Link your bank account to automatically see your transactions here and import them into your budget categories in one tap.
            </Text>

            {Platform.OS === 'web' ? (
              <TouchableOpacity
                onPress={handleConnect}
                style={[card.button, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <Text style={[card.buttonLabel, { color: colors.textInverse }]}>
                  Connect Bank Account
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[card.mobileNote, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <Text style={[card.mobileNoteText, { color: colors.textSecondary }]}>
                  Bank connection is available on the web version of HeadRoom.
                </Text>
              </View>
            )}

            <Text style={[card.security, { color: colors.textMuted }]}>
              Uses Teller — bank-level 256-bit encryption
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Connected state ──────────────────────────────────────────────────────────

  return (
    <View style={[screen.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>

      {/* Header */}
      <View style={[screen.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }, isDesktop && screen.headerDesktop]}>
        <View style={screen.headerLeft}>
          <Text style={[screen.pageTitle, { color: colors.textPrimary, marginBottom: 0 }]}>Bank</Text>
          {/* Connected badge */}
          <View style={[badge.container, { backgroundColor: colors.accentLight }]}>
            <View style={[badge.dot, { backgroundColor: colors.accent }]} />
            <Text style={[badge.label, { color: colors.accentDark }]} numberOfLines={1}>
              {institutionName ?? 'Connected'}
            </Text>
          </View>
        </View>

        <View style={screen.headerRight}>
          <TouchableOpacity
            onPress={() => setAnalysisVisible(true)}
            style={[screen.analyzeBtn, { backgroundColor: colors.primaryLight }]}
            activeOpacity={0.8}
          >
            <Text style={[screen.analyzeLabel, { color: colors.primary }]}>✦ Analyze</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDisconnect}
            style={[screen.disconnectBtn, { borderColor: colors.danger }]}
            activeOpacity={0.8}
          >
            <Text style={[screen.disconnectLabel, { color: colors.danger }]}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Transactions list */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={isDesktop ? screen.txListDesktop : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {transactions.length === 0 ? (
          <View style={screen.emptyState}>
            <Text style={[screen.emptyText, { color: colors.textMuted }]}>
              No transactions found yet.{'\n'}Pull down to refresh.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[txList.sectionLabel, { color: colors.textSecondary }, isDesktop && txList.sectionLabelDesktop]}>
              Recent Transactions
            </Text>
            {transactions.map((tx) => (
              <TxRow
                key={tx.id}
                tx={tx}
                overrides={categoryOverrides}
                debtNames={debtNames}
                onImport={handleImportPress}
                onRemap={handleRemapPress}
                colors={colors}
              />
            ))}
            <View style={{ height: spacing[8] }} />
          </>
        )}
      </ScrollView>

      {/* Import modal */}
      <ImportModal
        visible={modalVisible}
        tx={selectedTx}
        categories={budget.categories}
        onImport={handleImport}
        onClose={() => { setModalVisible(false); setSelectedTx(null); }}
      />

      {/* Remap category modal */}
      <RemapModal
        visible={remapVisible}
        tx={remapTx}
        overrides={categoryOverrides}
        debts={budget.debts}
        onSelect={setCategoryOverride}
        onClear={clearCategoryOverride}
        onClose={() => { setRemapVisible(false); setRemapTx(null); }}
      />

      {/* Bank analysis modal */}
      <BankAnalysisModal
        visible={analysisVisible}
        onClose={() => setAnalysisVisible(false)}
      />

    </View>
  );
}

// ─── Screen-level styles ──────────────────────────────────────────────────────

const screen = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    gap:            spacing[3],
  },
  loadingText: {
    fontSize: typography.sm,
  },
  notConnectedContent: {
    flexGrow:          1,
    paddingHorizontal: spacing[6],
    paddingTop:        spacing[5],
    paddingBottom:     spacing[10],
  },
  notConnectedContentDesktop: {
    paddingHorizontal: spacing[8],
    paddingTop:        spacing[6],
    maxWidth:          640,
    alignSelf:         'center' as const,
    width:             '100%' as any,
  },
  notConnectedHeader: {
    gap:          4,
    marginBottom: spacing[5],
  },
  pageTitle: {
    fontSize:   typography['2xl'],
    fontWeight: typography.bold,
    marginTop:  0,
  },
  pageSubtitle: {
    fontSize:  typography.sm,
    marginTop: 2,
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: spacing[6],
    paddingVertical:   spacing[3],
    borderBottomWidth: 1,
    gap:               spacing[3],
  },
  headerDesktop: {
    paddingHorizontal: spacing[8],
    paddingVertical:   spacing[4],
  },
  headerLeft: {
    flex:      1,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing[3],
    flexWrap:      'wrap',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing[2],
  },
  analyzeBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical:   spacing[2],
    borderRadius:      radius.md,
  },
  analyzeLabel: {
    fontSize:   typography.sm,
    fontWeight: typography.semibold,
  },
  disconnectBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical:   spacing[2],
    borderRadius:      radius.md,
    borderWidth:       1,
  },
  disconnectLabel: {
    fontSize:   typography.sm,
    fontWeight: typography.semibold,
  },
  emptyState: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    paddingTop:     spacing[16],
    paddingHorizontal: spacing[6],
  },
  emptyText: {
    fontSize:  typography.base,
    textAlign: 'center',
    lineHeight: typography.base * typography.relaxed,
  },
  txListDesktop: {
    paddingHorizontal: spacing[2],
  },
});

const card = StyleSheet.create({
  container: {
    borderRadius:      radius.xl,
    borderWidth:       1,
    padding:           spacing[8],
    alignItems:        'center',
    gap:               spacing[4],
  },
  icon: {
    fontSize: 48,
  },
  heading: {
    fontSize:   typography.xl,
    fontWeight: typography.bold,
    textAlign:  'center',
  },
  subtext: {
    fontSize:   typography.base,
    textAlign:  'center',
    lineHeight: typography.base * typography.relaxed,
  },
  button: {
    width:             '100%',
    paddingVertical:   spacing[4],
    borderRadius:      radius.lg,
    alignItems:        'center',
    marginTop:         spacing[2],
  },
  buttonLabel: {
    fontSize:   typography.base,
    fontWeight: typography.semibold,
  },
  mobileNote: {
    width:        '100%',
    padding:      spacing[4],
    borderRadius: radius.lg,
    borderWidth:  1,
    marginTop:    spacing[2],
  },
  mobileNoteText: {
    fontSize:  typography.sm,
    textAlign: 'center',
    lineHeight: typography.sm * typography.relaxed,
  },
  security: {
    fontSize: typography.xs,
  },
});

const badge = StyleSheet.create({
  container: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical:   spacing[1],
    borderRadius:      radius.full,
  },
  dot: {
    width:        7,
    height:       7,
    borderRadius: radius.full,
  },
  label: {
    fontSize:   typography.xs,
    fontWeight: typography.semibold,
  },
});

const txList = StyleSheet.create({
  sectionLabel: {
    fontSize:          typography.xs,
    fontWeight:        typography.semibold,
    letterSpacing:     0.5,
    textTransform:     'uppercase' as const,
    paddingHorizontal: spacing[6],
    paddingTop:        spacing[5],
    paddingBottom:     spacing[2],
  },
  sectionLabelDesktop: {
    paddingHorizontal: spacing[8],
  },
});
