/**
 * Sincronización satelital automática.
 *
 * TODOS LOS DÍAS se le pregunta a Copernicus si hay una pasada nueva sobre cada
 * parcela. Si la hay, se descargan su imagen, sus índices y su vigor por zonas
 * y se guardan en el servidor. Si NO la hay —Sentinel-2 repite cada ~5 días, o
 * estuvo nublado— no se descarga nada: la revisión cuesta una sola consulta por
 * parcela y lo guardado sigue vigente.
 *
 * Así la pantalla de Análisis de Parcela nunca tiene que llamar al satélite:
 * lee del servidor y abre al instante.
 *
 * También se revisa al arrancar el sistema, por si estuvo apagado cuando tocaba.
 *
 * Cada captura nueva se guarda en el historial (parcelSatelliteHistory), así se
 * puede ver cómo evolucionó la parcela a lo largo del ciclo y no solo su foto
 * más reciente.
 *
 * Antes esto solo ocurría si alguien apretaba el botón en Configuración: por eso
 * el Dashboard podía quedarse meses mostrando una imagen vieja.
 */
import { getDb } from "./db";
import { parcels, boxes, productionCycles } from "../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";

const TIMEZONE = "America/Mexico_City";
const TAG = "[Satellite Sync]";

/**
 * Cada cuánto se REVISA si hay datos nuevos. Diario.
 * Revisar no es descargar: si la pasada más reciente es la que ya está
 * guardada, la parcela se salta entera.
 */
const REFRESH_HOURS = 24;

/**
 * Cuánto vale la lista de pasadas antes de volver a preguntarle al satélite
 * cuando alguien navega por la web. La revisión diaria la pide siempre fresca
 * (es justo lo que va a buscar); esto solo evita consultas repetidas si algo
 * más necesita la lista entre revisión y revisión.
 */
const PASSES_TTL_HOURS = 20;

/**
 * A qué ciclo de producción pertenece una fecha.
 * Sirve para saber "de cuándo es esta imagen" en términos del cultivo, no solo
 * del calendario: una foto de agosto puede ser del ciclo pasado o del nuevo.
 */
export async function resolveCycleForDate(dateStr: string): Promise<{ id: number; name: string } | null> {
  const drizzle = await getDb();
  if (!drizzle) return null;
  try {
    const cycles = await drizzle
      .select({ id: productionCycles.id, name: productionCycles.name, startDate: productionCycles.startDate, endDate: productionCycles.endDate })
      .from(productionCycles)
      .orderBy(desc(productionCycles.startDate));
    const found = cycles.find((c) => c.startDate <= dateStr && (!c.endDate || c.endDate >= dateStr));
    return found ? { id: found.id, name: found.name } : null;
  } catch {
    return null;
  }
}

/**
 * Pasadas del satélite sobre la parcela, con cache local.
 *
 * Se guarda la lista en la base y solo se vuelve a preguntar a Copernicus
 * cuando vence: así abrir el Dashboard o Análisis de Parcela varias veces no
 * genera una consulta al satélite cada vez.
 */
export async function getClearPassesCached(
  parcelId: number,
  geoPolygon: any,
  force = false,
): Promise<{ date: string; clearPct: number }[]> {
  const drizzle = await getDb();
  if (!drizzle) return [];

  if (!force) {
    try {
      const rows: any = await drizzle.execute(
        sql`SELECT data, fetchedAt FROM parcelSatelliteCache WHERE parcelId = ${parcelId} AND dataType = 'passes' AND indexType = 'NDVI' AND mapDate = 'latest' LIMIT 1`
      );
      const row = (rows as any)?.[0]?.[0] ?? (rows as any)?.rows?.[0];
      if (row?.data && row.fetchedAt) {
        const ageHours = (Date.now() - new Date(row.fetchedAt).getTime()) / 3600000;
        if (ageHours < PASSES_TTL_HOURS) {
          console.log(`${TAG} Pasadas desde cache local (parcela ${parcelId}, ${Math.round(ageHours)}h)`);
          return JSON.parse(row.data);
        }
      }
    } catch { /* cache ilegible: se vuelve a consultar */ }
  }

  const { listClearPasses } = await import("./copernicusService");
  let passes = await listClearPasses(geoPolygon, 60);
  // Sin nada en 60 días se busca más atrás: quedarse sin fecha de pasada es
  // peor que mostrar una captura algo más vieja
  if (passes.length === 0) passes = await listClearPasses(geoPolygon, 120);
  if (passes.length > 0) {
    try {
      await drizzle.execute(
        sql`INSERT INTO parcelSatelliteCache (parcelId, dataType, indexType, mapDate, data, fetchedAt) VALUES (${parcelId}, 'passes', 'NDVI', 'latest', ${JSON.stringify(passes)}, NOW()) ON DUPLICATE KEY UPDATE data = VALUES(data), fetchedAt = NOW()`
      );
    } catch (e) {
      console.error(`${TAG} No se pudo guardar la lista de pasadas:`, e);
    }
  }
  return passes;
}

