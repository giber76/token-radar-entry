// Token Launch Radar — the valuation model.
//
// The model answers one question for every protocol in the sealed snapshot:
// if this protocol issued a token tomorrow and the market priced it the way it
// prices the tokens that already trade, what would that token be worth?
//
// It is built only from the snapshot's own figures. Nothing here names a
// protocol in advance: every number below is fitted or counted from the
// snapshot at run time, so the same code on a new snapshot would rank a new
// field.
//
// The model in four parts:
//   1. A size curve fitted on the snapshot's live tokens: log10(market cap)
//      against log10(TVL). A token's value grows with the protocol's size,
//      but slower than one-for-one, so the curve is the honest baseline.
//   2. A category factor: the median residual of a category's live tokens
//      against the curve, shrunk toward 1 by how many comparables the
//      category has. A category with one live token cannot move the model.
//   3. Small, capped adjustments for the protocol's own record: its 7-day TVL
//      move, how long it has run with no token, and how many chains it runs on.
//   4. A thin-category guard: a protocol whose category has fewer than three
//      live comparables cannot claim an implied value above the board's 90th
//      percentile. The excess above that line is compressed to 5%, so the
//      ranking stays ordered and no single thin category can crown a winner.
//      (Steakhouse Financial is the case that forced this rule: its category,
//      Risk Curators, has a single live token with a very large residual, and
//      without the guard the curve times that factor put it far above every
//      other launch candidate.)

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface SizeCurve {
  intercept: number;
  slope: number;
  r2: number;
  n: number;
  looMiss: number;
  q25dex: number;
  q75dex: number;
}

export interface CategoryFactor {
  factor: number;
  n: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  band_low_usd: number;
  band_high_usd: number;
  verdict: string;
  base_usd: number;
  cat_factor: number;
  ncat: number;
  capped: boolean;
}

export interface FamilyComparable {
  name: string;
  slug: string;
  symbol: string | null;
  mcap_usd: number;
  tvl_usd: number;
  ratio: number;
}

export interface LiveRow {
  name: string;
  slug: string;
  symbol: string | null;
  category: string | null;
  mcap_usd: number;
  tvl_usd: number;
  ratio: number;
  curve_usd: number;
}

export interface SetAsideRow {
  name: string;
  slug: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

export interface Board {
  curve: SizeCurve;
  anchor_usd: number;
  factors: Record<string, CategoryFactor>;
  bench_multiple: number;
  rows: BoardRow[];
  family: Record<string, FamilyComparable[]>;
  liveTop: LiveRow[];
  setAside: SetAsideRow[];
  counts: {
    protocols: number;
    live: number;
    candidates: number;
    board: number;
    watchlist: number;
  };
}

// ---------------------------------------------------------------- helpers

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function quantile(sorted: number[], q: number): number {
  const i = clamp(Math.floor(q * sorted.length), 0, sorted.length - 1);
  return sorted[i];
}

// ------------------------------------------------------- eligibility rule
//
// A launch candidate is a protocol that records no token and is not a
// wrapped, staked or bridged product of a token that already trades. This is
// the snapshot's own watchlist rule, without its $50M floor, so the board
// can rank the early protocols below the floor too.

const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

const EXCHANGE_PREFIXES = [
  "Binance",
  "Coinbase",
  "Bybit",
  "Kraken",
  "Bitget",
  "OKX",
  "Bitfinex",
  "Gemini",
];

const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  if (p.mcap_usd !== null) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  for (const ex of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(ex)) return false;
  }
  return true;
}

export function setAsideReason(p: SnapshotProtocol): string | null {
  if (p.mcap_usd !== null) return "Token already trades";
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) {
    return `Category ${p.category} is a wrapped, staked or bridged product, not a launch`;
  }
  if (VERSION_SUFFIX.test(p.name)) return "Versioned release of a protocol that already launched";
  if (WRAPPED_WORD.test(p.name)) return "Wrapped or staked product of a token that already trades";
  for (const ex of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(ex)) return "Exchange product, not a protocol launch";
  }
  return null;
}

