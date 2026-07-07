import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import { toast } from "sonner";
import {
  FileText, Download, Calendar, Package, TrendingUp, Satellite,
  ClipboardList, CloudSun, Brain, ChevronDown, Loader2, Leaf,
  BarChart3, Droplets, AlertTriangle, CheckCircle, Clock, X,
  Globe, Filter
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ── Helpers ──
function fmtDate(dateStr: string) {
  if (!dateStr) return "-";
  const safe = dateStr.length === 10 ? dateStr + "T12:00:00" : dateStr;
  return new Date(safe).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Mexico_City" });
}
function fmtDateShort(dateStr: string) {
  if (!dateStr) return "-";
  const safe = dateStr.length === 10 ? dateStr + "T12:00:00" : dateStr;
  return new Date(safe).toLocaleDateString("es-MX", { day: "2-digit", month: "short", timeZone: "America/Mexico_City" });
}
function calcSlaHours(created: string | Date, resolved: string | Date | null): number | null {
  if (!resolved) return null;
  return Math.round((new Date(resolved).getTime() - new Date(created).getTime()) / (1000 * 60 * 60) * 10) / 10;
}

const sevLabels: Record<string, string> = { baja: "Baja", media: "Media", alta: "Alta", critica: "Crítica" };
const sevColors: Record<string, string> = { baja: "#3B82F6", media: "#F59E0B", alta: "#F97316", critica: "#EF4444" };
const catLabels: Record<string, string> = {
  plaga_enfermedad: "Plaga/Enfermedad", riego_drenaje: "Riego/Drenaje",
  arboles_mal_plantados: "Árboles", dano_mecanico: "Daño Mecánico",
  maleza: "Maleza", fertilizacion: "Fertilización", suelo: "Suelo",
  infraestructura: "Infraestructura", fauna: "Fauna", otro: "Otro",
};
const statusLabels: Record<string, string> = {
  abierta: "Abierta", en_revision: "En revisión", en_progreso: "En progreso",
  resuelta: "Resuelta", descartada: "Descartada",
};

export default function Reports() {
  const [selectedParcelId, setSelectedParcelId] = useState<number | null>(null);
  const [selectedParcelCode, setSelectedParcelCode] = useState("");
  const [isGeneral, setIsGeneral] = useState(false);
  const [periodDays, setPeriodDays] = useState(7);
  const [reportMode, setReportMode] = useState<"compact" | "extended">("compact");
  const [generating, setGenerating] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const toDate = useMemo(() => new Date().toISOString().split("T")[0], []);
  const fromDate = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - periodDays);
    return d.toISOString().split("T")[0];
  }, [periodDays]);

  // Queries
  const { data: parcels } = trpc.parcels.list.useQuery();
  const parcelsWithPolygon = useMemo(() =>
    (parcels || []).filter((p: any) => p.polygon && p.polygon.length > 10), [parcels]);

  // Single parcel data
  const { data: reportData, isLoading } = trpc.reports.getWeeklyData.useQuery(
    { parcelId: selectedParcelId!, parcelCode: selectedParcelCode, fromDate, toDate },
    { enabled: !isGeneral && !!selectedParcelId && !!selectedParcelCode }
  );

  // General data (all parcels)
  const { data: generalData, isLoading: generalLoading } = trpc.reports.getGeneralData.useQuery(
    { fromDate, toDate },
    { enabled: isGeneral }
  );

  // Satellite maps (load separately to avoid huge payloads)
  const { data: ndviMap } = trpc.reports.getSatelliteMap.useQuery(
    { parcelId: selectedParcelId!, indexType: "NDVI" },
    { enabled: !isGeneral && !!selectedParcelId && reportMode === "extended" }
  );
  const { data: ndreMap } = trpc.reports.getSatelliteMap.useQuery(
    { parcelId: selectedParcelId!, indexType: "NDRE" },
    { enabled: !isGeneral && !!selectedParcelId && reportMode === "extended" }
  );
  const { data: ndmiMap } = trpc.reports.getSatelliteMap.useQuery(
    { parcelId: selectedParcelId!, indexType: "NDMI" },
    { enabled: !isGeneral && !!selectedParcelId && reportMode === "extended" }
  );
  const satMaps = { NDVI: ndviMap?.image, NDRE: ndreMap?.image, NDMI: ndmiMap?.image };

  const dataReady = isGeneral ? !!generalData : !!reportData;
  const loading = isGeneral ? generalLoading : isLoading;

  // ── Computed data ──
  const weeklyHarvestTotal = useMemo(() => {
    if (isGeneral) return generalData?.totals?.harvest || 0;
    return (reportData?.dailyHarvest || []).reduce((s: number, d: any) => s + (d.totalWeight || 0), 0);
  }, [reportData, generalData, isGeneral]);

  const weeklyFirstQ = useMemo(() => {
    if (isGeneral) return generalData?.totals?.firstQ || 0;
    return (reportData?.dailyHarvest || []).reduce((s: number, d: any) => s + (d.firstQualityWeight || 0), 0);
  }, [reportData, generalData, isGeneral]);

  const firstQPct = weeklyHarvestTotal > 0 ? ((weeklyFirstQ / weeklyHarvestTotal) * 100).toFixed(1) : "0";

  const weeklyBoxes = useMemo(() => {
    if (isGeneral) return generalData?.totals?.boxes || 0;
    return (reportData?.dailyHarvest || []).reduce((s: number, d: any) => s + (d.totalBoxes || 0), 0);
  }, [reportData, generalData, isGeneral]);

  const weatherSummary = useMemo(() => {
    const wd = isGeneral ? generalData?.weatherData : reportData?.weatherData;
    if (!wd || !Array.isArray(wd) || wd.length === 0) return null;
    const avgMax = (wd as any[]).reduce((s, d) => s + (d.temperatureMax || 0), 0) / wd.length;
    const avgMin = (wd as any[]).reduce((s, d) => s + (d.temperatureMin || 0), 0) / wd.length;
    const totalRain = (wd as any[]).reduce((s, d) => s + (d.precipitation || 0), 0);
    return { avgMax: avgMax.toFixed(1), avgMin: avgMin.toFixed(1), totalRain: totalRain.toFixed(1), days: wd.length };
  }, [reportData, generalData, isGeneral]);

  const getSatelliteTrend = (data: any) => {
    if (!data?.data || !Array.isArray(data.data) || data.data.length < 2) return { trend: "→", label: "Sin datos", color: "#6b7280" };
    const pts = data.data.filter((d: any) => d.mean != null).slice(-4);
    if (pts.length < 2) return { trend: "→", label: "Estable", color: "#f59e0b" };
    const diff = pts[pts.length - 1].mean - pts[0].mean;
    if (diff > 0.03) return { trend: "↑", label: "Mejorando", color: "#10b981" };
    if (diff < -0.03) return { trend: "↓", label: "Deteriorando", color: "#ef4444" };
    return { trend: "→", label: "Estable", color: "#f59e0b" };
  };

  const slaSummary = useMemo(() => {
    if (isGeneral) {
      const t = generalData?.totals;
      return t ? { total: t.notes, resolved: t.notesResolved, open: t.notesOpen, overSla: 0, avgSla: null, catCounts: {} } : null;
    }
    if (!reportData?.fieldNotes) return null;
    const notes = reportData.fieldNotes as any[];
    const resolved = notes.filter(n => n.resolvedAt);
    const open = notes.filter(n => !n.resolvedAt);
    const overSla = open.filter(n => (Date.now() - new Date(n.createdAt).getTime()) / 3600000 > 48);
    const avgSla = resolved.length > 0 ? (resolved.reduce((s, n) => s + (calcSlaHours(n.createdAt, n.resolvedAt) || 0), 0) / resolved.length).toFixed(1) : null;
    const catCounts: Record<string, number> = {};
    notes.forEach(n => { catCounts[n.category] = (catCounts[n.category] || 0) + 1; });
    return { total: notes.length, resolved: resolved.length, open: open.length, overSla: overSla.length, avgSla, catCounts };
  }, [reportData, generalData, isGeneral]);

  const now = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Mexico_City" });

  // ── PDF Generation ──
  async function generatePDF() {
    if (!reportRef.current || !dataReady) return;
    setGenerating(true);
    toast.loading("Generando PDF...", { id: "pdf-gen" });
    try {
      const pages = reportRef.current.querySelectorAll<HTMLElement>(".report-page");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      for (let i = 0; i < pages.length; i++) {
        pages[i].style.display = "block";
        const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: "#ffffff", width: 816, height: 1056 });
        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pdfW, pdfH);
        pages[i].style.display = "none";
      }
      const name = isGeneral ? "General" : (reportData?.parcel?.name || "parcela").replace(/\s+/g, "_");
      pdf.save(`Reporte_${name}_${fromDate}_${toDate}.pdf`);
      toast.success("✅ PDF descargado", { id: "pdf-gen" });
    } catch (err) {
      console.error("PDF error:", err);
      toast.error("Error generando PDF", { id: "pdf-gen" });
    } finally { setGenerating(false); }
  }

  const titleName = isGeneral ? "Todas las Parcelas" : (reportData?.parcel?.name || "...");

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50/50 to-teal-50/30 pb-32">
      <div className="container max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg">
            <FileText className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-green-900">Reportes</h1>
            <p className="text-sm text-green-600">Genera reportes PDF semanales</p>
          </div>
        </div>

        {/* Controls */}
        <GlassCard className="p-4 md:p-5" hover={false}>
          {/* Row 1: Mode toggle + Parcel selector */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1.5 block">Alcance</label>
              <div className="flex gap-2">
                <button onClick={() => { setIsGeneral(false); }} className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${!isGeneral ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg" : "bg-white/60 text-green-700 border border-green-200/50"}`}>
                  <Filter className="h-3.5 w-3.5" /> Por Parcela
                </button>
                <button onClick={() => { setIsGeneral(true); setSelectedParcelId(null); }} className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${isGeneral ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg" : "bg-white/60 text-green-700 border border-green-200/50"}`}>
                  <Globe className="h-3.5 w-3.5" /> General
                </button>
              </div>
            </div>
            {!isGeneral && (
              <div>
                <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1.5 block">Parcela (con polígono)</label>
                <div className="relative">
                  <select value={selectedParcelId || ""} onChange={e => { const id = Number(e.target.value); setSelectedParcelId(id || null); const p = parcelsWithPolygon.find((p: any) => p.id === id); setSelectedParcelCode(p?.code || ""); }}
                    className="w-full rounded-xl border border-green-200/50 bg-white/70 px-4 py-2 text-sm text-green-900 focus:border-green-500 focus:outline-none appearance-none cursor-pointer">
                    <option value="">Selecciona parcela...</option>
                    {parcelsWithPolygon.map((p: any) => (<option key={p.id} value={p.id}>{p.code} — {p.name}</option>))}
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-green-400 pointer-events-none" />
                </div>
              </div>
            )}
          </div>

          {/* Row 2: Period + Mode + Range */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1.5 block">Período</label>
              <div className="flex gap-1.5">
                {[{ days: 7, label: "1 Sem" }, { days: 14, label: "2 Sem" }, { days: 30, label: "1 Mes" }].map(({ days, label }) => (
                  <button key={days} onClick={() => setPeriodDays(days)} className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-all ${periodDays === days ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow" : "bg-white/60 text-green-700 border border-green-200/50"}`}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1.5 block">Tipo</label>
              <div className="flex gap-1.5">
                <button onClick={() => setReportMode("compact")} className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-all ${reportMode === "compact" ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow" : "bg-white/60 text-green-700 border border-green-200/50"}`}>📄 Resumido</button>
                <button onClick={() => setReportMode("extended")} className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-all ${reportMode === "extended" ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow" : "bg-white/60 text-green-700 border border-green-200/50"}`}>📋 Extendido</button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1.5 block">Rango</label>
              <div className="flex items-center gap-2 bg-white/60 rounded-lg border border-green-200/50 px-3 py-2">
                <Calendar className="h-3.5 w-3.5 text-green-500" />
                <span className="text-xs text-green-800">{fmtDate(fromDate)} — {fmtDate(toDate)}</span>
              </div>
            </div>
          </div>

          {/* Generate button */}
          <div className="mt-4 flex justify-center">
            <button onClick={generatePDF} disabled={!dataReady || generating || loading}
              className={`flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold transition-all duration-300 ${dataReady && !generating ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
              {generating ? <><Loader2 className="h-4 w-4 animate-spin" />Generando...</> : loading ? <><Loader2 className="h-4 w-4 animate-spin" />Cargando...</> : <><Download className="h-4 w-4" />Generar Reporte PDF ({reportMode === "compact" ? "1 pág" : "4 págs"})</>}
            </button>
          </div>
        </GlassCard>

        {/* Preview KPIs */}
        {dataReady && (
          <GlassCard className="p-4" hover={false}>
            <h3 className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Vista previa</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <MiniKPI icon={Package} label="Cosecha" value={`${weeklyHarvestTotal.toFixed(1)} kg`} color="from-green-400 to-emerald-500" />
              <MiniKPI icon={TrendingUp} label="1ra Calidad" value={`${firstQPct}%`} color="from-emerald-400 to-green-500" />
              <MiniKPI icon={ClipboardList} label="Notas" value={`${slaSummary?.total || 0}`} color="from-yellow-400 to-orange-500" />
              <MiniKPI icon={CloudSun} label="Lluvia" value={weatherSummary ? `${weatherSummary.totalRain} mm` : "N/D"} color="from-blue-400 to-cyan-500" />
            </div>
          </GlassCard>
        )}

        {!dataReady && !loading && (
          <GlassCard className="p-8 text-center" hover={false}>
            <FileText className="h-14 w-14 mx-auto text-green-200 mb-3" />
            <h3 className="text-base font-semibold text-green-800 mb-1">{isGeneral ? "Listo para generar" : "Selecciona una parcela"}</h3>
            <p className="text-green-600 text-xs">{isGeneral ? "Haz click en Generar para el reporte general" : "Solo se muestran parcelas con polígono"}</p>
          </GlassCard>
        )}
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* HIDDEN PDF PAGES                            */}
      {/* ═══════════════════════════════════════════ */}
      {dataReady && (
        <div ref={reportRef} style={{ position: "absolute", left: "-9999px", top: 0 }}>

          {/* ── COMPACT / PAGE 1: Everything in one page ── */}
          <div className="report-page" style={{ width: 816, height: 1056, background: "#fff", fontFamily: "Helvetica, Arial, sans-serif", display: "none", overflow: "hidden", position: "relative" }}>
            {/* Header */}
            <div style={{ background: "linear-gradient(135deg, #10b981, #059669)", padding: "28px 40px 20px", color: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>🌱 AgraTec</div>
                  <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Reporte {reportMode === "compact" ? "Resumido" : "Semanal"} · {titleName}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, opacity: 0.8 }}>Período</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(fromDate)} — {fmtDate(toDate)}</div>
                </div>
              </div>
            </div>

            {/* KPIs row */}
            <div style={{ padding: "14px 40px 10px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
              <KpiBox label="Cosecha" value={`${weeklyHarvestTotal.toFixed(1)} kg`} color="#10b981" />
              <KpiBox label="1ra Calidad" value={`${firstQPct}%`} color="#059669" />
              <KpiBox label="Cajas" value={`${weeklyBoxes}`} color="#0d9488" />
              <KpiBox label={isGeneral ? "Parcelas" : "Días Activos"} value={isGeneral ? `${generalData?.totals?.parcelsCount || 0}` : `${reportData?.dailyHarvest?.length || 0}`} color="#0891b2" />
            </div>

            {/* Body split: left=harvest, right=satellite+weather+notes */}
            <div style={{ padding: "6px 40px", display: "grid", gridTemplateColumns: isGeneral ? "1fr" : "1fr 1fr", gap: 14 }}>
              {/* Left column */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", marginBottom: 6 }}>📦 Cosecha por Día</div>
                {isGeneral ? (
                  /* General: per-parcel table */
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                    <thead><tr style={{ background: "#065f46", color: "#fff" }}>
                      {["Parcela", "kg", "1ra Cal.", "Cajas", "NDVI", "Notas"].map(h => <th key={h} style={{ padding: "5px 6px", textAlign: "left", fontWeight: 600 }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {(generalData?.parcels || []).map((p: any, i: number) => (
                        <tr key={p.id} style={{ background: i % 2 === 0 ? "#f0fdf4" : "#fff", borderBottom: "1px solid #d1fae5" }}>
                          <td style={{ padding: "4px 6px", fontWeight: 600, color: "#065f46", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</td>
                          <td style={{ padding: "4px 6px", fontWeight: 700 }}>{p.weekTotal}</td>
                          <td style={{ padding: "4px 6px", color: "#059669" }}>{p.weekFirstQ}</td>
                          <td style={{ padding: "4px 6px" }}>{p.weekBoxes}</td>
                          <td style={{ padding: "4px 6px", fontWeight: 600, color: p.ndviAvg && p.ndviAvg > 0.5 ? "#059669" : p.ndviAvg && p.ndviAvg > 0.3 ? "#d97706" : "#ef4444" }}>{p.ndviAvg ? p.ndviAvg.toFixed(3) : "—"}</td>
                          <td style={{ padding: "4px 6px", color: p.notesOpen > 0 ? "#ef4444" : "#059669" }}>{p.notesCount} ({p.notesOpen} abiertas)</td>
                        </tr>
                      ))}
                      <tr style={{ background: "#065f46", color: "#fff", fontWeight: 700 }}>
                        <td style={{ padding: "5px 6px" }}>TOTAL</td>
                        <td style={{ padding: "5px 6px" }}>{generalData?.totals?.harvest}</td>
                        <td style={{ padding: "5px 6px" }}>{generalData?.totals?.firstQ}</td>
                        <td style={{ padding: "5px 6px" }}>{generalData?.totals?.boxes}</td>
                        <td style={{ padding: "5px 6px" }}>—</td>
                        <td style={{ padding: "5px 6px" }}>{generalData?.totals?.notes}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  /* Single parcel: daily table */
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                    <thead><tr style={{ background: "#065f46", color: "#fff" }}>
                      {["Fecha", "Cajas", "Total kg", "1ra Cal.", "2da", "Desp."].map(h => <th key={h} style={{ padding: "5px 6px", textAlign: "left", fontWeight: 600 }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {(reportData?.dailyHarvest || []).map((d: any, i: number) => (
                        <tr key={d.date} style={{ background: i % 2 === 0 ? "#f0fdf4" : "#fff", borderBottom: "1px solid #d1fae5" }}>
                          <td style={{ padding: "4px 6px", fontWeight: 600, color: "#065f46" }}>{fmtDateShort(d.date)}</td>
                          <td style={{ padding: "4px 6px" }}>{d.totalBoxes}</td>
                          <td style={{ padding: "4px 6px", fontWeight: 700 }}>{d.totalWeight}</td>
                          <td style={{ padding: "4px 6px", color: "#059669" }}>{d.firstQualityWeight}</td>
                          <td style={{ padding: "4px 6px", color: "#d97706" }}>{d.secondQualityWeight}</td>
                          <td style={{ padding: "4px 6px", color: "#ef4444" }}>{d.wasteWeight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Right column (single parcel only) */}
              {!isGeneral && (
                <div>
                  {/* Satellite mini */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", marginBottom: 6 }}>🛰️ Índices Satelitales</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, marginBottom: 10 }}>
                    <thead><tr style={{ background: "#065f46", color: "#fff" }}>
                      {["Índice", "Media", "Último", "Tendencia"].map(h => <th key={h} style={{ padding: "4px 6px", textAlign: "left", fontWeight: 600 }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {["NDVI", "NDRE", "NDMI"].map((idx, i) => {
                        const sd = reportData?.satelliteData?.[idx]?.data;
                        const pts = Array.isArray(sd) ? sd.filter((d: any) => d.mean != null) : [];
                        const avg = pts.length > 0 ? (pts.reduce((s: number, d: any) => s + d.mean, 0) / pts.length) : null;
                        const last = pts.length > 0 ? pts[pts.length - 1].mean : null;
                        const t = getSatelliteTrend(reportData?.satelliteData?.[idx]);
                        return (
                          <tr key={idx} style={{ background: i % 2 === 0 ? "#f0fdf4" : "#fff", borderBottom: "1px solid #d1fae5" }}>
                            <td style={{ padding: "4px 6px", fontWeight: 700, color: "#065f46" }}>{idx}</td>
                            <td style={{ padding: "4px 6px" }}>{avg?.toFixed(4) || "—"}</td>
                            <td style={{ padding: "4px 6px", fontWeight: 600 }}>{last?.toFixed(4) || "—"}</td>
                            <td style={{ padding: "4px 6px", fontWeight: 700, color: t.color }}>{t.trend} {t.label}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Notes summary */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", marginBottom: 6 }}>📋 Notas de Campo</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
                    <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "6px 8px", textAlign: "center", border: "1px solid #bbf7d0" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#065f46" }}>{slaSummary?.total || 0}</div>
                      <div style={{ fontSize: 8, color: "#6b7280" }}>Total</div>
                    </div>
                    <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "6px 8px", textAlign: "center", border: "1px solid #bbf7d0" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#059669" }}>{slaSummary?.resolved || 0}</div>
                      <div style={{ fontSize: 8, color: "#6b7280" }}>Resueltas</div>
                    </div>
                    <div style={{ background: slaSummary && slaSummary.overSla > 0 ? "#fef2f2" : "#f0fdf4", borderRadius: 8, padding: "6px 8px", textAlign: "center", border: `1px solid ${slaSummary && slaSummary.overSla > 0 ? "#fecaca" : "#bbf7d0"}` }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: slaSummary && slaSummary.overSla > 0 ? "#ef4444" : "#065f46" }}>{slaSummary?.open || 0}</div>
                      <div style={{ fontSize: 8, color: "#6b7280" }}>Abiertas</div>
                    </div>
                  </div>
                  {slaSummary?.avgSla && <div style={{ fontSize: 9, color: "#374151" }}>⏱️ SLA promedio: <strong>{slaSummary.avgSla}h</strong></div>}
                </div>
              )}
            </div>

            {/* Weather row */}
            {weatherSummary && (
              <div style={{ padding: "8px 40px 6px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", marginBottom: 4 }}>🌤️ Clima</div>
                <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#374151" }}>
                  <span>🌡️ Máx prom: <strong>{weatherSummary.avgMax}°C</strong></span>
                  <span>❄️ Mín prom: <strong>{weatherSummary.avgMin}°C</strong></span>
                  <span>🌧️ Lluvia acum: <strong>{weatherSummary.totalRain} mm</strong></span>
                </div>
              </div>
            )}

            {/* AI Analysis */}
            {(() => {
              const ai = isGeneral ? (generalData as any)?.aiAnalysis : reportData?.aiAnalysis;
              if (!ai) return null;
              return (
                <div style={{ padding: "6px 40px" }}>
                  <div style={{ background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0", padding: "8px 12px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#065f46", marginBottom: 4 }}>🧠 Análisis IA (DeepSeek v4-flash)</div>
                    <div style={{ fontSize: 9, lineHeight: 1.5, color: "#1f2937", whiteSpace: "pre-wrap", maxHeight: reportMode === "compact" ? 130 : 200, overflow: "hidden" }}>
                      {ai.substring(0, reportMode === "compact" ? 700 : 1200)}{ai.length > 700 ? "..." : ""}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Footer */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 40px", background: "#f9fafb", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 8, color: "#9ca3af" }}>AgraTec v2.0 · {now} · Confidencial</span>
              <span style={{ fontSize: 8, color: "#9ca3af" }}>Página 1{reportMode === "extended" ? " de 4" : ""}</span>
            </div>
          </div>

          {/* ── EXTENDED PAGES (2-4) — only rendered when mode=extended ── */}
          {reportMode === "extended" && !isGeneral && reportData && (
            <>
              {/* PAGE 2: Harvest detail + Weather table */}
              <div className="report-page" style={{ width: 816, height: 1056, background: "#fff", fontFamily: "Helvetica, Arial, sans-serif", display: "none", overflow: "hidden", position: "relative" }}>
                <PageHeader title="📦 Cosecha Detallada" parcel={titleName} fromDate={fromDate} toDate={toDate} />
                <div style={{ padding: "16px 40px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead><tr style={{ background: "#065f46", color: "#fff" }}>
                      {["Fecha", "Cajas", "Total (kg)", "1ra Cal. (kg)", "2da Cal. (kg)", "Desp. (kg)"].map(h => <th key={h} style={{ padding: "7px 8px", textAlign: "left", fontWeight: 600 }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {(reportData.dailyHarvest || []).map((d: any, i: number) => (
                        <tr key={d.date} style={{ background: i % 2 === 0 ? "#f0fdf4" : "#fff", borderBottom: "1px solid #d1fae5" }}>
                          <td style={{ padding: "6px 8px", fontWeight: 600, color: "#065f46" }}>{fmtDateShort(d.date)}</td>
                          <td style={{ padding: "6px 8px" }}>{d.totalBoxes}</td>
                          <td style={{ padding: "6px 8px", fontWeight: 700 }}>{d.totalWeight}</td>
                          <td style={{ padding: "6px 8px", color: "#059669" }}>{d.firstQualityWeight}</td>
                          <td style={{ padding: "6px 8px", color: "#d97706" }}>{d.secondQualityWeight}</td>
                          <td style={{ padding: "6px 8px", color: "#ef4444" }}>{d.wasteWeight}</td>
                        </tr>
                      ))}
                      <tr style={{ background: "#065f46", color: "#fff", fontWeight: 700 }}>
                        <td style={{ padding: "7px 8px" }}>TOTAL</td>
                        <td style={{ padding: "7px 8px" }}>{weeklyBoxes}</td>
                        <td style={{ padding: "7px 8px" }}>{weeklyHarvestTotal.toFixed(2)}</td>
                        <td style={{ padding: "7px 8px" }}>{weeklyFirstQ.toFixed(2)}</td>
                        <td style={{ padding: "7px 8px" }}>{(reportData.dailyHarvest || []).reduce((s: number, d: any) => s + (d.secondQualityWeight || 0), 0).toFixed(2)}</td>
                        <td style={{ padding: "7px 8px" }}>{(reportData.dailyHarvest || []).reduce((s: number, d: any) => s + (d.wasteWeight || 0), 0).toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {weatherSummary && (
                  <div style={{ padding: "0 40px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#065f46", marginBottom: 8 }}>🌤️ Clima Diario</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                      <WBox label="Temp. Máx" value={`${weatherSummary.avgMax}°C`} icon="🌡️" />
                      <WBox label="Temp. Mín" value={`${weatherSummary.avgMin}°C`} icon="❄️" />
                      <WBox label="Lluvia" value={`${weatherSummary.totalRain} mm`} icon="🌧️" />
                      <WBox label="Días" value={`${weatherSummary.days}`} icon="📅" />
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                      <thead><tr style={{ background: "#1e40af", color: "#fff" }}>
                        {["Fecha", "Máx °C", "Mín °C", "Lluvia mm"].map(h => <th key={h} style={{ padding: "5px 6px", textAlign: "left", fontWeight: 600 }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {(reportData.weatherData as any[] || []).map((w: any, i: number) => (
                          <tr key={w.date} style={{ background: i % 2 === 0 ? "#eff6ff" : "#fff", borderBottom: "1px solid #dbeafe" }}>
                            <td style={{ padding: "4px 6px" }}>{fmtDateShort(w.date)}</td>
                            <td style={{ padding: "4px 6px", color: "#dc2626", fontWeight: 600 }}>{w.temperatureMax?.toFixed(1)}</td>
                            <td style={{ padding: "4px 6px", color: "#2563eb", fontWeight: 600 }}>{w.temperatureMin?.toFixed(1)}</td>
                            <td style={{ padding: "4px 6px" }}>{(w.precipitation || 0).toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <PageFooter now={now} page={2} total={4} />
              </div>

              {/* PAGE 3: Satellite with maps */}
              <div className="report-page" style={{ width: 816, height: 1056, background: "#fff", fontFamily: "Helvetica, Arial, sans-serif", display: "none", overflow: "hidden", position: "relative" }}>
                <PageHeader title="🛰️ Telemetría Satelital" parcel={titleName} fromDate={fromDate} toDate={toDate} />
                <div style={{ padding: "16px 40px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                  {(["NDVI", "NDRE", "NDMI"] as const).map(idx => {
                    const img = satMaps[idx];
                    const t = getSatelliteTrend(reportData.satelliteData?.[idx]);
                    return (
                      <div key={idx} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#065f46", marginBottom: 6 }}>{idx}</div>
                        {img ? <img src={img} alt={idx} style={{ width: "100%", height: 170, objectFit: "contain", borderRadius: 8, border: "1px solid #d1fae5", background: "#f0fdf4" }} crossOrigin="anonymous" />
                          : <div style={{ width: "100%", height: 170, borderRadius: 8, background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 10 }}>Sin imagen</div>}
                        <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: t.color }}>{t.trend} {t.label}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ padding: "0 40px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead><tr style={{ background: "#065f46", color: "#fff" }}>
                      {["Índice", "Media", "Mín", "Máx", "Último", "Tendencia"].map(h => <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {["NDVI", "NDRE", "NDMI"].map((idx, i) => {
                        const pts = (reportData.satelliteData?.[idx]?.data || []).filter((d: any) => d.mean != null);
                        const means = pts.map((d: any) => d.mean);
                        const avg = means.length ? means.reduce((a: number, b: number) => a + b, 0) / means.length : null;
                        const t = getSatelliteTrend(reportData.satelliteData?.[idx]);
                        return (
                          <tr key={idx} style={{ background: i % 2 === 0 ? "#f0fdf4" : "#fff", borderBottom: "1px solid #d1fae5" }}>
                            <td style={{ padding: "6px 8px", fontWeight: 700, color: "#065f46" }}>{idx}</td>
                            <td style={{ padding: "6px 8px" }}>{avg?.toFixed(4) || "—"}</td>
                            <td style={{ padding: "6px 8px" }}>{means.length ? Math.min(...means).toFixed(4) : "—"}</td>
                            <td style={{ padding: "6px 8px" }}>{means.length ? Math.max(...means).toFixed(4) : "—"}</td>
                            <td style={{ padding: "6px 8px", fontWeight: 600 }}>{means.length ? means[means.length - 1].toFixed(4) : "—"}</td>
                            <td style={{ padding: "6px 8px", fontWeight: 700, color: t.color }}>{t.trend} {t.label}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {reportData.aiAnalysis && (
                  <div style={{ padding: "14px 40px" }}>
                    <div style={{ background: "#f0fdf4", borderRadius: 10, border: "1px solid #bbf7d0", padding: "12px 16px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", marginBottom: 6 }}>🧠 Análisis IA (DeepSeek v4-flash)</div>
                      <div style={{ fontSize: 9, lineHeight: 1.5, color: "#1f2937", whiteSpace: "pre-wrap", maxHeight: 280, overflow: "hidden" }}>
                        {reportData.aiAnalysis.substring(0, 1500)}
                      </div>
                    </div>
                  </div>
                )}
                <PageFooter now={now} page={3} total={4} />
              </div>

              {/* PAGE 4: Field Notes + SLA */}
              <div className="report-page" style={{ width: 816, height: 1056, background: "#fff", fontFamily: "Helvetica, Arial, sans-serif", display: "none", overflow: "hidden", position: "relative" }}>
                <PageHeader title="📋 Notas de Campo & SLA" parcel={titleName} fromDate={fromDate} toDate={toDate} />
                <div style={{ padding: "14px 40px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                  <KpiBox label="Total" value={`${slaSummary?.total || 0}`} color="#f59e0b" />
                  <KpiBox label="Resueltas" value={`${slaSummary?.resolved || 0}`} color="#10b981" />
                  <KpiBox label="Abiertas" value={`${slaSummary?.open || 0}`} color="#ef4444" />
                  <KpiBox label="SLA Prom" value={slaSummary?.avgSla ? `${slaSummary.avgSla}h` : "N/A"} color="#8b5cf6" />
                </div>
                {slaSummary && slaSummary.overSla > 0 && (
                  <div style={{ padding: "0 40px 8px" }}>
                    <div style={{ background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca", padding: "8px 12px", fontSize: 10, color: "#991b1b" }}>
                      ⚠️ <strong>{slaSummary.overSla} notas</strong> exceden SLA de 48 horas
                    </div>
                  </div>
                )}
                <div style={{ padding: "0 40px" }}>
                  {reportData.fieldNotes && reportData.fieldNotes.length > 0 ? (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                      <thead><tr style={{ background: "#065f46", color: "#fff" }}>
                        {["Folio", "Categoría", "Prioridad", "Estado", "Fecha", "SLA", "Descripción"].map(h => <th key={h} style={{ padding: "5px 6px", textAlign: "left", fontWeight: 600 }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {(reportData.fieldNotes as any[]).slice(0, 20).map((n: any, i: number) => {
                          const sla = calcSlaHours(n.createdAt, n.resolvedAt);
                          const over = !n.resolvedAt && (Date.now() - new Date(n.createdAt).getTime()) / 3600000 > 48;
                          return (
                            <tr key={n.id} style={{ background: over ? "#fef2f2" : i % 2 === 0 ? "#f0fdf4" : "#fff", borderBottom: "1px solid #d1fae5" }}>
                              <td style={{ padding: "4px 6px", fontWeight: 600, color: "#065f46", fontSize: 8 }}>{n.folio}</td>
                              <td style={{ padding: "4px 6px" }}>{catLabels[n.category] || n.category}</td>
                              <td style={{ padding: "4px 6px" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: sevColors[n.severity] || "#6b7280", display: "inline-block", marginRight: 3 }}></span>{sevLabels[n.severity] || n.severity}</td>
                              <td style={{ padding: "4px 6px", fontWeight: 600, color: n.status === "resuelta" ? "#059669" : "#ef4444" }}>{statusLabels[n.status] || n.status}</td>
                              <td style={{ padding: "4px 6px", fontSize: 8 }}>{fmtDateShort(n.createdAt)}</td>
                              <td style={{ padding: "4px 6px", fontWeight: 600, color: over ? "#ef4444" : sla != null ? "#059669" : "#9ca3af" }}>{sla != null ? `${sla}h` : over ? "⚠️" : "—"}</td>
                              <td style={{ padding: "4px 6px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.description?.substring(0, 50)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 11, padding: 20 }}>Sin notas en este período</div>}
                </div>
                {slaSummary && Object.keys(slaSummary.catCounts).length > 0 && (
                  <div style={{ padding: "12px 40px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", marginBottom: 6 }}>📊 Por Categoría</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {Object.entries(slaSummary.catCounts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                        <div key={cat} style={{ background: "#f0fdf4", borderRadius: 6, padding: "5px 10px", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#065f46" }}>{count}</span>
                          <span style={{ fontSize: 8, color: "#374151" }}>{catLabels[cat] || cat}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <PageFooter now={now} page={4} total={4} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Reusable PDF sub-components ──
function KpiBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", padding: "10px 12px", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
      <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}
function WBox({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div style={{ background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe", padding: "8px", textAlign: "center" }}>
      <div style={{ fontSize: 16 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#1e40af" }}>{value}</div>
      <div style={{ fontSize: 8, color: "#6b7280" }}>{label}</div>
    </div>
  );
}
function PageHeader({ title, parcel, fromDate, toDate }: { title: string; parcel: string; fromDate: string; toDate: string }) {
  return (
    <div style={{ background: "linear-gradient(135deg, #10b981, #059669)", padding: "16px 40px", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
      <span style={{ fontSize: 10, opacity: 0.8 }}>{parcel} · {fmtDate(fromDate)} — {fmtDate(toDate)}</span>
    </div>
  );
}
function PageFooter({ now, page, total }: { now: string; page: number; total: number }) {
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 40px", background: "#f9fafb", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
      <span style={{ fontSize: 8, color: "#9ca3af" }}>AgraTec v2.0 · {now} · Confidencial</span>
      <span style={{ fontSize: 8, color: "#9ca3af" }}>Página {page} de {total}</span>
    </div>
  );
}
function MiniKPI({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-white/50 rounded-xl border border-green-100/30 p-2.5">
      <div className="flex items-center gap-1.5 mb-0.5">
        <div className={`flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br ${color} shadow-sm`}>
          <Icon className="h-3 w-3 text-white" />
        </div>
        <span className="text-[9px] text-green-600">{label}</span>
      </div>
      <div className="text-base font-bold text-green-900">{value}</div>
    </div>
  );
}
