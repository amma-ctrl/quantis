/**
 * Quantis — Market Data Fetcher
 * ==============================
 *
 * Pulls live OHLCV bars for a given ticker.
 *
 * Primary: Finnhub (https://finnhub.io)
 *   - Free tier: 60 calls/min, full OHLCV via /stock/candle
 *   - Real CORS headers — works directly from any browser/origin
 *   - Free API key required (sign up at finnhub.io/dashboard — 30 seconds)
 *   - Use query-param auth (?token=...) — NOT the X-Finnhub-Token header,
 *     which triggers a CORS preflight that Finnhub doesn't handle.
 *
 * Fallback: Stooq via corsproxy.io
 *   - No key, but slower and less reliable
 *   - corsproxy.io free tier is dev-only; works from github.io but flaky
 *
 * Returns a normalised array of bars:
 *   [{ date, open, high, low, close, volume }, ...]
 *
 * SETUP: Edit FINNHUB_KEY below with your free key from finnhub.io.
 *        If left as the placeholder, the dashboard shows a setup screen.
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Your free Finnhub API key. Get one at https://finnhub.io/dashboard
 * (sign up takes 30 seconds, no credit card).
 *
 * Yes, this key is exposed in client code — that's OK for free-tier Finnhub.
 * The key only enforces a rate limit; it doesn't authorize anything sensitive.
 * If someone abuses it, you'll hit the limit faster, that's the worst case.
 *
 * For a production app you'd proxy via a backend; for a portfolio site,
 * exposing the key is the standard pattern.
 */
export const FINNHUB_KEY = "d823m3pr01qrojfdtg0gd823m3pr01qrojfdtg10";

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const STOOQ_PROXY = "https://corsproxy.io/?url=";
const STOOQ_BASE  = "https://stooq.com/q/d/l/";

/**
 * Returns true if the API key has been configured. The dashboard checks
 * this on first load and shows a setup screen if false.
 */
export function isConfigured() {
  return FINNHUB_KEY && FINNHUB_KEY !== "YOUR_FINNHUB_KEY_HERE" && FINNHUB_KEY.length > 10;
}

/**
 * Map a range string to a number of days back.
 * Finnhub's /stock/candle takes Unix `from` and `to` timestamps;
 * we compute these client-side based on the requested range.
 */
const RANGE_DAYS = {
  "1mo":  30,
  "3mo":  90,
  "6mo":  180,
  "1y":   365,
  "2y":   730,
  "5y":   1825,
};

// =============================================================================
// FINNHUB (PRIMARY)
// =============================================================================

/**
 * Fetch OHLCV from Finnhub's /stock/candle endpoint.
 *
 * IMPORTANT: We pass the token as a query parameter (?token=...), not as
 * the X-Finnhub-Token header. Custom headers trigger a CORS preflight that
 * Finnhub's server doesn't respond to, causing a browser-level "Failed to
 * fetch". Query-param auth makes the request "simple" and skips preflight.
 *
 * No Content-Type, no custom Accept — keep the request minimal.
 */
async function fetchFinnhub(ticker, range = "1y") {
  if (!isConfigured()) throw new Error("Finnhub key not configured");

  const days = RANGE_DAYS[range] || 365;
  const to = Math.floor(Date.now() / 1000);
  const from = to - days * 86400 - 7 * 86400; // 7-day buffer for weekends

  const url = `${FINNHUB_BASE}/stock/candle?symbol=${encodeURIComponent(ticker)}` +
              `&resolution=D&from=${from}&to=${to}&token=${FINNHUB_KEY}`;

  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Finnhub key invalid or rejected (401/403)");
    }
    if (res.status === 429) throw new Error("Finnhub rate limit hit (60/min)");
    throw new Error(`Finnhub HTTP ${res.status}`);
  }
  const j = await res.json();
  if (j.s === "no_data") throw new Error(`No data for ${ticker}`);
  if (j.s !== "ok") throw new Error(`Finnhub status: ${j.s || "unknown"}`);

  const bars = [];
  for (let i = 0; i < j.t.length; i++) {
    bars.push({
      date:   new Date(j.t[i] * 1000).toISOString().slice(0, 10),
      open:   +j.o[i],
      high:   +j.h[i],
      low:    +j.l[i],
      close:  +j.c[i],
      volume: +j.v[i] || 0,
    });
  }
  return { source: "finnhub", bars, meta: {} };
}

