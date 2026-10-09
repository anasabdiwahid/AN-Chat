# run-websocket.ps1 - Background WebSocket Supervisor Daemon
$ErrorActionPreference = "Continue"

Write-Host "============================================="
Write-Host "  Starting A/N Chat WebSocket Supervisor"
Write-Host "============================================="

while ($true) {
    try {
        & "C:\xampp\php\php.exe" "C:\xampp\htdocs\chats\websocket-server.php"
    } catch {
        Write-Host "[Supervisor] Exception caught: $_"
    }
    Write-Host "[Supervisor] Process exited. Auto-restarting in 1s..."
    Start-Sleep -Seconds 1
}
