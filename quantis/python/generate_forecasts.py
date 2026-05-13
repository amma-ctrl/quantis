"""
Quantis — Precomputed ML Forecast Generator
============================================

This script replicates the modelling pipeline from Amen Hailu's
INFO 656 final project notebook and emits a per-ticker JSON file
(`data/forecasts/<TICKER>.json`) that the static web dashboard reads.

The dashboard cannot train LSTM / fit ARIMA in the browser — so this
script handles that offline. The site fetches live OHLCV in JS for
prices, technical indicators, and risk metrics; ML forecasts come
from the JSONs this script produces.

Run:
    pip install -r requirements.txt
    python generate_forecasts.py            # default ticker list
    python generate_forecasts.py AAPL MSFT  # specific tickers

Author: Amen Hailu
"""

import json
import sys
import warnings
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf
import ta

from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    mean_absolute_error,
    mean_absolute_percentage_error,
    mean_squared_error,
)
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.tree import DecisionTreeClassifier

from statsmodels.tsa.arima.model import ARIMA

import tensorflow as tf
from tensorflow.keras.callbacks import EarlyStopping
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.models import Sequential

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------

DEFAULT_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA",
    "JPM", "V", "WMT", "DIS", "NFLX", "AMD", "SPY", "QQQ",
]

FEATURE_COLS = [
    "rsi", "macd", "macd_signal", "macd_diff", "stoch_k", "stoch_d",
    "bb_width", "bb_position", "atr_percent", "volume_ratio",
    "returns_1d", "returns_5d", "returns_10d", "returns_20d",
    "volatility_20d", "price_to_sma20", "price_to_sma50",
    "daily_range", "trend_strength",
]

LSTM_LOOKBACK = 60
LSTM_FORECAST_DAYS = 30
ARIMA_ORDER = (5, 1, 0)
ARIMA_FORECAST_DAYS = 30

OUTPUT_DIR = Path(__file__).parent.parent / "data" / "forecasts"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# DATA + FEATURE ENGINEERING (mirrors the notebook)
# ---------------------------------------------------------------------------

def fetch_stock_data(ticker: str, period: str = "5y") -> pd.DataFrame:
    """Pull OHLCV from Yahoo Finance, normalised to lowercase columns."""
    stock = yf.Ticker(ticker)
    df = stock.history(period=period)
    if df.empty:
        raise ValueError(f"No data returned for {ticker}")
    df.columns = [c.lower() for c in df.columns]
    df = df.reset_index()
    df["date"] = pd.to_datetime(df["Date"]).dt.tz_localize(None)
    df = df.drop(columns=["Date"])
    return df[["date", "open", "high", "low", "close", "volume"]]


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Notebook's feature engineering — identical formula by formula."""
    df = df.copy()

    df["sma_20"] = ta.trend.sma_indicator(df["close"], window=20)
    df["sma_50"] = ta.trend.sma_indicator(df["close"], window=50)
    df["ema_12"] = ta.trend.ema_indicator(df["close"], window=12)
    df["ema_26"] = ta.trend.ema_indicator(df["close"], window=26)

    df["rsi"] = ta.momentum.rsi(df["close"], window=14)
    macd = ta.trend.MACD(df["close"])
    df["macd"] = macd.macd()
    df["macd_signal"] = macd.macd_signal()
    df["macd_diff"] = macd.macd_diff()
    stoch = ta.momentum.StochasticOscillator(df["high"], df["low"], df["close"])
    df["stoch_k"] = stoch.stoch()
    df["stoch_d"] = stoch.stoch_signal()

    bb = ta.volatility.BollingerBands(df["close"])
    df["bb_high"] = bb.bollinger_hband()
    df["bb_low"] = bb.bollinger_lband()
    df["bb_width"] = (df["bb_high"] - df["bb_low"]) / bb.bollinger_mavg()
    df["bb_position"] = (df["close"] - df["bb_low"]) / (df["bb_high"] - df["bb_low"])
    df["atr"] = ta.volatility.average_true_range(df["high"], df["low"], df["close"])
    df["atr_percent"] = df["atr"] / df["close"] * 100

    df["volume_sma"] = df["volume"].rolling(window=20).mean()
    df["volume_ratio"] = df["volume"] / df["volume_sma"]

    df["returns_1d"] = df["close"].pct_change(1)
    df["returns_5d"] = df["close"].pct_change(5)
    df["returns_10d"] = df["close"].pct_change(10)
    df["returns_20d"] = df["close"].pct_change(20)

    df["volatility_20d"] = df["returns_1d"].rolling(20).std() * np.sqrt(252)
    df["price_to_sma20"] = df["close"] / df["sma_20"]
    df["price_to_sma50"] = df["close"] / df["sma_50"]
    df["daily_range"] = (df["high"] - df["low"]) / df["close"]
    df["trend_strength"] = abs(df["sma_20"] - df["sma_50"]) / df["close"]

    return df


