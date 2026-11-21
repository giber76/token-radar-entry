// Token Launch Radar — entry point.
//
// Reads the sealed snapshot, ranks the launch candidates, and writes:
//   /output/board.json        the ranked board (200 rows, farm plan each)
//   /output/dashboard/data.js the dashboard's data, beside the page
//   /output/dashboard/        index.html, app.css, app.js (copied from here)
//   /output/screenshots/      the four screenshots (copied from here)
//   /output/dossier.json      the dossier, byte for byte from buildDossier
//
// Node 22, standard library only. No network. Deterministic: two runs write
// the same bytes. The output directory is never removed — a mount point
// cannot be removed, so the program only creates it and writes into it.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBoard,
  farmSteps,
  STEP_TEMPLATES,
  CATEGORY_ACTION,
  fmtUsdFull,
  type Snapshot,
  type Board,
} from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

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

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const snapshot = JSON.parse(readFileSync(input, "utf8")) as Snapshot;
  const board: Board = buildBoard(snapshot);
  const c = board.curve;

  // ---- board.json: the ranked board, the model, and the two tables the
  // ---- board keeps apart from the ranking.
  const boardDoc = {
    schema: "makefun/board/v1",
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: {
      size_curve: {
        formula: `log10(market cap) = ${c.intercept.toFixed(2)} + ${c.slope.toFixed(2)} * log10(TVL)`,
        fit: {
          intercept: Number(c.intercept.toFixed(3)),
          slope: Number(c.slope.toFixed(3)),
          r2: Number(c.r2.toFixed(3)),
          n: c.n,
          loo_median_miss: Number(c.looMiss.toFixed(2)),
          middle_half_band: {
            low: Number(Math.pow(10, c.q25dex).toFixed(2)),
            high: Number(Math.pow(10, c.q75dex).toFixed(2)),
          },
        },
        note:
          "Fitted by least squares on the snapshot's own live tokens with TVL of $10M or more. " +
          "R2 is low on purpose: the curve is the baseline, and the category factor carries the rest.",
      },
      category_factors: Object.fromEntries(
        Object.entries(board.factors).map(([cat, f]) => [
          cat,
          { factor: Number(f.factor.toFixed(3)), n: f.n },
        ]),
      ),
      thin_category_guard: {
        min_comparables: 3,
        anchor: "90th percentile of the board's implied values",
        anchor_usd: board.anchor_usd,
        excess_kept: 0.05,
        note:
          "A category with fewer than three live tokens cannot crown a winner: its excess above " +
          "the 90th percentile is compressed to 5%. Steakhouse Financial (Risk Curators, one live " +
          "comparable) is the case that forced this rule — without it the single comparable's " +
          "residual would have put it far above every other launch candidate.",
      },
    },
    rows: board.rows,
    live_tokens: board.liveTop,
    set_aside: board.setAside,
  };

  // ---- dashboard data: compact rows, the family strips, the live table,
  // ---- the set-aside list, and the farm-step templates the page fills in.
  // The source line is written without its scheme: the dashboard's files
  // name no http(s) address, and the source is data, not a link.
  const sourceText = snapshot.source.replace("https://", "").replace("http://", "");
  const dataDoc = {
    as_of: snapshot.as_of,
    source: sourceText,
    floor_usd: snapshot.floor_usd,
    counts: board.counts,
    model: {
      intercept: Number(c.intercept.toFixed(3)),
      slope: Number(c.slope.toFixed(3)),
      r2: Number(c.r2.toFixed(3)),
      n: c.n,
      loo: Number(c.looMiss.toFixed(2)),
      bandLow: Number(Math.pow(10, c.q25dex).toFixed(2)),
      bandHigh: Number(Math.pow(10, c.q75dex).toFixed(2)),
      formula: `log10(market cap) = ${c.intercept.toFixed(2)} + ${c.slope.toFixed(2)} × log10(TVL)`,
      anchor_usd: board.anchor_usd,
      bench: Number(board.bench_multiple.toFixed(3)),
    },
    watchlist: snapshot.watchlist,
    factors: board.factors,
    stepTemplates: STEP_TEMPLATES,
    actions: CATEGORY_ACTION,
    // Rows are compact arrays, not objects, so the dashboard's source stays
    // under the 64 KB the dossier shows whole. Layout:
    // [rank, slug, name, category, chain, chainCount, tvl, change7d,
    //  implied, verdict, capped, listedAt]
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
      r.verdict.startsWith("Farm now — top")
        ? 0
        : r.verdict.startsWith("Farm now — size")
          ? 1
          : r.verdict.startsWith("Strong")
            ? 2
            : r.verdict.startsWith("Worth")
              ? 3
              : r.verdict.startsWith("Early — small")
                ? 4
                : 5,
      r.capped ? 1 : 0,
      r.listed_at,
    ]),
    // Family comparables as [name, mcap, tvl, ratio].
    family: Object.fromEntries(
      Object.entries(board.family).map(([cat, comps]) => [
        cat,
        comps.map((f) => [f.name, f.mcap_usd, f.tvl_usd, f.ratio]),
      ]),
    ),
    // Live tokens as [name, symbol, category, mcap, tvl, curve].
    liveTop: board.liveTop.map((p) => [
      p.name,
      p.symbol,
      p.category,
      p.mcap_usd,
      p.tvl_usd,
      p.curve_usd,
    ]),
    // Set aside as [name, category, tvl, reason].
    setAside: board.setAside.map((p) => [p.name, p.category, p.tvl_usd, p.reason]),
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

  const top = board.rows[0];
  const steak = board.rows.find((r) => r.slug === "steakhouse-financial");
  console.log(`board: ${board.rows.length} rows, watchlist ${board.counts.watchlist} covered`);
  console.log(
    `curve: log10(mcap) = ${c.intercept.toFixed(3)} + ${c.slope.toFixed(3)}*log10(TVL), R2 ${c.r2.toFixed(3)}, n ${c.n}, LOO x${c.looMiss.toFixed(2)}`,
  );
  console.log(`#1 ${top.name} ${fmtUsdFull(top.implied_value_usd)}`);
  if (steak) {
    console.log(
      `Steakhouse Financial #${steak.rank} ${fmtUsdFull(steak.implied_value_usd)} (capped: ${steak.capped})`,
    );
  }
  console.log(`dossier: ${dossier.length} bytes`);
}

main();
