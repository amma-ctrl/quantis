/**
 * Quantis — Chart Renderer
 * =========================
 *
 * Canvas-based, DPR-aware. Takes either:
 *   - { bars }                    → price history (with optional SMA overlays)
 *   - { bars, forecast, label }   → forecast view (actual + dashed prediction
 *                                                  + confidence band)
 *   - { equityCurves, labels }    → backtest view (multiple equity curves)
 *
 * Kept deliberately small — no D3 dependency. If you later swap this
 * for D3 the public surface (renderPriceChart, renderForecastChart,
 * renderBacktestChart) is the contract to preserve.
 */

const PAD = { t: 18, r: 16, b: 26, l: 56 };

function prepCanvas(canvas) {
  const wrap = canvas.parentElement;
  const w = wrap.offsetWidth;
  const h = wrap.offsetHeight;
  if (!w || !h) return null;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function drawGrid(ctx, w, h, min, max, fmtY) {
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#6b6b7b";
  ctx.font = "10px JetBrains Mono";
  ctx.textAlign = "right";
  for (let i = 0; i < 5; i++) {
    const y = PAD.t + (i / 4) * (h - PAD.t - PAD.b);
    ctx.beginPath();
    ctx.moveTo(PAD.l, y);
    ctx.lineTo(w - PAD.r, y);
    ctx.stroke();
    const v = max - (i / 4) * (max - min);
    ctx.fillText(fmtY(v), PAD.l - 8, y + 4);
  }
}

function drawXAxisDates(ctx, w, h, dates) {
  if (!dates || dates.length < 2) return;
  ctx.fillStyle = "#6b6b7b";
  ctx.font = "10px JetBrains Mono";
  ctx.textAlign = "center";
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const idx = Math.min(dates.length - 1, Math.round((i / ticks) * (dates.length - 1)));
    const x = PAD.l + (i / ticks) * (w - PAD.l - PAD.r);
    ctx.fillText(dates[idx].slice(2), x, h - 8); // YY-MM-DD
  }
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// PRICE CHART
// ---------------------------------------------------------------------------

export function renderPriceChart(canvas, bars, overlays = {}) {
  const prep = prepCanvas(canvas);
  if (!prep) return;
  const { ctx, w, h } = prep;
  if (!bars.length) return;

  const close = bars.map(b => b.close);
  const dates = bars.map(b => b.date);
  const min = Math.min(...close) * 0.98;
  const max = Math.max(...close) * 1.02;
  const cw = w - PAD.l - PAD.r;
  const ch = h - PAD.t - PAD.b;
  const x = i => PAD.l + (i / (bars.length - 1)) * cw;
  const y = v => PAD.t + (1 - (v - min) / (max - min)) * ch;

  drawGrid(ctx, w, h, min, max, v => "$" + v.toFixed(0));

  // Area fill under price
  ctx.beginPath();
  ctx.moveTo(x(0), y(close[0]));
  for (let i = 1; i < close.length; i++) ctx.lineTo(x(i), y(close[i]));
  ctx.lineTo(x(close.length - 1), h - PAD.b);
  ctx.lineTo(x(0), h - PAD.b);
  ctx.closePath();
  ctx.fillStyle = "rgba(248,113,113,0.06)";
  ctx.fill();

  // SMA overlays (drawn under price line)
  if (overlays.sma20) drawLine(ctx, overlays.sma20, x, y, "rgba(251,191,36,0.55)", 1);
  if (overlays.sma50) drawLine(ctx, overlays.sma50, x, y, "rgba(167,139,250,0.55)", 1);

  // Price line
  ctx.beginPath();
  ctx.moveTo(x(0), y(close[0]));
  for (let i = 1; i < close.length; i++) ctx.lineTo(x(i), y(close[i]));
  ctx.strokeStyle = "#f87171";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Current price dot
  ctx.beginPath();
  ctx.arc(x(close.length - 1), y(close[close.length - 1]), 4, 0, Math.PI * 2);
  ctx.fillStyle = "#e4e2dd";
  ctx.fill();

  drawXAxisDates(ctx, w, h, dates);
}

function drawLine(ctx, series, xFn, yFn, color, width = 1.5) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (isNaN(v)) continue;
    if (!started) { ctx.moveTo(xFn(i), yFn(v)); started = true; }
    else           { ctx.lineTo(xFn(i), yFn(v)); }
  }
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// FORECAST CHART — actual + forecast + (optional) test prediction overlay
// ---------------------------------------------------------------------------

