' Nudges the Furadi Social Analytics pipeline by dispatching the GitHub Actions
' workflow, with no visible console window. Used by the FuradiDashboardHourly
' scheduled task instead of pointing Task Scheduler straight at gh.exe, which
' flashes a console window on every run.
'
' Why this exists: update-dashboard.yml has its own `*/20 * * * *` cron, but
' GitHub's free-tier scheduler routinely skips hours of scheduled runs on
' low-traffic repos (observed gaps of 1h19m, 4h42m, 8h07m in a single day).
' This gives a dependable hourly nudge whenever the machine is actually awake --
' which is also the only time anyone is looking at the dashboard or widget.
'
' All the real work still happens in GitHub Actions; this only asks it to start.
Set objShell = CreateObject("WScript.Shell")
objShell.Run """C:\Program Files\GitHub CLI\gh.exe"" workflow run update-dashboard.yml --repo FuradiCon/furadi-social-analytics", 0, True
