import json
from unittest.mock import patch, MagicMock
from scripts.steadfast_pipeline import fetch_steadfast_bundle


def _mock_response(rows):
    resp = MagicMock()
    resp.read.return_value = json.dumps(rows).encode("utf-8")
    resp.__enter__.return_value = resp
    return resp


def _row(day, views, uniques=1):
    return {"d": day, "views": views, "uniques": uniques}


def test_fetch_steadfast_bundle_windows_last_28_days_and_computes_prior():
    rows = [_row(f"2026-06-{d:02d}", views=d) for d in range(1, 31)] + \
           [_row(f"2026-07-{d:02d}", views=d) for d in range(1, 27)]
    with patch("scripts.steadfast_pipeline.urllib.request.urlopen", return_value=_mock_response(rows)):
        bundle = fetch_steadfast_bundle()

    assert bundle["slug"] == "steadfast-counter"
    assert bundle["kind"] == "traffic"
    assert bundle["accent"]["accent"]
    assert len(bundle["data"]) == 28
    assert bundle["data"][-1]["d"] == "2026-07-26"
    assert bundle["prior"] is not None
    assert bundle["prior"]["views"] == sum(r["views"] for r in rows[-56:-28])


def test_fetch_steadfast_bundle_handles_short_history_with_no_prior():
    rows = [_row(f"2026-07-{d:02d}", views=d) for d in range(1, 6)]
    with patch("scripts.steadfast_pipeline.urllib.request.urlopen", return_value=_mock_response(rows)):
        bundle = fetch_steadfast_bundle()

    assert len(bundle["data"]) == 5
    assert bundle["prior"] is None
    assert bundle["dateRangeIso"] == "2026-07-01 → 2026-07-05"


def test_fetch_steadfast_bundle_handles_empty_history():
    with patch("scripts.steadfast_pipeline.urllib.request.urlopen", return_value=_mock_response([])):
        bundle = fetch_steadfast_bundle()

    assert bundle["data"] == []
    assert bundle["prior"] is None
    assert bundle["dateRangeIso"] == "No data yet"
