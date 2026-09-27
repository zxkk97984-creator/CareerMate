@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\bootstrap-windows.ps1" %*
if errorlevel 1 (
  echo.
  echo Startup failed. Please read the error above.
  pause
  exit /b 1
)
