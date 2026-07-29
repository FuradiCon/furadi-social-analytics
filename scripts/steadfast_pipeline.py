"""
Fetches accumulated daily page-view traffic (and Anthropic API cost) for the
"Scattered to Steadfast" site (github.com/FuradiCon/mens-daily) and shapes it
into a dashboard channel bundle. That site's own daily pipeline records its
page views into a rolling traffic.json, and its per-run Anthropic API usage
into usage.json, so this just reads the already-accumulated history rather
than hitting either source directly.

Traffic source note: until 2026-07-29 the upstream pipeline recorded GitHub's
repo traffic API, which measures views of the *repository page* on github.com
rather than visits to the published Pages site — so it reported zeros for its
entire history. It now records GoatCounter. Two consequences here:

  * traffic.json became an object (`{"fetched_at", "last_error", "days"}`)
    instead of a bare array. Both are accepted, old-format first.
  * day rows no longer carry `uniques`. GoatCounter exposes a single
    already-deduplicated number per day, so `uniques` defaults to 0.
"""

import json
import urllib.request

TRAFFIC_URL = "https://raw.githubusercontent.com/FuradiCon/mens-daily/master/traffic.json"
USAGE_URL = "https://raw.githubusercontent.com/FuradiCon/mens-daily/master/usage.json"
WINDOW_DAYS = 28

ACCENT = {"accent": "#C6913F", "accentStrong": "#E8C27A", "accentSoft": "#3B2A12"}


def _fetch_json(url):
    with urllib.request.urlopen(url, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _cost_by_date(usage_url):
    """usage.json is a per-run log (a day can have more than one run), so
    cost per day is a sum, not a single value. Never let a missing or
    broken usage.json take down the whole channel -- traffic data is more
    important than cost data, so this fails soft to an empty map."""
    try:
        runs = _fetch_json(usage_url)
    except Exception:
        return {}
    totals = {}
    for run in runs:
        day = run.get("date")
        if not day:
            continue
        totals[day] = totals.get(day, 0.0) + (run.get("estimatedCostUsd") or 0.0)
    return totals


def _day_rows(payload):
    """traffic.json is an envelope since 2026-07-29; it was a bare array before."""
    if isinstance(payload, list):
        return payload
    return payload.get("days", [])


def fetch_steadfast_bundle(url=TRAFFIC_URL, usage_url=USAGE_URL):
    rows = _day_rows(_fetch_json(url))
    cost_by_date = _cost_by_date(usage_url)

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
        "url": "https://furadicon.github.io/mens-daily/",
        "kind": "traffic",
        "accent": ACCENT,
        "dateRangeIso": f'{window[0]["d"]} → {window[-1]["d"]}' if window else "No data yet",
        "data": [
            {
                "d": r["d"],
                "views": r["views"],
                "uniques": r.get("uniques", 0),
                "costUsd": round(cost_by_date.get(r["d"], 0.0), 4),
            }
            for r in window
        ],
        "prior": prior,
    }