// ------------------------------------------------------------ the size curve

const FIT_MIN_TVL = 10_000_000;

export function fitSizeCurve(protocols: SnapshotProtocol[]): SizeCurve {
  const fit = protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd >= FIT_MIN_TVL,
  );
  const xs = fit.map((p) => Math.log10(p.tvl_usd));
  const ys = fit.map((p) => Math.log10(p.mcap_usd as number));
  const n = xs.length;
  const mx = xs.reduce((a, x) => a + x, 0) / n;
  const my = ys.reduce((a, y) => a + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let ssTot = 0;
  let ssRes = 0;
  const residuals: number[] = [];
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i];
    ssTot += (ys[i] - my) * (ys[i] - my);
    ssRes += (ys[i] - pred) * (ys[i] - pred);
    residuals.push(ys[i] - pred);
  }
  const r2 = 1 - ssRes / ssTot;
  // Leave-one-out median miss: refit without each token, measure the miss.
  const misses: number[] = [];
  for (let i = 0; i < n; i++) {
    const x2 = xs.filter((_, j) => j !== i);
    const y2 = ys.filter((_, j) => j !== i);
    const n2 = x2.length;
    const mx2 = x2.reduce((a, x) => a + x, 0) / n2;
    const my2 = y2.reduce((a, y) => a + y, 0) / n2;
    let sxy2 = 0;
    let sxx2 = 0;
    for (let j = 0; j < n2; j++) {
      sxy2 += (x2[j] - mx2) * (y2[j] - my2);
      sxx2 += (x2[j] - mx2) * (x2[j] - mx2);
    }
    const b2 = sxy2 / sxx2;
    const a2 = my2 - b2 * mx2;
    misses.push(Math.pow(10, Math.abs(ys[i] - (a2 + b2 * xs[i]))));
  }
  const sortedRes = [...residuals].sort((a, b) => a - b);
  return {
    intercept,
    slope,
    r2,
    n,
    looMiss: median(misses),
    q25dex: quantile(sortedRes, 0.25),
    q75dex: quantile(sortedRes, 0.75),
  };
}

export function categoryFactors(
  protocols: SnapshotProtocol[],
  curve: SizeCurve,
): Map<string, CategoryFactor> {
  const byCat = new Map<string, number[]>();
  for (const p of protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    if (p.category === null) continue;
    const resid =
      Math.log10(p.mcap_usd) -
      (curve.intercept + curve.slope * Math.log10(p.tvl_usd));
    const arr = byCat.get(p.category) ?? [];
    arr.push(resid);
    byCat.set(p.category, arr);
  }
  const out = new Map<string, CategoryFactor>();
  for (const [cat, resids] of byCat) {
    const med = median(resids);
    const shrink = resids.length / (resids.length + 3);
    const factor = clamp(Math.pow(10, med * shrink), 0.25, 4);
    out.set(cat, { factor, n: resids.length });
  }
  return out;
}

// ------------------------------------------------------------------- gas

const GAS_USD: Record<string, number> = {
  Ethereum: 15,
  Solana: 0.5,
  Base: 0.5,
  Arbitrum: 1,
  Optimism: 0.5,
  Polygon: 0.5,
  "BNB Chain": 1,
  Avalanche: 1,
  Gnosis: 0.5,
  Linea: 0.5,
  Scroll: 0.5,
  zkSync: 0.5,
  Mantle: 0.5,
  Sui: 0.5,
  Aptos: 0.5,
};

export function gasFor(chain: string): { usd: number; text: string } {
  const usd = GAS_USD[chain] ?? 1;
  const text = usd >= 10 ? `about $${usd}` : usd >= 1 ? `about $${usd}` : "under $1";
  return { usd, text };
}

