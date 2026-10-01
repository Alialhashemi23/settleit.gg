# autodeploy.ps1
# Polls origin/main every 2 minutes and redeploys the self-hosted stack via Docker Compose
# when the remote has commits this checkout does not. Run by the Windows Task Scheduler job
# `settleit-autodeploy`. No secrets -- repo path is derived from script location.

$RepoPath    = Split-Path -Parent $PSScriptRoot
$ComposePath = Join-Path $RepoPath "docker-compose.yml"
$LogFile     = Join-Path $PSScriptRoot "autodeploy.log"

function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

Log "Auto-deploy watcher started. Repo: $RepoPath"

while ($true) {
    try {
        # Fetch latest refs without merging
        git -C $RepoPath fetch origin main --quiet 2>$null

        # Only incoming commits trigger a deploy; local-only commits do not.
        $behind = [int](git -C $RepoPath rev-list --count HEAD..origin/main)

        if ($behind -gt 0) {
            $local  = git -C $RepoPath rev-parse --short HEAD
            $remote = git -C $RepoPath rev-parse --short origin/main
            Log "New commits detected ($local -> $remote) -- deploying..."
            git -C $RepoPath pull --ff-only
            if ($LASTEXITCODE -ne 0) {
                Log "ERROR: pull failed (local changes or diverged history) -- skipping deploy."
            } else {
                docker compose -f $ComposePath up --build -d
                if ($LASTEXITCODE -eq 0) { Log "Deploy complete." } else { Log "ERROR: docker compose exited $LASTEXITCODE." }
            }
        }
    } catch {
        Log "ERROR: $_"
    }

    Start-Sleep 120
}
