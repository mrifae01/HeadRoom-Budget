/**
 * Headroom AI Advisor — Express backend
 *
 * POST /api/chat
 *   Body:  { messages: ClaudeMessage[], budgetContext: BudgetContext }
 *   Reply: { text: string, adjustments: Adjustment[] | null }
 *
 * Uses Claude's tool-use feature so the AI can propose structured budget
 * adjustments that the app renders as interactive visualisation cards.
 */

require('dotenv').config();
const Sentry    = require('@sentry/node');
const express   = require('express');
const cors      = require('cors');
const { Agent: UndiciAgent } = require('undici');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk/index.js');
const { createClient } = require('@supabase/supabase-js');
const { Resend }       = require('resend');

// ─── Sentry (must init before any other imports that may throw) ───────────────

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'production',
    tracesSampleRate: 0.2,
  });
}

// ─── Resend email client ──────────────────────────────────────────────────────

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = 'HeadRoom <hello@headroombudget.com>';

// ─── Supabase admin client (service role — never exposed to frontend) ──────────

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ─── Teller helpers ────────────────────────────────────────────────────────────

// Decode base64 certificates from env vars (works locally and on Railway).
// In development + production environments Teller requires mTLS — every request
// to api.teller.io must present the client certificate issued by Teller.
// Falls back to no dispatcher for sandbox (no cert required).
const tellerDispatcher = (process.env.TELLER_CERT && process.env.TELLER_KEY)
  ? new UndiciAgent({
      connect: {
        cert: Buffer.from(process.env.TELLER_CERT, 'base64').toString('utf8'),
        key:  Buffer.from(process.env.TELLER_KEY,  'base64').toString('utf8'),
      },
    })
  : undefined;

function tellerAuth(accessToken) {
  return 'Basic ' + Buffer.from(accessToken + ':').toString('base64');
}

async function tellerFetch(path, accessToken) {
  const options = {
    headers: { Authorization: tellerAuth(accessToken) },
    ...(tellerDispatcher ? { dispatcher: tellerDispatcher } : {}),
  };
  const res = await fetch(`https://api.teller.io${path}`, options);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Teller ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

async function getUserId(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(auth.slice(7));
  if (error || !user) return null;
  return user.id;
}

// ─── Rate limiters ────────────────────────────────────────────────────────────

// For /api/chat — no auth on this route, so key by IP.
// 40 messages per hour is generous for real users; blocks runaway abuse.
const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages. Please wait a moment before trying again.' },
});

// For authenticated routes — key by Authorization header (unique per user session).
// Covers normal Teller polling (accounts + transactions on app load).
const tellerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.headers.authorization || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// For expensive one-shot operations (bank analysis, enroll, disconnect).
// These hit both Teller and Claude — keep the daily budget tight.
const expensiveLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.headers.authorization || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Daily limit reached for this operation. Try again tomorrow.' },
});

// For public endpoints (capacity check, waitlist) — IP only, tight window.
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// ─── Setup ────────────────────────────────────────────────────────────────────

const app    = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ─── Tool definition ──────────────────────────────────────────────────────────
// When Claude decides to propose budget changes it MUST call this tool.
// The app picks up the structured `adjustments` array and renders
// the visual "Budget Adjustment Summary" card.

