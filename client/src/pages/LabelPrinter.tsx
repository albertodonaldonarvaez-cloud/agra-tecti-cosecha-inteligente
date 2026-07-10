import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "../lib/trpc";
import { GlassCard } from "../components/GlassCard";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Tag, Printer, History, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import JsBarcode from "jsbarcode";

// ══════════════════════════════════════════
// Label Printer Page
// ══════════════════════════════════════════

export default function LabelPrinter() {
  // Data queries
  const harvestersQ = trpc.getHarvesters.useQuery();
  const lastFolioQ = trpc.getLastFolio.useQuery();
  const historyQ = trpc.labelHistory.useQuery();
  const printMut = trpc.printLabels.useMutation();

  // Form state
  const [harvesterNum, setHarvesterNum] = useState<string>("");
  const [labelText, setLabelText] = useState("Cosecha SR 30");
  const [quantity, setQuantity] = useState(1);
  const [showHistory, setShowHistory] = useState(false);

  // Derived
  const lastFolio = lastFolioQ.data?.lastFolio || 0;
  const folioStart = lastFolio + 1;
  const folioEnd = folioStart + quantity - 1;

  // Preview barcode
  const previewRef = useRef<SVGSVGElement>(null);
  const barcodeValue = harvesterNum ? `${harvesterNum}-${folioStart}` : "0-0";

  useEffect(() => {
    if (previewRef.current && harvesterNum) {
      try {
        JsBarcode(previewRef.current, barcodeValue, {
          format: "CODE128",
          width: 1.5,
          height: 30,
          fontSize: 9,
          margin: 2,
          displayValue: true,
          textMargin: 1,
        });
      } catch { /* invalid barcode */ }
    }
  }, [barcodeValue, harvesterNum]);

  // Special harvester options
  const specialOptions = [
    { num: 97, label: "97 - Recolecta" },
    { num: 98, label: "98 - Granel" },
    { num: 99, label: "99 - Desperdicio" },
  ];

  // Get harvester display name
  const getHarvesterLabel = useCallback((num: number) => {
    const special = specialOptions.find(s => s.num === num);
    if (special) return special.label;
    const h = (harvestersQ.data || []).find((h: any) => h.number === num);
    return h?.customName ? `${num} - ${h.customName}` : `Cortadora ${num}`;
  }, [harvestersQ.data]);

  // Print handler
  const handlePrint = async () => {
    if (!harvesterNum) { toast.error("Selecciona una cortadora"); return; }
    if (quantity < 1) { toast.error("Cantidad debe ser al menos 1"); return; }

    // Generate print window
    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (!printWindow) { toast.error("No se pudo abrir la ventana de impresión"); return; }

    // Build labels HTML
    let labelsHtml = "";
    for (let i = 0; i < quantity; i++) {
      const folio = folioStart + i;
      const code = `${harvesterNum}-${folio}`;
      labelsHtml += `
        <div class="label">
          <div class="label-text">${labelText}</div>
          <svg class="barcode" id="bc-${i}"></svg>
        </div>
      `;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Etiquetas</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  <style>
    @page { 
      size: 38mm 25mm; 
      margin: 0; 
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .label {
      width: 38mm;
      height: 25mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      page-break-after: always;
      padding: 1mm 1.5mm;
      overflow: hidden;
    }
    .label:last-child { page-break-after: auto; }
    .label-text {
      font-size: 8pt;
      font-weight: 700;
      text-align: center;
      margin-bottom: 1mm;
      letter-spacing: 0.5px;
    }
    .barcode {
      width: 34mm !important;
      height: auto !important;
      max-height: 16mm;
    }
    @media screen {
      body { background: #f5f5f5; padding: 10px; }
      .label { 
        background: white; 
        border: 1px dashed #ccc; 
        margin: 5px auto;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
    }
  </style>
</head>
<body>
  ${labelsHtml}
  <script>
    document.querySelectorAll('.barcode').forEach((svg, i) => {
      const folio = ${folioStart} + i;
      const code = "${harvesterNum}-" + folio;
      JsBarcode(svg, code, {
        format: "CODE128",
        width: 1.5,
        height: 35,
        fontSize: 8,
        margin: 0,
        marginTop: 0,
        marginBottom: 0,
        displayValue: true,
        textMargin: 1,
        font: "Arial",
        fontOptions: "bold",
      });
    });
    // Auto print after barcodes render
    setTimeout(() => { window.print(); }, 300);
  </script>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();

    // Save to history
    try {
      await printMut.mutateAsync({
        harvesterNumber: parseInt(harvesterNum),
        labelText,
        folioStart,
        folioEnd,
        quantity,
      });
      lastFolioQ.refetch();
      historyQ.refetch();
      toast.success(`${quantity} etiqueta(s) enviadas a impresión`);
    } catch (err) {
      toast.error("Error guardando historial");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
            <Tag className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Impresión de Etiquetas</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Genera códigos de barras para cajas de cosecha</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowHistory(!showHistory)}
          className="gap-2"
        >
          <History className="h-4 w-4" />
          Historial
          {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Form */}
        <div className="lg:col-span-2 space-y-4">
          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Printer className="h-5 w-5 text-emerald-500" />
              Configuración de Etiqueta
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Harvester Select */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Cortadora / Tipo</label>
                <Select value={harvesterNum} onValueChange={setHarvesterNum}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Regular harvesters */}
                    {(harvestersQ.data || []).map((h: any) => (
                      <SelectItem key={h.number} value={String(h.number)}>
                        {h.customName ? `${h.number} - ${h.customName}` : `Cortadora ${h.number}`}
                      </SelectItem>
                    ))}
                    {/* Special */}
                    <SelectItem value="97">97 - Recolecta</SelectItem>
                    <SelectItem value="98">98 - Granel</SelectItem>
                    <SelectItem value="99">99 - Desperdicio</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Label Text */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Texto de Etiqueta</label>
                <Input 
                  value={labelText} 
                  onChange={(e) => setLabelText(e.target.value)}
                  placeholder="Cosecha SR 30"
                />
              </div>

              {/* Quantity */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Cantidad</label>
                <Input 
                  type="number" 
                  min={1} 
                  max={1000}
                  value={quantity} 
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              {/* Folio Info */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Rango de Folios</label>
                <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm">
                  <span className="font-mono font-bold text-emerald-600">{folioStart}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-mono font-bold text-emerald-600">{folioEnd}</span>
                  <span className="text-gray-400 ml-auto text-xs">({quantity} etiquetas)</span>
                </div>
              </div>
            </div>

            {/* Print Button */}
            <div className="mt-6 flex gap-3">
              <Button
                onClick={handlePrint}
                disabled={!harvesterNum || printMut.isPending}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white gap-2 px-6"
                size="lg"
              >
                <Printer className="h-5 w-5" />
                {printMut.isPending ? "Guardando..." : `Imprimir ${quantity} Etiqueta(s)`}
              </Button>
              <Button
                variant="outline"
                onClick={() => setQuantity(1)}
                size="lg"
              >
                1 prueba
              </Button>
              <Button
                variant="outline"
                onClick={() => setQuantity(100)}
                size="lg"
              >
                100
              </Button>
              <Button
                variant="outline"
                onClick={() => setQuantity(200)}
                size="lg"
              >
                200
              </Button>
            </div>
          </GlassCard>

          {/* Folio Summary Card */}
          <GlassCard className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Último Folio Global</p>
                <p className="text-2xl font-bold text-emerald-600 font-mono">{lastFolio.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Siguiente Folio</p>
                <p className="text-2xl font-bold text-blue-600 font-mono">{folioStart.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Después de Imprimir</p>
                <p className="text-2xl font-bold text-purple-600 font-mono">{folioEnd.toLocaleString()}</p>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Right: Preview */}
        <div>
          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-500" />
              Vista Previa
            </h2>
            <p className="text-xs text-gray-500 mb-3">Tamaño real: 38mm × 25mm</p>

            {/* Actual size preview */}
            <div className="flex justify-center">
              <div 
                style={{ 
                  width: '38mm', 
                  height: '25mm', 
                  border: '1px dashed #d1d5db',
                  borderRadius: '2px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1mm 1.5mm',
                  background: 'white',
                  overflow: 'hidden',
                }}
              >
                <div style={{ 
                  fontSize: '8pt', 
                  fontWeight: 700, 
                  textAlign: 'center', 
                  marginBottom: '1mm',
                  fontFamily: 'Arial, sans-serif',
                  letterSpacing: '0.5px',
                  color: '#000',
                }}>
                  {labelText || "Cosecha SR 30"}
                </div>
                {harvesterNum ? (
                  <svg ref={previewRef} style={{ width: '34mm', maxHeight: '16mm' }}></svg>
                ) : (
                  <div style={{ fontSize: '7pt', color: '#999', textAlign: 'center' }}>
                    Selecciona una cortadora
                  </div>
                )}
              </div>
            </div>

            {/* Enlarged preview */}
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-500 mb-2">Vista ampliada (2x)</p>
              <div className="flex justify-center">
                <div 
                  style={{ 
                    width: '76mm', 
                    height: '50mm', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2mm 3mm',
                    background: 'white',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ 
                    fontSize: '16pt', 
                    fontWeight: 700, 
                    textAlign: 'center', 
                    marginBottom: '2mm',
                    fontFamily: 'Arial, sans-serif',
                    letterSpacing: '1px',
                    color: '#000',
                  }}>
                    {labelText || "Cosecha SR 30"}
                  </div>
                  {harvesterNum ? (
                    <div style={{ fontSize: '11pt', fontWeight: 700, fontFamily: 'monospace', color: '#000' }}>
                      {barcodeValue}
                    </div>
                  ) : (
                    <div style={{ fontSize: '10pt', color: '#999' }}>—</div>
                  )}
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* History */}
      {showHistory && (
        <GlassCard className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <History className="h-5 w-5 text-purple-500" />
            Historial de Impresiones
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Fecha</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Cortadora</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Texto</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Folio Inicio</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Folio Final</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {(historyQ.data || []).map((h: any) => (
                  <tr key={h.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2 px-3 text-gray-600 dark:text-gray-400">
                      {h.printedAt ? format(new Date(h.printedAt), "dd MMM yyyy HH:mm", { locale: es }) : "-"}
                    </td>
                    <td className="py-2 px-3 font-medium">{getHarvesterLabel(h.harvesterNumber)}</td>
                    <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{h.labelText}</td>
                    <td className="py-2 px-3 text-right font-mono">{h.folioStart?.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right font-mono">{h.folioEnd?.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-600">{h.quantity}</td>
                  </tr>
                ))}
                {(!historyQ.data || historyQ.data.length === 0) && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400">
                      No hay historial de impresiones
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
