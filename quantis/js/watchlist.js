/**
 * Quantis — Watchlist (localStorage-backed)
 * ==========================================
 *
 * Persists the user's watchlist between sessions via localStorage.
 * Storage key: `quantis.watchlist` — an array of ticker symbols.
 *
 * Defaults to a popular-stocks seed on first visit. Adding the active
 * dashboard ticker, removing existing entries, and clicking through to
 * load a watchlist ticker in the dashboard are all wired here.
 *
 * Quote rendering is decoupled — call `renderWatchlist` after the data
 * fetcher resolves quotes.
 */

const STORAGE_KEY = "quantis.watchlist";
const DEFAULT_LIST = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "TSLA"];

export function loadWatchlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_LIST];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return [...DEFAULT_LIST];
    return arr.filter(t => typeof t === "string");
  } catch {
    return [...DEFAULT_LIST];
  }
}

export function saveWatchlist(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // localStorage may be disabled (Safari private mode, etc.) — silent fail.
  }
}

export function addToWatchlist(ticker) {
  const t = (ticker || "").toUpperCase().trim();
  if (!t) return loadWatchlist();
  const list = loadWatchlist();
  if (list.includes(t)) return list;
  list.push(t);
  saveWatchlist(list);
  return list;
}

export function removeFromWatchlist(ticker) {
  const t = (ticker || "").toUpperCase().trim();
  const list = loadWatchlist().filter(x => x !== t);
  saveWatchlist(list);
  return list;
}

export function isInWatchlist(ticker) {
  return loadWatchlist().includes((ticker || "").toUpperCase().trim());
}