const BUDGET_TOOL = {
  name: 'suggest_budget_adjustments',
  description: `Call this tool whenever you want to propose specific dollar changes
to the user's budget categories. The app will render a visual adjustment card
so the user can one-tap accept or dismiss your proposal. Always call this tool
for concrete budget changes — never just describe numbers in plain text.`,
  input_schema: {
    type: 'object',
    properties: {
      adjustments: {
        type: 'array',
        description: 'List of categories to change. Only include categories that actually change.',
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Exact category name as it appears in the user\'s budget.',
            },
            from: {
              type: 'number',
              description: 'Current monthly budget for this category (whole dollars).',
            },
            to: {
              type: 'number',
              description: 'Proposed new monthly budget (whole dollars).',
            },
          },
          required: ['category', 'from', 'to'],
        },
      },
    },
    required: ['adjustments'],
  },
};

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(ctx) {
  const { incomeSources = [], categories = [], debts = [], transactions = [] } = ctx;

  const totalIncome  = incomeSources.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const totalDebt    = debts.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
  const spendable    = Math.max(totalIncome - totalDebt, 0);
  const totalBudgeted = categories.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);

  const incomeLines = incomeSources.length
    ? incomeSources.map(i => `  • ${i.name}: $${parseFloat(i.amount || 0).toLocaleString()}/mo`).join('\n')
    : '  • None set up';

  const debtLines = debts.length
    ? debts.map(d => {
        const monthly = parseFloat(d.amount || 0);
        const total   = parseFloat(d.totalAmount || 0);
        const forecast = monthly > 0 && total > 0
          ? ` — paid off in ~${Math.ceil(total / monthly)} months`
          : '';
        return `  • ${d.name}: $${monthly.toLocaleString()}/mo${forecast}`;
      }).join('\n')
    : '  • None';

  const categoryLines = categories.length
    ? categories.map(c => `  • ${c.icon} ${c.name}: $${parseFloat(c.amount || 0).toLocaleString()}/mo`).join('\n')
    : '  • No categories set up';

  // Most recent 20 transactions only — keeps tokens lean
  const recent = [...transactions]
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .slice(0, 20);

  const txLines = recent.length
    ? recent.map(t => `  • ${t.date}  ${t.categoryName}  -$${t.amount}${t.note ? `  (${t.note})` : ''}`).join('\n')
    : '  • No transactions recorded yet';

  return `You are a sharp, friendly personal finance assistant embedded in Headroom — a mobile budgeting app.

════ USER'S BUDGET SNAPSHOT ════

Monthly Income:    $${totalIncome.toLocaleString()}
Debt Payments:    -$${totalDebt.toLocaleString()}/mo
Spendable Budget:  $${spendable.toLocaleString()}/mo
Total Budgeted:    $${totalBudgeted.toLocaleString()}/mo

Income Sources:
${incomeLines}

Debt Obligations:
${debtLines}

Budget Categories (monthly limits):
${categoryLines}

Recent Transactions:
${txLines}

════ YOUR BEHAVIOUR ════

• Be concise, warm, and direct — no filler phrases.
• When the user asks to change, adjust, optimise, or rebalance their budget,
  ALWAYS call the suggest_budget_adjustments tool. This renders a visual card
  in the app. Only include categories that are actually changing.
• After calling the tool, write 1–3 sentences explaining your reasoning.
• Dollar amounts must be whole numbers (no cents).
• Never reference categories that don't exist in the user's budget.
• If the user asks a general question or wants analysis, answer directly — no tool call.
• If the numbers don't add up cleanly, acknowledge the trade-off honestly.`;
}

// ─── Chat endpoint ────────────────────────────────────────────────────────────

