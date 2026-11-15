# DeepSeek Harness Desktop - one-command launcher (unpacked release build)
$exe = Join-Path $PSScriptRoot 'bin\DeepSeek Harness.exe'

if (-not (Test-Path -LiteralPath $exe)) {
    Write-Host "[start-dsh] Not found: $exe"
    Write-Host "[start-dsh] Build and deploy it first: powershell -File `"$PSScriptRoot\deploy-dsh-bin.ps1`""
    exit 1
}

# The app acquires its own single-instance lock; Start-Process returns immediately.
Start-Process -FilePath $exe
