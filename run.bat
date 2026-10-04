@echo off
title YoloWisata Local Server
cd /d "%~dp0"

echo.
echo ============================================================
echo                  YOLOWISATA LOCAL
echo ============================================================
echo.

set "PYTHON=python"

if exist ".venv-voice\Scripts\python.exe" (
    set "PYTHON=.venv-voice\Scripts\python.exe"
    echo [OK] Using .venv-voice
) else (
    echo [INFO] .venv-voice not found. Using system Python.
)

echo.
echo [1/3] Exporting frontend...
"%PYTHON%" scripts\export_static.py

if errorlevel 1 (
    echo.
    echo [ERROR] Frontend export failed.
    echo.
    pause
    exit /b 1
)

echo [OK] Frontend ready.
echo.
echo [2/3] Starting local server...
echo.
echo     http://localhost:8000/
echo.
echo IMPORTANT:
echo Keep this window open while using YoloWisata.
echo Press CTRL+C to stop the server.
echo.

rem Open the browser shortly after Uvicorn begins starting.
start "" cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:8000/"

echo [3/3] Launching YoloWisata...
echo.

"%PYTHON%" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

echo.
echo ============================================================
echo YoloWisata server stopped.
echo ============================================================
echo.
echo If you did not stop it manually, read the error above.
echo.
pause