# ---------------------------------------------------------------------------
# MODELS
# ---------------------------------------------------------------------------

def train_classifiers(df: pd.DataFrame, prediction_days: int = 1) -> dict:
    """Phase I: Logistic Regression, Decision Tree, Random Forest."""
    df = df.copy()
    df["target"] = (df["close"].shift(-prediction_days) > df["close"]).astype(int)
    df_clean = df.dropna(subset=FEATURE_COLS + ["target"])

    split_idx = int(len(df_clean) * 0.8)
    train_df, test_df = df_clean.iloc[:split_idx], df_clean.iloc[split_idx:]

    X_train, X_test = train_df[FEATURE_COLS].values, test_df[FEATURE_COLS].values
    y_train, y_test = train_df["target"].values, test_df["target"].values

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    results = {}

    lr = LogisticRegression(random_state=42, max_iter=1000)
    lr.fit(X_train_s, y_train)
    results["logistic_regression"] = {
        "accuracy": float(accuracy_score(y_test, lr.predict(X_test_s))),
    }

    dt = DecisionTreeClassifier(random_state=42, max_depth=10)
    dt.fit(X_train_s, y_train)
    results["decision_tree"] = {
        "accuracy": float(accuracy_score(y_test, dt.predict(X_test_s))),
    }

    rf = RandomForestClassifier(n_estimators=100, random_state=42, max_depth=10)
    rf.fit(X_train_s, y_train)
    rf_pred = rf.predict(X_test_s)
    rf_proba = rf.predict_proba(X_test_s)[:, 1]
    results["random_forest"] = {
        "accuracy": float(accuracy_score(y_test, rf_pred)),
        "baseline_up_rate": float(y_test.mean()),
        "next_day_prob_up": float(rf_proba[-1]),
        "feature_importances": {
            FEATURE_COLS[i]: float(rf.feature_importances_[i])
            for i in range(len(FEATURE_COLS))
        },
    }

    return results


def train_lstm(df: pd.DataFrame) -> dict:
    """Phase II: 3-layer LSTM on closing prices with 60-day lookback."""
    prices = df["close"].dropna().values.reshape(-1, 1)
    scaler = MinMaxScaler(feature_range=(0, 1))
    scaled = scaler.fit_transform(prices)

    X, y = [], []
    for i in range(LSTM_LOOKBACK, len(scaled)):
        X.append(scaled[i - LSTM_LOOKBACK:i, 0])
        y.append(scaled[i, 0])
    X = np.array(X).reshape(-1, LSTM_LOOKBACK, 1)
    y = np.array(y)

    split_idx = int(len(X) * 0.8)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    model = Sequential([
        LSTM(50, return_sequences=True, input_shape=(LSTM_LOOKBACK, 1)),
        Dropout(0.2),
        LSTM(50, return_sequences=True),
        Dropout(0.2),
        LSTM(50, return_sequences=False),
        Dropout(0.2),
        Dense(25, activation="relu"),
        Dense(1),
    ])
    model.compile(optimizer="adam", loss="mean_squared_error")

    early = EarlyStopping(monitor="val_loss", patience=10, restore_best_weights=True)
    model.fit(
        X_train, y_train,
        batch_size=32, epochs=50,
        validation_data=(X_test, y_test),
        callbacks=[early], verbose=0,
    )

    # Test-set fit (for backtesting on the dashboard)
    pred_scaled = model.predict(X_test, verbose=0)
    pred = scaler.inverse_transform(pred_scaled).flatten()
    actual = scaler.inverse_transform(y_test.reshape(-1, 1)).flatten()

    rmse = float(np.sqrt(mean_squared_error(actual, pred)))
    mae = float(mean_absolute_error(actual, pred))
    mape = float(mean_absolute_percentage_error(actual, pred) * 100)

    # 30-day forward forecast — recursive prediction
    last_seq = scaled[-LSTM_LOOKBACK:].reshape(1, LSTM_LOOKBACK, 1)
    forecast_scaled = []
    cur = last_seq.copy()
    for _ in range(LSTM_FORECAST_DAYS):
        nxt = model.predict(cur, verbose=0)[0, 0]
        forecast_scaled.append(nxt)
        cur = np.concatenate([cur[:, 1:, :], [[[nxt]]]], axis=1)
    forecast = scaler.inverse_transform(
        np.array(forecast_scaled).reshape(-1, 1)
    ).flatten().tolist()

    return {
        "rmse": rmse,
        "mae": mae,
        "mape": mape,
        "test_actual": actual.tolist(),
        "test_predicted": pred.tolist(),
        "forecast_30d": forecast,
        "lookback": LSTM_LOOKBACK,
    }


