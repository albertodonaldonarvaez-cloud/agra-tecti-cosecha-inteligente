/**
 * Resumen semanal con IA.
 *
 * Cada semana (lunes, hora de México) genera un panorama general de la
 * SEMANA PASADA cruzando:
 *  - Actividades de la libreta de campo (realizadas y planificadas)
 *  - Clima histórico de la semana
 *  - Datos satelitales cacheados (NDVI) por parcela
 *  - Cosecha de la semana (si hubo)
 *  - Etapa del ciclo de producción activo
 *
 * El resultado se guarda en weeklySummaries y se muestra en el Dashboard.
 */
import { getDb } from "./db";
import * as db from "./db";
import * as dbExt from "./db_extended";
import {
  productionCycles, fieldActivities, fieldActivityParcels, fieldActivityWorkSessions,
  parcels, weeklySummaries, fieldNotes,
} from "../drizzle/schema";
import { eq, desc, asc, and, gte, lte, inArray, isNull, sql } from "drizzle-orm";

const TAG = "[WeeklySummary]";

/**
 * Modelo de IA y presupuesto de tokens.
 *
 * El modelo razona antes de responder y esos tokens de razonamiento cuentan
 * dentro de max_tokens. Un presupuesto corto (900) se consumía por completo
 * pensando y devolvía contenido vacío; con 4000 el razonamiento usa ~400 y
 * queda espacio de sobra para el texto final.
 */
const AI_MODEL = "deepseek-v4-flash";
const AI_MAX_TOKENS = 4000;

function todayMx(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lunes-domingo de la última semana COMPLETA (anterior a la actual) */
export function getLastWeekRange(): { weekStart: string; weekEnd: string } {
  const today = todayMx();
  const d = new Date(today + "T12:00:00");
  const dow = d.getDay(); // 0=domingo, 1=lunes...
  const daysSinceMonday = (dow + 6) % 7; // lunes=0
  const thisMonday = addDaysStr(today, -daysSinceMonday);
  const weekStart = addDaysStr(thisMonday, -7);
  const weekEnd = addDaysStr(thisMonday, -1);
  return { weekStart, weekEnd };
}

/** Intenta extraer un promedio NDVI de la estructura cacheada de Copernicus */
function extractNdviMean(raw: string): number | null {
  try {
    const data = JSON.parse(raw);
    const candidates: number[] = [];
    const visit = (node: any) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach(visit); return; }
      for (const [key, value] of Object.entries(node)) {
        if ((key === "mean" || key === "average" || key === "B0" || key === "ndvi") && typeof value === "number" && value > -1 && value < 1) {
          candidates.push(value);
        } else if (typeof value === "object") {
          visit(value);
        }
      }
    };
    visit(data);
    if (candidates.length === 0) return null;
    // Último valor reportado (los stats vienen en orden temporal)
    return Number(candidates[candidates.length - 1].toFixed(2));
  } catch {
    return null;
  }
}

const ACTIVITY_LABELS: Record<string, string> = {
  riego: "Riego", fertilizacion: "Fertilización", nutricion: "Nutrición", poda: "Poda",
  control_maleza: "Control de maleza", control_plagas: "Control de plagas",
  aplicacion_fitosanitaria: "Aplicación fitosanitaria", otro: "Otra actividad",
};

const NOTE_LABELS: Record<string, string> = {
  arboles_mal_plantados: "Árboles mal plantados", plaga_enfermedad: "Plaga o enfermedad",
  riego_drenaje: "Riego/drenaje", dano_mecanico: "Daño mecánico", maleza: "Maleza",
  fertilizacion: "Fertilización", suelo: "Suelo", infraestructura: "Infraestructura",
  fauna: "Fauna", otro: "Otro",
};

/**
 * Genera (o regenera con force) el resumen de la última semana completa.
 * Devuelve el registro creado, el existente si ya había, o null si no se pudo.
 */
