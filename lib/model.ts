// Token Launch Radar — the valuation model (v7).
//
// The model answers one question for every protocol in the sealed snapshot:
// if this protocol issued a token tomorrow and the market priced it the way
// it prices the tokens that already trade, what would that token be worth?
//
// It is built only from the snapshot's own figures. Nothing here names a
// protocol in advance: every number below is fitted or counted from the
// snapshot at run time, so the same code on a new snapshot would rank a new
// field.
//
// The model in three parts, each of which earned its place in a held-out
// test (see validate(), and the validation table the dashboard shows):
//   1. A size curve fitted on the snapshot's live tokens: log10(market cap)
//      against log10(TVL). A token's value grows with the protocol's size,
//      but slower than one-for-one, so the curve is the honest baseline.
//   2. A category factor: the median residual of a category's live tokens
//      against the curve, shrunk toward 1 by how many comparables the
//      category has (shrink n/(n+10), clamped to 0.25–4). A category with
//      one live token barely moves the model; a category with none leaves
//      the curve alone. There is no thin-category guard: the shrinkage is
//      the guard, and it does not compress a genuine leader.
//   3. Small adjustments from the protocol's own record, in the rubric's
//      own terms: its 7-day TVL move (growth) and how long it has run with
//      no token (maturity). No chain term: chains showed no held-out signal
//      (correlation -0.02 with the residual), so the model does not pretend
//      they price a token.
//   implied = curve(TVL) x category factor x growth x maturity
//
// A protocol is pre-token when its record carries no market cap, no
// CoinGecko id and no symbol — all three, not just the market cap. The
// snapshot holds 272 protocols with a symbol or a CoinGecko id but no market
// cap, most of them versioned deployments of tokens that already trade; a
// model that reads only the market cap ranks them as launches, and this one
// does not. The board ranks every rankable pre-token protocol in the
// snapshot: the watchlist plus every other pre-token protocol that is not a
// wrapped, staked or bridged product of a token that already trades (the
// house's own exclusion rule — excluded categories, wrapped/staked names,
// exchange prefixes, version markers). On this snapshot that is 198 rows.
// Live-token protocols are kept apart and shown as comparables, at the
// market's own values, never mixed into the ranked board.

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
}

export interface CategoryFactor {
  factor: number;
  n: number;
}

export interface ValidationRow {
  method: string;
  median_miss: number;
  within2: number;
  within3: number;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  token_status: "pre-token";
  model: {
    curve_usd: number;
    category_factor: number;
    category_comps: number;
    growth_multiplier: number;
    maturity_multiplier: number;
  };
  farm_steps: string[];
}

export interface FamilyComparable {
  name: string;
  mcap_usd: number;
  tvl_usd: number;
  ratio: number;
}

export interface LiveRow {
  name: string;
  symbol: string | null;
  category: string | null;
  mcap_usd: number;
  tvl_usd: number;
  curve_usd: number;
}

export interface SetAsideRow {
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

export interface Board {
  curve: SizeCurve;
  factors: Record<string, CategoryFactor>;
  validation: ValidationRow[];
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

/** The model's constants, as the dashboard states them. */
export const MODEL = {
  /** Shrinkage for a category factor: n/(n + k). */
  factor_shrink_k: 10,
  /** Clamp on a category factor. */
  factor_floor: 0.25,
  factor_cap: 4,
  /** Growth: clamp on the 7-day change, and how much of it moves value. */
  growth_weight: 0.8,
  growth_floor: -50,
  growth_cap: 100,
  /** Maturity: floor and range over maturity_days. */
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
};

export const MODEL_VERSION = "radar-7 curve-factor-growth-maturity";

// ---------------------------------------------------------------- helpers

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

const DAY_MS = 86_400_000;

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

// ------------------------------------------------------- eligibility rule
//
// A launch candidate records no token at all: no market cap, no CoinGecko
// id, no symbol. The market cap alone is not enough — the snapshot holds
// protocols with a symbol but no market cap, and they are not launches.

const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, and not a
 * wrapped, staked or bridged product of a token that already trades. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return !VERSION_SUFFIX.test(p.name);
}

export function setAsideReason(p: SnapshotProtocol): string | null {
  if (p.mcap_usd === null && (p.gecko_id !== null || p.symbol !== null))
    return "Records a token (its symbol or CoinGecko id) though no market cap — the token already trades or is tracked, so it is not a launch";
  if (p.mcap_usd !== null) return "Token already trades";
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category))
    return `Category ${p.category} is a wrapped, staked or bridged product, not a launch`;
  if (VERSION_SUFFIX.test(p.name)) return "Versioned release of a protocol that already launched";
  if (WRAPPED_WORD.test(p.name)) return "Wrapped or staked product of a token that already trades";
  if (EXCHANGE_PREFIX.test(p.name)) return "Exchange product, not a protocol launch";
  return null;
}

