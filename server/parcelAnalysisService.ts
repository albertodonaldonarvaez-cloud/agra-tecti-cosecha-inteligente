/**
 * Análisis con IA de una parcela.
 *
 * Antes solo recibía los índices espectrales y la cosecha: la IA hablaba del
 * NDVI sin saber qué se había hecho en el terreno. Ahora se le manda todo lo de
 * ESA parcela —vigor por zonas, labores de la libreta, productos aplicados,
 * notas de campo, ciclo y clima— para que el diagnóstico sea concreto y
 * accionable en vez de genérico.
 *
 * Se regenera solo una vez al día y ÚNICAMENTE si hay información nueva: una
 * captura satelital más reciente o movimiento en la libreta de campo. Si nada
 * cambió, no se gasta una llamada a la IA.
 */
import { getDb } from "./db";
import {
  parcels, parcelDetails, parcelAiAnalysis, crops, cropVarieties, boxes,
  productionCycles, fieldActivities, fieldActivityParcels, fieldActivityProducts,
  fieldActivityWorkSessions, fieldNotes,
} from "../drizzle/schema";
import { eq, and, desc, asc, gte, lte, inArray, sql } from "drizzle-orm";

const TAG = "[IA Parcela]";
const AI_MODEL = "deepseek-v4-flash";
const AI_MAX_TOKENS = 4000;

const ACTIVITY_LABELS: Record<string, string> = {
  riego: "Riego", fertilizacion: "Fertilización", nutricion: "Nutrición", poda: "Poda",
  control_maleza: "Control de maleza", control_plagas: "Control de plagas",
  aplicacion_fitosanitaria: "Aplicación fitosanitaria", otro: "Otra labor",
};

const NOTE_LABELS: Record<string, string> = {
  arboles_mal_plantados: "Árboles mal plantados", plaga_enfermedad: "Plaga o enfermedad",
  riego_drenaje: "Riego/drenaje", dano_mecanico: "Daño mecánico", maleza: "Maleza",
  fertilizacion: "Fertilización", suelo: "Suelo", infraestructura: "Infraestructura",
  fauna: "Fauna", otro: "Otro",
};

function todayMx(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function toDateStr(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 10) : new Date(v as any).toISOString().slice(0, 10);
}

/**
 * "Huella" de la libreta de campo de una parcela: la última vez que se tocó
 * algo suyo. Si no cambia, no hace falta regenerar el análisis.
 */
async function notebookStamp(parcelId: number): Promise<string> {
  const drizzle = await getDb();
  if (!drizzle) return "";
  try {
    const rows: any = await drizzle.execute(sql`
      SELECT
        (SELECT MAX(a.updatedAt) FROM fieldActivities a
           JOIN fieldActivityParcels ap ON ap.activityId = a.id
          WHERE ap.parcelId = ${parcelId}) AS actStamp,
        (SELECT COUNT(*) FROM fieldActivities a
           JOIN fieldActivityParcels ap ON ap.activityId = a.id
          WHERE ap.parcelId = ${parcelId}) AS actCount,
        (SELECT MAX(updatedAt) FROM fieldNotes WHERE parcelId = ${parcelId}) AS noteStamp,
        (SELECT COUNT(*) FROM fieldNotes WHERE parcelId = ${parcelId}) AS noteCount
    `);
    const r = (rows as any)?.[0]?.[0] ?? (rows as any)?.rows?.[0] ?? {};
    const a = r.actStamp ? new Date(r.actStamp).getTime() : 0;
    const n = r.noteStamp ? new Date(r.noteStamp).getTime() : 0;
    // Se incluyen los conteos: así un borrado también cuenta como novedad
    return `${Math.max(a, n)}:${r.actCount ?? 0}:${r.noteCount ?? 0}`;
  } catch {
    return "";
  }
}

/** Última captura satelital registrada para la parcela */
async function lastCapture(parcelId: number): Promise<string | null> {
  const drizzle = await getDb();
  if (!drizzle) return null;
  try {
    const rows: any = await drizzle.execute(
      sql`SELECT MAX(captureDate) AS last FROM parcelSatelliteHistory WHERE parcelId = ${parcelId}`
    );
    const row = (rows as any)?.[0]?.[0] ?? (rows as any)?.rows?.[0];
    return row?.last ?? null;
  } catch {
    return null;
  }
}

