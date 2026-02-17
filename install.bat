@echo off
setlocal
title PureRemove - Installation

echo.
echo  ╔══════════════════════════════════════╗
echo  ║  PureRemove - Installation & Build   ║
echo  ╚══════════════════════════════════════╝
echo.

:: Vérifie Node.js
where node >nul 2>&1 || (
    echo [ERREUR] Node.js non trouvé. Installez depuis nodejs.org
    pause & exit /b 1
)

:: Vérifie Rust
where cargo >nul 2>&1 || (
    echo [ERREUR] Rust non trouvé. Installez depuis rustup.rs
    pause & exit /b 1
)

echo [1/4] Installation des dépendances npm...
call npm install
if %errorlevel% neq 0 ( echo [ERREUR] npm install échoué & pause & exit /b 1 )

echo [2/4] Vérification du modèle ONNX...
if not exist "src-tauri\resources\model.onnx" (
    echo.
    echo [ATTENTION] model.onnx MANQUANT dans src-tauri\resources\
    echo.
    echo  Téléchargez le modèle RMBG-1.4 :
    echo  1. Allez sur : https://huggingface.co/briaai/RMBG-1.4
    echo  2. Dossier   : onnx/model.onnx
    echo  3. Copiez-le dans : src-tauri\resources\model.onnx
    echo.
    pause
)

echo [3/4] Build de développement (npm run dev)...
echo  Lancez "npm run tauri dev" dans ce dossier pour démarrer en mode dev.
echo  Lancez "npm run tauri build" pour créer l'installeur Windows.

echo.
echo [4/4] Setup terminé !
echo.
echo  Commandes utiles :
echo    npm run tauri dev    ^-^> Mode développement
echo    npm run tauri build  ^-^> Build production (installeur NSIS)
echo.
pause
