# DOZOR morning run. Called by Windows Task Scheduler.
# Launches Claude Code headless: it gathers raw data, picks what matters and sends the digest to Telegram.
# NOTE: keep this file ASCII-only - Windows PowerShell 5.1 reads .ps1 as ANSI and would mangle Cyrillic.

$ErrorActionPreference = "Continue"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

$log = Join-Path $dir "dozor.log"

# Secrets live next to the script in secrets.ps1 (never committed)
$secrets = Join-Path $dir "secrets.ps1"
if (Test-Path $secrets) { . $secrets }

if (-not $env:TG_TOKEN -or -not $env:TG_CHAT) {
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] no TG_TOKEN or TG_CHAT - aborted" |
        Out-File -FilePath $log -Append -Encoding utf8
    exit 1
}

# Claude Code refuses to start inside another of its own sessions.
# The scheduler has no such variables, but clear them for manual runs from a terminal.
Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue
Remove-Item Env:CLAUDE_CODE_ENTRYPOINT -ErrorAction SilentlyContinue
Remove-Item Env:CLAUDE_CODE_SSE_PORT -ErrorAction SilentlyContinue

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] start" | Out-File -FilePath $log -Append -Encoding utf8

$zadacha = Get-Content (Join-Path $dir "zadacha.md") -Raw -Encoding utf8

$result = $zadacha | & claude -p `
    --model sonnet `
    --permission-mode bypassPermissions `
    --allowedTools "Bash Read Write Edit Glob Grep WebFetch WebSearch" 2>&1

$result | Out-File -FilePath $log -Append -Encoding utf8
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] finish" | Out-File -FilePath $log -Append -Encoding utf8
