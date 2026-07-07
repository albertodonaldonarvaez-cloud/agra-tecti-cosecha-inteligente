import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import { toast } from "sonner";
import {
  FileText, Download, Calendar, Package, TrendingUp, Satellite,
  ClipboardList, CloudSun, Brain, ChevronDown, Loader2, Leaf,
  BarChart3, Droplets, AlertTriangle, CheckCircle, Clock, X
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ── Helper: format date for display ──
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

// ── SLA calculation ──
function calcSlaHours(created: string | Date, resolved: string | Date | null): number | null {
  if (!resolved) return null;
  const c = new Date(created).getTime();
  const r = new Date(resolved).getTime();
  return Math.round((r - c) / (1000 * 60 * 60) * 10) / 10;
}

// ── Severity & category labels ──
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

// ── Weather condition icons ──
const weatherIcons: Record<string, string> = {
  sunny: "☀️", cloudy: "☁️", rainy: "🌧️", stormy: "⛈️", clear: "🌙",
};

export default function Reports() {
  const [selectedParcelId, setSelectedParcelId] = useState<number | null>(null);
  const [selectedParcelCode, setSelectedParcelCode] = useState("");
  const [periodDays, setPeriodDays] = useState(7);
  const [generating, setGenerating] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // Dates
  const toDate = useMemo(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  }, []);
  const fromDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - periodDays);
    return d.toISOString().split("T")[0];
  }, [periodDays]);

  // Queries
  const { data: parcels } = trpc.parcels.list.useQuery();
  const { data: reportData, isLoading, isFetching } = trpc.reports.getWeeklyData.useQuery(
    { parcelId: selectedParcelId!, parcelCode: selectedParcelCode, fromDate, toDate },
    { enabled: !!selectedParcelId && !!selectedParcelCode }
  );

  // ── PDF Generation ──
  async function generatePDF() {
    if (!reportRef.current || !reportData) return;
    setGenerating(true);
    toast.loading("Generando PDF...", { id: "pdf-gen" });

    try {
      const pages = reportRef.current.querySelectorAll<HTMLElement>(".report-page");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        page.style.display = "block";
        const canvas = await html2canvas(page, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          width: 816,   // letter width in px at 96dpi
          height: 1056, // letter height in px at 96dpi
        });
        const imgData = canvas.toDataURL("image/jpeg", 0.92);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, 0, pdfW, pdfH);
        page.style.display = "none";
      }

      const parcelName = reportData.parcel?.name || "parcela";
      pdf.save(`Reporte_${parcelName.replace(/\s+/g, "_")}_${fromDate}_${toDate}.pdf`);
      toast.success("✅ PDF descargado", { id: "pdf-gen" });
    } catch (err) {
      console.error("PDF error:", err);
      toast.error("Error generando PDF", { id: "pdf-gen" });
    } finally {
      setGenerating(false);
    }
  }

  // ── Computed data ──
  const weeklyHarvestTotal = useMemo(() => {
    if (!reportData?.dailyHarvest) return 0;
    return reportData.dailyHarvest.reduce((sum: number, d: any) => sum + (d.totalWeight || 0), 0);
  }, [reportData]);

  const weeklyFirstQ = useMemo(() => {
    if (!reportData?.dailyHarvest) return 0;
    return reportData.dailyHarvest.reduce((sum: number, d: any) => sum + (d.firstQualityWeight || 0), 0);
  }, [reportData]);

  const firstQPct = weeklyHarvestTotal > 0 ? ((weeklyFirstQ / weeklyHarvestTotal) * 100).toFixed(1) : "0";

  const weeklyBoxes = useMemo(() => {
    if (!reportData?.dailyHarvest) return 0;
    return reportData.dailyHarvest.reduce((sum: number, d: any) => sum + (d.totalBoxes || 0), 0);
  }, [reportData]);

  // Weather averages
  const weatherSummary = useMemo(() => {
    if (!reportData?.weatherData || !Array.isArray(reportData.weatherData) || reportData.weatherData.length === 0) return null;
    const wd = reportData.weatherData as any[];
    const avgMax = wd.reduce((s, d) => s + (d.temperatureMax || 0), 0) / wd.length;
    const avgMin = wd.reduce((s, d) => s + (d.temperatureMin || 0), 0) / wd.length;
    const totalRain = wd.reduce((s, d) => s + (d.precipitation || 0), 0);
    return { avgMax: avgMax.toFixed(1), avgMin: avgMin.toFixed(1), totalRain: totalRain.toFixed(1), days: wd.length };
  }, [reportData]);

  // Satellite trends
  const getSatelliteTrend = (data: any) => {
    if (!data?.data || !Array.isArray(data.data) || data.data.length < 2) return { trend: "→", label: "Sin datos" };
    const pts = data.data.filter((d: any) => d.mean != null).slice(-4);
    if (pts.length < 2) return { trend: "→", label: "Estable" };
    const first = pts[0].mean;
    const last = pts[pts.length - 1].mean;
    const diff = last - first;
    if (diff > 0.03) return { trend: "↑", label: "Mejorando", color: "#10b981" };
    if (diff < -0.03) return { trend: "↓", label: "Deteriorando", color: "#ef4444" };
    return { trend: "→", label: "Estable", color: "#f59e0b" };
  };

  // SLA stats
  const slaSummary = useMemo(() => {
    if (!reportData?.fieldNotes) return null;
    const notes = reportData.fieldNotes as any[];
    const resolved = notes.filter(n => n.resolvedAt);
    const open = notes.filter(n => n.status === "abierta" || n.status === "en_progreso" || n.status === "en_revision");
    const overSla = open.filter(n => {
      const hrs = (Date.now() - new Date(n.createdAt).getTime()) / (1000 * 60 * 60);
      return hrs > 48;
    });
    const avgSla = resolved.length > 0
      ? (resolved.reduce((s, n) => s + (calcSlaHours(n.createdAt, n.resolvedAt) || 0), 0) / resolved.length).toFixed(1)
      : null;
    const catCounts: Record<string, number> = {};
    notes.forEach(n => { catCounts[n.category] = (catCounts[n.category] || 0) + 1; });
    return { total: notes.length, resolved: resolved.length, open: open.length, overSla: overSla.length, avgSla, catCounts };
  }, [reportData]);

  const now = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Mexico_City" });

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50/50 to-teal-50/30 pb-32">
      <div className="container max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg">
            <FileText className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-green-900">Reportes</h1>
            <p className="text-sm text-green-600">Genera reportes PDF semanales con datos de cosecha, satélite, clima y notas de campo</p>
          </div>
        </div>

        {/* Controls */}
        <GlassCard className="p-5" hover={false}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Parcel selector */}
            <div>
              <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1.5 block">Parcela</label>
              <div className="relative">
                <select
                  value={selectedParcelId || ""}
                  onChange={e => {
                    const id = Number(e.target.value);
                    setSelectedParcelId(id || null);
                    const p = parcels?.find((p: any) => p.id === id);
                    setSelectedParcelCode(p?.code || "");
                  }}
                  className="w-full rounded-xl border border-green-200/50 bg-white/70 px-4 py-2.5 text-sm text-green-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200 appearance-none cursor-pointer"
                >
                  <option value="">Selecciona una parcela...</option>
                  {parcels?.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-green-400 pointer-events-none" />
              </div>
            </div>

            {/* Period selector */}
            <div>
              <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1.5 block">Período</label>
              <div className="flex gap-2">
                {[
                  { days: 7, label: "1 Sem" },
                  { days: 14, label: "2 Sem" },
                  { days: 30, label: "1 Mes" },
                ].map(({ days, label }) => (
                  <button
                    key={days}
                    onClick={() => setPeriodDays(days)}
                    className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                      periodDays === days
                        ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-200"
                        : "bg-white/60 text-green-700 border border-green-200/50 hover:bg-green-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range display */}
            <div>
              <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1.5 block">Rango</label>
              <div className="flex items-center gap-2 bg-white/60 rounded-xl border border-green-200/50 px-4 py-2.5">
                <Calendar className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-800">{fmtDate(fromDate)} — {fmtDate(toDate)}</span>
              </div>
            </div>
          </div>

          {/* Generate button */}
          <div className="mt-5 flex justify-center">
            <button
              onClick={generatePDF}
              disabled={!reportData || generating || isLoading}
              className={`flex items-center gap-2.5 rounded-2xl px-8 py-3.5 text-base font-semibold transition-all duration-300 ${
                reportData && !generating
                  ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-xl shadow-green-200/50 hover:shadow-2xl hover:scale-105 active:scale-95"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              {generating ? (
                <><Loader2 className="h-5 w-5 animate-spin" />Generando PDF...</>
              ) : isLoading || isFetching ? (
                <><Loader2 className="h-5 w-5 animate-spin" />Cargando datos...</>
              ) : (
                <><Download className="h-5 w-5" />Generar Reporte PDF</>
              )}
            </button>
          </div>
        </GlassCard>

        {/* Preview */}
        {reportData && (
          <GlassCard className="p-5" hover={false}>
            <h3 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" /> Vista previa del reporte
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <PreviewKPI icon={Package} label="Cosecha semanal" value={`${weeklyHarvestTotal.toFixed(1)} kg`} color="from-green-400 to-emerald-500" />
              <PreviewKPI icon={TrendingUp} label="1ra Calidad" value={`${firstQPct}%`} color="from-emerald-400 to-green-500" />
              <PreviewKPI icon={ClipboardList} label="Notas de campo" value={`${slaSummary?.total || 0}`} color="from-yellow-400 to-orange-500" />
              <PreviewKPI icon={CloudSun} label="Lluvia acum." value={weatherSummary ? `${weatherSummary.totalRain} mm` : "N/D"} color="from-blue-400 to-cyan-500" />
            </div>
            {slaSummary && slaSummary.overSla > 0 && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200/50 rounded-xl px-4 py-2 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4" />
                <span><strong>{slaSummary.overSla}</strong> notas exceden SLA (>48h sin resolver)</span>
              </div>
            )}
          </GlassCard>
        )}

        {!selectedParcelId && (
          <GlassCard className="p-10 text-center" hover={false}>
            <FileText className="h-16 w-16 mx-auto text-green-200 mb-4" />
            <h3 className="text-lg font-semibold text-green-800 mb-2">Selecciona una parcela</h3>
            <p className="text-green-600 text-sm">Elige una parcela y un período para generar tu reporte semanal en PDF</p>
          </GlassCard>
        )}
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* HIDDEN PDF TEMPLATE — rendered off-screen       */}
      {/* ═══════════════════════════════════════════════ */}
      {reportData && (
        <div ref={reportRef} style={{ position: "absolute", left: "-9999px", top: 0 }}>

          {/* ── PAGE 1: Cover + Executive Summary ── */}
          <div className="report-page" style={{ width: 816, height: 1056, background: "#fff", fontFamily: "Helvetica, Arial, sans-serif", display: "none", overflow: "hidden" }}>
            {/* Header gradient */}
            <div style={{ background: "linear-gradient(135deg, #10b981, #059669)", padding: "40px 48px 32px", color: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>🌱 AgraTec</div>
                  <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>Reporte Semanal de Campo</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Período</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtDate(fromDate)} — {fmtDate(toDate)}</div>
                </div>
              </div>
            </div>
            {/* Parcel info bar */}
            <div style={{ background: "#ecfdf5", padding: "16px 48px", borderBottom: "1px solid #d1fae5", display: "flex", gap: 32 }}>
              <div><span style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase" }}>Parcela</span><br/><span style={{ fontSize: 16, fontWeight: 700, color: "#065f46" }}>{reportData.parcel?.name || "—"}</span></div>
              <div><span style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase" }}>Código</span><br/><span style={{ fontSize: 14, fontWeight: 600, color: "#065f46" }}>{reportData.parcel?.code || "—"}</span></div>
              {reportData.parcel?.crop && <div><span style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase" }}>Cultivo</span><br/><span style={{ fontSize: 14, fontWeight: 600, color: "#065f46" }}>{reportData.parcel.crop} {reportData.parcel.variety ? `(${reportData.parcel.variety})` : ""}</span></div>}
              {reportData.parcel?.hectares && <div><span style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase" }}>Hectáreas</span><br/><span style={{ fontSize: 14, fontWeight: 600, color: "#065f46" }}>{reportData.parcel.hectares} ha</span></div>}
            </div>

            {/* KPIs */}
            <div style={{ padding: "24px 48px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
              <KpiCard label="Cosecha Semanal" value={`${weeklyHarvestTotal.toFixed(1)} kg`} color="#10b981" icon="📦" />
              <KpiCard label="1ra Calidad" value={`${firstQPct}%`} color="#059669" icon="⭐" />
              <KpiCard label="Cajas" value={`${weeklyBoxes}`} color="#0d9488" icon="📊" />
              <KpiCard label="Días Activos" value={`${reportData.dailyHarvest?.length || 0}`} color="#0891b2" icon="📅" />
            </div>

            {/* AI Analysis summary */}
            {reportData.aiAnalysis && (
              <div style={{ padding: "0 48px 24px" }}>
                <div style={{ background: "#f0fdf4", borderRadius: 12, border: "1px solid #bbf7d0", padding: "16px 20px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#065f46", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>🧠 Análisis IA</div>
                  <div style={{ fontSize: 11, lineHeight: 1.6, color: "#1f2937", whiteSpace: "pre-wrap", maxHeight: 320, overflow: "hidden" }}>
                    {reportData.aiAnalysis.substring(0, 1200)}{reportData.aiAnalysis.length > 1200 ? "..." : ""}
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 48px", background: "#f9fafb", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 9, color: "#9ca3af" }}>Reporte generado por AgraTec v2.0 · {now} · Confidencial</span>
              <span style={{ fontSize: 9, color: "#9ca3af" }}>Página 1 de 4</span>
            </div>
          </div>

          {/* ── PAGE 2: Harvest + Weather ── */}
          <div className="report-page" style={{ width: 816, height: 1056, background: "#fff", fontFamily: "Helvetica, Arial, sans-serif", display: "none", overflow: "hidden", position: "relative" }}>
            <div style={{ background: "linear-gradient(135deg, #10b981, #059669)", padding: "20px 48px", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>📦 Cosecha y Clima</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{reportData.parcel?.name} · {fmtDate(fromDate)} — {fmtDate(toDate)}</span>
            </div>

            {/* Daily harvest table */}
            <div style={{ padding: "20px 48px 16px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#065f46", marginBottom: 10 }}>📋 Detalle de Cosecha por Día</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#065f46", color: "#fff" }}>
                    {["Fecha", "Cajas", "Total (kg)", "1ra Cal. (kg)", "2da Cal. (kg)", "Desp. (kg)"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(reportData.dailyHarvest || []).map((d: any, i: number) => (
                    <tr key={d.date} style={{ background: i % 2 === 0 ? "#f0fdf4" : "#fff", borderBottom: "1px solid #d1fae5" }}>
                      <td style={{ padding: "7px 10px", fontWeight: 600, color: "#065f46" }}>{fmtDateShort(d.date)}</td>
                      <td style={{ padding: "7px 10px", color: "#374151" }}>{d.totalBoxes}</td>
                      <td style={{ padding: "7px 10px", fontWeight: 700, color: "#065f46" }}>{d.totalWeight}</td>
                      <td style={{ padding: "7px 10px", color: "#059669" }}>{d.firstQualityWeight}</td>
                      <td style={{ padding: "7px 10px", color: "#d97706" }}>{d.secondQualityWeight}</td>
                      <td style={{ padding: "7px 10px", color: "#ef4444" }}>{d.wasteWeight}</td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr style={{ background: "#065f46", color: "#fff", fontWeight: 700 }}>
                    <td style={{ padding: "8px 10px" }}>TOTAL</td>
                    <td style={{ padding: "8px 10px" }}>{weeklyBoxes}</td>
                    <td style={{ padding: "8px 10px" }}>{weeklyHarvestTotal.toFixed(2)}</td>
                    <td style={{ padding: "8px 10px" }}>{weeklyFirstQ.toFixed(2)}</td>
                    <td style={{ padding: "8px 10px" }}>{(reportData.dailyHarvest || []).reduce((s: number, d: any) => s + (d.secondQualityWeight || 0), 0).toFixed(2)}</td>
                    <td style={{ padding: "8px 10px" }}>{(reportData.dailyHarvest || []).reduce((s: number, d: any) => s + (d.wasteWeight || 0), 0).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Harvest bar chart (canvas-drawn) */}
            <div style={{ padding: "0 48px 16px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#065f46", marginBottom: 10 }}>📊 Cosecha Diaria (kg)</div>
              <HarvestBarChart data={reportData.dailyHarvest || []} />
            </div>

            {/* Weather summary */}
            <div style={{ padding: "0 48px 24px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#065f46", marginBottom: 10 }}>🌤️ Resumen Climático</div>
              {weatherSummary ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                  <WeatherCard label="Temp. Máx Prom" value={`${weatherSummary.avgMax}°C`} icon="🌡️" />
                  <WeatherCard label="Temp. Mín Prom" value={`${weatherSummary.avgMin}°C`} icon="❄️" />
                  <WeatherCard label="Lluvia Acumulada" value={`${weatherSummary.totalRain} mm`} icon="🌧️" />
                  <WeatherCard label="Días con datos" value={`${weatherSummary.days}`} icon="📅" />
                </div>
              ) : (
                <div style={{ background: "#f9fafb", borderRadius: 10, padding: "16px", textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
                  Sin datos climáticos disponibles. Configura la ubicación en Ajustes.
                </div>
              )}
              {/* Weather table */}
              {reportData.weatherData && Array.isArray(reportData.weatherData) && reportData.weatherData.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginTop: 12 }}>
                  <thead>
                    <tr style={{ background: "#1e40af", color: "#fff" }}>
                      {["Fecha", "Máx °C", "Mín °C", "Lluvia mm", "Condición"].map(h => (
                        <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(reportData.weatherData as any[]).map((w: any, i: number) => (
                      <tr key={w.date} style={{ background: i % 2 === 0 ? "#eff6ff" : "#fff", borderBottom: "1px solid #dbeafe" }}>
                        <td style={{ padding: "5px 8px", color: "#1e3a5f" }}>{fmtDateShort(w.date)}</td>
                        <td style={{ padding: "5px 8px", color: "#dc2626", fontWeight: 600 }}>{w.temperatureMax?.toFixed(1)}</td>
                        <td style={{ padding: "5px 8px", color: "#2563eb", fontWeight: 600 }}>{w.temperatureMin?.toFixed(1)}</td>
                        <td style={{ padding: "5px 8px" }}>{(w.precipitation || 0).toFixed(1)}</td>
                        <td style={{ padding: "5px 8px" }}>{weatherIcons[w.condition] || ""} {w.conditionText || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 48px", background: "#f9fafb", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 9, color: "#9ca3af" }}>Reporte generado por AgraTec v2.0 · {now} · Confidencial</span>
              <span style={{ fontSize: 9, color: "#9ca3af" }}>Página 2 de 4</span>
            </div>
          </div>

          {/* ── PAGE 3: Satellite ── */}
          <div className="report-page" style={{ width: 816, height: 1056, background: "#fff", fontFamily: "Helvetica, Arial, sans-serif", display: "none", overflow: "hidden", position: "relative" }}>
            <div style={{ background: "linear-gradient(135deg, #10b981, #059669)", padding: "20px 48px", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>🛰️ Telemetría Satelital</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{reportData.parcel?.name} · {fmtDate(fromDate)} — {fmtDate(toDate)}</span>
            </div>

            {/* Satellite maps */}
            <div style={{ padding: "20px 48px 16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                {["NDVI", "NDRE", "NDMI"].map(idx => {
                  const mapImg = reportData.satelliteMaps?.[idx];
                  const trend = getSatelliteTrend(reportData.satelliteData?.[idx]);
                  return (
                    <div key={idx} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#065f46", marginBottom: 8 }}>{idx}</div>
                      {mapImg ? (
                        <img src={mapImg} alt={idx} style={{ width: "100%", height: 180, objectFit: "contain", borderRadius: 8, border: "1px solid #d1fae5", background: "#f0fdf4" }} />
                      ) : (
                        <div style={{ width: "100%", height: 180, borderRadius: 8, background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 11, border: "1px solid #e5e7eb" }}>
                          Sin imagen disponible
                        </div>
                      )}
                      <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: trend.color || "#6b7280" }}>
                        {trend.trend} {trend.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Satellite stats table */}
            <div style={{ padding: "0 48px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#065f46", marginBottom: 10 }}>📊 Promedios de Índices Espectrales</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#065f46", color: "#fff" }}>
                    {["Índice", "Media", "Mínimo", "Máximo", "Desv. Est.", "Último Valor", "Tendencia"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {["NDVI", "NDRE", "NDMI"].map((idx, i) => {
                    const satData = reportData.satelliteData?.[idx]?.data;
                    const pts = Array.isArray(satData) ? satData.filter((d: any) => d.mean != null) : [];
                    const means = pts.map((d: any) => d.mean);
                    const avg = means.length > 0 ? (means.reduce((a: number, b: number) => a + b, 0) / means.length) : null;
                    const min = means.length > 0 ? Math.min(...means) : null;
                    const max = means.length > 0 ? Math.max(...means) : null;
                    const stds = pts.map((d: any) => d.stDev).filter((s: any) => s != null);
                    const avgStd = stds.length > 0 ? (stds.reduce((a: number, b: number) => a + b, 0) / stds.length) : null;
                    const last = means.length > 0 ? means[means.length - 1] : null;
                    const trend = getSatelliteTrend(reportData.satelliteData?.[idx]);

                    return (
                      <tr key={idx} style={{ background: i % 2 === 0 ? "#f0fdf4" : "#fff", borderBottom: "1px solid #d1fae5" }}>
                        <td style={{ padding: "7px 10px", fontWeight: 700, color: "#065f46" }}>{idx}</td>
                        <td style={{ padding: "7px 10px" }}>{avg !== null ? avg.toFixed(4) : "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{min !== null ? min.toFixed(4) : "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{max !== null ? max.toFixed(4) : "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{avgStd !== null ? avgStd.toFixed(4) : "—"}</td>
                        <td style={{ padding: "7px 10px", fontWeight: 600 }}>{last !== null ? last.toFixed(4) : "—"}</td>
                        <td style={{ padding: "7px 10px", fontWeight: 700, color: trend.color || "#6b7280" }}>{trend.trend} {trend.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* NDVI Legend */}
            <div style={{ padding: "0 48px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Escala de referencia NDVI</div>
              <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", height: 20 }}>
                {[
                  { color: "#d73027", label: "< 0.2" },
                  { color: "#fc8d59", label: "0.2-0.3" },
                  { color: "#fee08b", label: "0.3-0.4" },
                  { color: "#d9ef8b", label: "0.4-0.5" },
                  { color: "#91cf60", label: "0.5-0.6" },
                  { color: "#1a9850", label: "0.6-0.8" },
                  { color: "#006837", label: "> 0.8" },
                ].map(({ color, label }) => (
                  <div key={label} style={{ flex: 1, background: color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 8, color: "#fff", fontWeight: 600, textShadow: "0 0 2px rgba(0,0,0,0.5)" }}>{label}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#6b7280", marginTop: 4 }}>
                <span>Suelo desnudo / Estrés</span>
                <span>Vegetación sana y densa</span>
              </div>
            </div>

            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 48px", background: "#f9fafb", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 9, color: "#9ca3af" }}>Reporte generado por AgraTec v2.0 · {now} · Confidencial</span>
              <span style={{ fontSize: 9, color: "#9ca3af" }}>Página 3 de 4</span>
            </div>
          </div>

          {/* ── PAGE 4: Field Notes + SLA ── */}
          <div className="report-page" style={{ width: 816, height: 1056, background: "#fff", fontFamily: "Helvetica, Arial, sans-serif", display: "none", overflow: "hidden", position: "relative" }}>
            <div style={{ background: "linear-gradient(135deg, #10b981, #059669)", padding: "20px 48px", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>📋 Notas de Campo & SLA</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{reportData.parcel?.name} · {fmtDate(fromDate)} — {fmtDate(toDate)}</span>
            </div>

            {/* SLA summary cards */}
            <div style={{ padding: "20px 48px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <KpiCard label="Total Notas" value={`${slaSummary?.total || 0}`} color="#f59e0b" icon="📝" />
              <KpiCard label="Resueltas" value={`${slaSummary?.resolved || 0}`} color="#10b981" icon="✅" />
              <KpiCard label="Abiertas" value={`${slaSummary?.open || 0}`} color="#ef4444" icon="🔴" />
              <KpiCard label="SLA Promedio" value={slaSummary?.avgSla ? `${slaSummary.avgSla}h` : "N/A"} color="#8b5cf6" icon="⏱️" />
            </div>

            {/* SLA breach alert */}
            {slaSummary && slaSummary.overSla > 0 && (
              <div style={{ padding: "0 48px 12px" }}>
                <div style={{ background: "#fef2f2", borderRadius: 10, border: "1px solid #fecaca", padding: "10px 16px", fontSize: 12, color: "#991b1b", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>⚠️</span>
                  <span><strong>{slaSummary.overSla} notas</strong> exceden el SLA de 48 horas sin resolver</span>
                </div>
              </div>
            )}

            {/* Notes table */}
            <div style={{ padding: "0 48px 16px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#065f46", marginBottom: 10 }}>📋 Detalle de Notas</div>
              {reportData.fieldNotes && reportData.fieldNotes.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                  <thead>
                    <tr style={{ background: "#065f46", color: "#fff" }}>
                      {["Folio", "Categoría", "Prioridad", "Estado", "Fecha", "SLA (hrs)", "Descripción"].map(h => (
                        <th key={h} style={{ padding: "7px 8px", textAlign: "left", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.fieldNotes.slice(0, 15).map((n: any, i: number) => {
                      const slaHrs = calcSlaHours(n.createdAt, n.resolvedAt);
                      const isOverSla = !n.resolvedAt && (Date.now() - new Date(n.createdAt).getTime()) / (1000 * 60 * 60) > 48;
                      return (
                        <tr key={n.id} style={{ background: isOverSla ? "#fef2f2" : i % 2 === 0 ? "#f0fdf4" : "#fff", borderBottom: "1px solid #d1fae5" }}>
                          <td style={{ padding: "6px 8px", fontWeight: 600, color: "#065f46", fontSize: 9 }}>{n.folio}</td>
                          <td style={{ padding: "6px 8px" }}>{catLabels[n.category] || n.category}</td>
                          <td style={{ padding: "6px 8px" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: sevColors[n.severity] || "#6b7280", display: "inline-block" }}></span>
                              {sevLabels[n.severity] || n.severity}
                            </span>
                          </td>
                          <td style={{ padding: "6px 8px", fontWeight: 600, color: n.status === "resuelta" ? "#059669" : n.status === "abierta" ? "#ef4444" : "#d97706" }}>
                            {statusLabels[n.status] || n.status}
                          </td>
                          <td style={{ padding: "6px 8px", fontSize: 9 }}>{fmtDateShort(n.createdAt)}</td>
                          <td style={{ padding: "6px 8px", fontWeight: 600, color: isOverSla ? "#ef4444" : slaHrs !== null ? "#059669" : "#9ca3af" }}>
                            {slaHrs !== null ? `${slaHrs}h` : isOverSla ? "⚠️ >48h" : "Pendiente"}
                          </td>
                          <td style={{ padding: "6px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {n.description?.substring(0, 60)}{n.description?.length > 60 ? "..." : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div style={{ background: "#f9fafb", borderRadius: 10, padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
                  Sin notas de campo en este período
                </div>
              )}
            </div>

            {/* Category distribution */}
            {slaSummary && Object.keys(slaSummary.catCounts).length > 0 && (
              <div style={{ padding: "0 48px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#065f46", marginBottom: 10 }}>📊 Distribución por Categoría</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Object.entries(slaSummary.catCounts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                    <div key={cat} style={{ background: "#f0fdf4", borderRadius: 8, padding: "8px 14px", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: "#065f46" }}>{count}</span>
                      <span style={{ fontSize: 10, color: "#374151" }}>{catLabels[cat] || cat}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 48px", background: "#f9fafb", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 9, color: "#9ca3af" }}>Reporte generado por AgraTec v2.0 · {now} · Confidencial</span>
              <span style={{ fontSize: 9, color: "#9ca3af" }}>Página 4 de 4</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components for PDF template ──

function KpiCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>{icon} {label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function WeatherCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div style={{ background: "#eff6ff", borderRadius: 10, border: "1px solid #bfdbfe", padding: "12px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#1e40af", marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function PreviewKPI({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-white/50 rounded-xl border border-green-100/30 p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${color} shadow-sm`}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-[10px] text-green-600">{label}</span>
      </div>
      <div className="text-lg font-bold text-green-900">{value}</div>
    </div>
  );
}

// ── Canvas bar chart for harvest ──
function HarvestBarChart({ data }: { data: any[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useMemo(() => {
    // We need to draw after render
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas || data.length === 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const W = 720, H = 160;
      canvas.width = W; canvas.height = H;
      ctx.clearRect(0, 0, W, H);

      const maxVal = Math.max(...data.map(d => d.totalWeight || 0), 1);
      const barW = Math.min(60, (W - 40) / data.length - 4);
      const startX = 40;

      // Y axis
      ctx.strokeStyle = "#d1fae5";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = 10 + (H - 30) * (1 - i / 4);
        ctx.beginPath();
        ctx.moveTo(35, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.fillStyle = "#6b7280";
        ctx.font = "9px Helvetica";
        ctx.textAlign = "right";
        ctx.fillText(`${((maxVal * i) / 4).toFixed(0)}`, 32, y + 3);
      }

      // Bars
      data.forEach((d, i) => {
        const x = startX + i * ((W - startX) / data.length) + 2;
        const firstH = ((d.firstQualityWeight || 0) / maxVal) * (H - 30);
        const secondH = ((d.secondQualityWeight || 0) / maxVal) * (H - 30);
        const wasteH = ((d.wasteWeight || 0) / maxVal) * (H - 30);
        let curY = H - 20;

        // 1st quality
        ctx.fillStyle = "#10b981";
        ctx.fillRect(x, curY - firstH, barW, firstH);
        curY -= firstH;

        // 2nd quality
        ctx.fillStyle = "#f59e0b";
        ctx.fillRect(x, curY - secondH, barW, secondH);
        curY -= secondH;

        // Waste
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(x, curY - wasteH, barW, wasteH);

        // Label
        ctx.fillStyle = "#374151";
        ctx.font = "8px Helvetica";
        ctx.textAlign = "center";
        const label = fmtDateShort(d.date);
        ctx.fillText(label, x + barW / 2, H - 6);
      });
    }, 100);
  }, [data]);

  return (
    <canvas ref={canvasRef} style={{ width: "100%", height: 160, borderRadius: 8, border: "1px solid #d1fae5", background: "#fafffe" }} />
  );
}
