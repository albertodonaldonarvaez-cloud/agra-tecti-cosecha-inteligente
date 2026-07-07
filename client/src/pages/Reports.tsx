import { useState, useMemo, useRef, useEffect } from "react";
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
function hexToRgb(h: string):[number,number,number] { const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16); return[r,g,b]; }

const sevLabels: Record<string,string> = {baja:"Baja",media:"Media",alta:"Alta",critica:"Crítica"};
const sevColors: Record<string,string> = {baja:"#3B82F6",media:"#F59E0B",alta:"#F97316",critica:"#EF4444"};
const catLabels: Record<string,string> = {
  plaga_enfermedad:"Plaga/Enfermedad",riego_drenaje:"Riego/Drenaje",arboles_mal_plantados:"Árboles",
  dano_mecanico:"Daño Mecánico",maleza:"Maleza",fertilizacion:"Fertilización",suelo:"Suelo",
  infraestructura:"Infraestructura",fauna:"Fauna",otro:"Otro",
};
const statusLabels: Record<string,string> = {abierta:"Abierta",en_revision:"En revisión",en_progreso:"En progreso",resuelta:"Resuelta",descartada:"Descartada"};

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
// Native jsPDF builder helpers
// ════════════════════════════════════════════════
const PW = 612; // letter width pt
const PH = 792; // letter height pt
const ML = 40;  // margin left
const MR = 40;
const CW = PW - ML - MR; // content width

function drawGradientRect(pdf: jsPDF, x: number, y: number, w: number, h: number, c1: [number,number,number], c2: [number,number,number], steps=20) {
  const sw = w / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    pdf.setFillColor(c1[0]+(c2[0]-c1[0])*t, c1[1]+(c2[1]-c1[1])*t, c1[2]+(c2[2]-c1[2])*t);
    pdf.rect(x + i * sw, y, sw + 0.5, h, "F");
  }
}

function drawHeader(pdf: jsPDF, title: string, subtitle: string, period: string, logoB64: string|null) {
  drawGradientRect(pdf, 0, 0, PW, 62, [6,95,70], [52,211,153]);
  if (logoB64) { try { pdf.addImage(logoB64, "PNG", ML, 10, 36, 36); } catch {} }
  pdf.setFont("helvetica","bold"); pdf.setFontSize(18); pdf.setTextColor(255,255,255);
  pdf.text("AGRA TEC-TI", ML + (logoB64 ? 42 : 0), 28);
  pdf.setFontSize(8); pdf.setFont("helvetica","normal"); pdf.setTextColor(255,255,255);
  pdf.text(subtitle, ML + (logoB64 ? 42 : 0), 39);
  pdf.setFont("helvetica","bold"); pdf.setFontSize(11); pdf.setTextColor(255,255,255);
  pdf.text(title, PW - MR, 24, { align: "right" });
  pdf.setFontSize(8); pdf.setFont("helvetica","normal");
  pdf.text(period, PW - MR, 36, { align: "right" });
}

function drawSubHeader(pdf: jsPDF, title: string, info: string, logoB64: string|null) {
  drawGradientRect(pdf, 0, 0, PW, 38, [6,95,70], [5,150,105]);
  if (logoB64) { try { pdf.addImage(logoB64, "PNG", ML, 6, 24, 24); } catch {} }
  pdf.setFont("helvetica","bold"); pdf.setFontSize(13); pdf.setTextColor(255,255,255);
  pdf.text(title, ML + (logoB64 ? 30 : 0), 24);
  pdf.setFont("helvetica","normal"); pdf.setFontSize(7.5); pdf.setTextColor(220,240,230);
  pdf.text(info, PW - MR, 22, { align: "right" });
}

function drawFooter(pdf: jsPDF, page: number, total: number, now: string, logoB64: string|null) {
  const y = PH - 18;
  pdf.setDrawColor(209,250,229); pdf.line(ML, y - 4, PW - MR, y - 4);
  if (logoB64) { try { pdf.addImage(logoB64, "PNG", ML, y - 3, 10, 10); } catch {} }
  pdf.setFontSize(6); pdf.setFont("helvetica","normal"); pdf.setTextColor(156,163,175);
  pdf.text(`AGRA TEC-TI · ${now} · Confidencial`, ML + 14, y + 4);
  pdf.text(`Página ${page} de ${total}`, PW - MR, y + 4, { align: "right" });
}

