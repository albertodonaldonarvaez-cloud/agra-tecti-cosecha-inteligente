import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import { toast } from "sonner";
import {
  FileText, Download, Calendar, Package, TrendingUp,
  ClipboardList, CloudSun, Brain, ChevronDown, Loader2,
  BarChart3, Globe, Filter
} from "lucide-react";
import jsPDF from "jspdf";

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

// safe text - remove non-latin chars for jsPDF helvetica
function safe(t: string): string {
  return t
    .replace(/[áÁ]/g, m => m === "á" ? "a" : "A")
    .replace(/[éÉ]/g, m => m === "é" ? "e" : "E")
    .replace(/[íÍ]/g, m => m === "í" ? "i" : "I")
    .replace(/[óÓ]/g, m => m === "ó" ? "o" : "O")
    .replace(/[úÚ]/g, m => m === "ú" ? "u" : "U")
    .replace(/[ñÑ]/g, m => m === "ñ" ? "n" : "N")
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
// jsPDF builder — clean, no emojis, professional
// ════════════════════════════════════════════════
const PW = 612; const PH = 792;
const ML = 36; const MR = 36;
const CW = PW - ML - MR;

// Solid color header (no buggy gradient strips)
function pdfHeader(pdf: jsPDF, title: string, subtitle: string, period: string, logo: string|null) {
  // Dark green solid header
  pdf.setFillColor(6, 95, 70); pdf.rect(0, 0, PW, 58, "F");
  // Lighter accent bar at bottom
  pdf.setFillColor(16, 185, 129); pdf.rect(0, 56, PW, 3, "F");

  // Logo
  if (logo) { try { pdf.addImage(logo, "PNG", ML, 10, 34, 34); } catch {} }
  const lx = ML + (logo ? 40 : 0);

  // Brand
  pdf.setFont("helvetica","bold"); pdf.setFontSize(16); pdf.setTextColor(255,255,255);
  pdf.text("AGRA TEC-TI", lx, 26);
  pdf.setFontSize(7); pdf.setFont("helvetica","normal"); pdf.setTextColor(167, 243, 208);
  pdf.text(safe(subtitle.toUpperCase()), lx, 36);

  // Right side
  pdf.setFont("helvetica","bold"); pdf.setFontSize(10); pdf.setTextColor(255,255,255);
  pdf.text(safe(title), PW - MR, 22, { align: "right" });
  pdf.setFontSize(7.5); pdf.setFont("helvetica","normal"); pdf.setTextColor(167,243,208);
  pdf.text(safe(period), PW - MR, 34, { align: "right" });
}

function pdfSubHeader(pdf: jsPDF, title: string, info: string, logo: string|null) {
  pdf.setFillColor(6, 95, 70); pdf.rect(0, 0, PW, 34, "F");
  pdf.setFillColor(16, 185, 129); pdf.rect(0, 33, PW, 2, "F");
  if (logo) { try { pdf.addImage(logo, "PNG", ML, 5, 22, 22); } catch {} }
  pdf.setFont("helvetica","bold"); pdf.setFontSize(12); pdf.setTextColor(255,255,255);
  pdf.text(safe(title), ML + (logo ? 28 : 0), 22);
  pdf.setFont("helvetica","normal"); pdf.setFontSize(7); pdf.setTextColor(167,243,208);
  pdf.text(safe(info), PW - MR, 20, { align: "right" });
}

function pdfFooter(pdf: jsPDF, page: number, total: number, dateStr: string, logo: string|null) {
  const y = PH - 16;
  pdf.setDrawColor(209,250,229); pdf.setLineWidth(0.5); pdf.line(ML, y-4, PW-MR, y-4);
  if (logo) { try { pdf.addImage(logo, "PNG", ML, y-3, 9, 9); } catch {} }
  pdf.setFontSize(5.5); pdf.setFont("helvetica","normal"); pdf.setTextColor(156,163,175);
  pdf.text(`AGRA TEC-TI  |  ${safe(dateStr)}  |  Confidencial`, ML + 13, y + 3);
  pdf.text(`Pagina ${page} de ${total}`, PW - MR, y + 3, { align: "right" });
}

function pdfKpi(pdf: jsPDF, x: number, y: number, w: number, label: string, value: string, r: number, g: number, b: number) {
  // White box with colored left accent
  pdf.setFillColor(255,255,255); pdf.roundedRect(x, y, w, 38, 3, 3, "F");
  pdf.setDrawColor(229,231,235); pdf.roundedRect(x, y, w, 38, 3, 3, "S");
  pdf.setFillColor(r, g, b); pdf.rect(x, y+4, 3, 30, "F"); // left accent bar
  pdf.setFontSize(6.5); pdf.setFont("helvetica","normal"); pdf.setTextColor(107,114,128);
  pdf.text(safe(label.toUpperCase()), x + 10, y + 13);
  pdf.setFontSize(15); pdf.setFont("helvetica","bold"); pdf.setTextColor(r, g, b);
  pdf.text(safe(value), x + 10, y + 30);
}

function pdfSectionTitle(pdf: jsPDF, x: number, y: number, title: string) {
  pdf.setFillColor(6,95,70); pdf.roundedRect(x, y, 4, 12, 1, 1, "F");
  pdf.setFontSize(9); pdf.setFont("helvetica","bold"); pdf.setTextColor(6,95,70);
  pdf.text(safe(title), x + 8, y + 9);
}

// rowColors: optional array of [r,g,b] per row for background tinting
function pdfTable(pdf: jsPDF, x: number, y: number, headers: string[], rows: string[][], widths: number[], rowColors?: ([number,number,number]|null)[]): number {
  const rh = 13; const hh = 15;
  const tw = widths.reduce((a,b)=>a+b,0);
  // header
  pdf.setFillColor(6, 95, 70); pdf.rect(x, y, tw, hh, "F");
  pdf.setFontSize(7); pdf.setFont("helvetica","bold"); pdf.setTextColor(255,255,255);
  let cx = x;
  headers.forEach((h,i) => { pdf.text(safe(h), cx+4, y+10); cx += widths[i]; });
  let cy = y + hh;
  rows.forEach((row, ri) => {
    const rc = rowColors?.[ri];
    if (rc) { pdf.setFillColor(rc[0],rc[1],rc[2]); pdf.rect(x, cy, tw, rh, "F"); }
    else if (ri % 2 === 0) { pdf.setFillColor(245,250,248); pdf.rect(x, cy, tw, rh, "F"); }
    pdf.setDrawColor(229,241,234); pdf.setLineWidth(0.3); pdf.line(x, cy+rh, x+tw, cy+rh);
    cx = x;
    row.forEach((cell, ci) => {
      pdf.setFontSize(7); pdf.setFont("helvetica", ci===0?"bold":"normal");
      pdf.setTextColor(ci===0?6:55, ci===0?95:65, ci===0?70:81);
      const t = cell.length > 24 ? cell.substring(0,22)+"..." : cell;
      pdf.text(safe(t), cx+4, cy+9);
      cx += widths[ci];
    });
    cy += rh;
  });
  return cy;
}

function pdfTotalRow(pdf: jsPDF, x: number, y: number, cells: string[], widths: number[]): number {
  const h = 15; const tw = widths.reduce((a,b)=>a+b,0);
  pdf.setFillColor(6, 95, 70); pdf.rect(x, y, tw, h, "F");
  pdf.setFontSize(7.5); pdf.setFont("helvetica","bold"); pdf.setTextColor(255,255,255);
  let cx = x;
  cells.forEach((c,i) => { pdf.text(safe(c), cx+4, y+10); cx += widths[i]; });
  return y + h;
}

function pdfAiBox(pdf: jsPDF, x: number, y: number, w: number, text: string): number {
  const clean = stripMd(text);
  pdf.setFontSize(7.5); pdf.setFont("helvetica","normal");
  const lines = pdf.splitTextToSize(safe(clean), w - 16);
  const maxLines = Math.min(lines.length, 14);
  const boxH = 22 + maxLines * 9;
  // Glass-like box
  pdf.setFillColor(245, 252, 248); pdf.roundedRect(x, y, w, boxH, 4, 4, "F");
  pdf.setDrawColor(187, 247, 208); pdf.setLineWidth(0.5); pdf.roundedRect(x, y, w, boxH, 4, 4, "S");
  // Accent
  pdf.setFillColor(16, 185, 129); pdf.roundedRect(x, y+4, 3, boxH - 8, 1, 1, "F");
  // Title
  pdf.setFontSize(8); pdf.setFont("helvetica","bold"); pdf.setTextColor(6,95,70);
  pdf.text("IA AGRA TEC-TI  |  Analisis Semanal", x + 10, y + 12);
  // Content
  pdf.setFontSize(7.5); pdf.setFont("helvetica","normal"); pdf.setTextColor(31,41,55);
  pdf.text(lines.slice(0, maxLines), x + 10, y + 23);
  return y + boxH;
}

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

  const toDate = useMemo(() => new Date().toISOString().split("T")[0], []);
  const fromDate = useMemo(() => { const d=new Date();d.setDate(d.getDate()-periodDays);return d.toISOString().split("T")[0]; }, [periodDays]);

  const { data: parcels } = trpc.parcels.list.useQuery();
  const parcelsWithPolygon = useMemo(() => (parcels||[]).filter((p:any)=>p.polygon&&p.polygon.length>10), [parcels]);

  const { data: reportData, isLoading } = trpc.reports.getWeeklyData.useQuery(
    { parcelId: selectedParcelId!, parcelCode: selectedParcelCode, fromDate, toDate },
    { enabled: !isGeneral && !!selectedParcelId && !!selectedParcelCode }
  );
  const { data: generalData, isLoading: generalLoading } = trpc.reports.getGeneralData.useQuery(
    { fromDate, toDate }, { enabled: isGeneral }
  );
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

  const weeklyHarvestTotal = useMemo(() => {
    if (isGeneral) return generalData?.totals?.harvest||0;
    return (reportData?.dailyHarvest||[]).reduce((s:number,d:any)=>s+(d.totalWeight||0),0);
  }, [reportData,generalData,isGeneral]);
  const weeklyFirstQ = useMemo(() => {
    if (isGeneral) return generalData?.totals?.firstQ||0;
    return (reportData?.dailyHarvest||[]).reduce((s:number,d:any)=>s+(d.firstQualityWeight||0),0);
  }, [reportData,generalData,isGeneral]);
  const firstQPct = weeklyHarvestTotal > 0 ? ((weeklyFirstQ/weeklyHarvestTotal)*100).toFixed(1) : "0";
  const weeklyBoxes = useMemo(() => {
    if (isGeneral) return generalData?.totals?.boxes||0;
    return (reportData?.dailyHarvest||[]).reduce((s:number,d:any)=>s+(d.totalBoxes||0),0);
  }, [reportData,generalData,isGeneral]);

  const weatherSummary = useMemo(() => {
    const wd = isGeneral ? generalData?.weatherData : reportData?.weatherData;
    if (!wd||!Array.isArray(wd)||wd.length===0) return null;
    const avgMax = (wd as any[]).reduce((s,d)=>s+(d.temperatureMax||0),0)/wd.length;
    const avgMin = (wd as any[]).reduce((s,d)=>s+(d.temperatureMin||0),0)/wd.length;
    const totalRain = (wd as any[]).reduce((s,d)=>s+(d.precipitation||0),0);
    return { avgMax:avgMax.toFixed(1), avgMin:avgMin.toFixed(1), totalRain:totalRain.toFixed(1), days:wd.length };
  }, [reportData,generalData,isGeneral]);

  const getSatTrend = (data:any) => {
    if (!data?.data||!Array.isArray(data.data)||data.data.length<2) return {t:"=",l:"Sin datos",c:[107,114,128] as [number,number,number]};
    const pts = data.data.filter((d:any)=>d.mean!=null).slice(-4);
    if (pts.length<2) return {t:"=",l:"Estable",c:[245,158,11] as [number,number,number]};
    const diff = pts[pts.length-1].mean - pts[0].mean;
    if (diff>0.03) return {t:"+",l:"Mejorando",c:[16,185,129] as [number,number,number]};
    if (diff<-0.03) return {t:"-",l:"Deteriorando",c:[239,68,68] as [number,number,number]};
    return {t:"=",l:"Estable",c:[245,158,11] as [number,number,number]};
  };

  const slaSummary = useMemo(() => {
    if (isGeneral) { const t=generalData?.totals; return t?{total:t.notes,resolved:t.notesResolved,open:t.notesOpen,overSla:0,avgSla:null,catCounts:{} as Record<string,number>}:null; }
    if (!reportData?.fieldNotes) return null;
    const notes = reportData.fieldNotes as any[];
    const resolved = notes.filter(n=>n.resolvedAt); const open = notes.filter(n=>!n.resolvedAt);
    const overSla = open.filter(n=>(Date.now()-new Date(n.createdAt).getTime())/3600000>48);
    const avgSla = resolved.length>0?(resolved.reduce((s,n)=>s+(calcSlaHours(n.createdAt,n.resolvedAt)||0),0)/resolved.length).toFixed(1):null;
    const catCounts:Record<string,number> = {}; notes.forEach(n=>{catCounts[n.category]=(catCounts[n.category]||0)+1;});
    return {total:notes.length,resolved:resolved.length,open:open.length,overSla:overSla.length,avgSla,catCounts};
  }, [reportData,generalData,isGeneral]);

  const aiText = isGeneral ? (generalData as any)?.aiAnalysis : reportData?.aiAnalysis;
  const now = new Date().toLocaleDateString("es-MX",{day:"2-digit",month:"long",year:"numeric",timeZone:"America/Mexico_City"});
  const titleName = isGeneral ? "Todas las Parcelas" : (reportData?.parcel?.name || "...");
  const totalPages = reportMode === "compact" ? 1 : 4;

  // ══════════════════════════════════════════
  // PDF — native jsPDF, no html2canvas
  // ══════════════════════════════════════════
  async function generatePDF() {
    if (!dataReady) return;
    setGenerating(true);
    toast.loading("Generando PDF...", { id: "pdf-gen" });
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
      const period = `${fmtDate(fromDate)} - ${fmtDate(toDate)}`;

      // ── PAGE 1 ──
      pdfHeader(pdf, titleName, isGeneral ? "Reporte General" : "Reporte por Parcela", period, logoB64);
      let y = 68;

      // KPIs
      const kw = (CW - 18) / 4;
      const kpis: [string,string,number,number,number][] = [
        ["Cosecha Total", `${weeklyHarvestTotal.toFixed(1)} kg`, 5,150,105],
        ["1ra Calidad", `${firstQPct}%`, 4,120,87],
        ["Cajas", `${weeklyBoxes}`, 13,148,136],
        [isGeneral?"Parcelas":"Dias Activos", isGeneral?`${generalData?.totals?.parcelsCount||0}`:`${reportData?.dailyHarvest?.length||0}`, 8,145,178],
      ];
      kpis.forEach((k,i) => pdfKpi(pdf, ML+i*(kw+6), y, kw, k[0], k[1], k[2], k[3], k[4]));
      y += 48;

      if (isGeneral) {
        // Separate parcels with/without harvest
        const allP = (generalData?.parcels||[]) as any[];
        const withHarvest = allP.filter((p:any) => p.weekTotal > 0);
        const noHarvest = allP.filter((p:any) => p.weekTotal <= 0);
        // Risk: lowest NDVI among harvest parcels, or most open notes
        let riskParcel: any = null;
        if (withHarvest.length > 0) {
          const withNdvi = withHarvest.filter((p:any) => p.ndviLast || p.ndviAvg);
          if (withNdvi.length) riskParcel = withNdvi.reduce((a:any,b:any) => ((b.ndviLast||b.ndviAvg||1) < (a.ndviLast||a.ndviAvg||1)) ? b : a);
        }

        // Risk callout
        if (riskParcel) {
          pdf.setFillColor(254,242,242); pdf.roundedRect(ML, y, CW, 16, 3, 3, "F");
          pdf.setDrawColor(252,165,165); pdf.roundedRect(ML, y, CW, 16, 3, 3, "S");
          pdf.setFillColor(239,68,68); pdf.roundedRect(ML, y+3, 3, 10, 1, 1, "F");
          pdf.setFontSize(7); pdf.setFont("helvetica","bold"); pdf.setTextColor(153,27,27);
          pdf.text(safe(`MAYOR RIESGO: ${riskParcel.name} - NDVI ${(riskParcel.ndviLast||riskParcel.ndviAvg||0).toFixed(3)} | ${riskParcel.notesOpen} notas abiertas`), ML+10, y+11);
          y += 20;
        }

        // Active harvest parcels
        if (withHarvest.length > 0) {
          pdfSectionTitle(pdf, ML, y, `Parcelas con Cosecha (${withHarvest.length})`); y += 18;
          const gw = [CW*0.24, CW*0.11, CW*0.11, CW*0.10, CW*0.12, CW*0.14, CW*0.18];
          const gRows = withHarvest.map((p:any) => [
            p.name||p.code, `${p.weekTotal}`, `${p.weekFirstQ}`, `${p.weekBoxes}`,
            (p.ndviLast||p.ndviAvg) ? (p.ndviLast||p.ndviAvg).toFixed(3) : "-",
            (p.ndviAvg) ? p.ndviAvg.toFixed(3) : "-",
            `${p.notesCount} (${p.notesOpen})`
          ]);
          const rowColors = withHarvest.map((p:any) => {
            if (riskParcel && p.id === riskParcel.id) return [254,226,226] as [number,number,number]; // red tint for risk
            return [235,251,242] as [number,number,number]; // green tint for active
          });
          y = pdfTable(pdf, ML, y, ["Parcela","kg","1ra Cal.","Cajas","NDVI Ult.","NDVI Prom","Notas"], gRows, gw, rowColors);
          y = pdfTotalRow(pdf, ML, y, ["SUBTOTAL",`${withHarvest.reduce((s:number,p:any)=>s+p.weekTotal,0).toFixed(1)}`,`${withHarvest.reduce((s:number,p:any)=>s+p.weekFirstQ,0).toFixed(1)}`,`${withHarvest.reduce((s:number,p:any)=>s+p.weekBoxes,0)}`,"-","-",`${withHarvest.reduce((s:number,p:any)=>s+p.notesCount,0)}`], gw);
          y += 8;
        }

        // Inactive parcels (no harvest)
        if (noHarvest.length > 0) {
          pdfSectionTitle(pdf, ML, y, `Sin Cosecha esta semana (${noHarvest.length})`); y += 18;
          const gw2 = [CW*0.35, CW*0.18, CW*0.18, CW*0.29];
          const gRows2 = noHarvest.map((p:any) => [
            p.name||p.code, (p.ndviLast||p.ndviAvg) ? (p.ndviLast||p.ndviAvg).toFixed(3) : "-",
            p.ndviAvg ? p.ndviAvg.toFixed(3) : "-", `${p.notesCount} (${p.notesOpen} abiertas)`
          ]);
          const grayColors = noHarvest.map(() => [245,245,245] as [number,number,number]);
          y = pdfTable(pdf, ML, y, ["Parcela","NDVI Ult.","NDVI Prom","Notas"], gRows2, gw2, grayColors);
          y += 4;
        }

        // Total row
        pdf.setFillColor(6, 95, 70); pdf.roundedRect(ML, y, CW, 18, 2, 2, "F");
        pdf.setFontSize(8); pdf.setFont("helvetica","bold"); pdf.setTextColor(255,255,255);
        pdf.text(safe(`TOTAL: ${generalData?.totals?.harvest} kg | ${generalData?.totals?.boxes} cajas | ${generalData?.totals?.notes} notas | ${generalData?.totals?.parcelsCount} parcelas`), ML+8, y+12);
        y += 22;
      } else {
        // Two columns
        const leftW = CW * 0.54;
        const rightX = ML + leftW + 12;
        const rightW = CW - leftW - 12;

        pdfSectionTitle(pdf, ML, y, "Cosecha Diaria"); y += 18;
        const hw = [leftW*0.22,leftW*0.14,leftW*0.18,leftW*0.16,leftW*0.15,leftW*0.15];
        const hRows = (reportData?.dailyHarvest||[]).map((d:any) => [
          fmtDateShort(d.date), `${d.totalBoxes}`, `${d.totalWeight}`,
          `${d.firstQualityWeight}`, `${d.secondQualityWeight}`, `${d.wasteWeight}`
        ]);
        const tEnd = pdfTable(pdf, ML, y, ["Fecha","Cajas","Total kg","1ra","2da","Desp."], hRows, hw);

        // Right: satellite
        let ry = y - 18;
        pdfSectionTitle(pdf, rightX, ry, "Indices Satelitales"); ry += 18;
        const sw = [rightW*0.2, rightW*0.22, rightW*0.22, rightW*0.36];
        const sRows = ["NDVI","NDRE","NDMI"].map(idx => {
          const pts = (reportData?.satelliteData?.[idx]?.data||[]).filter((d:any)=>d.mean!=null);
          const avg = pts.length ? (pts.reduce((s:number,d:any)=>s+d.mean,0)/pts.length) : null;
          const last = pts.length ? pts[pts.length-1].mean : null;
          const t = getSatTrend(reportData?.satelliteData?.[idx]);
          return [idx, avg?.toFixed(4)||"-", last?.toFixed(4)||"-", `${t.t} ${t.l}`];
        });
        ry = pdfTable(pdf, rightX, ry, ["Indice","Media","Ultimo","Tendencia"], sRows, sw);
        ry += 10;

        // Right: notes
        pdfSectionTitle(pdf, rightX, ry, "Notas de Campo"); ry += 18;
        const nbw = (rightW - 8) / 3;
        [
          {label:"Total",val:`${slaSummary?.total||0}`,r:6,g:95,b:70},
          {label:"Resueltas",val:`${slaSummary?.resolved||0}`,r:16,g:185,b:129},
          {label:"Abiertas",val:`${slaSummary?.open||0}`,r:(slaSummary?.open||0)>0?239:6,g:(slaSummary?.open||0)>0?68:95,b:(slaSummary?.open||0)>0?68:70},
        ].forEach((b,i) => {
          const bx = rightX + i*(nbw+4);
          pdf.setFillColor(245,252,248); pdf.roundedRect(bx, ry, nbw, 28, 2, 2, "F");
          pdf.setDrawColor(209,250,229); pdf.roundedRect(bx, ry, nbw, 28, 2, 2, "S");
          pdf.setFontSize(13); pdf.setFont("helvetica","bold"); pdf.setTextColor(b.r,b.g,b.b);
          pdf.text(safe(b.val), bx+nbw/2, ry+13, {align:"center"});
          pdf.setFontSize(6); pdf.setFont("helvetica","normal"); pdf.setTextColor(107,114,128);
          pdf.text(safe(b.label), bx+nbw/2, ry+22, {align:"center"});
        });
        ry += 32;
        if (slaSummary?.avgSla) {
          pdf.setFontSize(7); pdf.setFont("helvetica","normal"); pdf.setTextColor(55,65,81);
          pdf.text(safe(`SLA promedio: ${slaSummary.avgSla}h`), rightX, ry+6);
        }
        y = Math.max(tEnd, ry) + 10;
      }

      // Weather
      if (weatherSummary) {
        pdfSectionTitle(pdf, ML, y, "Clima"); y += 16;
        pdf.setFontSize(7.5); pdf.setFont("helvetica","normal"); pdf.setTextColor(55,65,81);
        pdf.text(safe(`Temp. Max prom: ${weatherSummary.avgMax} C  |  Min prom: ${weatherSummary.avgMin} C  |  Lluvia acum: ${weatherSummary.totalRain} mm`), ML + 8, y+6);
        y += 14;
      }

      // AI
      if (aiText) { y = pdfAiBox(pdf, ML, y, CW, aiText) + 4; }

      pdfFooter(pdf, 1, totalPages, now, logoB64);

      // ── EXTENDED PAGES ──
      if (reportMode === "extended" && !isGeneral && reportData) {
        // PAGE 2
        pdf.addPage();
        pdfSubHeader(pdf, "Cosecha Detallada + Clima", `${titleName} | ${period}`, logoB64);
        y = 44;
        const h2w = [CW*0.17, CW*0.12, CW*0.18, CW*0.18, CW*0.17, CW*0.18];
        const h2Rows = (reportData.dailyHarvest||[]).map((d:any)=>[
          fmtDateShort(d.date), `${d.totalBoxes}`, `${d.totalWeight}`,
          `${d.firstQualityWeight}`, `${d.secondQualityWeight}`, `${d.wasteWeight}`
        ]);
        y = pdfTable(pdf, ML, y, ["Fecha","Cajas","Total (kg)","1ra Cal.","2da Cal.","Desperdicio"], h2Rows, h2w);
        const secQ = (reportData.dailyHarvest||[]).reduce((s:number,d:any)=>s+(d.secondQualityWeight||0),0);
        const waste = (reportData.dailyHarvest||[]).reduce((s:number,d:any)=>s+(d.wasteWeight||0),0);
        y = pdfTotalRow(pdf, ML, y, ["TOTAL", `${weeklyBoxes}`, weeklyHarvestTotal.toFixed(2), weeklyFirstQ.toFixed(2), secQ.toFixed(2), waste.toFixed(2)], h2w);
        y += 16;

        if (weatherSummary && reportData.weatherData) {
          pdfSectionTitle(pdf, ML, y, "Clima Diario"); y += 14;
          const wbw = (CW-18)/4;
          [{l:"Temp. Max",v:`${weatherSummary.avgMax} C`,r:220,g:38,b:38},{l:"Temp. Min",v:`${weatherSummary.avgMin} C`,r:37,g:99,b:235},{l:"Lluvia",v:`${weatherSummary.totalRain} mm`,r:5,g:150,b:105},{l:"Dias",v:`${weatherSummary.days}`,r:139,g:92,b:246}].forEach((w,i) => {
            pdfKpi(pdf, ML+i*(wbw+6), y, wbw, w.l, w.v, w.r, w.g, w.b);
          });
          y += 48;
          const wtw = [CW*0.3, CW*0.23, CW*0.23, CW*0.24];
          const wtRows = ((reportData.weatherData as any[])||[]).map((w:any) => [
            fmtDateShort(w.date), (w.temperatureMax||0).toFixed(1), (w.temperatureMin||0).toFixed(1), (w.precipitation||0).toFixed(1)
          ]);
          y = pdfTable(pdf, ML, y, ["Fecha","Max C","Min C","Lluvia mm"], wtRows, wtw);
        }
        pdfFooter(pdf, 2, 4, now, logoB64);

        // PAGE 3: Satellite
        pdf.addPage();
        pdfSubHeader(pdf, "Telemetria Satelital", `${titleName} | ${period}`, logoB64);
        y = 44;
        const mapW = (CW - 20) / 3;
        (["NDVI","NDRE","NDMI"] as const).forEach((idx, i) => {
          const mx = ML + i * (mapW + 10);
          pdf.setFontSize(10); pdf.setFont("helvetica","bold"); pdf.setTextColor(6,95,70);
          pdf.text(idx, mx + mapW/2, y + 10, {align:"center"});
          const img = satMaps[idx];
          if (img) {
            try { pdf.addImage(img, "PNG", mx, y+14, mapW, mapW*0.75, undefined, "FAST"); } catch {}
          } else {
            pdf.setFillColor(249,250,251); pdf.roundedRect(mx, y+14, mapW, mapW*0.75, 3, 3, "F");
            pdf.setDrawColor(209,213,219); pdf.roundedRect(mx, y+14, mapW, mapW*0.75, 3, 3, "S");
            pdf.setFontSize(7); pdf.setFont("helvetica","normal"); pdf.setTextColor(156,163,175);
            pdf.text("Sin imagen", mx+mapW/2, y+14+mapW*0.375, {align:"center"});
          }
          const tr = getSatTrend(reportData.satelliteData?.[idx]);
          pdf.setFontSize(8); pdf.setFont("helvetica","bold"); pdf.setTextColor(tr.c[0],tr.c[1],tr.c[2]);
          pdf.text(safe(`${tr.t} ${tr.l}`), mx+mapW/2, y+20+mapW*0.75, {align:"center"});
        });
        y += 30 + mapW*0.75 + 10;
        const stw = [CW*0.13,CW*0.17,CW*0.17,CW*0.17,CW*0.17,CW*0.19];
        const stRows = ["NDVI","NDRE","NDMI"].map(idx => {
          const pts = (reportData.satelliteData?.[idx]?.data||[]).filter((d:any)=>d.mean!=null);
          const means = pts.map((d:any)=>d.mean);
          const avg = means.length ? means.reduce((a:number,b:number)=>a+b,0)/means.length : null;
          const tr = getSatTrend(reportData.satelliteData?.[idx]);
          return [idx, avg?.toFixed(4)||"-", means.length?Math.min(...means).toFixed(4):"-", means.length?Math.max(...means).toFixed(4):"-", means.length?means[means.length-1].toFixed(4):"-", `${tr.t} ${tr.l}`];
        });
        y = pdfTable(pdf, ML, y, ["Indice","Media","Min","Max","Ultimo","Tendencia"], stRows, stw);
        y += 12;
        if (reportData.aiAnalysis) { y = pdfAiBox(pdf, ML, y, CW, reportData.aiAnalysis) + 4; }
        pdfFooter(pdf, 3, 4, now, logoB64);

        // PAGE 4: Notes
        pdf.addPage();
        pdfSubHeader(pdf, "Notas de Campo & SLA", `${titleName} | ${period}`, logoB64);
        y = 44;
        const skw = (CW-18)/4;
        [{l:"Total",v:`${slaSummary?.total||0}`,r:245,g:158,b:11},{l:"Resueltas",v:`${slaSummary?.resolved||0}`,r:16,g:185,b:129},{l:"Abiertas",v:`${slaSummary?.open||0}`,r:239,g:68,b:68},{l:"SLA Prom",v:slaSummary?.avgSla?`${slaSummary.avgSla}h`:"N/A",r:139,g:92,b:246}].forEach((k,i) => pdfKpi(pdf, ML+i*(skw+6), y, skw, k.l, k.v, k.r, k.g, k.b));
        y += 50;
        if (slaSummary && slaSummary.overSla > 0) {
          pdf.setFillColor(254,242,242); pdf.roundedRect(ML, y, CW, 14, 2, 2, "F");
          pdf.setFontSize(7); pdf.setFont("helvetica","bold"); pdf.setTextColor(153,27,27);
          pdf.text(safe(`ALERTA: ${slaSummary.overSla} notas exceden SLA de 48 horas`), ML+8, y+10);
          y += 18;
        }
        const notes = (reportData.fieldNotes as any[])||[];
        if (notes.length > 0) {
          const nw = [CW*0.10,CW*0.16,CW*0.10,CW*0.12,CW*0.10,CW*0.08,CW*0.34];
          const nRows = notes.slice(0,25).map((n:any) => {
            const sla = calcSlaHours(n.createdAt, n.resolvedAt);
            const over = !n.resolvedAt && (Date.now()-new Date(n.createdAt).getTime())/3600000>48;
            return [n.folio, catLabels[n.category]||n.category, sevLabels[n.severity]||n.severity,
              statusLabels[n.status]||n.status, fmtDateShort(n.createdAt),
              sla!=null?`${sla}h`:over?"!":"-", n.description?.substring(0,38)||""];
          });
          y = pdfTable(pdf, ML, y, ["Folio","Categoria","Prior.","Estado","Fecha","SLA","Descripcion"], nRows, nw);
        } else {
          pdf.setFontSize(8); pdf.setFont("helvetica","normal"); pdf.setTextColor(156,163,175);
          pdf.text("Sin notas en este periodo", PW/2, y+16, {align:"center"}); y += 24;
        }
        if (slaSummary && Object.keys(slaSummary.catCounts).length > 0) {
          y += 8;
          pdfSectionTitle(pdf, ML, y, "Distribucion por Categoria"); y += 16;
          let cx = ML;
          Object.entries(slaSummary.catCounts).sort((a,b)=>b[1]-a[1]).forEach(([cat,count]) => {
            const label = catLabels[cat]||cat;
            const bw = Math.max(55, label.length * 5 + 30);
            if (cx + bw > PW - MR) { cx = ML; y += 22; }
            pdf.setFillColor(245,252,248); pdf.roundedRect(cx, y, bw, 16, 2, 2, "F");
            pdf.setDrawColor(209,250,229); pdf.roundedRect(cx, y, bw, 16, 2, 2, "S");
            pdf.setFontSize(10); pdf.setFont("helvetica","bold"); pdf.setTextColor(6,95,70);
            pdf.text(`${count}`, cx+6, y+12);
            pdf.setFontSize(6); pdf.setFont("helvetica","normal"); pdf.setTextColor(55,65,81);
            pdf.text(safe(label), cx+18, y+11);
            cx += bw + 6;
          });
        }
        pdfFooter(pdf, 4, 4, now, logoB64);
      }

      const name = isGeneral ? "General" : (reportData?.parcel?.name || "parcela").replace(/\s+/g, "_");
      pdf.save(`Reporte_${safe(name)}_${fromDate}_${toDate}.pdf`);
      toast.success("PDF descargado", { id: "pdf-gen" });
    } catch (err) {
      console.error("PDF error:", err);
      toast.error("Error generando PDF", { id: "pdf-gen" });
    } finally { setGenerating(false); }
  }

  // ═══════════════════════════════════════════
  // UI
  // ═══════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50/50 to-teal-50/30 pb-32">
      <div className="container max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg">
            <FileText className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-green-900">Reportes</h1>
            <p className="text-sm text-green-600">Genera reportes PDF semanales con análisis IA</p>
          </div>
        </div>

        <GlassCard className="p-4 md:p-5" hover={false}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1.5 block">Alcance</label>
              <div className="flex gap-2">
                <button onClick={()=>setIsGeneral(false)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${!isGeneral?"bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg":"bg-white/60 text-green-700 border border-green-200/50"}`}><Filter className="h-3.5 w-3.5"/> Por Parcela</button>
                <button onClick={()=>{setIsGeneral(true);setSelectedParcelId(null);}} className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${isGeneral?"bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg":"bg-white/60 text-green-700 border border-green-200/50"}`}><Globe className="h-3.5 w-3.5"/> General</button>
              </div>
            </div>
            {!isGeneral && (
              <div>
                <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1.5 block">Parcela (con polígono)</label>
                <div className="relative">
                  <select value={selectedParcelId||""} onChange={e=>{const id=Number(e.target.value);setSelectedParcelId(id||null);const p=parcelsWithPolygon.find((p:any)=>p.id===id);setSelectedParcelCode(p?.code||"");}}
                    className="w-full rounded-xl border border-green-200/50 bg-white/70 px-4 py-2 text-sm text-green-900 focus:border-green-500 focus:outline-none appearance-none cursor-pointer">
                    <option value="">Selecciona parcela...</option>
                    {parcelsWithPolygon.map((p:any)=>(<option key={p.id} value={p.id}>{p.code} — {p.name}</option>))}
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-green-400 pointer-events-none"/>
                </div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1.5 block">Período</label>
              <div className="flex gap-1.5">
                {[{days:7,label:"1 Sem"},{days:14,label:"2 Sem"},{days:30,label:"1 Mes"}].map(({days,label})=>(
                  <button key={days} onClick={()=>setPeriodDays(days)} className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-all ${periodDays===days?"bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow":"bg-white/60 text-green-700 border border-green-200/50"}`}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1.5 block">Tipo</label>
              <div className="flex gap-1.5">
                <button onClick={()=>setReportMode("compact")} className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-all ${reportMode==="compact"?"bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow":"bg-white/60 text-green-700 border border-green-200/50"}`}>📄 Resumido</button>
                <button onClick={()=>setReportMode("extended")} className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-all ${reportMode==="extended"?"bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow":"bg-white/60 text-green-700 border border-green-200/50"}`}>📋 Extendido</button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1.5 block">Rango</label>
              <div className="flex items-center gap-2 bg-white/60 rounded-lg border border-green-200/50 px-3 py-2">
                <Calendar className="h-3.5 w-3.5 text-green-500"/>
                <span className="text-xs text-green-800">{fmtDate(fromDate)} — {fmtDate(toDate)}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-center">
            <button onClick={generatePDF} disabled={!dataReady||generating||loading}
              className={`flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold transition-all duration-300 ${dataReady&&!generating?"bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95":"bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
              {generating?<><Loader2 className="h-4 w-4 animate-spin"/>Generando...</>:loading?<><Loader2 className="h-4 w-4 animate-spin"/>Cargando datos...</>:<><Download className="h-4 w-4"/>Generar Reporte PDF ({reportMode==="compact"?"1 pag":"4 pags"})</>}
            </button>
          </div>
        </GlassCard>

        {dataReady && (
          <GlassCard className="p-4" hover={false}>
            <h3 className="text-xs font-semibold text-green-700 mb-3 flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5"/> Vista previa · {titleName}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <MiniKPI icon={Package} label="Cosecha" value={`${weeklyHarvestTotal.toFixed(1)} kg`} color="from-green-400 to-emerald-500"/>
              <MiniKPI icon={TrendingUp} label="1ra Calidad" value={`${firstQPct}%`} color="from-emerald-400 to-green-500"/>
              <MiniKPI icon={ClipboardList} label="Notas" value={`${slaSummary?.total||0}`} color="from-yellow-400 to-orange-500"/>
              <MiniKPI icon={CloudSun} label="Lluvia" value={weatherSummary?`${weatherSummary.totalRain} mm`:"N/D"} color="from-blue-400 to-cyan-500"/>
            </div>

            {/* General preview table */}
            {isGeneral && generalData?.parcels && (
              <div className="mb-3">
                {(() => {
                  const ps = generalData.parcels as any[];
                  const active = ps.filter((p:any) => p.weekTotal > 0);
                  const inactive = ps.filter((p:any) => p.weekTotal <= 0);
                  const risk = active.filter((p:any) => p.ndviLast || p.ndviAvg).sort((a:any,b:any) => (a.ndviLast||a.ndviAvg||1) - (b.ndviLast||b.ndviAvg||1))[0];
                  return (
                    <>
                      {risk && (
                        <div className="bg-red-50/80 backdrop-blur-sm rounded-xl border border-red-200/40 p-2.5 mb-2 flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-red-400 to-red-500 shadow-sm"><span className="text-white text-xs font-bold">!</span></div>
                          <div>
                            <span className="text-[10px] font-bold text-red-700">Mayor riesgo: </span>
                            <span className="text-[10px] text-red-600">{risk.name} — NDVI {(risk.ndviLast||risk.ndviAvg||0).toFixed(3)} | {risk.notesOpen} notas abiertas</span>
                          </div>
                        </div>
                      )}
                      <div className="overflow-hidden rounded-xl border border-green-200/30 backdrop-blur-sm">
                        <table className="w-full text-[11px]">
                          <thead><tr className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
                            <th className="px-2 py-1.5 text-left font-semibold">Parcela</th>
                            <th className="px-2 py-1.5 text-right font-semibold">kg</th>
                            <th className="px-2 py-1.5 text-right font-semibold">NDVI</th>
                            <th className="px-2 py-1.5 text-right font-semibold">Notas</th>
                          </tr></thead>
                          <tbody>
                            {active.map((p:any,i:number) => (
                              <tr key={p.id} className={`${risk&&p.id===risk.id?'bg-red-50/60':'bg-green-50/40'} ${i%2===0?'bg-opacity-60':'bg-opacity-30'} border-b border-green-100/30`}>
                                <td className="px-2 py-1 font-semibold text-green-800">{p.name}</td>
                                <td className="px-2 py-1 text-right font-bold text-green-700">{p.weekTotal}</td>
                                <td className={`px-2 py-1 text-right font-semibold ${(p.ndviLast||p.ndviAvg||0)>0.5?'text-green-600':(p.ndviLast||p.ndviAvg||0)>0.3?'text-yellow-600':'text-red-500'}`}>{(p.ndviLast||p.ndviAvg) ? (p.ndviLast||p.ndviAvg).toFixed(3) : '-'}</td>
                                <td className={`px-2 py-1 text-right ${p.notesOpen>0?'text-red-500 font-bold':'text-green-600'}`}>{p.notesCount}{p.notesOpen>0?` (${p.notesOpen})`:''}</td>
                              </tr>
                            ))}
                            {inactive.length > 0 && (
                              <tr className="bg-gray-100/60 border-t-2 border-gray-200">
                                <td colSpan={4} className="px-2 py-1 text-[10px] text-gray-500 font-medium">{inactive.length} parcela(s) sin cosecha: {inactive.map((p:any)=>p.name||p.code).join(', ')}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {aiText && (
              <div className="relative overflow-hidden bg-green-50/60 backdrop-blur-xl rounded-xl border border-green-200/30 p-3">
                <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
                <div className="relative z-10">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Brain className="h-3.5 w-3.5 text-green-600"/>
                    <span className="text-[10px] font-semibold text-green-700">IA Agra Tec-ti · Análisis Semanal</span>
                  </div>
                  <p className="text-xs text-green-800 leading-relaxed line-clamp-4">{stripMd(aiText).substring(0,400)}...</p>
                </div>
              </div>
            )}
          </GlassCard>
        )}

        {!dataReady && !loading && (
          <GlassCard className="p-8 text-center" hover={false}>
            <FileText className="h-14 w-14 mx-auto text-green-200 mb-3"/>
            <h3 className="text-base font-semibold text-green-800 mb-1">{isGeneral?"Listo para generar":"Selecciona una parcela"}</h3>
            <p className="text-green-600 text-xs">{isGeneral?"Haz click en Generar para el reporte general":"Solo se muestran parcelas con polígono definido"}</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}

function MiniKPI({icon:Icon,label,value,color}:{icon:any;label:string;value:string;color:string}) {
  return (
    <div className="bg-white/50 rounded-xl border border-green-100/30 p-2.5">
      <div className="flex items-center gap-1.5 mb-0.5">
        <div className={`flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br ${color} shadow-sm`}><Icon className="h-3 w-3 text-white"/></div>
        <span className="text-[9px] text-green-600">{label}</span>
      </div>
      <div className="text-base font-bold text-green-900">{value}</div>
    </div>
  );
}