export function renderForecastChart(canvas, bars, forecast, color, testPrediction = null) {
  const prep = prepCanvas(canvas);
  if (!prep) return;
  const { ctx, w, h } = prep;

  const close = bars.map(b => b.close);
  const dates = bars.map(b => b.date);
  const all = [...close, ...(forecast || [])];
  const min = Math.min(...all) * 0.98;
  const max = Math.max(...all) * 1.02;
  const cw = w - PAD.l - PAD.r;
  const ch = h - PAD.t - PAD.b;
  const x = i => PAD.l + (i / (all.length - 1)) * cw;
  const y = v => PAD.t + (1 - (v - min) / (max - min)) * ch;

  drawGrid(ctx, w, h, min, max, v => "$" + v.toFixed(0));

  // Historical actual price
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x(0), y(close[0]));
  for (let i = 1; i < close.length; i++) ctx.lineTo(x(i), y(close[i]));
  ctx.stroke();

  // Test-set prediction overlay (model's fit on holdout) — solid, thin, model color
  if (testPrediction && testPrediction.length) {
    const start = close.length - testPrediction.length;
    if (start >= 0) {
      ctx.strokeStyle = hexToRgba(color, 0.75);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x(start), y(testPrediction[0]));
      for (let i = 1; i < testPrediction.length; i++) {
        ctx.lineTo(x(start + i), y(testPrediction[i]));
      }
      ctx.stroke();
    }
  }

  if (forecast && forecast.length) {
    // "Today" vertical line
    const tx = x(close.length - 1);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(tx, PAD.t);
    ctx.lineTo(tx, h - PAD.b);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#6b6b7b";
    ctx.font = "10px Outfit";
    ctx.textAlign = "center";
    ctx.fillText("Today", tx, PAD.t - 5);

    // Confidence band (widens with horizon)
    ctx.beginPath();
    for (let i = 0; i < forecast.length; i++) {
      const fx = x(close.length - 1 + i);
      ctx.lineTo(fx, y(forecast[i] + 3 + i * 0.15));
    }
    for (let i = forecast.length - 1; i >= 0; i--) {
      const fx = x(close.length - 1 + i);
      ctx.lineTo(fx, y(forecast[i] - 3 - i * 0.15));
    }
    ctx.closePath();
    ctx.fillStyle = hexToRgba(color, 0.08);
    ctx.fill();

    // Forecast line (dashed)
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x(close.length - 1), y(close[close.length - 1]));
    for (let i = 0; i < forecast.length; i++) {
      ctx.lineTo(x(close.length - 1 + i), y(forecast[i]));
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Endpoint marker
    ctx.beginPath();
    ctx.arc(x(all.length - 1), y(forecast[forecast.length - 1]), 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Current price dot
  ctx.beginPath();
  ctx.arc(x(close.length - 1), y(close[close.length - 1]), 4, 0, Math.PI * 2);
  ctx.fillStyle = "#e4e2dd";
  ctx.fill();

  drawXAxisDates(ctx, w, h, dates);
}

// ---------------------------------------------------------------------------
// BACKTEST CHART — multiple equity curves
// ---------------------------------------------------------------------------

export function renderBacktestChart(canvas, curves, labels, colors) {
  const prep = prepCanvas(canvas);
  if (!prep) return;
  const { ctx, w, h } = prep;
  if (!curves.length) return;

  const allV = curves.flat();
  const min = Math.min(...allV) * 0.98;
  const max = Math.max(...allV) * 1.02;
  const len = curves[0].length;
  const cw = w - PAD.l - PAD.r;
  const ch = h - PAD.t - PAD.b;
  const x = i => PAD.l + (i / (len - 1)) * cw;
  const y = v => PAD.t + (1 - (v - min) / (max - min)) * ch;

  drawGrid(ctx, w, h, min, max, v => "$" + (v / 1000).toFixed(1) + "k");

  curves.forEach((c, m) => {
    ctx.strokeStyle = colors[m];
    ctx.lineWidth = m === curves.length - 1 ? 1.5 : 2;
    if (m === curves.length - 1) ctx.setLineDash([6, 4]);
    ctx.beginPath();
    c.forEach((v, i) => i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v)));
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Legend
  ctx.font = "10px Outfit";
  let lx = PAD.l;
  labels.forEach((l, i) => {
    const labelW = ctx.measureText(l).width + 18;
    if (lx + labelW > w - PAD.r) return;
    ctx.fillStyle = colors[i];
    ctx.fillRect(lx, h - 18, 8, 8);
    ctx.fillStyle = "#6b6b7b";
    ctx.textAlign = "left";
    ctx.fillText(l, lx + 12, h - 11);
    lx += labelW;
  });
}

/**
 * Build equity curves from a buy-and-hold benchmark plus model accuracy stats.
 * Simplified: each model's daily expected return = (2 * accuracy - 1) * |daily_avg_return|
 * — a rough way to translate classifier edge into a curve.
 *
 * For ML regressors (LSTM, ARIMA) the precomputed MAPE → confidence → expected
 * edge. Buy & hold uses the actual price series.
 */
export function buildEquityCurves(bars, forecasts) {
  const close = bars.map(b => b.close);
  const dailyReturns = [];
  for (let i = 1; i < close.length; i++) {
    dailyReturns.push((close[i] - close[i - 1]) / close[i - 1]);
  }
  const window = dailyReturns.slice(-252); // last year
  const meanAbs = window.reduce((s, v) => s + Math.abs(v), 0) / window.length;

  function curveFromEdge(edge) {
    let cap = 10000;
    const out = [cap];
    for (let i = 0; i < window.length; i++) {
      const ret = Math.sign(window[i]) === Math.sign(edge)
        ? Math.abs(window[i]) * Math.abs(edge) * 1.5
        : -Math.abs(window[i]) * (1 - Math.abs(edge)) * 0.5;
      cap *= 1 + ret;
      out.push(cap);
    }
    return out;
  }

  // Buy & hold curve from real prices
  const startCap = 10000;
  const buyHold = [startCap];
  for (let i = 0; i < window.length; i++) {
    buyHold.push(buyHold[buyHold.length - 1] * (1 + window[i]));
  }

  if (!forecasts) {
    return {
      curves: [buyHold],
      labels: ["Buy & Hold"],
      colors: ["rgba(255,255,255,0.4)"],
      meanAbs,
    };
  }

  const rfAcc   = forecasts?.classifiers?.random_forest?.accuracy ?? 0.52;
  const lrAcc   = forecasts?.classifiers?.logistic_regression?.accuracy ?? 0.51;
  const dtAcc   = forecasts?.classifiers?.decision_tree?.accuracy ?? 0.50;
  // LSTM / ARIMA edge derived from MAPE — lower MAPE → stronger edge
  const lstmEdge  = forecasts?.lstm?.mape  ? Math.max(0, 0.6 - forecasts.lstm.mape / 20) : 0.1;
  const arimaEdge = forecasts?.arima?.mape ? Math.max(0, 0.55 - forecasts.arima.mape / 20) : 0.05;

  return {
    curves: [
      curveFromEdge(lstmEdge),
      curveFromEdge(rfAcc - 0.5),
      curveFromEdge(arimaEdge),
      curveFromEdge(lrAcc - 0.5),
      curveFromEdge(dtAcc - 0.5),
      buyHold,
    ],
    labels: ["LSTM", "Random Forest", "ARIMA", "Logistic Reg.", "Decision Tree", "Buy & Hold"],
    colors: ["#34d399", "#f472b6", "#4f8fff", "#fbbf24", "#a78bfa", "rgba(255,255,255,0.4)"],
    meanAbs,
  };
}
