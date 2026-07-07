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
// jsPDF helpers
// ════════════════════════════════════════════════
const PW = 612; const PH = 792; const ML = 40; const MR = 40; const CW = PW-ML-MR;
const R = 6; // global corner radius

function pdfHeader(pdf: jsPDF, title: string, subtitle: string, period: string, logo: string|null) {
  // Main header background
  pdf.setFillColor(6,95,70); pdf.rect(0,0,PW,64,"F");
  // Accent stripe
  pdf.setFillColor(16,185,129); pdf.rect(0,62,PW,3,"F");
  // Decorative circle (top-right)
  pdf.setFillColor(16,185,129); pdf.circle(PW - 30, 30, 40, "F");
  pdf.setFillColor(6,95,70); pdf.circle(PW - 30, 30, 36, "F");
  // Logo
  if (logo) { try { pdf.addImage(logo,"PNG",ML,12,38,38); } catch {} }
  const lx = ML+(logo?46:0);
  // Brand
  pdf.setFont("helvetica","bold"); pdf.setFontSize(18); pdf.setTextColor(255,255,255);
  pdf.text("AGRA TEC-TI", lx, 30);
  pdf.setFontSize(7.5); pdf.setFont("helvetica","normal"); pdf.setTextColor(167,243,208);
  pdf.text(safe(subtitle.toUpperCase()), lx, 42);
  // Right side info
  pdf.setFont("helvetica","bold"); pdf.setFontSize(10); pdf.setTextColor(255,255,255);
  pdf.text(safe(title), PW-MR-50, 26, {align:"right"});
  pdf.setFontSize(7.5); pdf.setFont("helvetica","normal"); pdf.setTextColor(167,243,208);
  pdf.text(safe(period), PW-MR-50, 38, {align:"right"});
  // Type badge
  const badgeW = 65;
  pdf.setFillColor(16,185,129); pdf.roundedRect(PW-MR-50-badgeW/2-2, 44, badgeW, 12, 3, 3, "F");
  pdf.setFontSize(6); pdf.setFont("helvetica","bold"); pdf.setTextColor(255,255,255);
  pdf.text("REPORTE SEMANAL", PW-MR-50, 52, {align:"center"});
}

function pdfSubHeader(pdf: jsPDF, title: string, info: string, logo: string|null) {
  pdf.setFillColor(6,95,70); pdf.rect(0,0,PW,38,"F");
  pdf.setFillColor(16,185,129); pdf.rect(0,36,PW,3,"F");
  if (logo) { try { pdf.addImage(logo,"PNG",ML,7,22,22); } catch {} }
  pdf.setFont("helvetica","bold"); pdf.setFontSize(13); pdf.setTextColor(255,255,255);
  pdf.text(safe(title), ML+(logo?30:0), 24);
  pdf.setFont("helvetica","normal"); pdf.setFontSize(7); pdf.setTextColor(167,243,208);
  pdf.text(safe(info), PW-MR, 22, {align:"right"});
}

function pdfFooter(pdf: jsPDF, page: number, total: number, dateStr: string, logo: string|null) {
  const y = PH-20;
  // Footer background bar
  pdf.setFillColor(245,252,248); pdf.rect(0,y-6,PW,26,"F");
  pdf.setFillColor(16,185,129); pdf.rect(0,y-6,PW,1,"F");
  if (logo) { try { pdf.addImage(logo,"PNG",ML,y-1,10,10); } catch {} }
  pdf.setFontSize(6); pdf.setFont("helvetica","normal"); pdf.setTextColor(107,114,128);
  pdf.text(`AGRA TEC-TI  |  ${safe(dateStr)}  |  Confidencial`, ML+14, y+6);
  // Page number pill
  const pageText = `${page} / ${total}`;
  const ptw = pdf.getTextWidth(pageText) + 10;
  pdf.setFillColor(6,95,70); pdf.roundedRect(PW-MR-ptw, y-1, ptw, 12, 3, 3, "F");
  pdf.setFontSize(6); pdf.setFont("helvetica","bold"); pdf.setTextColor(255,255,255);
  pdf.text(pageText, PW-MR-ptw/2, y+7, {align:"center"});
}