export function primaryChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0] : "Ethereum";
}

// --------------------------------------------------------------- farm steps

// The eight farm-step templates. Each step is a concrete instruction with
// what it costs and how long it takes, filled in per protocol from the
// snapshot's own record. The same templates are written into the dashboard's
// data.js, so the page's detail view shows exactly the steps board.json
// carries — one source of truth, no drift between the two.
export const STEP_TEMPLATES: string[] = [
  "Set up a fresh {chain} wallet for farming and fund it with $50 for gas plus $100 to deploy — gas runs {gas} per transaction on {chain}, so a week of activity costs a few dollars at most.",
  "Open {name}'s official app and connect the wallet, then check the URL against the project's official links before approving anything — a fake app is the most common way farmers lose funds.",
  "Deposit $100 to $500 of stablecoins into {name} on {chain}; the deposit costs {gas} in gas and confirms in 1–2 minutes, and the position should stay open for at least 4–8 weeks.",
  "{Action} — each use costs {gas} in gas and keeps the address active in the protocol's usage record, which is what an airdrop snapshot reads.",
  "Hold the position while {chg}; a sharp TVL drop is the signal to reassess the deposit, not to panic-sell, and a rising TVL with no token yet is the setup this radar is built to catch.",
  "Do one more distinct action — a second pool, a different asset, or a governance vote if one is live — so the address is not a single-action farmer; one-action wallets are the first to be filtered out.",
  "Record the position every week: the deposit, the date and a screenshot of the balance — {name} has run for {age} with no token, so the claim later needs proof from the same address.",
  "When {name} announces a token, claim only from the official claim page, then unstake after the snapshot; never sign a claim link sent by DM, and never pay anyone to claim for you.",
];

export const CATEGORY_ACTION: Record<string, string> = {
  Lending: "supply collateral and borrow a small amount against it",
  Dexs: "swap a small amount and add a little liquidity to one pool",
  Derivatives: "open and close a small perpetual position",
  CDP: "mint a small amount of the stable asset against collateral",
  Yield: "deposit into one vault and leave the position earning",
  Bridge: "bridge a small amount across and back once",
  "Liquid Staking": "stake a small amount and hold the receipt token",
  "Prediction Market": "place two small opposing trades on one market",
  "Risk Curators": "allocate a small amount to one curated vault",
  "Basis Trading": "open a small delta-neutral position if one is offered",
  "Onchain Capital Allocators": "allocate a small amount to one managed vault",
};

function actionFor(p: SnapshotProtocol): string {
  if (p.category !== null && CATEGORY_ACTION[p.category] !== undefined) {
    return CATEGORY_ACTION[p.category];
  }
  return "use the protocol's core feature once with a small amount";
}

function changeText(p: SnapshotProtocol): string {
  if (p.change_7d === null) return "no 7-day TVL move is reported";
  const v = p.change_7d;
  const dir = v >= 0 ? "up" : "down";
  return `TVL is ${dir} ${Math.abs(v).toFixed(1)}% over 7 days`;
}

function ageYears(p: SnapshotProtocol, asOf: string): number {
  if (p.listed_at === null) return 2;
  const [y, m, d] = p.listed_at.split("-").map(Number);
  const [ay, am, ad] = asOf.split("-").map(Number);
  const listed = Date.UTC(y, m - 1, d);
  const asof = Date.UTC(ay, am - 1, ad);
  return Math.max(0, (asof - listed) / (365.25 * 86400000));
}

function fmtUsd(x: number): string {
  if (x >= 1_000_000_000) return `$${(x / 1_000_000_000).toFixed(1)}B`;
  if (x >= 1_000_000) return `$${(x / 1_000_000).toFixed(1)}M`;
  if (x >= 1_000) return `$${(x / 1_000).toFixed(0)}k`;
  return `$${x.toFixed(0)}`;
}

export function fmtUsdFull(x: number): string {
  return fmtUsd(x);
}

