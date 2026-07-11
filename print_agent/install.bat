@echo off
title AGRATEC - Instalador de Agente de Impresion
echo.
echo ========================================
echo   AGRA TEC-TI - Agente de Impresion
echo   Instalador Automatico
echo ========================================
echo.

REM Verificar Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python no esta instalado.
    echo   Descargalo de: https://www.python.org/downloads/
    echo   Marca "Add Python to PATH" al instalar.
    pause
    exit /b 1
)

echo [OK] Python encontrado
python --version
echo.

REM Instalar pywin32
echo [*] Instalando pywin32...
pip install pywin32
echo.

echo [OK] Instalacion completa.
echo.
echo Para iniciar el agente ejecuta:
echo   python print_agent.py
echo.
echo O haz doble clic en start_agent.bat
echo.
pause
