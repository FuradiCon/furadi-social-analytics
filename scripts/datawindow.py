import datetime

WINDOW_DAYS = 28
PROCESSING_LAG_DAYS = 2


def window_dates(today=None):
    today = today or datetime.date.today()
    end = today - datetime.timedelta(days=PROCESSING_LAG_DAYS)
    start = end - datetime.timedelta(days=WINDOW_DAYS - 1)
    return start.isoformat(), end.isoformat()


def prior_window_dates(start):
    prior_end = datetime.date.fromisoformat(start) - datetime.timedelta(days=1)
    prior_start = prior_end - datetime.timedelta(days=WINDOW_DAYS - 1)
    return prior_start.isoformat(), prior_end.isoformat()


def totals_from_rows(rows):
    total_views = sum(r["views"] for r in rows)
    total_min = sum(r["min"] for r in rows)
    total_sec = sum(r["avgDur"] * r["views"] for r in rows)
    total_g = sum(r["subG"] for r in rows)
    total_l = sum(r["subL"] for r in rows)
    return {
        "views": total_views,
        "min": total_min,
        "avgDur": (total_sec / total_views) if total_views else 0,
        "netSub": total_g - total_l,
    }


def rows_from_response(response):
    headers = [h["name"] for h in response.get("columnHeaders", [])]
    idx = {name: i for i, name in enumerate(headers)}
    rows = []
    for r in response.get("rows", []):
        rows.append({
            "d": r[idx["day"]],
            "views": r[idx["views"]],
            "min": r[idx["estimatedMinutesWatched"]],
            "avgDur": r[idx["averageViewDuration"]],
            "subG": r[idx["subscribersGained"]],
            "subL": r[idx["subscribersLost"]],
            "likes": r[idx["likes"]],
            "comments": r[idx["comments"]],
            "shares": r[idx["shares"]],
        })
    return rows
