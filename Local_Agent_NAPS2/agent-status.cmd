@echo off
setlocal

set "PORT=3001"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$connection = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $connection) { Write-Output 'NOT_RUNNING'; exit 0 }; $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue; [pscustomobject]@{ Port = %PORT%; PID = $connection.OwningProcess; ProcessName = $process.ProcessName; Path = $process.Path; Health = 'http://localhost:%PORT%/health' } | Format-List | Out-String"

exit /b 0