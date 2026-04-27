/**
 * categoryMapper.ts — bank transaction → display-category resolver.
 *
 * Resolution order (first match wins):
 *   1. Teller `details.category` slug lookup   (exact, comprehensive)
 *   2. Merchant/counterparty keyword match      (catches unlabelled or null-slug txs)
 *   3. Raw description keyword match            (last resort before "Other")
 *   4. "Other / Misc" fallback
 *
 * Import `resolveTxCategory(tx)` wherever you need to classify a transaction.
 */

import { TellerTransaction } from '../types/teller';

// ─── Display metadata ─────────────────────────────────────────────────────────

export interface CategoryMeta {
  name:  string;
  icon:  string;
  color: string;
  /** Canonical key used for grouping (usually the Teller slug, or a synthetic key) */
  key:   string;
}

// ─── Full Teller slug → display map ──────────────────────────────────────────
// Covers every slug documented in the Teller API + common variants seen in the wild.

const SLUG_MAP: Record<string, Omit<CategoryMeta, 'key'>> = {
  // Food
  food_and_drink:         { name: 'Food & Drink',     icon: '🍔', color: '#F59E0B' },
  restaurants:            { name: 'Dining',            icon: '🍽️', color: '#EF4444' },
  dining:                 { name: 'Dining',            icon: '🍽️', color: '#EF4444' },
  fast_food:              { name: 'Fast Food',         icon: '🍟', color: '#F97316' },
  bar:                    { name: 'Bars & Nightlife',  icon: '🍺', color: '#D97706' },
  coffee_shop:            { name: 'Coffee',            icon: '☕', color: '#92400E' },
  groceries:              { name: 'Groceries',         icon: '🛒', color: '#22C55E' },
  supermarket:            { name: 'Groceries',         icon: '🛒', color: '#22C55E' },

  // Shopping
  general_merchandise:    { name: 'Shopping',          icon: '🛍️', color: '#8B5CF6' },
  shopping:               { name: 'Shopping',          icon: '🛍️', color: '#8B5CF6' },
  clothing:               { name: 'Clothing',          icon: '👕', color: '#A78BFA' },
  electronics:            { name: 'Electronics',       icon: '💻', color: '#6366F1' },
  home_improvement:       { name: 'Home Improvement',  icon: '🔨', color: '#78716C' },
  sporting_goods:         { name: 'Sports & Outdoors', icon: '⚽', color: '#16A34A' },

  // Transport
  transportation:         { name: 'Transport',         icon: '🚗', color: '#3B82F6' },
  public_transportation:  { name: 'Transit',           icon: '🚌', color: '#2563EB' },
  ride_share:             { name: 'Rideshare',         icon: '🚕', color: '#1D4ED8' },
  parking:                { name: 'Parking',           icon: '🅿️', color: '#4B5563' },
  gas_stations:           { name: 'Gas',               icon: '⛽', color: '#F97316' },
  fuel:                   { name: 'Gas',               icon: '⛽', color: '#F97316' },
  auto:                   { name: 'Auto',              icon: '🔧', color: '#475569' },
  vehicle:                { name: 'Auto',              icon: '🔧', color: '#475569' },

  // Travel
  travel:                 { name: 'Travel',            icon: '✈️', color: '#6366F1' },
  accommodation:          { name: 'Hotels',            icon: '🏨', color: '#7C3AED' },
  hotel:                  { name: 'Hotels',            icon: '🏨', color: '#7C3AED' },
  airlines:               { name: 'Flights',           icon: '🛫', color: '#4F46E5' },
  car_rental:             { name: 'Car Rental',        icon: '🚙', color: '#4338CA' },

  // Health
  health_and_fitness:     { name: 'Health & Fitness',  icon: '💊', color: '#06B6D4' },
  medical:                { name: 'Medical',           icon: '🏥', color: '#0891B2' },
  pharmacy:               { name: 'Pharmacy',          icon: '💊', color: '#0E7490' },
  dentist:                { name: 'Dental',            icon: '🦷', color: '#164E63' },
  gym:                    { name: 'Gym',               icon: '🏋️', color: '#0284C7' },
  sports:                 { name: 'Sports',            icon: '🏃', color: '#0369A1' },

  // Entertainment & Leisure
  entertainment:          { name: 'Entertainment',     icon: '🎬', color: '#EC4899' },
  movies:                 { name: 'Movies',            icon: '🎥', color: '#DB2777' },
  music:                  { name: 'Music',             icon: '🎵', color: '#BE185D' },
  recreation:             { name: 'Recreation',        icon: '🎮', color: '#9D174D' },
  gaming:                 { name: 'Gaming',            icon: '🎮', color: '#831843' },

  // Bills & Utilities
  utilities:              { name: 'Utilities',         icon: '💡', color: '#84CC16' },
  phone:                  { name: 'Phone / Mobile',    icon: '📱', color: '#65A30D' },
  internet:               { name: 'Internet',          icon: '🌐', color: '#4D7C0F' },
  cable_tv:               { name: 'Cable / TV',        icon: '📺', color: '#3F6212' },

  // Subscriptions & Software
  subscriptions:          { name: 'Subscriptions',     icon: '🔁', color: '#A855F7' },
  subscription:           { name: 'Subscriptions',     icon: '🔁', color: '#A855F7' },
  software:               { name: 'Software',          icon: '🖥️', color: '#9333EA' },
  memberships:            { name: 'Memberships',       icon: '🃏', color: '#7E22CE' },

  // Home & Housing
  rent:                   { name: 'Rent / Mortgage',   icon: '🏠', color: '#10B981' },
  mortgage:               { name: 'Rent / Mortgage',   icon: '🏠', color: '#10B981' },
  housing:                { name: 'Housing',           icon: '🏠', color: '#10B981' },

  // Personal Care
  personal_care:          { name: 'Personal Care',     icon: '💅', color: '#F43F5E' },
  beauty:                 { name: 'Beauty',            icon: '💄', color: '#E11D48' },
  hair_salon:             { name: 'Salon',             icon: '✂️', color: '#BE123C' },

  // Finance & Banking
  insurance:              { name: 'Insurance',         icon: '🛡️', color: '#64748B' },
  loan_payments:          { name: 'Loan Payment',      icon: '🏦', color: '#475569' },
  debt_payment:           { name: 'Debt Payment',      icon: '💳', color: '#0891B2' },
  savings:                { name: 'Savings',           icon: '💰', color: '#15803D' },
  transfer:               { name: 'Transfer',          icon: '↔️', color: '#94A3B8' },
  investment:             { name: 'Investments',       icon: '📈', color: '#059669' },
  investments:            { name: 'Investments',       icon: '📈', color: '#059669' },

  // Education
  education:              { name: 'Education',         icon: '🎓', color: '#B45309' },
  tuition:                { name: 'Education',         icon: '🎓', color: '#B45309' },

  // Giving
  charity:                { name: 'Charity',           icon: '❤️', color: '#DC2626' },
  donation:               { name: 'Charity',           icon: '❤️', color: '#DC2626' },

  // Tax & Government
  tax:                    { name: 'Taxes',             icon: '🧾', color: '#6B7280' },
  government:             { name: 'Government',        icon: '🏛️', color: '#9CA3AF' },

  // Misc
  general_services:       { name: 'Services',          icon: '🔧', color: '#94A3B8' },
  service:                { name: 'Services',          icon: '🔧', color: '#94A3B8' },
  advertising:            { name: 'Advertising',       icon: '📣', color: '#F472B6' },
  income:                 { name: 'Income',            icon: '💵', color: '#10B981' },
};

