# Quantis — Multi-Model Stock Forecasting Dashboard

A web port of a graduate ML research project comparing **five forecasting
approaches** — LSTM, ARIMA, Random Forest, Logistic Regression, and a
multi-horizon ensemble — across **100 US stocks and ETFs**.

Built as one of three portfolio pieces for the MS in Data Analytics &
Visualization at Pratt Institute (INFO 656 final → web).

**Live site:** https://amma-ctrl.github.io/quantis/

---

## How it works

```
   Colab notebook                 GitHub repo                  Static site
 ┌───────────────────┐         ┌──────────────────┐         ┌────────────────┐
 │ Quantis_Pipeline  │  push   │  data/bars/*.json│  serve  │  amma-ctrl     │
 │   .ipynb          │ ──────▶ │  data/forecasts/ │ ──────▶ │  .github.io/   │
 │                   │ (1 PR)  │  manifest.json   │ (Pages) │  quantis/      │
 │ yfinance →        │         │                  │         │                │
 │ feature eng →     │         │                  │         │  Fetches local │
 │ LSTM/ARIMA/RF →   │         │                  │         │  JSON. No API. │
 │ commit to GitHub  │         │                  │         │  Zero CORS.    │
 └───────────────────┘         └──────────────────┘         └────────────────┘
```

No live API, no keys in the browser, no rate limits. The site reads
local JSON files; the notebook regenerates them whenever you want.

---

## First-time setup (~10 minutes)

### 1. Get the site live (UI only, no data yet)

```bash
git clone <your-fork-of-this-repo>
cd quantis
# enable GitHub Pages in repo Settings → Pages → Source: main → root
```

Visit your GitHub Pages URL. You'll see an onboarding screen — that's the
dashboard correctly detecting it has no data yet.

### 2. Generate a GitHub Personal Access Token

Go to **https://github.com/settings/tokens?type=beta** → *Generate new token*

- **Repository access:** Only select repositories → choose your `quantis` repo
- **Permissions:** Repository permissions → **Contents: Read and write**
- Copy the token (starts with `github_pat_...`)

### 3. Open the Colab notebook

The file `Quantis_Pipeline.ipynb` is in the repo root. Open it in Colab one
of these ways:

- Colab → *File → Open notebook → GitHub tab* → paste your repo URL
- Or upload it manually: Colab → *File → Upload notebook*

### 4. Add the token to Colab Secrets

In Colab's left sidebar, click the **🔑 key icon** → *Add new secret*:
- **Name:** `GITHUB_TOKEN`
- **Value:** the token you just copied
- Toggle **Notebook access** on

### 5. Set the repo coords + (optionally) GPU runtime

In the notebook's config cell:
```python
GH_USER   = 'amma-ctrl'      # your GitHub username
GH_REPO   = 'quantis'        # your repo name
GH_BRANCH = 'main'
```

For LSTM training speedup: **Runtime → Change runtime type → T4 GPU**.
Free Colab GPUs make the forecasts cell run roughly 10× faster.

### 6. Run all

**Runtime → Run all.** The notebook will:
1. Install dependencies (~30s)
2. Fetch 5y of OHLCV for 100 tickers (~2 min)
3. Train all five models per ticker (~45 min on GPU, ~90 min on CPU)
4. Push everything to your repo in one Git commit
5. GitHub Pages redeploys in ~30 seconds — refresh your live site

If you want a faster first run, set `RUN_FORECASTS = False` in the config
cell. You'll get all 100 tickers with live price + indicators + risk metrics
in ~2 minutes, but the ML tabs will show "not yet trained" until you do a
full run.

---

## Day-to-day refreshes

Open the notebook in Colab, **Runtime → Run all**. That's it.

| Goal                    | Time      | Config                                |
|-------------------------|-----------|---------------------------------------|
| Refresh prices weekly   | ~2 min    | `RUN_FORECASTS = False`               |
| Full retrain monthly    | ~45 min   | both `True`, GPU runtime              |
| Just a few tickers      | varies    | `TICKERS_TO_RUN = ['AAPL', 'NVDA']`   |
| Inspect before pushing  | 0         | `PUSH_TO_GITHUB = False`              |

