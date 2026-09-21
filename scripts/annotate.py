"""GitHub Actions workflow annotations.

A per-channel fetch failure is deliberately non-fatal -- one dead account must
never stop the other five from publishing. The cost of that design is that a
plain `print()` scrolls past unread: Instagram dropped out of data.json on
2026-09-15 and nobody noticed for six days, because every run still reported
success.

Annotations close that gap without changing the exit code. GitHub surfaces
them on the run summary, in the job log, and in the commit's checks, so a
failure is visible on the first run rather than the sixth day.

Outside Actions the `::error::` prefix is just noise on a terminal, so these
fall back to a plain readable line.
"""

import os
import sys


def _in_actions():
    return os.environ.get("GITHUB_ACTIONS") == "true"


def _emit(level, scope, message):
    # Actions terminates an annotation at the first newline, silently
    # discarding the rest -- which is how a multi-line traceback turns into a
    # useless one-word annotation. Fold to a single line so the whole message
    # survives.
    flat = " ".join(str(message).split())
    if _in_actions():
        print(f"::{level}::[{scope}] {flat}")
    else:
        print(f"[{scope}] {level.upper()}: {flat}")
    sys.stdout.flush()


def gh_error(scope, message):
    """Report a failure that needs a human. Does not change the exit code."""
    _emit("error", scope, message)


def gh_warning(scope, message):
    """Report a degraded-but-working condition."""
    _emit("warning", scope, message)