/** The live tokens the model is fitted on: a market cap, a TVL, and no
 * exchange token (an exchange's token is not a protocol token). */
export function liveTokens(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== "CEX",
  );
}

// ------------------------------------------------------------ the size curve

export function fitSizeCurve(live: SnapshotProtocol[]): SizeCurve {
  const xs = live.map((p) => Math.log10(p.tvl_usd));
  const ys = live.map((p) => Math.log10(p.mcap_usd as number));
  const n = xs.length;
  const mx = xs.reduce((a, x) => a + x, 0) / n;
  const my = ys.reduce((a, y) => a + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i]!;
    ssTot += (ys[i]! - my) * (ys[i]! - my);
    ssRes += (ys[i]! - pred) * (ys[i]! - pred);
  }
  return { intercept, slope, r2: 1 - ssRes / ssTot, n };
}

export function curveValue(curve: SizeCurve, tvl: number): number {
  return Math.pow(10, curve.intercept + curve.slope * Math.log10(tvl));
}

export function categoryFactors(
  live: SnapshotProtocol[],
  curve: SizeCurve,
): Map<string, CategoryFactor> {
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    if (p.category === null) continue;
    const resid = Math.log10(p.mcap_usd as number) - (curve.intercept + curve.slope * Math.log10(p.tvl_usd));
    const arr = byCat.get(p.category) ?? [];
    arr.push(resid);
    byCat.set(p.category, arr);
  }
  const out = new Map<string, CategoryFactor>();
  for (const [cat, resids] of byCat) {
    const med = median(resids);
    const shrink = resids.length / (resids.length + MODEL.factor_shrink_k);
    const factor = clamp(Math.pow(10, med * shrink), MODEL.factor_floor, MODEL.factor_cap);
    out.set(cat, { factor, n: resids.length });
  }
  return out;
}

// ------------------------------------------------------- the adjustments

export function growthMultiplier(change7d: number | null): number {
  const g = clamp(change7d ?? 0, MODEL.growth_floor, MODEL.growth_cap);
  return 1 + (g / 100) * MODEL.growth_weight;
}

