// Token Radar dashboard: renders window.RADAR (written by main.ts from the same
// board.json) — board, filters, sorting, detail view, comparables, model.
// No network: every number on this page comes from the snapshot via data.js.
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) { document.body.textContent = 'Token Radar: no data.'; return; }

  var rows = R.rows, live = R.live, comps = R.comps;
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n == null || !isFinite(n)) return '<span class="flat">n/a</span>';
    var cls = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
    return '<span class="' + cls + '">' + (n > 0 ? '+' : '') + n.toFixed(1) + '%</span>';
  }
  function ageText(days) {
    if (days == null) return 'age n/a';
    if (days < 30) return days + 'd old';
    if (days < 365) return Math.round(days / 30) + 'mo old';
    return (days / 365).toFixed(1) + 'y old';
  }

  // ---- header facts -------------------------------------------------------
  $('asof').textContent = 'AS OF ' + R.as_of;
  $('glob').textContent = R.global_multiple.toFixed(3) + '×';
  $('src').textContent = 'Source: ' + R.source + '. Snapshot date ' + R.as_of +
    '. Model ' + R.model_version + '. “Records no token” is the snapshot’s record, not proof a token does not exist.';
  var top = rows[0];
  $('kpis').innerHTML =
    '<div><dt>Watchlist</dt><dd>' + R.watchlist_size + ' <small>protocols ≥ $50M, no token</small></dd></div>' +
    '<div><dt>Board</dt><dd>' + R.board_size + ' <small>ranked rows</small></dd></div>' +
    '<div><dt>Top implied value</dt><dd>' + money(top.implied_value_usd) + ' <small>' + esc(top.name) + '</small></dd></div>' +
    '<div><dt>Global multiple</dt><dd>' + R.global_multiple.toFixed(3) + '× <small>median mcap / TVL</small></dd></div>';

  // ---- filter options -----------------------------------------------------
  var cats = [], chains = [];
  rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  cats.forEach(function (c) { $('cat').appendChild(new Option(c, c)); });
  chains.forEach(function (c) { $('chain').appendChild(new Option(c, c)); });

  // ---- state, sorting, filtering ------------------------------------------
  var state = { q: '', cat: '', chain: '', wl: false, sort: 'rank' };
  var SORTS = {
    rank: function (a, b) { return a.rank - b.rank; },
    tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
    growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
    age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
    name: function (a, b) { return a.name.localeCompare(b.name); },
    implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
    category: function (a, b) { return (a.category || '').localeCompare(b.category || '') || a.rank - b.rank; },
    chains: function (a, b) { return (a.chains[0] || '').localeCompare(b.chains[0] || ''); }
  };
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (state.wl && !r.watchlist) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      return true;
    }).sort(SORTS[state.sort] || SORTS.rank);
  }
  function render() {
    var list = filtered();
    $('count').textContent = list.length + ' of ' + rows.length + ' protocols' +
      (state.wl ? ' · watchlist only' : '') + (state.cat ? ' · ' + state.cat : '') +
      (state.chain ? ' · ' + state.chain : '');
    $('rows').innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong>' +
        '<span class="sub">' + esc(r.slug) + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '<span class="sub">' + ageText(r.age_days) + '</span></td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num"><strong>' + money(r.implied_value_usd) + '</strong></td>' +
        '<td class="num">' + r.category_multiple.toFixed(2) + '×<span class="sub">' + r.category_comps + ' comps</span></td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="8">No protocols match these filters.</td></tr>';
  }

  // ---- detail view ----------------------------------------------------------
  function openDetail(slug) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) { r = rows[i]; break; }
    if (!r) return;
    var base = r.tvl_usd * r.category_multiple;
    $('detailBody').innerHTML =
      '<p class="meta">RANK #' + r.rank + ' OF ' + rows.length + (r.watchlist ? ' · ON THE WATCHLIST' : ' · BELOW THE FLOOR') + '</p>' +
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="meta">' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ') || '—') +
      ' · tracked since ' + esc(r.listed_at || 'unknown') + ' (' + ageText(r.age_days) + ')' +
      ' · 7-day TVL ' + (r.change_7d == null ? 'n/a' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</p>' +
      '<h3>Implied launch value — the maths</h3>' +
      '<table class="math"><tbody>' +
      '<tr><td>TVL</td><td>' + money(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Category multiple (' + esc(r.category || 'global') + ', ' + r.category_comps + ' comps)</td><td>× ' + r.category_multiple.toFixed(3) + '</td></tr>' +
      '<tr><td>Base value (TVL × multiple)</td><td>' + money(base) + '</td></tr>' +
      '<tr><td>Growth multiplier</td><td>× ' + r.growth_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>Maturity multiplier</td><td>× ' + r.maturity_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>Chain multiplier (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')</td><td>× ' + r.chain_multiplier.toFixed(3) + '</td></tr>' +
      '<tr class="total"><td>Implied value</td><td>' + money(r.implied_value_usd) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="note">The multiple is the median market-cap / TVL of live-token protocols in this category, ' +
      'taken from this same snapshot. No protocol name is ever special-cased.</p>' +
      '<h3>Farm plan — 8 steps</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<h3>Why it ranks here</h3><p>' + esc(r.name) + ' records no token, holds ' + money(r.tvl_usd) +
      ' of TVL' + (r.change_7d != null ? ' (' + (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '% in 7 days)' : '') +
      ', and its category trades at a median ' + r.category_multiple.toFixed(2) + '× TVL. ' +
      'That combination puts its implied launch value at ' + money(r.implied_value_usd) +
      ', rank #' + r.rank + ' of ' + rows.length + '.</p>';
    $('detail').hidden = false;
    $('scrim').hidden = false;
    if (location.hash !== '#detail=' + slug) history.replaceState(null, '', '#detail=' + slug);
  }
  function closeDetail() {
    $('detail').hidden = true;
    $('scrim').hidden = true;
    if (location.hash.indexOf('#detail=') === 0) history.replaceState(null, '', location.pathname);
  }
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  $('close').addEventListener('click', closeDetail);
  $('scrim').addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

  // ---- comparables + live tables -------------------------------------------
  $('comps').querySelector('tbody').innerHTML = comps.map(function (c) {
    return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.comps + '</td><td class="num">' + c.median_multiple.toFixed(3) + '×</td></tr>';
  }).join('');
  $('live').querySelector('tbody').innerHTML = live.map(function (p) {
    return '<tr><td><strong>' + esc(p.name) + '</strong><span class="sub">' + esc(p.slug) + '</span></td>' +
      '<td>' + esc(p.category || '—') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td class="num">' + money(p.mcap_usd) + '</td>' +
      '<td class="num">' + (p.fdv_tvl == null ? '—' : p.fdv_tvl.toFixed(2) + '×') + '</td></tr>';
  }).join('');

  // ---- wiring ----------------------------------------------------------------
  $('q').addEventListener('input', function () { state.q = this.value; render(); });
  $('cat').addEventListener('change', function () { state.cat = this.value; render(); });
  $('chain').addEventListener('change', function () { state.chain = this.value; render(); });
  $('wl').addEventListener('change', function () { state.wl = this.checked; render(); });
  $('sort').addEventListener('change', function () { state.sort = this.value; render(); });
  document.querySelectorAll('#board thead th[data-k]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-k');
      state.sort = k === 'rank' ? 'rank' : k === 'name' ? 'name' : k === 'category' ? 'category' :
        k === 'chains' ? 'chains' : k === 'tvl' ? 'tvl' : k === 'growth' ? 'growth' : k === 'implied' ? 'implied' : 'rank';
      $('sort').value = state.sort === 'implied' ? 'rank' : state.sort;
      render();
    });
  });

  // ---- hash state (deep links for the screenshots) ---------------------------
  (function applyHash() {
    var h = location.hash || '';
    if (h.indexOf('#detail=') === 0) { render(); openDetail(h.slice(8)); return; }
    if (h.indexOf('#filter=') === 0) {
      var f = decodeURIComponent(h.slice(8));
      if (f === 'watchlist') { state.wl = true; $('wl').checked = true; }
      else if (f.indexOf('cat:') === 0) { state.cat = f.slice(4); $('cat').value = state.cat; }
      else if (f.indexOf('chain:') === 0) { state.chain = f.slice(6); $('chain').value = state.chain; }
    }
    render();
  })();
  document.querySelector('main').setAttribute('aria-busy', 'false');
})();
