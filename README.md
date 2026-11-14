# Token Radar — pre-token protocols ranked by implied launch value

Entry for make.fun `token-radar-01`: build the best token launch radar.

## What it does

`main.ts` reads the sealed DefiLlama snapshot (`/input/snapshot.json`), scores
every rankable pre-token protocol with the comps-calibrated model in
`lib/model.ts`, and writes the ranked board (`board.json`), the dashboard data
(`data.js`), the dashboard and the screenshots into `/output`, plus
`dossier.json` via `vendor/makefun-board.ts`.

## The model (`radar-2 comps`)

A protocol that already trades tells the market what a dollar of TVL is worth
in its category. For each category the model takes the **median market-cap /
TVL of the snapshot's own live-token protocols** in that category (≥3
comparables, else the global median, clamped to 0.05…1.50), then adjusts by
the protocol's own 7-day TVL growth, its age since DefiLlama started tracking
it, and how many chains it runs on:

    implied = TVL × category multiple × growth × maturity × chains

No protocol name is ever special-cased. The board ranks **all 198 rankable
pre-token protocols** in the snapshot — the 40-protocol watchlist plus every
other pre-token protocol that passes the house exclusion rule for wrapped,
staked and bridged products of tokens that already trade. Live-token protocols are kept apart as comparables, at the market's own
values. Each row carries an 8-step farm plan with costs and times, derived
from the protocol's category, chains, TVL and age.

## The dashboard

A static page (no network): sortable/filterable board, a detail view per
protocol showing the value maths and the farm plan, the category comparables
table, and the live-token comparables. It reads the same `data.js` the board
was built from, so page and board always agree.

## Run it

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json

Runs are deterministic: two runs write identical bytes.

## License

MIT — see `LICENSE`.
