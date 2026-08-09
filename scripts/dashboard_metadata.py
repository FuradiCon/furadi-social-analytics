"""Helpers for the additive dashboard freshness and account metadata contract."""


def _daily_rows(account):
    return account.get("daily") or account.get("data") or []


def _row_date(row):
    return row.get("day") or row.get("d")


def attach_account_metadata(account):
    """Return an account copy with its configured identity and window metadata."""
    result = dict(account)
    rows = _daily_rows(account)
    dates = [date for date in (_row_date(row) for row in rows) if date]
    result["platform"] = account.get("platform")
    result["accountType"] = account.get("accountType")
    result["dataThrough"] = max(dates) if dates else None
    result["windowDays"] = len(rows)
    return result


def build_dashboard_metadata(bundle, *, built_at):
    """Return a bundle copy with the UTC build timestamp at the top level."""
    result = dict(bundle)
    result["lastBuiltAt"] = built_at.isoformat()
    return result


def account_attention_reasons(account):
    reasons = []
    if account.get("hasNewComments"):
        reasons.append("Needs reply: new comments")
    if account.get("viewsChangePct", 0) < 0:
        reasons.append(f"Views down {abs(round(account['viewsChangePct']))}%")
    if account.get("isBestPeriod"):
        reasons.append("Best period in 28 days")
    return reasons or ["No immediate issue"]
