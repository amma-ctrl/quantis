"""
Quantis — Ticker Universe
==========================

Single source of truth for the 100 tickers covered by the dashboard.
Used by:
  - generate_bars.py / generate_forecasts.py (which tickers to pull data for)
  - The build step that emits js/tickers.js (which feeds the autocomplete
    AND, if seeded data is requested, the synthetic-data generator's
    starting prices)

Reference prices are approximate spot prices from early May 2026, used
ONLY as a starting point for synthetic backfill if you choose to seed
the dashboard with fake-but-realistic data before pulling real data.
When generate_bars.py runs against real Yahoo data, these references
are ignored — actual closing prices come down instead.

If you want to add or remove tickers, edit this file and rerun:
    python build_tickers_js.py
    python generate_bars.py
"""

# (symbol, name, reference_price, sector, annual_vol)
TICKERS = [
    # --- Mega-cap tech ---
    ("AAPL",  "Apple Inc.",                    195.0, "Tech",     0.28),
    ("MSFT",  "Microsoft Corporation",         415.0, "Tech",     0.26),
    ("GOOGL", "Alphabet Inc. Class A",         168.0, "Tech",     0.30),
    ("GOOG",  "Alphabet Inc. Class C",         170.0, "Tech",     0.30),
    ("AMZN",  "Amazon.com Inc.",               185.0, "Tech",     0.32),
    ("NVDA",  "NVIDIA Corporation",            950.0, "Tech",     0.48),
    ("META",  "Meta Platforms Inc.",           495.0, "Tech",     0.36),
    ("TSLA",  "Tesla Inc.",                    250.0, "Auto",     0.55),

    # --- Semiconductors ---
    ("AVGO",  "Broadcom Inc.",                 1320.0, "Tech",    0.34),
    ("AMD",   "Advanced Micro Devices",        165.0, "Tech",     0.46),
    ("QCOM",  "Qualcomm Inc.",                 175.0, "Tech",     0.34),
    ("TXN",   "Texas Instruments Inc.",        185.0, "Tech",     0.26),
    ("MU",    "Micron Technology Inc.",        135.0, "Tech",     0.50),
    ("TSM",   "Taiwan Semiconductor",          175.0, "Tech",     0.36),
    ("INTC",  "Intel Corp.",                    35.0, "Tech",     0.42),
    ("ARM",   "Arm Holdings plc",              115.0, "Tech",     0.50),

    # --- Software / SaaS ---
    ("CRM",   "Salesforce Inc.",               280.0, "Tech",     0.32),
    ("ORCL",  "Oracle Corp.",                  150.0, "Tech",     0.28),
    ("ADBE",  "Adobe Inc.",                    490.0, "Tech",     0.30),
    ("NOW",   "ServiceNow Inc.",               780.0, "Tech",     0.34),
    ("PLTR",  "Palantir Technologies",          25.0, "Tech",     0.62),
    ("SNOW",  "Snowflake Inc.",                160.0, "Tech",     0.50),
    ("SHOP",  "Shopify Inc.",                   75.0, "Tech",     0.50),
    ("UBER",  "Uber Technologies Inc.",         75.0, "Tech",     0.40),

    # --- Financials / Banks ---
    ("BRK-B", "Berkshire Hathaway Inc.",       430.0, "Finance",  0.18),
    ("JPM",   "JPMorgan Chase & Co.",          220.0, "Finance",  0.24),
    ("BAC",   "Bank of America Corp.",          42.0, "Finance",  0.30),
    ("WFC",   "Wells Fargo & Co.",              62.0, "Finance",  0.30),
    ("C",     "Citigroup Inc.",                 65.0, "Finance",  0.32),
    ("GS",    "Goldman Sachs Group Inc.",      460.0, "Finance",  0.28),
    ("MS",    "Morgan Stanley",                100.0, "Finance",  0.28),
    ("V",     "Visa Inc.",                     275.0, "Finance",  0.22),
    ("MA",    "Mastercard Inc.",               470.0, "Finance",  0.22),
    ("AXP",   "American Express Co.",          260.0, "Finance",  0.28),
    ("BLK",   "BlackRock Inc.",                830.0, "Finance",  0.26),
    ("SCHW",  "Charles Schwab Corp.",           75.0, "Finance",  0.32),

    # --- Healthcare / Pharma ---
    ("UNH",   "UnitedHealth Group Inc.",       520.0, "Health",   0.26),
    ("JNJ",   "Johnson & Johnson",             160.0, "Health",   0.18),
    ("LLY",   "Eli Lilly and Co.",             780.0, "Health",   0.36),
    ("PFE",   "Pfizer Inc.",                    27.0, "Health",   0.28),
    ("MRK",   "Merck & Co. Inc.",              125.0, "Health",   0.24),
    ("ABBV",  "AbbVie Inc.",                   175.0, "Health",   0.22),
    ("TMO",   "Thermo Fisher Scientific",      560.0, "Health",   0.26),
    ("ABT",   "Abbott Laboratories",           115.0, "Health",   0.20),
    ("DHR",   "Danaher Corp.",                 250.0, "Health",   0.26),

    # --- Consumer ---
    ("WMT",   "Walmart Inc.",                   70.0, "Consumer", 0.20),
    ("COST",  "Costco Wholesale Corp.",        820.0, "Consumer", 0.22),
    ("HD",    "Home Depot Inc.",               365.0, "Consumer", 0.26),
    ("LOW",   "Lowe's Companies Inc.",         235.0, "Consumer", 0.28),
    ("TGT",   "Target Corp.",                  155.0, "Consumer", 0.30),
    ("NKE",   "Nike Inc.",                      85.0, "Consumer", 0.30),
    ("SBUX",  "Starbucks Corp.",                90.0, "Consumer", 0.28),
    ("MCD",   "McDonald's Corp.",              290.0, "Consumer", 0.20),
    ("PG",    "Procter & Gamble Co.",          165.0, "Consumer", 0.18),
    ("KO",    "Coca-Cola Co.",                  68.0, "Consumer", 0.16),
    ("PEP",   "PepsiCo Inc.",                  170.0, "Consumer", 0.18),

    # --- Media / Communications ---
    ("DIS",   "Walt Disney Co.",               105.0, "Media",    0.30),
    ("NFLX",  "Netflix Inc.",                  620.0, "Media",    0.36),
    ("CMCSA", "Comcast Corp.",                  42.0, "Media",    0.22),
    ("T",     "AT&T Inc.",                      19.0, "Media",    0.20),
    ("VZ",    "Verizon Communications",         42.0, "Media",    0.20),
    ("SPOT",  "Spotify Technology",            330.0, "Media",    0.42),
    ("ROKU",  "Roku Inc.",                      70.0, "Media",    0.60),

    # --- Energy ---
    ("XOM",   "Exxon Mobil Corp.",             115.0, "Energy",   0.26),
    ("CVX",   "Chevron Corp.",                 150.0, "Energy",   0.26),
    ("COP",   "ConocoPhillips",                115.0, "Energy",   0.32),

    # --- Industrials / Materials ---
    ("BA",    "Boeing Co.",                    180.0, "Industry", 0.36),
    ("CAT",   "Caterpillar Inc.",              340.0, "Industry", 0.28),
    ("HON",   "Honeywell International",       205.0, "Industry", 0.22),
    ("UPS",   "United Parcel Service",         140.0, "Industry", 0.26),
    ("LMT",   "Lockheed Martin Corp.",         465.0, "Industry", 0.20),
    ("RTX",   "RTX Corp.",                     105.0, "Industry", 0.22),
    ("GE",    "GE Aerospace",                  165.0, "Industry", 0.30),
    ("DE",    "Deere & Co.",                   430.0, "Industry", 0.28),

    # --- Auto / EV ---
    ("F",     "Ford Motor Co.",                 11.5, "Auto",     0.38),
    ("GM",    "General Motors Co.",             47.0, "Auto",     0.40),
    ("RIVN",  "Rivian Automotive Inc.",         12.0, "Auto",     0.78),
    ("LCID",  "Lucid Group Inc.",                2.8, "Auto",     0.85),
    ("NIO",   "NIO Inc.",                        4.5, "Auto",     0.72),

    # --- Travel / Hospitality ---
    ("ABNB",  "Airbnb Inc.",                   135.0, "Consumer", 0.36),
    ("BKNG",  "Booking Holdings Inc.",        4400.0, "Consumer", 0.28),
    ("MAR",   "Marriott International",        260.0, "Consumer", 0.26),

    # --- Fintech / Payments ---
    ("PYPL",  "PayPal Holdings Inc.",           70.0, "Finance",  0.36),
    ("COIN",  "Coinbase Global Inc.",          220.0, "Finance",  0.70),
    ("SQ",    "Block Inc.",                     75.0, "Finance",  0.50),

    # --- Misc tech ---
    ("CSCO",  "Cisco Systems Inc.",             50.0, "Tech",     0.20),
    ("IBM",   "IBM Corp.",                     165.0, "Tech",     0.22),
    ("DELL",  "Dell Technologies Inc.",        115.0, "Tech",     0.46),
    ("SNAP",  "Snap Inc.",                      12.0, "Tech",     0.56),
    ("RBLX",  "Roblox Corp.",                   42.0, "Tech",     0.52),
    ("BABA",  "Alibaba Group Holding",         110.0, "Tech",     0.40),
    ("JD",    "JD.com Inc.",                    38.0, "Tech",     0.46),

    # --- ETFs / Indices ---
    ("SPY",   "SPDR S&P 500 ETF",              555.0, "ETF",      0.14),
    ("QQQ",   "Invesco QQQ Trust",             475.0, "ETF",      0.18),
    ("VOO",   "Vanguard S&P 500 ETF",          510.0, "ETF",      0.14),
    ("VTI",   "Vanguard Total Stock Market",   275.0, "ETF",      0.14),
    ("IWM",   "iShares Russell 2000 ETF",      210.0, "ETF",      0.22),
    ("DIA",   "SPDR Dow Jones ETF",            400.0, "ETF",      0.14),
    ("GLD",   "SPDR Gold Shares",              230.0, "ETF",      0.16),
    ("SLV",   "iShares Silver Trust",           28.0, "ETF",      0.24),
]

# Just the symbol list, for convenience
SYMBOLS = [t[0] for t in TICKERS]

# Lookup by symbol
INFO = {t[0]: {"name": t[1], "price": t[2], "sector": t[3], "vol": t[4]}
        for t in TICKERS}

if __name__ == "__main__":
    print(f"{len(TICKERS)} tickers in the universe.")
    sectors = {}
    for t in TICKERS:
        sectors[t[3]] = sectors.get(t[3], 0) + 1
    for s, n in sorted(sectors.items(), key=lambda x: -x[1]):
        print(f"  {s:10} {n}")
