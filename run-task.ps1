# DOZOR task runner. Called by Windows Task Scheduler with -Task <name>.
#   -Task dozor    morning digest  (zadacha.md)
#   -Task nedelya  weekly report   (zadacha-nedelya.md)
#   -Task shos     research helper (zadacha-shos.md)
# NOTE: keep this file ASCII-only - Windows PowerShell 5.1 reads .ps1 as ANSI and would mangle Cyrillic.

param([string]$Task = "dozor")

$ErrorActionPreference = "Continue"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

$log = Join-Path $dir "dozor.log"

$map = @{
    "dozor"   = "zadacha.md"
    "nedelya" = "zadacha-nedelya.md"
    "shos"    = "zadacha-shos.md"
}
if (-not $map.ContainsKey($Task)) {
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] unknown task: $Task" | Out-File -FilePath $log -Append -Encoding utf8
    exit 1
}
$file = Join-Path $dir $map[$Task]

$secrets = Join-Path $dir "secrets.ps1"
if (Test-Path $secrets) { . $secrets }

if (-not $env:TG_TOKEN -or -not $env:TG_CHAT) {
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] $Task - no TG_TOKEN or TG_CHAT, aborted" |
        Out-File -FilePath $log -Append -Encoding utf8
    exit 1
}

# Claude Code refuses to start inside another of its own sessions.
Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue
Remove-Item Env:CLAUDE_CODE_ENTRYPOINT -ErrorAction SilentlyContinue
Remove-Item Env:CLAUDE_CODE_SSE_PORT -ErrorAction SilentlyContinue

# The Anthropic API is region-blocked here: right after boot the VPN is often not up yet
# and every call dies with 403 "Request not allowed". Wait for it (up to 25 min) before starting.
function Test-ApiReachable {
    try {
        Invoke-WebRequest -Uri "https://api.anthropic.com/v1/models" -Method GET -TimeoutSec 10 -UseBasicParsing | Out-Null
        return $true
    } catch {
        $code = 0
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        # 401 = reachable, just no key. 403 = region block / VPN down. 0 = no network yet.
        return ($code -ne 0 -and $code -ne 403)
    }
}

$waited = 0
while (-not (Test-ApiReachable)) {
    if ($waited -ge 1500) {
        "[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] $Task - API unreachable for 25 min (VPN down?), skipped" |
            Out-File -FilePath $log -Append -Encoding utf8
        exit 1
    }
    Start-Sleep -Seconds 30
    $waited += 30
}
if ($waited -gt 0) {
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] $Task - waited $waited s for API" |
        Out-File -FilePath $log -Append -Encoding utf8
}

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] $Task - start" | Out-File -FilePath $log -Append -Encoding utf8

$zadacha = Get-Content $file -Raw -Encoding utf8

$result = $zadacha | & claude -p `
    --model sonnet `
    --permission-mode bypassPermissions `
    --add-dir ".." `
    --allowedTools "Bash Read Write Edit Glob Grep WebFetch WebSearch" 2>&1

$result | Out-File -FilePath $log -Append -Encoding utf8
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] $Task - finish" | Out-File -FilePath $log -Append -Encoding utf8
