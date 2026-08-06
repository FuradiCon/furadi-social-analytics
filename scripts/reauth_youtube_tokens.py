"""One-off helper to re-authorize an expired/revoked YouTube OAuth token group.

Run locally (never in CI -- it opens a browser for interactive Google login):

    python scripts/reauth_youtube_tokens.py b c

With no arguments it re-authorizes every group. Requires client_secret.json
(the OAuth client downloaded from Google Cloud Console) at the repo root --
see scripts/youtube_pipeline.py's CLIENT_SECRET_FILE for the exact path.

After each group is re-authorized, it calls the YouTube Data API for that
group's channel(s) and prints back the channel title Google says the new
token belongs to -- confirm it matches before trusting the token. This isn't
optional flourish: during the 2026-07-27 incident, running groups b then c
back-to-back reused the already-logged-in browser session, so group c got
silently authorized as the Desert Works account instead of Games, and it
wasn't caught until a live API call 403'd downstream. get_credentials()
already passes prompt="select_account" to force Google's account picker each
time, but the picker showing up doesn't guarantee the right account got
clicked -- only this check does.

After it finishes, copy each regenerated token file's contents into the
matching GitHub Actions secret (YT_TOKEN_GROUP_B, YT_TOKEN_GROUP_C, ...).
"""

import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from googleapiclient.discovery import build

from scripts.youtube_pipeline import get_credentials, CLIENT_SECRET_FILE

# channel_id/label pairs match scripts/build_data.py's CHANNELS list -- that
# file is the authoritative source of which channel belongs to which group.
TOKEN_GROUPS = {
    "a": ("token_group_a_furadride.json", "Furad Ride", [
        ("UCIwPYOvVPjta-RfrdrlzSEg", "Furad Ride"),
    ]),
    "b": ("token_group_b_furadi_desertworks.json", "Furadi + Furadi [Desert Works]", [
        ("UCwu8ErWfd6xiz-OS4dEfCUQ", "Furadi"),
        ("UCQPFdhFvSUO_C3uoxDh1tzA", "Furadi [Desert Works]"),
    ]),
    "c": ("token_group_c_furadigames.json", "Furadi Games", [
        ("UCq9jOtMkVuEs8OaX34wPWNg", "Furadi Games"),
    ]),
}


def verify(creds, channels, key):
    """Ask Google, for each expected channel_id, what channel this token can
    see -- and print the title back so a wrong-account auth is obvious rather
    than surfacing later as a downstream 403 or empty dashboard channel."""
    youtube = build("youtube", "v3", credentials=creds)
    ok = True
    for channel_id, expected_name in channels:
        try:
            resp = youtube.channels().list(part="snippet,statistics", id=channel_id).execute()
            items = resp.get("items")
        except Exception as e:
            print(f"  [{key}] {expected_name}: verification call failed -- {e}")
            ok = False
            continue
        if not items:
            print(f"  [{key}] {expected_name}: no data for {channel_id} -- "
                  "this token can't see that channel. Wrong account?")
            ok = False
            continue
        title = items[0]["snippet"]["title"]
        subs = items[0]["statistics"].get("subscriberCount")
        match = "OK" if title == expected_name else "MISMATCH"
        print(f"  [{key}] expected '{expected_name}', Google says '{title}' "
              f"(subs={subs})  -- {match}")
        if title != expected_name:
            ok = False
    return ok


def main():
    requested = sys.argv[1:] or list(TOKEN_GROUPS.keys())
    unknown = [g for g in requested if g not in TOKEN_GROUPS]
    if unknown:
        print(f"Unknown group(s) {unknown}, expected one of {list(TOKEN_GROUPS)}")
        sys.exit(1)

    if not os.path.exists(CLIENT_SECRET_FILE):
        print(f"Missing {CLIENT_SECRET_FILE}.")
        print("Download it from Google Cloud Console -> APIs & Services -> Credentials")
        print("(the OAuth 2.0 Client used for the working token groups) and place it there first.")
        sys.exit(1)

    results = {}
    for key in requested:
        filename, label, channels = TOKEN_GROUPS[key]
        token_path = os.path.join(SCRIPT_DIR, filename)
        if os.path.exists(token_path):
            backup_path = token_path + ".bak"
            os.replace(token_path, backup_path)
            print(f"Backed up old token to {backup_path}")

        print(f"\n--- Re-authorizing group '{key}' ({label}) ---")
        print("A browser window will open -- sign in with the Google account that owns this channel.")
        creds = get_credentials(token_path)
        print(f"Wrote fresh {filename}")

        print(f"Verifying group '{key}' against the YouTube API...")
        results[key] = verify(creds, channels, key)

    print("\n" + "=" * 60)
    bad = [k for k, ok in results.items() if not ok]
    if bad:
        print(f"CHECK THESE before trusting them: {bad}")
        print("A MISMATCH or failed lookup means you likely signed into the wrong")
        print("Google account (or granted the wrong channel's access) -- rerun for")
        print("just that group: python scripts/reauth_youtube_tokens.py " + " ".join(bad))
    else:
        print("All re-authorized groups verified against the correct channel.")

    print("\nCopy each regenerated token file's contents into its matching GitHub secret:")
    for key in requested:
        filename, _, _ = TOKEN_GROUPS[key]
        print(f"  {filename}  ->  YT_TOKEN_GROUP_{key.upper()}")
    print("\nThen kick a fresh pipeline run and confirm the missing channels return:")
    print("  gh workflow run update-dashboard.yml --repo FuradiCon/furadi-social-analytics")


if __name__ == "__main__":
    main()
