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
  parcels, weeklySummaries,
} from "../drizzle/schema";
import { eq, desc, asc, and, gte, lte, inArray, isNull, sql } from "drizzle-orm";

const TAG = "[WeeklySummary]";

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

/**
 * Genera (o regenera con force) el resumen de la última semana completa.
 * Devuelve el registro creado, el existente si ya había, o null si no se pudo.
 */
export async function generateWeeklySummary(options?: { force?: boolean }): Promise<any | null> {
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

  // ── 1. Actividades de la semana ──
  const weekActivities = await drizzle.select().from(fieldActivities)
    .where(and(
      gte(fieldActivities.activityDate, weekStart as any),
      lte(fieldActivities.activityDate, weekEnd as any),
    ))
    .orderBy(asc(fieldActivities.activityDate));

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

  // ── 2. Clima de la semana ──
  let weatherLine = "Sin datos de clima (ubicación no configurada).";
  let weatherRaw: any[] = [];
  try {
    const locationConfig = await dbExt.getLocationConfig();
    if (locationConfig) {
      const { getWeatherData } = await import("./weatherService");
      weatherRaw = await getWeatherData(locationConfig.latitude, locationConfig.longitude, weekStart, weekEnd, locationConfig.timezone);
      if (weatherRaw.length > 0) {
        const avgMax = weatherRaw.reduce((s, d) => s + (d.temperatureMax || 0), 0) / weatherRaw.length;
        const avgMin = weatherRaw.reduce((s, d) => s + (d.temperatureMin || 0), 0) / weatherRaw.length;
        const rain = weatherRaw.reduce((s, d) => s + (d.precipitation || 0), 0);
        weatherLine = `Temp máx prom ${avgMax.toFixed(1)}°C, mín prom ${avgMin.toFixed(1)}°C, lluvia acumulada ${rain.toFixed(1)}mm en la semana.`;
      }
    }
  } catch (e) { console.log(`${TAG} Clima no disponible:`, e); }

  // ── 3. Satelital: último NDVI cacheado por parcela activa ──
  const satelliteLines: string[] = [];
  try {
    const activeParcels = await drizzle.select({ id: parcels.id, name: parcels.name })
      .from(parcels).where(eq(parcels.isActive, true));
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

  // ── 5. Ciclo activo y su etapa ──
  const today = todayMx();
  const allCycles = await drizzle.select().from(productionCycles)
    .orderBy(desc(productionCycles.startDate)).limit(5);
  const activeCycle = allCycles.find(c => !c.endDate || c.endDate >= today) ?? null;
  let cycleLine = "Sin ciclo de producción registrado.";
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
  const prompt = `Genera el RESUMEN SEMANAL de una huerta de higo en México para la semana del ${weekStart} al ${weekEnd} (semana pasada).

ETAPA DEL CULTIVO:
${cycleLine}

ACTIVIDADES REALIZADAS EN LA SEMANA (${done.length}):
${done.length > 0 ? done.map(describeActivity).join("\n") : "- Ninguna registrada"}

ACTIVIDADES QUE QUEDARON PLANIFICADAS O EN PROGRESO (${planned.length}):
${planned.length > 0 ? planned.map(describeActivity).join("\n") : "- Ninguna"}

CLIMA DE LA SEMANA:
${weatherLine}

DATOS SATELITALES (último NDVI por parcela):
${satelliteLines.length > 0 ? satelliteLines.join("\n") : "Sin datos satelitales recientes."}

COSECHA:
${harvestLine}

Escribe un panorama ejecutivo en español de 6-10 líneas para el productor:
1) Cómo va el cultivo según la etapa fenológica del higo (considera los días desde la poda y la época del año).
2) Qué se logró esta semana y qué quedó pendiente.
3) Cómo afectó (o afectará) el clima.
4) Estado de vigor según NDVI si hay datos (señala parcelas débiles).
5) 2-3 recomendaciones concretas para la semana que empieza.
Tono profesional de ingeniero agrónomo, directo y útil. Sin saludos ni despedidas. Usa párrafos cortos o viñetas.`;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [
          { role: "system", content: "Eres un ingeniero agrónomo senior especializado en higo. Respondes de forma concisa, profesional y accionable, en español." },
          { role: "user", content: prompt },
        ],
        max_tokens: 900,
        temperature: 0.4,
      }),
    });
    // Con force=true el admin pidió regenerar: si la IA falla hay que avisar
    // (devolver el resumen viejo daría un "éxito" engañoso)
    const failResult = () => (options?.force ? null : existing ?? null);

    if (!response.ok) {
      console.error(`${TAG} DeepSeek HTTP ${response.status}`);
      return failResult();
    }
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) return failResult();

    const statsJson = JSON.stringify({
      activitiesDone: done.length,
      activitiesPlanned: planned.length,
      harvest: harvestStats ? { boxes: harvestStats.total, kg: harvestStats.totalWeight } : null,
      weatherDays: weatherRaw.length,
      satelliteParcels: satelliteLines.length,
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
  } catch (e) {
    console.error(`${TAG} Error generando resumen:`, e);
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
