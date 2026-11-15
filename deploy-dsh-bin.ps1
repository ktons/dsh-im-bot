# Refresh D:\Agent\deepseek\bin with the newest packaged desktop build.
# Run this after `pnpm run package -- --dir --unsigned` in dsh/apps/desktop.
#
# Requires the same build environment as packaging when invoked from Git Bash:
#   MSYS_NO_PATHCONV=1 powershell -NoProfile -ExecutionPolicy Bypass -File deploy-dsh-bin.ps1
# (From PowerShell or cmd directly, no env prefix is needed.)

$ErrorActionPreference = 'Stop'

$source = 'D:\Agent\deepseek\dsh\apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\win-unpacked'
$dest   = 'D:\Agent\deepseek\bin'

if (-not (Test-Path -LiteralPath (Join-Path $source 'DeepSeek Harness.exe'))) {
    Write-Host "[deploy-dsh-bin] No packaged build found under: $source"
    Write-Host '[deploy-dsh-bin] Build first:  cd dsh\apps\desktop; pnpm run package -- --dir --unsigned'
    exit 1
}

# The running app locks its image files; close it before replacing them.
Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2

# /E updates and adds files; it never deletes anything you placed in bin yourself.
robocopy $source $dest /E /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Host "[deploy-dsh-bin] robocopy failed with exit $LASTEXITCODE"; exit $LASTEXITCODE }

Write-Host "[deploy-dsh-bin] Deployed to $dest (robocopy exit $LASTEXITCODE)"
exit 0