/** Análisis de vigor por zonas guardado para una parcela (sin tocar el satélite) */
export async function getCachedVigor(parcelId: number): Promise<
  { captureDate: string | null; cycleId: number | null; vigor: any } | null
> {
  const drizzle = await getDb();
  if (!drizzle) return null;
  try {
    const rows: any = await drizzle.execute(
      sql`SELECT data, captureDate, cycleId FROM parcelSatelliteCache WHERE parcelId = ${parcelId} AND dataType = 'zones' AND indexType = 'NDVI' AND mapDate = 'latest' LIMIT 1`
    );
    const row = (rows as any)?.[0]?.[0] ?? (rows as any)?.rows?.[0];
    if (!row?.data) return null;
    return {
      captureDate: row.captureDate ?? null,
      cycleId: row.cycleId ?? null,
      vigor: JSON.parse(row.data),
    };
  } catch {
    return null;
  }
}

export interface SatelliteSyncResult {
  updated: number;
  /** Parcelas revisadas que no tenían pasada nueva: no se les descargó nada */
  unchanged: number;
  errors: number;
  errorDetails: string[];
  total: number;
}

/** Resultado de revisar UNA parcela */
export interface ParcelSyncResult {
  parcelId: number;
  label: string;
  status: "actualizada" | "sin-cambios" | "sin-poligono" | "error";
  captureDate: string | null;
  clearPct: number | null;
  cycleName: string | null;
  detail?: string;
}

/** Convierte el polígono guardado (varios formatos históricos) a GeoJSON */
function toGeoPolygon(raw: unknown): any | null {
  try {
    const polyData = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(polyData)) {
      const ring = polyData.map((p: any) => [p.lng || p.longitude || p[1], p.lat || p.latitude || p[0]]);
      if (ring.length === 0) return null;
      const first = ring[0], last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
      return { type: "Polygon", coordinates: [ring] };
    }
    if ((polyData as any)?.type === "Polygon") return polyData;
    return null;
  } catch {
    return null;
  }
}

const INDICES: ("NDVI" | "NDRE" | "NDMI")[] = ["NDVI", "NDRE", "NDMI"];

/** Qué hay ya guardado de esta parcela, para no volver a bajar lo mismo */
async function estadoGuardado(parcelId: number): Promise<{ captureDate: string | null; mapas: number; series: number }> {
  const drizzle = await getDb();
  if (!drizzle) return { captureDate: null, mapas: 0, series: 0 };
  try {
    const res: any = await drizzle.execute(sql`
      SELECT
        MAX(CASE WHEN dataType = 'map' AND indexType = 'NDVI' AND mapDate = 'latest' THEN captureDate END) AS captureDate,
        SUM(CASE WHEN dataType = 'map'   AND mapDate = 'latest' THEN 1 ELSE 0 END) AS mapas,
        SUM(CASE WHEN dataType = 'stats' AND mapDate IS NULL    THEN 1 ELSE 0 END) AS series
      FROM parcelSatelliteCache WHERE parcelId = ${parcelId}
    `);
    const row = ((res?.[0] ?? res?.rows ?? []) as any[])[0] ?? {};
    const cd = row.captureDate;
    return {
      captureDate: cd ? (cd instanceof Date ? cd.toISOString().split("T")[0] : String(cd).split("T")[0]) : null,
      mapas: Number(row.mapas || 0),
      series: Number(row.series || 0),
    };
  } catch {
    return { captureDate: null, mapas: 0, series: 0 };
  }
}

/**
 * Revisa UNA parcela y, si hay pasada nueva, guarda todo lo satelital.
 *
 * @param opts.force  descargar aunque la pasada sea la misma que ya está guardada
 */
