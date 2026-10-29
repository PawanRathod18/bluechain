@echo off
setlocal
cd /d "%~dp0"
title BlueChain
echo.
echo   Starting BlueChain...
echo.
where py >nul 2>nul
if %errorlevel%==0 (
    py -3 run.py
) else (
    where python >nul 2>nul
    if %errorlevel%==0 (
        python run.py
    ) else (
        echo   Python was not found.
        echo   Install Python 3.12 from https://www.python.org/downloads/
        echo   and tick "Add python.exe to PATH" during installation.
        echo.
        pause
        exit /b 1
    )
)
echo.
echo   Server stopped.
pause
