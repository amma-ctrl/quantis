/**
 * Quantis — Main Application
 * ===========================
 *
 * Orchestrates everything: live data fetch → indicators → dashboard
 * panels + chart, plus the watchlist tab, methodology tab, and view
 * routing.
 *
 * View routing is single-file: clicking a nav link swaps the active
 * `.view` element. No router framework needed.
 */

import { fetchBars, fetchForecasts, fetchQuote } from "./data.js";
import { computeAll } from "./indicators.js";
import {
  renderPriceChart, renderForecastChart, renderBacktestChart, buildEquityCurves,
} from "./chart.js";
import { initAutocomplete, nameFor, TICKERS } from "./ticker-search.js";
import {
  loadWatchlist, addToWatchlist, removeFromWatchlist, isInWatchlist,
} from "./watchlist.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  ticker: "AAPL",
  range: "1y",
  bars: null,
  computed: null,
  forecasts: null,
  meta: null,
  activeTab: "price",
  loading: false,
};

const MODEL_META = {
  price:    { title: "Price History",            sub: "Live OHLCV with 20 & 50-day SMA overlays",   color: "#f87171" },
  lstm:     { title: "LSTM Forecast",            sub: "3-layer LSTM, 60-day lookback, 30-day forecast", color: "#34d399" },
  arima:    { title: "ARIMA Forecast",           sub: "ARIMA(5,1,0) walk-forward + 30-day forecast", color: "#4f8fff" },
  rf:       { title: "Random Forest Classifier", sub: "200-tree ensemble · binary direction prediction", color: "#f472b6" },
  ensemble: { title: "Multi-Horizon Ensemble",   sub: "Probability of UP across 1, 3, 5, 10, 20-day horizons", color: "#fb923c" },
  consensus:{ title: "Model Consensus & Backtest", sub: "12-month rolling equity curves vs. Buy & Hold", color: "#a78bfa" },
};

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const $ = id => document.getElementById(id);