function drawKpiBox(pdf: jsPDF, x: number, y: number, w: number, label: string, value: string, color: [number,number,number]) {
  pdf.setFillColor(color[0], color[1], color[2]); pdf.roundedRect(x, y, w, 40, 3, 3, "F");
  // lighter inner
  pdf.setFillColor(Math.min(color[0]+30,255), Math.min(color[1]+30,255), Math.min(color[2]+30,255));
  pdf.roundedRect(x+1, y+1, w-2, 38, 3, 3, "F");
  // white overlay
  pdf.setFillColor(255,255,255); pdf.roundedRect(x+2, y+2, w-4, 36, 2, 2, "F");
  pdf.setFontSize(7); pdf.setFont("helvetica","normal"); pdf.setTextColor(107,114,128);
  pdf.text(label.toUpperCase(), x + 10, y + 14);
  pdf.setFontSize(16); pdf.setFont("helvetica","bold"); pdf.setTextColor(color[0],color[1],color[2]);
  pdf.text(value, x + 10, y + 30);
}

function drawTable(pdf: jsPDF, x: number, y: number, headers: string[], rows: string[][], colWidths: number[]): number {
  const rh = 14; const hrh = 16;
  // header
  drawGradientRect(pdf, x, y, colWidths.reduce((a,b)=>a+b,0), hrh, [6,95,70], [5,150,105]);
  pdf.setFontSize(7.5); pdf.setFont("helvetica","bold"); pdf.setTextColor(255,255,255);
  let cx = x;
  headers.forEach((h,i) => { pdf.text(h, cx+4, y+11); cx += colWidths[i]; });
  let curY = y + hrh;
  // rows
  rows.forEach((row, ri) => {
    if (ri % 2 === 0) { pdf.setFillColor(240,253,244); pdf.rect(x, curY, colWidths.reduce((a,b)=>a+b,0), rh, "F"); }
    pdf.setDrawColor(209,250,229); pdf.line(x, curY + rh, x + colWidths.reduce((a,b)=>a+b,0), curY + rh);
    cx = x;
    row.forEach((cell, ci) => {
      pdf.setFontSize(7.5); pdf.setFont("helvetica", ci === 0 ? "bold" : "normal");
      pdf.setTextColor(ci === 0 ? 6 : 55, ci === 0 ? 95 : 65, ci === 0 ? 70 : 81);
      const txt = cell.length > 22 ? cell.substring(0, 20) + "…" : cell;
      pdf.text(txt, cx + 4, curY + 10);
      cx += colWidths[ci];
    });
    curY += rh;
  });
  return curY;
}

