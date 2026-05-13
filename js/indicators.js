/**
 * Quantis — Technical Indicators + Risk Metrics
 * ==============================================
 *
 * Computes the same indicators the Python notebook computes via the
 * `ta` library — RSI, MACD, SMAs, Bollinger Bands, ATR — directly
 * from the live OHLCV bars in the browser. Plus risk metrics
 * (Sharpe, Sortino, Calmar, max drawdown, win rate, profit factor)
 * derived from daily returns.
 *
 * Everything here is deterministic from the input bars — no random
 * noise, no synthetic anything.
 */

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function closes(bars)  { return bars.map(b => b.close);  }
function highs(bars)   { return bars.map(b => b.high);   }
function lows(bars)    { return bars.map(b => b.low);    }
function volumes(bars) { return bars.map(b => b.volume); }

/** Simple moving average — returns array same length, NaN until window fills. */
function sma(arr, period) {
  const out = new Array(arr.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= period) sum -= arr[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average. */
function ema(arr, period) {
  const out = new Array(arr.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = NaN;
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) continue;
    if (i === period - 1) {
      // seed with SMA
      let s = 0;
      for (let j = 0; j < period; j++) s += arr[j];
      prev = s / period;
      out[i] = prev;
    } else {
      prev = arr[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** Rolling standard deviation. */
function rollingStd(arr, period) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = period - 1; i < arr.length; i++) {
    let s = 0, s2 = 0;
    for (let j = i - period + 1; j <= i; j++) { s += arr[j]; s2 += arr[j] * arr[j]; }
    const m = s / period;
    out[i] = Math.sqrt(Math.max(0, s2 / period - m * m));
  }
  return out;
}

// ---------------------------------------------------------------------------
// indicators
// ---------------------------------------------------------------------------

/** RSI (Wilder smoothing) — matches `ta.momentum.rsi(close, 14)`. */
function rsi(closeArr, period = 14) {
  const out = new Array(closeArr.length).fill(NaN);
  if (closeArr.length < period + 1) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closeArr[i] - closeArr[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closeArr.length; i++) {
    const d = closeArr[i] - closeArr[i - 1];
    const g = d > 0 ?  d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

/** MACD — fast EMA - slow EMA, signal line, histogram. */
function macd(closeArr, fast = 12, slow = 26, signal = 9) {
  const fastE = ema(closeArr, fast);
  const slowE = ema(closeArr, slow);
  const line = fastE.map((v, i) => v - slowE[i]);
  const sig = ema(line.map(v => isNaN(v) ? 0 : v), signal)
    .map((v, i) => isNaN(line[i]) ? NaN : v);
  const hist = line.map((v, i) => v - sig[i]);
  return { line, signal: sig, hist };
}

/** Bollinger Bands — SMA ± 2σ. */
function bollinger(closeArr, period = 20, mult = 2) {
  const mid = sma(closeArr, period);
  const sd  = rollingStd(closeArr, period);
  const upper = mid.map((m, i) => m + mult * sd[i]);
  const lower = mid.map((m, i) => m - mult * sd[i]);
  return { upper, mid, lower };
}

/** ATR — average true range (Wilder smoothing). */
function atr(bars, period = 14) {
  const tr = new Array(bars.length).fill(0);
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) { tr[i] = bars[i].high - bars[i].low; continue; }
    tr[i] = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low  - bars[i - 1].close),
    );
  }
  const out = new Array(bars.length).fill(NaN);
  if (bars.length < period) return out;
  let s = 0;
  for (let i = 0; i < period; i++) s += tr[i];
  out[period - 1] = s / period;
  for (let i = period; i < bars.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  }
  return out;
}

// ---------------------------------------------------------------------------
// derived: technical signals + summary panel
// ---------------------------------------------------------------------------

/**
 * Classify an RSI reading — under 30 oversold (buy), over 70 overbought (sell).
 * `ta` doesn't classify; this is a common convention.
 */
function rsiSignal(v) {
  if (isNaN(v)) return ["—", "neutral"];
  if (v < 30) return [v.toFixed(1), "buy"];
  if (v > 70) return [v.toFixed(1), "sell"];
  return [v.toFixed(1), "neutral"];
}

function macdSignal(line, sig) {
  if (isNaN(line) || isNaN(sig)) return ["—", "neutral"];
  const diff = line - sig;
  const label = (diff >= 0 ? "+" : "") + diff.toFixed(2);
  return [label, diff > 0 ? "buy" : "sell"];
}

function smaSignal(price, smaVal) {
  if (isNaN(smaVal)) return ["—", "neutral"];
  const label = "$" + smaVal.toFixed(2);
  return [label, price > smaVal ? "buy" : "sell"];
}

function bbSignal(price, upper, lower, mid) {
  if (isNaN(mid)) return ["—", "neutral"];
  if (price >= upper) return ["Upper band", "sell"];
  if (price <= lower) return ["Lower band", "buy"];
  return ["Mid-band", "neutral"];
}

/**
 * Top-level: compute everything a single ticker needs for the dashboard's
 * sidebar (stock summary, technical indicators, risk metrics) and for
 * the buy/sell windows panel. Returns a single object.
 */
export function computeAll(bars) {
  if (!bars || bars.length < 60) {
    throw new Error("Need at least 60 bars to compute indicators");
  }
  const close = closes(bars);
  const high  = highs(bars);
  const low   = lows(bars);
  const last  = bars[bars.length - 1];
  const prev  = bars[bars.length - 2];

  // --- indicators
  const sma20  = sma(close, 20);
  const sma50  = sma(close, 50);
  const sma200 = sma(close, 200);
  const ema12  = ema(close, 12);
  const rsiArr = rsi(close, 14);
  const macdObj = macd(close);
  const bb = bollinger(close, 20, 2);
  const atrArr = atr(bars, 14);

  const i = bars.length - 1;
  const indicators = {
    rsi:     rsiSignal(rsiArr[i]),
    macd:    macdSignal(macdObj.line[i], macdObj.signal[i]),
    sma20:   smaSignal(last.close, sma20[i]),
    sma50:   smaSignal(last.close, sma50[i]),
    sma200:  smaSignal(last.close, sma200[i]),
    boll:    bbSignal(last.close, bb.upper[i], bb.lower[i], bb.mid[i]),
    ema12:   smaSignal(last.close, ema12[i]),
  };

  // --- summary
  const yearWindow = bars.slice(-252); // ~1 trading year
  const yearHigh = Math.max(...yearWindow.map(b => b.high));
  const yearLow  = Math.min(...yearWindow.map(b => b.low));

  const summary = {
    price:     last.close,
    change:    last.close - prev.close,
    changePct: ((last.close - prev.close) / prev.close) * 100,
    open:      last.open,
    high:      last.high,
    low:       last.low,
    volume:    last.volume,
    yearHigh, yearLow,
  };

  // --- risk metrics (from daily returns)
  const returns = [];
  for (let k = 1; k < bars.length; k++) {
    returns.push((bars[k].close - bars[k - 1].close) / bars[k - 1].close);
  }
  const recent = returns.slice(-252); // last ~year
  const mean = recent.reduce((s, v) => s + v, 0) / recent.length;
  const variance = recent.reduce((s, v) => s + (v - mean) ** 2, 0) / recent.length;
  const std = Math.sqrt(variance);

  // Sharpe ratio: annualised. Assumes risk-free rate = 0 (kept simple, common in
  // educational dashboards; real production should subtract the 3M T-bill rate)
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

  // Sortino — only count negative deviations
  const downside = recent.filter(v => v < 0);
  const downStd = downside.length
    ? Math.sqrt(downside.reduce((s, v) => s + v * v, 0) / downside.length)
    : 0;
  const sortino = downStd > 0 ? (mean / downStd) * Math.sqrt(252) : 0;

  // Max drawdown — peak-to-trough on cumulative returns over the window
  let peak = bars[bars.length - recent.length - 1].close;
  let maxDD = 0;
  for (const b of bars.slice(-recent.length)) {
    if (b.close > peak) peak = b.close;
    const dd = (b.close - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  // Calmar — annualised return / |max drawdown|
  const annReturn = Math.pow(1 + mean, 252) - 1;
  const calmar = maxDD < 0 ? annReturn / Math.abs(maxDD) : 0;

  // Win rate / profit factor (on daily returns — simplistic but consistent)
  const wins   = recent.filter(v => v > 0);
  const losses = recent.filter(v => v < 0);
  const winRate = recent.length ? wins.length / recent.length : 0;
  const grossWin  = wins.reduce((s, v) => s + v, 0);
  const grossLoss = Math.abs(losses.reduce((s, v) => s + v, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : 0;

  const risk = {
    sharpe,
    maxDrawdownPct: maxDD * 100,
    sortino,
    calmar,
    profitFactor,
    winRatePct: winRate * 100,
    annReturnPct: annReturn * 100,
    volatilityPct: std * Math.sqrt(252) * 100,
  };

  // --- buy/sell windows (educational heuristic, not investment advice)
  // Buy zone: lower Bollinger band edge to mid-band
  // Sell zone: upper Bollinger band to year high
  // R/R: target = mid-band, stop = lower band - 1 ATR
  const windows = {
    buyLow:  Math.max(bb.lower[i], yearLow * 1.01),
    buyHigh: bb.mid[i],
    sellLow: bb.upper[i],
    sellHigh: yearHigh,
    stopLoss: bb.lower[i] - atrArr[i],
    atr: atrArr[i],
  };
  windows.targetPct = ((windows.sellLow - last.close) / last.close) * 100;
  windows.stopPct   = ((windows.stopLoss - last.close) / last.close) * 100;
  windows.rrRatio   = Math.abs(windows.targetPct / windows.stopPct);

  return {
    bars,
    summary,
    indicators,
    risk,
    windows,
    // raw series for chart overlays
    series: { sma20, sma50, sma200, ema12, rsi: rsiArr, macd: macdObj, bb, atr: atrArr },
  };
}
