import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "./db";
import {
  fieldActivities,
  fieldActivityParcels,
  fieldActivityPhotos,
  fieldActivityProducts,
  fieldActivityTools,
  fieldActivityWorkSessions,
  parcels,
} from "../drizzle/schema";

// ============================================================
// Reporte de actividades de campo
//
// Junta TODO lo que se registró de cada labor en un periodo —parcelas,
// jornadas, productos con su dosis, herramientas, fotos, responsable— y le
// pide a DeepSeek un resumen ejecutivo para que el reporte se lea como un
// informe y no como un volcado de la base de datos.
// ============================================================

const AI_MODEL = "deepseek-v4-flash";
const AI_MAX_TOKENS = 4000;

export const ACTIVITY_LABELS: Record<string, string> = {
  riego: "Riego",
  fertilizacion: "Fertilización",
  nutricion: "Nutrición",
  poda: "Poda",
  control_maleza: "Control de maleza",
  control_plagas: "Control de plagas",
  aplicacion_fitosanitaria: "Aplicación fitosanitaria",
  otro: "Otra actividad",
};

const STATUS_LABELS: Record<string, string> = {
  planificada: "Planificada",
  en_progreso: "En proceso",
  completada: "Completada",
  cancelada: "Cancelada",
};

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  fertilizante_granular: "Fertilizante granular",
  fertilizante_liquido: "Fertilizante líquido",
  fertilizante_foliar: "Fertilizante foliar",
  fertilizante_organico: "Fertilizante orgánico",
  herbicida_preemergente: "Herbicida preemergente",
  herbicida_postemergente: "Herbicida postemergente",
  herbicida_selectivo: "Herbicida selectivo",
  herbicida_no_selectivo: "Herbicida no selectivo",
  insecticida: "Insecticida",
  fungicida: "Fungicida",
  acaricida: "Acaricida",
  nematicida: "Nematicida",
  regulador_crecimiento: "Regulador de crecimiento",
  bioestimulante: "Bioestimulante",
  enmienda_suelo: "Enmienda de suelo",
  nutriente_foliar: "Nutriente foliar",
  agua: "Agua",
  otro: "Otro",
};

export interface ActivityProductLine {
  name: string;
  typeLabel: string;
  quantity: string | null;
  unit: string | null;
  plannedQuantity: string | null;
  dosisPerHectare: string | null;
  applicationMethod: string | null;
  notes: string | null;
}

export interface ActivityLine {
  id: number;
  date: string;
  endDate: string | null;
  typeLabel: string;
  type: string;
  subtype: string | null;
  description: string;
  performedBy: string;
  status: string;
  statusLabel: string;
  hours: number | null;
  days: number;
  sessions: Array<{ date: string; start: string | null; end: string | null; notes: string | null }>;
  parcelNames: string[];
  products: ActivityProductLine[];
  tools: string[];
  photoCount: number;
  weather: string | null;
  temperature: string | null;
}

/** Minutos entre "HH:MM" y "HH:MM", cruzando la medianoche si hace falta */
function minutesBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((v) => Number.isNaN(v))) return 0;
  let dur = eh * 60 + em - (sh * 60 + sm);
  if (dur < 0) dur += 24 * 60;
  return dur;
}

