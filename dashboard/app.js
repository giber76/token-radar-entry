// Token Radar dashboard: renders window.RADAR (written by main.ts from the same
// board.json) — board, filters, sorting, detail view, comparables, model.
// No network: every number on this page comes from the snapshot via data.js.
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) { document.body.textContent = 'Token Radar: no data.'; return; }

  var rows = R.rows, live = R.live, comps = R.comps, fit = R.fit;
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
  function ageShort(days) {
    if (days == null) return 'n/a';
    if (days < 30) return days + ' d';
    if (days < 365) return Math.round(days / 30) + ' mo';
    return (days / 365).toFixed(1) + ' yr';
  }
  function ageText(days) {
    if (days == null) return 'age n/a';
    if (days < 30) return days + 'd old';
    if (days < 365) return Math.round(days / 30) + 'mo old';
    return (days / 365).toFixed(1) + 'y old';
  }
  function mult(n) { return (n == null || !isFinite(n)) ? '—' : n.toFixed(2) + '×'; }

  // ---- header facts -------------------------------------------------------
  $('asof').textContent = 'AS OF ' + R.as_of;
  $('src').textContent = 'Source: ' + R.source + '. Snapshot date ' + R.as_of +
    '. Model ' + R.model_version + '. “Records no token” is the snapshot’s record, not proof a token does not exist.';
  var top = rows[0];
  $('kpis').innerHTML =
    '<div><dt>Watchlist</dt><dd>' + R.watchlist_size + ' / ' + R.watchlist_size + ' <small>covered</small></dd></div>' +
    '<div><dt>Board</dt><dd>' + R.board_size + ' <small>ranked rows</small></dd></div>' +
    '<div><dt>Total implied value</dt><dd>' + money(R.total_implied) + '</dd></div>' +
    '<div><dt>Top implied value</dt><dd>' + money(top.implied_value_usd) + ' <small>' + esc(top.name) + '</small></dd></div>' +
    '<div><dt>Median miss (leave-one-out)</dt><dd>×' + fit.loo_median.toFixed(2) + '</dd></div>';
  $('counts').innerHTML = '<strong>' + R.board_size + ' ranked</strong> &nbsp;·&nbsp; ' +
    R.live_token_size + ' token on record &nbsp;·&nbsp; ' + R.set_aside_size + ' set aside &nbsp;·&nbsp; ' +
    fit.n + ' live tokens set the curve';

  // ---- scatter plot: the size curve, drawn from the fitted model ----------
  // Log-log: x = log10 TVL ($10K…$10B), y = log10 mcap ($10K…$100B).
  (function scatter() {
    var W = 520, H = 135, padL = 50, padB = 24, padT = 8, padR = 10;
    var x0 = 4, x1 = 10, y0 = 4, y1 = 11;
    function X(v) { return padL + (v - x0) / (x1 - x0) * (W - padL - padR); }
    function Y(v) { return H - padB - (v - y0) / (y1 - y0) * (H - padT - padB); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Size curve scatter plot">';
    var ticks = [5, 6, 7, 8, 9, 10];
    ticks.forEach(function (t, i) {
      s += '<line x1="' + X(t).toFixed(1) + '" y1="' + Y(y0).toFixed(1) + '" x2="' + X(t).toFixed(1) + '" y2="' + Y(y1).toFixed(1) + '" class="grid"/>';
      var anchor = i === ticks.length - 1 ? 'end' : 'middle';
      s += '<text x="' + X(t).toFixed(1) + '" y="' + (H - 6) + '" class="tick" text-anchor="' + anchor + '">$' + (t === 5 ? '100K' : t === 6 ? '1M' : t === 7 ? '10M' : t === 8 ? '100M' : t === 9 ? '1B' : '10B') + '</text>';
    });
    [5, 6, 7, 8, 9, 10, 11].forEach(function (t) {
      s += '<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(t).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '" class="grid"/>';
      s += '<text x="2" y="' + (Y(t) + 3).toFixed(1) + '" class="tick" text-anchor="start">$' + (t === 5 ? '100K' : t === 6 ? '1M' : t === 7 ? '10M' : t === 8 ? '100M' : t === 9 ? '1B' : t === 10 ? '10B' : '100B') + '</text>';
    });
    R.scatter.forEach(function (p) {
      s += '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="1.9" class="dot"><title>' + esc(p.name) + '</title></circle>';
    });
    var fx0 = X(x0), fy0 = Y(fit.intercept + fit.elasticity * x0);
    var fx1 = X(x1), fy1 = Y(fit.intercept + fit.elasticity * x1);
    s += '<line x1="' + fx0.toFixed(1) + '" y1="' + fy0.toFixed(1) + '" x2="' + fx1.toFixed(1) + '" y2="' + fy1.toFixed(1) + '" class="fitline"/>';
    s += '</svg>';
    $('scatter').innerHTML = s;
    $('scatterNote').textContent = fit.n + ' comparables · elasticity ' + fit.elasticity.toFixed(2) +
      ' · half land within ×' + Math.pow(10, fit.resid_p25).toFixed(2) + ' to ×' + Math.pow(10, fit.resid_p75).toFixed(2) +
      ' of the line · R² ' + fit.r2.toFixed(2);
  })();
  $('formula').textContent = 'value = 10^' + fit.intercept.toFixed(2) + ' × TVL^' + fit.elasticity.toFixed(2) +
    ' × category × seasoning × momentum';
  $('modelList').innerHTML =
    '<li><strong>Base</strong> — the size curve: 10^' + fit.intercept.toFixed(2) + ' × TVL^' + fit.elasticity.toFixed(2) +
    ', fitted on ' + fit.n + ' live tokens (R² ' + fit.r2.toFixed(2) + ').</li>' +
    '<li><strong>Category</strong> — the median residual of the protocol’s category off the line, shrunk ' +
    'toward 1 when thin; a thin category borrows its family median.</li>' +
    '<li><strong>Seasoning · Momentum · Breadth</strong> — age 0.70–1.00 over 3y; 7-day change at 80%, ' +
    'clamped −50%…+100%; +3% per extra chain, up to 4.</li>' +
    '<li><strong>Band</strong> — every value carries the curve’s middle-half band (×' +
    Math.pow(10, fit.resid_p25).toFixed(2) + '…×' + Math.pow(10, fit.resid_p75).toFixed(2) + '); ' +
    'leave-one-out median miss ×' + fit.loo_median.toFixed(2) + '.</li>';

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
  function compLabel(n) {
    return n + (n === 1 ? ' comp' : ' comps');
  }
  // Implied-value dot plot on a log scale ($10K…$100M): band + point.
  function dotPlot(r) {
    var lo = 4, hi = 8, W = 104, H = 16;
    function X(v) { return Math.max(0, Math.min(W, (Math.log10(Math.max(v, 1e4)) - lo) / (hi - lo) * W)); }
    var x1 = X(r.band_low), x2 = X(r.band_high), xd = X(r.implied_value_usd);
    return '<svg class="dotplot" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
      '<line x1="0" y1="8" x2="' + W + '" y2="8" class="track"/>' +
      '<line x1="' + x1.toFixed(1) + '" y1="8" x2="' + x2.toFixed(1) + '" y2="8" class="band"/>' +
      '<circle cx="' + xd.toFixed(1) + '" cy="8" r="3.4" class="dot"/>' +
      '</svg>';
  }
  function render() {
    var list = filtered();
    $('count').textContent = list.length + ' of ' + rows.length + ' protocols' +
      (state.wl ? ' · watchlist only' : '') + (state.cat ? ' · ' + state.cat : '') +
      (state.chain ? ' · ' + state.chain : '');
    $('rows').innerHTML = list.map(function (r) {
      var slice = r.implied_value_usd * 0.10 * 1000 / r.tvl_usd;
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong>' +
        '<span class="sub">' + esc(r.slug) + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageShort(r.age_days) + '</td>' +
        '<td class="num">' + dotPlot(r) + '<strong>' + money(r.implied_value_usd) + '</strong>' +
        '<span class="sub">' + money(r.band_low) + '–' + money(r.band_high) + '</span></td>' +
        '<td class="num">' + mult(r.implied_value_usd / r.tvl_usd) + '</td>' +
        '<td class="num">' + money(slice) + '</td>' +
        '<td>' + esc(r.farm_brief.verb) + ' · ' + esc(r.farm_brief.chain) +
        '<span class="sub">' + esc(r.farm_brief.fee) + ' · ' + esc(r.farm_brief.time) + '</span></td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="9">No protocols match these filters.</td></tr>';
  }

  // ---- detail view ----------------------------------------------------------
  function openDetail(slug) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) { r = rows[i]; break; }
    if (!r) return;
    var factorNote = r.multiple_source === 'category'
      ? 'The factor is the median residual of the ' + r.group_comps + ' live-token protocols in this category, off the size curve, shrunk toward 1.'
      : r.multiple_source === 'family'
        ? (r.category || 'Uncategorised') + ' has only ' + r.category_comps + ' live token' + (r.category_comps === 1 ? '' : 's') + ' of its own, so it borrows the ' + r.multiple_group + ' family median residual (' + compLabel(r.group_comps) + ').'
        : 'Its category has only ' + r.category_comps + ' live token' + (r.category_comps === 1 ? '' : 's') + ' and no family, so it is priced off the bare size curve.';
    var chainList = r.chains.length > 3 ? r.chains.slice(0, 3).join(', ') + ' +' + (r.chains.length - 3) + ' more' : r.chains.join(', ');
    var peers = r.family_peers.length > 0
      ? '<h3>Family comparables — the same line of work, at the market&rsquo;s own values</h3>' +
        '<table class="math"><thead><tr><th>Protocol</th><th>TVL</th><th>Market cap</th><th>mcap / TVL</th></tr></thead><tbody>' +
        r.family_peers.map(function (p) {
          return '<tr><td>' + esc(p.name) + '</td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td><td class="num">' + mult(p.multiple) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<p class="note">These live tokens set the ' + esc(r.multiple_group) + ' factor of ×' + r.category_factor.toFixed(2) +
        ' used above. No protocol name is ever special-cased.</p>'
      : '<p class="note">No live-token peer in this category or family trades on the snapshot.</p>';
    $('detailBody').innerHTML =
      '<p class="meta">RANK #' + r.rank + ' OF ' + rows.length + (r.watchlist ? ' · ON THE WATCHLIST' : ' · BELOW THE FLOOR') + '</p>' +
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="meta">' + esc(r.category || 'Uncategorised') + ' · ' + esc(chainList) +
      ' · tracked since ' + esc(r.listed_at || 'unknown') + ' (' + ageText(r.age_days) + ')' +
      ' · 7-day TVL ' + (r.change_7d == null ? 'n/a' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</p>' +
      '<h3>Implied launch value — the maths</h3>' +
      '<table class="math"><tbody>' +
      '<tr><td>Size-curve base (10^' + fit.intercept.toFixed(2) + ' × TVL^' + fit.elasticity.toFixed(2) + ')</td><td>' + money(r.base_value) + '</td></tr>' +
      '<tr><td>Category factor (' + esc(r.multiple_group) + ', ' + compLabel(r.group_comps) + ')</td><td>× ' + r.category_factor.toFixed(3) + '</td></tr>' +
      '<tr><td>Growth multiplier</td><td>× ' + r.growth_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>Maturity multiplier</td><td>× ' + r.maturity_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>Chain multiplier (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')</td><td>× ' + r.chain_multiplier.toFixed(3) + '</td></tr>' +
      '<tr class="total"><td>Implied value</td><td>' + money(r.implied_value_usd) + '</td></tr>' +
      '<tr><td>Middle-half band</td><td>' + money(r.band_low) + ' – ' + money(r.band_high) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="note">' + factorNote + '</p>' +
      peers +
      '<h3>Farm plan — 8 steps</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<h3>Why it ranks here</h3><p>' + esc(r.name) + ' records no token, holds ' + money(r.tvl_usd) +
      ' of TVL' + (r.change_7d != null ? ' (' + (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '% in 7 days)' : '') +
      ', and ' + esc(r.multiple_group) + ' trades at a factor of ×' + r.category_factor.toFixed(2) + ' off the size curve over ' + compLabel(r.group_comps) + '. ' +
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
  $('rising').querySelector('tbody').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  $('close').addEventListener('click', closeDetail);
  $('scrim').addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

  // ---- comparables + live + set-aside tables -------------------------------
  $('comps').querySelector('tbody').innerHTML = comps.map(function (c) {
    var basis = c.source === 'category' ? 'own category' : c.source === 'family' ? 'family' : 'bare curve';
    return '<tr><td>' + esc(c.group) + '</td><td class="num">' + c.comps + '</td><td class="num">' + c.median_multiple.toFixed(3) + '×</td><td>' + basis + '</td></tr>';
  }).join('');
  $('rising').querySelector('tbody').innerHTML = R.rising.map(function (x) {
    return '<tr data-slug="' + esc(x.slug) + '"><td><strong>' + esc(x.name) + '</strong><span class="sub">' + esc(x.slug) + '</span></td>' +
      '<td>' + esc(x.category || '—') + '</td>' +
      '<td class="num">' + money(x.tvl_usd) + '</td>' +
      '<td class="num">' + pct(x.change_7d) + '</td>' +
      '<td class="num"><strong>' + money(x.implied_value_usd) + '</strong></td>' +
      '<td class="num">#' + x.rank + '</td></tr>';
  }).join('');
  $('live').querySelector('tbody').innerHTML = live.map(function (p) {
    return '<tr><td><strong>' + esc(p.name) + '</strong><span class="sub">' + esc(p.slug) + '</span></td>' +
      '<td>' + esc(p.category || '—') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td class="num">' + money(p.mcap_usd) + '</td>' +
      '<td class="num">' + (p.fdv_tvl == null ? '—' : p.fdv_tvl.toFixed(2) + '×') + '</td></tr>';
  }).join('');
  $('setaside').querySelector('tbody').innerHTML = R.set_aside.map(function (p) {
    return '<tr><td><strong>' + esc(p.name) + '</strong><span class="sub">' + esc(p.slug) + '</span></td>' +
      '<td>' + esc(p.category || '—') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td>' + esc(p.reason) + '</td></tr>';
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
    if (h.indexOf('#section=') === 0) {
      render();
      var el = document.getElementById(h.slice(9) + 'Panel');
      if (el) el.scrollIntoView();
      return;
    }
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