/**
 * Arma todo el contexto de la parcela para la IA.
 * Todo sale de la base local: no se consulta al satélite aquí.
 */
export async function buildParcelContext(parcelId: number): Promise<string | null> {
  const drizzle = await getDb();
  if (!drizzle) return null;

  const [parcel] = await drizzle
    .select({ id: parcels.id, code: parcels.code, name: parcels.name })
    .from(parcels)
    .where(eq(parcels.id, parcelId))
    .limit(1);
  if (!parcel) return null;

  const today = todayMx();
  const bloques: string[] = [];

  // ── Ficha de la parcela ──
  try {
    const [details] = await drizzle.select().from(parcelDetails).where(eq(parcelDetails.parcelId, parcelId));
    const partes: string[] = [];
    if (details) {
      if (details.cropId) {
        const [crop] = await drizzle.select({ name: crops.name }).from(crops).where(eq(crops.id, details.cropId));
        if (crop?.name) partes.push(`Cultivo: ${crop.name}`);
      }
      if (details.varietyId) {
        const [variety] = await drizzle.select({ name: cropVarieties.name }).from(cropVarieties).where(eq(cropVarieties.id, details.varietyId));
        if (variety?.name) partes.push(`Variedad: ${variety.name}`);
      }
      if (details.totalHectares) partes.push(`Superficie: ${details.totalHectares} ha`);
      if (details.productiveHectares) partes.push(`Superficie productiva: ${details.productiveHectares} ha`);
      if (details.totalTrees) partes.push(`Árboles: ${details.totalTrees}`);
      if (details.productiveTrees) partes.push(`Productivos: ${details.productiveTrees}`);
      if (details.treeDensityPerHectare) partes.push(`Densidad: ${details.treeDensityPerHectare} árboles/ha`);
      if (details.establishedAt) partes.push(`Establecida: ${toDateStr(details.establishedAt)}`);
    }
    if (partes.length > 0) bloques.push(`FICHA DE LA PARCELA:\n${partes.join(" | ")}`);
  } catch { /* sin ficha */ }

  // ── Ciclo activo ──
  let cycleStart: string | null = null;
  let cycleId: number | null = null;
  try {
    const cycles = await drizzle.select().from(productionCycles).orderBy(desc(productionCycles.startDate)).limit(5);
    const active = cycles.find((c) => !c.endDate || c.endDate >= today);
    if (active) {
      cycleStart = active.startDate;
      cycleId = active.id;
      const dias = Math.round((new Date(today + "T12:00:00").getTime() - new Date(active.startDate + "T12:00:00").getTime()) / 86400000);
      bloques.push(
        `CICLO EN CURSO: "${active.name}" — inició con la poda el ${active.startDate} (hace ${dias} días).\n` +
        `Todo lo que sigue es de ESTE ciclo; lo de ciclos anteriores no cuenta para el diagnóstico.`
      );
    }
  } catch { /* sin ciclos */ }

  // ── Estado satelital con detalle por zonas ──
  try {
    const { getCachedVigor } = await import("./satelliteAutoSync");
    const cached = await getCachedVigor(parcelId);
    if (cached?.vigor) {
      const v = cached.vigor;
      const zonas = (v.zones ?? []).map((z: any) => `${z.name} ${z.meanNdvi}`).join(", ");
      let linea = `ESTADO SATELITAL (captura del ${cached.captureDate ?? "sin fecha"}):\n` +
        `NDVI promedio ${v.meanNdvi} (mín ${v.minNdvi}, máx ${v.maxNdvi}).\n` +
        `Reparto del terreno: ${v.distribution.suelo}% suelo/seco (NDVI<0.2), ` +
        `${v.distribution.bajo}% vigor bajo (0.2-0.4), ${v.distribution.medio}% medio (0.4-0.6), ` +
        `${v.distribution.alto}% alto (>0.6).`;
      if (zonas) linea += `\nNDVI por zona del terreno: ${zonas}.`;
      if (v.driest && v.strongest && v.spread >= 0.1) {
        linea += `\nZona MÁS DÉBIL: ${v.driest.name} (NDVI ${v.driest.meanNdvi}). ` +
          `Zona más vigorosa: ${v.strongest.name} (NDVI ${v.strongest.meanNdvi}). ` +
          `Diferencia de ${v.spread}: el lote NO es uniforme.`;
      } else if (v.spread < 0.1) {
        linea += "\nEl vigor es parejo en toda la parcela.";
      }
      bloques.push(linea);
    }

    // Evolución: cómo viene el vigor captura tras captura
    const historyRows: any = await drizzle.execute(sql`
      SELECT captureDate, ndviMean, clearPct FROM parcelSatelliteHistory
       WHERE parcelId = ${parcelId} ${cycleStart ? sql`AND captureDate >= ${cycleStart}` : sql``}
       ORDER BY captureDate DESC LIMIT 10
    `);
    const history = ((historyRows as any)?.[0] ?? (historyRows as any)?.rows ?? []) as any[];
    if (history.length > 1) {
      const linea = history
        .slice()
        .reverse()
        .map((h) => `${h.captureDate}: NDVI ${Number(h.ndviMean).toFixed(2)}`)
        .join(" → ");
      bloques.push(`EVOLUCIÓN DEL VIGOR EN EL CICLO (de la más vieja a la más nueva):\n${linea}`);
    }
  } catch { /* sin satelital */ }

  // ── Libreta de campo: qué se ha hecho EN ESTA PARCELA ──
  try {
    const actFilters: any[] = [eq(fieldActivityParcels.parcelId, parcelId)];
    if (cycleStart) actFilters.push(gte(fieldActivities.activityDate, cycleStart as any));

    const acts = await drizzle
      .select({
        id: fieldActivities.id,
        activityType: fieldActivities.activityType,
        activitySubtype: fieldActivities.activitySubtype,
        description: fieldActivities.description,
        activityDate: fieldActivities.activityDate,
        status: fieldActivities.status,
        performedBy: fieldActivities.performedBy,
        durationMinutes: fieldActivities.durationMinutes,
      })
      .from(fieldActivities)
      .innerJoin(fieldActivityParcels, eq(fieldActivityParcels.activityId, fieldActivities.id))
      .where(and(...actFilters))
      .orderBy(desc(fieldActivities.activityDate))
      .limit(40);

    if (acts.length > 0) {
      // Productos aplicados en esas labores
      const ids = acts.map((a) => a.id);
      const prods = await drizzle
        .select()
        .from(fieldActivityProducts)
        .where(inArray(fieldActivityProducts.activityId, ids));
      const prodsByAct: Record<number, string[]> = {};
      for (const p of prods) {
        if (!prodsByAct[p.activityId]) prodsByAct[p.activityId] = [];
        const usado = p.quantity ? `${p.quantity} ${p.unit ?? ""}`.trim() : null;
        const plan = p.plannedQuantity ? `plan. ${p.plannedQuantity} ${p.unit ?? ""}`.trim() : null;
        const cant = [plan, usado ? `usado ${usado}` : null].filter(Boolean).join(", ");
        prodsByAct[p.activityId].push(cant ? `${p.productName} (${cant})` : p.productName);
      }

      // Horas trabajadas
      const sesiones = await drizzle
        .select()
        .from(fieldActivityWorkSessions)
        .where(inArray(fieldActivityWorkSessions.activityId, ids));
      const minsByAct: Record<number, number> = {};
      for (const s of sesiones) {
        if (!s.startTime || !s.endTime) continue;
        const [sh, sm] = s.startTime.split(":").map(Number);
        const [eh, em] = s.endTime.split(":").map(Number);
        let dur = (eh * 60 + em) - (sh * 60 + sm);
        if (dur < 0) dur += 24 * 60;
        minsByAct[s.activityId] = (minsByAct[s.activityId] || 0) + dur;
      }

      const hechas = acts.filter((a) => a.status === "completada");
      const pendientes = acts.filter((a) => a.status === "planificada" || a.status === "en_progreso");

      const describe = (a: typeof acts[number]) => {
        const label = ACTIVITY_LABELS[a.activityType] || a.activityType;
        const sub = a.activitySubtype ? ` (${a.activitySubtype})` : "";
        const mins = minsByAct[a.id] || a.durationMinutes || 0;
        const horas = mins > 0 ? ` [${(mins / 60).toFixed(1)}h]` : "";
        const productos = prodsByAct[a.id]?.length ? ` — productos: ${prodsByAct[a.id].join("; ")}` : "";
        return `- ${toDateStr(a.activityDate)}: ${label}${sub}${horas} — ${a.description || ""}` +
          ` (${a.performedBy || "sin responsable"})${productos}`;
      };

      bloques.push(
        `LABORES REALIZADAS EN ESTA PARCELA (${hechas.length}):\n` +
        (hechas.length > 0 ? hechas.map(describe).join("\n") : "- Ninguna registrada")
      );
      if (pendientes.length > 0) {
        bloques.push(
          `LABORES PENDIENTES O EN PROCESO EN ESTA PARCELA (${pendientes.length}):\n` +
          pendientes.map(describe).join("\n")
        );
      }
    } else {
      bloques.push("LABORES EN ESTA PARCELA: ninguna registrada en el ciclo.");
    }
  } catch (e) {
    console.log(`${TAG} Libreta no disponible:`, e);
  }

  // ── Notas de campo de esta parcela ──
  try {
    const noteFilters: any[] = [eq(fieldNotes.parcelId, parcelId)];
    if (cycleStart) noteFilters.push(gte(fieldNotes.createdAt, new Date(cycleStart + "T00:00:00")));
    const notes = await drizzle
      .select()
      .from(fieldNotes)
      .where(and(...noteFilters))
      .orderBy(desc(fieldNotes.createdAt))
      .limit(15);
    if (notes.length > 0) {
      const abiertas = notes.filter((n) => n.status !== "resuelta" && n.status !== "descartada");
      const lineas = notes.map((n) => {
        const d = toDateStr(n.createdAt);
        const estado = n.status === "resuelta" ? "resuelta" : n.status === "descartada" ? "descartada" : "SIN RESOLVER";
        const resol = n.resolutionNotes ? ` → ${n.resolutionNotes.slice(0, 120)}` : "";
        return `- ${d} [${n.severity}] ${NOTE_LABELS[n.category] ?? n.category}: ${(n.description || "").slice(0, 160)} (${estado})${resol}`;
      });
      bloques.push(
        `NOTAS DE CAMPO DE ESTA PARCELA (${notes.length}, ${abiertas.length} sin resolver):\n${lineas.join("\n")}`
      );
    }
  } catch { /* sin notas */ }

  // ── Cómo va este ciclo contra los anteriores ──
  // Es lo que convierte el diagnóstico en comparativo: sin esto la IA solo
  // puede decir "el NDVI está en 0.51", que por sí solo no dice nada.
  try {
    const { buildCycleComparisonText } = await import("./parcelTelemetry");
    const comparativo = await buildCycleComparisonText(parcelId);
    if (comparativo) bloques.push(comparativo);
  } catch (e: any) {
    console.error('[ParcelAI] No se pudo armar el comparativo de ciclos:', e?.message);
  }

  // ── Cosecha de la parcela ──
  try {
    if (parcel.code) {
      const filtros: any[] = [eq(boxes.parcelCode, parcel.code)];
      const harvest = await drizzle
        .select({ weight: boxes.weight, submissionTime: boxes.submissionTime })
        .from(boxes)
        .where(and(...filtros))
        .orderBy(asc(boxes.submissionTime));
      if (harvest.length > 0) {
        const delCiclo = cycleStart
          ? harvest.filter((h) => toDateStr(h.submissionTime) >= cycleStart!)
          : harvest;
        const kg = (rows: typeof harvest) => rows.reduce((s, h) => s + (h.weight || 0), 0) / 1000;
        let texto = `COSECHA DE ESTA PARCELA:\nHistórico: ${harvest.length} cajas, ${kg(harvest).toFixed(0)} kg.`;
        if (cycleStart) {
          texto += `\nEn el ciclo actual: ${delCiclo.length} cajas, ${kg(delCiclo).toFixed(0)} kg.`;
          if (delCiclo.length > 0) {
            const semanal: Record<string, number> = {};
            for (const h of delCiclo) {
              const d = new Date(h.submissionTime);
              const ws = new Date(d);
              ws.setDate(d.getDate() - d.getDay());
              const key = ws.toISOString().split("T")[0];
              semanal[key] = (semanal[key] || 0) + (h.weight || 0) / 1000;
            }
            const linea = Object.entries(semanal)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([w, v]) => `${w}: ${v.toFixed(0)}kg`)
              .join(" · ");
            texto += `\nPor semana: ${linea}`;
          }
        }
        bloques.push(texto);
      }
    }
  } catch { /* sin cosecha */ }

  // ── Clima reciente ──
  try {
    const dbExt = await import("./db_extended");
    const locationConfig = await dbExt.getLocationConfig();
    if (locationConfig) {
      const { getWeatherData, getExtendedForecast } = await import("./weatherService");
      const desde = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
      const clima = await getWeatherData(locationConfig.latitude, locationConfig.longitude, desde, today, locationConfig.timezone);
      if (clima.length > 0) {
        const lluvia = clima.reduce((s: number, d: any) => s + (d.precipitation || 0), 0);
        const maxProm = clima.reduce((s: number, d: any) => s + (d.temperatureMax || 0), 0) / clima.length;
        bloques.push(
          `CLIMA DE LOS ÚLTIMOS 14 DÍAS: temperatura máxima promedio ${maxProm.toFixed(1)}°C, ` +
          `lluvia acumulada ${lluvia.toFixed(1)} mm.`
        );
      }
      const pronostico = await getExtendedForecast(locationConfig.latitude, locationConfig.longitude, 5, locationConfig.timezone);
      if (pronostico.length > 0) {
        const lineas = pronostico.map((d: any) =>
          `- ${d.date}: ${d.conditionText ?? ""}, máx ${Number(d.temperatureMax ?? 0).toFixed(0)}°C, ` +
          `lluvia ${Number(d.precipitation ?? 0).toFixed(1)}mm (prob. ${Number(d.precipitationProbability ?? 0).toFixed(0)}%)`
        ).join("\n");
        bloques.push(`PRONÓSTICO DE LOS PRÓXIMOS DÍAS:\n${lineas}`);
      }
    }
  } catch { /* sin clima */ }

  return bloques.join("\n\n");
}