/** Último motivo de fallo, para poder decírselo al usuario en vez de un mensaje genérico */
let lastError: string | null = null;

export function getLastSummaryError(): string | null {
  return lastError;
}

export async function generateWeeklySummary(options?: { force?: boolean }): Promise<any | null> {
  lastError = null;
  const drizzle = await getDb();
  if (!drizzle) { console.log(`${TAG} Sin base de datos, omitiendo`); return null; }

  const { weekStart, weekEnd } = getLastWeekRange();

  // ¿Ya existe el resumen de esa semana?
  const [existing] = await drizzle.select().from(weeklySummaries)
    .where(eq(weeklySummaries.weekStart, weekStart))
    .orderBy(desc(weeklySummaries.id))
    .limit(1);
  if (existing && !options?.force) return existing;

  // ── API key de DeepSeek ──
  let apiKey: string | null = null;
  try {
    const { getGlobalSetting } = await import("./globalSettings");
    apiKey = await getGlobalSetting("deepseekApiKey");
    if (apiKey) {
      const { decryptSecret, isEncrypted } = await import("./encryption");
      if (isEncrypted(apiKey)) apiKey = decryptSecret(apiKey);
    }
  } catch { /* sin key */ }
  if (!apiKey) {
    console.log(`${TAG} Sin API key de DeepSeek configurada, omitiendo generación`);
    return null;
  }

  console.log(`${TAG} Generando resumen de la semana ${weekStart} a ${weekEnd}...`);

  const today = todayMx();

  // ── 0. Ciclo activo: TODO el análisis se acota a él ────────────────
  // El higo se maneja por ciclos que arrancan con la poda. Mezclar la libreta
  // de ciclos anteriores distorsiona el diagnóstico (labores de hace un año
  // aparecerían como pendientes), así que el ciclo define la ventana de datos.
  const allCycles = await drizzle.select().from(productionCycles)
    .orderBy(desc(productionCycles.startDate)).limit(5);
  const activeCycle = allCycles.find(c => !c.endDate || c.endDate >= today) ?? null;

  // Ventana del ciclo. Sin ciclos registrados se mantiene el comportamiento
  // anterior (sin recorte) para no dejar al productor sin resumen.
  const cycleStart = activeCycle?.startDate ?? null;
  const cycleEnd = activeCycle?.endDate ?? null;

  /** Recorta un rango de fechas a la ventana del ciclo activo */
  const clampToCycle = (from: string, to: string): { from: string; to: string } | null => {
    const f = cycleStart && from < cycleStart ? cycleStart : from;
    const t = cycleEnd && to > cycleEnd ? cycleEnd : to;
    return f > t ? null : { from: f, to: t };
  };

  /** Condición reutilizable: la actividad cae dentro del ciclo activo */
  const withinCycle = () => {
    const conds: any[] = [];
    if (cycleStart) conds.push(gte(fieldActivities.activityDate, cycleStart as any));
    if (cycleEnd) conds.push(lte(fieldActivities.activityDate, cycleEnd as any));
    return conds;
  };

  // ── 1. Actividades de la semana (dentro del ciclo) ──
  const weekRange = clampToCycle(weekStart, weekEnd);
  const weekActivities = weekRange
    ? await drizzle.select().from(fieldActivities)
        .where(and(
          gte(fieldActivities.activityDate, weekRange.from as any),
          lte(fieldActivities.activityDate, weekRange.to as any),
        ))
        .orderBy(asc(fieldActivities.activityDate))
    : [];

  const actIds = weekActivities.map(a => a.id);
  const parcelsByActivity: Record<number, string[]> = {};
  let minutesByActivity: Record<number, number> = {};
  if (actIds.length > 0) {
    const links = await drizzle
      .select({ activityId: fieldActivityParcels.activityId, name: parcels.name })
      .from(fieldActivityParcels)
      .leftJoin(parcels, eq(fieldActivityParcels.parcelId, parcels.id))
      .where(inArray(fieldActivityParcels.activityId, actIds));
    for (const l of links) {
      if (!parcelsByActivity[l.activityId]) parcelsByActivity[l.activityId] = [];
      if (l.name) parcelsByActivity[l.activityId].push(l.name);
    }
    const sessions = await drizzle.select().from(fieldActivityWorkSessions)
      .where(inArray(fieldActivityWorkSessions.activityId, actIds));
    for (const s of sessions) {
      if (!s.startTime || !s.endTime) continue;
      const [sh, sm] = s.startTime.split(":").map(Number);
      const [eh, em] = s.endTime.split(":").map(Number);
      let dur = (eh * 60 + em) - (sh * 60 + sm);
      if (dur < 0) dur += 24 * 60;
      minutesByActivity[s.activityId] = (minutesByActivity[s.activityId] || 0) + dur;
    }
  }

  const done = weekActivities.filter(a => a.status === "completada");
  const planned = weekActivities.filter(a => a.status === "planificada" || a.status === "en_progreso");

  const describeActivity = (a: typeof weekActivities[number]) => {
    const label = ACTIVITY_LABELS[a.activityType] || a.activityType;
    const sub = a.activitySubtype ? ` (${a.activitySubtype})` : "";
    const parcelStr = parcelsByActivity[a.id]?.length ? ` en ${parcelsByActivity[a.id].join(", ")}` : "";
    const mins = minutesByActivity[a.id] || a.durationMinutes || 0;
    const hoursStr = mins > 0 ? ` [${(mins / 60).toFixed(1)}h]` : "";
    const dateStr = typeof a.activityDate === "string" ? a.activityDate : new Date(a.activityDate as any).toISOString().slice(0, 10);
    return `- ${dateStr}: ${label}${sub}${parcelStr}${hoursStr} — ${a.description || ""} (${a.performedBy || "sin responsable"})`;
  };

  // ── 2. Clima: lo que pasó (día a día) y lo que viene (pronóstico) ──
  let weatherLine = "Sin datos de clima (ubicación no configurada).";
  let weatherDailyLines = "";
  let forecastLines = "";
  let weatherRaw: any[] = [];
  let forecastRaw: any[] = [];
  try {
    const locationConfig = await dbExt.getLocationConfig();
    if (locationConfig) {
      const { getWeatherData, getExtendedForecast } = await import("./weatherService");
      weatherRaw = await getWeatherData(locationConfig.latitude, locationConfig.longitude, weekStart, weekEnd, locationConfig.timezone);
      if (weatherRaw.length > 0) {
        const avgMax = weatherRaw.reduce((s, d) => s + (d.temperatureMax || 0), 0) / weatherRaw.length;
        const avgMin = weatherRaw.reduce((s, d) => s + (d.temperatureMin || 0), 0) / weatherRaw.length;
        const rain = weatherRaw.reduce((s, d) => s + (d.precipitation || 0), 0);
        weatherLine = `Temp máx prom ${avgMax.toFixed(1)}°C, mín prom ${avgMin.toFixed(1)}°C, lluvia acumulada ${rain.toFixed(1)}mm en la semana.`;
        // Día a día: permite relacionar el clima con la labor de cada día
        weatherDailyLines = weatherRaw.map((d: any) =>
          `- ${d.date}: máx ${Number(d.temperatureMax ?? 0).toFixed(0)}°C, mín ${Number(d.temperatureMin ?? 0).toFixed(0)}°C, lluvia ${Number(d.precipitation ?? 0).toFixed(1)}mm`
        ).join("\n");
      }

      // Pronóstico de los próximos días (para recomendar cuándo hacer cada labor)
      forecastRaw = await getExtendedForecast(locationConfig.latitude, locationConfig.longitude, 7, locationConfig.timezone);
      if (forecastRaw.length > 0) {
        forecastLines = forecastRaw.map((d: any) =>
          `- ${d.date}: ${d.conditionText ?? d.condition ?? ""}, máx ${Number(d.temperatureMax ?? 0).toFixed(0)}°C, mín ${Number(d.temperatureMin ?? 0).toFixed(0)}°C, ` +
          `lluvia ${Number(d.precipitation ?? 0).toFixed(1)}mm (prob. ${Number(d.precipitationProbability ?? 0).toFixed(0)}%), viento ${Number(d.windSpeed ?? 0).toFixed(0)} km/h`
        ).join("\n");
      }
    }
  } catch (e) { console.log(`${TAG} Clima no disponible:`, e); }

  // ── 2.b Actividades planeadas para los próximos días (del ciclo actual) ──
  const horizon = addDaysStr(today, 14);
  const upcomingActivities = await drizzle.select().from(fieldActivities)
    .where(and(
      gte(fieldActivities.activityDate, today as any),
      lte(fieldActivities.activityDate, horizon as any),
      inArray(fieldActivities.status, ["planificada", "en_progreso"]),
      ...withinCycle(),
    ))
    .orderBy(asc(fieldActivities.activityDate));

  // Atrasadas: planificadas con fecha ya pasada y aún sin completar.
  // Acotadas al ciclo actual: lo que quedó pendiente de un ciclo cerrado
  // pertenece a la historia, no al diagnóstico de hoy.
  const overdueActivities = await drizzle.select().from(fieldActivities)
    .where(and(
      lte(fieldActivities.activityDate, addDaysStr(today, -1) as any),
      inArray(fieldActivities.status, ["planificada", "en_progreso"]),
      ...withinCycle(),
    ))
    .orderBy(desc(fieldActivities.activityDate))
    .limit(15);

  // Nombres de parcela de las próximas y atrasadas
  const futureIds = [...upcomingActivities, ...overdueActivities].map(a => a.id);
  if (futureIds.length > 0) {
    const links = await drizzle
      .select({ activityId: fieldActivityParcels.activityId, name: parcels.name })
      .from(fieldActivityParcels)
      .leftJoin(parcels, eq(fieldActivityParcels.parcelId, parcels.id))
      .where(inArray(fieldActivityParcels.activityId, futureIds));
    for (const l of links) {
      if (!parcelsByActivity[l.activityId]) parcelsByActivity[l.activityId] = [];
      if (l.name) parcelsByActivity[l.activityId].push(l.name);
    }
  }

  // ── 2.c Estado de la PODA por parcela dentro del ciclo actual ──
  // El ciclo arranca con la poda: una parcela sin poda registrada NO va
  // atrasada, sencillamente todavía no le toca. Se lo decimos explícito a la IA
  // porque de otro modo interpreta la ausencia de labores como retraso.
  const activeParcels = await drizzle.select({ id: parcels.id, name: parcels.name })
    .from(parcels).where(eq(parcels.isActive, true)).orderBy(asc(parcels.name));

  const podaByParcel = new Map<number, { date: string; status: string }>();
  if (cycleStart) {
    const podaRows = await drizzle
      .select({
        parcelId: fieldActivityParcels.parcelId,
        activityDate: fieldActivities.activityDate,
        status: fieldActivities.status,
      })
      .from(fieldActivities)
      .innerJoin(fieldActivityParcels, eq(fieldActivityParcels.activityId, fieldActivities.id))
      .where(and(
        eq(fieldActivities.activityType, "poda"),
        inArray(fieldActivities.status, ["completada", "en_progreso"]),
        ...withinCycle(),
      ))
      .orderBy(desc(fieldActivities.activityDate));
    for (const r of podaRows) {
      if (podaByParcel.has(r.parcelId)) continue; // la más reciente gana
      // activityDate llega como Date o como "YYYY-MM-DD" según el driver
      const raw = r.activityDate as unknown;
      const d = typeof raw === "string" ? raw.slice(0, 10) : new Date(raw as any).toISOString().slice(0, 10);
      podaByParcel.set(r.parcelId, { date: d, status: r.status });
    }
  }
  const parcelsWithPoda = activeParcels.filter(p => podaByParcel.has(p.id));
  const parcelsWithoutPoda = activeParcels.filter(p => !podaByParcel.has(p.id));

  // ── 2.d Notas de campo del ciclo actual ──
  const noteConds: any[] = [];
  if (cycleStart) noteConds.push(gte(fieldNotes.createdAt, new Date(cycleStart + "T00:00:00")));
  if (cycleEnd) noteConds.push(lte(fieldNotes.createdAt, new Date(cycleEnd + "T23:59:59")));
  const cycleNotes = await drizzle
    .select({
      description: fieldNotes.description,
      category: fieldNotes.category,
      severity: fieldNotes.severity,
      status: fieldNotes.status,
      createdAt: fieldNotes.createdAt,
      parcelName: parcels.name,
    })
    .from(fieldNotes)
    .leftJoin(parcels, eq(fieldNotes.parcelId, parcels.id))
    .where(noteConds.length > 0 ? and(...noteConds) : undefined as any)
    .orderBy(desc(fieldNotes.createdAt))
    .limit(20);

  const openNotes = cycleNotes.filter(n => n.status !== "resuelta" && n.status !== "descartada");
  const noteLines = cycleNotes.slice(0, 15).map(n => {
    const d = new Date(n.createdAt as any).toISOString().slice(0, 10);
    const where = n.parcelName ? ` en ${n.parcelName}` : "";
    const state = n.status === "resuelta" ? "resuelta" : n.status === "descartada" ? "descartada" : "abierta";
    return `- ${d}: [${n.severity}] ${NOTE_LABELS[n.category] ?? n.category}${where} — ${(n.description || "").slice(0, 160)} (${state})`;
  });

  // ── 3. Satelital: último NDVI cacheado por parcela activa ──
  const satelliteLines: string[] = [];
  try {
    for (const p of activeParcels.slice(0, 12)) {
      const rows: any = await drizzle.execute(
        sql`SELECT data, fetchedAt FROM parcelSatelliteCache WHERE parcelId = ${p.id} AND dataType = 'stats' AND indexType = 'NDVI' ORDER BY fetchedAt DESC LIMIT 1`
      );
      const row = (rows as any)?.[0]?.[0] ?? (rows as any)?.rows?.[0];
      if (row?.data) {
        const mean = extractNdviMean(row.data);
        if (mean !== null) {
          satelliteLines.push(`${p.name}: NDVI ${mean} (medición del ${String(row.fetchedAt).slice(0, 10)})`);
        }
      }
    }
  } catch (e) { console.log(`${TAG} Satelital no disponible:`, e); }

  // ── 4. Cosecha de la semana ──
  const harvestStats = await db.getDashboardStats(weekStart, weekEnd);
  const harvestLine = harvestStats && harvestStats.total > 0
    ? `Cosecha de la semana: ${harvestStats.total} cajas, ${harvestStats.totalWeight.toFixed(0)}kg (${harvestStats.firstQualityPercent}% primera calidad).`
    : "Sin cosecha registrada esta semana.";

  // ── 5. Etapa del ciclo activo (resuelto al inicio) ──
  let cycleLine = "Sin ciclo de producción registrado: el análisis toma toda la libreta.";
  let cyclePhase = "sin ciclo";
  if (activeCycle) {
    const daysSinceStart = Math.round((new Date(today + "T12:00:00").getTime() - new Date(activeCycle.startDate + "T12:00:00").getTime()) / 86400000);
    const cycleStats = await db.getDashboardStats(activeCycle.startDate, activeCycle.harvestEndDate ?? activeCycle.endDate ?? undefined);
    if (activeCycle.harvestEndDate) cyclePhase = "post-cosecha";
    else if (cycleStats && cycleStats.total > 0) cyclePhase = "cosecha activa";
    else cyclePhase = "desarrollo vegetativo (pre-cosecha)";
    cycleLine = `Ciclo "${activeCycle.name}": inició con la poda el ${activeCycle.startDate} (hace ${daysSinceStart} días). Fase actual: ${cyclePhase}.`
      + (cycleStats && cycleStats.total > 0 ? ` Acumulado del ciclo: ${cycleStats.total} cajas, ${cycleStats.totalWeight.toFixed(0)}kg.` : "");
  }

  // ── 6. Prompt y llamada a la IA ──
  const scopeLine = activeCycle
    ? `IMPORTANTE — ALCANCE DEL ANÁLISIS: solo se incluye información del CICLO ACTUAL ("${activeCycle.name}", desde el ${activeCycle.startDate}${cycleEnd ? ` hasta el ${cycleEnd}` : ""}). Los ciclos anteriores NO forman parte de este análisis: no menciones ni arrastres pendientes de ciclos pasados.`
    : `ALCANCE DEL ANÁLISIS: todavía no hay ciclos de producción registrados, así que se incluye toda la libreta.`;

  const podaBlock = activeCycle
    ? `ESTADO DE LA PODA EN ESTE CICLO (la poda es la labor que arranca el ciclo):
${parcelsWithPoda.length > 0
        ? parcelsWithPoda.map(p => `- ${p.name}: podada el ${podaByParcel.get(p.id)!.date}${podaByParcel.get(p.id)!.status === "en_progreso" ? " (poda en proceso)" : ""}`).join("\n")
        : "- Ninguna parcela registra poda todavía en este ciclo"}
${parcelsWithoutPoda.length > 0
        ? `\nPARCELAS SIN PODA REGISTRADA EN ESTE CICLO (${parcelsWithoutPoda.length}): ${parcelsWithoutPoda.map(p => p.name).join(", ")}
REGLA OBLIGATORIA: en estas parcelas la labor APENAS VA A COMENZAR. NO las califiques como atrasadas, rezagadas ni con problemas por no tener labores registradas; su ciclo simplemente aún no arranca. Si acaso, sugiere cuándo convendría iniciar la poda según el clima.`
        : ""}`
    : "";

  const prompt = `Genera el RESUMEN SEMANAL de una huerta de higo en México para la semana del ${weekStart} al ${weekEnd} (semana pasada). Hoy es ${today}.

${scopeLine}

ETAPA DEL CULTIVO:
${cycleLine}

${podaBlock}

ACTIVIDADES REALIZADAS EN LA SEMANA (${done.length}):
${done.length > 0 ? done.map(describeActivity).join("\n") : "- Ninguna registrada"}

ACTIVIDADES QUE QUEDARON PLANIFICADAS O EN PROGRESO EN ESA SEMANA (${planned.length}):
${planned.length > 0 ? planned.map(describeActivity).join("\n") : "- Ninguna"}

ACTIVIDADES ATRASADAS (planificadas con fecha vencida y aún sin completar) (${overdueActivities.length}):
${overdueActivities.length > 0 ? overdueActivities.map(describeActivity).join("\n") : "- Ninguna"}

ACTIVIDADES PLANEADAS PARA LOS PRÓXIMOS 14 DÍAS (${upcomingActivities.length}):
${upcomingActivities.length > 0 ? upcomingActivities.map(describeActivity).join("\n") : "- Ninguna programada"}

CLIMA DE LA SEMANA PASADA (día a día):
${weatherDailyLines || weatherLine}
Resumen: ${weatherLine}

PRONÓSTICO DE LOS PRÓXIMOS DÍAS:
${forecastLines || "Sin pronóstico disponible."}

NOTAS DE CAMPO DEL CICLO ACTUAL (${cycleNotes.length}, ${openNotes.length} sin resolver):
${noteLines.length > 0 ? noteLines.join("\n") : "- Ninguna registrada en este ciclo"}

DATOS SATELITALES (último NDVI por parcela):
${satelliteLines.length > 0 ? satelliteLines.join("\n") : "Sin datos satelitales recientes."}

COSECHA:
${harvestLine}

Escribe un panorama ejecutivo en español de 8-12 líneas para el productor:
1) Cómo va el cultivo según la etapa fenológica del higo (considera los días desde la poda y la época del año).
2) Qué se logró la semana pasada y qué quedó pendiente o atrasado (menciona parcelas por nombre). Recuerda: una parcela sin poda en este ciclo NO está atrasada, apenas va a comenzar.
3) Cómo influyó el clima de la semana pasada en las labores realizadas (por ejemplo, si llovió el día de una aplicación).
4) **Cruza el pronóstico con las actividades planeadas**: di explícitamente qué días convienen o NO convienen para cada labor programada (no aplicar fitosanitarios ni foliares antes de lluvia o con viento fuerte, ajustar riego si viene lluvia, aprovechar días secos para poda, etc.).
5) Estado de vigor según NDVI si hay datos (señala parcelas débiles) y atiende las notas de campo abiertas (plagas, riego, daños) que sigan sin resolver.
6) 2-3 recomendaciones concretas y accionables para los próximos días.
Tono profesional de ingeniero agrónomo, directo y útil. Sin saludos ni despedidas. Usa párrafos cortos o viñetas.`;

  console.log(
    `${TAG} Contexto enviado a la IA (ciclo ${activeCycle?.name ?? "sin ciclo"}): ${done.length} labores realizadas, ${planned.length} planificadas de la semana, ` +
    `${upcomingActivities.length} próximas, ${overdueActivities.length} atrasadas, ${cycleNotes.length} notas del ciclo, ` +
    `${parcelsWithoutPoda.length} parcelas sin poda aún, ` +
    `${weatherRaw.length} días de clima, ${forecastRaw.length} días de pronóstico, ${satelliteLines.length} parcelas con NDVI`
  );

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: "Eres un ingeniero agrónomo senior especializado en higo. Respondes de forma concisa, profesional y accionable, en español." },
          { role: "user", content: prompt },
        ],
        // IMPORTANTE: es un modelo de razonamiento — primero "piensa" y esos
        // tokens también cuentan. Con un presupuesto corto se gasta todo
        // razonando y la respuesta llega VACÍA (esa era la falla del resumen).
        max_tokens: AI_MAX_TOKENS,
        temperature: 0.4,
      }),
    });
    // Con force=true el admin pidió regenerar: si la IA falla hay que avisar
    // (devolver el resumen viejo daría un "éxito" engañoso)
    const failResult = () => (options?.force ? null : existing ?? null);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`${TAG} IA HTTP ${response.status}: ${errText.slice(0, 300)}`);
      lastError = `La IA respondió con error ${response.status}`;
      return failResult();
    }
    const result = await response.json();
    const choice = result.choices?.[0];
    const content: string = choice?.message?.content?.trim() ?? "";

    if (!content) {
      // Sin texto: casi siempre porque el razonamiento agotó el presupuesto
      const reasoningTokens = result.usage?.completion_tokens_details?.reasoning_tokens;
      if (choice?.finish_reason === "length") {
        lastError = "La IA se quedó sin espacio para responder (razonamiento demasiado largo)";
        console.error(`${TAG} Respuesta vacía por límite de tokens (razonamiento: ${reasoningTokens})`);
      } else {
        lastError = "La IA devolvió una respuesta vacía";
        console.error(`${TAG} Respuesta vacía (finish_reason: ${choice?.finish_reason})`);
      }
      return failResult();
    }

    const statsJson = JSON.stringify({
      cycleName: activeCycle?.name ?? null,
      cycleStart,
      cycleEnd,
      activitiesDone: done.length,
      activitiesPlanned: planned.length,
      activitiesUpcoming: upcomingActivities.length,
      activitiesOverdue: overdueActivities.length,
      fieldNotes: cycleNotes.length,
      fieldNotesOpen: openNotes.length,
      parcelsWithoutPoda: parcelsWithoutPoda.length,
      harvest: harvestStats ? { boxes: harvestStats.total, kg: harvestStats.totalWeight } : null,
      weatherDays: weatherRaw.length,
      forecastDays: forecastRaw.length,
      satelliteParcels: satelliteLines.length,
      generatedAt: new Date().toISOString(),
    });

    if (existing && options?.force) {
      await drizzle.update(weeklySummaries).set({
        content,
        model: result.model || "deepseek-v4-flash",
        cycleId: activeCycle?.id ?? null,
        cyclePhase,
        statsJson,
      }).where(eq(weeklySummaries.id, existing.id));
      const [updated] = await drizzle.select().from(weeklySummaries).where(eq(weeklySummaries.id, existing.id)).limit(1);
      console.log(`${TAG} Resumen regenerado (${weekStart})`);
      return updated;
    }

    // Upsert por weekStart (índice único): si el scheduler y el botón manual
    // corren a la vez, no se duplica la semana
    await drizzle.insert(weeklySummaries).values({
      weekStart,
      weekEnd,
      content,
      model: result.model || "deepseek-v4-flash",
      cycleId: activeCycle?.id ?? null,
      cyclePhase,
      statsJson,
    }).onDuplicateKeyUpdate({
      set: {
        content,
        model: result.model || "deepseek-v4-flash",
        cycleId: activeCycle?.id ?? null,
        cyclePhase,
        statsJson,
      },
    });
    const [created] = await drizzle.select().from(weeklySummaries)
      .where(eq(weeklySummaries.weekStart, weekStart))
      .orderBy(desc(weeklySummaries.id)).limit(1);
    console.log(`${TAG} Resumen generado (${weekStart} a ${weekEnd})`);
    return created;
  } catch (e: any) {
    console.error(`${TAG} Error generando resumen:`, e);
    lastError = `No se pudo contactar a la IA (${e?.message ?? "error de red"})`;
    return options?.force ? null : existing ?? null;
  }
}

