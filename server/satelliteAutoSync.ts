/**
 * Sincronización satelital automática.
 *
 * Sentinel-2 vuelve a pasar sobre la misma zona cada ~5 días, así que una vez
 * por semana se busca la pasada más reciente en que cada parcela se vio
 * despejada y se refresca su imagen y sus índices.
 *
 * Antes esto solo ocurría si alguien apretaba el botón en Configuración: por eso
 * el Dashboard podía quedarse meses mostrando una imagen vieja.
 *
 * Corre los lunes a la 1:00 AM (hora de México), antes que el resumen con IA de
 * las 2:00 AM, para que la IA lea datos satelitales frescos.
 */
import { getDb } from "./db";
import { parcels, boxes, productionCycles } from "../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";

const TIMEZONE = "America/Mexico_City";
const TAG = "[Satellite Sync]";

/** Si la imagen más nueva tiene más de esto, se considera vencida */
const MAX_AGE_DAYS = 8;

/**
 * Cuánto vale la lista de pasadas antes de volver a preguntarle al satélite.
 * Sentinel-2 repite cada ~5 días: con 3 días nunca se pierde una pasada nueva
 * y se evitan consultas repetidas cuando alguien navega por la web.
 */
const PASSES_TTL_HOURS = 72;

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
  const passes = await listClearPasses(geoPolygon, 60);
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
  errors: number;
  errorDetails: string[];
  total: number;
}

function getMexicoTime(date?: Date): { hour: number; minute: number; dayOfWeek: number; dateStr: string } {
  const d = date || new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE, hour: "numeric", minute: "numeric", hour12: false, weekday: "short",
  }).formatToParts(d);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0");
  const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0");
  const weekday = parts.find(p => p.type === "weekday")?.value || "";
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  return { hour, minute, dayOfWeek: dayMap[weekday] ?? d.getDay(), dateStr };
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

/**
 * Refresca los datos satelitales de todas las parcelas con polígono.
 * La usa tanto el scheduler semanal como el botón de Configuración.
 */