function pdfKpi(pdf: jsPDF, x: number, y: number, w: number, label: string, value: string, r: number, g: number, b: number) {
  // Shadow simulation
  pdf.setFillColor(230,230,230); pdf.roundedRect(x+1,y+1,w,40,R,R,"F");
  // Card
  pdf.setFillColor(255,255,255); pdf.roundedRect(x,y,w,40,R,R,"F");
  pdf.setDrawColor(240,240,240); pdf.roundedRect(x,y,w,40,R,R,"S");
  // Top colored bar
  pdf.setFillColor(r,g,b); pdf.roundedRect(x,y,w,4,R,R,"F");
  pdf.setFillColor(255,255,255); pdf.rect(x,y+3,w,2,"F"); // flatten bottom of bar
  // Label
  pdf.setFontSize(6.5); pdf.setFont("helvetica","normal"); pdf.setTextColor(107,114,128);
  pdf.text(safe(label.toUpperCase()), x+8, y+17);
  // Value
  pdf.setFontSize(16); pdf.setFont("helvetica","bold"); pdf.setTextColor(r,g,b);
  pdf.text(safe(value), x+8, y+33);
}

function pdfSection(pdf: jsPDF, x: number, y: number, title: string) {
  // Pill-style section header
  const tw = pdf.getTextWidth(safe(title)) * 1.2 + 16;
  pdf.setFillColor(240,253,244); pdf.roundedRect(x,y,Math.max(tw, 80),16,4,4,"F");
  pdf.setDrawColor(187,247,208); pdf.roundedRect(x,y,Math.max(tw, 80),16,4,4,"S");
  pdf.setFillColor(6,95,70); pdf.roundedRect(x+3,y+4,3,8,1,1,"F");
  pdf.setFontSize(8); pdf.setFont("helvetica","bold"); pdf.setTextColor(6,95,70);
  pdf.text(safe(title), x+10, y+11);
}

function pdfTable(pdf: jsPDF, x: number, y: number, headers: string[], rows: string[][], widths: number[], rowColors?: ([number,number,number]|null)[]): number {
  const rh=14; const hh=16; const tw=widths.reduce((a,b)=>a+b,0);
  const totalH = hh + rows.length * rh;
  // Outer container with rounded corners
  pdf.setFillColor(255,255,255); pdf.roundedRect(x-1,y-1,tw+2,totalH+2,R,R,"F");
  pdf.setDrawColor(220,240,230); pdf.setLineWidth(0.5); pdf.roundedRect(x-1,y-1,tw+2,totalH+2,R,R,"S");
  // Header with rounded top
  pdf.setFillColor(6,95,70); pdf.roundedRect(x,y,tw,hh+4,R,R,"F");
  pdf.setFillColor(6,95,70); pdf.rect(x,y+R,tw,hh-R+4,"F"); // flatten bottom
  pdf.setFontSize(7.5); pdf.setFont("helvetica","bold"); pdf.setTextColor(255,255,255);
  let cx=x; headers.forEach((h,i)=>{pdf.text(safe(h),cx+6,y+11);cx+=widths[i];});
  let cy=y+hh;
  rows.forEach((row,ri)=>{
    const rc=rowColors?.[ri];
    if(rc){pdf.setFillColor(rc[0],rc[1],rc[2]);pdf.rect(x,cy,tw,rh,"F");}
    else if(ri%2===0){pdf.setFillColor(248,252,250);pdf.rect(x,cy,tw,rh,"F");}
    else{pdf.setFillColor(255,255,255);pdf.rect(x,cy,tw,rh,"F");}
    pdf.setDrawColor(235,245,240);pdf.setLineWidth(0.3);pdf.line(x+4,cy+rh,x+tw-4,cy+rh);
    cx=x;
    row.forEach((cell,ci)=>{
      pdf.setFontSize(7.5);pdf.setFont("helvetica",ci===0?"bold":"normal");
      pdf.setTextColor(ci===0?6:60,ci===0?95:70,ci===0?70:90);
      const t=cell.length>24?cell.substring(0,22)+"...":cell;
      pdf.text(safe(t),cx+6,cy+10);cx+=widths[ci];
    });
    cy+=rh;
  });
  return cy;
}

