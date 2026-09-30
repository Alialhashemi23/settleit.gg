# autodeploy.ps1
# Polls for new commits on main every 2 minutes and redeploys via Docker Compose.
# Set up as a Windows Task Scheduler job (run at startup, repeat every 2 minutes).
# No secrets — repo path is derived from script location.

$RepoPath   = Split-Path -Parent $PSScriptRoot
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

        $local  = git -C $RepoPath rev-parse HEAD
        $remote = git -C $RepoPath rev-parse origin/main

        if ($local -ne $remote) {
            Log "New commits detected ($($local.Substring(0,7)) → $($remote.Substring(0,7))) — deploying..."
            git -C $RepoPath pull
            docker compose -f $ComposePath up --build -d
            Log "Deploy complete."
        }
    } catch {
        Log "ERROR: $_"
    }

    Start-Sleep 120
}
