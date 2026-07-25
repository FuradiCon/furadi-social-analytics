import json
import datetime
from unittest.mock import patch, mock_open
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
