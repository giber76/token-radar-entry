# Token Launch Radar — v7

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/giber76/token-radar-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/giber76/token-radar-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entry for [token-radar-01 on make.fun](https://make.fun/bounty/token-radar-01).

Comps-calibrated token launch radar for make.fun token-radar-01. $1,325 prize, 1st $1,000. Ends 2026-12-14.

## Model (radar-7)

`implied = curve(TVL) × category factor × growth × maturity`, all fitted or
counted from the sealed snapshot at run time — nothing names a protocol in
advance.

- **Size curve**: `log10(market cap) = a + b·log10(TVL)`, least squares on the
  snapshot's live tokens (a market cap, a TVL, no exchange token).
- **Category factor**: median residual of the category's live tokens against
  the curve, shrunk toward 1 by `n/(n+10)`, clamped to 0.25–4. No
  thin-category guard — the shrinkage is the guard.
- **Growth**: `1 + clamp(change_7d, -50, 100)/100 × 0.8`. **Maturity**:
  `0.7 + min(age, 1095)/1095 × 0.3`. No chain term (no held-out signal).
- **Pre-token, strictly**: no market cap, no CoinGecko id, no symbol — all
  three. The board ranks the whole rankable universe (198 rows), watchlist
  included; live tokens are comparables, never ranked.
- **Tested held-out**: five-fold cross-validation on the live tokens, shown
  in full on the Method tab (curve, factor and full model vs the global
  median). Full model median miss ×2.96, 50% within 3×.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22+, standard library only, no network. Deterministic: two runs write
identical bytes. The farm-step builder (`dashboard/steps.js`) is shared
between main.ts and the page, so the steps in board.json and in the detail
view are one builder, never two copies.

## Files

- `main.ts` — entrypoint; writes board.json, dashboard/data.js, dossier.json.
- `lib/model.ts` — eligibility, curve, factors, cross-validation, board.
- `dashboard/` — index.html, app.css, app.js, steps.js (the page).
- `vendor/makefun-board.ts` — the kit's dossier builder, byte for byte.
- `screenshots/` — board, detail, filtered, method (1440×900 JPEG).

## v7 vs v6

v6 (judge 470,482) ranked 94 of 200 rows whose token already trades — its
eligibility checked only the market cap, not the symbol or CoinGecko id — and
capped its genuine leader with a thin-category guard. v7 fixes the rule,
drops the guard, and adds the held-out test the leaders advertise. v4
(925,498) is the entry to beat.
