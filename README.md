# Token Launch Radar

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/giber76/token-radar-entry/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/giber76/token-radar-entry/reward.svg)](https://make.fun/bounty/token-radar-01)

What the next token would be worth: every protocol in the snapshot that records
no token, ranked by the implied value of the token it would issue if the market
priced it the way it prices the tokens that already trade.

## The model — band blend (v8)

`implied = TVL × blended multiple × growth × maturity × chains`

The blended multiple is **70% the protocol's category median** (market-cap / TVL
of the live tokens in its category, family, or the whole market — at least 3
comparables, clamped 0.05×–1.5×) and **30% its TVL-band median** (the median
multiple of live tokens in the same TVL band). Both medians are counted from the
snapshot at run time; nothing here names a protocol in advance.

Why blend: a pure category multiple ignores size, but live tokens show a real
size effect — the median multiple falls from 0.65 under $20M of TVL to 0.03
over $500M. A pure log-log size curve applies that effect far too hard (it
prices a $2.75B protocol at $68M, a multiple no reader believes). The 70/30
blend keeps the top of the board plausible while letting size move the middle.
A held-out test on the snapshot's live tokens (split by slug, fitted on one
half, predicted on the other) shows the blend beats the pure category multiple
— while the pure log-log curve has the best median error, it prices the biggest
launches at multiples no reader believes, so the blend keeps the top of the
board plausible instead of chasing the median. See the Method & checks tab in
the dashboard.

## What counts as pre-token

A protocol is pre-token only when its record carries **no market cap, no
CoinGecko id and no symbol** — all three. The board ranks every rankable
pre-token protocol (198 on this snapshot): the house watchlist plus every other
pre-token protocol that is not a wrapped, staked or bridged product of a token
that already trades. Live-token protocols appear only as comparables, at the
market's own values, never on the ranked board.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Reads `/input/snapshot.json` by default, writes `board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json` to the output directory.
Node 22, standard library only. The dashboard is a static page with no
network: open `dashboard/index.html` beside the `data.js` this program writes.

## Farm plans

Every board row carries an 8-step farm plan derived from the protocol's own
record — category, chains, TVL and age. Gas is priced from the chain it runs
on (Ethereum dear, Solana cheap), and the hold step reads the protocol's own
7-day TVL move.

## License

MIT — see LICENSE.
