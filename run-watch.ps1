# DOZOR site watchdog. Runs hourly from Task Scheduler.
# Plain node check, no Claude involved. Stays silent unless a site changed state.
# NOTE: keep this file ASCII-only - Windows PowerShell 5.1 reads .ps1 as ANSI.

$ErrorActionPreference = "Continue"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

$secrets = Join-Path $dir "secrets.ps1"
if (Test-Path $secrets) { . $secrets }
if (-not $env:TG_TOKEN -or -not $env:TG_CHAT) { exit 1 }

$out = & node watch.js 2>&1
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] $out" | Out-File -FilePath (Join-Path $dir "watch.log") -Append -Encoding utf8
