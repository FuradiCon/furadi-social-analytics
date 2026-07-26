"""
Fetches accumulated daily page-view traffic for the "Scattered to Steadfast"
site (github.com/FuradiCon/mens-daily) and shapes it into a dashboard channel
bundle. That site's own daily pipeline records GitHub's repo traffic API
output (which only retains 14 days natively) into a rolling traffic.json, so
this just reads the already-accumulated history rather than hitting GitHub's
traffic endpoint itself.
"""

import json
import urllib.request

TRAFFIC_URL = "https://raw.githubusercontent.com/FuradiCon/mens-daily/master/traffic.json"
WINDOW_DAYS = 28

ACCENT = {"accent": "#C6913F", "accentStrong": "#E8C27A", "accentSoft": "#3B2A12"}


def fetch_steadfast_bundle(url=TRAFFIC_URL):
    with urllib.request.urlopen(url, timeout=15) as resp:
        rows = json.loads(resp.read().decode("utf-8"))

    window = rows[-WINDOW_DAYS:]
    prior_window = rows[-(WINDOW_DAYS * 2):-WINDOW_DAYS]

    prior = None
    if prior_window:
        prior = {
            "views": sum(r["views"] for r in prior_window),
            "uniques": sum(r.get("uniques", 0) for r in prior_window),
        }

    return {
        "slug": "steadfast-counter",
        "name": "Steadfast Counter",
        "kind": "traffic",
        "accent": ACCENT,
        "dateRangeIso": f'{window[0]["d"]} → {window[-1]["d"]}' if window else "No data yet",
        "data": [{"d": r["d"], "views": r["views"], "uniques": r.get("uniques", 0)} for r in window],
        "prior": prior,
    }
