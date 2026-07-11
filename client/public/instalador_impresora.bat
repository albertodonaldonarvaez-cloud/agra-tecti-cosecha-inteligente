@echo off
chcp 65001 >nul 2>&1
title AGRATEC - Instalador de Impresion Directa
color 0A

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║   AGRA TEC-TI - Instalador de Impresion Directa    ║
echo  ║   Impresora Termica Sumprint XP-365B                ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

set "INSTALL_DIR=%USERPROFILE%\AGRATEC_PrintAgent"
set "PYTHON_SCRIPT=%INSTALL_DIR%\print_agent.py"
set "START_SCRIPT=%INSTALL_DIR%\iniciar_agente.bat"
set "STARTUP_LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AGRATEC_PrintAgent.lnk"

echo  [1/5] Verificando Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ⚠  Python no esta instalado.
    echo     Descargalo de: https://www.python.org/downloads/
    echo     IMPORTANTE: Marca "Add Python to PATH" al instalar.
    echo.
    echo     Despues de instalar Python, ejecuta este archivo de nuevo.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version 2^>^&1') do echo  ✓ %%i encontrado
echo.

echo  [2/5] Creando directorio %INSTALL_DIR%...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
echo  ✓ Directorio listo
echo.

echo  [3/5] Instalando pywin32...
pip install pywin32 >nul 2>&1
if %errorlevel% neq 0 (
    echo  ⚠  Error instalando pywin32, intentando con pip3...
    pip3 install pywin32 >nul 2>&1
)
echo  ✓ pywin32 instalado
echo.

echo  [4/5] Creando agente de impresion...