export async function syncOneParcel(
  parcelId: number,
  opts: { force?: boolean } = {},
): Promise<ParcelSyncResult> {
  const drizzle = await getDb();
  if (!drizzle) throw new Error("Base de datos no disponible");

  const [parcel] = await drizzle
    .select({ id: parcels.id, name: parcels.name, code: parcels.code, polygon: parcels.polygon })
    .from(parcels)
    .where(eq(parcels.id, parcelId));
  if (!parcel) throw new Error("Parcela no encontrada");

  const label = parcel.name || parcel.code || `ID:${parcel.id}`;
  const geoPolygon = toGeoPolygon(parcel.polygon);
  if (!geoPolygon) {
    return { parcelId, label, status: "sin-poligono", captureDate: null, clearPct: null, cycleName: null,
             detail: "polígono con formato no reconocido" };
  }

  const { getIndexHistory, getIndexMapImage, getParcelVigor } = await import("./copernicusService");

  // 1. ¿Hay pasada nueva? Esta es la ÚNICA consulta que se hace siempre.
  //    Candidatas ordenadas: primero las despejadas, luego el resto de más a
  //    menos despejada. Si una no devuelve imagen se prueba la siguiente, en
  //    vez de perder la fecha al primer tropiezo.
  let candidatas: { date: string; clearPct: number; source?: string }[] = [];
  try {
    const passes = await getClearPassesCached(parcelId, geoPolygon, true);
    const despejadas = passes.filter((p) => p.clearPct >= 85);
    const resto = passes.filter((p) => p.clearPct < 85).sort((a, b) => b.clearPct - a.clearPct);
    candidatas = [...despejadas, ...resto].slice(0, 4);
  } catch (e: any) {
    console.error(`${TAG} ${label}: error buscando la pasada:`, e?.message);
  }
  const clearPass = candidatas[0] ?? null;

  // 2. Si la pasada más reciente es la que ya está guardada, no se baja nada.
  //    Aquí es donde se ahorran las llamadas: revisar sale barato, descargar no.
  const guardado = await estadoGuardado(parcelId);
  const completo = guardado.mapas >= INDICES.length && guardado.series >= INDICES.length;
  if (!opts.force && clearPass && completo && guardado.captureDate === clearPass.date) {
    console.log(`${TAG} ${label}: sin pasada nueva (la del ${clearPass.date} ya estaba)`);
    const ciclo = await resolveCycleForDate(clearPass.date);
    return {
      parcelId, label, status: "sin-cambios",
      captureDate: clearPass.date, clearPct: clearPass.clearPct, cycleName: ciclo?.name ?? null,
    };
  }

  if (clearPass) {
    const origen = clearPass.source === "escena" ? " (nubosidad de la escena)" : "";
    console.log(`${TAG} ${label}: pasada nueva ${clearPass.date} (${clearPass.clearPct}% despejado)${origen}`);
  } else {
    console.warn(`${TAG} ${label}: sin pasadas utilizables, se usa el mosaico`);
  }

  // Rango de la serie histórica: desde la primera cosecha registrada, para que
  // el comparativo por ciclos alcance a los ciclos anteriores
  const to = new Date().toISOString().split("T")[0];
  let from: string;
  try {
    const [firstBox] = await drizzle
      .select({ submissionTime: boxes.submissionTime })
      .from(boxes)
      .where(eq(boxes.parcelCode, parcel.code || ""))
      .orderBy(boxes.submissionTime)
      .limit(1);
    from = firstBox?.submissionTime
      ? new Date(firstBox.submissionTime).toISOString().split("T")[0]
      : new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0];
  } catch {
    from = new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0];
  }

  // Ciclo al que pertenece la imagen: así se sabe si el dato es del ciclo
  // en curso o todavía del anterior
  const cycle = clearPass ? await resolveCycleForDate(clearPass.date) : null;

  // 3. Vigor por zonas: se calcula UNA vez por pasada y se guarda. Es lo que
  //    alimenta a la IA con el detalle de qué parte se ve seca.
  if (clearPass) {
    try {
      const vigor = await getParcelVigor(geoPolygon, clearPass.date);
      if (vigor) {
        await drizzle.execute(
          sql`INSERT INTO parcelSatelliteCache (parcelId, dataType, indexType, mapDate, captureDate, clearPct, cycleId, data, fetchedAt) VALUES (${parcelId}, 'zones', 'NDVI', 'latest', ${clearPass.date}, ${clearPass.clearPct}, ${cycle?.id ?? null}, ${JSON.stringify(vigor)}, NOW()) ON DUPLICATE KEY UPDATE data = VALUES(data), captureDate = VALUES(captureDate), clearPct = VALUES(clearPct), cycleId = VALUES(cycleId), fetchedAt = NOW()`
        );

        // Historial: una fila por captura. Si esa fecha ya estaba se
        // actualiza en vez de duplicar (la clave única es parcela+fecha).
        await drizzle.execute(
          sql`INSERT INTO parcelSatelliteHistory (parcelId, captureDate, cycleId, clearPct, ndviMean, ndviMin, ndviMax, distributionJson, zonesJson) VALUES (${parcelId}, ${clearPass.date}, ${cycle?.id ?? null}, ${clearPass.clearPct}, ${vigor.meanNdvi}, ${vigor.minNdvi}, ${vigor.maxNdvi}, ${JSON.stringify(vigor.distribution)}, ${JSON.stringify(vigor.zones)}) ON DUPLICATE KEY UPDATE cycleId = VALUES(cycleId), clearPct = VALUES(clearPct), ndviMean = VALUES(ndviMean), ndviMin = VALUES(ndviMin), ndviMax = VALUES(ndviMax), distributionJson = VALUES(distributionJson), zonesJson = VALUES(zonesJson)`
        );

        console.log(
          `${TAG} ${label}: NDVI ${vigor.meanNdvi} · seco ${vigor.distribution.suelo}% · ` +
          `zona más débil: ${vigor.driest?.name ?? "n/d"} (${vigor.driest?.meanNdvi ?? "n/d"})`
        );
      }
    } catch (e: any) {
      console.error(`${TAG} ${label}: error analizando el vigor por zonas:`, e?.message);
    }
  }

  // 4. Serie histórica e imagen de cada índice
  let captureDateFinal: string | null = null;
  let clearPctFinal: number | null = null;
  const fallos: string[] = [];

  for (const idx of INDICES) {
    try {
      const data = await getIndexHistory(geoPolygon, from, to, idx);
      await drizzle.execute(
        sql`INSERT INTO parcelSatelliteCache (parcelId, dataType, indexType, mapDate, data, fromDate, toDate, fetchedAt) VALUES (${parcelId}, 'stats', ${idx}, NULL, ${JSON.stringify(data)}, ${from}, ${to}, NOW()) ON DUPLICATE KEY UPDATE data = VALUES(data), fromDate = VALUES(fromDate), toDate = VALUES(toDate), fetchedAt = NOW()`
      );

      // Imagen de una pasada concreta. Si esa fecha no devuelve nada se
      // prueba la siguiente candidata: lo importante es conservar la FECHA
      // real, no caer al mosaico (que se queda sin fecha).
      let buffer: Buffer | null = null;
      let captureDate: string | null = null;
      let clearPct: number | null = null;
      for (const cand of candidatas) {
        buffer = await getIndexMapImage(geoPolygon, idx, cand.date, true);
        if (buffer) {
          captureDate = cand.date;
          clearPct = cand.clearPct;
          break;
        }
        console.warn(`${TAG} ${label} - ${idx}: la pasada del ${cand.date} no trajo imagen, se prueba la anterior`);
      }

      // Último recurso: mosaico de 15 días, que no tiene una fecha única
      if (!buffer) {
        buffer = await getIndexMapImage(geoPolygon, idx);
        captureDate = null;
        clearPct = null;
        if (buffer) console.warn(`${TAG} ${label} - ${idx}: sin pasada utilizable, se guarda el mosaico SIN fecha`);
      }

      if (buffer) {
        const imageB64 = `data:image/png;base64,${buffer.toString("base64")}`;
        // El ciclo se resuelve con la fecha que de verdad se usó
        const cicloImagen = captureDate ? await resolveCycleForDate(captureDate) : cycle;
        await drizzle.execute(
          sql`INSERT INTO parcelSatelliteCache (parcelId, dataType, indexType, mapDate, captureDate, clearPct, cycleId, data, fetchedAt) VALUES (${parcelId}, 'map', ${idx}, 'latest', ${captureDate}, ${clearPct}, ${cicloImagen?.id ?? null}, ${imageB64}, NOW()) ON DUPLICATE KEY UPDATE data = VALUES(data), captureDate = VALUES(captureDate), clearPct = VALUES(clearPct), cycleId = VALUES(cycleId), fetchedAt = NOW()`
        );
        if (idx === "NDVI") {
          captureDateFinal = captureDate;
          clearPctFinal = clearPct;
        }
      }
      console.log(`${TAG} ✓ ${label} - ${idx}`);
    } catch (e: any) {
      const reason = e?.message?.substring(0, 80) || "error desconocido";
      console.error(`${TAG} ✗ ${label} - ${idx}:`, reason);
      fallos.push(`${label} (${idx}): ${reason}`);
    }
  }

  if (fallos.length === INDICES.length) {
    return { parcelId, label, status: "error", captureDate: null, clearPct: null, cycleName: null,
             detail: fallos.join(" · ") };
  }

  return {
    parcelId, label,
    status: "actualizada",
    captureDate: captureDateFinal ?? clearPass?.date ?? null,
    clearPct: clearPctFinal ?? clearPass?.clearPct ?? null,
    cycleName: cycle?.name ?? null,
    detail: fallos.length > 0 ? fallos.join(" · ") : undefined,
  };
}

