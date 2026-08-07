# Task 6: All-Accounts Attention Summary

## Delivered

- Added an all-accounts `Where to look first` summary ahead of the existing detailed account panels.
- The summary uses each account's current reporting-window data, existing platform/type metadata, existing attention reasons when supplied, and deterministic fallback signals for reply-needed comments and declining period activity.
- Mixed account types stay honest: page views for the website, views/watch time/engagement/subscriber change for YouTube, and posts/engagement for Instagram. Unavailable measures render as an em dash rather than zero.
- Account names are keyboard-accessible buttons that call the existing account-selection renderer; the rail and mobile drawer remain the only navigation source of truth.
- Added a responsive, internally scrollable table with sticky account and attention columns at the existing mobile breakpoint, preventing horizontal page overflow while retaining context.
- Added a focused Node fixture covering mixed account metrics, missing values, deterministic priority, escaped account names, semantic table markup, and account-selection controls.

## Changed Files

- `docs/app.js`
- `docs/styles.css`
- `docs/attention-summary.test.mjs`
- `.superpowers/sdd/2026-08-06-furadi-dashboard-ux-pass/task-6-report.md`

## Review Fix Round

- Attention ordering now derives an explicit priority from generated attention reasons: reply/new-comment signals first, decline/down signals next, and positive or no-issue signals lower. Generated priority wins ties over local trend fallback, then original account order makes remaining ties deterministic.
- Account totals now require each contributing field to be present and numeric. Missing YouTube daily fields or Instagram likes/comments render as an em dash, while explicitly present zero values remain zero.
- At the existing mobile breakpoint, the summary becomes stacked account cards with visible per-metric labels. It has no fixed table width or sticky columns, so the account/reason card fits within the approximately 324px inner width at a 390px viewport.
- The focused Node fixture now covers metadata-reason ordering, missing-field availability, legitimate zero values, and the narrow-layout card assumptions.

## Verification

- `node docs/attention-summary.test.mjs` — passed.
- `node docs/platform-label.test.mjs` — passed.
- `node --check docs/app.js` — passed.
- `git diff --check` — passed; Git emitted only the repository's existing LF-to-CRLF conversion notices.
- Review-fix verification reran `node docs/attention-summary.test.mjs` and `node --check docs/app.js` after the changes.
- Puppeteer/browser automation was not run, per task instructions.

## Scope and Concerns

- No data-generation, API, freshness, comments, or single-account behavior changed.
- The current fixture does not ship account-level attention reasons, so the renderer supports them when present and otherwise uses the existing reply flag and current-versus-prior activity fields. It does not invent a cross-platform score.
- The commit containing this report is identified by the final handoff hash.
