import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { trpc } from "../lib/trpc";
import { GlassCard } from "../components/GlassCard";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Tag, Printer, History, Eye, Hash, Package, ArrowRight, Palette, Zap, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import JsBarcode from "jsbarcode";
import { APP_LOGO } from "../const";

const CustomLabelDesigner = lazy(() => import("./CustomLabelDesigner"));

export default function LabelPrinter() {
  const harvestersQ = trpc.harvesters.list.useQuery();
  const lastFolioQ = trpc.getLastFolio.useQuery();
  const historyQ = trpc.labelHistory.useQuery();
  const printMut = trpc.printLabels.useMutation();

  const [harvesterNum, setHarvesterNum] = useState<string>("");
  const [labelText, setLabelText] = useState("Cosecha SR 30");
  const [quantity, setQuantity] = useState(200);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<"cosecha" | "personalizado">("cosecha");
  const [agentOnline, setAgentOnline] = useState(false);
  const [directPrinting, setDirectPrinting] = useState(false);

  // Check print agent status
  useEffect(() => {
    const checkAgent = async () => {
      try {
        const res = await fetch("http://127.0.0.1:9199/status", { signal: AbortSignal.timeout(2000) });
        if (res.ok) setAgentOnline(true);
        else setAgentOnline(false);
      } catch { setAgentOnline(false); }
    };
    checkAgent();
    const interval = setInterval(checkAgent, 10000);
    return () => clearInterval(interval);
  }, []);

  const lastFolio = lastFolioQ.data?.lastFolio || 0;
  const folioStart = lastFolio + 1;
  const folioEnd = folioStart + quantity - 1;

  // Pad folio to 6 digits
  const pad6 = (n: number) => String(n).padStart(6, '0');

  const previewRef = useRef<SVGSVGElement>(null);
  const barcodeValue = harvesterNum ? `${harvesterNum}-${pad6(folioStart)}` : "0-000000";

  useEffect(() => {
    if (previewRef.current && harvesterNum) {
      try {
        JsBarcode(previewRef.current, barcodeValue, {
          format: "CODE128", width: 1.8, height: 25, fontSize: 11,
          margin: 2, displayValue: true, textMargin: 2,
        });
      } catch { /* invalid */ }
    }
  }, [barcodeValue, harvesterNum]);

  const specialOptions = [
    { num: 97, label: "97 - Recolecta" },
    { num: 98, label: "98 - Granel" },
    { num: 99, label: "99 - Desperdicio" },
  ];

  const getHarvesterLabel = useCallback((num: number) => {
    const special = specialOptions.find(s => s.num === num);
    if (special) return special.label;
    const h = (harvestersQ.data || []).find((h: any) => h.number === num);
    return h?.customName ? `${num} - ${h.customName}` : `Cortadora ${num}`;
  }, [harvestersQ.data]);

  // Total labels printed
  const totalPrinted = (historyQ.data || []).reduce((s: number, h: any) => s + (h.quantity || 0), 0);

  const handlePrint = async () => {
    if (!harvesterNum) { toast.error("Selecciona una cortadora"); return; }
    if (quantity < 1) { toast.error("Cantidad debe ser al menos 1"); return; }

    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (!printWindow) { toast.error("No se pudo abrir la ventana de impresión"); return; }

    let labelsHtml = "";
    for (let i = 0; i < quantity; i++) {
      labelsHtml += `<div class="label"><div class="label-text">${labelText}</div><svg class="barcode" id="bc-${i}"></svg></div>`;
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiquetas</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
@page { size: 38mm 25mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
.label { width: 38mm; height: 25mm; display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-after: always; padding: 1mm 1.5mm; overflow: hidden; }
.label:last-child { page-break-after: auto; }
.label-text { font-size: 9pt; font-weight: 700; text-align: center; margin-bottom: 0.5mm; letter-spacing: 0.5px; }
.barcode { width: 34mm !important; height: auto !important; max-height: 14mm; }
@media screen { body { background: #f5f5f5; padding: 10px; } .label { background: white; border: 1px dashed #ccc; margin: 5px auto; box-shadow: 0 1px 3px rgba(0,0,0,0.1); } }
</style></head><body>${labelsHtml}
<script>
document.querySelectorAll('.barcode').forEach((svg, i) => {
  const folio = ${folioStart} + i;
  const folioStr = String(folio).padStart(6, '0');
  JsBarcode(svg, "${harvesterNum}-" + folioStr, { format: "CODE128", width: 1.5, height: 25, fontSize: 11, margin: 0, marginTop: 0, marginBottom: 0, displayValue: true, textMargin: 2, font: "Arial", fontOptions: "bold" });
});
setTimeout(() => { window.print(); }, 300);
<\/script></body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();

    try {
      await printMut.mutateAsync({ harvesterNumber: parseInt(harvesterNum), labelText, folioStart, folioEnd, quantity });
      lastFolioQ.refetch();
      historyQ.refetch();
      toast.success(`${quantity} etiqueta(s) enviadas a impresión`);
    } catch { toast.error("Error guardando historial"); }
  };

  // ── Impresión DIRECTA via agente TSPL ──
  const handleDirectPrint = async () => {
    if (!harvesterNum) { toast.error("Selecciona una cortadora"); return; }
    if (quantity < 1) { toast.error("Cantidad debe ser al menos 1"); return; }

    setDirectPrinting(true);
    try {
      const res = await fetch("http://127.0.0.1:9199/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "cosecha",
          text: labelText,
          harvesterNum: harvesterNum,
          folioStart: folioStart,
          quantity: quantity,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await printMut.mutateAsync({ harvesterNumber: parseInt(harvesterNum), labelText, folioStart, folioEnd, quantity });
        lastFolioQ.refetch();
        historyQ.refetch();
        toast.success(`✅ ${quantity} etiqueta(s) enviadas directo a la impresora`);
      } else {
        toast.error(`Error: ${data.error || "Fallo de impresión"}`);
      }
    } catch (err) {
      toast.error("No se pudo conectar al agente de impresión. ¿Está corriendo?");
    } finally {
      setDirectPrinting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container px-3 md:px-6">
      {/* Header */}
      <div className="mb-6 md:mb-8 flex items-center gap-3 md:gap-4">
        <img src={APP_LOGO} alt="Agratec" className="h-12 w-12 md:h-16 md:w-16" />
        <div>
          <h1 className="text-2xl md:text-4xl font-bold text-green-900">Impresión de Etiquetas</h1>
          <p className="text-xs md:text-base text-green-700">Etiquetas de cosecha con folios y etiquetas personalizadas</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-2">
        <Button
          variant={activeTab === "cosecha" ? "default" : "outline"}
          onClick={() => setActiveTab("cosecha")}
          className={`gap-2 ${activeTab === "cosecha" ? "bg-green-600 hover:bg-green-700" : "border-green-300 text-green-700 hover:bg-green-50"}`}
          size="sm"
        >
          <Tag className="h-4 w-4" /> Cosecha (Folios)
        </Button>
        <Button
          variant={activeTab === "personalizado" ? "default" : "outline"}
          onClick={() => setActiveTab("personalizado")}
          className={`gap-2 ${activeTab === "personalizado" ? "bg-emerald-600 hover:bg-emerald-700" : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}
          size="sm"
        >
          <Palette className="h-4 w-4" /> Personalizado
        </Button>
      </div>

      {/* Tab: Personalizado */}
      {activeTab === "personalizado" && (
        <Suspense fallback={<div className="py-12 text-center text-gray-400">Cargando diseñador...</div>}>
          <CustomLabelDesigner />
        </Suspense>
      )}

      {/* Tab: Cosecha */}
      {activeTab === "cosecha" && (<>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <GlassCard className="p-3 text-center">
          <Hash className="h-4 w-4 mx-auto text-emerald-500 mb-1" />
          <p className="text-xl font-bold text-emerald-600 font-mono">{pad6(lastFolio)}</p>
          <p className="text-xs text-gray-500">Último Folio</p>
        </GlassCard>
        <GlassCard className="p-3 text-center">
          <ArrowRight className="h-4 w-4 mx-auto text-blue-500 mb-1" />
          <p className="text-xl font-bold text-blue-600 font-mono">{pad6(folioStart)}</p>
          <p className="text-xs text-gray-500">Siguiente</p>
        </GlassCard>
        <GlassCard className="p-3 text-center">
          <Package className="h-4 w-4 mx-auto text-purple-500 mb-1" />
          <p className="text-xl font-bold text-purple-600 font-mono">{totalPrinted.toLocaleString()}</p>
          <p className="text-xs text-gray-500">Total Impresas</p>
        </GlassCard>
        <GlassCard className="p-3 text-center">
          <History className="h-4 w-4 mx-auto text-amber-500 mb-1" />
          <p className="text-xl font-bold text-amber-600">{(historyQ.data || []).length}</p>
          <p className="text-xs text-gray-500">Lotes</p>
        </GlassCard>
      </div>


      {/* Config */}
      <GlassCard className="p-5 mb-5">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Printer className="h-5 w-5 text-emerald-500" />
            Configuración
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cortadora / Tipo</label>
              <Select value={harvesterNum} onValueChange={setHarvesterNum}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {(harvestersQ.data || []).map((h: any) => (
                    <SelectItem key={h.number} value={String(h.number)}>
                      {h.customName ? `${h.number} - ${h.customName}` : `Cortadora ${h.number}`}
                    </SelectItem>
                  ))}
                  <SelectItem value="97">97 - Recolecta</SelectItem>
                  <SelectItem value="98">98 - Granel</SelectItem>
                  <SelectItem value="99">99 - Desperdicio</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Texto de Etiqueta</label>
              <Input value={labelText} onChange={(e) => setLabelText(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cantidad</label>
              <div className="flex gap-2">
                <Input type="number" min={1} max={2000} value={quantity} onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="flex-1" />
                <Button variant="outline" size="sm" onClick={() => setQuantity(1)} className="text-xs px-2">1</Button>
                <Button variant="outline" size="sm" onClick={() => setQuantity(100)} className="text-xs px-2">100</Button>
                <Button variant="outline" size="sm" onClick={() => setQuantity(200)} className="text-xs px-2">200</Button>
                <Button variant="outline" size="sm" onClick={() => setQuantity(500)} className="text-xs px-2">500</Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Rango de Folios</label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-sm">
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{pad6(folioStart)}</span>
                <ArrowRight className="h-3 w-3 text-gray-400" />
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{pad6(folioEnd)}</span>
                <span className="text-gray-400 ml-auto text-xs">({quantity})</span>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {/* Botón impresión directa TSPL */}
            <Button
              onClick={handleDirectPrint}
              disabled={!harvesterNum || !agentOnline || directPrinting || printMut.isPending}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white gap-2 h-11 text-base font-semibold shadow-lg shadow-green-500/25"
            >
              <Zap className="h-5 w-5" />
              {directPrinting ? "Enviando..." : `Impresión Directa ${quantity.toLocaleString()} Etiqueta(s)`}
            </Button>

            {/* Estado del agente */}
            <div className={`flex items-center justify-center gap-2 text-xs py-1.5 rounded-md ${agentOnline ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'}`}>
              {agentOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {agentOnline ? 'Agente conectado — Impresora-Etiquetas' : 'Agente desconectado — Inicia start_agent.bat'}
            </div>

            {/* Botón Chrome fallback */}
            <Button
              variant="outline"
              onClick={handlePrint}
              disabled={!harvesterNum || printMut.isPending}
              className="w-full gap-2 h-9 text-sm border-gray-300 text-gray-600"
            >
              <Printer className="h-4 w-4" />
              {printMut.isPending ? "Guardando..." : "Imprimir via Chrome (navegador)"}
            </Button>
          </div>
        </GlassCard>

        {/* Preview */}
        <GlassCard className="p-5 mb-5">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Eye className="h-5 w-5 text-blue-500" />
            Vista Previa
            <span className="text-xs text-gray-400 ml-auto">38mm × 25mm</span>
          </h2>

          {/* Real size preview */}
          <div className="flex justify-center mb-4">
            <div style={{
              width: '38mm', height: '25mm',
              border: '2px solid #10b981', borderRadius: '3px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '1mm 1.5mm', background: 'white', overflow: 'hidden',
            }}>
              <div style={{
                fontSize: '8pt', fontWeight: 700, textAlign: 'center',
                marginBottom: '1mm', fontFamily: 'Arial, sans-serif',
                letterSpacing: '0.5px', color: '#000',
              }}>
                {labelText || "Cosecha SR 30"}
              </div>
              {harvesterNum ? (
                <svg ref={previewRef} style={{ width: '34mm', maxHeight: '14mm' }}></svg>
              ) : (
                <div style={{ fontSize: '7pt', color: '#999', textAlign: 'center' }}>Selecciona cortadora</div>
              )}
            </div>
          </div>

          {/* Info */}
          {harvesterNum && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Código:</span>
                <span className="font-mono font-bold text-gray-900 dark:text-white">{barcodeValue}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Formato:</span>
                <span className="font-medium">CODE128</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cortadora:</span>
                <span className="font-medium">{getHarvesterLabel(parseInt(harvesterNum))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Rango:</span>
                <span className="font-mono text-emerald-600">{pad6(folioStart)} - {pad6(folioEnd)}</span>
              </div>
            </div>
          )}
        </GlassCard>

      {/* History */}
      <GlassCard className="p-5">
        <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={() => setShowHistory(!showHistory)}>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <History className="h-5 w-5 text-purple-500" />
            Historial de Impresiones ({(historyQ.data || []).length} registros)
          </h2>
          <Button variant="ghost" size="sm">{showHistory ? "Ocultar" : "Mostrar"}</Button>
        </div>
        {showHistory && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-600 dark:text-gray-400">Fecha</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-600 dark:text-gray-400">Cortadora</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-600 dark:text-gray-400">Texto</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-600 dark:text-gray-400">Folio Inicio</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-600 dark:text-gray-400">Folio Final</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-600 dark:text-gray-400">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {(historyQ.data || []).map((h: any) => (
                  <tr key={h.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors">
                    <td className="py-2 px-3 text-gray-500">{h.printedAt ? format(new Date(h.printedAt), "dd MMM yy", { locale: es }) : "-"}</td>
                    <td className="py-2 px-3 font-medium">{getHarvesterLabel(h.harvesterNumber)}</td>
                    <td className="py-2 px-3 text-gray-500">{h.labelText}</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-700 dark:text-gray-300">{pad6(h.folioStart || 0)}</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-700 dark:text-gray-300">{pad6(h.folioEnd || 0)}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-600">{h.quantity?.toLocaleString()}</td>
                  </tr>
                ))}
                {(!historyQ.data || historyQ.data.length === 0) && (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400">No hay historial</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
      </>)}{/* end cosecha tab */}
      </div>{/* close container */}
    </div>
  );
}
