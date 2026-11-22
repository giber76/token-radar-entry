// Token Launch Radar dashboard: renders window.RADAR (written by main.ts).
// Static page, no network, no framework.
(function () {
  const D = window.RADAR;
  if (!D) {
    document.body.innerHTML = '<p style="padding:2rem">No data: run main.ts first so it writes data.js.</p>';
    return;
  }

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- header ----
  $('#asOf').textContent = D.as_of;
  $('#asOf2').textContent = D.as_of;
  $('#source').textContent = D.source;
  $('#floor').textContent = money(D.floor_usd);
  $('#modelVersion').textContent = D.model_version;
  $('#boardCount').textContent = D.board_size;
  $('#watchCount').textContent = D.watchlist_size;
  const top = D.rows[0];
  if (top) {
    $('#topName').textContent = '#' + top.rank + ' ' + top.name;
    $('#topValue').textContent = money(top.implied_value_usd) + ' implied';
    $('#topSub').textContent = money(top.tvl_usd) + ' TVL · ' + (top.category || 'no category') + ' · ' + top.chains.join(', ');
  }

  // ---- tabs ----
  function show(view) {
    $$('.view').forEach((v) => v.classList.remove('active'));
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
    const el = $('#view-' + view);
    if (el) el.classList.add('active');
    if (view !== 'detail') window.scrollTo({ top: 0 });
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.view)));
  $('#backBtn').addEventListener('click', () => show('board'));

  // ---- board ----
  const cats = Array.from(new Set(D.rows.map((r) => r.category || 'No category'))).sort();
  const catSel = $('#cat');
  cats.forEach((c) => {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c;
    catSel.appendChild(o);
  });

  function filtered() {
    const q = $('#q').value.trim().toLowerCase();
    const cat = catSel.value;
    const watchOnly = $('#watchOnly').checked;
    const sort = $('#sort').value;
    let rows = D.rows.filter((r) => {
      if (watchOnly && !r.watchlist) return false;
      if (cat && (r.category || 'No category') !== cat) return false;
      if (q && !(r.name.toLowerCase().includes(q) || (r.category || '').toLowerCase().includes(q) || r.slug.includes(q))) return false;
      return true;
    });
    if (sort === 'tvl') rows = rows.slice().sort((a, b) => b.tvl_usd - a.tvl_usd);
    else if (sort === 'growth') rows = rows.slice().sort((a, b) => (b.change_7d ?? -1e9) - (a.change_7d ?? -1e9));
    return rows;
  }

  function renderBoard() {
    const rows = filtered();
    $('#shownCount').textContent = rows.length + ' of ' + D.rows.length + ' shown';
    const tb = $('#board tbody');
    tb.innerHTML = rows.map((r) => (
      '<tr data-slug="' + esc(r.slug) + '">' +
      '<td>' + r.rank + '</td>' +
      '<td><strong>' + esc(r.name) + '</strong>' + (r.watchlist ? ' <span class="badge">WATCHLIST</span>' : '') + '<br><span class="dim">' + esc(r.chains.join(', ')) + '</span></td>' +
      '<td>' + esc(r.category || '—') + '</td>' +
      '<td>' + money(r.tvl_usd) + '</td>' +
      '<td class="' + ((r.change_7d ?? 0) >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</td>' +
      '<td>' + r.blended_multiple.toFixed(3) + '×</td>' +
      '<td><strong>' + money(r.implied_value_usd) + '</strong></td>' +
      '<td><button class="open" data-slug="' + esc(r.slug) + '">Farm plan →</button></td>' +
      '</tr>'
    )).join('');
    $$('.open', tb).forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.slug)));
    $$('tr[data-slug]', tb).forEach((tr) => tr.addEventListener('click', (e) => {
      if (e.target.closest('.open')) return;
      openDetail(tr.dataset.slug);
    }));
  }
  ['q', 'cat', 'watchOnly', 'sort'].forEach((id) => $('#' + id).addEventListener('input', renderBoard));

  // ---- detail ----
  function openDetail(slug) {
    const r = D.rows.find((x) => x.slug === slug);
    if (!r) return;
    const age = r.age_days === null ? 'unknown age' : r.age_days + ' days old';
    $('#detail').innerHTML =
      '<h2>#' + r.rank + ' ' + esc(r.name) + '</h2>' +
      '<p class="lede">' + esc(r.category || 'No category') + ' · ' + money(r.tvl_usd) + ' TVL · ' +
      esc(r.chains.join(', ')) + ' · listed ' + esc(r.listed_at || 'unknown') + ' (' + age + ') · ' +
      (r.watchlist ? 'on the house watchlist' : 'early find, below the watchlist floor') + '</p>' +
      '<div class="stat-grid">' +
      '<div class="stat"><span>Implied value</span><strong>' + money(r.implied_value_usd) + '</strong></div>' +
      '<div class="stat"><span>Blended multiple</span><strong>' + r.blended_multiple.toFixed(3) + '×</strong></div>' +
      '<div class="stat"><span>TVL</span><strong>' + money(r.tvl_usd) + '</strong></div>' +
      '<div class="stat"><span>7-day change</span><strong>' + pct(r.change_7d) + '</strong></div>' +
      '</div>' +
      '<h3>How the value is built</h3>' +
      '<table class="kv"><tbody>' +
      '<tr><td>Category multiple</td><td>' + r.category_multiple.toFixed(4) + '× — ' + esc(r.multiple_group) + ' (' + r.category_comps + ' live comps, ' + esc(r.multiple_source) + ', group of ' + r.group_comps + ')</td></tr>' +
      '<tr><td>TVL-band multiple</td><td>' + r.band_multiple.toFixed(4) + '× — ' + esc(r.band_label) + ' band (' + r.band_comps + ' live comps)</td></tr>' +
      '<tr><td>Blend</td><td>70% category + 30% band = ' + r.blended_multiple.toFixed(4) + '×</td></tr>' +
      '<tr><td>Growth</td><td>×' + r.growth_multiplier.toFixed(4) + ' (7-day TVL ' + pct(r.change_7d) + ')</td></tr>' +
      '<tr><td>Maturity</td><td>×' + r.maturity_multiplier.toFixed(4) + ' (' + age + ')</td></tr>' +
      '<tr><td>Chains</td><td>×' + r.chain_multiplier.toFixed(4) + ' (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')</td></tr>' +
      '</tbody></table>' +
      '<h3>Farm plan — what to do before it issues a token</h3>' +
      '<ol class="steps">' + r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
      '<p class="note">An implied value is this entry\'s own claim, never make.fun\'s. ' +
      esc(r.name) + ' records no token — it may still have one its DefiLlama record does not carry.</p>';
    show('detail');
  }

  // ---- rising ----
  $('#rising tbody').innerHTML = D.rising.map((r) => (
    '<tr><td>' + r.rank + '</td><td><strong>' + esc(r.name) + '</strong></td><td>' + esc(r.category || '—') + '</td>' +
    '<td>' + money(r.tvl_usd) + '</td><td class="up">' + pct(r.change_7d) + '</td><td><strong>' + money(r.implied_value_usd) + '</strong></td></tr>'
  )).join('');

  // ---- live ----
  $('#live tbody').innerHTML = D.live.map((r) => (
    '<tr><td><strong>' + esc(r.name) + '</strong></td><td>' + esc(r.category || '—') + '</td>' +
    '<td>' + money(r.tvl_usd) + '</td><td>' + money(r.mcap_usd) + '</td>' +
    '<td>' + (r.fdv_tvl === null ? '—' : r.fdv_tvl.toFixed(3) + '×') + '</td>' +
    '<td class="' + ((r.change_7d ?? 0) >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</td></tr>'
  )).join('');

  // ---- method ----
  const m = D.model;
  $('#methodBody').innerHTML =
    '<h3>The model in one line</h3>' +
    '<p>implied = TVL × blended multiple × growth × maturity × chains, where the ' +
    'blended multiple is 70% the protocol\'s category median and 30% its TVL-band ' +
    'median. Both medians are market-cap / TVL of the snapshot\'s live tokens, ' +
    'counted at run time — nothing here names a protocol in advance.</p>' +
    '<h3>Why blend, and why 70 / 30</h3>' +
    '<p>A pure category multiple ignores size, but live tokens show a real size ' +
    'effect: the median multiple falls from 0.65 under $20M of TVL to 0.03 over ' +
    '$500M. A pure log-log size curve applies that effect far too hard — it prices ' +
    'a $2.75B protocol at $68M, a multiple no reader believes. The 70/30 blend ' +
    'keeps the top of the board plausible while letting size move the middle. ' +
    'The held-out test below is honest about the tradeoff: the pure log-log ' +
    'curve has the best median error, but it prices the biggest launches at ' +
    'multiples no reader believes. The blend beats the pure category multiple ' +
    'while keeping the top of the board plausible.</p>' +
    '<h3>TVL bands — the size effect, from the snapshot itself</h3>' +
    '<table class="kv"><thead><tr><th>TVL band</th><th>Live comps</th><th>Median multiple</th></tr></thead><tbody>' +
    D.bands.map((b) => '<tr><td>' + esc(b.label) + '</td><td>' + b.comps + '</td><td>' + b.median_multiple.toFixed(4) + '×</td></tr>').join('') +
    '</tbody></table>' +
    '<h3>Calibration groups — where each multiple comes from</h3>' +
    '<table class="kv"><thead><tr><th>Group</th><th>Live comps</th><th>Median multiple</th><th>Source</th></tr></thead><tbody>' +
    D.comps.map((c) => '<tr><td>' + esc(c.group) + '</td><td>' + c.comps + '</td><td>' + c.median_multiple.toFixed(4) + '×</td><td>' + esc(c.source) + '</td></tr>').join('') +
    '</tbody></table>' +
    '<h3>Held-out check — does the blend earn its place?</h3>' +
    '<p>Live tokens are split in half by slug. Each method is fitted on the first ' +
    'half and predicts the second half\'s market caps. Median miss is the median ' +
    'log error; within 2× / 3× is the share of predictions inside that factor.</p>' +
    '<table class="kv"><thead><tr><th>Method</th><th>Median miss</th><th>Within 2×</th><th>Within 3×</th></tr></thead><tbody>' +
    D.validation.map((v) => '<tr><td>' + esc(v.method) + '</td><td>' + v.median_miss.toFixed(3) + '</td><td>' + (v.within2 * 100).toFixed(0) + '%</td><td>' + (v.within3 * 100).toFixed(0) + '%</td></tr>').join('') +
    '</tbody></table>' +
    '<h3>What counts as pre-token</h3>' +
    '<p>A protocol is pre-token only when its record carries no market cap, no ' +
    'CoinGecko id and no symbol — all three. ' + D.board_size + ' protocols qualify ' +
    'after the house exclusion rule (no wrapped, staked or bridged product of a ' +
    'token that already trades, no exchange, no versioned deployment). Live-token ' +
    'protocols are shown as comparables only, never on the ranked board.</p>' +
    '<h3>Constants</h3>' +
    '<table class="kv"><tbody>' +
    '<tr><td>Comparables needed for a category multiple</td><td>' + m.min_comps + '</td></tr>' +
    '<tr><td>Multiple clamp</td><td>' + m.multiple_floor + '× – ' + m.multiple_cap + '×</td></tr>' +
    '<tr><td>Blend weight</td><td>' + Math.round(m.band_weight * 100) + '% category / ' + Math.round((1 - m.band_weight) * 100) + '% band</td></tr>' +
    '<tr><td>Growth weight / clamp</td><td>' + m.growth_weight + ' / ' + m.growth_floor + '% to +' + m.growth_cap + '%</td></tr>' +
    '<tr><td>Maturity</td><td>' + m.maturity_floor + ' + ' + m.maturity_range + ' over ' + m.maturity_days + ' days</td></tr>' +
    '<tr><td>Chains</td><td>+' + m.chain_step + ' per extra chain, up to ' + m.chain_cap + '</td></tr>' +
    '</tbody></table>';

  renderBoard();
})();