/** Serie espectral guardada en el cache (NDVI/NDRE/NDMI) */
async function getCachedSeries(parcelId: number, indexType: string): Promise<any[]> {
  const drizzle = await getDb();
  if (!drizzle) return [];
  try {
    const rows: any = await drizzle.execute(
      sql`SELECT data FROM parcelSatelliteCache WHERE parcelId = ${parcelId} AND dataType = 'stats' AND indexType = ${indexType} AND mapDate IS NULL ORDER BY fetchedAt DESC LIMIT 1`
    );
    const row = (rows as any)?.[0]?.[0] ?? (rows as any)?.rows?.[0];
    return row?.data ? JSON.parse(row.data) : [];
  } catch {
    return [];
  }
}

function formatSeries(data: any[], label: string): string {
  if (!data?.length) return `${label}: sin datos`;
  // Solo las últimas 20 mediciones: el resto satura el prompt sin aportar
  const recientes = data.slice(-20);
  return `${label} (${recientes.length} de ${data.length} mediciones, ${recientes[0].date} a ${recientes[recientes.length - 1].date}):\n` +
    recientes.map((d: any) => `  ${d.date}: media=${Number(d.mean).toFixed(3)}`).join("\n");
}

export interface GenerateOptions {
  force?: boolean;
  /** Series espectrales enviadas desde la pantalla (si no, salen del cache) */
  ndviData?: any[];
  ndreData?: any[];
  ndmiData?: any[];
  fromDate?: string;
  toDate?: string;
}

