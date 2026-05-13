"""
Quantis — Build js/tickers.js from the Python ticker universe.

Run this whenever you change the contents of tickers.py:
    python build_tickers_js.py

It writes a small ES module at js/tickers.js, which the autocomplete
imports. This keeps the JS and Python ticker lists in lock-step without
hand-syncing.
"""

import json
from pathlib import Path

from tickers import TICKERS

OUT = Path(__file__).parent.parent / "js" / "tickers.js"

records = [{"s": t[0], "n": t[1]} for t in TICKERS]
body = json.dumps(records, indent=2)

content = f"""/**
 * Quantis — Ticker universe (auto-generated)
 * ===========================================
 *
 * DO NOT EDIT BY HAND. This file is regenerated from python/tickers.py
 * by python/build_tickers_js.py. To change the list, edit tickers.py
 * and rerun the build script.
 *
 * {len(records)} tickers covered.
 */

export const TICKERS = {body};

/** Look up a company name by ticker symbol. */
export function nameFor(symbol) {{
  const s = (symbol || "").toUpperCase().trim();
  const hit = TICKERS.find(t => t.s === s);
  return hit ? hit.n : s + " Corp.";
}}
"""

OUT.write_text(content)
print(f"Wrote {OUT} ({len(records)} tickers, {OUT.stat().st_size} bytes)")