function fmtMoney(v) {
  if (v == null || isNaN(v)) return "—";
  if (Math.abs(v) >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
  if (Math.abs(v) >= 1e9)  return "$" + (v / 1e9).toFixed(2) + "B";
  if (Math.abs(v) >= 1e6)  return "$" + (v / 1e6).toFixed(2) + "M";
  return "$" + v.toFixed(2);
}

function fmtVolume(v) {
  if (v == null || isNaN(v)) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toString();
}

function fmtPct(v) {
  if (v == null || isNaN(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

/**
 * Render the "Last refreshed" badge in the nav, and (if visible) the inline
 * date span inside the methodology page. Reads `state.manifest.generated_at`
 * which the Colab notebook writes when it commits new data.
 */
function renderFreshnessBadge() {
  const iso = state.manifest && state.manifest.generated_at;
  let label = "—";
  let title = "Data freshness unknown";
  if (iso) {
    const d = new Date(iso);
    if (!isNaN(d)) {
      const now = new Date();
      const diffH = (now - d) / 36e5;
      if (diffH < 24)      label = "Today";
      else if (diffH < 48) label = "Yesterday";
      else if (diffH < 168) label = `${Math.floor(diffH / 24)} days ago`;
      else                 label = d.toISOString().slice(0, 10);
      title = `Data generated ${d.toUTCString()}\n` +
              `${state.manifest.tickers?.length || 0} tickers in the universe`;
    }
  }
  const navBadge = $("navFreshness");
  if (navBadge) {
    navBadge.textContent = "Data: " + label;
    navBadge.title = title;
  }
  const inlineBadge = $("dataFreshness");
  if (inlineBadge) {
    inlineBadge.textContent = label === "—" ? "unknown" : label;
    inlineBadge.title = title;
  }
}

// ---------------------------------------------------------------------------
// Sidebar rendering
// ---------------------------------------------------------------------------

function renderSidebar() {
  const c = state.computed;
  if (!c) return;

  $("dispTicker").textContent = state.ticker;
  $("dispName").textContent = state.meta?.longName || nameFor(state.ticker);
  $("dispPrice").textContent = fmtMoney(c.summary.price);

  const chEl = $("dispChange");
  chEl.textContent = fmtPct(c.summary.changePct) + " today";
  chEl.className = "stock-change " + (c.summary.changePct >= 0 ? "up" : "down");

  // Summary stats grid
  $("stat-open").textContent     = fmtMoney(c.summary.open);
  $("stat-high").textContent     = fmtMoney(c.summary.high);
  $("stat-low").textContent      = fmtMoney(c.summary.low);
  $("stat-volume").textContent   = fmtVolume(c.summary.volume);
  $("stat-yhigh").textContent    = fmtMoney(c.summary.yearHigh);
  $("stat-ylow").textContent     = fmtMoney(c.summary.yearLow);

  // Technical indicators
  const rows = [
    ["RSI (14)",  c.indicators.rsi],
    ["MACD",      c.indicators.macd],
    ["SMA 20",    c.indicators.sma20],
    ["SMA 50",    c.indicators.sma50],
    ["SMA 200",   c.indicators.sma200],
    ["Bollinger", c.indicators.boll],
    ["EMA 12",    c.indicators.ema12],
  ];
  $("indicators").innerHTML = rows.map(([label, [val, signal]]) => `
    <div class="indicator-row">
      <span class="indicator-name">${label}</span>
      <span class="indicator-val">${val}</span>
      <span class="indicator-signal signal-${signal}">${
        signal === "buy" ? "Bullish" : signal === "sell" ? "Bearish" : "Neutral"
      }</span>
    </div>`).join("");

  // Risk metrics
  const r = c.risk;
  $("risk").innerHTML = `
    <div class="risk-item"><span class="risk-name">Sharpe Ratio</span>
      <span class="risk-val" style="color:${r.sharpe > 1 ? "var(--green)" : r.sharpe < 0 ? "var(--red)" : "var(--text)"}">${r.sharpe.toFixed(2)}</span></div>
    <div class="risk-item"><span class="risk-name">Max Drawdown</span>
      <span class="risk-val" style="color:var(--red)">${r.maxDrawdownPct.toFixed(1)}%</span></div>
    <div class="risk-item"><span class="risk-name">Sortino Ratio</span>
      <span class="risk-val" style="color:${r.sortino > 1 ? "var(--green)" : "var(--text)"}">${r.sortino.toFixed(2)}</span></div>
    <div class="risk-item"><span class="risk-name">Calmar Ratio</span>
      <span class="risk-val">${r.calmar.toFixed(2)}</span></div>
    <div class="risk-item"><span class="risk-name">Profit Factor</span>
      <span class="risk-val">${r.profitFactor.toFixed(2)}</span></div>
    <div class="risk-item"><span class="risk-name">Win Rate</span>
      <span class="risk-val">${r.winRatePct.toFixed(1)}%</span></div>
    <div class="risk-item"><span class="risk-name">Volatility (ann.)</span>
      <span class="risk-val">${r.volatilityPct.toFixed(1)}%</span></div>`;
}

// ---------------------------------------------------------------------------
// Buy/sell windows panel
// ---------------------------------------------------------------------------

function renderWindows() {
  const c = state.computed;
  if (!c) return;
  const w = c.windows;
  const price = c.summary.price;

  // Consensus: combine RF (if available) + RSI direction + MACD direction
  let agree = 0, total = 0;
  if (state.forecasts?.classifiers?.random_forest?.next_day_prob_up != null) {
    total++;
    if (state.forecasts.classifiers.random_forest.next_day_prob_up > 0.5) agree++;
  }
  const macdSig = c.indicators.macd[1]; if (macdSig !== "neutral") { total++; if (macdSig === "buy") agree++; }
  const rsiSig  = c.indicators.rsi[1];  if (rsiSig  !== "neutral") { total++; if (rsiSig  === "buy") agree++; }
  const sma20Sig = c.indicators.sma20[1]; if (sma20Sig !== "neutral") { total++; if (sma20Sig === "buy") agree++; }

  const pct = total > 0 ? (agree / total) * 100 : 50;
  const verdict = total === 0 ? "MIXED"
                : pct >= 65   ? `BUY ${agree}/${total}`
                : pct <= 35   ? `SELL ${total - agree}/${total}`
                              : `HOLD ${agree}/${total}`;
  const verdictColor = pct >= 65 ? "var(--green)" : pct <= 35 ? "var(--red)" : "var(--amber)";

  $("windows").innerHTML = `
    <div class="window-card buy">
      <div class="window-signal buy">Buy Zone</div>
      <div class="window-range">${fmtMoney(w.buyLow)} – ${fmtMoney(w.buyHigh)}</div>
      <div class="window-meta">
        Stop-loss ${fmtMoney(w.stopLoss)} (${w.stopPct.toFixed(1)}%) ·
        R/R ${w.rrRatio.toFixed(1)}:1
      </div>
    </div>
    <div class="window-card sell">
      <div class="window-signal sell">Sell Zone</div>
      <div class="window-range">${fmtMoney(w.sellLow)} – ${fmtMoney(w.sellHigh)}</div>
      <div class="window-meta">
        Upper Bollinger + 52w high ·
        ${fmtPct(w.targetPct)} from current
      </div>
    </div>
    <div class="window-card hold">
      <div class="window-signal hold">Current</div>
      <div class="window-range">${fmtMoney(price)}</div>
      <div class="window-meta">
        ATR ${fmtMoney(w.atr)} · Vol ${state.computed.risk.volatilityPct.toFixed(1)}% ann.
      </div>
    </div>`;

  $("consensusBar").innerHTML = `
    <span class="consensus-label">Signal consensus</span>
    <div class="consensus-track">
      <div class="consensus-seg" style="width:${pct}%;background:${verdictColor};border-radius:3px 0 0 3px;"></div>
      <div class="consensus-seg" style="width:${100 - pct}%;background:var(--bg3);border-radius:0 3px 3px 0;"></div>
    </div>
    <span class="consensus-result" style="color:${verdictColor}">${verdict}</span>`;
}

// ---------------------------------------------------------------------------
// Chart tab rendering
// ---------------------------------------------------------------------------

function renderTab(tab) {
  state.activeTab = tab;
  const panel = $("chartPanel");
  const meta = MODEL_META[tab];
  const c = state.computed;
  const f = state.forecasts;

  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.tab === tab));

  if (!c) {
    panel.innerHTML = `<div class="chart-empty">Loading data…</div>`;
    return;
  }

  const timeToggles = `<div class="time-toggles">
    ${["1mo", "3mo", "6mo", "1y", "2y", "5y"].map(r => `
      <button class="time-btn ${r === state.range ? "active" : ""}" data-range="${r}">
        ${r.toUpperCase().replace("MO", "M")}
      </button>`).join("")}
  </div>`;

  // ----- PRICE -----
  if (tab === "price") {
    panel.innerHTML = `
      <div class="chart-header">
        <div>
          <div class="chart-title">${meta.title}</div>
          <div class="chart-subtitle">${state.ticker} · ${meta.sub}</div>
        </div>
        ${timeToggles}
      </div>
      <div class="chart-canvas-wrap"><canvas id="mainCanvas"></canvas></div>
      <div class="metrics-row">
        <div class="metric-card"><div class="metric-label">Bars Loaded</div><div class="metric-val">${c.bars.length}</div></div>
        <div class="metric-card"><div class="metric-label">Date Range</div><div class="metric-val" style="font-size:13px">${c.bars[0].date} → ${c.bars[c.bars.length - 1].date}</div></div>
        <div class="metric-card"><div class="metric-label">Annual Return</div><div class="metric-val" style="color:${c.risk.annReturnPct >= 0 ? "var(--green)" : "var(--red)"}">${fmtPct(c.risk.annReturnPct)}</div></div>
        <div class="metric-card"><div class="metric-label">Annual Volatility</div><div class="metric-val">${c.risk.volatilityPct.toFixed(1)}%</div></div>
      </div>`;
    requestAnimationFrame(() =>
      renderPriceChart($("mainCanvas"), c.bars, { sma20: c.series.sma20, sma50: c.series.sma50 }));
  }

  // ----- LSTM -----
  else if (tab === "lstm") {
    if (!f?.lstm) return showNotTrained(panel, "LSTM", tab);
    panel.innerHTML = `
      <div class="chart-header">
        <div>
          <div class="chart-title">${meta.title}</div>
          <div class="chart-subtitle">${state.ticker} · ${meta.sub}</div>
        </div>
      </div>
      <div class="chart-canvas-wrap"><canvas id="mainCanvas"></canvas></div>
      <div class="metrics-row">
        <div class="metric-card"><div class="metric-label">RMSE</div><div class="metric-val">$${f.lstm.rmse.toFixed(2)}</div></div>
        <div class="metric-card"><div class="metric-label">MAE</div><div class="metric-val">$${f.lstm.mae.toFixed(2)}</div></div>
        <div class="metric-card"><div class="metric-label">MAPE</div><div class="metric-val">${f.lstm.mape.toFixed(2)}%</div></div>
        <div class="metric-card"><div class="metric-label">30-Day Forecast</div><div class="metric-val" style="color:${f.lstm.forecast_30d.at(-1) > c.summary.price ? "var(--green)" : "var(--red)"}">${fmtMoney(f.lstm.forecast_30d.at(-1))}</div></div>
      </div>`;
    requestAnimationFrame(() =>
      renderForecastChart($("mainCanvas"), c.bars, f.lstm.forecast_30d, meta.color, f.lstm.test_predicted));
  }

  // ----- ARIMA -----
  else if (tab === "arima") {
    if (!f?.arima) return showNotTrained(panel, "ARIMA", tab);
    panel.innerHTML = `
      <div class="chart-header">
        <div>
          <div class="chart-title">${meta.title}</div>
          <div class="chart-subtitle">${state.ticker} · ARIMA(${f.arima.order.join(",")}) · ${meta.sub}</div>
        </div>
      </div>
      <div class="chart-canvas-wrap"><canvas id="mainCanvas"></canvas></div>
      <div class="metrics-row">
        <div class="metric-card"><div class="metric-label">RMSE</div><div class="metric-val">$${f.arima.rmse.toFixed(2)}</div></div>
        <div class="metric-card"><div class="metric-label">MAE</div><div class="metric-val">$${f.arima.mae.toFixed(2)}</div></div>
        <div class="metric-card"><div class="metric-label">MAPE</div><div class="metric-val">${f.arima.mape.toFixed(2)}%</div></div>
        <div class="metric-card"><div class="metric-label">AIC</div><div class="metric-val">${f.arima.aic.toFixed(0)}</div></div>
        <div class="metric-card"><div class="metric-label">30-Day Forecast</div><div class="metric-val">${fmtMoney(f.arima.forecast_30d.at(-1))}</div></div>
      </div>`;
    requestAnimationFrame(() =>
      renderForecastChart($("mainCanvas"), c.bars, f.arima.forecast_30d, meta.color, f.arima.test_predicted));
  }

  // ----- RANDOM FOREST -----
  else if (tab === "rf") {
    if (!f?.classifiers) return showNotTrained(panel, "Random Forest", tab);
    const rf = f.classifiers.random_forest;
    const lr = f.classifiers.logistic_regression;
    const dt = f.classifiers.decision_tree;
    const baseline = rf.baseline_up_rate * 100;
    const topFeatures = Object.entries(rf.feature_importances)
      .sort((a, b) => b[1] - a[1]).slice(0, 5);
    panel.innerHTML = `
      <div class="chart-header">
        <div>
          <div class="chart-title">${meta.title}</div>
          <div class="chart-subtitle">${state.ticker} · 19 engineered features · binary up/down target</div>
        </div>
      </div>
      <div class="rf-grid">
        <div class="rf-block">
          <div class="rf-block-label">Classifier accuracy (test set)</div>
          <table class="rf-table">
            <tr><td>Random Forest</td><td style="color:${rf.accuracy > 0.5 ? 'var(--green)' : 'var(--red)'}">${(rf.accuracy * 100).toFixed(2)}%</td></tr>
            <tr><td>Logistic Regression</td><td>${(lr.accuracy * 100).toFixed(2)}%</td></tr>
            <tr><td>Decision Tree</td><td>${(dt.accuracy * 100).toFixed(2)}%</td></tr>
            <tr style="color:var(--muted)"><td>Baseline (always UP)</td><td>${baseline.toFixed(2)}%</td></tr>
          </table>
        </div>
        <div class="rf-block">
          <div class="rf-block-label">Top features by importance</div>
          ${topFeatures.map(([f, v]) => `
            <div class="feat-row">
              <span class="feat-name">${f}</span>
              <div class="feat-bar"><div style="width:${(v / topFeatures[0][1]) * 100}%"></div></div>
              <span class="feat-val">${(v * 100).toFixed(1)}%</span>
            </div>`).join("")}
        </div>
        <div class="rf-block rf-prediction">
          <div class="rf-block-label">Next-day prediction</div>
          <div class="prob-display ${rf.next_day_prob_up > 0.5 ? "up" : "down"}">
            <div class="prob-label">P(UP tomorrow)</div>
            <div class="prob-val">${(rf.next_day_prob_up * 100).toFixed(1)}%</div>
            <div class="prob-direction">${rf.next_day_prob_up > 0.5 ? "↑ Bullish" : "↓ Bearish"}</div>
          </div>
        </div>
      </div>`;
  }

  // ----- ENSEMBLE (Multi-Horizon) -----
  else if (tab === "ensemble") {
    if (!f?.horizons) return showNotTrained(panel, "multi-horizon ensemble", tab);
    const hs = Object.entries(f.horizons).filter(([, v]) => v).map(([, v]) => v);
    panel.innerHTML = `
      <div class="chart-header">
        <div>
          <div class="chart-title">${meta.title}</div>
          <div class="chart-subtitle">${state.ticker} · ${meta.sub}</div>
        </div>
      </div>
      <div class="horizon-grid">
        ${hs.map(h => {
          const pct = (h.p_up * 100).toFixed(1);
          const dir = h.p_up > 0.5 ? "up" : "down";
          return `
            <div class="horizon-card ${dir}">
              <div class="horizon-label">${h.horizon_days}-day horizon</div>
              <div class="horizon-prob">${pct}%</div>
              <div class="horizon-dir">P(UP) · model acc. ${(h.accuracy * 100).toFixed(1)}%</div>
              <div class="horizon-bar"><div style="width:${pct}%"></div></div>
            </div>`;
        }).join("")}
      </div>
      <div class="ensemble-note">
        Each horizon is a separate Random Forest trained to predict whether close N days from now will be above today's close.
        Probabilities above 60% (green) suggest the model sees a meaningful directional edge over baseline.
      </div>`;
  }

  // ----- CONSENSUS / BACKTEST -----
  else if (tab === "consensus") {
    const eq = buildEquityCurves(c.bars, f);
    const finalReturn = curve => ((curve.at(-1) - curve[0]) / curve[0]) * 100;
    panel.innerHTML = `
      <div class="chart-header">
        <div>
          <div class="chart-title">${meta.title}</div>
          <div class="chart-subtitle">${state.ticker} · 252-day rolling backtest · $10,000 starting capital</div>
        </div>
      </div>
      <div class="chart-canvas-wrap"><canvas id="mainCanvas"></canvas></div>
      <div class="backtest-area">
        <table class="bt-table">
          <thead><tr><th>Model</th><th>Final Value</th><th>Return</th><th>Approach</th></tr></thead>
          <tbody>
            ${eq.curves.map((c, i) => {
              const ret = finalReturn(c);
              const color = ret >= 0 ? "var(--green)" : "var(--red)";
              const approach = ["Sequence regression", "Classification → trade signal", "Time-series regression",
                                "Linear classifier", "Tree classifier", "Passive benchmark"][i];
              return `<tr>
                <td><span class="bt-dot" style="background:${eq.colors[i]}"></span>${eq.labels[i]}</td>
                <td>$${c.at(-1).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</td>
                <td style="color:${color}">${fmtPct(ret)}</td>
                <td style="color:var(--muted)">${approach}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
    requestAnimationFrame(() =>
      renderBacktestChart($("mainCanvas"), eq.curves, eq.labels, eq.colors));
  }

  // Re-wire time-range buttons
  panel.querySelectorAll(".time-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const newRange = btn.dataset.range;
      if (newRange && newRange !== state.range) {
        state.range = newRange;
        loadTicker(state.ticker); // reload with new range
      }
    });
  });
}

