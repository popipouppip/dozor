# DOZOR chat replies. Runs every 10 minutes from Task Scheduler.
# Cheap check first: node asks Telegram for new messages. Claude is woken only if there is something to answer.
# NOTE: keep this file ASCII-only - Windows PowerShell 5.1 reads .ps1 as ANSI.

$ErrorActionPreference = "Continue"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

$log = Join-Path $dir "chat.log"

$secrets = Join-Path $dir "secrets.ps1"
if (Test-Path $secrets) { . $secrets }
if (-not $env:TG_TOKEN -or -not $env:TG_CHAT) { exit 1 }

Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue
Remove-Item Env:CLAUDE_CODE_ENTRYPOINT -ErrorAction SilentlyContinue
Remove-Item Env:CLAUDE_CODE_SSE_PORT -ErrorAction SilentlyContinue

& node chat.js 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
$hasQuestions = ($LASTEXITCODE -eq 0)

if (-not $hasQuestions) { exit 0 }

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] question received, waking Claude" |
    Out-File -FilePath $log -Append -Encoding utf8

$zadacha = Get-Content (Join-Path $dir "zadacha-chat.md") -Raw -Encoding utf8

$result = $zadacha | & claude -p `
    --model sonnet `
    --permission-mode bypassPermissions `
    --allowedTools "Bash Read Write Edit Glob Grep WebFetch WebSearch" 2>&1

$result | Out-File -FilePath $log -Append -Encoding utf8
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] answered" | Out-File -FilePath $log -Append -Encoding utf8