export function fillStep(template: string, p: SnapshotProtocol, asOf: string): string {
  const chain = primaryChain(p);
  const gas = gasFor(chain);
  const action = actionFor(p);
  const age = ageYears(p, asOf);
  const ageText =
    age >= 1
      ? `${age.toFixed(1)} years`
      : `${Math.max(1, Math.round(age * 12))} months`;
  return template
    .replaceAll("{name}", p.name)
    .replaceAll("{chain}", chain)
    .replaceAll("{gas}", gas.text)
    .replaceAll("{chg}", changeText(p))
    .replaceAll("{age}", ageText)
    .replaceAll("{Action}", action.charAt(0).toUpperCase() + action.slice(1))
    .replaceAll("{action}", action);
}

export function farmSteps(p: SnapshotProtocol, asOf: string): string[] {
  return STEP_TEMPLATES.map((t) => fillStep(t, p, asOf));
}

export function verdictFor(implied: number, change7d: number | null): string {
  if (implied >= 50_000_000) {
    return change7d !== null && change7d >= 0
      ? "Farm now — top of the board, momentum with it"
      : "Farm now — size leads, momentum soft";
  }
  if (implied >= 20_000_000) return "Strong candidate — farm it this week";
  if (implied >= 10_000_000) return "Worth farming — solid size, real setup";
  if (implied >= 5_000_000) return "Early — small, watch it grow";
  return "Early — tiny, only if you farm the category anyway";
}

// --------------------------------------------------------------- the board

const BOARD_ROWS = 200;
const THIN_N = 3;
const CAP_Q = 0.9;
const CAP_KEEP = 0.05;