app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { messages, budgetContext } = req.body;

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
      return res.status(400).json({ error: '`messages` must be a non-empty array with at most 50 items.' });
    }

    const validRoles = new Set(['user', 'assistant']);
    for (const msg of messages) {
      if (!validRoles.has(msg?.role) || typeof msg?.content !== 'string' || msg.content.length > 4000) {
        return res.status(400).json({ error: 'Each message must have role "user" or "assistant" and content under 4000 characters.' });
      }
    }

    if (!budgetContext || typeof budgetContext !== 'object' || Array.isArray(budgetContext)) {
      return res.status(400).json({ error: '`budgetContext` must be an object.' });
    }

    const { incomeSources = [], categories = [], debts = [], transactions = [] } = budgetContext;
    if (!Array.isArray(incomeSources) || !Array.isArray(categories) || !Array.isArray(debts) || !Array.isArray(transactions)) {
      return res.status(400).json({ error: '`budgetContext` fields must be arrays.' });
    }

    const systemPrompt = buildSystemPrompt(budgetContext);

    // ── First call — Claude may produce text, call the tool, or both ──────────
    const resp1 = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 1024,
      system:     systemPrompt,
      tools:      [BUDGET_TOOL],
      messages,
    });

    let text        = '';
    let adjustments = null;
    let toolBlock   = null;

    for (const block of resp1.content) {
      if (block.type === 'text')     text       += block.text;
      if (block.type === 'tool_use') toolBlock   = block;
    }

    if (toolBlock) {
      adjustments = toolBlock.input.adjustments ?? null;
    }

    // ── If Claude used the tool but gave no pre-text, do a follow-up call ─────
    // (Claude sometimes speaks AFTER the tool result rather than before it)
    if (toolBlock && !text.trim()) {
      const resp2 = await client.messages.create({
        model:      'claude-haiku-4-5',
        max_tokens: 512,
        system:     systemPrompt,
        // Don't pass tools — we just want Claude's plain explanation
        messages: [
          ...messages,
          { role: 'assistant', content: resp1.content },
          {
            role: 'user',
            content: [{
              type:        'tool_result',
              tool_use_id: toolBlock.id,
              content:     'Adjustments rendered in app.',
            }],
          },
        ],
      });

      for (const block of resp2.content) {
        if (block.type === 'text') text += block.text;
      }
    }

    res.json({
      text:        text.trim() || "Here's what I'd propose:",
      adjustments,
    });

  } catch (err) {
    console.error('[/api/chat]', err?.status, err?.message);
    const status  = err?.status ?? 500;
    const message = err?.status === 401
      ? 'Invalid API key — check your ANTHROPIC_API_KEY in .env'
      : 'Something went wrong on the AI server. Please try again.';
    res.status(status).json({ error: message });
  }
});

// ─── Teller routes ────────────────────────────────────────────────────────────

/**
 * POST /api/teller/enroll
 * Body: { accessToken, institutionName, enrollmentId }
 * Verifies the token against Teller, then upserts enrollment into Supabase.
 */
app.post('/api/teller/enroll', expensiveLimiter, async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { accessToken, institutionName, enrollmentId } = req.body;
    if (!accessToken || !institutionName || !enrollmentId) {
      return res.status(400).json({ error: 'accessToken, institutionName and enrollmentId are required' });
    }

    // Verify the token actually works before storing it
    await tellerFetch('/accounts', accessToken);

    const { error } = await supabaseAdmin
      .from('teller_enrollments')
      .upsert(
        {
          user_id:          userId,
          access_token:     accessToken,
          institution_name: institutionName,
          enrollment_id:    enrollmentId,
        },
        { onConflict: 'user_id' },
      );

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/teller/enroll]', err?.message);
    res.status(500).json({ error: err?.message ?? 'Enrollment failed' });
  }
});

/**
 * GET /api/teller/accounts
 * Returns connected accounts or { accounts: [], connected: false }.
 */
app.get('/api/teller/accounts', tellerLimiter, async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { data: enrollment, error } = await supabaseAdmin
      .from('teller_enrollments')
      .select('access_token, institution_name')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!enrollment) {
      return res.json({ accounts: [], connected: false });
    }

    const accounts = await tellerFetch('/accounts', enrollment.access_token);

    res.json({
      accounts,
      institutionName: enrollment.institution_name,
      connected: true,
    });
  } catch (err) {
    console.error('[GET /api/teller/accounts]', err?.message);
    res.status(500).json({ error: err?.message ?? 'Failed to fetch accounts' });
  }
});

/**
 * GET /api/teller/transactions
 * Fetches transactions for all connected accounts, merges, sorts, returns first 90.
 */
app.get('/api/teller/transactions', tellerLimiter, async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { data: enrollment, error } = await supabaseAdmin
      .from('teller_enrollments')
      .select('access_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!enrollment) return res.json({ transactions: [] });

    const accounts = await tellerFetch('/accounts', enrollment.access_token);

    const txArrays = await Promise.all(
      accounts.map(async (account) => {
        const txs = await tellerFetch(`/accounts/${account.id}/transactions`, enrollment.access_token);
        return txs.map((tx) => ({
          ...tx,
          accountName: account.name,
          accountType: account.type,
        }));
      }),
    );

    const merged = txArrays
      .flat()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 90);

    res.json({ transactions: merged });
  } catch (err) {
    console.error('[GET /api/teller/transactions]', err?.message);
    res.status(500).json({ error: err?.message ?? 'Failed to fetch transactions' });
  }
});