// ─── Merchant keyword fallback ────────────────────────────────────────────────
// Each entry is [categoryKey, keywords[]]. Checked in order — first match wins.
// Match is case-insensitive substring on counterparty name then description.

const KEYWORD_MAP: Array<[string, string[]]> = [
  // ── Groceries ────────────────────────────────────────────────────────────────
  ['groceries', [
    'whole foods', 'trader joe', 'kroger', 'safeway', 'publix', 'aldi', 'wegmans',
    'sprouts', 'heb', 'meijer', 'giant', 'stop & shop', 'food lion', 'winn-dixie',
    'albertsons', 'vons', 'ralphs', 'harris teeter', 'market basket',
    'piggly wiggly', 'tom thumb', 'brookshire', 'dillons', 'smith\'s food',
  ]],

  // ── Fast food / coffee ────────────────────────────────────────────────────────
  ['fast_food', [
    'mcdonald', 'burger king', 'wendy', 'taco bell', 'chick-fil-a', 'chickfila',
    'popeyes', 'kfc', 'arby', 'sonic drive', 'dairy queen', 'five guys',
    'jack in the box', 'carl\'s jr', 'hardee', 'whataburger', 'culver',
    'raising cane', 'wingstop', 'domino', 'pizza hut', 'little caesar',
    'papa john', 'papa murphy', 'panda express', 'chipotle', 'qdoba',
    'moe\'s', 'del taco', "in-n-out", 'shake shack', 'smashburger',
    'dunkin', 'starbucks', 'dutch bros', 'tim horton', 'panera', 'subway',
    'jimmy john', 'jersey mike', 'firehouse subs', 'potbelly', 'wawa',
  ]],

  // ── Dining / restaurants ──────────────────────────────────────────────────────
  ['restaurants', [
    'grubhub', 'doordash', 'uber eats', 'postmates', 'instacart',
    'seamless', 'caviar', 'gopuff',
    'applebee', 'chili\'s', 'olive garden', 'red lobster', 'longhorn',
    'outback', 'cheesecake factory', 'ihop', 'denny\'s', 'waffle house',
    'cracker barrel', 'golden corral', 'texas roadhouse',
    'buffalo wild wing', 'hooters', 'red robin', 'benihana',
  ]],

  // ── Entertainment / streaming ─────────────────────────────────────────────────
  ['entertainment', [
    'netflix', 'hulu', 'disney+', 'disney plus', 'hbo max', 'max.com',
    'paramount+', 'peacock', 'apple tv', 'amazon prime video', 'prime video',
    'youtube premium', 'crunchyroll', 'fubo', 'sling', 'directv',
    'amc+', 'showtime', 'starz', 'epix', 'discovery+',
  ]],

  // ── Music ────────────────────────────────────────────────────────────────────
  ['music', [
    'spotify', 'apple music', 'tidal', 'pandora', 'soundcloud', 'deezer',
    'amazon music', 'youtube music',
  ]],

  // ── Gaming ───────────────────────────────────────────────────────────────────
  ['gaming', [
    'steam', 'playstation', 'xbox', 'nintendo', 'epic games', 'riot games',
    'blizzard', 'ea games', 'ubisoft', 'activision', 'twitch',
    'humble bundle', 'green man gaming',
  ]],

  // ── Software / subscriptions ──────────────────────────────────────────────────
  ['software', [
    'adobe', 'microsoft 365', 'office 365', 'google workspace', 'google one',
    'dropbox', 'icloud', 'one drive', 'github', 'notion', 'figma',
    'slack', 'zoom', 'canva', 'squarespace', 'wix', 'shopify',
    'quickbooks', 'turbotax', 'norton', 'mcafee', 'malwarebytes',
    'expressvpn', 'nordvpn', 'surfshark',
  ]],

  // ── Phone / telecom ──────────────────────────────────────────────────────────
  ['phone', [
    'verizon', 't-mobile', 'at&t', 'sprint', 'boost mobile', 'cricket wireless',
    'metro by t-mobile', 'consumer cellular', 'mint mobile', 'visible wireless',
  ]],

  // ── Internet / cable ─────────────────────────────────────────────────────────
  ['internet', [
    'comcast', 'xfinity', 'spectrum', 'cox communications', 'century link',
    'frontier communications', 'windstream', 'att internet', 'verizon fios',
    'optimum', 'astound', 'mediacom',
  ]],

  // ── Gas stations ─────────────────────────────────────────────────────────────
  ['gas_stations', [
    'shell', 'bp', 'chevron', 'exxon', 'mobil', 'arco', 'speedway',
    'citgo', 'sunoco', 'marathon', 'valero', 'kwik trip', 'casey\'s',
    'love\'s', 'pilot', 'flying j', 'wawa gas', 'sheetz', '76 gas',
    'circle k', 'holiday station',
  ]],

  // ── Rideshare / transit ───────────────────────────────────────────────────────
  ['ride_share', [
    'uber', 'lyft', 'bird', 'lime', 'spin',
  ]],
  ['public_transportation', [
    'mta', 'bart', 'wmata', 'metro card', 'metrocard', 'cta chicago',
    'mbta', 'septa', 'caltrain', 'amtrak', 'megabus', 'greyhound', 'flixbus',
  ]],

  // ── Travel ───────────────────────────────────────────────────────────────────
  ['travel', [
    'airbnb', 'vrbo', 'expedia', 'hotels.com', 'booking.com', 'kayak',
    'priceline', 'orbitz', 'travelocity', 'hotwire', 'trivago',
    'delta', 'united airlines', 'american airlines', 'southwest',
    'jetblue', 'alaska airlines', 'spirit airlines', 'frontier airlines',
    'marriott', 'hilton', 'hyatt', 'ihg', 'best western', 'hampton inn',
    'holiday inn', 'sheraton', 'westin', 'doubletree',
  ]],

  // ── Health & pharmacy ─────────────────────────────────────────────────────────
  ['pharmacy', [
    'cvs', 'walgreens', 'rite aid', 'duane reade', 'health mart',
  ]],
  ['medical', [
    'kaiser permanente', 'cigna', 'anthem', 'aetna', 'blue cross', 'united health',
    'humana', 'wellcare', 'labcorp', 'quest diagnostics',
  ]],
  ['gym', [
    'planet fitness', 'la fitness', 'anytime fitness', '24 hour fitness',
    'equinox', 'crunch fitness', 'ymca', 'gold\'s gym', 'orangetheory',
    'peloton', 'classpass',
  ]],

  // ── Personal care / beauty ────────────────────────────────────────────────────
  ['personal_care', [
    'ulta', 'sephora', 'great clips', 'supercuts', 'sport clips',
    'floyd\'s barbershop', 'aveda', 'salon', 'barbershop', 'nail salon',
    'massage envy',
  ]],

  // ── Shopping / retail ─────────────────────────────────────────────────────────
  ['general_merchandise', [
    'amazon', 'walmart', 'target', 'costco', 'sam\'s club', 'bj\'s',
    'best buy', 'home depot', 'lowe\'s', 'ikea', 'wayfair', 'overstock',
    'ebay', 'etsy', 'wish', 'shein', 'zara', 'h&m', 'gap', 'old navy',
    'banana republic', 'j crew', 'uniqlo', 'nordstrom', 'macy\'s',
    'kohl\'s', 'tj maxx', 'marshalls', 'ross', 'burlington', 'dollar tree',
    'dollar general', 'family dollar', 'five below', 'tuesday morning',
  ]],

  // ── Home improvement ─────────────────────────────────────────────────────────
  ['home_improvement', [
    'ace hardware', 'true value', 'menards', 'floor & decor',
    'restoration hardware', 'pottery barn', 'west elm', 'crate and barrel',
  ]],

  // ── Insurance ────────────────────────────────────────────────────────────────
  ['insurance', [
    'geico', 'state farm', 'progressive', 'allstate', 'usaa insurance',
    'farmers insurance', 'liberty mutual', 'travelers insurance', 'nationwide',
    'american family', 'lemonade insurance', 'root insurance',
  ]],

  // ── Investments / brokerage ───────────────────────────────────────────────────
  // Transfers TO known brokerages = investing (good outflow, not lifestyle spend).
  ['investment', [
    'fidelity', 'vanguard', 'charles schwab', 'schwab brokerage', 'td ameritrade',
    'etrade', 'e*trade', 'e trade', 'robinhood', 'wealthfront', 'betterment',
    'acorns invest', 'stash invest', 'm1 finance', 'interactive brokers',
    'merrill edge', 'merrill lynch', 'edward jones', 'raymond james',
    'ameriprise', 'tiaa', 'principal financial', 't. rowe price', 'troweprice',
    'franklin templeton', 'american funds', 'fidelity investments',
    'webull', 'public.com', 'sofi invest', 'ally invest',
    'coinbase', 'gemini exchange', 'kraken exchange', 'binance',
    'computershare', 'sharebuilder', 'capital group',
  ]],

  // ── Education ────────────────────────────────────────────────────────────────
  ['education', [
    'college', 'university', 'tuition', 'coursera', 'udemy', 'skillshare',
    'masterclass', 'khan academy', 'chegg', 'cengage', 'pearson',
  ]],

  // ── Charity ──────────────────────────────────────────────────────────────────
  ['charity', [
    'red cross', 'goodwill', 'salvation army', 'habitat for humanity',
    'feeding america', 'united way', 'cancer society', 'heart association',
    'wikipedia', 'patreon', 'go fund me',
  ]],

  // ── Government / DMV / Post ───────────────────────────────────────────────────
  ['government', [
    'usps', 'us postal', 'dmv', 'irs', 'ssa.gov', 'irs.gov', 'courts',
    'city of ', 'county of ', 'state of ',
  ]],

  // ── Payroll / income deposits ─────────────────────────────────────────────────
  // These look like "transfers" to Teller but are real income — keep them.
  ['income', [
    'payroll', 'direct deposit', 'ach deposit', 'ach credit',
    'adp', 'gusto', 'paychex', 'bamboohr', 'rippling', 'workday',
    'salary', 'wages', 'stipend', 'bonus', 'commission',
    'social security', 'ssa treas', 'tax refund', 'irs treas',
    'unemployment', 'workers comp',
  ]],

  // ── Peer-to-peer payments (Venmo, PayPal, Zelle, etc.) ───────────────────────
  // These are real money movement — spending when money goes out, income when in.
  ['general_services', [
    'venmo', 'paypal', 'zelle', 'cash app', 'cashapp', 'square cash',
    'apple cash', 'google pay send', 'chime',
  ]],

  // ── Marketplaces (eBay, Etsy, etc.) ─────────────────────────────────────────
  ['general_merchandise', [
    'ebay', 'mercari', 'poshmark', 'depop', 'facebook marketplace',
    'craigslist', 'offerup',
  ]],

  // ── Reimbursements / refunds ──────────────────────────────────────────────────
  ['income', [
    'refund', 'reimbursement', 'rebate', 'cashback', 'cash back reward',
    'credit adjustment',
  ]],
];

