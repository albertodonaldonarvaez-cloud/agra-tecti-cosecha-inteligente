"""
AGRA TEC-TI - Agente de Impresión Directa TSPL
================================================
Servidor HTTP local que recibe peticiones del navegador y envía
comandos TSPL nativos a la impresora térmica Sumprint XP-365B
via win32print (canal RAW, sin diálogo de Chrome).

Uso:
  1. pip install pywin32
  2. python print_agent.py
  3. El agente escucha en http://localhost:9199

Endpoints:
  GET  /status        → Estado del agente y lista de impresoras
  POST /print         → Imprime etiquetas con datos TSPL
  POST /print-test    → Imprime una etiqueta de prueba
"""

import json
import sys
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional

# ── Config ──────────────────────────────────────────
LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = 9199
DEFAULT_PRINTER = "Impresora-Etiquetas"

# ── Intentar importar win32print ────────────────────
try:
    import win32print
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False
    print("⚠️  pywin32 no instalado. Ejecuta: pip install pywin32")
    print("   El agente arrancará en modo simulación.\n")


def build_tspl_label(text: str, barcode: str) -> str:
    """Construye un bloque TSPL para una etiqueta 38x25mm con gap 3mm."""
    return (
        "SIZE 38 mm, 25 mm\r\n"
        "GAP 3 mm, 0 mm\r\n"
        "DIRECTION 1\r\n"
        "CLS\r\n"
        f'TEXT 150,20,"3",0,1,1,"{text}"\r\n'
        f'BARCODE 40,70,"128",80,1,0,2,4,"{barcode}"\r\n'
        "PRINT 1,1\r\n"
    )


def build_tspl_batch(text: str, harvester_num: str, folio_start: int, quantity: int) -> str:
    """Construye múltiples etiquetas TSPL con folios consecutivos."""
    commands = ""
    for i in range(quantity):
        folio = folio_start + i
        folio_str = str(folio).zfill(6)
        barcode_value = f"{harvester_num}-{folio_str}"
        commands += build_tspl_label(text, barcode_value)
    return commands


def build_tspl_custom(labels: list) -> str:
    """Construye etiquetas con datos personalizados."""
    commands = ""
    for label in labels:
        commands += build_tspl_label(
            label.get("text", ""),
            label.get("barcode", "")
        )
    return commands


def send_to_printer(printer_name: str, tspl_data: str) -> dict:
    """Envía datos TSPL en modo RAW a la impresora vía win32print."""
    if not HAS_WIN32:
        print(f"[SIMULACIÓN] Enviando {len(tspl_data)} bytes a '{printer_name}'")
        print(tspl_data[:500] + ("..." if len(tspl_data) > 500 else ""))
        return {"success": True, "mode": "simulation", "bytes": len(tspl_data)}

    raw_bytes = tspl_data.encode("utf-8")
    printer_handle = None

    try:
        # Abrir impresora
        printer_handle = win32print.OpenPrinter(printer_name)
        
        # Iniciar documento RAW
        doc_info = ("AGRATEC_Label", None, "RAW")
        win32print.StartDocPrinter(printer_handle, 1, doc_info)
        
        try:
            # Iniciar página
            win32print.StartPagePrinter(printer_handle)
            
            # Escribir datos TSPL
            bytes_written = win32print.WritePrinter(printer_handle, raw_bytes)
            
            # Cerrar página
            win32print.EndPagePrinter(printer_handle)
            
        finally:
            # Cerrar documento (siempre, incluso si hay error)
            win32print.EndDocPrinter(printer_handle)

        print(f"✅ Enviados {bytes_written} bytes a '{printer_name}'")
        return {"success": True, "mode": "raw", "bytes": bytes_written}

    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error imprimiendo: {error_msg}")
        return {"success": False, "error": error_msg}

    finally:
        # Cerrar handle (siempre)
        if printer_handle is not None:
            try:
                win32print.ClosePrinter(printer_handle)
            except:
                pass


def list_printers() -> list:
    """Lista todas las impresoras del sistema."""
    if not HAS_WIN32:
        return [{"name": DEFAULT_PRINTER, "status": "simulation"}]
    
    try:
        printers = win32print.EnumPrinters(
            win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS,
            None, 2
        )
        return [{"name": p["pPrinterName"], "status": "ready"} for p in printers]
    except:
        return []