/**
 * Genera el análisis de una parcela.
 * Devuelve null si no había nada nuevo que analizar (y no se forzó).
 */
export async function generateParcelAnalysis(
  parcelId: number,
  parcelName: string,
  options: GenerateOptions = {},
): Promise<{ analysis: string; model: string; cached: boolean } | null> {
  const drizzle = await getDb();
  if (!drizzle) return null;

  const capture = await lastCapture(parcelId);
  const stamp = await notebookStamp(parcelId);

  // ¿Hay algo nuevo desde el último análisis?
  const [previo] = await drizzle
    .select()
    .from(parcelAiAnalysis)
    .where(eq(parcelAiAnalysis.parcelId, parcelId))
    .orderBy(desc(parcelAiAnalysis.createdAt))
    .limit(1);

  if (previo && !options.force) {
    const mismoSatelite = (previo.lastCaptureDate ?? null) === (capture ?? null);
    const mismaLibreta = (previo.lastNotebookStamp ?? "") === stamp;
    if (mismoSatelite && mismaLibreta) {
      return { analysis: previo.analysis, model: previo.model ?? AI_MODEL, cached: true };
    }
  }

  const { getGlobalSetting } = await import("./globalSettings");
  let apiKey = await getGlobalSetting("deepseekApiKey");
  if (!apiKey) {
    console.log(`${TAG} Sin API key configurada, se omite`);
    return null;
  }
  try {
    const { decryptSecret, isEncrypted } = await import("./encryption");
    if (isEncrypted(apiKey)) apiKey = decryptSecret(apiKey);
  } catch { /* key en claro */ }

  const contexto = await buildParcelContext(parcelId);
  if (contexto === null) return null;

  const ndvi = options.ndviData?.length ? options.ndviData : await getCachedSeries(parcelId, "NDVI");
  const ndre = options.ndreData?.length ? options.ndreData : await getCachedSeries(parcelId, "NDRE");
  const ndmi = options.ndmiData?.length ? options.ndmiData : await getCachedSeries(parcelId, "NDMI");

  const prompt = `Eres un ingeniero agrónomo experto en agricultura de precisión y teledetección, especializado en higo. Analiza la parcela "${parcelName}" con TODA la información siguiente y da un diagnóstico concreto y accionable.

${contexto}

SERIES ESPECTRALES:
${formatSeries(ndvi, "NDVI (vigor vegetativo)")}

${formatSeries(ndre, "NDRE (nitrógeno/clorofila)")}

${formatSeries(ndmi, "NDMI (humedad/estrés hídrico)")}

Guía de lectura del NDVI en higo: menos de 0.2 es suelo desnudo o planta seca;
0.2-0.4 vigor bajo (estrés, poda reciente o brotación incipiente); 0.4-0.6
desarrollo medio; más de 0.6 follaje denso y sano.

INSTRUCCIONES:
1) Di cómo está la parcela HOY y, sobre todo, DÓNDE: nombra la zona débil tal como viene ("el noreste está seco, NDVI 0.18, contra 0.55 del resto"). Si el vigor es parejo, dilo en lugar de inventar problemas.
2) **Cruza el estado satelital con la libreta de campo de esta parcela**: si una zona está débil y ahí se regó hace poco, sospecha falla de riego; si la parcela está recién podada, el vigor bajo es NORMAL y no es una alarma; si se aplicó fertilizante y el NDVI no subió, señálalo.
3) Toma en cuenta los productos aplicados y las cantidades: si se usó menos de lo planeado, puede explicar una respuesta pobre.
4) Atiende las notas de campo sin resolver de esta parcela.
5) Relaciona el vigor con la cosecha real de la parcela cuando haya datos.
6) Cierra con 2-3 acciones concretas para los próximos días, considerando el pronóstico (no aplicar foliares ni fitosanitarios antes de lluvia o con viento, ajustar riego si viene agua).

Máximo 10 líneas. Tono de ingeniero agrónomo: directo, específico y sin rodeos. Sin saludos ni despedidas. Responde en español.`;

  console.log(`${TAG} Analizando "${parcelName}" (captura ${capture ?? "sin datos"})`);

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: "Eres un ingeniero agrónomo senior especializado en agricultura de precisión, teledetección satelital y manejo del higo. Respondes de forma concisa, específica y accionable, en español." },
          { role: "user", content: prompt },
        ],
        // El modelo razona antes de responder y ese consumo cuenta aquí
        max_tokens: AI_MAX_TOKENS,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`${TAG} IA HTTP ${response.status}: ${errText.slice(0, 200)}`);
      throw new Error(`La IA respondió con error ${response.status}`);
    }

    const result = await response.json();
    const choice = result.choices?.[0];
    const analysis: string = choice?.message?.content?.trim() ?? "";
    if (!analysis) {
      console.error(`${TAG} Respuesta vacía (finish_reason: ${choice?.finish_reason})`);
      throw new Error("La IA no devolvió análisis (se quedó sin espacio para responder)");
    }

    const model = result.model || AI_MODEL;
    const today = todayMx();
    let cycleId: number | null = null;
    try {
      const { resolveCycleForDate } = await import("./satelliteAutoSync");
      cycleId = (await resolveCycleForDate(today))?.id ?? null;
    } catch { /* sin ciclo */ }

    await drizzle.insert(parcelAiAnalysis).values({
      parcelId,
      analysis,
      fromDate: options.fromDate || "",
      toDate: options.toDate || today,
      model,
      cycleId,
      lastCaptureDate: capture,
      lastNotebookStamp: stamp,
    });

    console.log(`${TAG} Análisis generado para "${parcelName}" (${analysis.length} caracteres)`);
    return { analysis, model, cached: false };
  } catch (e: any) {
    console.error(`${TAG} Error generando el análisis:`, e?.message);
    throw e;
  }
}

