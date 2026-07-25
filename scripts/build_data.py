import datetime
import json
import os
import sys
import urllib.request

# Ensure the project root (parent of this scripts/ dir) is importable so
# `python scripts/build_data.py` works the same as `python -m scripts.build_data`.
# Running a script by path only puts its own directory on sys.path, which
# breaks the `scripts.*` package imports below unless we add the root here.
SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from scripts.datawindow import window_dates, prior_window_dates
from scripts.youtube_pipeline import fetch_channel_bundle
from scripts.instagram_pipeline import fetch_instagram_bundle

DEFAULT_OUT_DIR = os.path.join(SCRIPT_DIR, "docs")

CHANNEL_CFGS = [
    {"slug": "furad-ride", "channel_id": "UCIwPYOvVPjta-RfrdrlzSEg",
     "token_path": os.path.join(SCRIPT_DIR, "token_group_a_furadride.json"),
     "accent": {"accent": "#FF5A00", "accentStrong": "#FFB37A", "accentSoft": "#4A2410"}},
    {"slug": "furadi", "channel_id": "UCwu8ErWfd6xiz-OS4dEfCUQ",
     "token_path": os.path.join(SCRIPT_DIR, "token_group_b_furadi_desertworks.json"),
     "accent": {"accent": "#00E5FF", "accentStrong": "#8FF3FF", "accentSoft": "#0A3A40"}},
    {"slug": "furadi-desert-works", "channel_id": "UCQPFdhFvSUO_C3uoxDh1tzA",
     "token_path": os.path.join(SCRIPT_DIR, "token_group_b_furadi_desertworks.json"),
     "accent": {"accent": "#39FF14", "accentStrong": "#A6FF8C", "accentSoft": "#123312"}},
    {"slug": "furadi-games", "channel_id": "UCq9jOtMkVuEs8OaX34wPWNg",
     "token_path": os.path.join(SCRIPT_DIR, "token_group_c_furadigames.json"),
     "accent": {"accent": "#FFEB00", "accentStrong": "#FFF7A3", "accentSoft": "#3D3900"}},
]

INSTAGRAM_TOKEN_FILE = os.path.join(SCRIPT_DIR, "instagram_token.json")
INSTAGRAM_CLIENT_SECRET_FILE = os.path.join(SCRIPT_DIR, "instagram_client_secret.json")


def download_binary(url, dest_path):
    with urllib.request.urlopen(url, timeout=15) as resp:
        with open(dest_path, "wb") as f:
            f.write(resp.read())


def download_instagram_thumbnails(bundle, assets_dir):
    for post in bundle.get("topVideos", []):
        media_id = post.get("mediaId")
        thumb_url = post.pop("thumbUrl", None)
        if not media_id:
            post["thumb"] = ""
            continue
        dest_name = f"{media_id}.jpg"
        dest_path = os.path.join(assets_dir, dest_name)
        if not os.path.exists(dest_path) and thumb_url:
            # Instagram media URLs are short-lived signed URLs, so a single 403 is
            # plausible. Never let one bad thumbnail sink the whole Instagram bundle.
            try:
                download_binary(thumb_url, dest_path)
            except Exception as e:
                print(f"[Instagram] thumbnail download FAILED for {media_id}: {e}")
                # Drop any partial file so a later run retries instead of
                # serving a truncated image forever.
                if os.path.exists(dest_path):
                    os.remove(dest_path)
                post["thumb"] = ""
                continue
        post["thumb"] = f"assets/{dest_name}"
    return bundle


def build(channel_cfgs=None, channel_fetcher=fetch_channel_bundle,
          instagram_fetcher=fetch_instagram_bundle, out_dir=None):
    channel_cfgs = channel_cfgs if channel_cfgs is not None else CHANNEL_CFGS
    out_dir = out_dir or DEFAULT_OUT_DIR
    assets_dir = os.path.join(out_dir, "assets")
    os.makedirs(assets_dir, exist_ok=True)

    start, end = window_dates()
    prior_start, prior_end = prior_window_dates(start)

    channels_data = []
    any_success = False

    for cfg in channel_cfgs:
        try:
            bundle = channel_fetcher(cfg, start, end, prior_start, prior_end)
            channels_data.append(bundle)
            any_success = True
        except Exception as e:
            print(f"[{cfg['slug']}] FAILED: {e}")

    try:
        ig_bundle = instagram_fetcher(INSTAGRAM_TOKEN_FILE, INSTAGRAM_CLIENT_SECRET_FILE)
        ig_bundle = download_instagram_thumbnails(ig_bundle, assets_dir)
        channels_data.append(ig_bundle)
        any_success = True
    except Exception as e:
        print(f"[Instagram] FAILED: {e}")

    if not any_success:
        print("All fetches failed; leaving existing data.json untouched")
        return False

    payload = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "channels": channels_data,
    }

    tmp_path = os.path.join(out_dir, "data.json.tmp")
    final_path = os.path.join(out_dir, "data.json")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))
    os.replace(tmp_path, final_path)
    return True


if __name__ == "__main__":
    # Exit non-zero when nothing was published so a fully-failed CI run goes red.
    raise SystemExit(0 if build() else 1)
