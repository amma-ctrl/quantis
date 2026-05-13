/**
 * Quantis — Ticker Autocomplete
 * ==============================
 *
 * Smart dropdown for the ticker input. Wires up keyboard nav, mouse
 * selection (with the mousedown-before-blur trick), and ranks matches:
 *
 *   1. Symbol prefix match     (AAP → AAPL, AAPB)
 *   2. Symbol contains         (PL → AAPL, PLTR)
 *   3. Company name contains   ("apple" → AAPL)
 *
 * Selecting an option fires the `onSelect` callback supplied at init,
 * which the main app uses to load that ticker into the dashboard.
 */

export const TICKERS = [
  { s: "AAPL",  n: "Apple Inc." },
  { s: "MSFT",  n: "Microsoft Corporation" },
  { s: "GOOGL", n: "Alphabet Inc. Class A" },
  { s: "GOOG",  n: "Alphabet Inc. Class C" },
  { s: "AMZN",  n: "Amazon.com Inc." },
  { s: "NVDA",  n: "NVIDIA Corporation" },
  { s: "META",  n: "Meta Platforms Inc." },
  { s: "TSLA",  n: "Tesla Inc." },
  { s: "BRK-B", n: "Berkshire Hathaway Inc." },
  { s: "JPM",   n: "JPMorgan Chase & Co." },
  { s: "V",     n: "Visa Inc." },
  { s: "MA",    n: "Mastercard Inc." },
  { s: "JNJ",   n: "Johnson & Johnson" },
  { s: "WMT",   n: "Walmart Inc." },
  { s: "PG",    n: "Procter & Gamble Co." },
  { s: "XOM",   n: "Exxon Mobil Corp." },
  { s: "CVX",   n: "Chevron Corp." },
  { s: "HD",    n: "Home Depot Inc." },
  { s: "KO",    n: "Coca-Cola Co." },
  { s: "PEP",   n: "PepsiCo Inc." },
  { s: "BAC",   n: "Bank of America Corp." },
  { s: "WFC",   n: "Wells Fargo & Co." },
  { s: "C",     n: "Citigroup Inc." },
  { s: "GS",    n: "Goldman Sachs Group Inc." },
  { s: "MS",    n: "Morgan Stanley" },
  { s: "DIS",   n: "Walt Disney Co." },
  { s: "NFLX",  n: "Netflix Inc." },
  { s: "ADBE",  n: "Adobe Inc." },
  { s: "CRM",   n: "Salesforce Inc." },
  { s: "ORCL",  n: "Oracle Corp." },
  { s: "INTC",  n: "Intel Corp." },
  { s: "AMD",   n: "Advanced Micro Devices" },
  { s: "CSCO",  n: "Cisco Systems Inc." },
  { s: "IBM",   n: "IBM Corp." },
  { s: "PYPL",  n: "PayPal Holdings Inc." },
  { s: "SQ",    n: "Block Inc." },
  { s: "SHOP",  n: "Shopify Inc." },
  { s: "UBER",  n: "Uber Technologies Inc." },
  { s: "LYFT",  n: "Lyft Inc." },
  { s: "ABNB",  n: "Airbnb Inc." },
  { s: "COIN",  n: "Coinbase Global Inc." },
  { s: "PLTR",  n: "Palantir Technologies" },
  { s: "SNOW",  n: "Snowflake Inc." },
  { s: "SPOT",  n: "Spotify Technology" },
  { s: "SNAP",  n: "Snap Inc." },
  { s: "RBLX",  n: "Roblox Corp." },
  { s: "F",     n: "Ford Motor Co." },
  { s: "GM",    n: "General Motors Co." },
  { s: "BA",    n: "Boeing Co." },
  { s: "CAT",   n: "Caterpillar Inc." },
  { s: "NKE",   n: "Nike Inc." },
  { s: "SBUX",  n: "Starbucks Corp." },
  { s: "MCD",   n: "McDonald's Corp." },
  { s: "COST",  n: "Costco Wholesale Corp." },
  { s: "TGT",   n: "Target Corp." },
  { s: "LOW",   n: "Lowe's Companies Inc." },
  { s: "UNH",   n: "UnitedHealth Group Inc." },
  { s: "PFE",   n: "Pfizer Inc." },
  { s: "MRK",   n: "Merck & Co. Inc." },
  { s: "ABBV",  n: "AbbVie Inc." },
  { s: "LLY",   n: "Eli Lilly and Co." },
  { s: "TMO",   n: "Thermo Fisher Scientific" },
  { s: "ABT",   n: "Abbott Laboratories" },
  { s: "AVGO",  n: "Broadcom Inc." },
  { s: "QCOM",  n: "Qualcomm Inc." },
  { s: "TXN",   n: "Texas Instruments Inc." },
  { s: "MU",    n: "Micron Technology Inc." },
  { s: "TSM",   n: "Taiwan Semiconductor" },
  { s: "BABA",  n: "Alibaba Group Holding" },
  { s: "JD",    n: "JD.com Inc." },
  { s: "NIO",   n: "NIO Inc." },
  { s: "RIVN",  n: "Rivian Automotive Inc." },
  { s: "LCID",  n: "Lucid Group Inc." },
  { s: "SPY",   n: "SPDR S&P 500 ETF" },
  { s: "QQQ",   n: "Invesco QQQ Trust" },
  { s: "VOO",   n: "Vanguard S&P 500 ETF" },
  { s: "VTI",   n: "Vanguard Total Stock Market" },
  { s: "IWM",   n: "iShares Russell 2000 ETF" },
  { s: "DIA",   n: "SPDR Dow Jones ETF" },
  { s: "GLD",   n: "SPDR Gold Shares" },
  { s: "SLV",   n: "iShares Silver Trust" },
];

