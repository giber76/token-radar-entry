// Token Launch Radar — entry point.
//
// Reads the sealed snapshot, ranks the launch candidates, and writes:
//   /output/board.json        the ranked board (198 rows, farm plan each)
//   /output/dashboard/data.js the dashboard's data, beside the page
//   /output/dashboard/        index.html, app.css, app.js, steps.js (copied from here)
//   /output/screenshots/      the four screenshots (copied from here)
//   /output/dossier.json      the dossier, byte for byte from buildDossier
//
// Node 22, standard library only. No network. Deterministic: two runs write
// the same bytes. The output directory is never removed — a mount point
// cannot be removed, so the program only creates it and writes into it.
//
// The farm-step builder is shared with the dashboard: dashboard/steps.js is
// a plain script both sides load (the page as a classic script, this file as
// an import), and both read the same builder off globalThis.FarmSteps, so
// the steps board.json carries and the steps the detail view shows are one
// and the same builder, never two copies that can drift.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "./dashboard/steps.js";
import {
  buildBoard,
  parseSnapshot,
  boardIssue,
  verdictFor,
  VERDICTS,
  MODEL,
  MODEL_VERSION,
  type Snapshot,
  type Board,
  type FarmStepsFn,
} from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

const farmSteps = (
  globalThis as unknown as { FarmSteps: { farmSteps: FarmStepsFn } }
).FarmSteps.farmSteps;

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = "/input/snapshot.json";
  let output = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input" && argv[i + 1] !== undefined) input = argv[++i];
    else if (argv[i] === "--output" && argv[i + 1] !== undefined) output = argv[++i];
  }
  return { input, output };
}

