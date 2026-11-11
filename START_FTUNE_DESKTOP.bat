@echo off
title FTune Desktop Host
echo ========================================================
echo   Starting FTune Desktop with Mobile Remote Server
echo   Port: 8765 ^| Local IP: 192.168.0.120
echo ========================================================

:: Try to configure firewall if running as admin
netsh advfirewall firewall add rule name="FTune Remote Host" dir=in action=allow protocol=TCP localport=8765 profile=any >nul 2>&1

:: Release any hung Electron/FTune processes or port 8765
echo [init] Checking for previous hung instances...
taskkill /F /IM FTune.exe >nul 2>&1
taskkill /F /IM FTuneMedia.exe >nul 2>&1
taskkill /F /IM ByTune.exe >nul 2>&1
taskkill /F /IM ByTuneMedia.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8765 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

:: Remove stale lockfile if present
if exist "%APPDATA%\FTune\lockfile" del /f /q "%APPDATA%\FTune\lockfile" >nul 2>&1
if exist "%APPDATA%\ByTune\lockfile" del /f /q "%APPDATA%\ByTune\lockfile" >nul 2>&1

cd /d "%~dp0Ftune-pc"
set ELECTRON_RUN_AS_NODE=
node scripts/launch-electron.mjs
pause