function drawTotalRow(pdf: jsPDF, x: number, y: number, cells: string[], colWidths: number[]): number {
  const h = 16;
  drawGradientRect(pdf, x, y, colWidths.reduce((a,b)=>a+b,0), h, [6,95,70], [5,150,105]);
  pdf.setFontSize(8); pdf.setFont("helvetica","bold"); pdf.setTextColor(255,255,255);
  let cx = x;
  cells.forEach((c, i) => { pdf.text(c, cx+4, y+11); cx += colWidths[i]; });
  return y + h;
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

  const getSatelliteTrend = (data:any) => {
    if (!data?.data||!Array.isArray(data.data)||data.data.length<2) return {trend:"→",label:"Sin datos",color:"#6b7280"};
    const pts = data.data.filter((d:any)=>d.mean!=null).slice(-4);
    if (pts.length<2) return {trend:"→",label:"Estable",color:"#f59e0b"};
    const diff = pts[pts.length-1].mean - pts[0].mean;
    if (diff>0.03) return {trend:"↑",label:"Mejorando",color:"#10b981"};
    if (diff<-0.03) return {trend:"↓",label:"Deteriorando",color:"#ef4444"};
    return {trend:"→",label:"Estable",color:"#f59e0b"};
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
  // PDF Generation — native jsPDF (no images)
  // ══════════════════════════════════════════
  async function generatePDF() {
    if (!dataReady) return;
    setGenerating(true);
    toast.loading("Generando PDF...", { id: "pdf-gen" });
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
      const periodStr = `${fmtDate(fromDate)} — ${fmtDate(toDate)}`;

      // ── PAGE 1 ──
      drawHeader(pdf, titleName, isGeneral ? "Reporte General" : "Reporte por Parcela", periodStr, logoB64);
      let y = 70;

      // KPIs
      const kw = (CW - 24) / 4;
      const kpis = [
        { label: "Cosecha Total", value: `${weeklyHarvestTotal.toFixed(1)} kg`, color: [5,150,105] as [number,number,number] },
        { label: "1ra Calidad", value: `${firstQPct}%`, color: [4,120,87] as [number,number,number] },
        { label: "Cajas", value: `${weeklyBoxes}`, color: [13,148,136] as [number,number,number] },
        { label: isGeneral?"Parcelas":"Días Activos", value: isGeneral?`${generalData?.totals?.parcelsCount||0}`:`${reportData?.dailyHarvest?.length||0}`, color: [8,145,178] as [number,number,number] },
      ];
      kpis.forEach((k,i) => drawKpiBox(pdf, ML + i*(kw+8), y, kw, k.label, k.value, k.color));
      y += 50;

      if (isGeneral) {
        // General: per-parcel table
        const gHeaders = ["Parcela","kg","1ra Cal.","Cajas","NDVI","Notas"];
        const gWidths = [CW*0.28, CW*0.13, CW*0.13, CW*0.12, CW*0.16, CW*0.18];
        const gRows = (generalData?.parcels||[]).map((p:any) => [
          p.name||p.code, `${p.weekTotal}`, `${p.weekFirstQ}`, `${p.weekBoxes}`,
          p.ndviAvg ? p.ndviAvg.toFixed(3) : "—", `${p.notesCount} (${p.notesOpen})`
        ]);
        y = drawTable(pdf, ML, y, gHeaders, gRows, gWidths);
        y = drawTotalRow(pdf, ML, y, ["TOTAL",`${generalData?.totals?.harvest}`,`${generalData?.totals?.firstQ}`,`${generalData?.totals?.boxes}`,"—",`${generalData?.totals?.notes}`], gWidths);
        y += 10;
      } else {
        // Single: two columns
        const leftW = CW * 0.55;
        const rightX = ML + leftW + 10;
        const rightW = CW - leftW - 10;

        // Left: harvest table
        const hHeaders = ["Fecha","Cajas","Total kg","1ra","2da","Desp."];
        const hw = [leftW*0.22,leftW*0.14,leftW*0.18,leftW*0.16,leftW*0.15,leftW*0.15];
        const hRows = (reportData?.dailyHarvest||[]).map((d:any) => [
          fmtDateShort(d.date), `${d.totalBoxes}`, `${d.totalWeight}`,
          `${d.firstQualityWeight}`, `${d.secondQualityWeight}`, `${d.wasteWeight}`
        ]);
        const tableEnd = drawTable(pdf, ML, y, hHeaders, hRows, hw);

        // Right: satellite + notes
        let ry = y;
        pdf.setFontSize(9); pdf.setFont("helvetica","bold"); pdf.setTextColor(6,95,70);
        pdf.text("🛰️ Índices Satelitales", rightX, ry + 10); ry += 16;
        const sHeaders = ["Índice","Media","Último","Tendencia"];
        const sw2 = [rightW*0.2, rightW*0.22, rightW*0.22, rightW*0.36];
        const sRows = ["NDVI","NDRE","NDMI"].map(idx => {
          const pts = (reportData?.satelliteData?.[idx]?.data||[]).filter((d:any)=>d.mean!=null);
          const avg = pts.length ? (pts.reduce((s:number,d:any)=>s+d.mean,0)/pts.length) : null;
          const last = pts.length ? pts[pts.length-1].mean : null;
          const t = getSatelliteTrend(reportData?.satelliteData?.[idx]);
          return [idx, avg?.toFixed(4)||"—", last?.toFixed(4)||"—", `${t.trend} ${t.label}`];
        });
        ry = drawTable(pdf, rightX, ry, sHeaders, sRows, sw2);
        ry += 8;

        // Notes summary boxes
        pdf.setFontSize(9); pdf.setFont("helvetica","bold"); pdf.setTextColor(6,95,70);
        pdf.text("📋 Notas de Campo", rightX, ry + 10); ry += 16;
        const nbw = (rightW - 8) / 3;
        [
          { label: "Total", value: `${slaSummary?.total||0}`, c: [6,95,70] },
          { label: "Resueltas", value: `${slaSummary?.resolved||0}`, c: [5,150,105] },
          { label: "Abiertas", value: `${slaSummary?.open||0}`, c: (slaSummary?.open||0)>0?[239,68,68]:[6,95,70] },
        ].forEach((b, i) => {
          const bx = rightX + i * (nbw + 4);
          pdf.setFillColor(240,253,244); pdf.roundedRect(bx, ry, nbw, 30, 2, 2, "F");
          pdf.setDrawColor(187,247,208); pdf.roundedRect(bx, ry, nbw, 30, 2, 2, "S");
          pdf.setFontSize(14); pdf.setFont("helvetica","bold"); pdf.setTextColor(b.c[0],b.c[1],b.c[2]);
          pdf.text(b.value, bx + nbw/2, ry + 14, { align: "center" });
          pdf.setFontSize(6); pdf.setFont("helvetica","normal"); pdf.setTextColor(107,114,128);
          pdf.text(b.label, bx + nbw/2, ry + 24, { align: "center" });
        });
        ry += 34;
        if (slaSummary?.avgSla) {
          pdf.setFontSize(7); pdf.setFont("helvetica","normal"); pdf.setTextColor(55,65,81);
          pdf.text(`⏱️ SLA promedio: ${slaSummary.avgSla}h`, rightX, ry + 6);
        }
        y = Math.max(tableEnd, ry) + 10;
      }

      // Weather
      if (weatherSummary) {
        pdf.setFontSize(9); pdf.setFont("helvetica","bold"); pdf.setTextColor(6,95,70);
        pdf.text("🌤️ Clima", ML, y + 10); y += 16;
        pdf.setFontSize(8); pdf.setFont("helvetica","normal"); pdf.setTextColor(55,65,81);
        pdf.text(`🌡️ Máx prom: ${weatherSummary.avgMax}°C    ❄️ Mín prom: ${weatherSummary.avgMin}°C    🌧️ Lluvia acum: ${weatherSummary.totalRain} mm`, ML, y + 8);
        y += 18;
      }

      // AI Analysis
      if (aiText) {
        pdf.setFillColor(240,253,244); pdf.roundedRect(ML, y, CW, Math.min(130, 60 + aiText.length * 0.12), 4, 4, "F");
        pdf.setDrawColor(187,247,208); pdf.roundedRect(ML, y, CW, Math.min(130, 60 + aiText.length * 0.12), 4, 4, "S");
        pdf.setFontSize(8); pdf.setFont("helvetica","bold"); pdf.setTextColor(6,95,70);
        pdf.text("🧠 Análisis IA — DeepSeek v4-flash", ML + 8, y + 12);
        pdf.setFontSize(7.5); pdf.setFont("helvetica","normal"); pdf.setTextColor(31,41,55);
        const aiLines = pdf.splitTextToSize(aiText.substring(0, 900), CW - 20);
        pdf.text(aiLines.slice(0, 12), ML + 8, y + 24);
      }

      drawFooter(pdf, 1, totalPages, now, logoB64);

      // ── EXTENDED PAGES ──
      if (reportMode === "extended" && !isGeneral && reportData) {
        // PAGE 2: Harvest detail + Weather
        pdf.addPage();
        drawSubHeader(pdf, "📦 Cosecha Detallada + Clima", `${titleName} · ${periodStr}`, logoB64);
        y = 48;
        const h2Headers = ["Fecha","Cajas","Total (kg)","1ra Cal.","2da Cal.","Desperdicio"];
        const h2w = [CW*0.17, CW*0.12, CW*0.18, CW*0.18, CW*0.17, CW*0.18];
        const h2Rows = (reportData.dailyHarvest||[]).map((d:any)=>[
          fmtDateShort(d.date), `${d.totalBoxes}`, `${d.totalWeight}`,
          `${d.firstQualityWeight}`, `${d.secondQualityWeight}`, `${d.wasteWeight}`
        ]);
        y = drawTable(pdf, ML, y, h2Headers, h2Rows, h2w);
        const secQ = (reportData.dailyHarvest||[]).reduce((s:number,d:any)=>s+(d.secondQualityWeight||0),0);
        const waste = (reportData.dailyHarvest||[]).reduce((s:number,d:any)=>s+(d.wasteWeight||0),0);
        y = drawTotalRow(pdf, ML, y, ["TOTAL", `${weeklyBoxes}`, weeklyHarvestTotal.toFixed(2), weeklyFirstQ.toFixed(2), secQ.toFixed(2), waste.toFixed(2)], h2w);
        y += 16;

        if (weatherSummary && reportData.weatherData) {
          pdf.setFontSize(10); pdf.setFont("helvetica","bold"); pdf.setTextColor(6,95,70);
          pdf.text("🌤️ Clima Diario", ML, y + 10); y += 18;
          // Weather KPI boxes
          const wbw = (CW - 24)/4;
          [
            {icon:"🌡️",label:"Temp. Máx",value:`${weatherSummary.avgMax}°C`,c:[220,38,38]},
            {icon:"❄️",label:"Temp. Mín",value:`${weatherSummary.avgMin}°C`,c:[37,99,235]},
            {icon:"🌧️",label:"Lluvia",value:`${weatherSummary.totalRain} mm`,c:[5,150,105]},
            {icon:"📅",label:"Días",value:`${weatherSummary.days}`,c:[139,92,246]},
          ].forEach((w,i) => {
            const bx = ML + i*(wbw+8);
            pdf.setFillColor(245,247,250); pdf.roundedRect(bx, y, wbw, 36, 3, 3, "F");
            pdf.setDrawColor(229,231,235); pdf.roundedRect(bx, y, wbw, 36, 3, 3, "S");
            pdf.setFontSize(13); pdf.setFont("helvetica","bold"); pdf.setTextColor(w.c[0],w.c[1],w.c[2]);
            pdf.text(w.value, bx+wbw/2, y+16, {align:"center"});
            pdf.setFontSize(6.5); pdf.setFont("helvetica","normal"); pdf.setTextColor(107,114,128);
            pdf.text(w.label, bx+wbw/2, y+28, {align:"center"});
          });
          y += 44;
          // Weather table
          const wtHeaders = ["Fecha","Máx °C","Mín °C","Lluvia mm"];
          const wtw = [CW*0.3, CW*0.23, CW*0.23, CW*0.24];
          const wtRows = ((reportData.weatherData as any[])||[]).map((w:any) => [
            fmtDateShort(w.date), (w.temperatureMax||0).toFixed(1), (w.temperatureMin||0).toFixed(1), (w.precipitation||0).toFixed(1)
          ]);
          y = drawTable(pdf, ML, y, wtHeaders, wtRows, wtw);
        }
        drawFooter(pdf, 2, 4, now, logoB64);

        // PAGE 3: Satellite
        pdf.addPage();
        drawSubHeader(pdf, "🛰️ Telemetría Satelital", `${titleName} · ${periodStr}`, logoB64);
        y = 48;
        // Satellite map images
        const mapW = (CW - 20) / 3;
        (["NDVI","NDRE","NDMI"] as const).forEach((idx, i) => {
          const mx = ML + i * (mapW + 10);
          pdf.setFontSize(11); pdf.setFont("helvetica","bold"); pdf.setTextColor(6,95,70);
          pdf.text(idx, mx + mapW/2, y + 10, {align:"center"});
          const img = satMaps[idx];
          if (img) {
            try { pdf.addImage(img, "PNG", mx, y + 14, mapW, mapW * 0.75, undefined, "FAST"); } catch {}
          } else {
            pdf.setFillColor(249,250,251); pdf.roundedRect(mx, y+14, mapW, mapW*0.75, 3, 3, "F");
            pdf.setDrawColor(209,213,219); pdf.roundedRect(mx, y+14, mapW, mapW*0.75, 3, 3, "S");
            pdf.setFontSize(8); pdf.setFont("helvetica","normal"); pdf.setTextColor(156,163,175);
            pdf.text("Sin imagen", mx+mapW/2, y+14+mapW*0.375, {align:"center"});
          }
          const t = getSatelliteTrend(reportData.satelliteData?.[idx]);
          const tc = hexToRgb(t.color);
          pdf.setFontSize(9); pdf.setFont("helvetica","bold"); pdf.setTextColor(tc[0],tc[1],tc[2]);
          pdf.text(`${t.trend} ${t.label}`, mx+mapW/2, y+20+mapW*0.75, {align:"center"});
        });
        y += 30 + mapW * 0.75 + 10;
        // Stats table
        const stHeaders = ["Índice","Media","Mín","Máx","Último","Tendencia"];
        const stw = [CW*0.13,CW*0.17,CW*0.17,CW*0.17,CW*0.17,CW*0.19];
        const stRows = ["NDVI","NDRE","NDMI"].map(idx => {
          const pts = (reportData.satelliteData?.[idx]?.data||[]).filter((d:any)=>d.mean!=null);
          const means = pts.map((d:any)=>d.mean);
          const avg = means.length ? means.reduce((a:number,b:number)=>a+b,0)/means.length : null;
          const t = getSatelliteTrend(reportData.satelliteData?.[idx]);
          return [idx, avg?.toFixed(4)||"—", means.length?Math.min(...means).toFixed(4):"—", means.length?Math.max(...means).toFixed(4):"—", means.length?means[means.length-1].toFixed(4):"—", `${t.trend} ${t.label}`];
        });
        y = drawTable(pdf, ML, y, stHeaders, stRows, stw);
        y += 12;
        // AI
        if (reportData.aiAnalysis) {
          const aiH = Math.min(180, 40 + reportData.aiAnalysis.length * 0.1);
          pdf.setFillColor(240,253,244); pdf.roundedRect(ML, y, CW, aiH, 4, 4, "F");
          pdf.setDrawColor(187,247,208); pdf.roundedRect(ML, y, CW, aiH, 4, 4, "S");
          pdf.setFontSize(9); pdf.setFont("helvetica","bold"); pdf.setTextColor(6,95,70);
          pdf.text("🧠 Análisis IA (DeepSeek v4-flash)", ML+8, y+14);
          pdf.setFontSize(7.5); pdf.setFont("helvetica","normal"); pdf.setTextColor(31,41,55);
          const al = pdf.splitTextToSize(reportData.aiAnalysis.substring(0,1500), CW-20);
          pdf.text(al.slice(0,16), ML+8, y+26);
        }
        drawFooter(pdf, 3, 4, now, logoB64);

        // PAGE 4: Notes + SLA
        pdf.addPage();
        drawSubHeader(pdf, "📋 Notas de Campo & SLA", `${titleName} · ${periodStr}`, logoB64);
        y = 48;
        // SLA KPIs
        const skw = (CW - 24) / 4;
        [
          {label:"Total",value:`${slaSummary?.total||0}`,c:[245,158,11]},
          {label:"Resueltas",value:`${slaSummary?.resolved||0}`,c:[16,185,129]},
          {label:"Abiertas",value:`${slaSummary?.open||0}`,c:[239,68,68]},
          {label:"SLA Prom",value:slaSummary?.avgSla?`${slaSummary.avgSla}h`:"N/A",c:[139,92,246]},
        ].forEach((k,i) => drawKpiBox(pdf, ML+i*(skw+8), y, skw, k.label, k.value, k.c as [number,number,number]));
        y += 50;
        if (slaSummary && slaSummary.overSla > 0) {
          pdf.setFillColor(254,242,242); pdf.roundedRect(ML, y, CW, 16, 2, 2, "F");
          pdf.setFontSize(8); pdf.setFont("helvetica","bold"); pdf.setTextColor(153,27,27);
          pdf.text(`⚠️ ${slaSummary.overSla} notas exceden SLA de 48 horas`, ML+8, y+11);
          y += 20;
        }
        // Notes table
        const notes = (reportData.fieldNotes as any[])||[];
        if (notes.length > 0) {
          const nHeaders = ["Folio","Categoría","Prior.","Estado","Fecha","SLA","Descripción"];
          const nw = [CW*0.10,CW*0.16,CW*0.10,CW*0.12,CW*0.10,CW*0.08,CW*0.34];
          const nRows = notes.slice(0,25).map((n:any) => {
            const sla = calcSlaHours(n.createdAt, n.resolvedAt);
            const over = !n.resolvedAt && (Date.now()-new Date(n.createdAt).getTime())/3600000>48;
            return [n.folio, catLabels[n.category]||n.category, sevLabels[n.severity]||n.severity,
              statusLabels[n.status]||n.status, fmtDateShort(n.createdAt),
              sla!=null?`${sla}h`:over?"⚠️":"—", n.description?.substring(0,40)||""];
          });
          y = drawTable(pdf, ML, y, nHeaders, nRows, nw);
        } else {
          pdf.setFontSize(9); pdf.setFont("helvetica","normal"); pdf.setTextColor(156,163,175);
          pdf.text("Sin notas en este período", PW/2, y+20, {align:"center"});
          y += 30;
        }
        // Category distribution
        if (slaSummary && Object.keys(slaSummary.catCounts).length > 0) {
          y += 10;
          pdf.setFontSize(9); pdf.setFont("helvetica","bold"); pdf.setTextColor(6,95,70);
          pdf.text("📊 Distribución por Categoría", ML, y+10); y += 18;
          let cx = ML;
          Object.entries(slaSummary.catCounts).sort((a,b)=>b[1]-a[1]).forEach(([cat,count]) => {
            const label = catLabels[cat]||cat;
            const bw = Math.max(50, label.length * 5 + 30);
            if (cx + bw > PW - MR) { cx = ML; y += 20; }
            pdf.setFillColor(240,253,244); pdf.roundedRect(cx, y, bw, 18, 3, 3, "F");
            pdf.setDrawColor(187,247,208); pdf.roundedRect(cx, y, bw, 18, 3, 3, "S");
            pdf.setFontSize(11); pdf.setFont("helvetica","bold"); pdf.setTextColor(6,95,70);
            pdf.text(`${count}`, cx+8, y+13);
            pdf.setFontSize(6.5); pdf.setFont("helvetica","normal"); pdf.setTextColor(55,65,81);
            pdf.text(label, cx+22, y+12);
            cx += bw + 6;
          });
        }
        drawFooter(pdf, 4, 4, now, logoB64);
      }

      const name = isGeneral ? "General" : (reportData?.parcel?.name || "parcela").replace(/\s+/g, "_");
      pdf.save(`Reporte_${name}_${fromDate}_${toDate}.pdf`);
      toast.success("✅ PDF descargado", { id: "pdf-gen" });
    } catch (err) {
      console.error("PDF error:", err);
      toast.error("Error generando PDF", { id: "pdf-gen" });
    } finally { setGenerating(false); }
  }

  // ═══════════════════════════════════════════
  // UI (unchanged)
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
              {generating?<><Loader2 className="h-4 w-4 animate-spin"/>Generando...</>:loading?<><Loader2 className="h-4 w-4 animate-spin"/>Cargando datos...</>:<><Download className="h-4 w-4"/>Generar Reporte PDF ({reportMode==="compact"?"1 pág":"4 págs"})</>}
            </button>
          </div>
        </GlassCard>

        {dataReady && (
          <GlassCard className="p-4" hover={false}>
            <h3 className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5"/> Vista previa · {titleName}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <MiniKPI icon={Package} label="Cosecha" value={`${weeklyHarvestTotal.toFixed(1)} kg`} color="from-green-400 to-emerald-500"/>
              <MiniKPI icon={TrendingUp} label="1ra Calidad" value={`${firstQPct}%`} color="from-emerald-400 to-green-500"/>
              <MiniKPI icon={ClipboardList} label="Notas" value={`${slaSummary?.total||0}`} color="from-yellow-400 to-orange-500"/>
              <MiniKPI icon={CloudSun} label="Lluvia" value={weatherSummary?`${weatherSummary.totalRain} mm`:"N/D"} color="from-blue-400 to-cyan-500"/>
            </div>
            {aiText && (
              <div className="bg-green-50/80 rounded-xl border border-green-200/40 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Brain className="h-3.5 w-3.5 text-green-600"/>
                  <span className="text-[10px] font-semibold text-green-700">Análisis IA (DeepSeek v4-flash)</span>
                </div>
                <p className="text-xs text-green-800 leading-relaxed line-clamp-3">{aiText.substring(0,300)}...</p>
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