/**
 * DELETE /api/teller/disconnect
 * Removes the enrollment record for the authenticated user.
 */
app.delete('/api/teller/disconnect', expensiveLimiter, async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { error } = await supabaseAdmin
      .from('teller_enrollments')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/teller/disconnect]', err?.message);
    res.status(500).json({ error: err?.message ?? 'Disconnect failed' });
  }
});

// ─── Bank analysis route ──────────────────────────────────────────────────────

const BUDGET_SETUP_TOOL = {
  name: 'suggest_budget_setup',
  description: `Analyze the user's real bank transactions and suggest a complete
budget setup. Map spending to the 12 preset categories exactly as listed.
Always call this tool — never describe numbers in plain text.`,
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'A 2-3 sentence plain-English summary of what you found and why you made these suggestions.',
      },
      incomeSources: {
        type: 'array',
        description: 'Detected recurring income or savings sources.',
        items: {
          type: 'object',
          properties: {
            name:   { type: 'string', description: 'Descriptive label, e.g. "Direct Deposit".' },
            amount: { type: 'string', description: 'Monthly amount as a whole-dollar string, e.g. "3200".' },
            type:   { type: 'string', enum: ['income', 'no_income'], description: '"income" for paycheck/salary, "no_income" for savings draw.' },
          },
          required: ['name', 'amount', 'type'],
        },
      },
      categories: {
        type: 'array',
        description: 'Suggested monthly budget limits. Only include categories from this exact list: Rent/Mortgage, Groceries, Utilities, Transportation, Car/Gas, Dining Out, Entertainment, Fun, Insurance, Child, Pet, Other/Misc.',
        items: {
          type: 'object',
          properties: {
            name:   { type: 'string', description: 'Exact category name from the allowed list.' },
            amount: { type: 'string', description: 'Monthly budget limit as a whole-dollar string.' },
          },
          required: ['name', 'amount'],
        },
      },
      debts: {
        type: 'array',
        description: 'Detected recurring debt or loan payments.',
        items: {
          type: 'object',
          properties: {
            name:        { type: 'string', description: 'Debt name, e.g. "Student Loan".' },
            amount:      { type: 'string', description: 'Monthly payment as a whole-dollar string.' },
            totalAmount: { type: 'string', description: 'Estimated total balance if determinable, else omit.' },
          },
          required: ['name', 'amount'],
        },
      },
    },
    required: ['summary', 'incomeSources', 'categories', 'debts'],
  },
};

/**
 * POST /api/bank/analyze
 * Fetches the user's Teller transactions, sends them to Claude, and returns
 * structured budget suggestions.
 */