(
echo import json, sys, traceback
echo from http.server import HTTPServer, BaseHTTPRequestHandler
echo.
echo LISTEN_HOST = "127.0.0.1"
echo LISTEN_PORT = 9199
echo DEFAULT_PRINTER = "Impresora-Etiquetas"
echo.
echo try:
echo     import win32print
echo     HAS_WIN32 = True
echo except ImportError:
echo     HAS_WIN32 = False
echo     print("pywin32 no disponible - modo simulacion"^)
echo.
echo def build_tspl_label(text, barcode^):
echo     return (
echo         "SIZE 38 mm, 25 mm\r\n"
echo         "GAP 3 mm, 0 mm\r\n"
echo         "DIRECTION 1\r\n"
echo         "CLS\r\n"
echo         f'TEXT 150,20,"3",0,1,1,"{text}"\r\n'
echo         f'BARCODE 40,70,"128",80,1,0,2,4,"{barcode}"\r\n'
echo         "PRINT 1,1\r\n"
echo     ^)
echo.
echo def build_tspl_batch(text, harvester_num, folio_start, quantity^):
echo     commands = ""
echo     for i in range(quantity^):
echo         folio = folio_start + i
echo         folio_str = str(folio^).zfill(6^)
echo         barcode_value = f"{harvester_num}-{folio_str}"
echo         commands += build_tspl_label(text, barcode_value^)
echo     return commands
echo.
echo def build_tspl_custom(labels^):
echo     commands = ""
echo     for label in labels:
echo         commands += build_tspl_label(label.get("text",""^), label.get("barcode",""^)^)
echo     return commands
echo.
echo def send_to_printer(printer_name, tspl_data^):
echo     if not HAS_WIN32:
echo         print(f"[SIM] {len(tspl_data)} bytes a '{printer_name}'"^)
echo         return {"success": True, "mode": "simulation", "bytes": len(tspl_data^)}
echo     raw_bytes = tspl_data.encode("utf-8"^)
echo     printer_handle = None
echo     try:
echo         printer_handle = win32print.OpenPrinter(printer_name^)
echo         win32print.StartDocPrinter(printer_handle, 1, ("AGRATEC_Label", None, "RAW"^)^)
echo         try:
echo             win32print.StartPagePrinter(printer_handle^)
echo             bytes_written = win32print.WritePrinter(printer_handle, raw_bytes^)
echo             win32print.EndPagePrinter(printer_handle^)
echo         finally:
echo             win32print.EndDocPrinter(printer_handle^)
echo         print(f"Enviados {bytes_written} bytes a '{printer_name}'"^)
echo         return {"success": True, "mode": "raw", "bytes": bytes_written}
echo     except Exception as e:
echo         print(f"Error: {e}"^)
echo         return {"success": False, "error": str(e^)}
echo     finally:
echo         if printer_handle is not None:
echo             try: win32print.ClosePrinter(printer_handle^)
echo             except: pass
echo.
echo def list_printers(^):
echo     if not HAS_WIN32: return [{"name": DEFAULT_PRINTER, "status": "simulation"}]
echo     try:
echo         printers = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL ^| win32print.PRINTER_ENUM_CONNECTIONS, None, 2^)
echo         return [{"name": p["pPrinterName"], "status": "ready"} for p in printers]
echo     except: return []
echo.
echo class PrintHandler(BaseHTTPRequestHandler^):
echo     def _cors(self^):
echo         self.send_header("Access-Control-Allow-Origin", "*"^)
echo         self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS"^)
echo         self.send_header("Access-Control-Allow-Headers", "Content-Type"^)
echo     def _json(self, status, data^):
echo         self.send_response(status^)
echo         self.send_header("Content-Type", "application/json; charset=utf-8"^)
echo         self._cors(^)
echo         self.end_headers(^)
echo         self.wfile.write(json.dumps(data, ensure_ascii=False^).encode("utf-8"^)^)
echo     def do_OPTIONS(self^):
echo         self.send_response(204^)
echo         self._cors(^)
echo         self.end_headers(^)
echo     def do_GET(self^):
echo         if self.path == "/status":
echo             self._json(200, {"agent":"AGRATEC Print Agent","version":"1.0","status":"running","win32print":HAS_WIN32,"defaultPrinter":DEFAULT_PRINTER,"printers":list_printers(^)}^)
echo         else:
echo             self._json(200, {"message":"AGRATEC Print Agent v1.0"}^)
echo     def do_POST(self^):
echo         try:
echo             cl = int(self.headers.get("Content-Length", 0^)^)
echo             body = self.rfile.read(cl^).decode("utf-8"^)
echo             data = json.loads(body^) if body else {}
echo         except Exception as e:
echo             self._json(400, {"error": f"JSON invalido: {e}"}^)
echo             return
echo         pn = data.get("printerName", DEFAULT_PRINTER^)
echo         if self.path == "/print-test":
echo             t = data.get("text", "PRUEBA AGRATEC"^)
echo             self._json(200, send_to_printer(pn, build_tspl_label(t, t^)^)^)
echo             return
echo         if self.path == "/print":
echo             mode = data.get("mode", "cosecha"^)
echo             if mode == "cosecha":
echo                 text = data.get("text", "Cosecha SR 30"^)
echo                 hn = str(data.get("harvesterNum", "0"^)^)
echo                 fs = int(data.get("folioStart", 1^)^)
echo                 qty = int(data.get("quantity", 1^)^)
echo                 if qty ^> 5000:
echo                     self._json(400, {"error": "Max 5000 etiquetas"}^)
echo                     return
echo                 tspl = build_tspl_batch(text, hn, fs, qty^)
echo                 r = send_to_printer(pn, tspl^)
echo                 r["labels"] = qty
echo                 self._json(200 if r["success"] else 500, r^)
echo             elif mode == "custom":
echo                 labels = data.get("labels", []^)
echo                 if not labels:
echo                     self._json(400, {"error": "Sin etiquetas"}^)
echo                     return
echo                 tspl = build_tspl_custom(labels^)
echo                 r = send_to_printer(pn, tspl^)
echo                 r["labels"] = len(labels^)
echo                 self._json(200 if r["success"] else 500, r^)
echo             elif mode == "raw":
echo                 raw = data.get("tspl", ""^)
echo                 if not raw:
echo                     self._json(400, {"error": "Sin datos TSPL"}^)
echo                     return
echo                 self._json(200, send_to_printer(pn, raw^)^)
echo             else:
echo                 self._json(400, {"error": f"Modo desconocido: {mode}"}^)
echo             return
echo         self._json(404, {"error": "Ruta no encontrada"}^)
echo     def log_message(self, fmt, *args^):
echo         print(f"[{self.log_date_time_string(^)}] {args[0]}"^)
echo.
echo def main(^):
echo     print("=" * 55^)
echo     print("  AGRA TEC-TI - Agente de Impresion Directa"^)
echo     print("=" * 55^)
echo     print(f"  Impresora:  {DEFAULT_PRINTER}"^)
echo     print(f"  Puerto:     {LISTEN_PORT}"^)
echo     print(f"  win32print: {'Disponible' if HAS_WIN32 else 'No instalado'}"^)
echo     print(f"  URL:        http://{LISTEN_HOST}:{LISTEN_PORT}"^)
echo     print("=" * 55^)
echo     if HAS_WIN32:
echo         printers = list_printers(^)
echo         names = [p["name"] for p in printers]
echo         print(f"\n  Impresoras ({len(printers)^}):"^)
echo         for p in printers:
echo             m = " ^<-- CONFIGURADA" if p["name"] == DEFAULT_PRINTER else ""
echo             print(f"    - {p['name']}{m}"^)
echo         if DEFAULT_PRINTER not in names:
echo             print(f"\n  AVISO: '{DEFAULT_PRINTER}' NO encontrada."^)
echo     print(f"\n  Esperando peticiones...\n"^)
echo     try:
echo         HTTPServer((LISTEN_HOST, LISTEN_PORT^), PrintHandler^).serve_forever(^)
echo     except KeyboardInterrupt:
echo         print("\n  Agente detenido."^)
echo     except OSError as e:
echo         if "10048" in str(e^): print(f"\n  Puerto {LISTEN_PORT} en uso."^)
echo         else: raise
echo.
echo if __name__ == "__main__":
echo     main(^)
) > "%PYTHON_SCRIPT%"

echo  ✓ Agente creado en %PYTHON_SCRIPT%
echo.

REM Crear script de inicio
(
echo @echo off
echo title AGRATEC - Agente de Impresion
echo cd /d "%INSTALL_DIR%"
echo python print_agent.py
echo pause
) > "%START_SCRIPT%"

echo  [5/5] Configurando inicio automatico...

REM Crear acceso directo en Startup usando PowerShell
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('%STARTUP_LINK%'); $sc.TargetPath = '%START_SCRIPT%'; $sc.WorkingDirectory = '%INSTALL_DIR%'; $sc.Description = 'AGRATEC Print Agent'; $sc.Save()" >nul 2>&1

if exist "%STARTUP_LINK%" (
    echo  ✓ Inicio automatico configurado
) else (
    echo  ⚠  No se pudo configurar inicio automatico
    echo     Puedes ejecutar manualmente: %START_SCRIPT%
)

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║            INSTALACION COMPLETADA                    ║
echo  ╠══════════════════════════════════════════════════════╣
echo  ║                                                      ║
echo  ║  El agente se iniciara automaticamente con Windows.  ║
echo  ║  Tambien puedes iniciarlo manualmente desde:         ║
echo  ║  %INSTALL_DIR%\iniciar_agente.bat       ║
echo  ║                                                      ║
echo  ║  Iniciando agente ahora...                           ║
echo  ║                                                      ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

REM Iniciar el agente
cd /d "%INSTALL_DIR%"
python print_agent.py
pause