const MAX_RESULTS = 8;

function filterTickers(q) {
  const query = (q || "").trim().toUpperCase();
  if (!query) return [];
  const prefix = [], contains = [], byName = [];
  for (const t of TICKERS) {
    if (t.s.startsWith(query))                       prefix.push(t);
    else if (t.s.includes(query))                    contains.push(t);
    else if (t.n.toUpperCase().includes(query))      byName.push(t);
  }
  return [...prefix, ...contains, ...byName];
}

/**
 * Initialise the autocomplete on an existing input + dropdown pair.
 *
 * @param {HTMLInputElement} input
 * @param {HTMLElement} dropdown
 * @param {(t: {s: string, n: string}) => void} onSelect
 */
export function initAutocomplete(input, dropdown, onSelect) {
  let highlightedIdx = -1;
  let currentMatches = [];

  /** Position the (fixed) dropdown directly under the input. */
  function positionDropdown() {
    const r = input.getBoundingClientRect();
    dropdown.style.top  = (r.bottom + 4) + "px";
    dropdown.style.left = r.left + "px";
    dropdown.style.width = r.width + "px";
  }

  function render(query) {
    if (!currentMatches.length) {
      dropdown.innerHTML = `<div class="ticker-empty">No matches for "${query}"</div>`;
      positionDropdown();
      dropdown.classList.add("show");
      return;
    }
    dropdown.innerHTML = currentMatches.slice(0, MAX_RESULTS).map((m, i) => `
      <div class="ticker-option${i === highlightedIdx ? " highlighted" : ""}" data-idx="${i}">
        <span class="ticker-option-symbol">${m.s}</span>
        <span class="ticker-option-name">${m.n}</span>
      </div>`).join("");
    positionDropdown();
    dropdown.classList.add("show");

    // mousedown fires before the input's blur — without this, the dropdown
    // would close before our click handler ran, which was the bug last turn.
    dropdown.querySelectorAll(".ticker-option").forEach(opt => {
      opt.addEventListener("mousedown", e => {
        e.preventDefault();
        const idx = +opt.dataset.idx;
        pick(currentMatches[idx]);
      });
    });
  }

  // Reposition on window resize/scroll while open
  window.addEventListener("resize", () => {
    if (dropdown.classList.contains("show")) positionDropdown();
  });
  window.addEventListener("scroll", () => {
    if (dropdown.classList.contains("show")) positionDropdown();
  }, true);

  function pick(t) {
    if (!t) return;
    input.value = t.s;
    dropdown.classList.remove("show");
    highlightedIdx = -1;
    onSelect(t);
  }

  input.addEventListener("input", () => {
    const q = input.value;
    currentMatches = filterTickers(q);
    highlightedIdx = -1;
    if (q.trim()) render(q);
    else dropdown.classList.remove("show");
  });

  input.addEventListener("focus", () => {
    const q = input.value;
    if (q.trim()) {
      currentMatches = filterTickers(q);
    } else {
      currentMatches = TICKERS.slice(0, MAX_RESULTS);
    }
    render(q);
  });

  input.addEventListener("blur", () => {
    setTimeout(() => dropdown.classList.remove("show"), 150);
  });

  input.addEventListener("keydown", e => {
    const visible = dropdown.classList.contains("show");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!visible) return;
      highlightedIdx = Math.min(highlightedIdx + 1,
                                Math.min(currentMatches.length, MAX_RESULTS) - 1);
      render(input.value);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!visible) return;
      highlightedIdx = Math.max(highlightedIdx - 1, -1);
      render(input.value);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (visible && highlightedIdx >= 0 && currentMatches[highlightedIdx]) {
        pick(currentMatches[highlightedIdx]);
      } else {
        dropdown.classList.remove("show");
        const sym = (input.value || "").toUpperCase().trim();
        if (sym) onSelect({ s: sym, n: sym });
      }
    } else if (e.key === "Escape") {
      dropdown.classList.remove("show");
      highlightedIdx = -1;
    }
  });
}

/** Look up the canonical company name for a symbol, falling back to "<SYM> Corp." */
export function nameFor(symbol) {
  const s = (symbol || "").toUpperCase().trim();
  const hit = TICKERS.find(t => t.s === s);
  return hit ? hit.n : s + " Corp.";
}
