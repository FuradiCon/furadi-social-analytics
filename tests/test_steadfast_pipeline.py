import json
from unittest.mock import patch, MagicMock
from scripts.steadfast_pipeline import fetch_steadfast_bundle, _cost_by_date


def _mock_response(rows):
    resp = MagicMock()
    resp.read.return_value = json.dumps(rows).encode("utf-8")
    resp.__enter__.return_value = resp
    return resp


def _by_url(mapping):
    """Route urlopen(url, ...) to a different canned response per URL, so
    traffic.json and usage.json can be mocked independently."""
    def opener(url, *args, **kwargs):
        for needle, rows in mapping.items():
            if needle in url:
                return _mock_response(rows)
        raise AssertionError(f"unexpected URL: {url}")
    return opener


def _row(day, views, uniques=1):
    return {"d": day, "views": views, "uniques": uniques}


def _run(date, cost):
    return {"date": date, "estimatedCostUsd": cost}


def test_fetch_steadfast_bundle_windows_last_28_days_and_computes_prior():
    rows = [_row(f"2026-06-{d:02d}", views=d) for d in range(1, 31)] + \
           [_row(f"2026-07-{d:02d}", views=d) for d in range(1, 27)]
    with patch("scripts.steadfast_pipeline.urllib.request.urlopen", side_effect=_by_url({"traffic.json": rows, "usage.json": []})):
        bundle = fetch_steadfast_bundle()

    assert bundle["slug"] == "steadfast-counter"
    assert bundle["url"] == "https://furadicon.github.io/mens-daily/"
    assert bundle["kind"] == "traffic"
    assert bundle["accent"]["accent"]
    assert len(bundle["data"]) == 28
    assert bundle["data"][-1]["d"] == "2026-07-26"
    assert bundle["prior"] is not None
    assert bundle["prior"]["views"] == sum(r["views"] for r in rows[-56:-28])


def test_fetch_steadfast_bundle_handles_short_history_with_no_prior():
    rows = [_row(f"2026-07-{d:02d}", views=d) for d in range(1, 6)]
    with patch("scripts.steadfast_pipeline.urllib.request.urlopen", side_effect=_by_url({"traffic.json": rows, "usage.json": []})):
        bundle = fetch_steadfast_bundle()

    assert len(bundle["data"]) == 5
    assert bundle["prior"] is None
    assert bundle["dateRangeIso"] == "2026-07-01 → 2026-07-05"


def test_fetch_steadfast_bundle_handles_empty_history():
    with patch("scripts.steadfast_pipeline.urllib.request.urlopen", side_effect=_by_url({"traffic.json": [], "usage.json": []})):
        bundle = fetch_steadfast_bundle()

    assert bundle["data"] == []
    assert bundle["prior"] is None
    assert bundle["dateRangeIso"] == "No data yet"


def test_cost_by_date_sums_multiple_runs_on_the_same_day():
    runs = [_run("2026-07-26", 0.40), _run("2026-07-26", 2.59), _run("2026-07-25", 0.10)]
    with patch("scripts.steadfast_pipeline.urllib.request.urlopen", return_value=_mock_response(runs)):
        totals = _cost_by_date("https://example.com/usage.json")

    assert round(totals["2026-07-26"], 2) == 2.99
    assert round(totals["2026-07-25"], 2) == 0.10


def test_cost_by_date_fails_soft_when_usage_json_is_unreachable():
    with patch("scripts.steadfast_pipeline.urllib.request.urlopen", side_effect=OSError("404")):
        totals = _cost_by_date("https://example.com/usage.json")

    assert totals == {}


def test_fetch_steadfast_bundle_merges_daily_cost_into_data_rows():
    rows = [_row("2026-07-25", views=10), _row("2026-07-26", views=20)]
    usage = [_run("2026-07-26", 0.40), _run("2026-07-26", 2.59)]
    with patch("scripts.steadfast_pipeline.urllib.request.urlopen", side_effect=_by_url({"traffic.json": rows, "usage.json": usage})):
        bundle = fetch_steadfast_bundle()

    by_date = {r["d"]: r["costUsd"] for r in bundle["data"]}
    assert by_date["2026-07-25"] == 0.0
    assert round(by_date["2026-07-26"], 2) == 2.99


def test_fetch_steadfast_bundle_survives_unreachable_usage_json():
    rows = [_row("2026-07-26", views=10)]
    with patch("scripts.steadfast_pipeline.urllib.request.urlopen", side_effect=_by_url({"traffic.json": rows})):
        bundle = fetch_steadfast_bundle()

    assert bundle["data"][0]["costUsd"] == 0.0
