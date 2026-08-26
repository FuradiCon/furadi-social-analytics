"""One-off helper to re-authorize an expired/revoked YouTube OAuth token group.

Run locally (never in CI -- it opens a browser for interactive Google login):

    python scripts/reauth_youtube_tokens.py b c

With no arguments it re-authorizes every group. Requires client_secret.json
(the OAuth client downloaded from Google Cloud Console) at the repo root --
see scripts/youtube_pipeline.py's CLIENT_SECRET_FILE for the exact path.

After each group is re-authorized, it verifies the new token by running the
same YouTube Analytics query the dashboard build runs -- confirm it passes
before trusting the token. This isn't optional flourish: during the
2026-07-27 incident, running groups b then c back-to-back reused the
already-logged-in browser session, so group c got silently authorized as the
Desert Works account instead of Games, and it wasn't caught until a live API
call 403'd downstream. get_credentials() already passes prompt="select_account"
to force Google's account picker each time, but the picker showing up doesn't
guarantee the right account got clicked -- only this check does.

The check deliberately hits the Analytics API rather than the Data API.
channels().list(id=...) returns the correct title and subscriber count for
ANY public channel regardless of who authorized the token, so it reported a
cheerful "OK" for tokens with zero analytics access -- exactly the failure it
existed to catch. Analytics is the permission the build actually needs, so
that is what gets tested.

After it finishes, copy each regenerated token file's contents into the
matching GitHub Actions secret (YT_TOKEN_GROUP_B, YT_TOKEN_GROUP_C, ...).

After it finishes, copy each regenerated token file's contents into the
matching GitHub Actions secret (YT_TOKEN_GROUP_B, YT_TOKEN_GROUP_C, ...).
"""

import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from googleapiclient.discovery import build

from scripts.datawindow import window_dates
from scripts.youtube_pipeline import get_credentials, fetch_report, CLIENT_SECRET_FILE

# channel_id/label pairs match scripts/build_data.py's CHANNELS list -- that
# file is the authoritative source of which channel belongs to which group.
TOKEN_GROUPS = {
    "a": ("token_group_a_furadride.json", "Furad Ride", [
        ("UCIwPYOvVPjta-RfrdrlzSEg", "Furad Ride"),
    ]),
    # Group B covered Furadi AND Desert Works until 2026-08-26. A token is bound
    # to a single channel, and YouTube used to let that token read a sibling
    # brand channel under the same Google account; it stopped, so the shared
    # token 403'd on Desert Works while still serving Furadi. One group per
    # channel now -- at the picker, group B is "Furadi", group D is
    # "Furadi [Desert Works]".
    "b": ("token_group_b_furadi_desertworks.json", "Furadi", [
        ("UCwu8ErWfd6xiz-OS4dEfCUQ", "Furadi"),
    ]),
    "c": ("token_group_c_furadigames.json", "Furadi Games", [
        ("UCq9jOtMkVuEs8OaX34wPWNg", "Furadi Games"),
    ]),
    "d": ("token_group_d_desertworks.json", "Furadi [Desert Works]", [
        ("UCQPFdhFvSUO_C3uoxDh1tzA", "Furadi [Desert Works]"),
    ]),
}


def verify(creds, channels, key):
    """Prove this token can pull ANALYTICS for each channel the group owns.

    Deliberately not channels().list(id=...): that reads public data and
    happily returns the right title for a channel the token has no analytics
    permission on, so it green-lit broken tokens. An Analytics query is the
    capability build_data.py actually depends on, so failing here is the same
    as failing in the pipeline -- just hours earlier and with a name attached.
    """
    start, end = window_dates()
    ok = True

    # Which channel is this token actually bound to? A wrong pick at Google's
    # channel chooser shows up here as a name you did not expect.
    try:
        resp = build("youtube", "v3", credentials=creds).channels().list(
            part="snippet", mine=True).execute()
        bound = ", ".join(f"{i['snippet']['title']} ({i['id']})"
                          for i in resp.get("items", [])) or "nothing"
    except Exception as e:
        bound = f"could not determine -- {e}"
    print(f"  [{key}] token authorized as: {bound}")

    for channel_id, expected_name in channels:
        try:
            report = fetch_report(creds, start, end, "views", "day", channel_id=channel_id)
        except Exception as e:
            status = getattr(getattr(e, "resp", None), "status", "?")
            print(f"  [{key}] {expected_name}: analytics DENIED (HTTP {status}) -- "
                  "this token cannot read that channel's reports. Wrong channel picked?")
            ok = False
            continue
        rows = report.get("rows", [])
        print(f"  [{key}] {expected_name}: analytics OK ({len(rows)} rows, "
              f"{sum(r[1] for r in rows)} views over {start}..{end})")
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