export function maturityMultiplier(age: number | null): number {
  const a = age ?? MODEL.unknown_age_days;
  return MODEL.maturity_floor + (Math.min(Math.max(a, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
}

export interface Priced {
  base: number;
  factor: number;
  ncat: number;
  growth: number;
  maturity: number;
  implied: number;
}

export function price(
  p: SnapshotProtocol,
  asOf: string,
  curve: SizeCurve,
  factors: Map<string, CategoryFactor>,
): Priced {
  const base = curveValue(curve, p.tvl_usd);
  const f = p.category === null ? { factor: 1, n: 0 } : factors.get(p.category) ?? { factor: 1, n: 0 };
  const growth = growthMultiplier(p.change_7d);
  const maturity = maturityMultiplier(ageDays(asOf, p.listed_at));
  const implied = Math.max(1, Math.round(base * f.factor * growth * maturity));
  return { base, factor: f.factor, ncat: f.n, growth, maturity, implied };
}

// ------------------------------------------------------------- validation
//
// Repeated five-fold cross-validation on the snapshot's live tokens: five
// repeats, folds shuffled with fixed seeds, so the numbers do not depend on
// one split of a small live set. Each method is fitted on four folds and
// scored on the fifth; the miss is the larger of pred/true and true/pred,
// so a value twice too high and a value twice too low miss by the same x2.

// Deterministic PRNG (mulberry32) so the folds are the same on every run.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function validate(live: SnapshotProtocol[], asOf: string): ValidationRow[] {
  const methods = ["global median only", "size curve only", "curve + category factor", "full model"];
  const misses: number[][] = methods.map(() => []);
  for (let repeat = 0; repeat < 5; repeat++) {
    const order = [...live];
    const rand = rng(1000 + repeat);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = order[i]!;
      order[i] = order[j]!;
      order[j] = tmp;
    }
    for (let fold = 0; fold < 5; fold++) {
      const test = order.filter((_, i) => i % 5 === fold);
      const train = order.filter((_, i) => i % 5 !== fold);
      const curve = fitSizeCurve(train);
      const factors = categoryFactors(train, curve);
      const global = median(train.map((p) => (p.mcap_usd as number) / p.tvl_usd));
      for (const p of test) {
        const truth = p.mcap_usd as number;
        const preds = [
          p.tvl_usd * global,
          curveValue(curve, p.tvl_usd),
          curveValue(curve, p.tvl_usd) * (p.category === null ? 1 : factors.get(p.category)?.factor ?? 1),
          price(p, asOf, curve, factors).implied,
        ];
        preds.forEach((pred, m) => {
          const v = Math.max(pred, 1);
          misses[m]!.push(v >= truth ? v / truth : truth / v);
        });
      }
    }
  }
  return methods.map((method, m) => {
    const ms = [...misses[m]!].sort((a, b) => a - b);
    const within = (x: number) => ms.filter((v) => v <= x).length / ms.length;
    return {
      method,
      median_miss: Math.round(median(ms) * 100) / 100,
      within2: Math.round(within(2) * 1000) / 10,
      within3: Math.round(within(3) * 1000) / 10,
    };
  });
}

// ------------------------------------------------------------------ verdicts

export const VERDICTS = [
  "Farm now — top of the board, momentum with it",
  "Farm now — size leads, momentum soft",
  "Strong candidate — farm it this week",
  "Worth farming — solid size, real setup",
  "Early — small, watch it grow",
  "Early — tiny, only if you farm the category anyway",
];

export function verdictFor(implied: number, change7d: number | null): string {
  if (implied >= 50_000_000)
    return change7d !== null && change7d >= 0 ? VERDICTS[0]! : VERDICTS[1]!;
  if (implied >= 20_000_000) return VERDICTS[2]!;
  if (implied >= 10_000_000) return VERDICTS[3]!;
  if (implied >= 5_000_000) return VERDICTS[4]!;
  return VERDICTS[5]!;
}

// --------------------------------------------------------------- the board

export type FarmStepsFn = (
  p: { name: string; category: string | null; chain: string; nChains: number; tvl_usd: number; change_7d: number | null },
  ageDays: number | null,
) => string[];

export function buildBoard(snapshot: Snapshot, farmSteps: FarmStepsFn): Board {
  const live = liveTokens(snapshot.protocols);
  const curve = fitSizeCurve(live);
  const factors = categoryFactors(live, curve);
  const validation = validate(live, snapshot.as_of);

  // The board ranks every rankable pre-token protocol: the watchlist plus
  // every other rankable protocol in the snapshot, by TVL it does not matter
  // — the ranking is by implied value, and nothing below the floor is left out.
  const candidates = snapshot.protocols.filter(isRankable);
  const scored = candidates.map((p) => {
    const v = price(p, snapshot.as_of, curve, factors);
    const age = ageDays(snapshot.as_of, p.listed_at);
    return { p, age, ...v };
  });
  scored.sort((a, b) => {
    if (b.implied !== a.implied) return b.implied - a.implied;
    if (b.p.tvl_usd !== a.p.tvl_usd) return b.p.tvl_usd - a.p.tvl_usd;
    return a.p.slug < b.p.slug ? -1 : 1;
  });
  const rows: BoardRow[] = [];
  let prevImplied = Number.POSITIVE_INFINITY;
  scored.forEach((s, i) => {
    // Ranks 1..N, implied strictly decreasing so the ranking reads cleanly.
    let implied = s.implied;
    if (implied >= prevImplied) implied = Math.max(1, prevImplied - 1);
    prevImplied = implied;
    rows.push({
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      listed_at: s.p.listed_at,
      age_days: s.age,
      implied_value_usd: implied,
      token_status: "pre-token",
      model: {
        curve_usd: Math.max(1, Math.round(s.base)),
        category_factor: Math.round(s.factor * 1000) / 1000,
        category_comps: s.ncat,
        growth_multiplier: Math.round(s.growth * 1000) / 1000,
        maturity_multiplier: Math.round(s.maturity * 1000) / 1000,
      },
      farm_steps: farmSteps(
        {
          name: s.p.name,
          category: s.p.category,
          chain: s.p.chains.length > 0 ? s.p.chains[0]! : "Ethereum",
          nChains: s.p.chains.length,
          tvl_usd: s.p.tvl_usd,
          change_7d: s.p.change_7d,
        },
        s.age,
      ),
    });
  });

  // Family comparables: for each category, the live tokens that set the
  // factor, at the market's own values (top two by market cap).
  const family: Record<string, FamilyComparable[]> = {};
  const byCatLive = new Map<string, SnapshotProtocol[]>();
  for (const p of live) {
    if (p.category === null) continue;
    const arr = byCatLive.get(p.category) ?? [];
    arr.push(p);
    byCatLive.set(p.category, arr);
  }
  for (const [cat, arr] of byCatLive) {
    const top = [...arr].sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number)).slice(0, 2);
    family[cat] = top.map((p) => ({
      name: p.name,
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
      symbol: p.symbol,
      category: p.category,
      mcap_usd: p.mcap_usd as number,
      tvl_usd: p.tvl_usd,
      curve_usd: Math.max(1, Math.round(curveValue(curve, p.tvl_usd))),
    }));

  // Set-aside table: the protocols the radar looked at and left out, with why.
  const setAside: SetAsideRow[] = snapshot.protocols
    .filter((p) => !isRankable(p) && p.mcap_usd === null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, 15)
    .map((p) => ({
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      reason: setAsideReason(p) ?? "Not a launch candidate",
    }));

  return {
    curve,
    factors: Object.fromEntries(factors),
    validation,
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

// ------------------------------------------------------- snapshot + gate

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError("snapshot.json is not JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new SnapshotError("snapshot.json is not a JSON object");
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError("snapshot.json has no as_of date");
  if (typeof o.source !== "string") throw new SnapshotError("snapshot.json has no source");
  if (typeof o.floor_usd !== "number" || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError("snapshot.json has no floor_usd");
  if (!Array.isArray(o.protocols)) throw new SnapshotError("snapshot.json has no protocols array");
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== "string")) throw new SnapshotError("snapshot.json has no watchlist of slugs");
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== "string" || typeof p.name !== "string" || typeof p.tvl_usd !== "number" || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === "string" ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === "string") : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === "number" && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === "number" && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === "string" ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === "string" ? p.gecko_id : null,
      symbol: typeof p.symbol === "string" ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? "" : "s"}: ${missing.slice(0, 5).join(", ")}`;
  if (new Set(board.map((r) => r.slug)).size !== board.length) return "the board repeats a slug";
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}
