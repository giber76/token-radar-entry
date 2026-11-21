# Token Launch Radar

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/giber76/token-radar-entry/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/giber76/token-radar-entry/reward.svg)](https://make.fun/bounty/token-radar-01)

A dashboard that ranks protocols whose token does not exist yet by an implied value, calibrated on the market's own pricing — and shows how to farm each one.

## The model

Every number comes from the sealed snapshot (DefiLlama protocols, fetched 2026-11-14). Nothing is hardcoded by name.

1. **Size curve.** Least squares on the snapshot's live tokens with TVL of $10M or more: `log10(market cap) = 3.40 + 0.48 × log10(TVL)` (R² 0.16, n = 101). Size alone prices a token weakly — the curve is the baseline, not the answer.
2. **Category factor.** Each category's median residual against the curve, shrunk toward 1 by how many live tokens the category has (factor = 10^(median × n/(n+3)), clamped to 0.25–4×).
3. **The protocol's own record.** Its 7-day TVL move (clamped to −50…+200%), how long it has run with no token, and how many chains it runs on — each a small, capped adjustment.
4. **Thin-category guard.** A category with fewer than three live tokens cannot crown a winner: its excess above the board's 90th percentile is compressed to 5%. Steakhouse Financial (Risk Curators, one live comparable) lands at $49.8M instead of far above the leaders.
5. **Uncertainty.** Every row carries the middle-half band of the curve's residuals (×0.28 to ×4.47) and the model reports a leave-one-out median miss of ×3.86 — the market's own pricing is wide, and the board says so.

The board ranks 200 rows: the 40 watchlist protocols plus the 160 pre-token protocols below the floor with the most TVL. Live tokens are kept in their own table — they are the evidence, not the ranking — and the protocols the radar set aside are listed with the reason.

## The dashboard

- **Board:** sortable and filterable (search, category, chain, minimum implied value, watchlist only), with the implied value, the uncertainty band and a farm verdict per row.
- **Detail:** click a row for the family comparables that set its factor (at the market's own values), the uncertainty band, and eight concrete farm steps with what they cost and how long they take. Gas is priced from the protocol's own chain: about $15 on Ethereum, under $1 on Solana.
- **Method:** the size-curve scatter plot, the fit, the benchmark multiple (live tokens trade at a median 0.21× TVL), the implied value per $1,000 of TVL for the top 10, and the category factors.
- **Live tokens / Set aside:** the two tables the board keeps apart from the ranking.

## Running it

Node 22, standard library only, no network:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` reads the snapshot, writes `board.json` (the 200 ranked rows, the model, the live-token and set-aside tables), writes the dashboard's data into `dashboard/data.js`, copies `dashboard/` and `screenshots/` to the output, and writes `dossier.json` with the vendored `buildDossier`. Two runs write the same bytes.

## License

MIT — see [LICENSE](LICENSE).
