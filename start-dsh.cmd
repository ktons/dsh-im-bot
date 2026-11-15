@echo off
rem DeepSeek Harness Desktop - one-command launcher (unpacked release build)
set "DSH_EXE=%~dp0bin\DeepSeek Harness.exe"

if not exist "%DSH_EXE%" (
    echo [start-dsh] Not found: "%DSH_EXE%"
    echo [start-dsh] Build and deploy it first: powershell -File "%~dp0deploy-dsh-bin.ps1"
    exit /b 1
)

rem The app holds a single-instance lock itself; this returns immediately.
start "" "%DSH_EXE%"
exit /b 0
