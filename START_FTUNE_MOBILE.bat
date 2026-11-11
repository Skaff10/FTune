@echo off
title FTune Mobile Controller
echo ========================================================
echo   Starting FTune Mobile Controller (Expo)
echo   Scan the QR code with Expo Go on your phone
echo ========================================================
cd /d "%~dp0FTune-mobile"
npx expo start -c
pause
