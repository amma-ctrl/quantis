/**
 * Quantis — Market Data Fetcher
 * ==============================
 *
 * Pulls live OHLCV bars for a given ticker. Strategy:
 *
 *   1. Try Yahoo's public chart endpoint (`query1.finance.yahoo.com`).
 *      It has permissive CORS on the chart route and is what
 *      `yfinance` wraps in the offline Python pipeline.
 *
 *   2. If that fails (CORS quirk, region block, downtime), fall back
 *      to Stooq's CSV endpoint via a CORS-friendly proxy.
 *
 *   3. If both fail, throw so the UI can surface the error.
 *
 * Returns a normalised array of bars:
 *   [{ date, open, high, low, close, volume }, ...]
 *
 * No API key required. All client-side.
 */

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const STOOQ_PROXY = "https://corsproxy.io/?url=";
const STOOQ_BASE  = "https://stooq.com/q/d/l/";

/**
 * Map a range string to Yahoo's expected `range` parameter and the
 * approximate number of bars we expect back.
 */
const RANGE_MAP = {
  "1mo":  { yahoo: "1mo",  stooqDays: 30 },
  "3mo":  { yahoo: "3mo",  stooqDays: 90 },
  "6mo":  { yahoo: "6mo",  stooqDays: 180 },
  "1y":   { yahoo: "1y",   stooqDays: 365 },
  "2y":   { yahoo: "2y",   stooqDays: 730 },
  "5y":   { yahoo: "5y",   stooqDays: 1825 },
};

/** Fetch OHLCV bars from Yahoo's chart endpoint. */
async function fetchYahoo(ticker, range = "1y") {
  const r = RANGE_MAP[range]?.yahoo || "1y";
  const url = `${YAHOO_BASE}/${encodeURIComponent(ticker)}?interval=1d&range=${r}&includePrePost=false`;
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const j = await res.json();
  const result = j?.chart?.result?.[0];
  if (!result) {
    const err = j?.chart?.error?.description || "Empty Yahoo response";
    throw new Error(err);
  }
  const ts = result.timestamp || [];
  const q  = result.indicators?.quote?.[0] || {};
  const o = q.open || [], h = q.high || [], l = q.low || [],
        c = q.close || [], v = q.volume || [];

  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    if (c[i] == null) continue; // skip non-trading days
    bars.push({
      date:   new Date(ts[i] * 1000).toISOString().slice(0, 10),
      open:   +o[i],
      high:   +h[i],
      low:    +l[i],
      close:  +c[i],
      volume: +v[i] || 0,
    });
  }
  return { source: "yahoo", bars, meta: {
    currency: result.meta?.currency,
    exchangeName: result.meta?.exchangeName,
    instrumentType: result.meta?.instrumentType,
    fullExchangeName: result.meta?.fullExchangeName,
    longName: result.meta?.longName || result.meta?.shortName,
  }};
}

/** Stooq CSV fallback via corsproxy.io. Slower, less reliable, but unkeyed. */
async function fetchStooq(ticker, range = "1y") {
  // Stooq uses lowercase + .us suffix for US tickers
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
  // Header: Date,Open,High,Low,Close,Volume
  const bars = [];
  for (let i = 1; i < lines.length; i++) {
    const [d, o, h, l, c, v] = lines[i].split(",");
    if (!d || !c) continue;
    bars.push({
      date:   d,
      open:   +o,
      high:   +h,
      low:    +l,
      close:  +c,
      volume: +v || 0,
    });
  }
  // Stooq returns full history; trim to requested range
  const days = RANGE_MAP[range]?.stooqDays || 365;
  return { source: "stooq", bars: bars.slice(-days), meta: {} };
}

/**
 * Public fetcher — tries Yahoo, falls back to Stooq.
 * Returns { source, bars, meta } where bars is sorted ascending by date.
 */
export async function fetchBars(ticker, range = "1y") {
  const errors = [];
  try {
    return await fetchYahoo(ticker, range);
  } catch (e) {
    errors.push(`Yahoo: ${e.message}`);
  }
  try {
    return await fetchStooq(ticker, range);
  } catch (e) {
    errors.push(`Stooq: ${e.message}`);
  }
  throw new Error(`All sources failed — ${errors.join(" | ")}`);
}

/**
 * Lightweight quote fetcher for the watchlist row.
 * Returns { ticker, price, change, changePct } or null on failure.
 * Reuses fetchBars with a short range to minimise payload.
 */
export async function fetchQuote(ticker) {
  try {
    const { bars, meta } = await fetchBars(ticker, "1mo");
    if (bars.length < 2) return null;
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    return {
      ticker,
      name: meta?.longName || ticker,
      price: last.close,
      change: last.close - prev.close,
      changePct: ((last.close - prev.close) / prev.close) * 100,
      open: last.open,
      high: last.high,
      low: last.low,
      volume: last.volume,
      bars,
    };
  } catch (e) {
    console.warn(`Quote failed for ${ticker}:`, e.message);
    return null;
  }
}

/**
 * Try to load a precomputed ML forecast JSON for a ticker.
 * Returns null (not an error) if the file doesn't exist —
 * the UI will show a friendly "model not yet trained" state.
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