class PrintHandler(BaseHTTPRequestHandler):
    """Handler HTTP para el agente de impresión."""

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/status":
            printers = list_printers()
            self._send_json(200, {
                "agent": "AGRATEC Print Agent",
                "version": "1.0.0",
                "status": "running",
                "win32print": HAS_WIN32,
                "defaultPrinter": DEFAULT_PRINTER,
                "printers": printers,
            })
        elif self.path == "/":
            self._send_json(200, {"message": "AGRATEC Print Agent v1.0 - Use /status para ver estado"})
        else:
            self._send_json(404, {"error": "Ruta no encontrada"})

    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            data = json.loads(body) if body else {}
        except Exception as e:
            self._send_json(400, {"error": f"JSON inválido: {str(e)}"})
            return

        printer_name = data.get("printerName", DEFAULT_PRINTER)

        # ── /print-test ──
        if self.path == "/print-test":
            test_text = data.get("text", "PRUEBA AGRATEC")
            tspl = build_tspl_label(test_text, test_text)
            result = send_to_printer(printer_name, tspl)
            self._send_json(200 if result["success"] else 500, result)
            return

        # ── /print ──
        if self.path == "/print":
            mode = data.get("mode", "cosecha")

            if mode == "cosecha":
                # Modo cosecha: folios consecutivos
                text = data.get("text", "Cosecha SR 30")
                harvester_num = str(data.get("harvesterNum", "0"))
                folio_start = int(data.get("folioStart", 1))
                quantity = int(data.get("quantity", 1))

                if quantity > 5000:
                    self._send_json(400, {"error": "Máximo 5000 etiquetas por lote"})
                    return

                tspl = build_tspl_batch(text, harvester_num, folio_start, quantity)
                result = send_to_printer(printer_name, tspl)
                result["labels"] = quantity
                result["folioStart"] = folio_start
                result["folioEnd"] = folio_start + quantity - 1
                self._send_json(200 if result["success"] else 500, result)

            elif mode == "custom":
                # Modo personalizado: lista de etiquetas
                labels = data.get("labels", [])
                if not labels:
                    self._send_json(400, {"error": "No hay etiquetas para imprimir"})
                    return
                tspl = build_tspl_custom(labels)
                result = send_to_printer(printer_name, tspl)
                result["labels"] = len(labels)
                self._send_json(200 if result["success"] else 500, result)

            elif mode == "raw":
                # Modo raw: enviar TSPL directo
                raw_tspl = data.get("tspl", "")
                if not raw_tspl:
                    self._send_json(400, {"error": "No hay datos TSPL"})
                    return
                result = send_to_printer(printer_name, raw_tspl)
                self._send_json(200 if result["success"] else 500, result)

            else:
                self._send_json(400, {"error": f"Modo desconocido: {mode}"})
            return

        self._send_json(404, {"error": "Ruta no encontrada"})

    def log_message(self, format, *args):
        """Log más limpio."""
        print(f"[{self.log_date_time_string()}] {args[0]}")


def main():
    print("=" * 55)
    print("  🏷️  AGRA TEC-TI - Agente de Impresión Directa")
    print("=" * 55)
    print(f"  Impresora:  {DEFAULT_PRINTER}")
    print(f"  Puerto:     {LISTEN_PORT}")
    print(f"  win32print: {'✅ Disponible' if HAS_WIN32 else '❌ No instalado (modo simulación)'}")
    print(f"  URL:        http://{LISTEN_HOST}:{LISTEN_PORT}")
    print("=" * 55)

    if HAS_WIN32:
        printers = list_printers()
        printer_names = [p["name"] for p in printers]
        print(f"\n  Impresoras detectadas ({len(printers)}):")
        for p in printers:
            marker = " ← CONFIGURADA" if p["name"] == DEFAULT_PRINTER else ""
            print(f"    • {p['name']}{marker}")
        
        if DEFAULT_PRINTER not in printer_names:
            print(f"\n  ⚠️  '{DEFAULT_PRINTER}' NO encontrada en el sistema.")
            print(f"     Verifica el nombre exacto en Panel de Control > Impresoras")

    print(f"\n  Esperando peticiones de impresión...\n")

    try:
        server = HTTPServer((LISTEN_HOST, LISTEN_PORT), PrintHandler)
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n\n  🛑 Agente detenido.")
        sys.exit(0)
    except OSError as e:
        if "address already in use" in str(e).lower() or "10048" in str(e):
            print(f"\n  ❌ El puerto {LISTEN_PORT} ya está en uso.")
            print(f"     Cierra la otra instancia del agente o cambia LISTEN_PORT.")
        else:
            raise


if __name__ == "__main__":
    main()
