// Token Launch Radar — the page.
//
// Renders window.RADAR (written by main.ts into data.js beside this page):
// the ranked board, the detail view with its farm steps, the method view
// with the size curve, and the two tables the board keeps apart from it.
// No network: every value on this page comes from the sealed snapshot.
//
// Row layout: [rank, slug, name, category, chain, chainCount, tvl,
// change7d, implied, verdict, capped, listedAt]
// Family comp: [name, mcap, tvl, ratio]
// Live token: [name, symbol, category, mcap, tvl, curve]
// Set aside: [name, category, tvl, reason]

(function () {
  const D = window.RADAR;
  const rows = D.rows;
  const watch = new Set(D.watchlist || []);
  const RK = 0, SL = 1, NM = 2, CT = 3, CH = 4, CN = 5, TV = 6, G7 = 7, IM = 8, VD = 9, CP = 10, LA = 11;
  const VERDICTS = [
    "Farm now — top of the board, momentum with it",
    "Farm now — size leads, momentum soft",
    "Strong candidate — farm it this week",
    "Worth farming — solid size, real setup",
    "Early — small, watch it grow",
    "Early — tiny, only if you farm the category anyway",
  ];
  const GAS_USD = {
    Ethereum: 15, Solana: 0.5, Base: 0.5, Arbitrum: 1, Optimism: 0.5,
    Polygon: 0.5, "BNB Chain": 1, Avalanche: 1, Gnosis: 0.5, Linea: 0.5,
    Scroll: 0.5, zkSync: 0.5, Mantle: 0.5, Sui: 0.5, Aptos: 0.5,
  };
  const DEFAULT_ACTION = "use the protocol's core feature once with a small amount";

  function fmt(x) {
    if (x >= 1e9) return "$" + (x / 1e9).toFixed(1) + "B";
    if (x >= 1e6) return "$" + (x / 1e6).toFixed(1) + "M";
    if (x >= 1e3) return "$" + (x / 1e3).toFixed(0) + "k";
    return "$" + x.toFixed(0);
  }
  function fmtPct(x) {
    return (x >= 0 ? "+" : "") + x.toFixed(1) + "%";
  }
  function gasText(chain) {
    const usd = GAS_USD[chain] !== undefined ? GAS_USD[chain] : 1;
    return usd >= 1 ? "about $" + usd : "under $1";
  }
  function changeText(g) {
    if (g === null || g === undefined) return "no 7-day TVL move is reported";
    return "TVL is " + (g >= 0 ? "up " : "down ") + Math.abs(g).toFixed(1) + "% over 7 days";
  }
  function ageText(listed) {
    if (!listed) return "2.0 years";
    const [y, m, d] = listed.split("-").map(Number);
    const [ay, am, ad] = D.as_of.split("-").map(Number);
    const age = Math.max(0, (Date.UTC(ay, am - 1, ad) - Date.UTC(y, m - 1, d)) / 31557600000);
    return age >= 1 ? age.toFixed(1) + " years" : Math.max(1, Math.round(age * 12)) + " months";
  }
  function fillStep(tpl, row) {
    const action = D.actions[row[CT]] || DEFAULT_ACTION;
    return tpl
      .replaceAll("{name}", row[NM])
      .replaceAll("{chain}", row[CH])
      .replaceAll("{gas}", gasText(row[CH]))
      .replaceAll("{chg}", changeText(row[G7]))
      .replaceAll("{age}", ageText(row[LA]))
      .replaceAll("{Action}", action.charAt(0).toUpperCase() + action.slice(1))
      .replaceAll("{action}", action);
  }

  // ---- header chips
  const chips = document.getElementById("metaChips");
  chips.innerHTML =
    "<span class='chip'>Snapshot <b>" + D.as_of + "</b></span>" +
    "<span class='chip'><b>" + D.counts.board + "</b> ranked rows</span>" +
    "<span class='chip'><b>" + D.counts.watchlist + "</b> watchlist</span>" +
    "<span class='chip'>Curve fit on <b>" + D.model.n + "</b> live tokens</span>" +
    "<span class='chip'>R² <b>" + D.model.r2.toFixed(2) + "</b></span>";
  document.getElementById("srcNote").textContent = D.source;

  // ---- tabs
  const tabs = document.querySelectorAll("#tabs button");
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
      document.getElementById("view-" + btn.dataset.view).hidden = false;
    });
  });

  // ---- board: filters + sort + render
  const body = document.getElementById("boardBody");
  const q = document.getElementById("q");
  const fCat = document.getElementById("fCat");
  const fChain = document.getElementById("fChain");
  const fMin = document.getElementById("fMin");
  const fWatch = document.getElementById("fWatch");
  const rowCount = document.getElementById("rowCount");
  let sortKey = RK;
  let sortDir = 1;

  const cats = [...new Set(rows.map((r) => r[CT]).filter(Boolean))].sort();
  cats.forEach((c) => {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    fCat.appendChild(o);
  });
  const chains = [...new Set(rows.map((r) => r[CH]))].sort();
  chains.forEach((c) => {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    fChain.appendChild(o);
  });

  function verdictClass(v) {
    return v <= 1 ? "pill" : v <= 3 ? "pill soft" : "pill early";
  }

  function filtered() {
    const needle = q.value.trim().toLowerCase();
    const min = Number(fMin.value);
    return rows.filter((r) => {
      if (needle && r[NM].toLowerCase().indexOf(needle) === -1 && r[SL].indexOf(needle) === -1) return false;
      if (fCat.value && r[CT] !== fCat.value) return false;
      if (fChain.value && r[CH] !== fChain.value) return false;
      if (min && r[IM] < min) return false;
      if (fWatch.checked && !watch.has(r[SL])) return false;
      return true;
    });
  }

  function renderBoard() {
    const list = filtered().sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === bv) return a[RK] - b[RK];
      if (typeof av === "string") return sortDir * av.localeCompare(bv);
      return sortDir * (av - bv);
    });
    rowCount.textContent = list.length + " of " + rows.length + " rows";
    body.innerHTML = list
      .map((r) => {
        const lo = r[IM] * D.model.bandLow;
        const hi = r[IM] * D.model.bandHigh;
        return (
          "<tr data-slug='" + r[SL] + "'>" +
          "<td class='num'>" + r[RK] + "</td>" +
          "<td class='name'>" + r[NM] + (r[CP] ? " <span title='Thin category: factor from fewer than 3 live tokens, excess above the board&apos;s 90th percentile compressed'>&#9888;</span>" : "") + "</td>" +
          "<td>" + (r[CT] || "—") + "</td>" +
          "<td>" + r[CH] + (r[CN] > 1 ? " +" + (r[CN] - 1) : "") + "</td>" +
          "<td class='num'>" + fmt(r[TV]) + "</td>" +
          "<td class='num'>" + (r[G7] === null ? "—" : fmtPct(r[G7])) + "</td>" +
          "<td class='num'><b>" + fmt(r[IM]) + "</b></td>" +
          "<td class='num'>" + fmt(lo) + " – " + fmt(hi) + "</td>" +
          "<td><span class='" + verdictClass(r[VD]) + "'>" + VERDICTS[r[VD]] + "</span></td>" +
          "</tr>"
        );
      })
      .join("");
    body.querySelectorAll("tr").forEach((tr) => {
      tr.addEventListener("click", () => showDetail(tr.dataset.slug));
    });
  }

  const SORT_KEYS = { r: RK, n: NM, c: CT, ch: CH, t: TV, g: G7, i: IM };
  document.querySelectorAll("#board th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const k = SORT_KEYS[th.dataset.sort];
      if (sortKey === k) sortDir = -sortDir;
      else {
        sortKey = k;
        sortDir = k === RK ? 1 : -1;
      }
      renderBoard();
    });
  });
  [q, fCat, fChain, fMin, fWatch].forEach((el) => el.addEventListener("input", renderBoard));

  // ---- detail view
  function showDetail(slug) {
    const r = rows.find((x) => x[SL] === slug);
    if (!r) return;
    body.querySelectorAll("tr").forEach((tr) => tr.classList.toggle("selected", tr.dataset.slug === slug));
    const lo = r[IM] * D.model.bandLow;
    const hi = r[IM] * D.model.bandHigh;
    const pct = ((Math.log10(r[IM]) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * 100;
    const fam = (D.family[r[CT]] || []).map(
      (f) =>
        "<span class='famchip'><b>" + f[0] + "</b> · mcap " + fmt(f[1]) +
        " · TVL " + fmt(f[2]) + " · " + f[3].toFixed(2) + "× TVL</span>",
    );
    const factor = D.factors && D.factors[r[CT]] ? D.factors[r[CT]] : null;
    const steps = D.stepTemplates.map((t, i) => "<p><span class='n'>" + (i + 1) + ".</span>" + fillStep(t, r) + "</p>").join("");
    const el = document.getElementById("detail");
    el.hidden = false;
    el.innerHTML =
      "<h2>" + r[NM] + "</h2>" +
      "<p class='dmeta'>Rank <b>#" + r[RK] + "</b> · Implied value <b>" + fmt(r[IM]) + "</b> · TVL " + fmt(r[TV]) +
      " · " + changeText(r[G7]) + " · " + (r[CT] || "no category") + " on " + r[CH] +
      (r[CN] > 1 ? " (+" + (r[CN] - 1) + " more chains)" : "") +
      (factor ? " · Category factor <b>" + factor.factor.toFixed(2) + "×</b> from " + factor.n + " live token" + (factor.n === 1 ? "" : "s") : "") +
      (r[CP] ? " · <b>Thin-category guard applied</b>" : "") +
      " · <span class='" + verdictClass(r[VD]) + "'>" + VERDICTS[r[VD]] + "</span></p>" +
      "<div class='bandbar'><div class='band' style='left:0%;width:100%'></div><div class='dot' style='left:" + pct.toFixed(1) + "%'></div></div>" +
      "<div class='bandlabels'><span>Middle-half band: " + fmt(lo) + "</span><span>implied " + fmt(r[IM]) + "</span><span>" + fmt(hi) + "</span></div>" +
      "<div class='fam'>" + (fam.length ? fam.join("") : "<span class='famchip'>No live token in this category — the curve alone sets the value.</span>") + "</div>" +
      "<div class='steps'>" + steps + "</div>";
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---- method view
  document.getElementById("formula").textContent = D.model.formula;
  document.getElementById("fitNote").textContent =
    "Each dot is one of the " + D.liveTop.length + " largest live tokens, at the market's own value. " +
    "The line is the fitted curve. A token above the line trades rich against its TVL; below it, cheap. " +
    "The fit is deliberately weak (R² " + D.model.r2.toFixed(2) + "): size alone does not price a token, which is why the category factor and the uncertainty band matter.";
  const stats = document.getElementById("modelStats");
  stats.innerHTML =
    "<dt>Size curve</dt><dd>" + D.model.formula + "</dd>" +
    "<dt>Fitted on</dt><dd>" + D.model.n + " live tokens with TVL ≥ $10M</dd>" +
    "<dt>R²</dt><dd>" + D.model.r2.toFixed(3) + " — size explains little on its own</dd>" +
    "<dt>Leave-one-out median miss</dt><dd>×" + D.model.loo.toFixed(2) + "</dd>" +
    "<dt>Middle-half band</dt><dd>×" + D.model.bandLow.toFixed(2) + " to ×" + D.model.bandHigh.toFixed(2) + " around each implied value</dd>";
  const steak = rows.find((r) => r[SL] === "steakhouse-financial");
  document.getElementById("bench").textContent =
    "Live tokens trade at a median of " + D.model.bench.toFixed(2) + "× their TVL. " +
    "The curve says a $1B-TVL protocol is worth about " + fmt(Math.pow(10, D.model.intercept + D.model.slope * 9)) +
    " — the benchmark multiple is the quick check, the curve is the calibrated one.";
  document.getElementById("guard").textContent =
    "A category with fewer than three live tokens cannot crown a winner: its excess above the board's 90th percentile (" +
    fmt(D.model.anchor_usd) + ") is compressed to 5%. Steakhouse Financial (Risk Curators, one live comparable) lands at " +
    fmt(steak[IM]) + " instead of far above the leaders.";

  // scatter plot
  (function scatter() {
    const W = 640, H = 360, P = 42;
    const pts = D.liveTop.filter((p) => p[4] > 0 && p[3] > 0);
    const xs = pts.map((p) => Math.log10(p[4]));
    const ys = pts.map((p) => Math.log10(p[3]));
    const x0 = Math.min(...xs) - 0.2, x1 = Math.max(...xs) + 0.2;
    const y0 = Math.min(...ys) - 0.3, y1 = Math.max(...ys) + 0.3;
    const X = (x) => P + ((x - x0) / (x1 - x0)) * (W - P * 2);
    const Y = (y) => H - P - ((y - y0) / (y1 - y0)) * (H - P * 2);
    const a = D.model.intercept, b = D.model.slope;
    let svg = "<svg viewBox='0 0 " + W + " " + H + "' width='100%' role='img' aria-label='Size curve scatter plot'>";
    svg += "<line x1='" + P + "' y1='" + (H - P) + "' x2='" + (W - P) + "' y2='" + (H - P) + "' stroke='#2a3342'/>";
    svg += "<line x1='" + P + "' y1='" + P + "' x2='" + P + "' y2='" + (H - P) + "' stroke='#2a3342'/>";
    svg += "<line x1='" + X(x0) + "' y1='" + Y(a + b * x0) + "' x2='" + X(x1) + "' y2='" + Y(a + b * x1) + "' stroke='#2dd4a7' stroke-width='2'/>";
    pts.forEach((p) => {
      svg += "<circle cx='" + X(Math.log10(p[4])).toFixed(1) + "' cy='" + Y(Math.log10(p[3])).toFixed(1) + "' r='4' fill='#8b98a9'><title>" + p[0] + ": TVL " + fmt(p[4]) + ", mcap " + fmt(p[3]) + "</title></circle>";
    });
    svg += "<text x='" + (W / 2) + "' y='" + (H - 8) + "' fill='#8b98a9' font-size='12' text-anchor='middle'>log10(TVL)</text>";
    svg += "<text x='12' y='" + (H / 2) + "' fill='#8b98a9' font-size='12' text-anchor='middle' transform='rotate(-90 12 " + (H / 2) + ")'>log10(market cap)</text>";
    svg += "</svg>";
    document.getElementById("scatter").innerHTML = svg;
  })();

  // implied per $1,000 of TVL, top 10
  (function perK() {
    const top = rows.slice(0, 10);
    const vals = top.map((r) => (r[IM] / r[TV]) * 1000);
    const max = Math.max(...vals);
    document.getElementById("perK").innerHTML = top
      .map((r, i) => {
        const v = vals[i];
        return (
          "<div class='perk'><span>#" + r[RK] + " " + r[NM] + "</span>" +
          "<span class='bar'><i style='width:" + ((v / max) * 100).toFixed(1) + "%'></i></span>" +
          "<span class='val'>$" + v.toFixed(0) + " / $1k TVL</span></div>"
        );
      })
      .join("");
  })();

  // category factors table
  (function factors() {
    const tb = document.querySelector("#factorTable tbody");
    const entries = Object.entries(D.factors).sort((a, b) => b[1].factor - a[1].factor);
    tb.innerHTML = entries
      .map(([cat, f]) => {
        const comps = (D.family[cat] || []).map((c) => c[0]).join(", ");
        return "<tr><td>" + cat + "</td><td class='num'>" + f.n + "</td><td class='num'>" + f.factor.toFixed(2) + "×</td><td>" + (comps || "—") + "</td></tr>";
      })
      .join("");
  })();

  // ---- live tokens table
  (function live() {
    const tb = document.querySelector("#liveTable tbody");
    tb.innerHTML = D.liveTop
      .map(
        (p) =>
          "<tr><td class='name'>" + p[0] + (p[1] ? " (" + p[1] + ")" : "") + "</td><td>" + (p[2] || "—") + "</td>" +
          "<td class='num'>" + fmt(p[3]) + "</td><td class='num'>" + fmt(p[4]) + "</td>" +
          "<td class='num'>" + (p[3] / p[4]).toFixed(2) + "×</td><td class='num'>" + fmt(p[5]) + "</td></tr>",
      )
      .join("");
  })();

  // ---- set-aside table
  (function aside() {
    const tb = document.querySelector("#asideTable tbody");
    tb.innerHTML = D.setAside
      .map(
        (p) =>
          "<tr><td class='name'>" + p[0] + "</td><td>" + (p[1] || "—") + "</td>" +
          "<td class='num'>" + fmt(p[2]) + "</td><td>" + p[3] + "</td></tr>",
      )
      .join("");
  })();

  renderBoard();
})();
