import json
import datetime
from unittest.mock import patch, mock_open

import pytest

from scripts.instagram_pipeline import get_access_token, persist_refreshed_token


def _token_data(expires_in_days):
    expires_at = (datetime.datetime.now() + datetime.timedelta(days=expires_in_days)).isoformat()
    return json.dumps({"access_token": "OLD", "expires_at": expires_at, "ig_user_id": "123"})


def test_get_access_token_returns_cached_when_not_near_expiry():
    with patch("builtins.open", mock_open(read_data=_token_data(10))), \
         patch("os.path.exists", return_value=True):
        token, ig_user_id = get_access_token("instagram_token.json", "app_id", "app_secret")
    assert token == "OLD"
    assert ig_user_id == "123"


def test_get_access_token_refreshes_and_persists_when_near_expiry():
    refresh_response = {"access_token": "NEW", "expires_in": 60 * 24 * 3600}
    with patch("builtins.open", mock_open(read_data=_token_data(2))), \
         patch("os.path.exists", return_value=True), \
         patch("scripts.instagram_pipeline.http_get_json", return_value=refresh_response) as mock_http, \
         patch("scripts.instagram_pipeline.persist_refreshed_token") as mock_persist:
        token, ig_user_id = get_access_token("instagram_token.json", "app_id", "app_secret")

    assert token == "NEW"
    assert ig_user_id == "123"
    assert "ig_refresh_token" in mock_http.call_args[0][0]
    mock_persist.assert_called_once()


@patch("subprocess.run")
def test_persist_refreshed_token_calls_gh_secret_set(mock_run):
    mock_run.return_value.returncode = 0
    persist_refreshed_token("INSTAGRAM_TOKEN", '{"access_token": "NEW"}')
    args = mock_run.call_args[0][0]
    assert args[:3] == ["gh", "secret", "set"]
    assert "INSTAGRAM_TOKEN" in args


# --- regression tests for the 2026-09-15 Instagram outage ------------------
# Root cause: gh secret set failed (expired GH_SECRETS_PAT), which raised out
# of the whole Instagram fetch and dropped the account from data.json. The
# CalledProcessError message carried the refreshed access token in argv, so it
# was printed in plaintext to a public repo's Actions log on every run.

@patch("subprocess.run")
def test_persist_refreshed_token_keeps_the_token_out_of_argv(mock_run):
    """The token must travel on stdin. Anything in argv lands in the
    CalledProcessError message, and from there into the Actions log."""
    mock_run.return_value.returncode = 0
    body = '{"access_token": "SUPERSECRETVALUE", "ig_user_id": "123"}'

    persist_refreshed_token("INSTAGRAM_TOKEN", body)

    argv = mock_run.call_args[0][0]
    assert argv[:3] == ["gh", "secret", "set"]
    assert "INSTAGRAM_TOKEN" in argv
    assert not any("SUPERSECRETVALUE" in str(a) for a in argv), \
        "token leaked into argv; it will appear in CalledProcessError and the CI log"
    assert mock_run.call_args.kwargs.get("input") == body


def test_get_access_token_returns_refreshed_token_when_persist_fails():
    """A failure to SAVE the rotated token must not destroy the fetch. The
    token in hand is valid; only the write-back failed."""
    import subprocess
    refresh_response = {"access_token": "NEW", "expires_in": 60 * 24 * 3600}
    with patch("builtins.open", mock_open(read_data=_token_data(2))), \
         patch("os.path.exists", return_value=True), \
         patch("scripts.instagram_pipeline.http_get_json", return_value=refresh_response), \
         patch("scripts.instagram_pipeline.persist_refreshed_token",
               side_effect=subprocess.CalledProcessError(1, ["gh", "secret", "set"])):
        token, ig_user_id = get_access_token("instagram_token.json", "app_id", "app_secret")

    assert token == "NEW"
    assert ig_user_id == "123"


@pytest.mark.parametrize("in_actions", [True, False])
def test_persist_failure_is_reported_without_echoing_the_token(in_actions, monkeypatch, capsys):
    import subprocess
    if in_actions:
        monkeypatch.setenv("GITHUB_ACTIONS", "true")
    else:
        monkeypatch.delenv("GITHUB_ACTIONS", raising=False)

    refresh_response = {"access_token": "SUPERSECRETVALUE", "expires_in": 60 * 24 * 3600}
    with patch("builtins.open", mock_open(read_data=_token_data(2))), \
         patch("os.path.exists", return_value=True), \
         patch("scripts.instagram_pipeline.http_get_json", return_value=refresh_response), \
         patch("scripts.instagram_pipeline.persist_refreshed_token",
               side_effect=subprocess.CalledProcessError(1, ["gh", "secret", "set"])):
        get_access_token("instagram_token.json", "app_id", "app_secret")

    out = capsys.readouterr().out
    assert "SUPERSECRETVALUE" not in out, "the rotated token must never be printed"
    # A silent failure is what caused the six-day outage, so it must be
    # reported either way -- as an Actions annotation in CI, plainly otherwise.
    assert "[Instagram]" in out
    assert "GH_SECRETS_PAT" in out, "the message must name what actually needs fixing"
    if in_actions:
        assert "::warning::" in out
