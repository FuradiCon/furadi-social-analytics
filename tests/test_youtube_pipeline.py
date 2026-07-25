from unittest.mock import MagicMock, patch

import pytest

from scripts.youtube_pipeline import (
    fetch_top_videos, thread_needs_reply, fetch_recent_comments, get_credentials,
)


def test_get_credentials_raises_catchable_runtimeerror_when_no_token_and_no_client_secret(tmp_path):
    missing_token = str(tmp_path / "token_missing.json")
    missing_secret = str(tmp_path / "client_secret.json")

    with patch("scripts.youtube_pipeline.CLIENT_SECRET_FILE", missing_secret):
        with pytest.raises(RuntimeError):
            get_credentials(missing_token)

        # SystemExit is NOT a subclass of Exception, so a sys.exit() here would slip
        # past build_data.py's per-channel `except Exception` and kill the whole run.
        caught = False
        try:
            get_credentials(missing_token)
        except Exception:
            caught = True
        assert caught is True


@patch("scripts.youtube_pipeline.build")
def test_fetch_top_videos_returns_ranked_videos_with_thumbnails(mock_build):
    analytics = MagicMock()
    analytics.reports().query().execute.return_value = {
        "rows": [["vid1", 500], ["vid2", 300]]
    }
    youtube = MagicMock()
    youtube.videos().list().execute.return_value = {
        "items": [
            {"id": "vid1", "snippet": {"title": "First", "thumbnails": {"high": {"url": "http://x/1.jpg"}}}},
            {"id": "vid2", "snippet": {"title": "Second", "thumbnails": {"medium": {"url": "http://x/2.jpg"}}}},
        ]
    }
    mock_build.side_effect = [analytics, youtube]

    videos = fetch_top_videos(creds=MagicMock(), start_date="2026-07-01", end_date="2026-07-28", channel_id="chan1")

    # Thumbnails link straight to YouTube's CDN — never base64-embedded into data.json.
    assert videos == [
        {"title": "First", "thumb": "http://x/1.jpg", "views": 500, "url": "https://www.youtube.com/watch?v=vid1"},
        {"title": "Second", "thumb": "http://x/2.jpg", "views": 300, "url": "https://www.youtube.com/watch?v=vid2"},
    ]


def test_thread_needs_reply_true_when_no_replies():
    youtube = MagicMock()
    youtube.comments().list().execute.return_value = {"items": []}
    assert thread_needs_reply(youtube, "c1", "channel1") is True


def test_thread_needs_reply_false_when_owner_replied_last():
    youtube = MagicMock()
    youtube.comments().list().execute.return_value = {
        "items": [
            {"snippet": {"publishedAt": "2026-07-01T00:00:00Z", "authorChannelId": {"value": "someone_else"}}},
            {"snippet": {"publishedAt": "2026-07-02T00:00:00Z", "authorChannelId": {"value": "channel1"}}},
        ]
    }
    assert thread_needs_reply(youtube, "c1", "channel1") is False


@patch("scripts.youtube_pipeline.build")
def test_fetch_recent_comments_flags_awaiting_reply(mock_build):
    youtube = MagicMock()
    youtube.commentThreads().list().execute.return_value = {
        "items": [{
            "id": "thread1",
            "snippet": {
                "totalReplyCount": 0,
                "topLevelComment": {"snippet": {
                    "authorDisplayName": "Fan", "textDisplay": "Nice ride!",
                    "likeCount": 3, "publishedAt": "2026-07-20T00:00:00Z",
                    "videoId": "vid1", "authorProfileImageUrl": "http://x/avatar.jpg",
                }},
            },
        }]
    }
    mock_build.return_value = youtube

    with patch("scripts.youtube_pipeline.download_data_uri", return_value=""):
        comments = fetch_recent_comments(creds=MagicMock(), channel_id="channel1", limit=4)

    assert len(comments) == 1
    assert comments[0]["author"] == "Fan"
    assert comments[0]["awaitingReply"] is True
    assert comments[0]["videoUrl"] == "https://www.youtube.com/watch?v=vid1"