export async function runSatelliteSync(): Promise<SatelliteSyncResult> {
  const drizzle = await getDb();
  if (!drizzle) throw new Error("Base de datos no disponible");

  const allParcels = await drizzle
    .select({ id: parcels.id, name: parcels.name, code: parcels.code, polygon: parcels.polygon })
    .from(parcels);
  const withPolygon = allParcels.filter((p: any) => p.polygon);
  console.log(`${TAG} Iniciando sync de ${withPolygon.length} parcelas...`);

  let updated = 0;
  let errorCount = 0;
  const errorDetails: string[] = [];
  const indices: ("NDVI" | "NDRE" | "NDMI")[] = ["NDVI", "NDRE", "NDMI"];

  const { getIndexHistory, getIndexMapImage, getParcelVigor } = await import("./copernicusService");

  for (const parcel of withPolygon) {
    const parcelLabel = parcel.name || parcel.code || `ID:${parcel.id}`;
    const geoPolygon = toGeoPolygon(parcel.polygon);
    if (!geoPolygon) {
      errorCount++;
      errorDetails.push(`${parcelLabel}: polígono con formato no reconocido`);
      continue;
    }

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

    // La última pasada despejada depende de la PARCELA, no del índice:
    // se busca una sola vez y se reutiliza para NDVI, NDRE y NDMI.
    // force = true: el sync semanal sí quiere la lista fresca.
    let clearPass: { date: string; clearPct: number } | null = null;
    try {
      const passes = await getClearPassesCached(parcel.id, geoPolygon, true);
      clearPass = passes.find((p) => p.clearPct >= 85)
        ?? passes.reduce<{ date: string; clearPct: number } | null>(
          (mejor, p) => (!mejor || p.clearPct > mejor.clearPct ? p : mejor), null);
      if (clearPass) {
        console.log(`${TAG} ${parcelLabel}: última pasada despejada ${clearPass.date} (${clearPass.clearPct}%)`);
      } else {
        console.warn(`${TAG} ${parcelLabel}: sin pasadas utilizables, se usa el mosaico`);
      }
    } catch (e: any) {
      console.error(`${TAG} ${parcelLabel}: error buscando la pasada:`, e?.message);
    }

    // Ciclo al que pertenece la imagen: así se sabe si el dato es del ciclo
    // en curso o todavía del anterior
    const cycle = clearPass ? await resolveCycleForDate(clearPass.date) : null;

    // Vigor por zonas: se calcula UNA vez por pasada y se guarda. Es lo que
    // alimenta a la IA con el detalle de qué parte se ve seca.
    if (clearPass) {
      try {
        const vigor = await getParcelVigor(geoPolygon, clearPass.date);
        if (vigor) {
          await drizzle.execute(
            sql`INSERT INTO parcelSatelliteCache (parcelId, dataType, indexType, mapDate, captureDate, clearPct, cycleId, data, fetchedAt) VALUES (${parcel.id}, 'zones', 'NDVI', 'latest', ${clearPass.date}, ${clearPass.clearPct}, ${cycle?.id ?? null}, ${JSON.stringify(vigor)}, NOW()) ON DUPLICATE KEY UPDATE data = VALUES(data), captureDate = VALUES(captureDate), clearPct = VALUES(clearPct), cycleId = VALUES(cycleId), fetchedAt = NOW()`
          );
          console.log(
            `${TAG} ${parcelLabel}: NDVI ${vigor.meanNdvi} · seco ${vigor.distribution.suelo}% · ` +
            `zona más débil: ${vigor.driest?.name ?? "n/d"} (${vigor.driest?.meanNdvi ?? "n/d"})`
          );
        }
      } catch (e: any) {
        console.error(`${TAG} ${parcelLabel}: error analizando el vigor por zonas:`, e?.message);
      }
    }

    for (const idx of indices) {
      try {
        const data = await getIndexHistory(geoPolygon, from, to, idx);
        await drizzle.execute(
          sql`INSERT INTO parcelSatelliteCache (parcelId, dataType, indexType, mapDate, data, fromDate, toDate, fetchedAt) VALUES (${parcel.id}, 'stats', ${idx}, NULL, ${JSON.stringify(data)}, ${from}, ${to}, NOW()) ON DUPLICATE KEY UPDATE data = VALUES(data), fromDate = VALUES(fromDate), toDate = VALUES(toDate), fetchedAt = NOW()`
        );

        // Imagen de esa pasada exacta; si no hubo, mosaico de respaldo
        let buffer = clearPass ? await getIndexMapImage(geoPolygon, idx, clearPass.date, true) : null;
        let captureDate: string | null = clearPass?.date ?? null;
        let clearPct: number | null = clearPass?.clearPct ?? null;
        if (!buffer) {
          buffer = await getIndexMapImage(geoPolygon, idx);
          captureDate = null;
          clearPct = null;
        }

        if (buffer) {
          const imageB64 = `data:image/png;base64,${buffer.toString("base64")}`;
          await drizzle.execute(
            sql`INSERT INTO parcelSatelliteCache (parcelId, dataType, indexType, mapDate, captureDate, clearPct, cycleId, data, fetchedAt) VALUES (${parcel.id}, 'map', ${idx}, 'latest', ${captureDate}, ${clearPct}, ${cycle?.id ?? null}, ${imageB64}, NOW()) ON DUPLICATE KEY UPDATE data = VALUES(data), captureDate = VALUES(captureDate), clearPct = VALUES(clearPct), cycleId = VALUES(cycleId), fetchedAt = NOW()`
          );
        }
        console.log(`${TAG} ✓ ${parcelLabel} - ${idx}`);
      } catch (e: any) {
        const reason = e?.message?.substring(0, 80) || "error desconocido";
        console.error(`${TAG} ✗ ${parcelLabel} - ${idx}:`, reason);
        errorCount++;
        errorDetails.push(`${parcelLabel} (${idx}): ${reason}`);
      }
    }
    updated++;
  }

  await notifyTelegram(updated, errorCount, errorDetails);
  console.log(`${TAG} Completado: ${updated} parcelas, ${errorCount} errores`);
  return { updated, errors: errorCount, errorDetails, total: withPolygon.length };
}

