@echo off
title PureRemove - Dev Mode
cd /d "%~dp0"
echo Demarrage...
npx tauri dev > .logs\dev.log 2>&1
echo Termine. Code: %ERRORLEVEL%
type .logs\dev.log
echo.
pause
