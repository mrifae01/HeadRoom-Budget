/**
 * Teller transaction sign-convention helpers.
 *
 * Teller uses opposite signs depending on account type:
 *   Depository / checking  — negative = spending, positive = income/deposit
 *   Credit card            — positive = charge (spending), negative = payment/refund
 *
 * Always use these helpers instead of checking `amount < 0` directly.
 */

import { TellerTransaction } from '../types/teller';

/** Returns the spending amount as a positive number, or 0 if this is not a spending transaction. */
export function txSpendAmount(tx: TellerTransaction): number {
  const raw = parseFloat(tx.amount);
  if (tx.accountType === 'credit') {
    return raw > 0 ? raw : 0;   // credit card charge = positive
  }
  return raw < 0 ? Math.abs(raw) : 0; // debit/checking spend = negative
}

/** True if this transaction represents money being spent. */
export function isTxSpending(tx: TellerTransaction): boolean {
  return txSpendAmount(tx) > 0;
}

/** True if this transaction is income / a credit to the account (not spending). */
export function isTxIncome(tx: TellerTransaction): boolean {
  const raw = parseFloat(tx.amount);
  if (tx.accountType === 'credit') {
    return raw < 0; // payment/refund reduces credit balance
  }
  return raw > 0;   // deposit on checking
}

/**
 * True if this transaction is an INTERNAL transfer between the user's own
 * accounts (e.g. checking → savings) and should NOT count as spending or income.
 *
 * KEY DESIGN: we are deliberately conservative here.
 * External "transfers" — Venmo, PayPal, Zelle, eBay payments, ACH paychecks,
 * Cash App, etc. — are REAL money movement and must NOT be excluded.
 * We only exclude transactions that are clearly moving money between the same
 * person's own bank accounts.
 *
 * Detection strategy (all three conditions must be consistent):
 *
 *   STEP 1 — Always pass through known external services.
 *             If the description or counterparty name contains a known
 *             peer-to-peer / payment service, it is never an internal transfer.
 *
 *   STEP 2 — Look for the bank's own masked-account-number fingerprint.
 *             Banks like Capital One, Chase, etc. stamp internal transfer
 *             descriptions with the masked destination account (XXXXXX2412).
 *             If we see that pattern AND the description prefix matches
 *             "Withdrawal to / Deposit from / Transfer to …", it's internal.
 *
 *   STEP 3 — If Teller marks type='transfer' AND details.category='transfer'
 *             AND there is no known external-service counterparty, treat it
 *             as internal. (Teller sets both flags for same-bank book transfers.)
 */

/** External payment / marketplace services that are never internal transfers. */
const EXTERNAL_TRANSFER_KEYWORDS = [
  'venmo', 'paypal', 'zelle', 'cash app', 'cashapp', 'square cash',
  'ebay', 'etsy', 'amazon pay', 'apple pay', 'google pay',
  'payroll', 'direct deposit', 'ach deposit', 'ach credit',
  'adp', 'gusto', 'paychex', 'bamboohr', 'rippling',
  'commission', 'salary', 'wages', 'stipend', 'bonus',
  'refund', 'reimbursement',
];

/**
 * Account-number mask pattern. Banks universally mask account numbers in
 * internal transfer descriptions using repeated X characters followed by
 * the last few digits, OR the word "account/acct" followed by digits.
 * This regex is fully generic — it does NOT match any specific account number.
 * e.g. "XXXXXX1234", "XXXXXXX9999", "Acct #5678" all match.
 */
const ACCOUNT_MASK_RE = /x{3,}\d*|(?:acct|account)[\s#]*\d{4,}/i;

/** Description prefixes that, combined with an account mask, signal internal transfers. */
const INTERNAL_DESC_RE =
  /^(withdrawal to |deposit from |transfer to |transfer from |online transfer |mobile transfer |internal transfer )/i;

export function isTxTransfer(tx: TellerTransaction): boolean {
  const desc       = tx.description ?? '';
  const merchant   = tx.details?.counterparty?.name ?? '';
  const combined   = (desc + ' ' + merchant).toLowerCase();

  // STEP 1 — external service → always real money movement, never internal
  if (EXTERNAL_TRANSFER_KEYWORDS.some((kw) => combined.includes(kw))) return false;

  // STEP 2 — description prefix + masked account number = definitely internal
  const hasMask = ACCOUNT_MASK_RE.test(desc);
  if (hasMask && INTERNAL_DESC_RE.test(desc)) return true;

  // STEP 3 — Teller explicitly labels it as a transfer on both fields AND
  //           there is no external counterparty name (book transfer between own accounts)
  const tellerSaysTransfer =
    tx.type === 'transfer' && tx.details?.category === 'transfer';
  if (tellerSaysTransfer && !merchant) return true;

  return false;
}