// ── Scheduler diario ──
let dailyInterval: ReturnType<typeof setInterval> | null = null;
let lastRunDate: string | null = null;
let running = false;

/**
 * Recorre las parcelas y regenera el análisis de las que tengan información
 * nueva (captura satelital o movimiento en la libreta). Las que no cambiaron
 * se saltan sin gastar una llamada a la IA.
 */
export async function refreshStaleAnalyses(): Promise<{ analizadas: number; omitidas: number }> {
  const drizzle = await getDb();
  if (!drizzle) return { analizadas: 0, omitidas: 0 };

  const activas = await drizzle
    .select({ id: parcels.id, name: parcels.name })
    .from(parcels)
    .where(eq(parcels.isActive, true));

  let analizadas = 0;
  let omitidas = 0;
  for (const p of activas) {
    try {
      const res = await generateParcelAnalysis(p.id, p.name || `Parcela ${p.id}`);
      if (res?.cached === false) analizadas++;
      else omitidas++;
    } catch (e: any) {
      console.error(`${TAG} ${p.name}: ${e?.message}`);
    }
  }
  console.log(`${TAG} Revisión diaria: ${analizadas} análisis nuevos, ${omitidas} sin cambios`);
  return { analizadas, omitidas };
}

function currentHourMx(): number {
  return parseInt(new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City", hour: "2-digit", hour12: false,
  }), 10);
}

/**
 * Revisión diaria de madrugada (3-5 AM hora de México), después del refresco
 * satelital y del resumen general, para que encuentre los datos más frescos.
 */
export function startParcelAnalysisScheduler(): void {
  if (dailyInterval) return;
  console.log(`🧠 ${TAG} Scheduler diario iniciado (3-5 AM hora de México, solo si hay info nueva)`);

  const check = async () => {
    if (running) return;
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
    const hora = currentHourMx();
    if (hora < 3 || hora >= 5 || lastRunDate === hoy) return;
    running = true;
    lastRunDate = hoy;
    try {
      await refreshStaleAnalyses();
    } catch (e) {
      console.error(`${TAG} Error en la revisión diaria:`, e);
    } finally {
      running = false;
    }
  };

  dailyInterval = setInterval(() => { check().catch(console.error); }, 20 * 60 * 1000);
}

export function stopParcelAnalysisScheduler(): void {
  if (dailyInterval) {
    clearInterval(dailyInterval);
    dailyInterval = null;
  }
}