function showNotTrained(panel, modelName, tab) {
  panel.innerHTML = `
    <div class="chart-header">
      <div>
        <div class="chart-title">${MODEL_META[tab].title}</div>
        <div class="chart-subtitle">${state.ticker}</div>
      </div>
    </div>
    <div class="not-trained">
      <div class="not-trained-icon">⚠</div>
      <div class="not-trained-title">${modelName} not yet trained for ${state.ticker}</div>
      <div class="not-trained-body">
        ML models are precomputed offline (run <code>python python/generate_forecasts.py ${state.ticker}</code> to add coverage).
        The current set: AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA, JPM, V, WMT, DIS, NFLX, AMD, SPY, QQQ.
        <br><br>
        Other tabs (price history, technical indicators, risk metrics, buy/sell windows) work on any live ticker.
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Loading flow
// ---------------------------------------------------------------------------

async function loadTicker(ticker) {
  state.ticker = (ticker || "").toUpperCase().trim();
  if (!state.ticker) return;
  state.loading = true;
  setLoadingState(true);

  try {
    const [{ bars, meta }, forecasts] = await Promise.all([
      fetchBars(state.ticker, state.range),
      fetchForecasts(state.ticker),
    ]);
    if (!bars || bars.length < 30) throw new Error("Not enough data returned");

    state.bars = bars;
    state.meta = meta;
    state.forecasts = forecasts;
    state.computed = computeAll(bars);

    renderSidebar();
    renderWindows();
    renderTab(state.activeTab);
    updateWatchlistButton();
  } catch (e) {
    showError(e.message);
  } finally {
    state.loading = false;
    setLoadingState(false);
  }
}

function setLoadingState(loading) {
  document.body.classList.toggle("loading", loading);
  $("analyzeBtn").textContent = loading ? "Loading…" : "Analyze";
  $("analyzeBtn").disabled = loading;
}

function showError(msg) {
  $("chartPanel").innerHTML = `
    <div class="chart-header"><div class="chart-title">Couldn't load ${state.ticker}</div></div>
    <div class="not-trained">
      <div class="not-trained-icon">!</div>
      <div class="not-trained-title">No data available for ${state.ticker}</div>
      <div class="not-trained-body">
        ${msg}<br><br>
        Quantis covers 100 US stocks and ETFs out of the box. To add ${state.ticker},
        run <code>python python/generate_bars.py ${state.ticker}</code>
        (and optionally <code>python python/generate_forecasts.py ${state.ticker}</code>
        for ML coverage), then commit the new JSON files.
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Watchlist UI
// ---------------------------------------------------------------------------

function updateWatchlistButton() {
  const btn = $("watchlistToggle");
  if (!btn) return;
  if (isInWatchlist(state.ticker)) {
    btn.textContent = "★ In watchlist";
    btn.classList.add("active");
  } else {
    btn.textContent = "☆ Add to watchlist";
    btn.classList.remove("active");
  }
}

async function renderWatchlistTab() {
  const list = loadWatchlist();
  const container = $("watchlist-grid");
  if (!container) return;

  // Render skeleton rows first
  container.innerHTML = list.map(t => `
    <div class="watch-row" data-ticker="${t}">
      <div class="watch-cell watch-sym">${t}</div>
      <div class="watch-cell watch-name muted">${nameFor(t)}</div>
      <div class="watch-cell watch-price">loading…</div>
      <div class="watch-cell watch-change muted">—</div>
      <div class="watch-cell watch-volume muted">—</div>
      <div class="watch-cell watch-actions">
        <button class="watch-btn open" data-action="open" data-ticker="${t}">Open</button>
        <button class="watch-btn remove" data-action="remove" data-ticker="${t}">✕</button>
      </div>
    </div>`).join("");

  // Wire actions
  container.querySelectorAll(".watch-btn").forEach(b => {
    b.addEventListener("click", e => {
      const t = e.currentTarget.dataset.ticker;
      const action = e.currentTarget.dataset.action;
      if (action === "open") {
        switchView("dashboard");
        loadTicker(t);
      } else if (action === "remove") {
        removeFromWatchlist(t);
        renderWatchlistTab();
        updateWatchlistButton();
      }
    });
  });

  // Fire off quote fetches in parallel
  list.forEach(async t => {
    const row = container.querySelector(`.watch-row[data-ticker="${t}"]`);
    if (!row) return;
    const q = await fetchQuote(t);
    if (!q) {
      row.querySelector(".watch-price").textContent = "—";
      row.querySelector(".watch-price").classList.add("muted");
      return;
    }
    row.querySelector(".watch-name").textContent = q.name;
    row.querySelector(".watch-price").textContent = fmtMoney(q.price);
    const chEl = row.querySelector(".watch-change");
    chEl.textContent = fmtPct(q.changePct);
    chEl.classList.remove("muted");
    chEl.classList.toggle("up", q.changePct >= 0);
    chEl.classList.toggle("down", q.changePct < 0);
    row.querySelector(".watch-volume").textContent = fmtVolume(q.volume);
    row.querySelector(".watch-volume").classList.remove("muted");
  });
}

function wireWatchlistAddForm() {
  const input = $("watch-add-input");
  const btn = $("watch-add-btn");
  if (!input || !btn) return;
  btn.addEventListener("click", () => {
    const v = (input.value || "").toUpperCase().trim();
    if (!v) return;
    addToWatchlist(v);
    input.value = "";
    renderWatchlistTab();
    updateWatchlistButton();
  });
  input.addEventListener("keydown", e => { if (e.key === "Enter") btn.click(); });
}

function wireWatchlistToggle() {
  const btn = $("watchlistToggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (isInWatchlist(state.ticker)) removeFromWatchlist(state.ticker);
    else addToWatchlist(state.ticker);
    updateWatchlistButton();
  });
}