// Build a lookup for keyword → CategoryMeta (resolved once at module load)
const _keywordMeta: Array<{ keywords: string[]; meta: CategoryMeta }> = KEYWORD_MAP.map(
  ([key, keywords]) => ({
    keywords,
    meta: {
      key,
      ...(SLUG_MAP[key] ?? { name: key, icon: '📦', color: '#94A3B8' }),
    },
  })
);

// ─── Fallback ─────────────────────────────────────────────────────────────────

export const OTHER_META: CategoryMeta = {
  key:   'other',
  name:  'Other / Misc',
  icon:  '📦',
  color: '#94A3B8',
};

// ─── Display category list (for the category picker UI) ───────────────────────
// Curated set of the most common categories shown to users when remapping.

export const DISPLAY_CATEGORIES: CategoryMeta[] = [
  { key: 'groceries',           name: 'Groceries',         icon: '🛒', color: '#22C55E' },
  { key: 'restaurants',         name: 'Dining',             icon: '🍽️', color: '#EF4444' },
  { key: 'fast_food',           name: 'Fast Food',          icon: '🍟', color: '#F97316' },
  { key: 'food_and_drink',      name: 'Food & Drink',       icon: '🍔', color: '#F59E0B' },
  { key: 'coffee_shop',         name: 'Coffee',             icon: '☕', color: '#92400E' },
  { key: 'gas_stations',        name: 'Gas',                icon: '⛽', color: '#F97316' },
  { key: 'transportation',      name: 'Transport',          icon: '🚗', color: '#3B82F6' },
  { key: 'ride_share',          name: 'Rideshare',          icon: '🚕', color: '#1D4ED8' },
  { key: 'public_transportation', name: 'Transit',          icon: '🚌', color: '#2563EB' },
  { key: 'general_merchandise', name: 'Shopping',           icon: '🛍️', color: '#8B5CF6' },
  { key: 'clothing',            name: 'Clothing',           icon: '👕', color: '#A78BFA' },
  { key: 'electronics',         name: 'Electronics',        icon: '💻', color: '#6366F1' },
  { key: 'home_improvement',    name: 'Home Improvement',   icon: '🔨', color: '#78716C' },
  { key: 'entertainment',       name: 'Entertainment',      icon: '🎬', color: '#EC4899' },
  { key: 'music',               name: 'Music / Streaming',  icon: '🎵', color: '#BE185D' },
  { key: 'gaming',              name: 'Gaming',             icon: '🎮', color: '#831843' },
  { key: 'subscriptions',       name: 'Subscriptions',      icon: '🔁', color: '#A855F7' },
  { key: 'software',            name: 'Software / Apps',    icon: '🖥️', color: '#9333EA' },
  { key: 'utilities',           name: 'Utilities',          icon: '💡', color: '#84CC16' },
  { key: 'phone',               name: 'Phone / Mobile',     icon: '📱', color: '#65A30D' },
  { key: 'internet',            name: 'Internet / Cable',   icon: '🌐', color: '#4D7C0F' },
  { key: 'rent',                name: 'Rent / Mortgage',    icon: '🏠', color: '#10B981' },
  { key: 'health_and_fitness',  name: 'Health & Fitness',   icon: '💊', color: '#06B6D4' },
  { key: 'pharmacy',            name: 'Pharmacy',           icon: '💊', color: '#0E7490' },
  { key: 'medical',             name: 'Medical',            icon: '🏥', color: '#0891B2' },
  { key: 'gym',                 name: 'Gym',                icon: '🏋️', color: '#0284C7' },
  { key: 'personal_care',       name: 'Personal Care',      icon: '💅', color: '#F43F5E' },
  { key: 'travel',              name: 'Travel',             icon: '✈️', color: '#6366F1' },
  { key: 'accommodation',       name: 'Hotels',             icon: '🏨', color: '#7C3AED' },
  { key: 'insurance',           name: 'Insurance',          icon: '🛡️', color: '#64748B' },
  { key: 'investment',          name: 'Investments',        icon: '📈', color: '#059669' },
  { key: 'savings',             name: 'Savings',            icon: '💰', color: '#15803D' },
  { key: 'education',           name: 'Education',          icon: '🎓', color: '#B45309' },
  { key: 'charity',             name: 'Charity',            icon: '❤️', color: '#DC2626' },
  { key: 'income',              name: 'Income / Deposit',   icon: '💵', color: '#10B981' },
  { key: 'debt_payment',        name: 'Debt Payment',        icon: '💳', color: '#0891B2' },
  { key: 'transfer',            name: 'Transfer (internal)', icon: '↔️', color: '#94A3B8' },
  { key: 'other',               name: 'Other / Misc',        icon: '📦', color: '#94A3B8' },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve the display category for a Teller transaction.
 * Returns a `CategoryMeta` object with `key`, `name`, `icon`, `color`.
 *
 * Resolution order:
 *   1. Teller `details.category` slug (exact lookup)
 *   2. Merchant name keyword match  (counterparty.name)
 *   3. Description keyword match    (tx.description)
 *   4. OTHER_META fallback
 */
export function resolveTxCategory(tx: TellerTransaction): CategoryMeta {
  // 1. Slug lookup
  const slug = tx.details?.category;
  if (slug && SLUG_MAP[slug]) {
    return { key: slug, ...SLUG_MAP[slug] };
  }

  // 2. Merchant / counterparty keyword match
  const merchant = (tx.details?.counterparty?.name ?? '').toLowerCase();
  if (merchant) {
    for (const { keywords, meta } of _keywordMeta) {
      if (keywords.some((kw) => merchant.includes(kw.toLowerCase()))) {
        return meta;
      }
    }
  }

  // 3. Description keyword match
  const desc = (tx.description ?? '').toLowerCase();
  if (desc) {
    for (const { keywords, meta } of _keywordMeta) {
      if (keywords.some((kw) => desc.includes(kw.toLowerCase()))) {
        return meta;
      }
    }
  }

  // 4. Unknown slug — pretty-print it rather than "Other"
  if (slug) {
    return {
      key:   slug,
      name:  slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      icon:  '📦',
      color: '#94A3B8',
    };
  }

  return OTHER_META;
}

/**
 * Returns true if this category key represents "productive" / good outflow:
 *   • Debt payments (specific debt overrides OR the generic debt_payment slug)
 *   • Investments / brokerage deposits
 *   • Savings contributions
 *
 * Used to split spending into "Productive" vs "Lifestyle" on the dashboard.
 */
export function isGoodOutflow(catKey: string): boolean {
  return (
    catKey === 'investment'    ||
    catKey === 'investments'   ||
    catKey === 'savings'       ||
    catKey === 'debt_payment'  ||
    catKey === 'loan_payments' ||
    catKey.startsWith('debt:')
  );
}

/**
 * Convenience: get just the display name for a slug string (no tx needed).
 * Used in places that already know the slug but need the display info.
 */
export function slugToMeta(slug: string | null | undefined): CategoryMeta {
  if (!slug) return OTHER_META;
  if (SLUG_MAP[slug]) return { key: slug, ...SLUG_MAP[slug] };
  return {
    key:   slug,
    name:  slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    icon:  '📦',
    color: '#94A3B8',
  };
}

/**
 * Override-aware category resolver.
 * Checks the user's manual override map first, then falls back to auto-resolve.
 *
 * @param tx        The Teller transaction to categorise.
 * @param overrides Map of txId → category key, from BankContext.
 *                  Debt payment keys use the format "debt:${debtId}",
 *                  with the debt name provided separately via debtNames.
 * @param debtNames Optional map of debtId → debt name for display purposes.
 */
export function resolveDisplayCategory(
  tx: TellerTransaction,
  overrides: Record<string, string>,
  debtNames?: Record<string, string>,
): CategoryMeta {
  const overrideKey = overrides[tx.id];
  if (overrideKey) {
    // Debt payment: "debt:${debtId}"
    if (overrideKey.startsWith('debt:')) {
      const debtId   = overrideKey.slice(5);
      const debtName = debtNames?.[debtId] ?? 'Debt Payment';
      return { key: overrideKey, name: debtName, icon: '💳', color: '#0891B2' };
    }
    // Check DISPLAY_CATEGORIES (covers 'transfer', 'other', 'debt_payment', etc.)
    const found = DISPLAY_CATEGORIES.find((c) => c.key === overrideKey);
    if (found) return found;
    // Fall back to SLUG_MAP for any other valid slug
    if (SLUG_MAP[overrideKey]) return { key: overrideKey, ...SLUG_MAP[overrideKey] };
  }
  return resolveTxCategory(tx);
}
