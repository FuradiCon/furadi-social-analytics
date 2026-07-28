import base64
import datetime
import os
import urllib.request

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from scripts.datawindow import rows_from_response, totals_from_rows

SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIENT_SECRET_FILE = os.path.join(SCRIPT_DIR, "client_secret.json")

SCOPES = [
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube.force-ssl",
]

DEFAULT_METRICS = (
    "views,estimatedMinutesWatched,averageViewDuration,"
    "subscribersGained,subscribersLost,likes,comments,shares"
)


def get_credentials(token_file):
    creds = None
    if os.path.exists(token_file):
        creds = Credentials.from_authorized_user_file(token_file, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CLIENT_SECRET_FILE):
                # RuntimeError (not SystemExit) so build_data.py's per-channel
                # `except Exception` can catch it and keep the other accounts alive.
                raise RuntimeError(
                    f"Missing {CLIENT_SECRET_FILE} and no valid refresh token in {token_file}."
                )
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
            # Force the Google account picker every time -- an already-logged-in
            # browser session otherwise silently reuses whichever account is
            # active, which can authorize the wrong channel's owner account.
            creds = flow.run_local_server(port=0, prompt="select_account")
        with open(token_file, "w") as f:
            f.write(creds.to_json())

    return creds


def fetch_report(creds, start_date, end_date, metrics, dimensions, channel_id="MINE"):
    analytics = build("youtubeAnalytics", "v2", credentials=creds)
    return (
        analytics.reports()
        .query(ids=f"channel=={channel_id}", startDate=start_date, endDate=end_date,
               metrics=metrics, dimensions=dimensions, sort=dimensions)
        .execute()
    )


def download_data_uri(url):
    if not url:
        return ""
    try:
        with urllib.request.urlopen(url, timeout=10) as img_resp:
            img_bytes = img_resp.read()
            content_type = img_resp.headers.get_content_type() or "image/jpeg"
        return f"data:{content_type};base64,{base64.b64encode(img_bytes).decode('ascii')}"
    except Exception:
        return ""


def fetch_top_videos(creds, start_date, end_date, channel_id, limit=4):
    analytics = build("youtubeAnalytics", "v2", credentials=creds)
    resp = (
        analytics.reports()
        .query(ids=f"channel=={channel_id}", startDate=start_date, endDate=end_date,
               metrics="views", dimensions="video", sort="-views", maxResults=limit)
        .execute()
    )
    ranked = [(r[0], r[1]) for r in resp.get("rows", [])]
    if not ranked:
        return []

    youtube = build("youtube", "v3", credentials=creds)
    meta_resp = youtube.videos().list(part="snippet", id=",".join(v for v, _ in ranked)).execute()
    snippets = {item["id"]: item["snippet"] for item in meta_resp.get("items", [])}

    videos = []
    for video_id, views in ranked:
        snippet = snippets.get(video_id)
        if not snippet:
            continue
        thumbs = snippet.get("thumbnails", {})
        thumb_url = (thumbs.get("high") or thumbs.get("medium") or thumbs.get("default") or {}).get("url")
        videos.append({
            "title": snippet.get("title", ""),
            # Link straight to YouTube's permanent thumbnail CDN URL. Embedding these
            # as base64 would bloat data.json (and every hourly commit) by ~400KB.
            "thumb": thumb_url or "",
            "views": views,
            "url": f"https://www.youtube.com/watch?v={video_id}",
        })
    return videos


def thread_needs_reply(youtube, comment_id, channel_id):
    resp = (
        youtube.comments()
        .list(part="snippet", parentId=comment_id, maxResults=100, textFormat="plainText")
        .execute()
    )
    replies = resp.get("items", [])
    if not replies:
        return True
    latest = max(replies, key=lambda r: r["snippet"].get("publishedAt", ""))
    return latest["snippet"].get("authorChannelId", {}).get("value") != channel_id


def fetch_recent_comments(creds, channel_id, limit=4):
    youtube = build("youtube", "v3", credentials=creds)
    resp = (
        youtube.commentThreads()
        .list(part="snippet", allThreadsRelatedToChannelId=channel_id, order="time",
              maxResults=limit, textFormat="plainText")
        .execute()
    )

    comments = []
    for item in resp.get("items", []):
        top = item["snippet"]["topLevelComment"]["snippet"]
        video_id = top.get("videoId")
        avatar_url = top.get("authorProfileImageUrl")
        if item["snippet"].get("totalReplyCount", 0) > 0:
            awaiting_reply = thread_needs_reply(youtube, item["id"], channel_id)
        else:
            awaiting_reply = True
        comments.append({
            "id": item.get("id", ""),
            "author": top.get("authorDisplayName", ""),
            "avatar": download_data_uri(avatar_url),
            "text": top.get("textDisplay", ""),
            "likes": top.get("likeCount", 0),
            "publishedAt": top.get("publishedAt", ""),
            "videoUrl": f"https://www.youtube.com/watch?v={video_id}" if video_id else "",
            "awaitingReply": awaiting_reply,
        })
    return comments


def fetch_channel_bundle(cfg, start, end, prior_start, prior_end):
    creds = get_credentials(cfg["token_path"])
    channel_id = cfg["channel_id"]

    response = fetch_report(creds, start, end, DEFAULT_METRICS, "day", channel_id=channel_id)
    rows = rows_from_response(response)

    name = cfg["slug"]
    subscriber_count = 0
    subscriber_count_hidden = False
    youtube = build("youtube", "v3", credentials=creds)
    title_resp = youtube.channels().list(part="snippet,statistics", id=channel_id).execute()
    items = title_resp.get("items", [])
    if items:
        name = items[0]["snippet"]["title"]
        stats = items[0].get("statistics", {})
        subscriber_count = int(stats.get("subscriberCount", 0))
        subscriber_count_hidden = stats.get("hiddenSubscriberCount", False)

    top_videos = fetch_top_videos(creds, start, end, channel_id)

    prior_response = fetch_report(creds, prior_start, prior_end, DEFAULT_METRICS, "day", channel_id=channel_id)
    prior_totals = totals_from_rows(rows_from_response(prior_response))

    comments = fetch_recent_comments(creds, channel_id)
    newest_comment = comments[0] if comments else None
    has_new_comments = False
    if newest_comment and newest_comment["awaitingReply"]:
        published_at = datetime.datetime.fromisoformat(newest_comment["publishedAt"].replace("Z", "+00:00"))
        age = datetime.datetime.now(datetime.timezone.utc) - published_at
        has_new_comments = age <= datetime.timedelta(hours=24)

    return {
        "slug": cfg["slug"],
        "name": name,
        "url": f"https://www.youtube.com/channel/{channel_id}",
        "accent": cfg["accent"],
        "dateRangeIso": f"{start} → {end}",
        "data": rows,
        "topVideos": top_videos,
        "comments": comments,
        "hasNewComments": has_new_comments,
        "prior": prior_totals,
        "subscriberCount": subscriber_count,
        "subscriberCountHidden": subscriber_count_hidden,
    }