function pdfTotalRow(pdf: jsPDF, x: number, y: number, cells: string[], widths: number[]): number {
  const h=16; const tw=widths.reduce((a,b)=>a+b,0);
  // Rounded bottom
  pdf.setFillColor(6,95,70); pdf.roundedRect(x,y-2,tw,h+2,R,R,"F");
  pdf.setFillColor(6,95,70); pdf.rect(x,y-2,tw,R,"F"); // flatten top
  pdf.setFontSize(7.5); pdf.setFont("helvetica","bold"); pdf.setTextColor(255,255,255);
  let cx=x; cells.forEach((c,i)=>{pdf.text(safe(c),cx+6,y+10);cx+=widths[i];});
  return y+h;
}

function pdfAiBox(pdf: jsPDF, x: number, y: number, w: number, text: string, maxY: number = PH - 40): number {
  const clean = stripMd(text);
  pdf.setFontSize(7.5); pdf.setFont("helvetica","normal");
  const lines = pdf.splitTextToSize(safe(clean), w-20);
  const available = maxY - y - 30;
  const maxLines = Math.min(lines.length, Math.floor(available / 9.5));
  if (maxLines < 2) return y;
  const boxH = 30 + maxLines*9.5;
  // Shadow
  pdf.setFillColor(225,245,235); pdf.roundedRect(x+1,y+1,w,boxH,R,R,"F");
  // Box
  pdf.setFillColor(248,254,250); pdf.roundedRect(x,y,w,boxH,R,R,"F");
  pdf.setDrawColor(187,247,208); pdf.setLineWidth(0.8); pdf.roundedRect(x,y,w,boxH,R,R,"S");
  // Green accent bar on left
  pdf.setFillColor(16,185,129); pdf.roundedRect(x+3,y+6,3,boxH-12,1,1,"F");
  // Title bar
  pdf.setFillColor(240,253,244); pdf.roundedRect(x+10,y+4,140,14,3,3,"F");
  pdf.setFontSize(8.5); pdf.setFont("helvetica","bold"); pdf.setTextColor(6,95,70);
  pdf.text("IA AGRA TEC-TI", x+16, y+13);
  pdf.setFontSize(7); pdf.setFont("helvetica","normal"); pdf.setTextColor(107,140,120);
  pdf.text("Analisis Semanal", x+80, y+13);
  // Content
  pdf.setFontSize(7.5); pdf.setFont("helvetica","normal"); pdf.setTextColor(31,41,55);
  pdf.text(lines.slice(0,maxLines), x+12, y+26);
  return y+boxH;
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
  const totalPages = reportMode==="compact"?1:4;

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
  // PDF Generation
  // ══════════════════════════════════════════
  async function generatePDF() {
    if (!dataReady) return;
    setGenerating(true);
    toast.loading("Generando PDF...", { id: "pdf-gen" });
    try {
      const pdf = new jsPDF({orientation:"portrait",unit:"pt",format:"letter"});
      const period = `${fmtDate(fromDate)} - ${fmtDate(toDate)}`;

      // ── PAGE 1 ──
      pdfHeader(pdf, titleName, isGeneral?"Reporte General":"Reporte por Parcela", period, logoB64);
      let y = 76;
      const kw=(CW-24)/4;
      [[`Cosecha Total`,`${weeklyHarvestTotal.toFixed(1)} kg`,5,150,105],[`1ra Calidad`,`${firstQPct}%`,4,120,87],[`Cajas`,`${weeklyBoxes}`,13,148,136],[isGeneral?`Parcelas`:`Dias Activos`,isGeneral?`${generalData?.totals?.parcelsCount||0}`:`${reportData?.dailyHarvest?.length||0}`,8,145,178]].forEach((k:any,i)=>pdfKpi(pdf,ML+i*(kw+8),y,kw,k[0],k[1],k[2],k[3],k[4]));
      y+=54;

      if(isGeneral){
        const{active:withH,inactive:noH,risk:riskP}=generalParcels;
        if(riskP){
          // Risk alert with shadow
          pdf.setFillColor(250,230,230);pdf.roundedRect(ML+1,y+1,CW,20,R,R,"F"); // shadow
          pdf.setFillColor(254,242,242);pdf.roundedRect(ML,y,CW,20,R,R,"F");
          pdf.setDrawColor(252,165,165);pdf.setLineWidth(0.8);pdf.roundedRect(ML,y,CW,20,R,R,"S");
          // Red accent bar
          pdf.setFillColor(239,68,68);pdf.roundedRect(ML+3,y+4,3,12,1,1,"F");
          // Alert icon circle
          pdf.setFillColor(239,68,68);pdf.circle(ML+18,y+10,5,"F");
          pdf.setFontSize(8);pdf.setFont("helvetica","bold");pdf.setTextColor(255,255,255);
          pdf.text("!",ML+16.5,y+13);
          // Text
          pdf.setFontSize(7.5);pdf.setFont("helvetica","bold");pdf.setTextColor(153,27,27);
          pdf.text(safe(`MAYOR RIESGO: ${riskP.name}`),ML+28,y+10);
          pdf.setFontSize(7);pdf.setFont("helvetica","normal");pdf.setTextColor(185,28,28);
          pdf.text(safe(`NDVI ${(riskP.ndviLast||riskP.ndviAvg||0).toFixed(3)} | ${riskP.notesOpen} notas abiertas`),ML+28,y+17);
          y+=26;
        }
        if(withH.length>0){
          pdfSection(pdf,ML,y,`Parcelas con Cosecha (${withH.length})`);y+=22;
          const gw=[CW*0.24,CW*0.11,CW*0.11,CW*0.10,CW*0.12,CW*0.14,CW*0.18];
          const gRows=withH.map((p:any)=>[p.name||p.code,`${p.weekTotal}`,`${p.weekFirstQ}`,`${p.weekBoxes}`,(p.ndviLast||p.ndviAvg)?(p.ndviLast||p.ndviAvg).toFixed(3):"-",p.ndviAvg?p.ndviAvg.toFixed(3):"-",`${p.notesCount} (${p.notesOpen})`]);
          const rc=withH.map((p:any)=>riskP&&p.id===riskP.id?[254,226,226] as [number,number,number]:[235,251,242] as [number,number,number]);
          y=pdfTable(pdf,ML,y,["Parcela","kg","1ra Cal.","Cajas","NDVI Ult.","NDVI Prom","Notas"],gRows,gw,rc);
          y=pdfTotalRow(pdf,ML,y,["SUBTOTAL",`${withH.reduce((s:number,p:any)=>s+p.weekTotal,0).toFixed(1)}`,`${withH.reduce((s:number,p:any)=>s+p.weekFirstQ,0).toFixed(1)}`,`${withH.reduce((s:number,p:any)=>s+p.weekBoxes,0)}`,"-","-",`${withH.reduce((s:number,p:any)=>s+p.notesCount,0)}`],gw);
          y+=8;
        }
        if(noH.length>0){
          pdfSection(pdf,ML,y,`Sin Cosecha esta semana (${noH.length})`);y+=22;
          const gw2=[CW*0.35,CW*0.18,CW*0.18,CW*0.29];
          const gRows2=noH.map((p:any)=>[p.name||p.code,(p.ndviLast||p.ndviAvg)?(p.ndviLast||p.ndviAvg).toFixed(3):"-",p.ndviAvg?p.ndviAvg.toFixed(3):"-",`${p.notesCount} (${p.notesOpen} abiertas)`]);
          y=pdfTable(pdf,ML,y,["Parcela","NDVI Ult.","NDVI Prom","Notas"],gRows2,gw2,noH.map(()=>[245,245,245] as [number,number,number]));
          y+=4;
        }
        // Total summary bar
        pdf.setFillColor(4,80,58);pdf.roundedRect(ML+1,y+1,CW,22,R,R,"F"); // shadow
        pdf.setFillColor(6,95,70);pdf.roundedRect(ML,y,CW,22,R,R,"F");
        pdf.setFillColor(16,185,129);pdf.roundedRect(ML,y,CW,4,R,R,"F");
        pdf.setFillColor(6,95,70);pdf.rect(ML,y+3,CW,3,"F"); // flatten
        pdf.setFontSize(9);pdf.setFont("helvetica","bold");pdf.setTextColor(255,255,255);
        pdf.text(safe(`TOTAL: ${generalData?.totals?.harvest} kg  |  ${generalData?.totals?.boxes} cajas  |  ${generalData?.totals?.notes} notas  |  ${generalData?.totals?.parcelsCount} parcelas`),ML+12,y+16);
        y+=28;
      } else {
        const leftW=CW*0.54;const rightX=ML+leftW+12;const rightW=CW-leftW-12;
        pdfSection(pdf,ML,y,"Cosecha Diaria");y+=22;
        const hw=[leftW*0.22,leftW*0.14,leftW*0.18,leftW*0.16,leftW*0.15,leftW*0.15];
        const hRows=(reportData?.dailyHarvest||[]).map((d:any)=>[fmtDateShort(d.date),`${d.totalBoxes}`,`${d.totalWeight}`,`${d.firstQualityWeight}`,`${d.secondQualityWeight}`,`${d.wasteWeight}`]);
        const tEnd=pdfTable(pdf,ML,y,["Fecha","Cajas","Total kg","1ra","2da","Desp."],hRows,hw);
        let ry=y-18;
        pdfSection(pdf,rightX,ry,"Indices Satelitales");ry+=18;
        const sw=[rightW*0.2,rightW*0.22,rightW*0.22,rightW*0.36];
        const sRows=["NDVI","NDRE","NDMI"].map(idx=>{const pts=(reportData?.satelliteData?.[idx]?.data||[]).filter((d:any)=>d.mean!=null);const avg=pts.length?(pts.reduce((s:number,d:any)=>s+d.mean,0)/pts.length):null;const last=pts.length?pts[pts.length-1].mean:null;const t=getSatTrend(reportData?.satelliteData?.[idx]);return[idx,avg?.toFixed(4)||"-",last?.toFixed(4)||"-",`${t.t} ${t.l}`];});
        ry=pdfTable(pdf,rightX,ry,["Indice","Media","Ultimo","Tendencia"],sRows,sw);ry+=10;
        pdfSection(pdf,rightX,ry,"Notas de Campo");ry+=18;
        const nbw=(rightW-8)/3;
        [{l:"Total",v:`${slaSummary?.total||0}`,r:6,g:95,b:70},{l:"Resueltas",v:`${slaSummary?.resolved||0}`,r:16,g:185,b:129},{l:"Abiertas",v:`${slaSummary?.open||0}`,r:(slaSummary?.open||0)>0?239:6,g:(slaSummary?.open||0)>0?68:95,b:(slaSummary?.open||0)>0?68:70}].forEach((b,i)=>{
          const bx=rightX+i*(nbw+4);
          pdf.setFillColor(245,252,248);pdf.roundedRect(bx,ry,nbw,28,2,2,"F");
          pdf.setDrawColor(209,250,229);pdf.roundedRect(bx,ry,nbw,28,2,2,"S");
          pdf.setFontSize(13);pdf.setFont("helvetica","bold");pdf.setTextColor(b.r,b.g,b.b);
          pdf.text(safe(b.v),bx+nbw/2,ry+13,{align:"center"});
          pdf.setFontSize(6);pdf.setFont("helvetica","normal");pdf.setTextColor(107,114,128);
          pdf.text(safe(b.l),bx+nbw/2,ry+22,{align:"center"});
        });
        ry+=32;
        if(slaSummary?.avgSla){pdf.setFontSize(7);pdf.setFont("helvetica","normal");pdf.setTextColor(55,65,81);pdf.text(safe(`SLA promedio: ${slaSummary.avgSla}h`),rightX,ry+6);}
        y=Math.max(tEnd,ry)+10;
      }

      if(weatherSummary){
        pdfSection(pdf,ML,y,"Clima");y+=16;
        pdf.setFontSize(7.5);pdf.setFont("helvetica","normal");pdf.setTextColor(55,65,81);
        pdf.text(safe(`Temp. Max prom: ${weatherSummary.avgMax} C  |  Min prom: ${weatherSummary.avgMin} C  |  Lluvia acum: ${weatherSummary.totalRain} mm`),ML+8,y+6);
        y+=14;
      }

      if(aiText){y=pdfAiBox(pdf,ML,y,CW,aiText)+4;}
      pdfFooter(pdf,1,totalPages,now,logoB64);

      // Extended pages (same as before)
      if(reportMode==="extended"&&!isGeneral&&reportData){
        pdf.addPage();pdfSubHeader(pdf,"Cosecha Detallada + Clima",`${titleName} | ${period}`,logoB64);y=44;
        const h2w=[CW*0.17,CW*0.12,CW*0.18,CW*0.18,CW*0.17,CW*0.18];
        const h2R=(reportData.dailyHarvest||[]).map((d:any)=>[fmtDateShort(d.date),`${d.totalBoxes}`,`${d.totalWeight}`,`${d.firstQualityWeight}`,`${d.secondQualityWeight}`,`${d.wasteWeight}`]);
        y=pdfTable(pdf,ML,y,["Fecha","Cajas","Total (kg)","1ra Cal.","2da Cal.","Desperdicio"],h2R,h2w);
        const sQ=(reportData.dailyHarvest||[]).reduce((s:number,d:any)=>s+(d.secondQualityWeight||0),0);
        const wa=(reportData.dailyHarvest||[]).reduce((s:number,d:any)=>s+(d.wasteWeight||0),0);
        y=pdfTotalRow(pdf,ML,y,["TOTAL",`${weeklyBoxes}`,weeklyHarvestTotal.toFixed(2),weeklyFirstQ.toFixed(2),sQ.toFixed(2),wa.toFixed(2)],h2w);y+=16;
        if(weatherSummary&&reportData.weatherData){
          pdfSection(pdf,ML,y,"Clima Diario");y+=14;
          const wbw=(CW-18)/4;
          [{l:"Temp. Max",v:`${weatherSummary.avgMax} C`,r:220,g:38,b:38},{l:"Temp. Min",v:`${weatherSummary.avgMin} C`,r:37,g:99,b:235},{l:"Lluvia",v:`${weatherSummary.totalRain} mm`,r:5,g:150,b:105},{l:"Dias",v:`${weatherSummary.days}`,r:139,g:92,b:246}].forEach((w,i)=>pdfKpi(pdf,ML+i*(wbw+6),y,wbw,w.l,w.v,w.r,w.g,w.b));
          y+=48;
          const wtw=[CW*0.3,CW*0.23,CW*0.23,CW*0.24];
          const wtR=((reportData.weatherData as any[])||[]).map((w:any)=>[fmtDateShort(w.date),(w.temperatureMax||0).toFixed(1),(w.temperatureMin||0).toFixed(1),(w.precipitation||0).toFixed(1)]);
          y=pdfTable(pdf,ML,y,["Fecha","Max C","Min C","Lluvia mm"],wtR,wtw);
        }
        pdfFooter(pdf,2,4,now,logoB64);

        pdf.addPage();pdfSubHeader(pdf,"Telemetria Satelital",`${titleName} | ${period}`,logoB64);y=44;
        const mapW=(CW-20)/3;
        (["NDVI","NDRE","NDMI"] as const).forEach((idx,i)=>{
          const mx=ML+i*(mapW+10);
          pdf.setFontSize(10);pdf.setFont("helvetica","bold");pdf.setTextColor(6,95,70);pdf.text(idx,mx+mapW/2,y+10,{align:"center"});
          const img=satMaps[idx];
          if(img){try{pdf.addImage(img,"PNG",mx,y+14,mapW,mapW*0.75,undefined,"FAST");}catch{}}
          else{pdf.setFillColor(249,250,251);pdf.roundedRect(mx,y+14,mapW,mapW*0.75,3,3,"F");pdf.setDrawColor(209,213,219);pdf.roundedRect(mx,y+14,mapW,mapW*0.75,3,3,"S");pdf.setFontSize(7);pdf.setFont("helvetica","normal");pdf.setTextColor(156,163,175);pdf.text("Sin imagen",mx+mapW/2,y+14+mapW*0.375,{align:"center"});}
          const tr=getSatTrend(reportData.satelliteData?.[idx]);pdf.setFontSize(8);pdf.setFont("helvetica","bold");pdf.setTextColor(tr.c[0],tr.c[1],tr.c[2]);pdf.text(safe(`${tr.t} ${tr.l}`),mx+mapW/2,y+20+mapW*0.75,{align:"center"});
        });
        y+=30+mapW*0.75+10;
        const stw=[CW*0.13,CW*0.17,CW*0.17,CW*0.17,CW*0.17,CW*0.19];
        const stR=["NDVI","NDRE","NDMI"].map(idx=>{const pts=(reportData.satelliteData?.[idx]?.data||[]).filter((d:any)=>d.mean!=null);const means=pts.map((d:any)=>d.mean);const avg=means.length?means.reduce((a:number,b:number)=>a+b,0)/means.length:null;const tr=getSatTrend(reportData.satelliteData?.[idx]);return[idx,avg?.toFixed(4)||"-",means.length?Math.min(...means).toFixed(4):"-",means.length?Math.max(...means).toFixed(4):"-",means.length?means[means.length-1].toFixed(4):"-",`${tr.t} ${tr.l}`];});
        y=pdfTable(pdf,ML,y,["Indice","Media","Min","Max","Ultimo","Tendencia"],stR,stw);y+=12;
        if(reportData.aiAnalysis){y=pdfAiBox(pdf,ML,y,CW,reportData.aiAnalysis)+4;}
        pdfFooter(pdf,3,4,now,logoB64);

        pdf.addPage();pdfSubHeader(pdf,"Notas de Campo & SLA",`${titleName} | ${period}`,logoB64);y=44;
        const skw=(CW-18)/4;
        [{l:"Total",v:`${slaSummary?.total||0}`,r:245,g:158,b:11},{l:"Resueltas",v:`${slaSummary?.resolved||0}`,r:16,g:185,b:129},{l:"Abiertas",v:`${slaSummary?.open||0}`,r:239,g:68,b:68},{l:"SLA Prom",v:slaSummary?.avgSla?`${slaSummary.avgSla}h`:"N/A",r:139,g:92,b:246}].forEach((k,i)=>pdfKpi(pdf,ML+i*(skw+6),y,skw,k.l,k.v,k.r,k.g,k.b));
        y+=50;
        if(slaSummary&&slaSummary.overSla>0){pdf.setFillColor(254,242,242);pdf.roundedRect(ML,y,CW,14,2,2,"F");pdf.setFontSize(7);pdf.setFont("helvetica","bold");pdf.setTextColor(153,27,27);pdf.text(safe(`ALERTA: ${slaSummary.overSla} notas exceden SLA de 48 horas`),ML+8,y+10);y+=18;}
        const notes=(reportData.fieldNotes as any[])||[];
        if(notes.length>0){
          const nw=[CW*0.10,CW*0.16,CW*0.10,CW*0.12,CW*0.10,CW*0.08,CW*0.34];
          const nR=notes.slice(0,25).map((n:any)=>{const sla=calcSlaHours(n.createdAt,n.resolvedAt);const ov=!n.resolvedAt&&(Date.now()-new Date(n.createdAt).getTime())/3600000>48;return[n.folio,catLabels[n.category]||n.category,sevLabels[n.severity]||n.severity,statusLabels[n.status]||n.status,fmtDateShort(n.createdAt),sla!=null?`${sla}h`:ov?"!":"-",n.description?.substring(0,38)||""];});
          y=pdfTable(pdf,ML,y,["Folio","Categoria","Prior.","Estado","Fecha","SLA","Descripcion"],nR,nw);
        }else{pdf.setFontSize(8);pdf.setFont("helvetica","normal");pdf.setTextColor(156,163,175);pdf.text("Sin notas en este periodo",PW/2,y+16,{align:"center"});y+=24;}
        if(slaSummary&&Object.keys(slaSummary.catCounts).length>0){y+=8;pdfSection(pdf,ML,y,"Distribucion por Categoria");y+=16;let cx=ML;Object.entries(slaSummary.catCounts).sort((a,b)=>b[1]-a[1]).forEach(([cat,count])=>{const label=catLabels[cat]||cat;const bw=Math.max(55,label.length*5+30);if(cx+bw>PW-MR){cx=ML;y+=22;}pdf.setFillColor(245,252,248);pdf.roundedRect(cx,y,bw,16,2,2,"F");pdf.setDrawColor(209,250,229);pdf.roundedRect(cx,y,bw,16,2,2,"S");pdf.setFontSize(10);pdf.setFont("helvetica","bold");pdf.setTextColor(6,95,70);pdf.text(`${count}`,cx+6,y+12);pdf.setFontSize(6);pdf.setFont("helvetica","normal");pdf.setTextColor(55,65,81);pdf.text(safe(label),cx+18,y+11);cx+=bw+6;});}
        pdfFooter(pdf,4,4,now,logoB64);
      }

      const name=isGeneral?"General":(reportData?.parcel?.name||"parcela").replace(/\s+/g,"_");
      pdf.save(`Reporte_${safe(name)}_${fromDate}_${toDate}.pdf`);
      toast.success("PDF descargado",{id:"pdf-gen"});
    }catch(err){console.error("PDF error:",err);toast.error("Error generando PDF",{id:"pdf-gen"});}finally{setGenerating(false);}
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
              {generating?<><Loader2 className="h-4 w-4 animate-spin"/>Generando...</>:loading?<><Loader2 className="h-4 w-4 animate-spin"/>Cargando datos...</>:<><Download className="h-4 w-4"/>Generar Reporte PDF</>}
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