/**
 * Revisa todas las parcelas con polígono.
 * La usan la revisión diaria y el botón de Configuración.
 */
export async function runSatelliteSync(opts: { force?: boolean } = {}): Promise<SatelliteSyncResult> {
  const drizzle = await getDb();
  if (!drizzle) throw new Error("Base de datos no disponible");

  const allParcels = await drizzle
    .select({ id: parcels.id, name: parcels.name, polygon: parcels.polygon })
    .from(parcels);
  const withPolygon = allParcels.filter((p: any) => p.polygon);
  console.log(`${TAG} Revisando ${withPolygon.length} parcelas...`);

  let updated = 0;
  let unchanged = 0;
  let errorCount = 0;
  const errorDetails: string[] = [];

  for (const parcel of withPolygon) {
    try {
      const r = await syncOneParcel(parcel.id, opts);
      if (r.status === "actualizada") {
        updated++;
        if (r.detail) { errorCount++; errorDetails.push(r.detail); }
      } else if (r.status === "sin-cambios") {
        unchanged++;
      } else {
        errorCount++;
        errorDetails.push(`${r.label}: ${r.detail ?? r.status}`);
      }
    } catch (e: any) {
      errorCount++;
      errorDetails.push(`${parcel.name || parcel.id}: ${e?.message ?? "error"}`);
    }
  }

  await limpiarMapasViejos();
  await notifyTelegram(updated, unchanged, errorCount, errorDetails);
  console.log(`${TAG} Completado: ${updated} actualizadas, ${unchanged} sin cambios, ${errorCount} errores`);
  return { updated, unchanged, errors: errorCount, errorDetails, total: withPolygon.length };
}

