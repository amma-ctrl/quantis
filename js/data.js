/**
 * Quantis — Market Data Loader
 * =============================
 *
 * Loads pre-baked OHLCV bars from local JSON files in `data/bars/`.
 *
 * Rationale:
 *   - Yahoo Finance blocks direct browser fetches (since 2025).
 *   - Finnhub moved /stock/candle behind a paywall (since 2024-25).
 *   - Free CORS proxies are unreliable from github.io.
 *   - Browser-friendly free APIs either require keys (which exposes
 *     you to abuse) or have strict daily limits (Alpha Vantage = 25/day).
 *
 * Conclusion: the only bulletproof approach for a static portfolio
 * dashboard is to pre-bake the data offline (in Python, where Yahoo
 * still works) and commit the JSONs to the repo. The site reads local
 * files — zero CORS, zero rate limits, zero keys, zero "Failed to fetch".
 *
 * To refresh data or add tickers:
 *   cd python && python generate_data.py
 *
 * That regenerates everything under data/bars/ and data/forecasts/.
 *
 * Returns the same shape as before:
 *   { source, bars: [{date, open, high, low, close, volume}, ...], meta }
 */

const BARS_DIR = "data/bars";
const FORECASTS_DIR = "data/forecasts";

/**
 * Map a range string to the number of bars to slice from the full history.
 * The pre-baked JSONs contain ~5 years of daily bars (~1260 rows).
 * We slice the tail when the user requests a shorter range.
 */
const RANGE_BARS = {
  "1mo":  22,
  "3mo":  66,
  "6mo":  132,
  "1y":   252,
  "2y":   504,
  "5y":   1260,
};

/**
 * In-memory cache so switching ranges on the same ticker doesn't re-fetch.
 * Keyed by ticker, holds the full JSON payload.
 */
const cache = new Map();

/**
 * Fetch the full bars JSON for a ticker, with cache.
 * Returns { ticker, generated_at, bars: [...] } or throws if not available.
 */
async function loadBars(ticker) {
  const t = ticker.toUpperCase();
  if (cache.has(t)) return cache.get(t);

  const res = await fetch(`${BARS_DIR}/${t}.json`);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`No data available for ${t}`);
    }
    throw new Error(`Failed to load bars for ${t} (HTTP ${res.status})`);
  }
  const payload = await res.json();
  if (!payload.bars || payload.bars.length === 0) {
    throw new Error(`Empty bars file for ${t}`);
  }
  cache.set(t, payload);
  return payload;
}

/**
 * Public: fetch OHLCV bars for a ticker over a given range.
 */
export async function fetchBars(ticker, range = "1y") {
  const payload = await loadBars(ticker);
  const count = RANGE_BARS[range] || 252;
  const bars = payload.bars.slice(-count);
  return {
    source: "prebaked",
    bars,
    meta: {
      longName: payload.name || ticker,
      generated_at: payload.generated_at,
    },
  };
}

/**
 * Public: lightweight quote for watchlist rows.
 * Uses the same pre-baked JSON — last two bars give us the change.
 */
export async function fetchQuote(ticker) {
  try {
    const payload = await loadBars(ticker);
    const bars = payload.bars;
    if (bars.length < 2) return null;
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    return {
      ticker,
      name: payload.name || ticker,
      price: last.close,
      change: last.close - prev.close,
      changePct: ((last.close - prev.close) / prev.close) * 100,
      open: last.open,
      high: last.high,
      low: last.low,
      volume: last.volume,
    };
  } catch (e) {
    console.warn(`Quote unavailable for ${ticker}:`, e.message);
    return null;
  }
}

/**
 * Public: load precomputed ML forecast JSON for a ticker.
 * Returns null (not an error) if missing — UI shows "not yet trained" state.
 */
export async function fetchForecasts(ticker) {
  try {
    const res = await fetch(`${FORECASTS_DIR}/${ticker.toUpperCase()}.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Public: list of tickers with pre-baked data, read from the manifest.
 * Used by the UI to show a friendly "available tickers" hint.
 */
export async function listAvailable() {
  try {
    const res = await fetch(`${BARS_DIR}/manifest.json`);
    if (!res.ok) return [];
    const manifest = await res.json();
    return manifest.tickers || [];
  } catch {
    return [];
  }
}
