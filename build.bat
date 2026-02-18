@echo off
title PureRemove - Build x64 Release
cd /d "%~dp0"

if not exist ".logs" mkdir .logs

echo.
echo  ====================================================
echo   PureRemove - Compilation Release x64
echo  ====================================================
echo.

:: Verifie que Rust est installe
where cargo >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Cargo non trouve. Installez Rust depuis https://rustup.rs
    pause & exit /b 1
)

:: Verifie que le modele est present
if not exist "src-tauri\resources\model.onnx" (
    echo [ERREUR] model.onnx introuvable dans src-tauri\resources\
    pause & exit /b 1
)

:: Ajoute la target x64 si necessaire
echo [1/3] Verification target x86_64-pc-windows-msvc...
rustup target add x86_64-pc-windows-msvc >nul 2>&1

:: Build release - sortie affichee ET sauvegardee dans le log
echo [2/3] Compilation release x64 (peut prendre 2-5 min)...
echo.
npx tauri build --target x86_64-pc-windows-msvc 2>&1 | powershell -Command "$input | Tee-Object -FilePath '.logs\build.log'"
set BUILD_CODE=%ERRORLEVEL%

if %BUILD_CODE% neq 0 (
    echo.
    echo [ERREUR] Build echoue ^(code %BUILD_CODE%^).
    echo Log complet : %~dp0.logs\build.log
    echo.
    pause
    exit /b %BUILD_CODE%
)

:: Localise le .exe et l'installeur
echo.
echo [3/3] Localisation des artefacts...
set EXE=src-tauri\target\x86_64-pc-windows-msvc\release\pure-remove.exe
set NSIS=src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis

if exist "%EXE%" (
    echo.
    echo  [OK] Executable portable :
    echo       %~dp0%EXE%
)
if exist "%NSIS%" (
    echo.
    echo  [OK] Installeur NSIS :
    for /r "%NSIS%" %%f in (*.exe) do echo       %%f
)

echo.
echo  ====================================================
echo   Build termine avec succes !
echo  ====================================================
echo.
pause
