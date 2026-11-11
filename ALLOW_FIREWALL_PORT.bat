@echo off
title Allow ByTune Firewall Port 8765
echo ========================================================
echo   Configuring Windows Defender Firewall for Port 8765
echo ========================================================

:: Check for Administrator elevation
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [elevate] Requesting Administrator permissions...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [firewall] Adding inbound allow rule for Port 8765 on all network profiles...
netsh advfirewall firewall delete rule name="ByTune Remote Host" >nul 2>&1
netsh advfirewall firewall add rule name="ByTune Remote Host" dir=in action=allow protocol=TCP localport=8765 profile=any

echo.
echo ========================================================
echo   SUCCESS: Port 8765 is now unblocked in Windows Firewall!
echo   Your phone on Wi-Fi can now connect to your PC.
echo ========================================================
echo.
pause