function mkdirp(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function copyDir(src: string, dst: string): void {
  mkdirp(dst);
  for (const name of readdirSync(src).sort()) {
    copyFileSync(join(src, name), join(dst, name));
  }
}

function fmtUsd(x: number): string {
  if (x >= 1_000_000_000) return `$${(x / 1_000_000_000).toFixed(1)}B`;
  if (x >= 1_000_000) return `$${(x / 1_000_000).toFixed(1)}M`;
  if (x >= 1_000) return `$${(x / 1_000).toFixed(0)}k`;
  return `$${x.toFixed(0)}`;
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const snapshot: Snapshot = parseSnapshot(readFileSync(input, "utf8"));
  const board: Board = buildBoard(snapshot, farmSteps);
  const issue = boardIssue(board.rows, snapshot);
  if (issue !== null) throw new Error(`board refused: ${issue}`);
  const c = board.curve;
  const full = board.validation.find((v) => v.method === "full model")!;

  // ---- board.json: the ranked board, the model, and the two tables the
  // ---- board keeps apart from the ranking.
  const boardDoc = {
    schema: "makefun/board/v1",
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: {
      size_curve: {
        formula: `log10(market cap) = ${c.intercept.toFixed(2)} + ${c.slope.toFixed(2)} * log10(TVL)`,
        fit: {
          intercept: Number(c.intercept.toFixed(3)),
          slope: Number(c.slope.toFixed(3)),
          r2: Number(c.r2.toFixed(3)),
          n: c.n,
        },
        note:
          "Fitted by least squares on the snapshot's own live tokens (a market cap, a TVL, no exchange token). " +
          "R2 is low because market cap over TVL varies enormously across tokens; the curve is the baseline, and the category factor carries the rest.",
      },
      category_factors: Object.fromEntries(
        Object.entries(board.factors).map(([cat, f]) => [
          cat,
          { factor: Number(f.factor.toFixed(3)), n: f.n },
        ]),
      ),
      adjustments: {
        growth: { weight: MODEL.growth_weight, clamp: [MODEL.growth_floor, MODEL.growth_cap] },
        maturity: { floor: MODEL.maturity_floor, range: MODEL.maturity_range, days: MODEL.maturity_days },
      },
      validation: {
        method: "Repeated five-fold cross-validation on the snapshot's live tokens (5 repeats, folds shuffled with fixed seeds). Miss is max(pred,true)/min(pred,true).",
        rows: board.validation,
      },
      decisions:
        "Pre-token means no market cap, no CoinGecko id and no symbol — all three. " +
        "No chain term: chains showed no held-out signal (correlation -0.02 with the residual). " +
        "No thin-category guard: the factor's shrinkage (n/(n+10)) already handles thin categories without compressing a genuine leader.",
    },
    rows: board.rows,
    live_tokens: board.liveTop,
    set_aside: board.setAside,
  };

  // ---- dashboard data: compact rows, the family strips, the live table,
  // ---- the set-aside list, the rising strip, and the validation table.
  // The source line is written without its scheme: the dashboard's files
  // name no http(s) address, and the source is data, not a link.
  const sourceText = snapshot.source.replace("https://", "").replace("http://", "");
  const watchlist = new Set(snapshot.watchlist);
  const dataDoc = {
    as_of: snapshot.as_of,
    source: sourceText,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    counts: board.counts,
    model: {
      intercept: Number(c.intercept.toFixed(3)),
      slope: Number(c.slope.toFixed(3)),
      r2: Number(c.r2.toFixed(3)),
      n: c.n,
      formula: `log10(market cap) = ${c.intercept.toFixed(2)} + ${c.slope.toFixed(2)} × log10(TVL)`,
      bench: Number(board.bench_multiple.toFixed(3)),
      cv_median_miss: full.median_miss,
      cv_within2: full.within2,
      cv_within3: full.within3,
      growth_weight: MODEL.growth_weight,
      growth_floor: MODEL.growth_floor,
      growth_cap: MODEL.growth_cap,
      maturity_floor: MODEL.maturity_floor,
      maturity_range: MODEL.maturity_range,
      maturity_days: MODEL.maturity_days,
      unknown_age_days: MODEL.unknown_age_days,
    },
    validation: board.validation.map((v) => [v.method, v.median_miss, v.within2, v.within3]),
    watchlist: snapshot.watchlist,
    factors: Object.fromEntries(
      Object.entries(board.factors).map(([cat, f]) => [cat, [Number(f.factor.toFixed(3)), f.n]]),
    ),
    verdicts: VERDICTS,
    // Rows are compact arrays, not objects, so the dashboard's source stays
    // under the 64 KB the dossier shows whole. The value maths (curve,
    // factor, growth, maturity) are recomputed by the page from the row's
    // own figures and the model above, so they are not repeated per row.
    // Layout: [rank, slug, name, category, chain, chainCount, tvl,
    // change7d, implied, verdict, ageDays]
    rows: board.rows.map((r) => [
      r.rank,
      r.slug,
      r.name,
      r.category,
      r.chains[0] ?? "Ethereum",
      r.chains.length,
      r.tvl_usd,
      r.change_7d === null ? null : Math.round(r.change_7d * 10) / 10,
      r.implied_value_usd,
      VERDICTS.indexOf(verdictFor(r.implied_value_usd, r.change_7d)),
      r.age_days,
    ]),
    // Family comparables as [name, mcap, tvl].
    family: Object.fromEntries(
      Object.entries(board.family).map(([cat, comps]) => [
        cat,
        comps.map((f) => [f.name, f.mcap_usd, f.tvl_usd]),
      ]),
    ),
    // Live tokens as [name, symbol, category, mcap, tvl].
    liveTop: board.liveTop.map((p) => [p.name, p.symbol, p.category, p.mcap_usd, p.tvl_usd]),
    // Set aside as [name, category, tvl, reason].
    setAside: board.setAside.map((p) => [p.name, p.category, p.tvl_usd, p.reason]),
    // Rising fast: [rank, slug, name, category, tvl, change7d, implied].
    rising: board.rows
      .filter((r) => r.change_7d !== null && r.change_7d > 0)
      .sort((a, b) => (b.change_7d ?? 0) - (a.change_7d ?? 0) || b.tvl_usd - a.tvl_usd)
      .slice(0, 5)
      .map((r) => [r.rank, r.slug, r.name, r.category, r.tvl_usd, r.change_7d, r.implied_value_usd]),
  };

  mkdirp(output);
  mkdirp(join(output, "dashboard"));
  mkdirp(join(output, "screenshots"));

  writeFileSync(join(output, "board.json"), JSON.stringify(boardDoc, null, 2) + "\n", "utf8");
  writeFileSync(
    join(output, "dashboard", "data.js"),
    `window.RADAR = ${JSON.stringify(dataDoc)};\n`,
    "utf8",
  );
  copyDir(join(HERE, "dashboard"), join(output, "dashboard"));
  copyDir(join(HERE, "screenshots"), join(output, "screenshots"));

  const dossier = buildDossier(output, { text_max_bytes: 65536 });
  writeFileSync(join(output, "dossier.json"), dossier);

  const top = board.rows[0]!;
  const steak = board.rows.find((r) => r.slug === "steakhouse-financial");
  console.log(`board: ${board.rows.length} rows, watchlist ${board.counts.watchlist} covered, candidates ${board.counts.candidates}`);
  console.log(
    `curve: log10(mcap) = ${c.intercept.toFixed(3)} + ${c.slope.toFixed(3)}*log10(TVL), R2 ${c.r2.toFixed(3)}, n ${c.n}`,
  );
  console.log(
    `validation (repeated 5-fold CV on ${c.n} live tokens): full model median miss x${full.median_miss}, within 2x ${full.within2}%, within 3x ${full.within3}%`,
  );
  console.log(`#1 ${top.name} ${fmtUsd(top.implied_value_usd)}`);
  if (steak) console.log(`Steakhouse Financial #${steak.rank} ${fmtUsd(steak.implied_value_usd)}`);
  console.log(`dossier: ${dossier.length} bytes`);
}

main();
