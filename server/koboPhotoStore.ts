import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { and, desc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { getDb, getApiConfig } from "./db";
import { boxes, koboPhotos } from "../drizzle/schema";

// ============================================================
// Archivo local de fotos de KoboToolbox
//
// Hasta ahora la foto de cada caja vivía únicamente en Kobo y el dashboard la
// pedía prestada en cada vista. Si Kobo no responde, o el token cambia, o el
// proyecto se archiva, las fotos desaparecen del histórico.
//
// Este módulo baja cada foto una sola vez a /app/photos/kobo (volumen de
// Docker) y deja constancia en dos lugares:
//   · boxes.photoLocalPath  → la copia que le corresponde a esa caja
//   · koboPhotos            → índice URL → archivo, con una fila por cada
//                             variante (original/large/medium/small) para que
//                             el proxy resuelva cualquiera sin salir a internet
//
// Nada de esto rompe lo anterior: las columnas photoUrl siguen guardando la URL
// de Kobo y el proxy sigue siendo el mismo endpoint. Lo único que cambia es de
// dónde salen los bytes.
// ============================================================

/** Raíz de archivos en disco. En Docker es el volumen ./photos:/app/photos */
export const PHOTOS_ROOT = process.env.PHOTOS_DIR || "/app/photos";
/** Prefijo con el que el navegador pide los archivos (express.static) */
export const PHOTOS_PUBLIC_PREFIX = "/app/photos";
/** Subcarpeta propia para que las fotos de Kobo no se mezclen con las demás */
const KOBO_SUBDIR = "kobo";

const MAX_BYTES = 25 * 1024 * 1024; // Una foto de caja pesa ~1-4 MB
const DOWNLOAD_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 4; // Después de esto la caja se deja en paz hasta reintento manual
const DEFAULT_BATCH = 150;
const DEFAULT_CONCURRENCY = 3; // El servidor de Kobo es el mismo que usa la app de campo

type Variant = "original" | "large" | "medium" | "small";

export interface PhotoArchiveLog {
  timestamp: Date;
  trigger: string;
  downloaded: number;
  failed: number;
  pending: number;
  message: string;
}

const history: PhotoArchiveLog[] = [];
const MAX_HISTORY = 20;
let isRunning = false;
let lastRun: Date | null = null;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

function addToHistory(log: PhotoArchiveLog) {
  history.unshift(log);
  if (history.length > MAX_HISTORY) history.pop();
}

// ── Rutas ────────────────────────────────────────────────────

function hashUrl(url: string): string {
  return crypto.createHash("sha1").update(url.trim()).digest("hex");
}

/** Convierte la ruta pública guardada en base de datos a una ruta de disco */
export function toFsPath(publicPath: string): string {
  if (publicPath.startsWith(PHOTOS_PUBLIC_PREFIX + "/")) {
    const rel = publicPath.slice(PHOTOS_PUBLIC_PREFIX.length + 1);
    return path.join(PHOTOS_ROOT, rel);
  }
  // Rutas antiguas o absolutas: se usan tal cual
  return publicPath;
}

function toPublicPath(relPath: string): string {
  return `${PHOTOS_PUBLIC_PREFIX}/${relPath.split(path.sep).join("/")}`;
}

function extensionFor(url: string, contentType?: string | null): string {
  const byType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/gif": "gif",
  };
  const type = (contentType || "").split(";")[0].trim().toLowerCase();
  if (byType[type]) return byType[type];

  const fromUrl = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() || "";
  if (/^(jpg|jpeg|png|webp|heic|heif|gif)$/.test(fromUrl)) {
    return fromUrl === "jpeg" ? "jpg" : fromUrl;
  }
  return "jpg";
}

/**
 * Nombre estable y legible: mes de la cosecha / código de caja + hash de la URL.
 * El hash evita que dos cajas con el mismo código se pisen entre ellas.
 */
