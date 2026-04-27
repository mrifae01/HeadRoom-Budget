/**
 * teller.ts — TypeScript interfaces for the Teller banking API.
 *
 * The access token never touches the frontend — all Teller API calls are
 * proxied through the backend. These types describe the *response shapes*
 * returned by our own Express endpoints.
 */

export interface TellerAccount {
  id: string;
  name: string;
  type: string;       // 'depository' | 'credit'
  subtype: string;    // 'checking' | 'savings' | 'credit_card' | etc.
  status: string;
  currency: string;
  last_four: string;
  institution: { id: string; name: string };
  enrollment_id: string;
  links: { self: string; balances: string; transactions: string };
  /** Current balances. For credit accounts `ledger` is the amount currently owed. */
  balance?: {
    available: string | null;
    ledger:    string | null;
  };
}

export interface TellerTransaction {
  id: string;
  account_id: string;
  /** Injected by the backend — the friendly account name */
  accountName: string;
  /** Injected by the backend — the account type (depository, credit, etc.) */
  accountType: string;
  /** ISO date string: "YYYY-MM-DD" */
  date: string;
  description: string;
  /**
   * Dollar amount as a string.
   * Negative = debit / spending (e.g. "-24.50")
   * Positive = credit / income (e.g. "2500.00")
   */
  amount: string;
  type: string;
  status: string;
  details: {
    processing_status: string;
    category?: string | null;
    counterparty?: { name: string; type: string } | null;
  };
  running_balance: string | null;
}

export interface TellerEnrollment {
  accessToken: string;
  user: { id: string };
  enrollment: { id: string; institution: { name: string } };
}
