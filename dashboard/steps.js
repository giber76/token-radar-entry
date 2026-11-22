// Token Launch Radar — the farm-step builder. One file, two readers: the
// dashboard loads it as a classic script and main.ts imports it, and both
// read the same builder off globalThis.FarmSteps, so the steps board.json
// carries and the steps the detail view shows can never drift apart.
//
// A farm plan is eight steps, each an action with a cost and a time, derived
// from the protocol's own record — name, category, chains, TVL, 7-day move
// and age — never from a hand-written list of names. Capital follows TVL,
// hold follows age, gas follows the chain, and the hold step reads the
// protocol's own 7-day move, so a fast grower and a sharp faller get
// different sizing advice. Input row: { name, category, chain, nChains,
// tvl_usd, change_7d }, plus ageDays (null unknown).

(function () {
  function capitalFor(tvl) {
    if (tvl >= 5e9) return 250;
    if (tvl >= 1e9) return 150;
    if (tvl >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function ageText(age) {
    if (age === null || age === undefined) return "about a year";
    if (age >= 365) return (age / 365.25).toFixed(1) + " years";
    return Math.max(1, Math.round(age / 30.4)) + " months";
  }
  function momentumNote(g) {
    if (g === null || g === undefined) return "";
    if (g >= 20) return " Its TVL is up " + Math.round(g) + "% in 7 days, so it is catching a fast grower — add to the position only if the next week's TVL holds the gain.";
    if (g <= -10) return " Its TVL is down " + Math.round(Math.abs(g)) + "% in 7 days, so keep the first position small and add only if the outflow stops.";
    return "";
  }
  function gasFor(chain) {
    var c = (chain || "").toLowerCase();
    if (c === "ethereum") return { first: "about $15 of gas for the first transaction", setup: "about $15 of gas", weekly: "about $5 of gas a week", task: "about $5 of gas per task" };
    if (c === "solana") return { first: "under $1 of gas for the first transaction", setup: "under $1 of gas", weekly: "under $1 of gas a week", task: "under $1 of gas per task" };
    return { first: "about $2 of gas for the first transaction", setup: "about $2 of gas", weekly: "about $1 of gas a week", task: "about $2 of gas per task" };
  }
  // Category tables: [keyword in the category name, text with $C capital,
  // $N name, $H chain]. First match wins; the default is a plain deposit.
  var ACTIONS = [
    ["lend|cdp|collateral", "Supply $C of USDC to $N on $H and borrow a small amount against it so the position reads as active use."],
    ["dex", "Provide $C of liquidity to $N's deepest pool on $H and keep the position in range."],
    ["yield|leveraged farm", "Deposit $C into $N's main yield vault on $H and keep the shares."],
    ["bridge|cross chain", "Bridge $C of USDC to $H through $N, then use the bridged funds in its app instead of bridging straight back."],
    ["staking|restak", "Stake $C of the chain's staking asset through $N and keep the receipt token in the same wallet."],
    ["perpetual|derivative", "Deposit $C of USDC as margin on $N and open one small hedged position, then close it after a day."],
    ["prediction", "Fund $C and place one small market position on $N, then settle it when the market resolves."],
    ["curator|allocator", "Deposit $C into a $N vault on $H and keep the shares for the full hold period."],
    ["stable", "Mint or deposit $C of the stable asset through $N on $H and hold it."],
    ["rwa", "Mint $C of the protocol's yield-bearing asset on $H and hold it in the farming wallet."],
    ["insurance", "Buy $C of cover from $N on $H and keep the policy active for the hold period."],
    ["privacy", "Move $C through $N on $H in two separate sessions a week apart."],
    ["index", "Buy $C of the $N index on $H and hold it for the full period."],
    ["nft|marketplace", "List one item and complete one purchase through $N on $H, each around $C, so the wallet reads as a real user of the marketplace."],
    ["launchpad", "Commit $C to the next sale $N runs on $H and hold the allocation instead of flipping it at listing."],
    ["payment", "Route $C of real payments through $N on $H over the hold period, in several transfers rather than one."],
    ["ai agent|decentralized ai", "Deposit $C into $N on $H and run one agent task from the same wallet so the position is tied to real use."],
  ];
  var WEEKLY = [
    ["lend|cdp", "a supply top-up, a small borrow or a repayment"],
    ["dex", "a swap, a liquidity top-up or a fee claim"],
    ["bridge", "a bridge in either direction or a swap on the destination chain"],
    ["perpetual|derivative", "a small trade or a funding-fee settlement"],
    ["staking|restak", "a stake top-up or a rewards claim"],
    ["prediction", "a new market position or a claim on a resolved one"],
    ["nft|marketplace", "a listing, a bid or a purchase"],
    ["launchpad", "a sale registration or an allocation claim"],
    ["payment", "a payment or a settlement"],
  ];
  var TASKS = [
    ["dex", "vote on a fee tier or a pool incentive, or provide liquidity to a newly listed pool"],
    ["lend|cdp", "vote on a collateral listing or a rate change, or test a new market the protocol opens"],
    ["bridge", "try a route to a chain you have not used yet, or a quest the protocol publishes for it"],
    ["perpetual|derivative", "join a trading competition or a testnet market the protocol opens"],
    ["staking|restak", "delegate to a new validator set or claim restaking rewards the protocol offers"],
    ["prediction", "create a market of your own, or settle one you already hold"],
    ["nft|marketplace", "mint from a new collection the protocol lists, or vote on a fee change"],
    ["launchpad", "register for the next sale early, or complete the project's own quest tasks"],
    ["rwa", "subscribe to a new asset the protocol tokenises, or vote on its next listing"],
  ];
  function lookup(table, cat) {
    var c = (cat || "").toLowerCase();
    for (var i = 0; i < table.length; i++) {
      var keys = table[i][0].split("|");
      for (var j = 0; j < keys.length; j++) {
        if (c.indexOf(keys[j]) >= 0) return table[i][1];
      }
    }
    return null;
  }
  function fill(tpl, p, capital, chain) {
    return tpl.split("$C").join("$" + capital).split("$N").join(p.name).split("$H").join(chain);
  }
  function stepText(step) {
    var s = step.text + " Cost: " + step.cost + ". Time: " + step.time + ".";
    if (s.length > 600) s = s.slice(0, 596) + "...";
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p, ageDays) {
    var chain = p.chain || "its main chain";
    var capital = capitalFor(p.tvl_usd);
    var hold = holdDaysFor(ageDays);
    var gas = gasFor(chain);
    var action = fill(lookup(ACTIONS, p.category) || "Deposit $C of USDC into $N on $H and keep the position open.", p, capital, chain);
    var weekly = lookup(WEEKLY, p.category) || "a deposit, a swap, a vote or a claim";
    var task = lookup(TASKS, p.category) || "complete a quest or a testnet task the protocol publishes";
    var extra = p.nChains > 1
      ? " It also runs on " + (p.nChains - 1) + " other chain" + (p.nChains - 1 === 1 ? "" : "s") + ", so repeat the core step on one of them once with half the capital."
      : "";
    return [
      { text: "Use a fresh wallet for " + p.name + " that holds only the funds you plan to farm, and keep its seed phrase offline on paper.", cost: gas.first, time: "5 minutes" },
      { text: action, cost: "$" + capital + " of capital and " + gas.setup, time: "15 minutes to set up" },
      { text: "Do one qualifying action each week on " + p.name + ", such as " + weekly + ", so the wallet shows steady use rather than a single deposit." + extra, cost: gas.weekly, time: "10 minutes a week" },
      { text: "Hold the position on " + chain + " for at least " + hold + " days so the activity is counted in more than one snapshot." + momentumNote(p.change_7d), cost: "the $" + capital + " stays in the position", time: hold + " days" },
      { text: "Check " + p.name + "'s own points, season or rewards page once a week and note the balance it shows for your wallet.", cost: "no fee to check", time: "5 minutes a week" },
      { text: "If " + p.name + " opens a vote, a quest or a testnet task, complete it from the same wallet — for example, " + task + ".", cost: gas.task, time: "15 minutes per task" },
      { text: "Before you withdraw from " + p.name + ", open its own claim page from the link it publishes and claim only there; never pay anyone to claim for you.", cost: "no fee to check, gas only to claim", time: "10 minutes" },
      { text: "Write the wallet, the dates and every transaction hash for " + p.name + " in a farm log, so you can repeat the position or unwind it cleanly. The protocol has run for " + ageText(ageDays) + " with no token recorded.", cost: "nothing but the log", time: "5 minutes" },
    ].map(stepText);
  }
  globalThis.FarmSteps = { farmSteps: farmSteps, capitalFor: capitalFor, holdDaysFor: holdDaysFor, gasFor: gasFor };
})();