/**
 * Tira las imágenes de fechas sueltas que ya nadie mira.
 *
 * Son las miniaturas de la línea de tiempo histórica: se guardan para no
 * volver a bajarlas, pero son PNG en base64 y las fechas se van corriendo con
 * el tiempo, así que la tabla crecería sin fin. La captura vigente de cada
 * parcela (mapDate = 'latest') y el historial numérico NO se tocan.
 */
async function limpiarMapasViejos(): Promise<void> {
  const drizzle = await getDb();
  if (!drizzle) return;
  try {
    const res: any = await drizzle.execute(sql`
      DELETE FROM parcelSatelliteCache
       WHERE dataType = 'map'
         AND mapDate IS NOT NULL AND mapDate <> 'latest'
         AND fetchedAt < DATE_SUB(NOW(), INTERVAL 90 DAY)
    `);
    const borradas = (res?.[0]?.affectedRows ?? res?.affectedRows ?? 0) as number;
    if (borradas > 0) console.log(`${TAG} Limpieza: ${borradas} imagen(es) histórica(s) sin uso`);
  } catch (e: any) {
    console.error(`${TAG} No se pudo limpiar el cache de imágenes:`, e?.message);
  }
}

async function notifyTelegram(updated: number, unchanged: number, errorCount: number, errorDetails: string[]) {
  try {
    const { getGlobalSetting } = await import("./globalSettings");
    const botToken = await getGlobalSetting("telegramBotToken");
    const chatId = await getGlobalSetting("telegramChatId");
    if (!botToken || !chatId) return;

    // Si no hubo NADA nuevo y nada falló, no se manda mensaje: un aviso diario
    // diciendo "no pasó nada" solo enseña a ignorar las notificaciones
    if (updated === 0 && errorCount === 0) {
      console.log(`${TAG} Sin novedades: no se notifica por Telegram`);
      return;
    }

    const now = new Date().toLocaleString("es-MX", { timeZone: TIMEZONE });
    let msg = `🛰️ *REVISIÓN SATELITAL*\n\n✅ ${updated} parcela(s) con captura nueva`;
    if (unchanged > 0) msg += `\n😴 ${unchanged} sin pasada nueva (no se descargó nada)`;
    msg += `\n📊 NDVI · NDRE · NDMI\n⏰ ${now}\n📅 Se revisa todos los días`;
    if (errorCount > 0) {
      const errorList = errorDetails.slice(0, 20).map(e => `  • ${e}`).join("\n");
      msg += `\n\n⚠️ *${errorCount} errores:*\n${errorList}`;
      if (errorDetails.length > 20) msg += `\n  ... y ${errorDetails.length - 20} más`;
    }
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "Markdown" }),
    });
    console.log(`${TAG} Telegram notificado`);
  } catch (e) {
    console.error(`${TAG} Error Telegram:`, e);
  }
}

