from datetime import datetime, timezone

from scripts.dashboard_metadata import (
    attach_account_metadata,
    account_attention_reasons,
    build_dashboard_metadata,
)


def test_account_metadata_preserves_metrics_and_adds_window_fields():
    account = {
        "name": "Furad Ride",
        "platform": "YouTube",
        "accountType": "Channel",
        "daily": [{"day": "2026-08-04"}, {"day": "2026-08-03"}],
        "views": 4002,
    }
    result = attach_account_metadata(account)
    assert result["views"] == 4002
    assert result["dataThrough"] == "2026-08-04"
    assert result["windowDays"] == 2


def test_dashboard_metadata_puts_build_time_at_top_level():
    bundle = {"channels": [{"name": "Furad Ride"}]}
    result = build_dashboard_metadata(
        bundle,
        built_at=datetime(2026, 8, 7, 4, 14, tzinfo=timezone.utc),
    )
    assert result["channels"] == bundle["channels"]
    assert result["lastBuiltAt"] == "2026-08-07T04:14:00+00:00"


def test_attention_reasons_prioritize_reply_alerts_and_declines():
    account = {
        "hasNewComments": True,
        "viewsChangePct": -25,
        "engagementChangePct": 12,
    }
    assert account_attention_reasons(account) == [
        "Needs reply: new comments",
        "Views down 25%",
    ]