async function notifyTelegram(updated: number, errorCount: number, errorDetails: string[]) {
  try {
    const { getGlobalSetting } = await import("./globalSettings");
    const botToken = await getGlobalSetting("telegramBotToken");
    const chatId = await getGlobalSetting("telegramChatId");
    if (!botToken || !chatId) return;

    const now = new Date().toLocaleString("es-MX", { timeZone: TIMEZONE });
    const nextSync = new Date(Date.now() + 7 * 86400000).toLocaleDateString("es-MX", {
      timeZone: TIMEZONE, day: "2-digit", month: "short", year: "numeric",
    });
    let msg = `🛰️ *SINCRONIZACIÓN SATELITAL*\n\n✅ ${updated} parcelas procesadas\n📊 NDVI · NDRE · NDMI\n⏰ ${now}\n📅 Próxima sync: ${nextSync}`;
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

/** ¿Hace cuántos días se refrescó la imagen más nueva? null = nunca */
async function daysSinceLastSync(): Promise<number | null> {
  const drizzle = await getDb();
  if (!drizzle) return null;
  try {
    const rows: any = await drizzle.execute(
      sql`SELECT MAX(fetchedAt) AS last FROM parcelSatelliteCache WHERE dataType = 'map' AND mapDate = 'latest'`
    );
    const row = (rows as any)?.[0]?.[0] ?? (rows as any)?.rows?.[0];
    if (!row?.last) return null;
    return (Date.now() - new Date(row.last).getTime()) / 86400000;
  } catch {
    return null;
  }
}

// ── Scheduler ──
let syncInterval: ReturnType<typeof setInterval> | null = null;
let lastRunDate: string | null = null;
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
    lastRunDate = getMexicoTime().dateStr;
  } catch (e) {
    console.error(`${TAG} Error en la sincronización:`, e);
  } finally {
    running = false;
  }
}

function checkAndRun(): void {
  const { hour, minute, dayOfWeek, dateStr } = getMexicoTime();
  // Lunes a la 1:00 AM (antes del resumen con IA de las 2:00 AM)
  if (dayOfWeek === 1 && hour === 1 && minute === 0 && lastRunDate !== dateStr) {
    runOnce("lunes 1:00 AM, refresco semanal").catch(console.error);
  }
}

/**
 * Inicia el refresco semanal. Al arrancar revisa si las imágenes están
 * vencidas (por ejemplo si el servidor estuvo apagado el lunes) y, en ese caso,
 * las actualiza; si están frescas no gasta llamadas a Copernicus.
 */
export function startSatelliteAutoSync(): void {
  if (syncInterval) clearInterval(syncInterval);
  console.log(`🛰️ ${TAG} Scheduler iniciado (lunes 1:00 AM hora de México)`);

  syncInterval = setInterval(checkAndRun, 60 * 1000);

  // Puesta al día al arrancar, con margen para que la base esté lista
  setTimeout(async () => {
    const age = await daysSinceLastSync();
    if (age === null) {
      await runOnce("nunca se han descargado imágenes");
    } else if (age > MAX_AGE_DAYS) {
      await runOnce(`la imagen más nueva tiene ${Math.round(age)} días`);
    } else {
      console.log(`${TAG} Imágenes al día (${Math.round(age)} días), no se descarga nada`);
    }
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
  const age = await daysSinceLastSync();
  return {
    isActive: syncInterval !== null,
    daysSinceLastSync: age === null ? null : Math.round(age * 10) / 10,
    schedule: "Lunes 1:00 AM hora de México",
    timezone: TIMEZONE,
  };
}
