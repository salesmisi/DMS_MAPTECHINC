@echo off
setlocal

cd /d "%~dp0"

set "PORT=3001"
set "STATE_DIR=%~dp0state"
set "LOG_DIR=%~dp0logs"
set "PID_FILE=%STATE_DIR%\manual-agent.pid"
set "LISTEN_PID="
set "NODE_EXE="

for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"

if not defined NODE_EXE (
  echo Node.js was not found on PATH.
  exit /b 1
)

if not exist "%STATE_DIR%" mkdir "%STATE_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$connection = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($connection) { Write-Output $connection.OwningProcess }"`) do set "LISTEN_PID=%%I"

if defined LISTEN_PID (
  echo Local agent already listening on port %PORT% with PID %LISTEN_PID%.
  echo Open http://localhost:%PORT%/health to verify it.
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$stdout = Join-Path (Resolve-Path '.\logs') 'manual-agent.out.log'; $stderr = Join-Path (Resolve-Path '.\logs') 'manual-agent.err.log'; $process = Start-Process -FilePath '%NODE_EXE%' -ArgumentList 'server.js' -WorkingDirectory (Resolve-Path '.').Path -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru; Set-Content -Path '%PID_FILE%' -Value $process.Id; Write-Output ('STARTED:' + $process.Id)"

if errorlevel 1 (
  echo Failed to start the local agent.
  exit /b 1
)

echo Local agent start requested.
echo Health URL: http://localhost:%PORT%/health
exit /b 0