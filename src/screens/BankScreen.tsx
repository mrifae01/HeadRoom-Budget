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

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  FlatList,
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
import { typography, spacing, radius, shadows } from '../theme';
import { TellerTransaction } from '../types/teller';
import { CategoryItem } from '../types/budget';

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
  return parseFloat(tx.amount) < 0;
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

  const amount   = Math.abs(parseFloat(tx.amount));
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

// ─── Transaction row ──────────────────────────────────────────────────────────

interface TxRowProps {
  tx:       TellerTransaction;
  onImport: (tx: TellerTransaction) => void;
  colors:   ReturnType<typeof useTheme>['colors'];
}

function TxRow({ tx, onImport, colors }: TxRowProps) {
  const amount    = parseFloat(tx.amount);
  const debit     = amount < 0;
  const absAmount = Math.abs(amount);
  const name      = getDisplayName(tx);

  return (
    <View style={[row.container, { borderBottomColor: colors.border }]}>
      <View style={row.left}>
        <Text style={[row.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[row.meta, { color: colors.textMuted }]}>
          {fmtDate(tx.date)}  ·  {tx.accountName}
        </Text>
      </View>

      <View style={row.right}>
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
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function BankScreen() {
  const { colors }           = useTheme();
  const insets               = useSafeAreaInsets();
  const bank                 = useBank();
  const { budget, addTransaction } = useBudget();
  const { open: openTeller } = useTellerConnect();

  const [selectedTx,      setSelectedTx]      = useState<TellerTransaction | null>(null);
  const [modalVisible,    setModalVisible]    = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);
  const [analysisVisible, setAnalysisVisible] = useState(false);

  const { isConnected, isLoading, institutionName, transactions, justConnected, clearJustConnected } = bank;

  // Auto-show analysis modal right after a fresh connection
  useEffect(() => {
    if (justConnected) {
      clearJustConnected();
      setAnalysisVisible(true);
    }
  }, [justConnected, clearJustConnected]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleConnect = useCallback(() => {
    if (isConnected) {
      Alert.alert(
        'One bank at a time',
        `HeadRoom currently supports one connected bank. You're already linked to ${institutionName ?? 'a bank'}.\n\nTo connect a different bank, disconnect your current one first.`,
        [{ text: 'Got it', style: 'cancel' }],
      );
      return;
    }
    openTeller(async (enrollment) => {
      try {
        await bank.connect(enrollment);
      } catch {
        Alert.alert('Connection failed', 'Could not link your bank. Please try again.');
      }
    });
  }, [openTeller, bank, isConnected, institutionName]);

  const handleDisconnect = useCallback(() => {
    Alert.alert(
      'Disconnect bank',
      'This will remove your bank connection. Your imported transactions will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await bank.disconnect();
            } catch {
              Alert.alert('Error', 'Could not disconnect. Please try again.');
            }
          },
        },
      ],
    );
  }, [bank]);

  const handleImportPress = useCallback((tx: TellerTransaction) => {
    setSelectedTx(tx);
    setModalVisible(true);
  }, []);

  const handleImport = useCallback(async (categoryName: string) => {
    if (!selectedTx) return;
    const amount = Math.abs(parseFloat(selectedTx.amount));
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
          contentContainerStyle={screen.notConnectedContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Page title */}
          <Text style={[screen.pageTitle, { color: colors.textPrimary }]}>Bank</Text>

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
      <View style={[screen.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
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
            <Text style={[txList.sectionLabel, { color: colors.textSecondary }]}>
              Recent Transactions
            </Text>
            {transactions.map((tx) => (
              <TxRow
                key={tx.id}
                tx={tx}
                onImport={handleImportPress}
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
    paddingBottom:     spacing[10],
  },
  pageTitle: {
    fontSize:     typography.xl,
    fontWeight:   typography.bold,
    marginBottom: spacing[6],
    marginTop:    spacing[4],
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: spacing[6],
    paddingVertical:   spacing[4],
    borderBottomWidth: 1,
    gap:               spacing[3],
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
});