let schedulerStarted = false;
let lastNightlyRun: string | null = null;

/** Hora local de México (0-23) */
function currentHourMx(): number {
  const hh = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    hour12: false,
  });
  return parseInt(hh, 10);
}

/**
 * Scheduler nocturno: cada madrugada (2-4 AM hora de México) REGENERA el
 * panorama para que el productor lo encuentre fresco por la mañana, con todo
 * lo que se capturó el día anterior.
 *
 * También cubre el caso de que falte por completo el resumen de la semana
 * (por ejemplo tras un despliegue): lo genera en cuanto lo detecta.
 */
export function startWeeklySummaryScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  console.log(`${TAG} Scheduler iniciado (regeneración nocturna 2-4 AM hora de México)`);

  const check = async () => {
    try {
      const drizzle = await getDb();
      if (!drizzle) return;

      const { weekStart } = getLastWeekRange();
      const [existing] = await drizzle.select({ id: weeklySummaries.id })
        .from(weeklySummaries)
        .where(eq(weeklySummaries.weekStart, weekStart))
        .limit(1);

      // 1. Falta el resumen de la semana: generarlo cuanto antes
      if (!existing) {
        await generateWeeklySummary();
        return;
      }

      // 2. Regeneración nocturna, una vez por noche
      const today = todayMx();
      const hour = currentHourMx();
      if (hour >= 2 && hour < 5 && lastNightlyRun !== today) {
        lastNightlyRun = today;
        console.log(`${TAG} Regeneración nocturna (${today})...`);
        await generateWeeklySummary({ force: true });
      }
    } catch (e) {
      console.error(`${TAG} Error en scheduler:`, e);
    }
  };

  // Primer chequeo a los 2 minutos del arranque (deja calentar el server)
  setTimeout(check, 2 * 60 * 1000);
  setInterval(check, 30 * 60 * 1000);
}
