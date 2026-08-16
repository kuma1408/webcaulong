$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $python)) {
    throw 'Không tìm thấy .venv. Hãy tạo môi trường Python và cài requirements.txt trước.'
}
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    throw 'Chưa cài cloudflared. Hãy cài Cloudflare Tunnel rồi chạy lại tệp này.'
}

$existing = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
$backend = $null
if (-not $existing) {
    $backend = Start-Process -FilePath $python `
        -ArgumentList '-m','flask','--app','HA.app','run','--host','127.0.0.1','--port','5000' `
        -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
}

try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5000/api/health' -TimeoutSec 2
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    if (-not $ready) { throw 'Flask hoặc MySQL chưa sẵn sàng.' }

    Write-Host ''
    Write-Host 'Website local: http://127.0.0.1:5000' -ForegroundColor Green
    Write-Host 'Cloudflare sẽ in đường dẫn https://....trycloudflare.com bên dưới.' -ForegroundColor Cyan
    Write-Host 'Giữ cửa sổ này mở. Nhấn Ctrl+C để tắt đường dẫn công khai.' -ForegroundColor Yellow
    Write-Host ''
    & cloudflared tunnel --url http://127.0.0.1:5000
}
finally {
    if ($backend -and -not $backend.HasExited) {
        Stop-Process -Id $backend.Id -Force
    }
}
