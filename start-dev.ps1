# ALIA 2.0 Development Startup Script
# Run this in PowerShell: .\start-dev.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ALIA 2.0 - Starting All Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Start Ollama in background
Write-Host "[1/4] Starting Ollama..." -ForegroundColor Yellow
Start-Process -FilePath "ollama" -ArgumentList "serve" -NoNewWindow -PassThru

# Wait for Ollama to start
Start-Sleep -Seconds 3

# Check if Ollama is running
$ollamaCheck = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -ErrorAction SilentlyContinue
if ($ollamaCheck.StatusCode -eq 200) {
    Write-Host "     ✅ Ollama running" -ForegroundColor Green
} else {
    Write-Host "     ⚠️  Ollama may need a moment..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[2/4] Starting NVIDIA NIM API Server (port 3000)..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList "server-nvidia-nim.js" -NoNewWindow -PassThru

Write-Host "[3/4] Starting WebSocket Server (port 3001)..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList "server-websocket.js" -NoNewWindow -PassThru

Write-Host "[4/4] Starting Frontend (port 5173)..." -ForegroundColor Yellow
Start-Process -FilePath "npm" -ArgumentList "run dev" -NoNewWindow -PassThru

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  All services started!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " URLs:" -ForegroundColor White
Write-Host "   - Frontend: http://localhost:5173" -ForegroundColor Gray
Write-Host "   - API:      http://localhost:3000" -ForegroundColor Gray
Write-Host "   - WebSocket: ws://localhost:3001" -ForegroundColor Gray
Write-Host ""
Write-Host " Press Ctrl+C to stop all servers" -ForegroundColor Yellow
Write-Host ""

# Keep script running
Read-Host "Press Enter to exit (servers will keep running)"
