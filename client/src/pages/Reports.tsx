import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import { APP_LOGO } from "@/const";
import { toast } from "sonner";
import {
  FileText, Download, Calendar, Package, TrendingUp,
  ClipboardList, CloudSun, Brain, ChevronDown, Loader2,
  BarChart3, Globe, Filter, Satellite, AlertTriangle,
  CheckCircle, Leaf, Droplets, Thermometer, Box, Layers
} from "lucide-react";


// ── Helpers ──
function fmtDate(ds: string) { if (!ds) return "-"; const s = ds.length===10?ds+"T12:00:00":ds; return new Date(s).toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric",timeZone:"America/Mexico_City"}); }
function fmtDateShort(ds: string) { if (!ds) return "-"; const s = ds.length===10?ds+"T12:00:00":ds; return new Date(s).toLocaleDateString("es-MX",{day:"2-digit",month:"short",timeZone:"America/Mexico_City"}); }
function calcSlaHours(c: string|Date, r: string|Date|null): number|null { if(!r)return null; return Math.round((new Date(r).getTime()-new Date(c).getTime())/3600000*10)/10; }
function stripMd(t: string) { return t.replace(/\*+/g, "").replace(/#+\s/g, "").replace(/_+/g, "").trim(); }

const sevLabels: Record<string,string> = {baja:"Baja",media:"Media",alta:"Alta",critica:"Critica"};
const catLabels: Record<string,string> = {
  plaga_enfermedad:"Plaga/Enfermedad",riego_drenaje:"Riego/Drenaje",arboles_mal_plantados:"Arboles",
  dano_mecanico:"Dano Mecanico",maleza:"Maleza",fertilizacion:"Fertilizacion",suelo:"Suelo",
  infraestructura:"Infraestructura",fauna:"Fauna",otro:"Otro",
};
const statusLabels: Record<string,string> = {abierta:"Abierta",en_revision:"En revision",en_progreso:"En progreso",resuelta:"Resuelta",descartada:"Descartada"};

function safe(t: string): string {
  return t.replace(/[áÁ]/g, m=>m==="á"?"a":"A").replace(/[éÉ]/g, m=>m==="é"?"e":"E")
    .replace(/[íÍ]/g, m=>m==="í"?"i":"I").replace(/[óÓ]/g, m=>m==="ó"?"o":"O")
    .replace(/[úÚ]/g, m=>m==="ú"?"u":"U").replace(/[ñÑ]/g, m=>m==="ñ"?"n":"N")
    .replace(/[^\x20-\x7E]/g, "");
}

function useLogoBase64() {
  const [logo, setLogo] = useState<string|null>(null);
  useEffect(() => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => { const c = document.createElement("canvas"); c.width=img.width;c.height=img.height; c.getContext("2d")?.drawImage(img,0,0); setLogo(c.toDataURL("image/png")); };
    img.src = "/agra-tecti.png";
  }, []);
  return logo;
}

// ════════════════════════════════════════════════
// HTML Report Builder (Liquid Glass design)
// ════════════════════════════════════════════════
function ndviBadgeClass(v: number|null|undefined): string {
  if (v == null) return "";
  if (v < 0.4) return "critical";
  if (v <= 0.5) return "moderate";
  return "healthy";
}

function getReportCss(): string {
  return `
    :root {
      --primary: #064e3b;
      --primary-light: #10b981;
      --accent: #00a8e8;
      --bg-glass: rgba(255,255,255,0.55);
      --border-glass: rgba(255,255,255,0.5);
      --text-dark: #1e293b;
      --text-muted: #64748b;
    }
    @page { size: letter; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; background: #f0fdf4; color: var(--text-dark); -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .page { width: 8.5in; min-height: 11in; position: relative; padding: 0; margin: 0 auto; background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 30%, #f8fafc 100%); page-break-after: always; page-break-inside: avoid; }
    .page:last-child { page-break-after: auto; }
    .glass-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; overflow: hidden; }
    .blob { position: absolute; border-radius: 50%; filter: blur(60px); opacity: 0.5; }
    .blob-1 { width: 350px; height: 350px; top: -80px; right: -60px; background: radial-gradient(circle, rgba(16,185,129,0.25), transparent 70%); }
    .blob-2 { width: 300px; height: 300px; bottom: 40px; left: -80px; background: radial-gradient(circle, rgba(0,168,232,0.15), transparent 70%); }
    .blob-3 { width: 200px; height: 200px; top: 40%; left: 50%; background: radial-gradient(circle, rgba(6,78,59,0.1), transparent 70%); }
    .main-content { position: relative; z-index: 1; padding: 18px 28px 10px 28px; }

    /* Header */
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand img { height: 36px; width: 36px; border-radius: 10px; }
    .brand-text h1 { font-size: 17px; font-weight: 800; color: var(--primary); letter-spacing: -0.5px; }
    .brand-text span { font-size: 8px; color: var(--primary-light); text-transform: uppercase; letter-spacing: 2px; font-weight: 600; }
    .header-right { text-align: right; }
    .header-right .report-type { font-size: 9px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; }
    .header-right .report-name { font-size: 11px; font-weight: 600; color: var(--text-dark); margin-top: 1px; }

    /* Date Banner */
    .date-banner { background: linear-gradient(135deg, var(--primary), #065f46); color: white; border-radius: 10px; padding: 7px 16px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .date-banner .period { font-size: 10px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
    .date-banner .badge { background: var(--primary-light); border-radius: 20px; padding: 2px 10px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
    .date-banner svg { width: 14px; height: 14px; }

    /* Metric Cards */
    .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 7px; margin-bottom: 10px; }
    .metric-card { background: var(--bg-glass); backdrop-filter: blur(12px); border: 1px solid var(--border-glass); border-radius: 12px; padding: 8px 10px; position: relative; overflow: hidden; }
    .metric-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 12px 12px 0 0; }
    .metric-card.green::before { background: linear-gradient(90deg, #10b981, #059669); }
    .metric-card.blue::before { background: linear-gradient(90deg, #3b82f6, #2563eb); }
    .metric-card.amber::before { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .metric-card.purple::before { background: linear-gradient(90deg, #8b5cf6, #7c3aed); }
    .metric-card.red::before { background: linear-gradient(90deg, #ef4444, #dc2626); }
    .metric-card.cyan::before { background: linear-gradient(90deg, #06b6d4, #0891b2); }
    .metric-label { font-size: 7.5px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 2px; margin-top: 3px; }
    .metric-value { font-size: 16px; font-weight: 800; color: var(--primary); }
    .metric-sub { font-size: 7px; color: var(--text-muted); margin-top: 1px; }

    /* Section Titles */
    .section-title { font-size: 10px; font-weight: 700; color: var(--primary); margin-bottom: 5px; display: flex; align-items: center; gap: 6px; padding-bottom: 2px; position: relative; }
    .section-title::after { content: ''; flex: 1; height: 2px; background: linear-gradient(90deg, rgba(16,185,129,0.3), transparent); border-radius: 2px; }
    .section-title svg { width: 12px; height: 12px; color: var(--primary-light); }

    /* Glass Table */
    .glass-table-container { background: var(--bg-glass); backdrop-filter: blur(12px); border: 1px solid var(--border-glass); border-radius: 10px; overflow: hidden; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 8px; }
    thead tr { background: linear-gradient(135deg, var(--primary), #065f46); }
    thead th { color: white; padding: 5px 8px; font-weight: 600; text-align: left; font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.5px; }
    thead th.text-right { text-align: right; }
    tbody tr { border-bottom: 1px solid rgba(16,185,129,0.08); }
    tbody tr:nth-child(even) { background: rgba(240,253,244,0.4); }
    tbody tr:nth-child(odd) { background: rgba(255,255,255,0.3); }
    tbody tr.risk-row { background: rgba(254,226,226,0.4) !important; }
    tbody td { padding: 4px 8px; color: var(--text-dark); }
    tbody td.text-right { text-align: right; }
    tbody td.font-bold { font-weight: 700; }
    tbody td.parcel-name { font-weight: 600; color: var(--primary); }
    tfoot tr { background: linear-gradient(135deg, var(--primary), #065f46); }
    tfoot td { color: white; padding: 5px 8px; font-weight: 700; font-size: 7.5px; }
    tfoot td.text-right { text-align: right; }

    /* NDVI Badges */
    .ndvi-badge { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 7.5px; font-weight: 700; }
    .ndvi-badge.healthy { background: #dcfce7; color: #166534; }
    .ndvi-badge.moderate { background: #fef9c3; color: #854d0e; }
    .ndvi-badge.critical { background: #fee2e2; color: #991b1b; }

    /* Risk Alert */
    .risk-alert { background: rgba(254,226,226,0.5); backdrop-filter: blur(12px); border: 1px solid rgba(252,165,165,0.5); border-radius: 10px; padding: 8px 12px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
    .risk-icon { width: 24px; height: 24px; background: linear-gradient(135deg, #ef4444, #dc2626); border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .risk-icon svg { width: 12px; height: 12px; color: white; }
    .risk-text strong { font-size: 9px; color: #991b1b; display: block; }
    .risk-text span { font-size: 7.5px; color: #b91c1c; }

    /* Climate Strip */
    .climate-strip { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
    .climate-item { flex: 1; min-width: 90px; background: var(--bg-glass); backdrop-filter: blur(12px); border: 1px solid var(--border-glass); border-radius: 8px; padding: 5px 10px; display: flex; align-items: center; gap: 6px; }
    .climate-item svg { width: 14px; height: 14px; flex-shrink: 0; }
    .climate-item .cl-label { font-size: 7px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .climate-item .cl-value { font-size: 11px; font-weight: 700; }
    .cl-temp-max { color: #dc2626; }
    .cl-temp-min { color: #2563eb; }
    .cl-rain { color: #0891b2; }
    .cl-days { color: #059669; }

    /* AI Card */
    .ia-card { background: var(--bg-glass); backdrop-filter: blur(12px); border: 1px solid var(--border-glass); border-radius: 12px; padding: 0; overflow: hidden; margin-bottom: 8px; }
    .ia-card-bar { height: 3px; background: linear-gradient(90deg, var(--primary-light), var(--primary)); }
    .ia-card-header { display: flex; align-items: center; gap: 6px; padding: 6px 14px 2px 14px; }
    .ia-card-header svg { width: 14px; height: 14px; color: var(--primary-light); }
    .ia-card-header .ia-title { font-size: 9px; font-weight: 700; color: var(--primary); }
    .ia-card-header .ia-sub { font-size: 7px; color: var(--text-muted); margin-left: 6px; }
    .ia-card-body { padding: 4px 14px 10px 14px; font-size: 7.5px; line-height: 1.5; color: var(--text-dark); white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word; }

    /* NDVI Bar Chart */
    .ndvi-chart-container { background: var(--bg-glass); backdrop-filter: blur(12px); border: 1px solid var(--border-glass); border-radius: 10px; padding: 8px 12px; margin-bottom: 8px; }
    .ndvi-chart-title { font-size: 8px; font-weight: 700; color: var(--primary); margin-bottom: 6px; }
    .ndvi-bar-row { display: flex; align-items: center; gap: 4px; margin-bottom: 3px; }
    .ndvi-bar-label { font-size: 7px; font-weight: 600; color: var(--text-dark); width: 65px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
    .ndvi-bar-track { flex: 1; height: 11px; background: rgba(240,253,244,0.5); border-radius: 6px; overflow: hidden; position: relative; }
    .ndvi-bar-fill { height: 100%; border-radius: 6px; }
    .ndvi-bar-fill.healthy { background: linear-gradient(90deg, #10b981, #059669); }
    .ndvi-bar-fill.moderate { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .ndvi-bar-fill.critical { background: linear-gradient(90deg, #ef4444, #dc2626); }
    .ndvi-bar-val { font-size: 7px; font-weight: 700; width: 34px; text-align: left; flex-shrink: 0; }

    /* Summary Bar */
    .summary-bar { background: linear-gradient(135deg, var(--primary), #065f46); border-radius: 10px; padding: 8px 16px; color: white; font-size: 10px; font-weight: 700; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
    .summary-bar svg { width: 14px; height: 14px; }

    /* Two Column Layout */
    .two-col { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 10px; margin-bottom: 8px; }

    /* Notes KPIs inline */
    .notes-kpis { display: flex; gap: 6px; margin-bottom: 8px; }
    .note-kpi { flex: 1; background: var(--bg-glass); backdrop-filter: blur(12px); border: 1px solid var(--border-glass); border-radius: 8px; padding: 6px; text-align: center; }
    .note-kpi .nk-val { font-size: 15px; font-weight: 800; }
    .note-kpi .nk-label { font-size: 7px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 1px; }

    /* Spatial Grid */
    .spatial-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px; }
    .spatial-cell { background: var(--bg-glass); backdrop-filter: blur(12px); border: 1px solid var(--border-glass); border-radius: 8px; padding: 8px; text-align: center; position: relative; }
    .spatial-cell.problem { border-color: rgba(252,165,165,0.6); background: rgba(254,242,242,0.5); }
    .spatial-cell .sc-label { font-size: 7px; font-weight: 700; color: var(--primary); margin-bottom: 3px; }
    .spatial-cell.problem .sc-label { color: #991b1b; }
    .spatial-cell .sc-ndvi { font-size: 17px; font-weight: 800; color: var(--primary-light); }
    .spatial-cell.problem .sc-ndvi { color: #dc2626; }
    .spatial-cell .sc-sub { font-size: 6.5px; color: var(--text-muted); margin-top: 1px; }

    /* Maps Row */
    .maps-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; }
    .map-card { background: var(--bg-glass); backdrop-filter: blur(12px); border: 1px solid var(--border-glass); border-radius: 10px; overflow: hidden; text-align: center; }
    .map-card .map-title { font-size: 10px; font-weight: 700; color: var(--primary); padding: 6px 0 3px 0; }
    .map-card img { width: 100%; max-height: 130px; object-fit: contain; padding: 0 6px 3px 6px; }
    .map-card .map-no-img { padding: 24px 8px; font-size: 8px; color: var(--text-muted); }
    .map-card .map-trend { font-size: 8px; font-weight: 600; padding: 3px 0 6px 0; }
    .trend-up { color: #10b981; }
    .trend-down { color: #ef4444; }
    .trend-stable { color: #f59e0b; }

    /* Category pills */
    .cat-pills { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
    .cat-pill { background: rgba(240,253,244,0.7); border: 1px solid rgba(209,250,229,0.6); border-radius: 6px; padding: 3px 8px; display: flex; align-items: center; gap: 4px; }
    .cat-pill .cp-count { font-size: 11px; font-weight: 800; color: var(--primary); }
    .cat-pill .cp-label { font-size: 7px; color: var(--text-dark); }

    /* Footer */
    .page-footer { position: relative; padding: 6px 28px; border-top: 1px solid rgba(16,185,129,0.15); display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.6); backdrop-filter: blur(8px); z-index: 2; margin-top: auto; }
    .footer-brand { font-size: 7px; color: var(--text-muted); display: flex; align-items: center; gap: 5px; }
    .footer-brand img { height: 10px; width: 10px; border-radius: 2px; }
    .page-pill { background: var(--primary); color: white; border-radius: 8px; padding: 2px 8px; font-size: 7px; font-weight: 700; }

    /* Liquid line */
    .liquid-line { position: relative; margin: 4px 28px; height: 3px; background: linear-gradient(90deg, var(--primary-light), var(--accent), var(--primary-light)); border-radius: 3px; opacity: 0.3; z-index: 2; }

    /* Sub-header for subsequent pages */
    .sub-header { background: linear-gradient(135deg, var(--primary), #065f46); padding: 8px 28px; display: flex; align-items: center; justify-content: space-between; }
    .sub-header h2 { color: white; font-size: 12px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
    .sub-header h2 img { height: 18px; width: 18px; border-radius: 5px; }
    .sub-header .sh-info { font-size: 7px; color: #a7f3d0; }
    .sub-header + .main-content { padding-top: 10px; }

    /* SLA alert */
    .sla-alert { background: rgba(254,242,242,0.5); border: 1px solid rgba(252,165,165,0.4); border-radius: 8px; padding: 6px 12px; font-size: 8px; font-weight: 600; color: #991b1b; margin-bottom: 8px; }

    /* Inactive parcels chips */
    .inactive-chips { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 8px; }
    .inactive-chip { background: rgba(245,245,245,0.7); border: 1px solid rgba(220,220,220,0.5); border-radius: 6px; padding: 2px 6px; font-size: 7px; color: #6b7280; }

    @media print {
      body { background: white; }
      .page { box-shadow: none; }
      .no-print { display: none !important; }
    }
    @media screen {
      .page { box-shadow: 0 4px 30px rgba(0,0,0,0.08); margin-bottom: 20px; }
    }
  `;
}

function svgCalendar(): string { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'; }
function svgThermH(): string { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>'; }
function svgThermC(): string { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>'; }
function svgRain(): string { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#0891b2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="19" x2="8" y2="21"/><line x1="8" y1="13" x2="8" y2="15"/><line x1="16" y1="19" x2="16" y2="21"/><line x1="16" y1="13" x2="16" y2="15"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="12" y1="15" x2="12" y2="17"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>'; }
function svgBrain(): string { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z"/></svg>'; }
function svgAlert(): string { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'; }
function svgCheck(): string { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'; }

// ════════════════════════════════════════════════
// Component
// ════════════════════════════════════════════════
export default function Reports() {
  const [selectedParcelId, setSelectedParcelId] = useState<number|null>(null);
  const [selectedParcelCode, setSelectedParcelCode] = useState("");
  const [isGeneral, setIsGeneral] = useState(false);
  const [periodDays, setPeriodDays] = useState(7);
  const [reportMode, setReportMode] = useState<"compact"|"extended">("compact");
  const [generating, setGenerating] = useState(false);
  const logoB64 = useLogoBase64();

  const toDate = useMemo(()=>new Date().toISOString().split("T")[0],[]);
  const fromDate = useMemo(()=>{const d=new Date();d.setDate(d.getDate()-periodDays);return d.toISOString().split("T")[0];},[periodDays]);

  const { data: parcels } = trpc.parcels.list.useQuery();
  const parcelsWithPolygon = useMemo(()=>(parcels||[]).filter((p:any)=>p.polygon&&p.polygon.length>10),[parcels]);

  const { data: reportData, isLoading } = trpc.reports.getWeeklyData.useQuery(
    { parcelId: selectedParcelId!, parcelCode: selectedParcelCode, fromDate, toDate },
    { enabled: !isGeneral && !!selectedParcelId && !!selectedParcelCode }
  );
  const { data: generalData, isLoading: generalLoading } = trpc.reports.getGeneralData.useQuery(
    { fromDate, toDate }, { enabled: isGeneral }
  );
  const { data: ndviMap } = trpc.reports.getSatelliteMap.useQuery(
    { parcelId: selectedParcelId!, indexType: "NDVI" },
    { enabled: !isGeneral && !!selectedParcelId }
  );
  const { data: ndreMap } = trpc.reports.getSatelliteMap.useQuery(
    { parcelId: selectedParcelId!, indexType: "NDRE" },
    { enabled: !isGeneral && !!selectedParcelId && reportMode === "extended" }
  );
  const { data: ndmiMap } = trpc.reports.getSatelliteMap.useQuery(
    { parcelId: selectedParcelId!, indexType: "NDMI" },
    { enabled: !isGeneral && !!selectedParcelId && reportMode === "extended" }
  );
  const { data: spatialData } = trpc.reports.getSpatialAnalysis.useQuery(
    { parcelId: selectedParcelId! },
    { enabled: !isGeneral && !!selectedParcelId && reportMode === "extended" }
  );
  const satMaps = { NDVI: ndviMap?.image, NDRE: ndreMap?.image, NDMI: ndmiMap?.image };

  const dataReady = isGeneral ? !!generalData : !!reportData;
  const loading = isGeneral ? generalLoading : isLoading;

  const weeklyHarvestTotal = useMemo(()=>{if(isGeneral)return generalData?.totals?.harvest||0;return(reportData?.dailyHarvest||[]).reduce((s:number,d:any)=>s+(d.totalWeight||0),0);},[reportData,generalData,isGeneral]);
  const weeklyFirstQ = useMemo(()=>{if(isGeneral)return generalData?.totals?.firstQ||0;return(reportData?.dailyHarvest||[]).reduce((s:number,d:any)=>s+(d.firstQualityWeight||0),0);},[reportData,generalData,isGeneral]);
  const firstQPct = weeklyHarvestTotal>0?((weeklyFirstQ/weeklyHarvestTotal)*100).toFixed(1):"0";
  const weeklyBoxes = useMemo(()=>{if(isGeneral)return generalData?.totals?.boxes||0;return(reportData?.dailyHarvest||[]).reduce((s:number,d:any)=>s+(d.totalBoxes||0),0);},[reportData,generalData,isGeneral]);

  const weatherSummary = useMemo(()=>{
    const wd=isGeneral?generalData?.weatherData:reportData?.weatherData;
    if(!wd||!Array.isArray(wd)||wd.length===0)return null;
    const avgMax=(wd as any[]).reduce((s,d)=>s+(d.temperatureMax||0),0)/wd.length;
    const avgMin=(wd as any[]).reduce((s,d)=>s+(d.temperatureMin||0),0)/wd.length;
    const totalRain=(wd as any[]).reduce((s,d)=>s+(d.precipitation||0),0);
    return{avgMax:avgMax.toFixed(1),avgMin:avgMin.toFixed(1),totalRain:totalRain.toFixed(1),days:wd.length};
  },[reportData,generalData,isGeneral]);

  const getSatTrend=(data:any)=>{
    if(!data?.data||!Array.isArray(data.data)||data.data.length<2)return{t:"=",l:"Sin datos",c:[107,114,128] as [number,number,number]};
    const pts=data.data.filter((d:any)=>d.mean!=null).slice(-4);
    if(pts.length<2)return{t:"=",l:"Estable",c:[245,158,11] as [number,number,number]};
    const diff=pts[pts.length-1].mean-pts[0].mean;
    if(diff>0.03)return{t:"+",l:"Mejorando",c:[16,185,129] as [number,number,number]};
    if(diff<-0.03)return{t:"-",l:"Deteriorando",c:[239,68,68] as [number,number,number]};
    return{t:"=",l:"Estable",c:[245,158,11] as [number,number,number]};
  };

  const slaSummary = useMemo(()=>{
    if(isGeneral){const t=generalData?.totals;return t?{total:t.notes,resolved:t.notesResolved,open:t.notesOpen,overSla:0,avgSla:null,catCounts:{} as Record<string,number>}:null;}
    if(!reportData?.fieldNotes)return null;
    const notes=reportData.fieldNotes as any[];
    const resolved=notes.filter(n=>n.resolvedAt);const open=notes.filter(n=>!n.resolvedAt);
    const overSla=open.filter(n=>(Date.now()-new Date(n.createdAt).getTime())/3600000>48);
    const avgSla=resolved.length>0?(resolved.reduce((s,n)=>s+(calcSlaHours(n.createdAt,n.resolvedAt)||0),0)/resolved.length).toFixed(1):null;
    const catCounts:Record<string,number>={};notes.forEach(n=>{catCounts[n.category]=(catCounts[n.category]||0)+1;});
    return{total:notes.length,resolved:resolved.length,open:open.length,overSla:overSla.length,avgSla,catCounts};
  },[reportData,generalData,isGeneral]);

  const aiText = isGeneral ? (generalData as any)?.aiAnalysis : reportData?.aiAnalysis;
  const now = new Date().toLocaleDateString("es-MX",{day:"2-digit",month:"long",year:"numeric",timeZone:"America/Mexico_City"});
  const titleName = isGeneral ? "Todas las Parcelas" : (reportData?.parcel?.name || "...");
  const totalPages = reportMode==="compact"?1:(isGeneral?3:5);

  // Computed for general
  const generalParcels = useMemo(()=>{
    if(!isGeneral||!generalData?.parcels)return{active:[],inactive:[],risk:null as any};
    const ps = generalData.parcels as any[];
    const active = ps.filter((p:any)=>p.weekTotal>0);
    const inactive = ps.filter((p:any)=>p.weekTotal<=0);
    const withNdvi = active.filter((p:any)=>p.ndviLast||p.ndviAvg);
    const risk = withNdvi.length?withNdvi.reduce((a:any,b:any)=>((b.ndviLast||b.ndviAvg||1)<(a.ndviLast||a.ndviAvg||1))?b:a):null;
    return{active,inactive,risk};
  },[isGeneral,generalData]);

  // ══════════════════════════════════════════
  // HTML Report Builder + Print-to-PDF
  // ══════════════════════════════════════════
  function buildPageOpen(pageNum: number, numPages: number, logo: string|null, dateStr: string): string {
    return `<div class="page">
      <div class="glass-bg"><div class="blob blob-1"></div><div class="blob blob-2"></div><div class="blob blob-3"></div></div>
      <div class="main-content">`;
  }
  function buildPageClose(pageNum: number, numPages: number, logo: string|null, dateStr: string): string {
    return `</div><!-- /main-content -->
      <div class="liquid-line"></div>
      <div class="page-footer">
        <div class="footer-brand">
          ${logo ? `<img src="${logo}" alt="" />` : ''}
          AGRA TEC-TI&nbsp;&nbsp;|&nbsp;&nbsp;${dateStr}&nbsp;&nbsp;|&nbsp;&nbsp;Confidencial
        </div>
        <div class="page-pill">${pageNum} / ${numPages}</div>
      </div>
    </div><!-- /page -->`;
  }
  function buildSubHeaderPage(pageNum: number, numPages: number, logo: string|null, dateStr: string, title: string, info: string): string {
    return `<div class="page">
      <div class="glass-bg"><div class="blob blob-1"></div><div class="blob blob-2"></div><div class="blob blob-3"></div></div>
      <div class="sub-header">
        <h2>${logo ? `<img src="${logo}" alt="" />` : ''}${safe(title)}</h2>
        <span class="sh-info">${safe(info)}</span>
      </div>
      <div class="main-content">`;
  }
  function buildHeader(title: string, subtitle: string, logo: string|null): string {
    return `<div class="header">
      <div class="brand">
        ${logo ? `<img src="${logo}" alt="Agra Tec-Ti" />` : ''}
        <div class="brand-text">
          <h1>AGRA TEC-TI</h1>
          <span>${safe(subtitle)}</span>
        </div>
      </div>
      <div class="header-right">
        <div class="report-type">Reporte Semanal</div>
        <div class="report-name">${safe(title)}</div>
      </div>
    </div>`;
  }
  function buildDateBanner(period: string): string {
    return `<div class="date-banner">
      <div class="period">${svgCalendar()} ${safe(period)}</div>
      <div class="badge">REPORTE SEMANAL</div>
    </div>`;
  }
  function buildMetricCard(label: string, value: string, sub: string, colorClass: string): string {
    return `<div class="metric-card ${colorClass}">
      <div class="metric-label">${safe(label)}</div>
      <div class="metric-value">${safe(value)}</div>
      ${sub ? `<div class="metric-sub">${safe(sub)}</div>` : ''}
    </div>`;
  }
  function buildClimateStrip(ws: {avgMax:string,avgMin:string,totalRain:string,days:number}): string {
    return `<div class="section-title">${svgThermH()} Clima</div>
    <div class="climate-strip">
      <div class="climate-item">${svgThermH()}<div><div class="cl-label">Temp. Max</div><div class="cl-value cl-temp-max">${ws.avgMax} &deg;C</div></div></div>
      <div class="climate-item">${svgThermC()}<div><div class="cl-label">Temp. Min</div><div class="cl-value cl-temp-min">${ws.avgMin} &deg;C</div></div></div>
      <div class="climate-item">${svgRain()}<div><div class="cl-label">Lluvia</div><div class="cl-value cl-rain">${ws.totalRain} mm</div></div></div>
      <div class="climate-item">${svgCalendar()}<div><div class="cl-label">Dias</div><div class="cl-value cl-days">${ws.days}</div></div></div>
    </div>`;
  }
  function buildAiCard(text: string): string {
    const clean = stripMd(text);
    return `<div class="ia-card">
      <div class="ia-card-bar"></div>
      <div class="ia-card-header">${svgBrain()}<span class="ia-title">IA AGRA TEC-TI</span><span class="ia-sub">Analisis Semanal</span></div>
      <div class="ia-card-body">${safe(clean)}</div>
    </div>`;
  }

  function buildReportHtml(): string {
    const period = `${fmtDate(fromDate)} - ${fmtDate(toDate)}`;
    const logo = logoB64;
    const nPages = totalPages;
    let html = '';

    // ── PAGE 1 ──
    html += buildPageOpen(1, nPages, logo, now);
    html += buildHeader(titleName, isGeneral ? 'Reporte General' : 'Reporte por Parcela', logo);
    html += buildDateBanner(period);

    // Metric cards
    html += '<div class="metrics-grid">';
    html += buildMetricCard('Cosecha Total', `${weeklyHarvestTotal.toLocaleString('es-MX', {maximumFractionDigits:1})} kg`, 'kilogramos', 'green');
    html += buildMetricCard('1ra Calidad', `${firstQPct}%`, `${weeklyFirstQ.toFixed(1)} kg`, 'green');
    html += buildMetricCard('Cajas', `${weeklyBoxes.toLocaleString('es-MX')}`, 'total periodo', 'cyan');
    if (isGeneral) {
      html += buildMetricCard('Parcelas', `${generalData?.totals?.parcelsCount || 0}`, 'activas', 'blue');
      // Risk card inline
      const riskPre = generalParcels.risk;
      if (riskPre) {
        html += buildMetricCard('Mayor Riesgo', safe(riskPre.name || riskPre.code), `NDVI ${(riskPre.ndviLast || riskPre.ndviAvg || 0).toFixed(3)}`, 'red');
      }
    } else {
      html += buildMetricCard('Dias Activos', `${reportData?.dailyHarvest?.length || 0}`, 'con cosecha', 'blue');
    }
    html += '</div>';

    if (isGeneral) {
      // ── GENERAL PAGE 1 ──
      const { active: withH, inactive: noH, risk: riskP } = generalParcels;


      // Active parcels table
      if (withH.length > 0) {
        html += `<div class="section-title">${svgCheck()} Parcelas con Cosecha (${withH.length})</div>`;
        html += '<div class="glass-table-container"><table><thead><tr>';
        html += '<th>Parcela</th><th class="text-right">kg</th><th class="text-right">1ra Cal.</th><th class="text-right">Cajas</th><th class="text-right">NDVI Ult.</th><th class="text-right">NDVI Prom</th><th class="text-right">Notas</th>';
        html += '</tr></thead><tbody>';
        withH.forEach((p: any) => {
          const isRisk = riskP && p.id === riskP.id;
          const ndvi = p.ndviLast || p.ndviAvg;
          html += `<tr class="${isRisk ? 'risk-row' : ''}">`;
          html += `<td class="parcel-name">${isRisk ? '&#9888; ' : ''}${safe(p.name || p.code)}</td>`;
          html += `<td class="text-right font-bold">${p.weekTotal}</td>`;
          html += `<td class="text-right">${p.weekFirstQ}</td>`;
          html += `<td class="text-right">${p.weekBoxes}</td>`;
          html += `<td class="text-right">${ndvi ? `<span class="ndvi-badge ${ndviBadgeClass(ndvi)}">${ndvi.toFixed(3)}</span>` : '-'}</td>`;
          html += `<td class="text-right">${p.ndviAvg ? p.ndviAvg.toFixed(3) : '-'}</td>`;
          html += `<td class="text-right">${p.notesCount}${p.notesOpen > 0 ? ` <span style="color:#ef4444;font-size:8px">(${p.notesOpen})</span>` : ''}</td>`;
          html += '</tr>';
        });
        html += '</tbody><tfoot><tr>';
        html += `<td>SUBTOTAL</td><td class="text-right">${withH.reduce((s: number, p: any) => s + p.weekTotal, 0).toFixed(1)}</td>`;
        html += `<td class="text-right">${withH.reduce((s: number, p: any) => s + p.weekFirstQ, 0).toFixed(1)}</td>`;
        html += `<td class="text-right">${withH.reduce((s: number, p: any) => s + p.weekBoxes, 0)}</td>`;
        html += '<td class="text-right">-</td><td class="text-right">-</td>';
        html += `<td class="text-right">${withH.reduce((s: number, p: any) => s + p.notesCount, 0)}</td>`;
        html += '</tr></tfoot></table></div>';
      }

      // Inactive parcels — NDVI bar chart
      if (noH.length > 0) {
        html += `<div class="section-title">Sin Cosecha esta semana (${noH.length}) - NDVI</div>`;
        html += '<div class="ndvi-chart-container">';
        // Sort by NDVI ascending so worst is on top
        const sorted = [...noH].sort((a: any, b: any) => (a.ndviLast || a.ndviAvg || 0) - (b.ndviLast || b.ndviAvg || 0));
        sorted.forEach((p: any) => {
          const ndvi = p.ndviLast || p.ndviAvg;
          const val = ndvi || 0;
          const pct = Math.min(val * 100, 100);
          const cls = ndviBadgeClass(val);
          const color = val < 0.4 ? '#991b1b' : val <= 0.5 ? '#854d0e' : '#166534';
          html += '<div class="ndvi-bar-row">';
          html += `<span class="ndvi-bar-label">${safe(p.name || p.code)}</span>`;
          html += `<div class="ndvi-bar-track"><div class="ndvi-bar-fill ${cls}" style="width:${pct}%"></div></div>`;
          html += `<span class="ndvi-bar-val" style="color:${color}">${ndvi ? ndvi.toFixed(3) : 'N/A'}</span>`;
          html += '</div>';
        });
        html += '</div>';
      }


    } else {
      // ── PER-PARCEL PAGE 1 ──
      html += '<div class="two-col"><div>';

      // Daily harvest table (left)
      html += `<div class="section-title">${svgCalendar()} Cosecha Diaria</div>`;
      html += '<div class="glass-table-container"><table><thead><tr>';
      html += '<th>Fecha</th><th class="text-right">Cajas</th><th class="text-right">Total kg</th><th class="text-right">1ra</th><th class="text-right">2da</th><th class="text-right">Desp.</th>';
      html += '</tr></thead><tbody>';
      (reportData?.dailyHarvest || []).forEach((d: any) => {
        html += `<tr><td class="parcel-name">${fmtDateShort(d.date)}</td><td class="text-right">${d.totalBoxes}</td><td class="text-right font-bold">${d.totalWeight}</td><td class="text-right">${d.firstQualityWeight}</td><td class="text-right">${d.secondQualityWeight}</td><td class="text-right">${d.wasteWeight}</td></tr>`;
      });
      html += '</tbody></table></div>';
      html += '</div><div>';

      // Satellite indices (right)
      html += `<div class="section-title">Indices Satelitales</div>`;
      html += '<div class="glass-table-container"><table><thead><tr><th>Indice</th><th class="text-right">Media</th><th class="text-right">Ultimo</th><th>Tendencia</th></tr></thead><tbody>';
      ["NDVI", "NDRE", "NDMI"].forEach(idx => {
        const pts = (reportData?.satelliteData?.[idx]?.data || []).filter((d: any) => d.mean != null);
        const avg = pts.length ? (pts.reduce((s: number, d: any) => s + d.mean, 0) / pts.length) : null;
        const last = pts.length ? pts[pts.length - 1].mean : null;
        const t = getSatTrend(reportData?.satelliteData?.[idx]);
        const trendClass = t.t === '+' ? 'trend-up' : t.t === '-' ? 'trend-down' : 'trend-stable';
        html += `<tr><td class="parcel-name">${idx}</td><td class="text-right">${avg?.toFixed(4) || '-'}</td><td class="text-right">${last ? `<span class="ndvi-badge ${ndviBadgeClass(last)}">${last.toFixed(4)}</span>` : '-'}</td><td class="${trendClass}">${t.t} ${safe(t.l)}</td></tr>`;
      });
      html += '</tbody></table></div>';

      // Notes summary (right)
      html += `<div class="section-title">Notas de Campo</div>`;
      html += '<div class="notes-kpis">';
      html += `<div class="note-kpi"><div class="nk-val" style="color:#064e3b">${slaSummary?.total || 0}</div><div class="nk-label">Total</div></div>`;
      html += `<div class="note-kpi"><div class="nk-val" style="color:#10b981">${slaSummary?.resolved || 0}</div><div class="nk-label">Resueltas</div></div>`;
      html += `<div class="note-kpi"><div class="nk-val" style="color:${(slaSummary?.open || 0) > 0 ? '#ef4444' : '#064e3b'}">${slaSummary?.open || 0}</div><div class="nk-label">Abiertas</div></div>`;
      html += '</div>';
      if (slaSummary?.avgSla) {
        html += `<div style="font-size:8px;color:#374151;margin-bottom:8px">SLA promedio: ${slaSummary.avgSla}h</div>`;
      }

      html += '</div></div>'; // close two-col
    }

    // Climate strip
    if (weatherSummary) {
      html += buildClimateStrip(weatherSummary);
    }

    // AI card — always show if available, for both compact and extended
    if (aiText) {
      html += buildAiCard(aiText);
    }

    html += buildPageClose(1, nPages, logo, now);

    // ═══ EXTENDED PAGES ═══
    if (reportMode === 'extended') {
      if (!isGeneral && reportData) {
        // ── PER-PARCEL PAGE 2: Detailed Harvest + Weather ──
        html += buildSubHeaderPage(2, nPages, logo, now, 'Cosecha Detallada + Clima', `${safe(titleName)} | ${safe(period)}`);
        html += `<div class="section-title">Cosecha Detallada</div>`;
        html += '<div class="glass-table-container"><table><thead><tr>';
        html += '<th>Fecha</th><th class="text-right">Cajas</th><th class="text-right">Total (kg)</th><th class="text-right">1ra Cal.</th><th class="text-right">2da Cal.</th><th class="text-right">Desperdicio</th>';
        html += '</tr></thead><tbody>';
        (reportData.dailyHarvest || []).forEach((d: any) => {
          html += `<tr><td class="parcel-name">${fmtDateShort(d.date)}</td><td class="text-right">${d.totalBoxes}</td><td class="text-right font-bold">${d.totalWeight}</td><td class="text-right">${d.firstQualityWeight}</td><td class="text-right">${d.secondQualityWeight}</td><td class="text-right">${d.wasteWeight}</td></tr>`;
        });
        const sQ = (reportData.dailyHarvest || []).reduce((s: number, d: any) => s + (d.secondQualityWeight || 0), 0);
        const wa = (reportData.dailyHarvest || []).reduce((s: number, d: any) => s + (d.wasteWeight || 0), 0);
        html += `</tbody><tfoot><tr><td>TOTAL</td><td class="text-right">${weeklyBoxes}</td><td class="text-right">${weeklyHarvestTotal.toFixed(2)}</td><td class="text-right">${weeklyFirstQ.toFixed(2)}</td><td class="text-right">${sQ.toFixed(2)}</td><td class="text-right">${wa.toFixed(2)}</td></tr></tfoot></table></div>`;

        if (weatherSummary && reportData.weatherData) {
          html += `<div class="section-title">Clima Diario</div>`;
          html += '<div class="metrics-grid">';
          html += buildMetricCard('Temp. Max', `${weatherSummary.avgMax} C`, 'promedio', 'red');
          html += buildMetricCard('Temp. Min', `${weatherSummary.avgMin} C`, 'promedio', 'blue');
          html += buildMetricCard('Lluvia', `${weatherSummary.totalRain} mm`, 'acumulada', 'cyan');
          html += buildMetricCard('Dias', `${weatherSummary.days}`, 'con datos', 'green');
          html += '</div>';
          html += '<div class="glass-table-container"><table><thead><tr><th>Fecha</th><th class="text-right">Max C</th><th class="text-right">Min C</th><th class="text-right">Lluvia mm</th></tr></thead><tbody>';
          ((reportData.weatherData as any[]) || []).forEach((w: any) => {
            html += `<tr><td class="parcel-name">${fmtDateShort(w.date)}</td><td class="text-right">${(w.temperatureMax || 0).toFixed(1)}</td><td class="text-right">${(w.temperatureMin || 0).toFixed(1)}</td><td class="text-right">${(w.precipitation || 0).toFixed(1)}</td></tr>`;
          });
          html += '</tbody></table></div>';
        }
        html += buildPageClose(2, nPages, logo, now);

        // ── PER-PARCEL PAGE 3: Satellite + AI ──
        html += buildSubHeaderPage(3, nPages, logo, now, 'Telemetria Satelital', `${safe(titleName)} | ${safe(period)}`);

        // Satellite maps
        html += '<div class="maps-row">';
        (["NDVI", "NDRE", "NDMI"] as const).forEach(idx => {
          const img = satMaps[idx];
          const tr = getSatTrend(reportData.satelliteData?.[idx]);
          const trendClass = tr.t === '+' ? 'trend-up' : tr.t === '-' ? 'trend-down' : 'trend-stable';
          html += '<div class="map-card">';
          html += `<div class="map-title">${idx}</div>`;
          if (img) {
            html += `<img src="${img}" alt="${idx}" />`;
          } else {
            html += '<div class="map-no-img">Sin imagen</div>';
          }
          html += `<div class="map-trend ${trendClass}">${tr.t} ${safe(tr.l)}</div>`;
          html += '</div>';
        });
        html += '</div>';

        // Indices table
        html += '<div class="glass-table-container"><table><thead><tr><th>Indice</th><th class="text-right">Media</th><th class="text-right">Min</th><th class="text-right">Max</th><th class="text-right">Ultimo</th><th>Tendencia</th></tr></thead><tbody>';
        ["NDVI", "NDRE", "NDMI"].forEach(idx => {
          const pts = (reportData.satelliteData?.[idx]?.data || []).filter((d: any) => d.mean != null);
          const means = pts.map((d: any) => d.mean);
          const avg = means.length ? means.reduce((a: number, b: number) => a + b, 0) / means.length : null;
          const tr = getSatTrend(reportData.satelliteData?.[idx]);
          const trendClass = tr.t === '+' ? 'trend-up' : tr.t === '-' ? 'trend-down' : 'trend-stable';
          html += `<tr><td class="parcel-name">${idx}</td><td class="text-right">${avg?.toFixed(4) || '-'}</td><td class="text-right">${means.length ? Math.min(...means).toFixed(4) : '-'}</td><td class="text-right">${means.length ? Math.max(...means).toFixed(4) : '-'}</td><td class="text-right">${means.length ? `<span class="ndvi-badge ${ndviBadgeClass(means[means.length - 1])}">${means[means.length - 1].toFixed(4)}</span>` : '-'}</td><td class="${trendClass}">${tr.t} ${safe(tr.l)}</td></tr>`;
        });
        html += '</tbody></table></div>';

        if (reportData.aiAnalysis) {
          html += buildAiCard(reportData.aiAnalysis);
        }
        html += buildPageClose(3, nPages, logo, now);

        // ── PER-PARCEL PAGE 4: Spatial Analysis ──
        html += buildSubHeaderPage(4, nPages, logo, now, 'Analisis Espacial por Cuadrante', `${safe(titleName)} | ${safe(period)}`);

        // NDVI map
        const ndviImg = satMaps.NDVI;
        if (ndviImg) {
          html += `<div class="section-title">Mapa NDVI</div>`;
          html += `<div style="text-align:center;margin-bottom:14px"><img src="${ndviImg}" alt="NDVI" style="max-width:50%;border-radius:12px;border:1px solid var(--border-glass)" /></div>`;
        }

        // Quadrant grid
        if (spatialData?.quadrants?.length) {
          html += `<div class="section-title">Cuadrantes Espaciales (3x3)</div>`;
          html += '<div class="spatial-grid">';
          const quads = spatialData.quadrants as any[];
          quads.forEach((q: any) => {
            if (!q) return;
            const ndviVal = q.ndvi?.mean;
            const isLow = spatialData.summary?.problemZones?.some((pz: any) => pz.label === q.label);
            const ndre = q.ndre?.mean;
            const ndmi = q.ndmi?.mean;
            html += `<div class="spatial-cell ${isLow ? 'problem' : ''}">`;
            html += `<div class="sc-label">${safe(q.label)}</div>`;
            html += `<div class="sc-ndvi">${ndviVal != null ? ndviVal.toFixed(3) : '-'}</div>`;
            html += `<div class="sc-sub">RE:${ndre != null ? ndre.toFixed(3) : '-'} MI:${ndmi != null ? ndmi.toFixed(3) : '-'}</div>`;
            html += '</div>';
          });
          html += '</div>';

          // Problem zones alert
          const pzArr = spatialData.summary?.problemZones;
          if (pzArr && pzArr.length > 0) {
            const zoneNames = pzArr.map((z: any) => z.label).join(', ');
            html += `<div class="risk-alert">
              <div class="risk-icon">${svgAlert()}</div>
              <div class="risk-text">
                <strong>ZONAS CON BAJO NDVI: ${safe(zoneNames)}</strong>
                <span>Promedio parcela: ${spatialData.summary?.avgNdvi?.toFixed(4) || '-'} | Umbral: &lt;85% del promedio</span>
              </div>
            </div>`;
          }
        } else {
          html += '<div style="text-align:center;padding:30px;color:#9ca3af;font-size:10px">Analisis espacial no disponible - requiere poligono de parcela</div>';
        }
        html += buildPageClose(4, nPages, logo, now);

        // ── PER-PARCEL PAGE 5: Notes + SLA ──
        html += buildSubHeaderPage(5, nPages, logo, now, 'Notas de Campo & SLA', `${safe(titleName)} | ${safe(period)}`);
        html += '<div class="metrics-grid">';
        html += buildMetricCard('Total', `${slaSummary?.total || 0}`, 'notas', 'amber');
        html += buildMetricCard('Resueltas', `${slaSummary?.resolved || 0}`, '', 'green');
        html += buildMetricCard('Abiertas', `${slaSummary?.open || 0}`, '', 'red');
        html += buildMetricCard('SLA Prom', slaSummary?.avgSla ? `${slaSummary.avgSla}h` : 'N/A', '', 'purple');
        html += '</div>';

        if (slaSummary && slaSummary.overSla > 0) {
          html += `<div class="sla-alert">ALERTA: ${slaSummary.overSla} notas exceden SLA de 48 horas</div>`;
        }

        const notes = (reportData.fieldNotes as any[]) || [];
        if (notes.length > 0) {
          html += '<div class="glass-table-container"><table><thead><tr><th>Folio</th><th>Categoria</th><th>Prior.</th><th>Estado</th><th>Fecha</th><th class="text-right">SLA</th><th>Descripcion</th></tr></thead><tbody>';
          notes.slice(0, 25).forEach((n: any) => {
            const sla = calcSlaHours(n.createdAt, n.resolvedAt);
            const ov = !n.resolvedAt && (Date.now() - new Date(n.createdAt).getTime()) / 3600000 > 48;
            html += `<tr><td class="parcel-name">${n.folio}</td><td>${safe(catLabels[n.category] || n.category)}</td><td>${safe(sevLabels[n.severity] || n.severity)}</td><td>${safe(statusLabels[n.status] || n.status)}</td><td>${fmtDateShort(n.createdAt)}</td><td class="text-right">${sla != null ? `${sla}h` : ov ? '!' : '-'}</td><td>${safe(n.description?.substring(0, 38) || '')}</td></tr>`;
          });
          html += '</tbody></table></div>';
        } else {
          html += '<div style="text-align:center;padding:20px;color:#9ca3af;font-size:10px">Sin notas en este periodo</div>';
        }

        if (slaSummary && Object.keys(slaSummary.catCounts).length > 0) {
          html += `<div class="section-title">Distribucion por Categoria</div>`;
          html += '<div class="cat-pills">';
          Object.entries(slaSummary.catCounts).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
            html += `<div class="cat-pill"><span class="cp-count">${count}</span><span class="cp-label">${safe(catLabels[cat] || cat)}</span></div>`;
          });
          html += '</div>';
        }
        html += buildPageClose(5, nPages, logo, now);

      } else if (isGeneral && generalData) {
        // ── GENERAL PAGE 2: Detailed Table + Weather ──
        const gParcels = (generalData.parcels || []) as any[];
        const period2 = `Todas las Parcelas | ${period}`;

        html += buildSubHeaderPage(2, nPages, logo, now, 'Detalle por Parcela', safe(period2));
        html += `<div class="section-title">Rendimiento Detallado</div>`;
        html += '<div class="glass-table-container"><table><thead><tr>';
        html += '<th>Parcela</th><th class="text-right">kg</th><th class="text-right">1ra</th><th class="text-right">Cajas</th><th class="text-right">NDVI U.</th><th class="text-right">NDVI P.</th><th class="text-right">Ha</th><th class="text-right">Dias</th><th class="text-right">Notas</th><th class="text-right">Abtas</th>';
        html += '</tr></thead><tbody>';
        gParcels.forEach((p: any) => {
          const isRisk = p.weekTotal > 0 && generalParcels.risk && p.id === generalParcels.risk.id;
          const ndvi = p.ndviLast || p.ndviAvg;
          html += `<tr class="${isRisk ? 'risk-row' : p.weekTotal <= 0 ? 'style="opacity:0.6"' : ''}">`;
          html += `<td class="parcel-name">${safe(p.name || p.code)}</td>`;
          html += `<td class="text-right font-bold">${p.weekTotal}</td>`;
          html += `<td class="text-right">${p.weekFirstQ}</td>`;
          html += `<td class="text-right">${p.weekBoxes}</td>`;
          html += `<td class="text-right">${ndvi ? `<span class="ndvi-badge ${ndviBadgeClass(ndvi)}">${ndvi.toFixed(3)}</span>` : '-'}</td>`;
          html += `<td class="text-right">${p.ndviAvg ? p.ndviAvg.toFixed(3) : '-'}</td>`;
          html += `<td class="text-right">${p.hectares || '-'}</td>`;
          html += `<td class="text-right">${p.activeDays || 0}</td>`;
          html += `<td class="text-right">${p.notesCount}</td>`;
          html += `<td class="text-right">${p.notesOpen}</td>`;
          html += '</tr>';
        });
        html += '</tbody><tfoot><tr>';
        html += `<td>TOTAL</td>`;
        html += `<td class="text-right">${gParcels.reduce((s: number, p: any) => s + p.weekTotal, 0).toFixed(1)}</td>`;
        html += `<td class="text-right">${gParcels.reduce((s: number, p: any) => s + p.weekFirstQ, 0).toFixed(1)}</td>`;
        html += `<td class="text-right">${gParcels.reduce((s: number, p: any) => s + p.weekBoxes, 0)}</td>`;
        html += '<td class="text-right">-</td><td class="text-right">-</td>';
        html += `<td class="text-right">${gParcels.reduce((s: number, p: any) => s + (p.hectares || 0), 0).toFixed(1)}</td>`;
        html += '<td class="text-right">-</td>';
        html += `<td class="text-right">${gParcels.reduce((s: number, p: any) => s + p.notesCount, 0)}</td>`;
        html += `<td class="text-right">${gParcels.reduce((s: number, p: any) => s + p.notesOpen, 0)}</td>`;
        html += '</tr></tfoot></table></div>';

        // Weather detail
        if (weatherSummary && generalData.weatherData) {
          html += `<div class="section-title">Clima Detallado</div>`;
          html += '<div class="metrics-grid">';
          html += buildMetricCard('Temp. Max', `${weatherSummary.avgMax} C`, 'promedio', 'red');
          html += buildMetricCard('Temp. Min', `${weatherSummary.avgMin} C`, 'promedio', 'blue');
          html += buildMetricCard('Lluvia', `${weatherSummary.totalRain} mm`, 'acumulada', 'cyan');
          html += buildMetricCard('Dias', `${weatherSummary.days}`, 'con datos', 'green');
          html += '</div>';
          html += '<div class="glass-table-container"><table><thead><tr><th>Fecha</th><th class="text-right">Max C</th><th class="text-right">Min C</th><th class="text-right">Lluvia mm</th></tr></thead><tbody>';
          ((generalData.weatherData as any[]) || []).forEach((w: any) => {
            html += `<tr><td class="parcel-name">${fmtDateShort(w.date)}</td><td class="text-right">${(w.temperatureMax || 0).toFixed(1)}</td><td class="text-right">${(w.temperatureMin || 0).toFixed(1)}</td><td class="text-right">${(w.precipitation || 0).toFixed(1)}</td></tr>`;
          });
          html += '</tbody></table></div>';
        }
        html += buildPageClose(2, nPages, logo, now);

        // ── GENERAL PAGE 3: Notes + AI ──
        html += buildSubHeaderPage(3, nPages, logo, now, 'Notas de Campo & Analisis IA', safe(period2));

        const totalN = generalData.totals?.notes || 0;
        const resolvedN = generalData.totals?.notesResolved || 0;
        const openN = generalData.totals?.notesOpen || 0;
        html += '<div class="metrics-grid">';
        html += buildMetricCard('Total Notas', `${totalN}`, '', 'amber');
        html += buildMetricCard('Resueltas', `${resolvedN}`, '', 'green');
        html += buildMetricCard('Abiertas', `${openN}`, '', openN > 0 ? 'red' : 'green');
        html += buildMetricCard('Parcelas', `${generalData.totals?.parcelsCount || 0}`, '', 'purple');
        html += '</div>';

        const parcelsWithNotes = gParcels.filter((p: any) => p.notesCount > 0);
        if (parcelsWithNotes.length > 0) {
          html += `<div class="section-title">Notas por Parcela</div>`;
          html += '<div class="glass-table-container"><table><thead><tr><th>Parcela</th><th class="text-right">Total</th><th class="text-right">Abiertas</th><th>Estado</th></tr></thead><tbody>';
          parcelsWithNotes.forEach((p: any) => {
            html += `<tr class="${p.notesOpen > 0 ? 'risk-row' : ''}"><td class="parcel-name">${safe(p.name || p.code)}</td><td class="text-right">${p.notesCount}</td><td class="text-right">${p.notesOpen}</td><td>${p.notesOpen > 0 ? 'Requiere atencion' : 'Todo resuelto'}</td></tr>`;
          });
          html += '</tbody></table></div>';
        }

        if (aiText) {
          html += buildAiCard(aiText);
        }
        html += buildPageClose(3, nPages, logo, now);
      }
    }

    // Wrap in full HTML document
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte AGRA TEC-TI - ${safe(titleName)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>${getReportCss()}</style>
</head>
<body>
${html}
</body>
</html>`;
  }

  async function generatePDF() {
    if (!dataReady) return;
    setGenerating(true);
    toast.loading("Generando reporte...", { id: "pdf-gen" });
    try {
      const htmlContent = buildReportHtml();
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error("No se pudo abrir la ventana de impresion. Permite ventanas emergentes.", { id: "pdf-gen" });
        return;
      }
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      // Delay to allow fonts/images to load, then trigger print
      setTimeout(() => {
        printWindow.print();
      }, 500);
      toast.success("Reporte abierto - usa Ctrl+P o el dialogo de impresion para guardar como PDF", { id: "pdf-gen" });
    } catch (err) {
      console.error("Report error:", err);
      toast.error("Error generando reporte", { id: "pdf-gen" });
    } finally {
      setGenerating(false);
    }
  }

  // ═══════════════════════════════════════════
  // UI — Premium Glassmorphism Design
  // ═══════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8 relative overflow-hidden">
      {/* Decorative floating shapes */}
      <div className="pointer-events-none absolute top-20 right-10 w-72 h-72 rounded-full bg-gradient-to-br from-green-200/30 to-emerald-300/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-40 left-0 w-96 h-96 rounded-full bg-gradient-to-tr from-teal-200/20 to-cyan-200/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/3 w-48 h-48 rounded-full bg-gradient-to-br from-emerald-100/20 to-green-200/10 blur-2xl" />

      <div className="container max-w-5xl mx-auto px-3 md:px-6 relative z-10">
        {/* Header */}
        <div className="mb-6 md:mb-8 flex items-center gap-3 md:gap-4">
          <img src={APP_LOGO} alt="AgraTec" className="h-12 w-12 md:h-16 md:w-16" />
          <div>
            <h1 className="text-2xl md:text-4xl font-bold text-green-900">Reportes</h1>
            <p className="text-xs md:text-base text-green-700">Genera reportes PDF semanales con análisis IA</p>
          </div>
        </div>

        {/* Controls Card */}
        <GlassCard className="p-4 md:p-6 mb-6" hover={false}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" /> Alcance
              </label>
              <div className="flex gap-2">
                <button onClick={()=>setIsGeneral(false)} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 ${!isGeneral?"bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/25":"rounded-lg border border-green-200 bg-white/50 text-green-700 hover:bg-green-50"}`}>
                  <Filter className="h-4 w-4"/> Por Parcela
                </button>
                <button onClick={()=>{setIsGeneral(true);setSelectedParcelId(null);}} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 ${isGeneral?"bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/25":"rounded-lg border border-green-200 bg-white/50 text-green-700 hover:bg-green-50"}`}>
                  <Globe className="h-4 w-4"/> General
                </button>
              </div>
            </div>
            {!isGeneral && (
              <div>
                <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Leaf className="h-3.5 w-3.5" /> Parcela (con polígono)
                </label>
                <div className="relative">
                  <select value={selectedParcelId||""} onChange={e=>{const id=Number(e.target.value);setSelectedParcelId(id||null);const p=parcelsWithPolygon.find((p:any)=>p.id===id);setSelectedParcelCode(p?.code||"");}}
                    className="w-full rounded-xl border border-green-200/50 bg-white/70 backdrop-blur-sm px-4 py-2.5 text-sm text-green-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 appearance-none cursor-pointer transition-all">
                    <option value="">Selecciona parcela...</option>
                    {parcelsWithPolygon.map((p:any)=>(<option key={p.id} value={p.id}>{p.code} — {p.name}</option>))}
                  </select>
                  <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-green-400 pointer-events-none"/>
                </div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Período
              </label>
              <div className="flex gap-1.5">
                {[{days:7,label:"1 Sem"},{days:14,label:"2 Sem"},{days:30,label:"1 Mes"}].map(({days,label})=>(
                  <button key={days} onClick={()=>setPeriodDays(days)} className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-medium transition-all duration-300 ${periodDays===days?"bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow shadow-green-500/25":"border border-green-200 bg-white/50 text-green-700 hover:bg-green-50"}`}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Tipo
              </label>
              <div className="flex gap-1.5">
                <button onClick={()=>setReportMode("compact")} className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-medium transition-all duration-300 ${reportMode==="compact"?"bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow shadow-blue-500/25":"border border-green-200 bg-white/50 text-green-700 hover:bg-green-50"}`}>
                  <span className="flex items-center justify-center gap-1"><BarChart3 className="h-3 w-3"/> Resumido</span>
                </button>
                <button onClick={()=>setReportMode("extended")} className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-medium transition-all duration-300 ${reportMode==="extended"?"bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow shadow-blue-500/25":"border border-green-200 bg-white/50 text-green-700 hover:bg-green-50"}`}>
                  <span className="flex items-center justify-center gap-1"><Layers className="h-3 w-3"/> Extendido</span>
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Rango
              </label>
              <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm rounded-lg border border-green-200 px-3 py-2.5">
                <span className="text-xs text-green-800 font-medium">{fmtDate(fromDate)} — {fmtDate(toDate)}</span>
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-center">
            <button onClick={generatePDF} disabled={!dataReady||generating||loading}
              className={`flex items-center gap-2.5 rounded-2xl px-8 py-3.5 text-sm font-semibold transition-all duration-300 ${dataReady&&!generating?"bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-xl shadow-green-500/30 hover:shadow-2xl hover:shadow-green-500/40 hover:scale-105 active:scale-95":"bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
              {generating?<><Loader2 className="h-4 w-4 animate-spin"/>Generando...</>:loading?<><Loader2 className="h-4 w-4 animate-spin"/>Cargando datos...</>:<><Download className="h-4 w-4"/>Generar Reporte PDF ({totalPages} {totalPages===1?"pág":"págs"})</>}
            </button>
          </div>
        </GlassCard>

        {/* Preview */}
        {dataReady && (
          <div className="space-y-5">
            {/* KPI Cards */}
            <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
              <GlassCard className="p-4" hover={false}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-green-600">Cosecha Total</p>
                    <p className="text-lg md:text-2xl font-bold text-green-900">{weeklyHarvestTotal.toFixed(1)}</p>
                    <p className="text-xs text-green-500">kilogramos</p>
                  </div>
                  <Package className="h-8 w-8 md:h-10 md:w-10 text-green-400" />
                </div>
              </GlassCard>
              <GlassCard className="p-4" hover={false}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-green-600">1ra Calidad</p>
                    <p className="text-lg md:text-2xl font-bold text-green-900">{firstQPct}%</p>
                    <p className="text-xs text-green-500">{weeklyFirstQ.toFixed(1)} kg</p>
                  </div>
                  <TrendingUp className="h-8 w-8 md:h-10 md:w-10 text-emerald-400" />
                </div>
              </GlassCard>
              <GlassCard className="p-4" hover={false}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-yellow-600">Notas de Campo</p>
                    <p className="text-lg md:text-2xl font-bold text-yellow-900">{slaSummary?.total||0}</p>
                    <p className="text-xs text-yellow-500">{slaSummary?.open||0} abiertas</p>
                  </div>
                  <ClipboardList className="h-8 w-8 md:h-10 md:w-10 text-yellow-400" />
                </div>
              </GlassCard>
              <GlassCard className="p-4" hover={false}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-blue-600">Clima</p>
                    <p className="text-lg md:text-2xl font-bold text-blue-900">{weatherSummary?`${weatherSummary.totalRain} mm`:"N/D"}</p>
                    <p className="text-xs text-blue-500">{weatherSummary?`${weatherSummary.avgMax}°C máx`:""}</p>
                  </div>
                  <CloudSun className="h-8 w-8 md:h-10 md:w-10 text-blue-400" />
                </div>
              </GlassCard>
            </div>

            {/* Risk Alert */}
            {isGeneral && generalParcels.risk && (
              <GlassCard className="p-4 !border-red-200/40 !bg-red-50/30" hover={false}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-red-400 to-red-600 shadow-lg shadow-red-500/25">
                    <AlertTriangle className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-red-800">Mayor Riesgo: {generalParcels.risk.name}</p>
                    <p className="text-xs text-red-600">NDVI {(generalParcels.risk.ndviLast||generalParcels.risk.ndviAvg||0).toFixed(3)} · {generalParcels.risk.notesOpen} notas abiertas</p>
                  </div>
                </div>
              </GlassCard>
            )}

            {/* Parcels Table (General) */}
            {isGeneral && generalData?.parcels && (
              <GlassCard className="p-4 md:p-6" hover={false}>
                <div className="mb-4 flex items-center justify-between border-b border-green-200 pb-3">
                  <div className="flex items-center gap-2">
                    <Satellite className="h-6 w-6 text-green-600" />
                    <div>
                      <h2 className="text-base md:text-xl font-bold text-green-900">Rendimiento por Parcela</h2>
                      <p className="text-xs text-green-600">{generalParcels.active.length} activas · {generalParcels.inactive.length} sin cosecha</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl md:text-3xl font-bold text-green-900">{weeklyHarvestTotal.toFixed(0)}</p>
                    <p className="text-xs text-green-600">kg total</p>
                  </div>
                </div>

                {/* Active parcels */}
                {generalParcels.active.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-semibold text-green-800">Parcelas con Cosecha ({generalParcels.active.length})</span>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-green-200/50 bg-white/30 backdrop-blur-sm">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gradient-to-r from-green-600 to-emerald-600">
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-white">Parcela</th>
                            <th className="px-3 py-2.5 text-right text-xs font-semibold text-white">kg</th>
                            <th className="px-3 py-2.5 text-right text-xs font-semibold text-white hidden sm:table-cell">1ra Cal.</th>
                            <th className="px-3 py-2.5 text-right text-xs font-semibold text-white">NDVI</th>
                            <th className="px-3 py-2.5 text-right text-xs font-semibold text-white hidden sm:table-cell">Cajas</th>
                            <th className="px-3 py-2.5 text-right text-xs font-semibold text-white">Notas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {generalParcels.active.map((p:any,i:number) => {
                            const isRisk = generalParcels.risk && p.id === generalParcels.risk.id;
                            const ndvi = p.ndviLast || p.ndviAvg || 0;
                            return (
                              <tr key={p.id} className={`transition-colors ${isRisk ? 'bg-red-50/60' : i%2===0 ? 'bg-green-50/40' : 'bg-white/20'} border-b border-green-100/40`}>
                                <td className="px-3 py-2 font-semibold text-green-800 flex items-center gap-1.5">
                                  {isRisk && <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                                  <span className="truncate max-w-[120px] md:max-w-none">{p.name}</span>
                                </td>
                                <td className="px-3 py-2 text-right font-bold text-green-700">{p.weekTotal}</td>
                                <td className="px-3 py-2 text-right text-green-600 hidden sm:table-cell">{p.weekFirstQ}</td>
                                <td className={`px-3 py-2 text-right font-semibold ${ndvi>0.5?'text-green-600':ndvi>0.3?'text-yellow-600':'text-red-500'}`}>
                                  {ndvi ? ndvi.toFixed(3) : '-'}
                                </td>
                                <td className="px-3 py-2 text-right text-green-600 hidden sm:table-cell">{p.weekBoxes}</td>
                                <td className={`px-3 py-2 text-right font-medium ${p.notesOpen>0?'text-red-500':'text-green-600'}`}>
                                  {p.notesCount}{p.notesOpen>0 && <span className="text-red-400 text-[10px]"> ({p.notesOpen})</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Inactive parcels */}
                {generalParcels.inactive.length > 0 && (
                  <div className="rounded-xl border border-gray-200/50 bg-gray-50/30 backdrop-blur-sm p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Box className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-xs font-semibold text-gray-500">Sin Cosecha ({generalParcels.inactive.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {generalParcels.inactive.map((p:any) => (
                        <span key={p.id} className="inline-flex items-center gap-1 rounded-lg bg-white/60 border border-gray-200/50 px-2 py-1 text-[11px] text-gray-600">
                          {p.name || p.code}
                          {(p.ndviLast||p.ndviAvg) && <span className="text-[10px] text-gray-400">· NDVI {(p.ndviLast||p.ndviAvg).toFixed(3)}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </GlassCard>
            )}

            {/* AI Analysis */}
            {aiText && (
              <GlassCard className="p-4 md:p-6" hover={false}>
                <div className="mb-4 flex items-center justify-between border-b border-green-200 pb-3">
                  <div className="flex items-center gap-2">
                    <Brain className="h-6 w-6 text-green-600" />
                    <div>
                      <h2 className="text-base md:text-xl font-bold text-green-900">Análisis IA</h2>
                      <p className="text-xs text-green-600">IA Agra Tec-ti · Análisis Semanal</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 p-4 md:p-5">
                  <p className="text-sm text-green-800 leading-relaxed whitespace-pre-wrap">{stripMd(aiText)}</p>
                </div>
              </GlassCard>
            )}

            {/* Weather Summary */}
            {weatherSummary && (
              <GlassCard className="p-4 md:p-6" hover={false}>
                <div className="mb-4 flex items-center gap-2 border-b border-green-200 pb-3">
                  <Thermometer className="h-6 w-6 text-blue-600" />
                  <h2 className="text-base md:text-xl font-bold text-green-900">Clima de la Semana</h2>
                </div>
                <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-gradient-to-br from-red-50 to-rose-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-red-600">Temp. Máxima</p>
                        <p className="text-xl font-bold text-red-900">{weatherSummary.avgMax}°C</p>
                        <p className="text-xs text-red-400">promedio</p>
                      </div>
                      <Thermometer className="h-8 w-8 text-red-300" />
                    </div>
                  </div>
                  <div className="rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-blue-600">Temp. Mínima</p>
                        <p className="text-xl font-bold text-blue-900">{weatherSummary.avgMin}°C</p>
                        <p className="text-xs text-blue-400">promedio</p>
                      </div>
                      <Thermometer className="h-8 w-8 text-blue-300" />
                    </div>
                  </div>
                  <div className="rounded-lg bg-gradient-to-br from-cyan-50 to-teal-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-cyan-600">Lluvia</p>
                        <p className="text-xl font-bold text-cyan-900">{weatherSummary.totalRain} mm</p>
                        <p className="text-xs text-cyan-400">acumulada</p>
                      </div>
                      <Droplets className="h-8 w-8 text-cyan-300" />
                    </div>
                  </div>
                  <div className="rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-green-600">Días</p>
                        <p className="text-xl font-bold text-green-900">{weatherSummary.days}</p>
                        <p className="text-xs text-green-400">con datos</p>
                      </div>
                      <Calendar className="h-8 w-8 text-green-300" />
                    </div>
                  </div>
                </div>
              </GlassCard>
            )}
          </div>
        )}

        {!dataReady && !loading && (
          <GlassCard className="p-8 md:p-12 text-center" hover={false}>
            <FileText className="mx-auto mb-4 h-12 w-12 md:h-16 md:w-16 text-green-300" />
            <h3 className="text-base md:text-xl font-semibold text-green-800 mb-1">{isGeneral?"Listo para generar":"Selecciona una parcela"}</h3>
            <p className="text-green-600 text-xs md:text-sm">{isGeneral?"Haz click en Generar para el reporte general":"Solo se muestran parcelas con polígono definido"}</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
