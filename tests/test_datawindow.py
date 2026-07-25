import datetime
from scripts.datawindow import window_dates, prior_window_dates, totals_from_rows, rows_from_response


def test_window_dates_ends_two_days_before_today():
    start, end = window_dates(today=datetime.date(2026, 7, 25))
    assert end == "2026-07-23"
    assert start == "2026-06-26"


def test_prior_window_dates_is_immediately_before_start():
    prior_start, prior_end = prior_window_dates("2026-06-26")
    assert prior_end == "2026-06-25"
    assert prior_start == "2026-05-29"


def test_totals_from_rows_sums_and_weights_avg_duration():
    rows = [
        {"views": 100, "min": 500, "avgDur": 30, "subG": 5, "subL": 1},
        {"views": 200, "min": 1200, "avgDur": 36, "subG": 3, "subL": 2},
    ]
    totals = totals_from_rows(rows)
    assert totals["views"] == 300
    assert totals["min"] == 1700
    assert totals["netSub"] == 5
    assert round(totals["avgDur"], 4) == round((100 * 30 + 200 * 36) / 300, 4)


def test_totals_from_rows_handles_no_views():
    totals = totals_from_rows([])
    assert totals["views"] == 0
    assert totals["avgDur"] == 0
    assert totals["netSub"] == 0


def test_rows_from_response_maps_columns_by_header_name():
    response = {
        "columnHeaders": [
            {"name": "day"}, {"name": "views"}, {"name": "estimatedMinutesWatched"},
            {"name": "averageViewDuration"}, {"name": "subscribersGained"},
            {"name": "subscribersLost"}, {"name": "likes"}, {"name": "comments"}, {"name": "shares"},
        ],
        "rows": [["2026-07-01", 100, 500, 30, 5, 1, 20, 3, 2]],
    }
    rows = rows_from_response(response)
    assert rows == [{
        "d": "2026-07-01", "views": 100, "min": 500, "avgDur": 30,
        "subG": 5, "subL": 1, "likes": 20, "comments": 3, "shares": 2,
    }]