function buildRelPath(opts: {
  url: string;
  boxCode?: string | null;
  submissionTime?: Date | null;
  extension: string;
}): string {
  const date = opts.submissionTime instanceof Date && !isNaN(opts.submissionTime.getTime())
    ? opts.submissionTime
    : new Date();
  const folder = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const safeCode = (opts.boxCode || "sin-codigo").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 48);
  const shortHash = hashUrl(opts.url).slice(0, 10);
  return path.join(KOBO_SUBDIR, folder, `${safeCode}_${shortHash}.${opts.extension}`);
}

// ── Descarga ─────────────────────────────────────────────────

async function fileExists(fsPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(fsPath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

interface FetchedFile {
  buffer: Buffer;
  contentType: string;
}

async function fetchFromKobo(url: string, apiToken: string): Promise<FetchedFile> {
  const response = await fetch(url, {
    headers: { Authorization: `Token ${apiToken}` },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Kobo respondió ${response.status} ${response.statusText}`);
  }

  const declared = parseInt(response.headers.get("content-length") || "0");
  if (declared > MAX_BYTES) {
    throw new Error(`Archivo demasiado grande (${Math.round(declared / 1024 / 1024)} MB)`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error("Kobo devolvió un archivo vacío");
  if (buffer.length > MAX_BYTES) {
    throw new Error(`Archivo demasiado grande (${Math.round(buffer.length / 1024 / 1024)} MB)`);
  }

  return {
    buffer,
    contentType: response.headers.get("content-type") || "image/jpeg",
  };
}

/** Escribe primero un .tmp y luego renombra, para no dejar archivos a medias */
async function writeAtomic(fsPath: string, buffer: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(fsPath), { recursive: true });
  const tmp = `${fsPath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, buffer);
  await fs.rename(tmp, fsPath);
}

// ── Índice en base de datos ──────────────────────────────────

interface LocalCopy {
  localPath: string; // ruta pública
  fsPath: string;
  contentType: string | null;
}

/** Busca en el índice si esa URL ya tiene copia en disco (y que el archivo siga ahí) */
export async function findLocalCopy(url: string): Promise<LocalCopy | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(koboPhotos)
    .where(eq(koboPhotos.urlHash, hashUrl(url)))
    .limit(1);

  if (rows.length === 0) return null;

  const fsPath = toFsPath(rows[0].localPath);
  if (!(await fileExists(fsPath))) return null;

  return { localPath: rows[0].localPath, fsPath, contentType: rows[0].contentType };
}

/** Registra una URL (cualquier variante) apuntando a un archivo ya guardado */
async function indexUrl(opts: {
  url: string;
  variant: Variant;
  localPath: string;
  contentType: string | null;
  sizeBytes: number | null;
  boxId?: number | null;
  boxCode?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .insert(koboPhotos)
    .values({
      urlHash: hashUrl(opts.url),
      koboUrl: opts.url,
      boxId: opts.boxId ?? null,
      boxCode: opts.boxCode ?? null,
      variant: opts.variant,
      localPath: opts.localPath,
      contentType: opts.contentType,
      sizeBytes: opts.sizeBytes,
    })
    .onDuplicateKeyUpdate({
      set: {
        localPath: opts.localPath,
        contentType: opts.contentType,
        sizeBytes: opts.sizeBytes,
        boxId: opts.boxId ?? null,
        boxCode: opts.boxCode ?? null,
        downloadedAt: new Date(),
      },
    });
}

/**
 * Asegura que la URL tenga copia local; si no la tiene, la descarga.
 * Es lo que usa el proxy de imágenes cuando le piden una foto que aún no bajó
 * el trabajador de fondo, para que la primera visita ya deje la copia hecha.
 */
export async function ensureLocalCopy(
  url: string,
  apiToken: string,
  meta?: { boxId?: number | null; boxCode?: string | null; variant?: Variant; submissionTime?: Date | null }
): Promise<LocalCopy> {
  const existing = await findLocalCopy(url);
  if (existing) return existing;

  const { buffer, contentType } = await fetchFromKobo(url, apiToken);
  const relPath = buildRelPath({
    url,
    boxCode: meta?.boxCode,
    submissionTime: meta?.submissionTime,
    extension: extensionFor(url, contentType),
  });
  const fsPath = path.join(PHOTOS_ROOT, relPath);
  await writeAtomic(fsPath, buffer);

  const localPath = toPublicPath(relPath);
  await indexUrl({
    url,
    variant: meta?.variant || "original",
    localPath,
    contentType,
    sizeBytes: buffer.length,
    boxId: meta?.boxId,
    boxCode: meta?.boxCode,
  });

  return { localPath, fsPath, contentType };
}

// ── Descarga por caja ────────────────────────────────────────

interface BoxPhotoRow {
  id: number;
  boxCode: string;
  photoUrl: string | null;
  photoLargeUrl: string | null;
  photoMediumUrl: string | null;
  photoSmallUrl: string | null;
  submissionTime: Date;
}

/**
 * Guarda la foto de una caja. Se baja una sola imagen —la grande, que es la que
 * el dashboard abre en el detalle— y las cuatro URLs quedan apuntando a ella,
 * de modo que cualquier variante que pida la interfaz se sirve del disco.
 */
export async function downloadBoxPhoto(box: BoxPhotoRow, apiToken: string): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { ok: false, error: "Base de datos no disponible" };

  const preferred = box.photoLargeUrl || box.photoUrl || box.photoMediumUrl || box.photoSmallUrl;
  if (!preferred) return { ok: false, error: "La caja no tiene URL de foto" };

  try {
    const copy = await ensureLocalCopy(preferred, apiToken, {
      boxId: box.id,
      boxCode: box.boxCode,
      variant: box.photoLargeUrl === preferred ? "large" : "original",
      submissionTime: box.submissionTime,
    });

    // Todas las variantes conocidas apuntan al mismo archivo
    const variants: Array<[string | null, Variant]> = [
      [box.photoUrl, "original"],
      [box.photoLargeUrl, "large"],
      [box.photoMediumUrl, "medium"],
      [box.photoSmallUrl, "small"],
    ];
    for (const [url, variant] of variants) {
      if (!url || url === preferred) continue;
      await indexUrl({
        url,
        variant,
        localPath: copy.localPath,
        contentType: copy.contentType,
        sizeBytes: null,
        boxId: box.id,
        boxCode: box.boxCode,
      });
    }

    await db
      .update(boxes)
      .set({
        photoLocalPath: copy.localPath,
        photoDownloadedAt: new Date(),
        photoDownloadError: null,
      })
      .where(eq(boxes.id, box.id));

    return { ok: true };
  } catch (error: any) {
    const message = String(error?.message || error).slice(0, 240);
    await db
      .update(boxes)
      .set({
        photoDownloadAttempts: sql`${boxes.photoDownloadAttempts} + 1`,
        photoDownloadError: message,
      })
      .where(eq(boxes.id, box.id));
    return { ok: false, error: message };
  }
}

// ── Trabajador de fondo ──────────────────────────────────────

/**
 * Baja las fotos que todavía no tienen copia local.
 * `retryFailed` vuelve a intentar las que ya agotaron sus reintentos.
 */
export async function runPhotoBackfill(options?: {
  trigger?: string;
  limit?: number;
  concurrency?: number;
  retryFailed?: boolean;
}): Promise<PhotoArchiveLog> {
  const trigger = options?.trigger || "manual";

  if (isRunning) {
    const log: PhotoArchiveLog = {
      timestamp: new Date(),
      trigger,
      downloaded: 0,
      failed: 0,
      pending: await countPending(),
      message: "Ya hay una descarga de fotos en curso, se omite esta ronda",
    };
    return log;
  }

  const db = await getDb();
  if (!db) {
    return {
      timestamp: new Date(), trigger, downloaded: 0, failed: 0, pending: 0,
      message: "Base de datos no disponible",
    };
  }

  const config = await getApiConfig();
  if (!config?.apiToken) {
    const log: PhotoArchiveLog = {
      timestamp: new Date(), trigger, downloaded: 0, failed: 0, pending: await countPending(),
      message: "Falta el token de KoboToolbox: configúralo en Ajustes",
    };
    addToHistory(log);
    return log;
  }

  isRunning = true;
  const limit = options?.limit ?? DEFAULT_BATCH;
  const concurrency = Math.max(1, Math.min(options?.concurrency ?? DEFAULT_CONCURRENCY, 8));

  try {
    if (options?.retryFailed) {
      // Borrón y cuenta nueva para las que fallaron: vuelven a la cola
      await db
        .update(boxes)
        .set({ photoDownloadAttempts: 0, photoDownloadError: null })
        .where(and(isNull(boxes.photoLocalPath), isNotNull(boxes.photoUrl)));
    }

    const pendientes = await db
      .select({
        id: boxes.id,
        boxCode: boxes.boxCode,
        photoUrl: boxes.photoUrl,
        photoLargeUrl: boxes.photoLargeUrl,
        photoMediumUrl: boxes.photoMediumUrl,
        photoSmallUrl: boxes.photoSmallUrl,
        submissionTime: boxes.submissionTime,
      })
      .from(boxes)
      .where(
        and(
          isNull(boxes.photoLocalPath),
          isNotNull(boxes.photoUrl),
          lt(boxes.photoDownloadAttempts, MAX_ATTEMPTS)
        )
      )
      .orderBy(desc(boxes.submissionTime))
      .limit(limit);

    let downloaded = 0;
    let failed = 0;

    for (let i = 0; i < pendientes.length; i += concurrency) {
      const lote = pendientes.slice(i, i + concurrency);
      const resultados = await Promise.all(
        lote.map((box) => downloadBoxPhoto(box as BoxPhotoRow, config.apiToken))
      );
      for (const r of resultados) {
        if (r.ok) downloaded++;
        else failed++;
      }
    }

    const pending = await countPending();
    const log: PhotoArchiveLog = {
      timestamp: new Date(),
      trigger,
      downloaded,
      failed,
      pending,
      message: pendientes.length === 0
        ? "No había fotos pendientes de descargar"
        : `${downloaded} foto(s) guardadas en el servidor, ${failed} con error, ${pending} pendientes`,
    };
    addToHistory(log);
    console.log(`📸 [FotosKobo] ${log.message}`);

    // Si quedó cola y la ronda sí avanzó, seguimos en un minuto en vez de
    // esperar la revisión programada: así el rezago histórico se drena solo
    // sin castigar al servidor de Kobo con ráfagas grandes.
    if (pending > 0 && downloaded > 0) {
      setTimeout(() => {
        runPhotoBackfill({ trigger: "continuación", limit, concurrency }).catch(console.error);
      }, 60 * 1000).unref?.();
    }

    return log;
  } catch (error: any) {
    const log: PhotoArchiveLog = {
      timestamp: new Date(), trigger, downloaded: 0, failed: 0, pending: 0,
      message: `Error al descargar fotos: ${error?.message || error}`,
    };
    addToHistory(log);
    console.error(`❌ [FotosKobo] ${log.message}`);
    return log;
  } finally {
    isRunning = false;
    lastRun = new Date();
  }
}

async function countPending(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(boxes)
    .where(
      and(
        isNull(boxes.photoLocalPath),
        isNotNull(boxes.photoUrl),
        lt(boxes.photoDownloadAttempts, MAX_ATTEMPTS)
      )
    );
  return Number(rows[0]?.n || 0);
}

/**
 * Lanza una descarga en segundo plano sin hacer esperar a quien llama.
 * La usa la sincronización con Kobo: primero entran las cajas, y las fotos
 * llegan detrás sin arriesgar que un fallo de red tumbe la sincronización.
 */
export function queuePhotoBackfill(trigger: string = "sync"): void {
  setImmediate(() => {
    runPhotoBackfill({ trigger }).catch((err) =>
      console.error("[FotosKobo] Error en descarga en segundo plano:", err)
    );
  });
}

// El resumen recorre toda la tabla de cajas, y la pantalla de Ajustes lo pide
// cada 30 segundos: se guarda un momento para no cobrarle ese conteo a la base
// en cada refresco.
let statusCache: { at: number; data: any } | null = null;
const STATUS_TTL_MS = 20_000;

/** Resumen para la pantalla de Ajustes */
export async function getPhotoArchiveStatus() {
  if (statusCache && Date.now() - statusCache.at < STATUS_TTL_MS && !isRunning) {
    return { ...statusCache.data, isRunning, lastRun, history };
  }

  const db = await getDb();
  if (!db) {
    return {
      isActive: schedulerInterval !== null, isRunning, lastRun, history,
      total: 0, downloaded: 0, pending: 0, failed: 0, files: 0, sizeBytes: 0,
      storageDir: path.join(PHOTOS_ROOT, KOBO_SUBDIR),
    };
  }

  const [resumen] = await db
    .select({
      total: sql<number>`SUM(CASE WHEN photoUrl IS NOT NULL THEN 1 ELSE 0 END)`,
      downloaded: sql<number>`SUM(CASE WHEN photoLocalPath IS NOT NULL THEN 1 ELSE 0 END)`,
      pending: sql<number>`SUM(CASE WHEN photoUrl IS NOT NULL AND photoLocalPath IS NULL AND photoDownloadAttempts < ${MAX_ATTEMPTS} THEN 1 ELSE 0 END)`,
      failed: sql<number>`SUM(CASE WHEN photoUrl IS NOT NULL AND photoLocalPath IS NULL AND photoDownloadAttempts >= ${MAX_ATTEMPTS} THEN 1 ELSE 0 END)`,
    })
    .from(boxes);

  const [archivos] = await db
    .select({
      files: sql<number>`COUNT(DISTINCT localPath)`,
      sizeBytes: sql<number>`COALESCE(SUM(sizeBytes), 0)`,
    })
    .from(koboPhotos);

  const data = {
    isActive: schedulerInterval !== null,
    isRunning,
    lastRun,
    history,
    total: Number(resumen?.total || 0),
    downloaded: Number(resumen?.downloaded || 0),
    pending: Number(resumen?.pending || 0),
    failed: Number(resumen?.failed || 0),
    files: Number(archivos?.files || 0),
    sizeBytes: Number(archivos?.sizeBytes || 0),
    storageDir: path.join(PHOTOS_ROOT, KOBO_SUBDIR),
  };

  statusCache = { at: Date.now(), data };
  return data;
}

/**
 * Revisa cada cierto tiempo si quedaron fotos sin bajar.
 * Es el respaldo de la descarga que dispara la sincronización: cubre las cajas
 * que entraron mientras el servidor estaba apagado o cuando Kobo falló.
 */
export function startPhotoArchive(intervalMinutes: number = 30) {
  stopPhotoArchive();

  if (process.env.KOBO_PHOTO_ARCHIVE === "false") {
    console.log("📸 [FotosKobo] Descarga de fotos deshabilitada por KOBO_PHOTO_ARCHIVE=false");
    return;
  }

  console.log(
    `📸 [FotosKobo] Archivo de fotos activo. Carpeta: ${path.join(PHOTOS_ROOT, KOBO_SUBDIR)} · Revisión cada ${intervalMinutes} min`
  );

  schedulerInterval = setInterval(() => {
    runPhotoBackfill({ trigger: "scheduled" }).catch(console.error);
  }, intervalMinutes * 60 * 1000);

  // Primera ronda al arrancar, después de que el servidor termine de despertar
  setTimeout(() => {
    runPhotoBackfill({ trigger: "startup" }).catch(console.error);
  }, 90 * 1000);
}

export function stopPhotoArchive() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
