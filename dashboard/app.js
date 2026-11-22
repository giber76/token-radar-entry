// Token Launch Radar — the page. Renders window.RADAR (data.js beside this
// page): the ranked board, the detail view with its farm steps, the method
// view with the size curve and the held-out test, and the two tables the
// board keeps apart from it. No network: every value comes from the sealed
// snapshot. Farm steps come from steps.js (window.FarmSteps), the same
// builder main.ts uses. The value maths are recomputed here from the row's
// own figures and the model in data.js. Row: [rank, slug, name, category,
// chain, chainCount, tvl, change7d, implied, verdict, ageDays]. Family:
// [name, mcap, tvl]. Live: [name, symbol, category, mcap, tvl]. Set aside:
// [name, category, tvl, reason]. Rising: [rank, slug, name, category, tvl,
// change7d, implied].

(function () {
  var D = window.RADAR;
  var rows = D.rows;
  var watch = new Set(D.watchlist || []);
  var RK = 0, SL = 1, NM = 2, CT = 3, CH = 4, CN = 5, TV = 6, G7 = 7, IM = 8, VD = 9, AG = 10;
  var M = D.model;
  var VERDICTS = D.verdicts;

  function fmt(x) {
    if (x >= 1e9) return "$" + (x / 1e9).toFixed(1) + "B";
    if (x >= 1e6) return "$" + (x / 1e6).toFixed(1) + "M";
    if (x >= 1e3) return "$" + (x / 1e3).toFixed(0) + "k";
    return "$" + x.toFixed(0);
  }
  function fmtPct(x) { return (x >= 0 ? "+" : "") + x.toFixed(1) + "%"; }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function changeText(g) {
    if (g === null || g === undefined) return "no 7-day TVL move is reported";
    return "TVL is " + (g >= 0 ? "up " : "down ") + Math.abs(g).toFixed(1) + "% over 7 days";
  }
  function ageText(days) {
    if (days === null || days === undefined) return "about a year";
    if (days >= 365) return (days / 365.25).toFixed(1) + " years";
    return Math.max(1, Math.round(days / 30.4)) + " months";
  }
  // The value maths, from the row's own figures and the fitted model.
  function baseOf(r) { return Math.pow(10, M.intercept + M.slope * Math.log10(r[TV])); }
  function factorOf(r) { var f = D.factors[r[CT]]; return f ? f : [1, 0]; }
  function growthOf(r) { return 1 + (clamp(r[G7] === null ? 0 : r[G7], M.growth_floor, M.growth_cap) / 100) * M.growth_weight; }
  function maturityOf(r) {
    var a = r[AG] === null || r[AG] === undefined ? M.unknown_age_days : r[AG];
    return M.maturity_floor + (Math.min(Math.max(a, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
  }

  // ---- header chips
  document.getElementById("metaChips").innerHTML =
    "<span class='chip'>Snapshot <b>" + D.as_of + "</b></span>" +
    "<span class='chip'><b>" + D.counts.board + "</b> ranked rows</span>" +
    "<span class='chip'><b>" + D.counts.watchlist + "</b> watchlist</span>" +
    "<span class='chip'>Held-out median miss <b>×" + M.cv_median_miss + "</b></span>" +
    "<span class='chip'><b>" + M.cv_within3 + "%</b> within 3×</span>" +
    "<span class='chip'>Top implied <b>" + fmt(rows[0][IM]) + "</b></span>";
  document.getElementById("srcNote").textContent = D.source;

  // ---- tabs
  var tabs = document.querySelectorAll("#tabs button");
  function showView(name) {
    tabs.forEach(function (b) { b.classList.toggle("active", b.dataset.view === name); });
    document.querySelectorAll(".view").forEach(function (v) { v.hidden = true; });
    document.getElementById("view-" + name).hidden = false;
  }
  tabs.forEach(function (btn) { btn.addEventListener("click", function () { showView(btn.dataset.view); }); });

  // ---- rising strip
  document.getElementById("rising").innerHTML =
    "<span class='rise-label'>Rising fast (7d TVL):</span> " +
    (D.rising || []).map(function (r) {
      return "<button class='rise-chip' data-slug='" + r[1] + "'>#" + r[0] + " " + esc(r[2]) + " <b>" + fmtPct(r[5]) + "</b></button>";
    }).join("");
  document.querySelectorAll(".rise-chip").forEach(function (b) {
    b.addEventListener("click", function () { showDetail(b.dataset.slug); });
  });

  // ---- board: filters + sort + render
  var body = document.getElementById("boardBody");
  var q = document.getElementById("q");
  var fCat = document.getElementById("fCat");
  var fChain = document.getElementById("fChain");
  var fMin = document.getElementById("fMin");
  var fWatch = document.getElementById("fWatch");
  var rowCount = document.getElementById("rowCount");
  var sortKey = "r";
  var sortDir = 1;

  var cats = [...new Set(rows.map(function (r) { return r[CT]; }).filter(Boolean))].sort();
  cats.forEach(function (c) {
    var o = document.createElement("option"); o.value = c; o.textContent = c; fCat.appendChild(o);
  });
  var chains = [...new Set(rows.map(function (r) { return r[CH]; }))].sort();
  chains.forEach(function (c) {
    var o = document.createElement("option"); o.value = c; o.textContent = c; fChain.appendChild(o);
  });

  function verdictClass(v) { return v <= 1 ? "pill" : v <= 3 ? "pill soft" : "pill early"; }
  function sortVal(r, k) {
    if (k === "f") return factorOf(r)[0];
    if (k === "r") return r[RK];
    if (k === "n") return r[NM];
    if (k === "c") return r[CT] || "";
    if (k === "ch") return r[CH];
    if (k === "t") return r[TV];
    if (k === "g") return r[G7] === null ? -9999 : r[G7];
    return r[IM];
  }

  function filtered() {
    var needle = q.value.trim().toLowerCase();
    var min = Number(fMin.value);
    return rows.filter(function (r) {
      if (needle && r[NM].toLowerCase().indexOf(needle) === -1 && r[SL].indexOf(needle) === -1) return false;
      if (fCat.value && r[CT] !== fCat.value) return false;
      if (fChain.value && r[CH] !== fChain.value) return false;
      if (min && r[IM] < min) return false;
      if (fWatch.checked && !watch.has(r[SL])) return false;
      return true;
    });
  }

  function renderBoard() {
    var list = filtered().sort(function (a, b) {
      var av = sortVal(a, sortKey), bv = sortVal(b, sortKey);
      if (av === bv) return a[RK] - b[RK];
      if (typeof av === "string") return sortDir * av.localeCompare(bv);
      return sortDir * (av - bv);
    });
    rowCount.textContent = list.length + " of " + rows.length + " rows";
    body.innerHTML = list.map(function (r) {
      return "<tr data-slug='" + r[SL] + "'>" +
        "<td class='num'>" + r[RK] + "</td>" +
        "<td class='name'>" + esc(r[NM]) + (watch.has(r[SL]) ? " <span class='wl' title='On the snapshot watchlist'>W</span>" : "") + "</td>" +
        "<td>" + (r[CT] || "—") + "</td>" +
        "<td>" + r[CH] + (r[CN] > 1 ? " +" + (r[CN] - 1) : "") + "</td>" +
        "<td class='num'>" + fmt(r[TV]) + "</td>" +
        "<td class='num'>" + (r[G7] === null ? "—" : fmtPct(r[G7])) + "</td>" +
        "<td class='num'><b>" + fmt(r[IM]) + "</b></td>" +
        "<td class='num'>" + factorOf(r)[0].toFixed(2) + "×</td>" +
        "<td><span class='" + verdictClass(r[VD]) + "'>" + VERDICTS[r[VD]] + "</span></td></tr>";
    }).join("");
    body.querySelectorAll("tr").forEach(function (tr) {
      tr.addEventListener("click", function () { showDetail(tr.dataset.slug); });
    });
  }

  document.querySelectorAll("#board th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var k = th.dataset.sort;
      if (sortKey === k) sortDir = -sortDir;
      else { sortKey = k; sortDir = k === "r" ? 1 : -1; }
      renderBoard();
    });
  });
  [q, fCat, fChain, fMin, fWatch].forEach(function (el) { el.addEventListener("input", renderBoard); });

  // ---- detail view
  function showDetail(slug) {
    var r = rows.find(function (x) { return x[SL] === slug; });
    if (!r) return;
    body.querySelectorAll("tr").forEach(function (tr) { tr.classList.toggle("selected", tr.dataset.slug === slug); });
    var f = factorOf(r);
    var fam = (D.family[r[CT]] || []).map(function (c) {
      return "<span class='famchip'><b>" + esc(c[0]) + "</b> · mcap " + fmt(c[1]) + " · TVL " + fmt(c[2]) + " · " + (c[1] / c[2]).toFixed(2) + "× TVL</span>";
    });
    var steps = window.FarmSteps.farmSteps(
      { name: r[NM], category: r[CT], chain: r[CH], nChains: r[CN], tvl_usd: r[TV], change_7d: r[G7] }, r[AG]
    ).map(function (s, i) { return "<p><span class='n'>" + (i + 1) + ".</span>" + esc(s) + "</p>"; }).join("");
    var el = document.getElementById("detail");
    el.hidden = false;
    el.innerHTML =
      "<h2>" + esc(r[NM]) + "</h2>" +
      "<p class='dmeta'>Rank <b>#" + r[RK] + "</b> · Implied value <b>" + fmt(r[IM]) + "</b> · TVL " + fmt(r[TV]) +
      " · " + changeText(r[G7]) + " · " + (r[CT] || "no category") + " on " + r[CH] +
      (r[CN] > 1 ? " (+" + (r[CN] - 1) + " more chains)" : "") +
      " · running " + ageText(r[AG]) + " with no token recorded" +
      " · <span class='" + verdictClass(r[VD]) + "'>" + VERDICTS[r[VD]] + "</span></p>" +
      "<p class='maths'>How the value is built: " + fmt(r[TV]) + " TVL → size curve " + fmt(baseOf(r)) +
      " × " + f[0].toFixed(2) + " (" + esc(r[CT] || "no category") + ", " + f[1] + " live token" + (f[1] === 1 ? "" : "s") + ")" +
      " × " + growthOf(r).toFixed(2) + " (7-day growth) × " + maturityOf(r).toFixed(2) + " (maturity) = <b>" + fmt(r[IM]) + "</b></p>" +
      "<div class='fam'>" + (fam.length ? fam.join("") : "<span class='famchip'>No live token in this category — the curve alone sets the value.</span>") + "</div>" +
      "<div class='steps'>" + steps + "</div>";
    el.scrollIntoView({ behavior: "auto", block: "nearest" });
  }

  // ---- method view
  (function validation() {
    document.querySelector("#validTable tbody").innerHTML = D.validation.map(function (v) {
      return "<tr><td>" + esc(v[0]) + "</td><td class='num'>×" + v[1].toFixed(2) + "</td><td class='num'>" + v[2].toFixed(1) + "%</td><td class='num'>" + v[3].toFixed(1) + "%</td></tr>";
    }).join("");
    var full = D.validation[D.validation.length - 1];
    document.getElementById("validNote").textContent =
      "The full model — curve, category factor, growth and maturity — misses the typical live token's market cap by ×" + full[1].toFixed(2) +
      ", and lands within 3× for " + full[3].toFixed(1) + "% of them. Each term earns its place: the curve alone misses by ×" + D.validation[1][1].toFixed(2) +
      ", the factor takes it to ×" + D.validation[2][1].toFixed(2) + ", and the growth and maturity terms take it to ×" + full[1].toFixed(2) + ".";
  })();
  document.getElementById("formula").textContent = M.formula;
  document.getElementById("fitNote").textContent =
    "Each dot is one of the " + D.liveTop.length + " largest live tokens, at the market's own value. " +
    "The line is the fitted curve. A token above the line trades rich against its TVL; below it, cheap. " +
    "The fit is weak (R² " + M.r2.toFixed(2) + "): size alone does not price a token, which is why the category factor carries the rest — and why the test above, not the R², is the number that matters.";
  document.getElementById("modelStats").innerHTML =
    "<dt>Size curve</dt><dd>" + M.formula + "</dd>" +
    "<dt>Fitted on</dt><dd>" + M.n + " live tokens (a market cap, a TVL, no exchange token)</dd>" +
    "<dt>R²</dt><dd>" + M.r2.toFixed(3) + " — size explains little on its own</dd>" +
    "<dt>Held-out median miss</dt><dd>×" + M.cv_median_miss + " (full model, repeated five-fold)</dd>" +
    "<dt>Within 2× / 3× held-out</dt><dd>" + M.cv_within2 + "% / " + M.cv_within3 + "%</dd>";
  document.getElementById("bench").textContent =
    "Live tokens trade at a median of " + M.bench.toFixed(2) + "× their TVL. " +
    "The curve says a $1B-TVL protocol is worth about " + fmt(Math.pow(10, M.intercept + M.slope * 9)) +
    " — the benchmark multiple is the quick check, the curve is the calibrated one.";
  document.getElementById("leftout").textContent =
    "No chain term: how many chains a protocol runs on showed no held-out signal (correlation -0.02 with the pricing residual), so the model does not pretend it prices a token. " +
    "No thin-category guard: a category's factor is shrunk toward 1 by its comparables, so a thin category cannot crown a winner on one token — and a genuine leader is not compressed the way a guard would compress it.";

  // scatter plot
  (function scatter() {
    var W = 640, H = 360, P = 42;
    var pts = D.liveTop.filter(function (p) { return p[4] > 0 && p[3] > 0; });
    var xs = pts.map(function (p) { return Math.log10(p[4]); });
    var ys = pts.map(function (p) { return Math.log10(p[3]); });
    var x0 = Math.min.apply(null, xs) - 0.2, x1 = Math.max.apply(null, xs) + 0.2;
    var y0 = Math.min.apply(null, ys) - 0.3, y1 = Math.max.apply(null, ys) + 0.3;
    var X = function (x) { return P + ((x - x0) / (x1 - x0)) * (W - P * 2); };
    var Y = function (y) { return H - P - ((y - y0) / (y1 - y0)) * (H - P * 2); };
    var a = M.intercept, b = M.slope;
    var svg = "<svg viewBox='0 0 " + W + " " + H + "' width='100%' role='img' aria-label='Size curve scatter plot'>";
    svg += "<line x1='" + P + "' y1='" + (H - P) + "' x2='" + (W - P) + "' y2='" + (H - P) + "' stroke='#2a3342'/>";
    svg += "<line x1='" + P + "' y1='" + P + "' x2='" + P + "' y2='" + (H - P) + "' stroke='#2a3342'/>";
    svg += "<line x1='" + X(x0) + "' y1='" + Y(a + b * x0) + "' x2='" + X(x1) + "' y2='" + Y(a + b * x1) + "' stroke='#2dd4a7' stroke-width='2'/>";
    pts.forEach(function (p) {
      svg += "<circle cx='" + X(Math.log10(p[4])).toFixed(1) + "' cy='" + Y(Math.log10(p[3])).toFixed(1) + "' r='4' fill='#8b98a9'><title>" + esc(p[0]) + ": TVL " + fmt(p[4]) + ", mcap " + fmt(p[3]) + "</title></circle>";
    });
    svg += "<text x='" + (W / 2) + "' y='" + (H - 8) + "' fill='#8b98a9' font-size='12' text-anchor='middle'>log10(TVL)</text>";
    svg += "<text x='12' y='" + (H / 2) + "' fill='#8b98a9' font-size='12' text-anchor='middle' transform='rotate(-90 12 " + (H / 2) + ")'>log10(market cap)</text></svg>";
    document.getElementById("scatter").innerHTML = svg;
  })();

  // implied per $1,000 of TVL, top 10
  (function perK() {
    var top = rows.slice(0, 10);
    var vals = top.map(function (r) { return (r[IM] / r[TV]) * 1000; });
    var max = Math.max.apply(null, vals);
    document.getElementById("perK").innerHTML = top.map(function (r, i) {
      return "<div class='perk'><span>#" + r[RK] + " " + esc(r[NM]) + "</span>" +
        "<span class='bar'><i style='width:" + ((vals[i] / max) * 100).toFixed(1) + "%'></i></span>" +
        "<span class='val'>$" + vals[i].toFixed(0) + " / $1k TVL</span></div>";
    }).join("");
  })();

  // category factors table
  (function factors() {
    var entries = Object.entries(D.factors).sort(function (a, b) { return b[1][0] - a[1][0]; });
    document.querySelector("#factorTable tbody").innerHTML = entries.map(function (e) {
      var comps = (D.family[e[0]] || []).map(function (c) { return c[0]; }).join(", ");
      return "<tr><td>" + esc(e[0]) + "</td><td class='num'>" + e[1][1] + "</td><td class='num'>" + e[1][0].toFixed(2) + "×</td><td>" + (comps ? esc(comps) : "—") + "</td></tr>";
    }).join("");
  })();

  // ---- live tokens table
  (function live() {
    document.querySelector("#liveTable tbody").innerHTML = D.liveTop.map(function (p) {
      var curve = Math.pow(10, M.intercept + M.slope * Math.log10(p[4]));
      return "<tr><td class='name'>" + esc(p[0]) + (p[1] ? " (" + esc(p[1]) + ")" : "") + "</td><td>" + (p[2] || "—") + "</td>" +
        "<td class='num'>" + fmt(p[3]) + "</td><td class='num'>" + fmt(p[4]) + "</td>" +
        "<td class='num'>" + (p[3] / p[4]).toFixed(2) + "×</td><td class='num'>" + fmt(curve) + "</td></tr>";
    }).join("");
  })();

  // ---- set-aside table
  (function aside() {
    document.querySelector("#asideTable tbody").innerHTML = D.setAside.map(function (p) {
      return "<tr><td class='name'>" + esc(p[0]) + "</td><td>" + (p[1] || "—") + "</td>" +
        "<td class='num'>" + fmt(p[2]) + "</td><td>" + esc(p[3]) + "</td></tr>";
    }).join("");
  })();

  // ---- deep links: #view=method, #detail=<slug>, #cat=<category>,
  // ---- #chain=<chain>, #q=<text>, #watch=1, #min=<usd>. The screenshots
  // ---- are taken through these links, so each shot is a plain page load.
  (function hash() {
    var h = {};
    location.hash.slice(1).split("&").forEach(function (part) {
      var kv = part.split("=");
      if (kv[0]) h[kv[0]] = decodeURIComponent(kv[1] || "");
    });
    if (h.view) showView(h.view);
    if (h.cat) fCat.value = h.cat;
    if (h.chain) fChain.value = h.chain;
    if (h.q) q.value = h.q;
    if (h.min) fMin.value = h.min;
    if (h.watch) fWatch.checked = true;
    renderBoard();
    if (h.detail) showDetail(h.detail);
  })();
})();