// ---------------------------------------------------------------------------
// View routing
// ---------------------------------------------------------------------------

function switchView(target) {
  document.querySelectorAll(".nav-links a").forEach(a =>
    a.classList.toggle("active", a.dataset.view === target));
  document.querySelectorAll(".view").forEach(v =>
    v.classList.toggle("active", v.id === "view-" + target));

  if (target === "dashboard") {
    requestAnimationFrame(() => renderTab(state.activeTab));
  } else if (target === "watchlist") {
    renderWatchlistTab();
  } else if (target === "methodology") {
    // Re-render inline freshness span (the methodology view was hidden when init ran)
    renderFreshnessBadge();
  }
}

// ---------------------------------------------------------------------------
// Onboarding screen (shown when no pre-baked data files exist yet)
// ---------------------------------------------------------------------------

function showOnboardingScreen() {
  const page = document.querySelector(".page");
  if (!page) return;

  const hero = document.querySelector(".hero");
  if (hero) hero.style.display = "none";

  page.innerHTML = `
    <div class="setup-screen">
      <div class="setup-card">
        <div class="setup-icon">📊</div>
        <h1 class="setup-title">Generate the data</h1>
        <p class="setup-lede">
          Quantis reads OHLCV bars and model outputs from JSON files in the repo.
          Generate them once by running the Colab notebook — about 2 minutes for
          bars, ~45 minutes (on GPU) for the full model retrain.
        </p>

        <ol class="setup-steps">
          <li>
            <strong>Open <code>Quantis_Pipeline.ipynb</code> in Colab.</strong>
            Upload it from your repo, or open directly from GitHub via Colab's
            <em>File → Open notebook → GitHub</em> tab.
          </li>
          <li>
            <strong>Create a GitHub Personal Access Token.</strong>
            Go to <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener">github.com/settings/tokens</a> →
            generate a fine-grained token scoped to <em>only your quantis repo</em>
            with <em>Contents: Read &amp; write</em> permission.
          </li>
          <li>
            <strong>Store the token in Colab Secrets.</strong>
            Click the 🔑 key icon in Colab's left sidebar → Add new secret →
            Name: <code>GITHUB_TOKEN</code> → paste the token → toggle
            <em>Notebook access</em> on.
          </li>
          <li>
            <strong>Set your repo coords</strong> in the notebook's config cell
            (<code>GH_USER</code>, <code>GH_REPO</code>), then
            <strong>Runtime → Run all</strong>. For faster LSTM training, switch to
            a GPU runtime first (Runtime → Change runtime type → T4 GPU).
          </li>
          <li>
            The notebook pushes the generated JSONs directly to your repo in one
            commit. GitHub Pages redeploys in ~30 seconds, then this dashboard
            lights up.
          </li>
        </ol>

        <div class="setup-why">
          <strong>Why pre-generate?</strong> Yahoo Finance blocked browser fetches
          in 2025, Finnhub moved historical bars to paid in 2024, Alpha Vantage
          caps free at 25 calls/day. For a static portfolio site, the only
          bulletproof approach is to fetch data offline in Python (where Yahoo
          still works fine) and commit the JSONs. The dashboard then has zero
          external dependencies — no keys, no CORS, no rate limits, nothing
          to break.
        </div>

        <div class="setup-why" style="margin-top:12px">
          <strong>Refreshing prices later?</strong> Just re-run the notebook with
          <code>RUN_FORECASTS = False</code> in the config cell. ~2 minutes for
          all 100 tickers. The slow forecast retrain only needs to run monthly
          (or whenever the market regime shifts and the models need updating).
        </div>

        <div class="setup-why" style="margin-top:12px">
          <strong>Already ran the notebook?</strong> Check that
          <code>data/bars/manifest.json</code> and at least one
          <code>data/bars/&lt;TICKER&gt;.json</code> file exist in your repo.
          Then hard-refresh this page (Cmd/Ctrl + Shift + R).
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function init() {
  // Quick health check: try to load the manifest. If no bars exist yet,
  // show the onboarding screen instead of a broken dashboard.
  (async () => {
    try {
      const res = await fetch("data/bars/manifest.json");
      if (!res.ok) { showOnboardingScreen(); return; }
      const manifest = await res.json();
      if (!manifest.tickers || manifest.tickers.length === 0) {
        showOnboardingScreen();
        return;
      }
      // Data is available — boot the dashboard.
      bootDashboard(manifest);
    } catch {
      showOnboardingScreen();
    }
  })();
}

function bootDashboard(manifest) {
  // If the initial ticker isn't in the manifest, switch to one that is.
  if (manifest.tickers && manifest.tickers.length > 0 && !manifest.tickers.includes(state.ticker)) {
    state.ticker = manifest.tickers[0];
  }

  // Stash manifest for freshness badge + ticker coverage info
  state.manifest = manifest;
  renderFreshnessBadge();

  // Nav links
  document.querySelectorAll(".nav-links a").forEach(a =>
    a.addEventListener("click", e => { e.preventDefault(); switchView(a.dataset.view); }));

  // Tabs
  document.querySelectorAll(".tab").forEach(tab =>
    tab.addEventListener("click", () => renderTab(tab.dataset.tab)));

  // Ticker autocomplete
  initAutocomplete($("tickerInput"), $("tickerDropdown"),
    t => loadTicker(t.s));

  // Analyze button
  $("analyzeBtn").addEventListener("click", () => loadTicker($("tickerInput").value));

  // Watchlist controls
  wireWatchlistToggle();
  wireWatchlistAddForm();

  // Resize → redraw chart
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => renderTab(state.activeTab), 80);
  });

  // Initial load
  loadTicker(state.ticker);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