/**
 * Fetch one-shot quote for the watchlist tab.
 * Finnhub's /quote returns: { c: current, d: change, dp: changePct,
 *                             h: high, l: low, o: open, pc: prev close, t: time }
 */
async function quoteFinnhub(ticker) {
  if (!isConfigured()) throw new Error("Finnhub key not configured");
  const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub quote HTTP ${res.status}`);
  const q = await res.json();
  if (q.c == null || q.c === 0) throw new Error(`No quote for ${ticker}`);
  return {
    ticker,
    name: ticker,        // /quote doesn't return name; use ticker
    price: q.c,
    change: q.d,
    changePct: q.dp,
    open: q.o,
    high: q.h,
    low: q.l,
    volume: 0,           // Finnhub /quote doesn't include volume
  };
}

// =============================================================================
// STOOQ (FALLBACK)
// =============================================================================

/**
 * Stooq CSV fallback via corsproxy.io. Used when Finnhub is unconfigured
 * or rate-limited. Note: corsproxy.io free tier may itself fail on
 * github.io origins; if both fail, the UI surfaces a clear error.
 */
async function fetchStooq(ticker, range = "1y") {
  const sym = ticker.toLowerCase().replace(".", "-") + ".us";
  const url = `${STOOQ_BASE}?s=${sym}&i=d`;
  const proxied = STOOQ_PROXY + encodeURIComponent(url);
  const res = await fetch(proxied);
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`);
  const text = await res.text();
  if (text.toLowerCase().startsWith("no data") || text.trim() === "") {
    throw new Error("Stooq: no data");
  }
  const lines = text.trim().split("\n");
  const bars = [];
  for (let i = 1; i < lines.length; i++) {
    const [d, o, h, l, c, v] = lines[i].split(",");
    if (!d || !c) continue;
    bars.push({
      date: d, open: +o, high: +h, low: +l, close: +c, volume: +v || 0,
    });
  }
  const days = RANGE_DAYS[range] || 365;
  return { source: "stooq", bars: bars.slice(-days), meta: {} };
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Fetch OHLCV bars. Tries Finnhub first (when configured), falls back to Stooq.
 * Throws a clear error if both sources fail.
 */
export async function fetchBars(ticker, range = "1y") {
  const errors = [];

  if (isConfigured()) {
    try {
      return await fetchFinnhub(ticker, range);
    } catch (e) {
      errors.push(`Finnhub: ${e.message}`);
    }
  } else {
    errors.push("Finnhub: key not configured");
  }

  try {
    return await fetchStooq(ticker, range);
  } catch (e) {
    errors.push(`Stooq: ${e.message}`);
  }

  throw new Error(errors.join(" | "));
}

/**
 * Lightweight quote for watchlist rows.
 * Uses Finnhub /quote if available (1 call), else falls back to fetchBars
 * (which is heavier but gets enough info to compute change).
 */
export async function fetchQuote(ticker) {
  if (isConfigured()) {
    try {
      return await quoteFinnhub(ticker);
    } catch (e) {
      console.warn(`Finnhub quote failed for ${ticker}:`, e.message);
    }
  }
  // Fallback: fetch a month of bars and derive change from last two
  try {
    const { bars } = await fetchBars(ticker, "1mo");
    if (bars.length < 2) return null;
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    return {
      ticker,
      name: ticker,
      price: last.close,
      change: last.close - prev.close,
      changePct: ((last.close - prev.close) / prev.close) * 100,
      open: last.open,
      high: last.high,
      low: last.low,
      volume: last.volume,
    };
  } catch (e) {
    console.warn(`Quote fallback failed for ${ticker}:`, e.message);
    return null;
  }
}

/**
 * Load a precomputed ML forecast JSON for a ticker.
 * Returns null (not an error) if missing — UI shows "not yet trained" state.
 */
export async function fetchForecasts(ticker) {
  try {
    const res = await fetch(`data/forecasts/${ticker.toUpperCase()}.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