app.post('/api/bank/analyze', expensiveLimiter, async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { data: enrollment, error: dbErr } = await supabaseAdmin
      .from('teller_enrollments')
      .select('access_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (dbErr) throw dbErr;
    if (!enrollment) return res.status(400).json({ error: 'No bank connected' });

    // Fetch accounts + transactions
    const accounts = await tellerFetch('/accounts', enrollment.access_token);
    const txArrays = await Promise.all(
      accounts.map(async (account) => {
        const txs = await tellerFetch(`/accounts/${account.id}/transactions`, enrollment.access_token);
        return txs.map((tx) => ({ ...tx, accountName: account.name }));
      }),
    );
    const transactions = txArrays
      .flat()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 60);

    const txLines = transactions
      .map((t) => {
        const amt    = parseFloat(t.amount);
        const sign   = amt < 0 ? '-' : '+';
        const name   = t.details?.counterparty?.name ?? t.description ?? '';
        return `${t.date}  ${sign}$${Math.abs(amt).toFixed(2)}  ${name}  (${t.accountName})`;
      })
      .join('\n');

    const systemPrompt = `You are a personal finance analyst. Analyze the bank transactions below and
call suggest_budget_setup with a complete budget suggestion.

ALLOWED CATEGORIES (use exact names only):
Rent/Mortgage, Groceries, Utilities, Transportation, Car/Gas, Dining Out,
Entertainment, Fun, Insurance, Child, Pet, Other/Misc

TRANSACTIONS (most recent first):
${txLines}

Rules:
• Whole-dollar amounts only (no cents).
• Identify recurring credits as income sources.
• Identify recurring fixed payments (loans, subscriptions) as debts if they look like financing.
• Map all spending to the 12 allowed categories; use Other/Misc as a catch-all.
• Be conservative — suggest limits slightly above observed spending.`;

    const resp = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 1024,
      system:     systemPrompt,
      tools:      [BUDGET_SETUP_TOOL],
      tool_choice: { type: 'any' },
      messages:   [{ role: 'user', content: 'Please analyze my transactions and suggest a budget setup.' }],
    });

    const toolBlock = resp.content.find((b) => b.type === 'tool_use');
    if (!toolBlock) return res.status(500).json({ error: 'No analysis returned' });

    const { summary, incomeSources, categories, debts } = toolBlock.input;
    res.json({ summary, incomeSources, categories, debts });
  } catch (err) {
    console.error('[POST /api/bank/analyze]', err?.message);
    res.status(500).json({ error: err?.message ?? 'Analysis failed' });
  }
});

// ─── Account deletion ─────────────────────────────────────────────────────────

/**
 * DELETE /api/auth/account
 * Permanently deletes all user data and the auth account itself.
 * Order: transactions → monthly_records → teller_enrollments → budgets → auth user
 */
app.delete('/api/auth/account', expensiveLimiter, async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await supabaseAdmin.from('transactions').delete().eq('user_id', userId);
    await supabaseAdmin.from('monthly_records').delete().eq('user_id', userId);
    await supabaseAdmin.from('teller_enrollments').delete().eq('user_id', userId);
    await supabaseAdmin.from('budgets').delete().eq('user_id', userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/auth/account]', err?.message);
    res.status(500).json({ error: 'Failed to delete account. Please try again.' });
  }
});

// ─── Capacity check ───────────────────────────────────────────────────────────

const USER_CAP = 100;

/**
 * GET /api/auth/capacity
 * Public — no auth required (called before a user has an account).
 * Returns { atCapacity: boolean, count: number }.
 */
app.get('/api/auth/capacity', publicLimiter, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;
    const count = data?.users?.length ?? 0;
    res.json({ atCapacity: count >= USER_CAP, count });
  } catch (err) {
    console.error('[GET /api/auth/capacity]', err?.message);
    res.status(500).json({ error: 'Could not check capacity.' });
  }
});

// ─── Waitlist ─────────────────────────────────────────────────────────────────

/**
 * POST /api/waitlist
 * Public — no auth required.
 * Body: { email: string }
 * Stores email in the waitlist table. Silently succeeds on duplicate.
 */
app.post('/api/waitlist', publicLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (
      !email ||
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      email.length > 254
    ) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const { error } = await supabaseAdmin
      .from('waitlist')
      .insert({ email: email.trim().toLowerCase() });

    // Unique constraint violation = already on list. Still return ok — don't
    // reveal whether an email was previously registered.
    if (error && error.code !== '23505') throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/waitlist]', err?.message);
    res.status(500).json({ error: 'Could not save your email. Please try again.' });
  }
});

// ─── Admin middleware ─────────────────────────────────────────────────────────
// Protects all /admin/* routes with a secret key set in Railway env vars.

function requireAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

const adminLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests.' },
});

// ─── Admin: stats ────────────────────────────────────────────────────────────

app.get('/admin/email/stats', adminLimiter, requireAdminKey, async (_req, res) => {
  try {
    const { data: waitlist, error } = await supabaseAdmin
      .from('waitlist')
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    res.json({ waitlistCount: waitlist?.length ?? 0 });
  } catch (err) {
    console.error('[GET /admin/email/stats]', err?.message);
    res.status(500).json({ error: 'Could not fetch stats.' });
  }
});

