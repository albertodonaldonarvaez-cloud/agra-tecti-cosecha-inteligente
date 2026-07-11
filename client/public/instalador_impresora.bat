@echo off
title AGRATEC - Instalador Impresion Directa
echo.
echo  AGRA TEC-TI - Instalador de Impresion Directa
echo  ================================================
echo.

REM Ejecutar el instalador real en PowerShell (sin problemas de encoding)
powershell -ExecutionPolicy Bypass -File "%~dp0setup_print_agent.ps1"
if %errorlevel% neq 0 (
    echo.
    echo  Intentando con PowerShell inline...
    powershell -ExecutionPolicy Bypass -Command "& { iex (Get-Content -Raw '%~dp0setup_print_agent.ps1') }"
)
pause
