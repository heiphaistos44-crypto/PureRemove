@echo off
title PureRemove - Dev Mode
cd /d "%~dp0"
echo [PRE-OPS] Lancement PureRemove en mode developpement...
npm run tauri dev