// ─── Admin: email waitlist ────────────────────────────────────────────────────

/**
 * POST /admin/email/waitlist
 * Headers: x-admin-key: <ADMIN_KEY>
 * Body: { subject: string, message: string }
 * Sends a plain-text email to everyone on the waitlist.
 */
app.post('/admin/email/waitlist', adminLimiter, requireAdminKey, async (req, res) => {
  try {
    if (!resend) return res.status(503).json({ error: 'Email service not configured (missing RESEND_API_KEY).' });
    const { subject, message } = req.body;
    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({ error: 'subject and message are required.' });
    }

    const { data: rows, error: dbErr } = await supabaseAdmin
      .from('waitlist')
      .select('email');
    if (dbErr) throw dbErr;

    if (!rows || rows.length === 0) {
      return res.json({ ok: true, sent: 0, message: 'No waitlist emails found.' });
    }

    const emails = rows.map(r => r.email);

    // Send in batches of 50 (Resend batch limit)
    const BATCH = 50;
    let sent = 0;
    for (let i = 0; i < emails.length; i += BATCH) {
      const batch = emails.slice(i, i + BATCH);
      await resend.batch.send(batch.map(to => ({
        from:    FROM_EMAIL,
        to,
        subject: subject.trim(),
        text:    message.trim() + '\n\n---\nYou are receiving this because you joined the HeadRoom waitlist.\nHeadRoom · headroombudget.com',
      })));
      sent += batch.length;
    }

    console.log(`[admin/email/waitlist] Sent to ${sent} waitlist addresses.`);
    res.json({ ok: true, sent });
  } catch (err) {
    console.error('[POST /admin/email/waitlist]', err?.message);
    res.status(500).json({ error: err?.message ?? 'Failed to send emails.' });
  }
});

// ─── Admin: broadcast to all users ───────────────────────────────────────────

/**
 * POST /admin/email/broadcast
 * Headers: x-admin-key: <ADMIN_KEY>
 * Body: { subject: string, message: string }
 * Sends a plain-text email to all registered HeadRoom users.
 */
app.post('/admin/email/broadcast', adminLimiter, requireAdminKey, async (req, res) => {
  try {
    if (!resend) return res.status(503).json({ error: 'Email service not configured (missing RESEND_API_KEY).' });
    const { subject, message } = req.body;
    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({ error: 'subject and message are required.' });
    }

    const { data, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (authErr) throw authErr;

    const emails = (data?.users ?? [])
      .map(u => u.email)
      .filter(Boolean);

    if (emails.length === 0) {
      return res.json({ ok: true, sent: 0, message: 'No users found.' });
    }

    const BATCH = 50;
    let sent = 0;
    for (let i = 0; i < emails.length; i += BATCH) {
      const batch = emails.slice(i, i + BATCH);
      await resend.batch.send(batch.map(to => ({
        from:    FROM_EMAIL,
        to,
        subject: subject.trim(),
        text:    message.trim() + '\n\n---\nYou are receiving this as a registered HeadRoom user.\nHeadRoom · headroombudget.com',
      })));
      sent += batch.length;
    }

    console.log(`[admin/email/broadcast] Sent to ${sent} users.`);
    res.json({ ok: true, sent });
  } catch (err) {
    console.error('[POST /admin/email/broadcast]', err?.message);
    res.status(500).json({ error: err?.message ?? 'Failed to send emails.' });
  }
});

// ─── Health check (useful for deployment monitoring) ─────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true }));

// ─── Sentry error handler (must be after all routes, before app.listen) ───────

Sentry.setupExpressErrorHandler(app);

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🧠 Headroom AI backend running on http://localhost:${PORT}`);
  console.log(`   API key: ${process.env.ANTHROPIC_API_KEY ? '✓ loaded' : '✗ MISSING — set ANTHROPIC_API_KEY in .env'}\n`);
});
