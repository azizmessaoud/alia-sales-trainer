# ALIA modular dev startup script
# Starts Node services + optional external emotion-service (Flask, port 5000)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ALIA 2.0 - Starting Modular Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$workspaceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$emotionServicePath = if ($env:EMOTION_SERVICE_PATH) { $env:EMOTION_SERVICE_PATH } else { Join-Path $workspaceRoot "..\emotion-service" }

Write-Host "[1/5] Starting Ollama..." -ForegroundColor Yellow
Start-Process -FilePath "ollama" -ArgumentList "serve" -NoNewWindow -PassThru | Out-Null

Write-Host "[2/5] Starting NVIDIA NIM API server (port 3000)..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList "server-nvidia-nim.js" -NoNewWindow -PassThru | Out-Null

Write-Host "[3/5] Starting WebSocket server (port 3001)..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList "server-websocket.js" -NoNewWindow -PassThru | Out-Null

Write-Host "[4/5] Starting Remix frontend (port 5173)..." -ForegroundColor Yellow
Start-Process -FilePath "npm" -ArgumentList "run dev" -NoNewWindow -PassThru | Out-Null

Write-Host "[5/5] Starting emotion-service (Flask, port 5000)..." -ForegroundColor Yellow
if (Test-Path $emotionServicePath) {
    $pythonCommand = "Set-Location '$emotionServicePath'; if (Test-Path '.venv\Scripts\python.exe') { & '.venv\Scripts\python.exe' app.py } else { python app.py }"
    Start-Process -FilePath "powershell" -ArgumentList "-NoProfile", "-Command", $pythonCommand -NoNewWindow -PassThru | Out-Null
    Write-Host "     ✅ emotion-service started from: $emotionServicePath" -ForegroundColor Green
} else {
    Write-Host "     ⚠️  emotion-service path not found: $emotionServicePath" -ForegroundColor Yellow
    Write-Host "        Set EMOTION_SERVICE_PATH to your teammate branch local path." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Services launched" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " URLs:" -ForegroundColor White
Write-Host "   - Frontend:        http://localhost:5173" -ForegroundColor Gray
Write-Host "   - NVIDIA API:      http://localhost:3000" -ForegroundColor Gray
Write-Host "   - WebSocket:       ws://localhost:3001" -ForegroundColor Gray
Write-Host "   - Emotion service: http://localhost:5000" -ForegroundColor Gray
Write-Host ""
Write-Host " Press Enter to exit this launcher (services continue running)." -ForegroundColor Yellow
Read-Host ""
