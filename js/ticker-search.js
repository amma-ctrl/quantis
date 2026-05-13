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
 *
 * The TICKERS list itself lives in tickers.js, auto-generated from
 * python/tickers.py — keep the two in sync via python/build_tickers_js.py.
 */

import { TICKERS, nameFor } from "./tickers.js";

// Re-export so other modules can keep importing from ticker-search.js
// without caring about the underlying split.
export { TICKERS, nameFor };


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
// nameFor is now imported from tickers.js — see top of file
