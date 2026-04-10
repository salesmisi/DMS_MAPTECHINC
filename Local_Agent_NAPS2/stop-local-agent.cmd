@echo off
setlocal

cd /d "%~dp0"

set "PORT=3001"
set "STATE_DIR=%~dp0state"
set "PID_FILE=%STATE_DIR%\manual-agent.pid"
set "TARGET_PID="

if exist "%PID_FILE%" set /p TARGET_PID=<"%PID_FILE%"

if defined TARGET_PID (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Stop-Process -Id %TARGET_PID% -Force -ErrorAction Stop; Write-Output 'STOPPED' } catch { Write-Output ('STOP_FAILED:' + $_.Exception.Message) }"
  del /q "%PID_FILE%" >nul 2>nul
)

for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$connection = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($connection) { Write-Output $connection.OwningProcess }"`) do set "TARGET_PID=%%I"

if defined TARGET_PID (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Stop-Process -Id %TARGET_PID% -Force -ErrorAction Stop; Write-Output 'STOPPED' } catch { Write-Output ('STOP_FAILED:' + $_.Exception.Message) }"
  del /q "%PID_FILE%" >nul 2>nul
  echo Local agent stopped.
  exit /b 0
)

echo No local agent process is listening on port %PORT%.
exit /b 0