export function buildBoard(snapshot: Snapshot): Board {
  const curve = fitSizeCurve(snapshot.protocols);
  const factors = categoryFactors(snapshot.protocols, curve);
  const live = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );

  // Candidate set: the watchlist plus the 160 pre-token protocols below the
  // floor with the most TVL that meet the same launch rule.
  const watchlistSet = new Set(snapshot.watchlist);
  const candidates = snapshot.protocols.filter(isLaunchCandidate);
  const belowFloor = candidates
    .filter((p) => !watchlistSet.has(p.slug))
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, BOARD_ROWS - snapshot.watchlist.length);
  const boardSet = [
    ...candidates.filter((p) => watchlistSet.has(p.slug)),
    ...belowFloor,
  ];

  // First pass: raw implied values, to find the thin-category anchor.
  interface Scored {
    p: SnapshotProtocol;
    base: number;
    factor: number;
    ncat: number;
    raw: number;
  }
  const scored: Scored[] = boardSet.map((p) => {
    const base = Math.pow(
      10,
      curve.intercept + curve.slope * Math.log10(p.tvl_usd),
    );
    const f = p.category === null ? { factor: 1, n: 0 } : factors.get(p.category) ?? { factor: 1, n: 0 };
    const gRaw = p.change_7d === null ? 0 : clamp(p.change_7d, -50, 200);
    const growth = 1 + (gRaw / 200) * 0.5;
    const age = 1 + 0.05 * Math.min(ageYears(p, snapshot.as_of), 4);
    const chain = 1 + 0.02 * Math.min(Math.max(p.chains.length - 1, 0), 5);
    return { p, base, factor: f.factor, ncat: f.n, raw: base * f.factor * growth * age * chain };
  });
  const sortedRaw = [...scored].map((s) => s.raw).sort((a, b) => a - b);
  const anchor = sortedRaw[Math.floor(CAP_Q * sortedRaw.length)];

  // Second pass: apply the thin-category guard, then rank.
  const rows: BoardRow[] = scored.map((s) => {
    let implied = s.raw;
    let capped = false;
    if (s.ncat < THIN_N && implied > anchor) {
      implied = anchor + (implied - anchor) * CAP_KEEP;
      capped = true;
    }
    const bandLow = implied * Math.pow(10, curve.q25dex);
    const bandHigh = implied * Math.pow(10, curve.q75dex);
    return {
      slug: s.p.slug,
      name: s.p.name,
      rank: 0,
      implied_value_usd: Math.max(1, Math.round(implied)),
      farm_steps: farmSteps(s.p, snapshot.as_of),
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      listed_at: s.p.listed_at,
      band_low_usd: Math.max(1, Math.round(bandLow)),
      band_high_usd: Math.max(1, Math.round(bandHigh)),
      verdict: verdictFor(implied, s.p.change_7d),
      base_usd: Math.max(1, Math.round(s.base)),
      cat_factor: s.factor,
      ncat: s.ncat,
      capped,
    };
  });
  rows.sort((a, b) => {
    if (b.implied_value_usd !== a.implied_value_usd) return b.implied_value_usd - a.implied_value_usd;
    if (b.tvl_usd !== a.tvl_usd) return b.tvl_usd - a.tvl_usd;
    return a.slug < b.slug ? -1 : 1;
  });
  // Ranks 1..N, implied strictly decreasing so the ranking reads cleanly.
  for (let i = 0; i < rows.length; i++) {
    rows[i].rank = i + 1;
    if (i > 0 && rows[i].implied_value_usd >= rows[i - 1].implied_value_usd) {
      rows[i].implied_value_usd = Math.max(1, rows[i - 1].implied_value_usd - 1);
    }
  }

  // Family comparables: for each category, the live tokens that set the
  // factor, at the market's own values.
  const family: Record<string, FamilyComparable[]> = {};
  const byCatLive = new Map<string, SnapshotProtocol[]>();
  for (const p of live) {
    if (p.category === null) continue;
    const arr = byCatLive.get(p.category) ?? [];
    arr.push(p);
    byCatLive.set(p.category, arr);
  }
  for (const [cat, arr] of byCatLive) {
    const top = [...arr]
      .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number))
      .slice(0, 3);
    family[cat] = top.map((p) => ({
      name: p.name,
      slug: p.slug,
      symbol: p.symbol,
      mcap_usd: p.mcap_usd as number,
      tvl_usd: p.tvl_usd,
      ratio: Math.round(((p.mcap_usd as number) / p.tvl_usd) * 100) / 100,
    }));
  }

  // Live-token table, kept apart from the ranked board.
  const liveTop: LiveRow[] = [...live]
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number))
    .slice(0, 30)
    .map((p) => ({
      name: p.name,
      slug: p.slug,
      symbol: p.symbol,
      category: p.category,
      mcap_usd: p.mcap_usd as number,
      tvl_usd: p.tvl_usd,
      ratio: Math.round(((p.mcap_usd as number) / p.tvl_usd) * 100) / 100,
      curve_usd: Math.max(
        1,
        Math.round(
          Math.pow(10, curve.intercept + curve.slope * Math.log10(p.tvl_usd)),
        ),
      ),
    }));

  // Set-aside table: the protocols the radar looked at and left out, with why.
  const setAside: SetAsideRow[] = snapshot.protocols
    .filter((p) => !isLaunchCandidate(p) && p.mcap_usd === null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, 15)
    .map((p) => ({
      name: p.name,
      slug: p.slug,
      category: p.category,
      tvl_usd: p.tvl_usd,
      reason: setAsideReason(p) ?? "Not a launch candidate",
    }));

  return {
    curve,
    anchor_usd: Math.round(anchor),
    factors: Object.fromEntries(factors),
    bench_multiple: median(live.map((p) => (p.mcap_usd as number) / p.tvl_usd)),
    rows,
    family,
    liveTop,
    setAside,
    counts: {
      protocols: snapshot.protocols.length,
      live: live.length,
      candidates: candidates.length,
      board: rows.length,
      watchlist: snapshot.watchlist.length,
    },
  };
}
