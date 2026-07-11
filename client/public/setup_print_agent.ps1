$ErrorActionPreference = "Stop"
$InstallDir = "$env:USERPROFILE\AGRATEC_PrintAgent"
$PythonScript = "$InstallDir\print_agent.py"
$StartScript = "$InstallDir\iniciar_agente.bat"
$StartupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$StartupLink = "$StartupDir\AGRATEC_PrintAgent.lnk"

Write-Host ""
Write-Host "  AGRA TEC-TI - Instalador de Impresion Directa" -ForegroundColor Green
Write-Host "  ================================================" -ForegroundColor Green
Write-Host ""

# 1. Verificar Python
Write-Host "  [1/5] Verificando Python..." -ForegroundColor Cyan
try {
    $pyVer = python --version 2>&1
    Write-Host "  OK: $pyVer" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Python no esta instalado." -ForegroundColor Red
    Write-Host "  Descargalo de: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "  IMPORTANTE: Marca 'Add Python to PATH' al instalar." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "  Presiona Enter para salir"
    exit 1
}

# 2. Crear directorio
Write-Host "  [2/5] Creando directorio..." -ForegroundColor Cyan
if (!(Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir | Out-Null }
Write-Host "  OK: $InstallDir" -ForegroundColor Green

# 3. Instalar pywin32
Write-Host "  [3/5] Instalando pywin32..." -ForegroundColor Cyan
pip install pywin32 2>&1 | Out-Null
Write-Host "  OK: pywin32 instalado" -ForegroundColor Green

# 4. Crear agente
Write-Host "  [4/5] Creando agente de impresion..." -ForegroundColor Cyan

$agentCode = @'
import json, sys
from http.server import HTTPServer, BaseHTTPRequestHandler

LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = 9199
DEFAULT_PRINTER = "Impresora-Etiquetas"

try:
    import win32print
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False
    print("AVISO: pywin32 no disponible - modo simulacion")

def build_tspl_label(text, barcode):
    return (
        "SIZE 38 mm, 25 mm\r\n"
        "GAP 3 mm, 0 mm\r\n"
        "DIRECTION 1\r\n"
        "CLS\r\n"
        f'TEXT 150,20,"3",0,1,1,"{text}"\r\n'
        f'BARCODE 40,70,"128",80,1,0,2,4,"{barcode}"\r\n'
        "PRINT 1,1\r\n"
    )

def build_tspl_batch(text, harvester_num, folio_start, quantity):
    commands = ""
    for i in range(quantity):
        folio = folio_start + i
        folio_str = str(folio).zfill(6)
        barcode_value = f"{harvester_num}-{folio_str}"
        commands += build_tspl_label(text, barcode_value)
    return commands

def build_tspl_custom(labels):
    commands = ""
    for label in labels:
        commands += build_tspl_label(label.get("text", ""), label.get("barcode", ""))
    return commands

def send_to_printer(printer_name, tspl_data):
    if not HAS_WIN32:
        print(f"[SIM] {len(tspl_data)} bytes -> '{printer_name}'")
        return {"success": True, "mode": "simulation", "bytes": len(tspl_data)}
    raw_bytes = tspl_data.encode("utf-8")
    printer_handle = None
    try:
        printer_handle = win32print.OpenPrinter(printer_name)
        win32print.StartDocPrinter(printer_handle, 1, ("AGRATEC_Label", None, "RAW"))
        try:
            win32print.StartPagePrinter(printer_handle)
            bytes_written = win32print.WritePrinter(printer_handle, raw_bytes)
            win32print.EndPagePrinter(printer_handle)
        finally:
            win32print.EndDocPrinter(printer_handle)
        print(f"OK: {bytes_written} bytes -> '{printer_name}'")
        return {"success": True, "mode": "raw", "bytes": bytes_written}
    except Exception as e:
        print(f"ERROR: {e}")
        return {"success": False, "error": str(e)}
    finally:
        if printer_handle is not None:
            try:
                win32print.ClosePrinter(printer_handle)
            except:
                pass

def list_printers():
    if not HAS_WIN32:
        return [{"name": DEFAULT_PRINTER, "status": "simulation"}]
    try:
        printers = win32print.EnumPrinters(
            win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS, None, 2
        )
        return [{"name": p["pPrinterName"], "status": "ready"} for p in printers]
    except:
        return []

class PrintHandler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/status":
            self._json(200, {
                "agent": "AGRATEC Print Agent",
                "version": "1.0",
                "status": "running",
                "win32print": HAS_WIN32,
                "defaultPrinter": DEFAULT_PRINTER,
                "printers": list_printers(),
            })
        else:
            self._json(200, {"message": "AGRATEC Print Agent v1.0"})

    def do_POST(self):
        try:
            cl = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(cl).decode("utf-8")
            data = json.loads(body) if body else {}
        except Exception as e:
            self._json(400, {"error": f"JSON invalido: {e}"})
            return

        pn = data.get("printerName", DEFAULT_PRINTER)

        if self.path == "/print-test":
            t = data.get("text", "PRUEBA AGRATEC")
            self._json(200, send_to_printer(pn, build_tspl_label(t, t)))
            return

        if self.path == "/print":
            mode = data.get("mode", "cosecha")

            if mode == "cosecha":
                text = data.get("text", "Cosecha SR 30")
                hn = str(data.get("harvesterNum", "0"))
                fs = int(data.get("folioStart", 1))
                qty = int(data.get("quantity", 1))
                if qty > 5000:
                    self._json(400, {"error": "Max 5000 etiquetas por lote"})
                    return
                tspl = build_tspl_batch(text, hn, fs, qty)
                r = send_to_printer(pn, tspl)
                r["labels"] = qty
                self._json(200 if r["success"] else 500, r)

            elif mode == "custom":
                labels = data.get("labels", [])
                if not labels:
                    self._json(400, {"error": "Sin etiquetas"})
                    return
                tspl = build_tspl_custom(labels)
                r = send_to_printer(pn, tspl)
                r["labels"] = len(labels)
                self._json(200 if r["success"] else 500, r)

            elif mode == "raw":
                raw = data.get("tspl", "")
                if not raw:
                    self._json(400, {"error": "Sin datos TSPL"})
                    return
                self._json(200, send_to_printer(pn, raw))

            else:
                self._json(400, {"error": f"Modo desconocido: {mode}"})
            return

        self._json(404, {"error": "Ruta no encontrada"})

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {args[0]}")

def main():
    print("=" * 55)
    print("  AGRA TEC-TI - Agente de Impresion Directa")
    print("=" * 55)
    print(f"  Impresora:  {DEFAULT_PRINTER}")
    print(f"  Puerto:     {LISTEN_PORT}")
    print(f"  win32print: {'Disponible' if HAS_WIN32 else 'No instalado'}")
    print(f"  URL:        http://{LISTEN_HOST}:{LISTEN_PORT}")
    print("=" * 55)

    if HAS_WIN32:
        printers = list_printers()
        names = [p["name"] for p in printers]
        print(f"\n  Impresoras ({len(printers)}):")
        for p in printers:
            m = " <-- CONFIGURADA" if p["name"] == DEFAULT_PRINTER else ""
            print(f"    - {p['name']}{m}")
        if DEFAULT_PRINTER not in names:
            print(f"\n  AVISO: '{DEFAULT_PRINTER}' NO encontrada en el sistema.")

    print(f"\n  Esperando peticiones de impresion...\n")

    try:
        HTTPServer((LISTEN_HOST, LISTEN_PORT), PrintHandler).serve_forever()
    except KeyboardInterrupt:
        print("\n  Agente detenido.")
    except OSError as e:
        if "10048" in str(e):
            print(f"\n  ERROR: Puerto {LISTEN_PORT} ya esta en uso.")
        else:
            raise

if __name__ == "__main__":
    main()
'@

Set-Content -Path $PythonScript -Value $agentCode -Encoding UTF8
Write-Host "  OK: Agente creado" -ForegroundColor Green

# Crear script de inicio
$startBat = @"
@echo off
title AGRATEC - Agente de Impresion
cd /d "$InstallDir"
python print_agent.py
pause
"@
Set-Content -Path $StartScript -Value $startBat -Encoding ASCII
Write-Host "  OK: Script de inicio creado" -ForegroundColor Green

# 5. Configurar inicio automatico
Write-Host "  [5/5] Configurando inicio automatico con Windows..." -ForegroundColor Cyan
try {
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($StartupLink)
    $sc.TargetPath = $StartScript
    $sc.WorkingDirectory = $InstallDir
    $sc.Description = "AGRATEC Print Agent"
    $sc.Save()
    Write-Host "  OK: Inicio automatico configurado" -ForegroundColor Green
} catch {
    Write-Host "  AVISO: No se pudo configurar inicio automatico" -ForegroundColor Yellow
    Write-Host "  Puedes ejecutar manualmente: $StartScript" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  ================================================" -ForegroundColor Green
Write-Host "  INSTALACION COMPLETADA" -ForegroundColor Green
Write-Host "  ================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  El agente se iniciara automaticamente con Windows." -ForegroundColor White
Write-Host "  Ubicacion: $InstallDir" -ForegroundColor Gray
Write-Host ""
Write-Host "  Iniciando agente ahora..." -ForegroundColor Cyan
Write-Host ""

# Iniciar el agente
Set-Location $InstallDir
python print_agent.py
