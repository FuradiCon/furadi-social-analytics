"""One-off helper to re-authorize an expired/revoked YouTube OAuth token group.

Run locally (never in CI -- it opens a browser for interactive Google login):

    python scripts/reauth_youtube_tokens.py b c

With no arguments it re-authorizes every group. Requires client_secret.json
(the OAuth client downloaded from Google Cloud Console) at the repo root --
see scripts/youtube_pipeline.py's CLIENT_SECRET_FILE for the exact path.

After it finishes, copy each regenerated token file's contents into the
matching GitHub Actions secret (YT_TOKEN_GROUP_B, YT_TOKEN_GROUP_C, ...).
"""

import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from scripts.youtube_pipeline import get_credentials, CLIENT_SECRET_FILE

TOKEN_GROUPS = {
    "a": ("token_group_a_furadride.json", "Furad Ride"),
    "b": ("token_group_b_furadi_desertworks.json", "Furadi + Furadi [Desert Works]"),
    "c": ("token_group_c_furadigames.json", "Furadi Games"),
}


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

    for key in requested:
        filename, label = TOKEN_GROUPS[key]
        token_path = os.path.join(SCRIPT_DIR, filename)
        if os.path.exists(token_path):
            backup_path = token_path + ".bak"
            os.replace(token_path, backup_path)
            print(f"Backed up old token to {backup_path}")

        print(f"\n--- Re-authorizing group '{key}' ({label}) ---")
        print("A browser window will open -- sign in with the Google account that owns this channel.")
        get_credentials(token_path)
        print(f"Wrote fresh {filename}")

    print("\nDone. Copy each token file's contents into its matching GitHub secret:")
    for key in requested:
        filename, _ = TOKEN_GROUPS[key]
        print(f"  {filename}  ->  YT_TOKEN_GROUP_{key.upper()}")


if __name__ == "__main__":
    main()
