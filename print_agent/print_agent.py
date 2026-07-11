"""
AGRA TEC-TI - Agente de Impresion Directa TSPL
Servidor HTTP local para impresion nativa a Sumprint XP-365B
"""
import json
import sys
import os
from http.server import HTTPServer, BaseHTTPRequestHandler

LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = 9199
DEFAULT_PRINTER = "Impresora-Etiquetas"

try:
    import win32print
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False

def build_tspl_label(text, barcode):
    return (
        "SIZE 38 mm, 25 mm\r\n"
        "GAP 3 mm, 0 mm\r\n"
        "DIRECTION 1\r\n"
        "CLS\r\n"
        f'TEXT 65,10,"2",0,1,1,"{text}"\r\n'
        f'BARCODE 45,50,"128",75,1,0,2,3,"{barcode}"\r\n'
        "PRINT 1,1\r\n"
    )

def build_tspl_batch(text, harvester_num, folio_start, quantity):
    hn = str(harvester_num).zfill(2)
    commands = ""
    for i in range(quantity):
        folio = folio_start + i
        folio_str = str(folio).zfill(6)
        commands += build_tspl_label(text, f"{hn}-{folio_str}")
    return commands

def build_tspl_custom(labels):
    commands = ""
    for label in labels:
        commands += build_tspl_label(label.get("text", ""), label.get("barcode", ""))
    return commands

def send_to_printer(printer_name, tspl_data):
    if not HAS_WIN32:
        print(f"  [SIM] {len(tspl_data)} bytes -> '{printer_name}'")
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
        print(f"  [OK] {bytes_written} bytes -> '{printer_name}'")
        return {"success": True, "mode": "raw", "bytes": bytes_written}
    except Exception as e:
        print(f"  [ERROR] {e}")
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
        print(f"  [{self.log_date_time_string()}] {args[0]}")

def main():
    os.system("title AGRATEC - Agente de Impresion Directa")
    print("")
    print("  =======================================================")
    print("  AGRA TEC-TI - Agente de Impresion Directa")
    print("  Impresora Termica TSPL - Sumprint XP-365B")
    print("  =======================================================")
    print(f"  Impresora:  {DEFAULT_PRINTER}")
    print(f"  Puerto:     {LISTEN_PORT}")
    print(f"  win32print: {'SI' if HAS_WIN32 else 'NO (modo simulacion)'}")
    print(f"  URL:        http://{LISTEN_HOST}:{LISTEN_PORT}")
    print("  =======================================================")

    if HAS_WIN32:
        printers = list_printers()
        names = [p["name"] for p in printers]
        print(f"\n  Impresoras detectadas ({len(printers)}):")
        for p in printers:
            m = " <-- CONFIGURADA" if p["name"] == DEFAULT_PRINTER else ""
            print(f"    - {p['name']}{m}")
        if DEFAULT_PRINTER not in names:
            print(f"\n  *** AVISO: '{DEFAULT_PRINTER}' NO encontrada ***")
            print(f"  Verifica el nombre en Panel de Control > Impresoras")
    else:
        print("\n  *** pywin32 no disponible - modo simulacion ***")

    print(f"\n  Listo! Esperando peticiones de impresion...")
    print(f"  (No cierres esta ventana mientras uses la impresora)\n")

    try:
        server = HTTPServer((LISTEN_HOST, LISTEN_PORT), PrintHandler)
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Agente detenido.")
    except OSError as e:
        if "10048" in str(e) or "address already in use" in str(e).lower():
            print(f"\n  ERROR: Puerto {LISTEN_PORT} ya en uso.")
            print(f"  Cierra la otra instancia del agente.")
            input("\n  Presiona Enter para salir...")
        else:
            print(f"\n  ERROR: {e}")
            input("\n  Presiona Enter para salir...")

if __name__ == "__main__":
    main()