function toDateString(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

/**
 * Todas las actividades del periodo con su detalle completo.
 * `parcelId` limita el reporte a una parcela (incluye las labores generales,
 * que son las que no están ligadas a ninguna).
 */
export async function getActivityDetail(input: {
  fromDate: string;
  toDate: string;
  parcelId?: number | null;
}): Promise<ActivityLine[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(fieldActivities)
    .where(
      and(
        gte(fieldActivities.activityDate, input.fromDate as any),
        lte(fieldActivities.activityDate, input.toDate as any)
      )
    )
    .orderBy(asc(fieldActivities.activityDate), asc(fieldActivities.id));

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // ── Parcelas de cada actividad ──
  const parcelLinks = await db
    .select({
      activityId: fieldActivityParcels.activityId,
      parcelId: fieldActivityParcels.parcelId,
      name: parcels.name,
      code: parcels.code,
    })
    .from(fieldActivityParcels)
    .leftJoin(parcels, eq(fieldActivityParcels.parcelId, parcels.id))
    .where(inArray(fieldActivityParcels.activityId, ids));

  const parcelsByActivity: Record<number, string[]> = {};
  const parcelIdsByActivity: Record<number, number[]> = {};
  for (const link of parcelLinks) {
    (parcelsByActivity[link.activityId] ||= []).push(link.name || link.code || `Parcela ${link.parcelId}`);
    (parcelIdsByActivity[link.activityId] ||= []).push(link.parcelId);
  }

  // ── Productos ──
  const productRows = await db
    .select()
    .from(fieldActivityProducts)
    .where(inArray(fieldActivityProducts.activityId, ids));
  const productsByActivity: Record<number, ActivityProductLine[]> = {};
  for (const p of productRows) {
    (productsByActivity[p.activityId] ||= []).push({
      name: p.productName,
      typeLabel: PRODUCT_TYPE_LABELS[p.productType] || p.productType,
      quantity: p.quantity,
      unit: p.unit,
      plannedQuantity: p.plannedQuantity,
      dosisPerHectare: p.dosisPerHectare,
      applicationMethod: p.applicationMethod,
      notes: p.notes,
    });
  }

  // ── Herramientas ──
  const toolRows = await db
    .select()
    .from(fieldActivityTools)
    .where(inArray(fieldActivityTools.activityId, ids));
  const toolsByActivity: Record<number, string[]> = {};
  for (const t of toolRows) {
    (toolsByActivity[t.activityId] ||= []).push(t.toolName);
  }

  // ── Fotos (solo se cuentan: el reporte no las incrusta) ──
  const photoRows = await db
    .select({ activityId: fieldActivityPhotos.activityId })
    .from(fieldActivityPhotos)
    .where(inArray(fieldActivityPhotos.activityId, ids));
  const photosByActivity: Record<number, number> = {};
  for (const ph of photoRows) {
    photosByActivity[ph.activityId] = (photosByActivity[ph.activityId] || 0) + 1;
  }

  // ── Jornadas: de aquí salen los días trabajados y las horas reales ──
  const sessionRows = await db
    .select()
    .from(fieldActivityWorkSessions)
    .where(inArray(fieldActivityWorkSessions.activityId, ids));
  const sessionsByActivity: Record<number, ActivityLine["sessions"]> = {};
  const minutesByActivity: Record<number, number> = {};
  for (const s of sessionRows) {
    (sessionsByActivity[s.activityId] ||= []).push({
      date: toDateString(s.workDate),
      start: s.startTime,
      end: s.endTime,
      notes: s.notes,
    });
    minutesByActivity[s.activityId] = (minutesByActivity[s.activityId] || 0) + minutesBetween(s.startTime, s.endTime);
  }
  for (const list of Object.values(sessionsByActivity)) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  const detail: ActivityLine[] = rows.map((a) => {
    const sessions = sessionsByActivity[a.id] || [];
    // Si no hay jornadas, se usan las horas sueltas de la propia actividad
    const minutes = minutesByActivity[a.id] || minutesBetween(a.startTime, a.endTime) || a.durationMinutes || 0;
    return {
      id: a.id,
      date: toDateString(a.activityDate),
      endDate: sessions.length > 1 ? sessions[sessions.length - 1].date : null,
      type: a.activityType,
      typeLabel: ACTIVITY_LABELS[a.activityType] || a.activityType,
      subtype: a.activitySubtype,
      description: a.description,
      performedBy: a.performedBy,
      status: a.status,
      statusLabel: STATUS_LABELS[a.status] || a.status,
      hours: minutes > 0 ? Math.round((minutes / 60) * 10) / 10 : null,
      days: sessions.length || 1,
      sessions,
      parcelNames: parcelsByActivity[a.id] || [],
      products: productsByActivity[a.id] || [],
      tools: toolsByActivity[a.id] || [],
      photoCount: photosByActivity[a.id] || 0,
      weather: a.weatherCondition,
      temperature: a.temperature,
    };
  });

  if (input.parcelId) {
    // Una labor sin parcela es general: aplica a todo y por eso también entra
    return detail.filter((a) => {
      const ids = parcelIdsByActivity[a.id] || [];
      return ids.length === 0 || ids.includes(input.parcelId!);
    });
  }

  return detail;
}

// ── Agregados ────────────────────────────────────────────────

export function summarizeActivities(activities: ActivityLine[]) {
  const byType: Record<string, { label: string; count: number; hours: number }> = {};
  const byParcel: Record<string, { count: number; hours: number }> = {};
  const byPerson: Record<string, { count: number; hours: number }> = {};
  const products: Record<string, { name: string; typeLabel: string; unit: string; total: number; times: number; sinCantidad: number }> = {};
  const tools: Record<string, number> = {};

  let hours = 0;
  let workDays = 0;

  for (const a of activities) {
    hours += a.hours || 0;
    workDays += a.days;

    const t = (byType[a.type] ||= { label: a.typeLabel, count: 0, hours: 0 });
    t.count++;
    t.hours += a.hours || 0;

    const responsable = a.performedBy?.trim() || "Sin responsable";
    const per = (byPerson[responsable] ||= { count: 0, hours: 0 });
    per.count++;
    per.hours += a.hours || 0;

    const destinos = a.parcelNames.length > 0 ? a.parcelNames : ["General (todas)"];
    for (const p of destinos) {
      const par = (byParcel[p] ||= { count: 0, hours: 0 });
      par.count++;
      // Las horas se reparten para no contarlas dos veces en labores multiparcela
      par.hours += (a.hours || 0) / destinos.length;
    }

    for (const prod of a.products) {
      // La misma cantidad en distinta unidad no se puede sumar: se agrupa por ambas
      const unidad = prod.unit || "";
      const key = `${prod.name.toLowerCase().trim()}|${unidad}`;
      const entry = (products[key] ||= {
        name: prod.name,
        typeLabel: prod.typeLabel,
        unit: unidad,
        total: 0,
        times: 0,
        sinCantidad: 0,
      });
      entry.times++;
      const cantidad = parseFloat(String(prod.quantity ?? "").replace(",", "."));
      if (Number.isFinite(cantidad)) entry.total += cantidad;
      else entry.sinCantidad++;
    }

    for (const tool of a.tools) {
      tools[tool] = (tools[tool] || 0) + 1;
    }
  }

  const ordenar = <T extends { count: number }>(obj: Record<string, T>) =>
    Object.entries(obj)
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => b.count - a.count);

  return {
    total: activities.length,
    completed: activities.filter((a) => a.status === "completada").length,
    inProgress: activities.filter((a) => a.status === "en_progreso").length,
    planned: activities.filter((a) => a.status === "planificada").length,
    cancelled: activities.filter((a) => a.status === "cancelada").length,
    hours: Math.round(hours * 10) / 10,
    workDays,
    parcelsWorked: Object.keys(byParcel).filter((p) => p !== "General (todas)").length,
    peopleCount: Object.keys(byPerson).length,
    photos: activities.reduce((s, a) => s + a.photoCount, 0),
    byType: ordenar(byType).map((t) => ({ ...t, hours: Math.round(t.hours * 10) / 10 })),
    byParcel: ordenar(byParcel).map((p) => ({ ...p, name: p.key, hours: Math.round(p.hours * 10) / 10 })),
    byPerson: ordenar(byPerson).map((p) => ({ ...p, name: p.key, hours: Math.round(p.hours * 10) / 10 })),
    products: Object.values(products)
      .map((p) => ({ ...p, total: Math.round(p.total * 100) / 100 }))
      .sort((a, b) => b.times - a.times),
    tools: Object.entries(tools)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export type ActivitySummary = ReturnType<typeof summarizeActivities>;

// ── Resumen con IA ───────────────────────────────────────────

export interface ActivityAiSummary {
  resumen: string;
  porLabor: Array<{ labor: string; texto: string }>;
  insumos: string | null;
  pendientes: string | null;
  recomendaciones: string[];
}

/** La IA a veces envuelve el JSON en ```json … ```; esto lo desenvuelve */
function extractJson(text: string): any | null {
  const limpio = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio === -1 || fin === -1 || fin <= inicio) return null;
  try {
    return JSON.parse(limpio.slice(inicio, fin + 1));
  } catch {
    return null;
  }
}

async function getDeepSeekKey(): Promise<string | null> {
  try {
    const { getGlobalSetting } = await import("./globalSettings");
    let apiKey = await getGlobalSetting("deepseekApiKey");
    if (!apiKey) return null;
    try {
      const { decryptSecret, isEncrypted } = await import("./encryption");
      if (isEncrypted(apiKey)) apiKey = decryptSecret(apiKey);
    } catch { /* la clave estaba en claro */ }
    return apiKey;
  } catch {
    return null;
  }
}

// El resumen de un mismo periodo no cambia entre una vista previa y el envío
// por correo: se guarda un rato para no pagar dos veces la misma consulta.
const aiCache = new Map<string, { at: number; value: ActivityAiSummary }>();
const AI_CACHE_TTL_MS = 30 * 60 * 1000;

export async function buildAiSummary(
  activities: ActivityLine[],
  summary: ActivitySummary,
  period: { from: string; to: string },
  options?: { force?: boolean; cacheKey?: string }
): Promise<ActivityAiSummary | null> {
  if (activities.length === 0) return null;

  const cacheKey = options?.cacheKey || `${period.from}|${period.to}|${activities.length}`;
  if (!options?.force) {
    const hit = aiCache.get(cacheKey);
    if (hit && Date.now() - hit.at < AI_CACHE_TTL_MS) return hit.value;
  }

  const apiKey = await getDeepSeekKey();
  if (!apiKey) {
    console.log("[ReporteActividades] Sin clave de DeepSeek: se omite el resumen con IA");
    return null;
  }

  // Se manda el detalle completo, no solo los totales: la IA tiene que poder
  // nombrar parcelas, productos y responsables concretos.
  const lineas = activities.map((a) => {
    const partes = [
      `- ${a.date}${a.endDate ? ` a ${a.endDate}` : ""} · ${a.typeLabel}${a.subtype ? ` (${a.subtype})` : ""}`,
      `estado: ${a.statusLabel}`,
      a.parcelNames.length ? `parcelas: ${a.parcelNames.join(", ")}` : "parcelas: general",
      `responsable: ${a.performedBy || "sin asignar"}`,
      a.hours ? `${a.hours} h en ${a.days} día(s)` : null,
      a.products.length
        ? `insumos: ${a.products
            .map((p) => `${p.name}${p.quantity ? ` ${p.quantity}${p.unit || ""}` : ""}${p.dosisPerHectare ? ` (dosis ${p.dosisPerHectare})` : ""}`)
            .join("; ")}`
        : null,
      a.tools.length ? `equipo: ${a.tools.join(", ")}` : null,
      a.weather ? `clima: ${a.weather}${a.temperature ? ` ${a.temperature}` : ""}` : null,
      a.description ? `nota: ${a.description.slice(0, 300)}` : null,
    ].filter(Boolean);
    return partes.join(" · ");
  });

  const insumosLinea = summary.products
    .map((p) => `${p.name}: ${p.total > 0 ? `${p.total} ${p.unit}` : "sin cantidad registrada"} en ${p.times} aplicación(es)`)
    .join("\n");

  const prompt = `Redacta el resumen de la libreta de campo del periodo ${period.from} a ${period.to}.

TOTALES
${summary.total} labores (${summary.completed} completadas, ${summary.inProgress} en proceso, ${summary.planned} planificadas, ${summary.cancelled} canceladas), ${summary.hours} horas de trabajo, ${summary.parcelsWorked} parcelas atendidas, ${summary.peopleCount} responsables.

LABORES POR TIPO
${summary.byType.map((t) => `${t.label}: ${t.count} vez(ces), ${t.hours} h`).join("\n") || "ninguna"}

INSUMOS CONSUMIDOS
${insumosLinea || "ninguno registrado"}

DETALLE DE CADA LABOR
${lineas.join("\n")}

Responde ÚNICAMENTE con un objeto JSON, sin texto alrededor y sin bloques de código, con esta forma exacta:
{
  "resumen": "2 a 4 frases: qué se trabajó en el periodo, dónde y con qué resultado. Concreto, con nombres de parcelas y cifras reales.",
  "porLabor": [{"labor": "Nombre del tipo de labor", "texto": "1 o 2 frases sobre cómo se ejecutó esa labor: dónde, cuánto, con qué insumos"}],
  "insumos": "2 o 3 frases sobre los productos aplicados y su dosificación. null si no hubo.",
  "pendientes": "1 o 2 frases sobre lo planificado que no se completó o quedó en proceso. null si todo se completó.",
  "recomendaciones": ["2 a 4 recomendaciones accionables para los próximos días"]
}

Escribe en español de México, con tono de ingeniero agrónomo: directo, sin adornos, sin saludos. No inventes datos que no estén arriba; si algo no se registró, dilo con naturalidad.`;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: "system",
            content: "Eres un ingeniero agrónomo senior que redacta informes de campo. Respondes solo con JSON válido, en español.",
          },
          { role: "user", content: prompt },
        ],
        // Modelo de razonamiento: lo que "piensa" también gasta presupuesto.
        // Con poco espacio devuelve vacío en vez de fallar.
        max_tokens: AI_MAX_TOKENS,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      console.error(`[ReporteActividades] DeepSeek respondió ${response.status}`);
      return null;
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.error("[ReporteActividades] DeepSeek devolvió texto vacío:", result.choices?.[0]?.finish_reason);
      return null;
    }

    const parsed = extractJson(text);
    const value: ActivityAiSummary = parsed
      ? {
          resumen: String(parsed.resumen || "").trim(),
          porLabor: Array.isArray(parsed.porLabor)
            ? parsed.porLabor
                .filter((x: any) => x && (x.labor || x.texto))
                .map((x: any) => ({ labor: String(x.labor || "").trim(), texto: String(x.texto || "").trim() }))
            : [],
          insumos: parsed.insumos ? String(parsed.insumos).trim() : null,
          pendientes: parsed.pendientes ? String(parsed.pendientes).trim() : null,
          recomendaciones: Array.isArray(parsed.recomendaciones)
            ? parsed.recomendaciones.map((r: any) => String(r).trim()).filter(Boolean)
            : [],
        }
      : // Si no vino JSON, al menos se aprovecha el texto tal cual
        { resumen: text, porLabor: [], insumos: null, pendientes: null, recomendaciones: [] };

    if (!value.resumen) return null;

    aiCache.set(cacheKey, { at: Date.now(), value });
    return value;
  } catch (error: any) {
    console.error("[ReporteActividades] Error al generar el resumen con IA:", error?.message || error);
    return null;
  }
}

/** Todo junto: detalle, agregados y resumen de IA */
export async function buildActivityReport(input: {
  fromDate: string;
  toDate: string;
  parcelId?: number | null;
  withAi?: boolean;
  forceAi?: boolean;
}) {
  const activities = await getActivityDetail(input);
  const summary = summarizeActivities(activities);

  let ai: ActivityAiSummary | null = null;
  if (input.withAi !== false) {
    ai = await buildAiSummary(activities, summary, { from: input.fromDate, to: input.toDate }, {
      force: input.forceAi,
      cacheKey: `${input.fromDate}|${input.toDate}|${input.parcelId ?? "todas"}|${activities.length}`,
    });
  }

  return {
    period: { from: input.fromDate, to: input.toDate },
    summary,
    activities,
    ai,
  };
}
