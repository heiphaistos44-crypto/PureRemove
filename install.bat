@echo off
title PureRemove - Installation
cd /d "%~dp0"

echo.
echo  ====================================================
echo   PureRemove - Installation des dependances
echo  ====================================================
echo.

:: Verifie Node.js
where node >nul 2>&1 || (
    echo [ERREUR] Node.js non trouve. Installez depuis nodejs.org
    pause & exit /b 1
)

:: Verifie Rust
where cargo >nul 2>&1 || (
    echo [ERREUR] Rust non trouve. Installez depuis rustup.rs
    pause & exit /b 1
)

echo [1/2] Installation des dependances npm...
call npm install
if %errorlevel% neq 0 ( echo [ERREUR] npm install echoue & pause & exit /b 1 )

echo [2/2] Verification du modele ONNX...
if not exist "src-tauri\resources\model.onnx" (
    echo.
    echo [ATTENTION] model.onnx MANQUANT dans src-tauri\resources\
    echo  Telechargez RMBG-1.4 sur : https://huggingface.co/briaai/RMBG-1.4
    echo  Fichier : onnx/model.onnx  -^>  src-tauri\resources\model.onnx
    echo.
)

echo.
echo  ====================================================
echo   Installation terminee !
echo.
echo   dev.bat    -^> Lancer en mode developpement
echo   build.bat  -^> Compiler le .exe release x64
echo  ====================================================
echo.
pause