The dashboard shows a "Data: 2 days ago" badge in the nav bar so visitors
(and you) always know when the data was last refreshed.

---

## Project structure

```
quantis/
├── index.html
├── README.md
├── Quantis_Pipeline.ipynb      ← THE Colab notebook (the whole pipeline)
├── css/
│   └── main.css
├── js/
│   ├── app.js                  # Main orchestrator + view routing
│   ├── data.js                 # Loads local JSON files (no API)
│   ├── indicators.js           # RSI, MACD, SMA, Bollinger, ATR, risk
│   ├── chart.js                # Canvas chart renderer
│   ├── ticker-search.js        # Autocomplete logic
│   ├── tickers.js              # 100-ticker list (autocomplete data)
│   └── watchlist.js            # localStorage watchlist
├── data/
│   ├── bars/                   ← notebook writes here (OHLCV JSONs)
│   │   ├── manifest.json
│   │   └── <TICKER>.json
│   └── forecasts/              ← notebook writes here (ML outputs)
│       ├── manifest.json
│       └── <TICKER>.json
└── python/
    ├── tickers.py              # 100-ticker source of truth (Python side)
    └── build_tickers_js.py     # Regenerates js/tickers.js from tickers.py
                                  (only needed if you change the static list)
```

---

## Adding tickers

The 100-ticker universe is defined in two places that must stay in sync:

- **Notebook cell 6** — `TICKER_UNIVERSE` list, used for data generation
- **`js/tickers.js`** — autocomplete data, generated from `python/tickers.py`

To add a new ticker:

1. Add the line to the notebook's `TICKER_UNIVERSE` cell
2. Add the line to `python/tickers.py`
3. Run `python python/build_tickers_js.py` to regenerate `js/tickers.js`
4. Run the notebook (with `TICKERS_TO_RUN = ['NEW_SYMBOL']` for a fast targeted run)
5. Commit `js/tickers.js` and `python/tickers.py`; the notebook pushes the data JSONs

Or just edit both lists together once and re-run the full notebook — the
ticker list rarely changes after the first setup.

---

## What the dashboard shows

**Sidebar (always visible):**
- Last-bar summary: price, change, OHLC, 52w high/low
- 7 technical indicators: RSI, MACD, SMA-20/50/200, Bollinger, EMA-12
- 7 risk metrics: Sharpe, Sortino, Calmar, max DD, profit factor, win rate, annualized vol

**Buy/sell windows panel:**
- Buy zone (lower Bollinger → mid-band)
- Sell zone (upper Bollinger → 52w high)
- Stop loss (lower Bollinger − 1 ATR)
- R/R ratio
- Multi-signal consensus bar (RF probability + RSI + MACD + SMA-20)

**Tabbed chart:**
- *Price History* — Daily closes + SMA-20/50 overlays
- *LSTM* — 30-day forecast + test-set fit; RMSE / MAE / MAPE
- *ARIMA* — Walk-forward predictions + 30-day forecast; AIC
- *Random Forest* — Accuracy vs LR/DT/baseline + feature importances + next-day P(UP)
- *Multi-Horizon* — Per-horizon RF probabilities at 1, 3, 5, 10, 20 days
- *Backtest* — 6 equity curves vs $10k buy-and-hold benchmark

**Watchlist** — localStorage-backed, pre-seeded with AAPL, MSFT, NVDA, GOOGL, AMZN, TSLA

**Methodology** — Full write-up explaining every model + the data pipeline + honest limitations

---

## Stack

- **Frontend:** Vanilla ES modules, canvas charts, no framework, no build step
- **Fonts:** Outfit (UI), JetBrains Mono (numbers/code)
- **Pipeline:** Colab + Python 3.11+ with TensorFlow, statsmodels, scikit-learn, ta, yfinance, PyGithub
- **Hosting:** GitHub Pages

---

## License & disclaimer

Educational research project — not financial advice. Past performance is
not a guarantee of future results. Released under MIT.
