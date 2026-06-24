@echo off
title DubClean Build
cd /d "%~dp0"

echo Building DubClean installer...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run build:win

echo.
echo === HASIL ===
echo Installer: dist\DubClean Setup 1.1.0.exe
echo Portable:  dist\DubClean 1.1.0.exe
echo Unpacked:  dist\win-unpacked\DubClean.exe
echo.
pause