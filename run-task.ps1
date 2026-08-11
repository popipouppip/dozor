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

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] $Task - start" | Out-File -FilePath $log -Append -Encoding utf8

$zadacha = Get-Content $file -Raw -Encoding utf8

$result = $zadacha | & claude -p `
    --model sonnet `
    --permission-mode bypassPermissions `
    --add-dir ".." `
    --allowedTools "Bash Read Write Edit Glob Grep WebFetch WebSearch" 2>&1

$result | Out-File -FilePath $log -Append -Encoding utf8
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] $Task - finish" | Out-File -FilePath $log -Append -Encoding utf8
