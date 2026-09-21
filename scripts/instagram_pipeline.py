import datetime
import json
import subprocess
import urllib.parse
import urllib.request

from scripts.annotate import gh_warning

GRAPH_VERSION = "v21.0"
GRAPH_BASE = f"https://graph.instagram.com/{GRAPH_VERSION}"


def load_client_secret(path):
    with open(path) as f:
        d = json.load(f)
    return d["app_id"], d["app_secret"]


def http_get_json(url):
    with urllib.request.urlopen(url, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def persist_refreshed_token(secret_name, new_token_json):
    # The token goes on stdin, never in argv. `gh secret set NAME --body <json>`
    # puts the live token in the command line, and subprocess folds the whole
    # command into CalledProcessError's message -- so one failed write printed
    # the rotated access token in plaintext to a PUBLIC repo's Actions log, on
    # every run, for six days. Actions only masks secrets it already knows, and
    # a freshly-rotated token is by definition not one of them.
    subprocess.run(
        ["gh", "secret", "set", secret_name],
        input=new_token_json,
        text=True,
        check=True,
    )


def get_access_token(token_file, app_id, app_secret):
    with open(token_file) as f:
        data = json.load(f)
    expires_at = datetime.datetime.fromisoformat(data["expires_at"])

    if expires_at > datetime.datetime.now() + datetime.timedelta(days=3):
        return data["access_token"], data["ig_user_id"]

    refresh_resp = http_get_json(
        f"{GRAPH_BASE}/refresh_access_token?"
        + urllib.parse.urlencode({"grant_type": "ig_refresh_token", "access_token": data["access_token"]})
    )
    long_token = refresh_resp["access_token"]
    expires_in = refresh_resp.get("expires_in", 60 * 24 * 3600)
    new_expires_at = (datetime.datetime.now() + datetime.timedelta(seconds=expires_in)).isoformat()
    new_data = {"access_token": long_token, "expires_at": new_expires_at, "ig_user_id": data["ig_user_id"]}

    # Failing to SAVE the rotated token must not destroy this run's fetch. The
    # token we're holding is valid right now -- only the write-back failed --
    # so carry on and report loudly. Letting this raise is what dropped
    # Instagram out of data.json entirely for six days when GH_SECRETS_PAT
    # expired, even though the Graph API was answering perfectly.
    try:
        persist_refreshed_token("INSTAGRAM_TOKEN", json.dumps(new_data))
    except Exception as e:
        gh_warning(
            "Instagram",
            f"refreshed the access token but could not write it back to the "
            f"INSTAGRAM_TOKEN secret ({type(e).__name__}). Using it for this run "
            f"only -- the stored copy is now stale, so this will repeat until "
            f"GH_SECRETS_PAT is renewed. Re-auth will be needed if the stored "
            f"token lapses before then.",
        )

    return long_token, data["ig_user_id"]


def fetch_instagram_bundle(token_file, client_secret_file, window_days=28):
    app_id, app_secret = load_client_secret(client_secret_file)
    access_token, ig_user_id = get_access_token(token_file, app_id, app_secret)

    profile = http_get_json(
        f"{GRAPH_BASE}/{ig_user_id}?fields=username,followers_count,media_count&access_token={access_token}"
    )
    username = profile.get("username", "instagram")

    media_resp = http_get_json(
        f"{GRAPH_BASE}/{ig_user_id}/media?"
        f"fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count"
        f"&limit=50&access_token={access_token}"
    )
    media_items = media_resp.get("data", [])

    now = datetime.datetime.now(datetime.timezone.utc)
    cur_start = now - datetime.timedelta(days=window_days)
    prior_start = cur_start - datetime.timedelta(days=window_days)

    def ts_of(m):
        return datetime.datetime.fromisoformat(m["timestamp"].replace("Z", "+00:00"))

    current_media = [m for m in media_items if cur_start <= ts_of(m) < now]
    prior_media = [m for m in media_items if prior_start <= ts_of(m) < cur_start]

    def totals(items):
        return {
            "posts": len(items),
            "likes": sum(m.get("like_count", 0) for m in items),
            "comments": sum(m.get("comments_count", 0) for m in items),
        }

    recent = sorted(media_items, key=lambda m: m["timestamp"], reverse=True)[:10]
    top_posts = []
    for m in recent:
        caption = (m.get("caption") or "").split("\n")[0][:120]
        top_posts.append({
            "title": caption or "(no caption)",
            "mediaId": m["id"],
            "thumbUrl": m.get("thumbnail_url") or m.get("media_url"),
            "views": m.get("like_count", 0) + m.get("comments_count", 0),
            "url": m.get("permalink", ""),
            "date": m["timestamp"][:10],
            "likes": m.get("like_count", 0),
            "comments": m.get("comments_count", 0),
        })

    return {
        "slug": "instagram",
        "platform": "Instagram",
        "accountType": "Profile",
        "name": f"@{username}",
        "url": f"https://www.instagram.com/{username}/",
        "dateRangeIso": f"{cur_start.date().isoformat()} → {now.date().isoformat()}",
        "followers": profile.get("followers_count", 0),
        "mediaCount": profile.get("media_count", 0),
        "totals": totals(current_media),
        "priorTotals": totals(prior_media),
        "topVideos": top_posts,
    }