/** ¿Hace cuántas horas se refrescó la imagen más nueva? null = nunca */
async function hoursSinceLastSync(): Promise<number | null> {
  const drizzle = await getDb();
  if (!drizzle) return null;
  try {
    const rows: any = await drizzle.execute(
      sql`SELECT MAX(fetchedAt) AS last FROM parcelSatelliteCache WHERE dataType = 'map' AND mapDate = 'latest'`
    );
    const row = (rows as any)?.[0]?.[0] ?? (rows as any)?.rows?.[0];
    if (!row?.last) return null;
    return (Date.now() - new Date(row.last).getTime()) / 3600000;
  } catch {
    return null;
  }
}

// ── Scheduler ──
let syncInterval: ReturnType<typeof setInterval> | null = null;
let running = false;

async function runOnce(motivo: string): Promise<void> {
  if (running) {
    console.log(`${TAG} Ya hay una sincronización en curso, se omite (${motivo})`);
    return;
  }
  running = true;
  try {
    console.log(`${TAG} Ejecutando: ${motivo}`);
    await runSatelliteSync();
  } catch (e) {
    console.error(`${TAG} Error en la sincronización:`, e);
  } finally {
    running = false;
  }
}

/**
 * Revisa si toca refrescar. Se decide por la antigüedad real de los datos
 * (no por día de la semana): si el servidor estuvo apagado, al volver se pone
 * al día solo.
 */
async function checkAndRun(): Promise<void> {
  if (running) return;
  const age = await hoursSinceLastSync();
  if (age === null) {
    await runOnce("nunca se han descargado imágenes");
  } else if (age >= REFRESH_HOURS) {
    await runOnce(`la última revisión fue hace ${Math.round(age)} horas`);
  }
}

/**
 * Inicia la revisión diaria.
 * Revisa al arrancar el sistema y luego cada hora comprueba si ya toca. Buscar
 * datos nuevos cuesta una consulta por parcela; descargar solo ocurre cuando de
 * verdad hay una pasada nueva.
 */
export function startSatelliteAutoSync(): void {
  if (syncInterval) clearInterval(syncInterval);
  console.log(`🛰️ ${TAG} Scheduler iniciado (revisión diaria de parcelas)`);

  // Cada hora se pregunta si ya pasaron las 24 horas
  syncInterval = setInterval(() => { checkAndRun().catch(console.error); }, 60 * 60 * 1000);

  // Revisión al arrancar, con margen para que la base esté lista
  setTimeout(async () => {
    const age = await hoursSinceLastSync();
    if (age !== null && age < REFRESH_HOURS) {
      console.log(`${TAG} Parcelas al día (última revisión hace ${Math.round(age)} h), no se descarga nada`);
      return;
    }
    await checkAndRun();
  }, 3 * 60 * 1000);
}

export function stopSatelliteAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log(`⏹️ ${TAG} Scheduler detenido`);
  }
}

export async function getSatelliteSyncStatus() {
  const age = await hoursSinceLastSync();
  return {
    isActive: syncInterval !== null,
    hoursSinceLastSync: age === null ? null : Math.round(age * 10) / 10,
    nextRefreshInHours: age === null ? 0 : Math.max(0, Math.round((REFRESH_HOURS - age) * 10) / 10),
    schedule: `Todos los días y al arrancar el sistema (solo descarga si hay pasada nueva)`,
    timezone: TIMEZONE,
  };
}