def train_arima(df: pd.DataFrame) -> dict:
    """Phase III: ARIMA(5,1,0) on the last 500 trading days."""
    prices = df["close"].dropna().tail(500).reset_index(drop=True)
    split_idx = int(len(prices) * 0.8)
    train, test = prices.iloc[:split_idx], prices.iloc[split_idx:]

    # Walk-forward forecast on the test set
    history = list(train)
    test_pred = []
    for actual in test:
        try:
            m = ARIMA(history, order=ARIMA_ORDER).fit()
            yhat = float(m.forecast()[0])
        except Exception:
            yhat = history[-1]
        test_pred.append(yhat)
        history.append(actual)

    test_actual = test.tolist()
    rmse = float(np.sqrt(mean_squared_error(test_actual, test_pred)))
    mae = float(mean_absolute_error(test_actual, test_pred))
    mape = float(mean_absolute_percentage_error(test_actual, test_pred) * 100)

    # 30-day forward forecast on full history
    full_model = ARIMA(list(prices), order=ARIMA_ORDER).fit()
    forecast = [float(v) for v in full_model.forecast(ARIMA_FORECAST_DAYS)]

    return {
        "order": list(ARIMA_ORDER),
        "rmse": rmse,
        "mae": mae,
        "mape": mape,
        "test_actual": test_actual,
        "test_predicted": test_pred,
        "forecast_30d": forecast,
        "aic": float(full_model.aic),
    }


# ---------------------------------------------------------------------------
# MULTI-HORIZON ENSEMBLE (Phase IV)
# ---------------------------------------------------------------------------

def multi_horizon_signals(df: pd.DataFrame) -> dict:
    """For each horizon (1, 3, 5, 10, 20 days) train a quick RF and emit P(up)."""
    horizons = [1, 3, 5, 10, 20]
    out = {}
    for h in horizons:
        d = df.copy()
        d["target"] = (d["close"].shift(-h) > d["close"]).astype(int)
        d = d.dropna(subset=FEATURE_COLS + ["target"])
        if len(d) < 200:
            out[str(h)] = None
            continue
        split = int(len(d) * 0.8)
        X_train, X_test = d[FEATURE_COLS].iloc[:split].values, d[FEATURE_COLS].iloc[split:].values
        y_train, y_test = d["target"].iloc[:split].values, d["target"].iloc[split:].values
        scaler = StandardScaler()
        X_train = scaler.fit_transform(X_train)
        X_test = scaler.transform(X_test)
        rf = RandomForestClassifier(n_estimators=80, random_state=42, max_depth=8)
        rf.fit(X_train, y_train)
        last_row = scaler.transform(d[FEATURE_COLS].iloc[[-1]].values)
        out[str(h)] = {
            "horizon_days": h,
            "accuracy": float(accuracy_score(y_test, rf.predict(X_test))),
            "p_up": float(rf.predict_proba(last_row)[0, 1]),
        }
    return out


# ---------------------------------------------------------------------------
# BUILD ONE TICKER
# ---------------------------------------------------------------------------

def build_ticker(ticker: str) -> dict:
    print(f"\n>>> Processing {ticker}")

    df_raw = fetch_stock_data(ticker, period="5y")
    print(f"    Fetched {len(df_raw)} trading days "
          f"({df_raw['date'].min().date()} → {df_raw['date'].max().date()})")

    df = engineer_features(df_raw)

    print("    Training classifiers ...")
    classifiers = train_classifiers(df)

    print("    Training LSTM ...")
    lstm = train_lstm(df_raw)

    print("    Fitting ARIMA ...")
    arima = train_arima(df_raw)

    print("    Multi-horizon signals ...")
    horizons = multi_horizon_signals(df)

    return {
        "ticker": ticker,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "data_range": {
            "start": df_raw["date"].min().strftime("%Y-%m-%d"),
            "end": df_raw["date"].max().strftime("%Y-%m-%d"),
            "trading_days": int(len(df_raw)),
        },
        "last_close": float(df_raw["close"].iloc[-1]),
        "classifiers": classifiers,
        "lstm": lstm,
        "arima": arima,
        "horizons": horizons,
    }


def main():
    tickers = sys.argv[1:] if len(sys.argv) > 1 else DEFAULT_TICKERS

    manifest = {"generated_at": datetime.utcnow().isoformat() + "Z", "tickers": []}
    for t in tickers:
        try:
            payload = build_ticker(t)
            out = OUTPUT_DIR / f"{t}.json"
            out.write_text(json.dumps(payload, indent=2))
            manifest["tickers"].append(t)
            print(f"    Wrote {out}")
        except Exception as e:
            print(f"    !! Failed {t}: {e}")

    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\nManifest: {len(manifest['tickers'])} tickers written.")


if __name__ == "__main__":
    main()
