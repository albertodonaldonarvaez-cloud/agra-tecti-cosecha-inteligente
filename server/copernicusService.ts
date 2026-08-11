import { getDb } from "./db";
import { apiConfig } from "../drizzle/schema";
import { decryptSecret, isEncrypted } from "./encryption";

/**
 * Servicio de Copernicus CDSE — Agricultura de Precisión Multiespectral.
 * Sentinel-2 L2A: NDVI (Vigor), NDRE (Nitrógeno/Clorofila), NDMI (Estrés Hídrico).
 *
 * Bandas Sentinel-2:
 * - B04 (Red, 665nm)     → NDVI
 * - B05 (Red Edge, 705nm) → NDRE
 * - B08 (NIR, 842nm)     → NDVI, NDRE, NDMI
 * - B11 (SWIR, 1610nm)   → NDMI
 *
 * APIs:
 * - Auth: identity.dataspace.copernicus.eu
 * - Statistical: sh.dataspace.copernicus.eu/api/v1/statistics
 * - Process: sh.dataspace.copernicus.eu/api/v1/process
 */

const AUTH_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const STATS_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics";
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";

// ============ TIPOS ============
export type IndexType = "NDVI" | "NDRE" | "NDMI";

export interface IndexConfig {
  label: string;
  formula: string;
  bandA: string;   // Banda del numerador (+)
  bandB: string;   // Banda del numerador (-)
  inputs: string[];
  /** Rampa de color para el mapa visual [valor, colorHex] */
  colorMap: Array<[number, number]>;
  /** Resolución nativa de la banda más gruesa (m) */
  resolution: number;
}

/** Configuración de cada índice multiespectral */
export const INDEX_CONFIGS: Record<IndexType, IndexConfig> = {
  NDVI: {
    label: "Vigor Vegetativo",
    formula: "(B08 - B04) / (B08 + B04)",
    bandA: "B08",
    bandB: "B04",
    inputs: ["B04", "B08", "dataMask"],
    resolution: 10,
    colorMap: [
      [-1.0, 0x040ED8], // Azul - agua
      [-0.1, 0x040ED8],
      [0.0,  0x8B4513], // Café - suelo desnudo
      [0.1,  0xA0522D],
      [0.2,  0xFF8C00], // Naranja - vegetación escasa
      [0.3,  0xFFD700], // Amarillo
      [0.4,  0xADFF2F], // Verde-amarillo
      [0.5,  0x7CFC00], // Verde claro
      [0.6,  0x228B22], // Verde bosque
      [0.8,  0x006400], // Verde oscuro
      [1.0,  0x004D00], // Verde muy oscuro
    ],
  },
  NDRE: {
    label: "Nitrógeno / Clorofila",
    formula: "(B08 - B05) / (B08 + B05)",
    bandA: "B08",
    bandB: "B05",
    inputs: ["B05", "B08", "dataMask"],
    resolution: 20, // B05 es 20m
    colorMap: [
      [-1.0, 0x2C105A], // Púrpura oscuro - sin clorofila
      [-0.1, 0x2C105A],
      [0.0,  0x721F82], // Púrpura
      [0.1,  0xB93C73], // Rosa
      [0.2,  0xDB5C4C], // Salmón
      [0.3,  0xF5A623], // Naranja
      [0.4,  0xF7DC6F], // Amarillo
      [0.5,  0xC4E86B], // Verde-amarillo claro
      [0.6,  0x82D656], // Verde claro
      [0.8,  0x28A745], // Verde
      [1.0,  0x155724], // Verde oscuro - alta clorofila
    ],
  },
  NDMI: {
    label: "Estrés Hídrico",
    formula: "(B08 - B11) / (B08 + B11)",
    bandA: "B08",
    bandB: "B11",
    inputs: ["B08", "B11", "dataMask"],
    resolution: 20, // B11 es 20m
    colorMap: [
      [-1.0, 0x8B0000], // Rojo oscuro - estrés severo
      [-0.3, 0xB22222],
      [-0.1, 0xDC143C], // Rojo - estrés
      [0.0,  0xFF6347], // Tomate
      [0.1,  0xFFA07A], // Salmón claro
      [0.2,  0xFFD700], // Amarillo
      [0.3,  0x87CEEB], // Azul cielo claro
      [0.4,  0x4682B4], // Azul acero
      [0.5,  0x4169E1], // Azul real
      [0.7,  0x0000CD], // Azul medio
      [1.0,  0x00008B], // Azul oscuro - muy húmedo
    ],
  },
};

// ============ EVALSCRIPTS DINÁMICOS ============

/**
 * Genera evalscript para la Statistical API (valores FLOAT32 con dataMask nombrado).
 */
function buildStatsEvalscript(indexType: IndexType): string {
  const cfg = INDEX_CONFIGS[indexType];
  return `//VERSION=3
function setup() {
  return {
    input: ${JSON.stringify(cfg.inputs)},
    output: [
      { id: "index", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}

function evaluatePixel(sample) {
  let val = (sample.${cfg.bandA} - sample.${cfg.bandB}) / (sample.${cfg.bandA} + sample.${cfg.bandB});
  return {
    index: [isFinite(val) ? val : -2],
    dataMask: [sample.dataMask]
  };
}`;
}

/**
 * Genera evalscript para la Process API (imagen PNG con simbología ColorMapVisualizer).
 * Pixeles con dataMask=0 retornan [0,0,0,0] = transparencia total.
 */
function buildColorMapEvalscript(indexType: IndexType): string {
  const cfg = INDEX_CONFIGS[indexType];
  const colorMapStr = cfg.colorMap.map(([val, hex]) => `  [${val}, 0x${hex.toString(16).padStart(6, "0").toUpperCase()}]`).join(",\n");

  return `//VERSION=3
function setup() {
  return {
    input: ${JSON.stringify(cfg.inputs)},
    output: { bands: 4 }
  };
}

const map = [
${colorMapStr}
];

const visualizer = new ColorMapVisualizer(map);

function evaluatePixel(sample) {
  if (sample.dataMask === 0) return [0, 0, 0, 0];
  let val = index(sample.${cfg.bandA}, sample.${cfg.bandB});
  let rgb = visualizer.process(val);
  return rgb.concat(sample.dataMask);
}`;
}

// EvalScript para True Color (RGB) — no cambia
const TRUE_COLOR_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: ["B04", "B03", "B02", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}

function evaluatePixel(sample) {
  return [2.5 * sample.B04, 2.5 * sample.B03, 2.5 * sample.B02, sample.dataMask];
}`;

// ============ CACHE TOKEN ============
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Obtiene las credenciales CDSE desencriptadas de la BD.
 */
async function getCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const [config] = await db.select({
      clientId: apiConfig.copernicusClientId,
      clientSecret: apiConfig.copernicusClientSecret,
    }).from(apiConfig).limit(1);
    if (!config?.clientId || !config?.clientSecret) return null;
    let secret = config.clientSecret;
    if (isEncrypted(secret)) {
      secret = decryptSecret(secret);
    }
    return { clientId: config.clientId, clientSecret: secret };
  } catch (error) {
    console.error("[Copernicus] Error obteniendo credenciales:", error);
    return null;
  }
}

/**
 * Autentica con CDSE y obtiene un access_token. Cachea en memoria.
 */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30000) {
    return cachedToken.token;
  }

  const creds = await getCredentials();
  if (!creds) {
    throw new Error("Credenciales de Copernicus no configuradas. Ve a Configuración → API Copernicus.");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });

  console.log("[Copernicus] Solicitando access_token...");
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[Copernicus] Error de autenticación:", res.status, errText);
    throw new Error(`Error de autenticación con Copernicus (${res.status}). Verifica tus credenciales.`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 600) * 1000,
  };
  console.log("[Copernicus] Token obtenido, expira en", data.expires_in, "s");
  return cachedToken.token;
}

// ============ HELPER ============
function getPolygonBoundsAndResolution(polygon: any, resolutionM: number = 10) {
  const coords = polygon.coordinates[0];
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const metersPerDegLng = 111320 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  const metersPerDegLat = 110540;
  const widthM = (maxLng - minLng) * metersPerDegLng;
  const heightM = (maxLat - minLat) * metersPerDegLat;
  const pixelsW = Math.min(Math.max(Math.round(widthM / resolutionM), 64), 512);
  const pixelsH = Math.min(Math.max(Math.round(heightM / resolutionM), 64), 512);
  return { minLng, maxLng, minLat, maxLat, pixelsW, pixelsH };
}

// ============ STATISTICAL API ============

/**
 * Obtiene el histórico de un índice espectral para un polígono GeoJSON.
 * Soporta NDVI, NDRE, NDMI.
 */
export async function getIndexHistory(
  polygon: any,
  fromDate: string,
  toDate: string,
  indexType: IndexType = "NDVI"
): Promise<Array<{ date: string; mean: number; min: number; max: number; stDev: number; noDataPct: number }>> {
  const token = await getAccessToken();
  const cfg = INDEX_CONFIGS[indexType];

  const requestBody = {
    input: {
      bounds: {
        geometry: { type: "Polygon", coordinates: polygon.coordinates },
      },
      data: [{
        dataFilter: { mosaickingOrder: "leastCC" },
        type: "sentinel-2-l2a",
      }],
    },
    aggregation: {
      timeRange: {
        from: `${fromDate}T00:00:00Z`,
        to: `${toDate}T23:59:59Z`,
      },
      aggregationInterval: { of: "P5D" },
      resx: cfg.resolution,
      resy: cfg.resolution,
      evalscript: buildStatsEvalscript(indexType),
    },
  };

  console.log(`[Copernicus] ${indexType} histórico: ${fromDate} → ${toDate} (res=${cfg.resolution}m)`);
  const res = await fetch(STATS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[Copernicus] Error Statistical API (${indexType}):`, res.status, errText);
    throw new Error(`Error al obtener ${indexType} satelital (${res.status})`);
  }

  const data = await res.json();
  const results: Array<{ date: string; mean: number; min: number; max: number; stDev: number; noDataPct: number }> = [];

  if (data.data) {
    for (const interval of data.data) {
      const dateStr = interval.interval?.from?.split("T")[0];
      // Output nombrado "index" → outputs.index.bands.B0.stats
      const stats = interval.outputs?.index?.bands?.B0?.stats
                 || interval.outputs?.default?.bands?.B0?.stats;

      if (!stats || stats.sampleCount === 0) continue;
      if (stats.mean === undefined || stats.mean < -1) continue;

      const totalPixels = (stats.sampleCount || 0) + (stats.noDataCount || 0);
      results.push({
        date: dateStr,
        mean: Math.round(stats.mean * 1000) / 1000,
        min: Math.round(stats.min * 1000) / 1000,
        max: Math.round(stats.max * 1000) / 1000,
        stDev: Math.round((stats.stDev || 0) * 1000) / 1000,
        noDataPct: totalPixels > 0 ? Math.round((stats.noDataCount || 0) / totalPixels * 100) : 0,
      });
    }
  }

  console.log(`[Copernicus] ${indexType} histórico: ${results.length} puntos`);
  return results;
}

// Backward compatibility
export const getNDVIHistory = (polygon: any, from: string, to: string) =>
  getIndexHistory(polygon, from, to, "NDVI");

// ============ BÚSQUEDA DE LA ÚLTIMA PASADA DESPEJADA ============

/**
 * Evalscript que marca cada píxel como despejado (1) o tapado (0) usando la
 * banda SCL de clasificación de escena de Sentinel-2 L2A.
 *
 * El promedio de esta banda sobre el polígono es directamente el porcentaje de
 * la parcela que se ve limpio ese día.
 */
const CLEAR_FRACTION_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: ["SCL", "dataMask"],
    output: [
      { id: "clear", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  // Clases SCL que NO sirven: 0 sin datos, 1 saturado, 3 sombra de nube,
  // 8 nube probabilidad media, 9 nube probabilidad alta, 10 cirros, 11 nieve
  var tapado = s.SCL === 0 || s.SCL === 1 || s.SCL === 3 ||
               s.SCL === 8 || s.SCL === 9 || s.SCL === 10 || s.SCL === 11;
  return { clear: [tapado ? 0 : 1], dataMask: [s.dataMask] };
}`;

export interface ClearPass {
  /** Fecha real de la pasada del satélite (YYYY-MM-DD) */
  date: string;
  /** Porcentaje de la parcela que se ve despejado ese día (0-100) */
  clearPct: number;
}

/**
 * Lista las pasadas de Sentinel-2 sobre ESTA parcela, con qué tan despejada
 * se ve cada una, de la más reciente a la más antigua.
 *
 * Importante: la nubosidad se mide sobre el polígono de la parcela, no sobre
 * la escena completa (que cubre ~110 km). Una escena puede venir marcada como
 * muy nublada y aun así tener la huerta perfectamente despejada, y al revés.
 */
export async function listClearPasses(
  polygon: any,
  days = 60,
): Promise<ClearPass[]> {
  const token = await getAccessToken();
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const requestBody = {
    input: {
      bounds: { geometry: { type: "Polygon", coordinates: polygon.coordinates } },
      data: [{ type: "sentinel-2-l2a" }],
    },
    aggregation: {
      timeRange: { from: `${fmt(from)}T00:00:00Z`, to: `${fmt(to)}T23:59:59Z` },
      // Un intervalo por día: así cada resultado es una pasada real del satélite
      aggregationInterval: { of: "P1D" },
      resx: 20, // SCL es de 20 m
      resy: 20,
      evalscript: CLEAR_FRACTION_EVALSCRIPT,
    },
  };

  const res = await fetch(STATS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[Copernicus] Error buscando pasadas despejadas:", res.status, errText.slice(0, 300));
    return [];
  }

  const data = await res.json();
  const passes: ClearPass[] = [];
  for (const interval of data.data ?? []) {
    // Los días sin pasada vienen con error o sin estadísticas: se ignoran
    const stats = interval.outputs?.clear?.bands?.B0?.stats;
    if (!stats || !stats.sampleCount) continue;
    const date = interval.interval?.from?.split("T")[0];
    if (!date) continue;
    passes.push({ date, clearPct: Math.round((stats.mean ?? 0) * 100) });
  }

  // De la más reciente a la más antigua
  passes.sort((a, b) => b.date.localeCompare(a.date));
  return passes;
}

/**
 * Última pasada utilizable sobre la parcela.
 *
 * Se busca la más reciente que supere [minClearPct]; si en la ventana no hubo
 * ninguna así (temporada de lluvias, por ejemplo), se devuelve la más despejada
 * de todas para no dejar la parcela sin imagen.
 */
export async function findLatestClearPass(
  polygon: any,
  options?: { days?: number; minClearPct?: number },
): Promise<ClearPass | null> {
  const minClearPct = options?.minClearPct ?? 85;
  const passes = await listClearPasses(polygon, options?.days ?? 60);
  if (passes.length === 0) return null;

  const clear = passes.find((p) => p.clearPct >= minClearPct);
  if (clear) return clear;

  // Ninguna llegó al umbral: la mejor disponible (empates → la más reciente)
  return passes.reduce((mejor, p) => (p.clearPct > mejor.clearPct ? p : mejor), passes[0]);
}

// ============ PROCESS API ============

/**
 * Obtiene una imagen True Color (RGB) de Sentinel-2.
 */
export async function getTrueColorImage(polygon: any, date?: string): Promise<Buffer | null> {
  const token = await getAccessToken();
  const { minLng, maxLng, minLat, maxLat, pixelsW, pixelsH } = getPolygonBoundsAndResolution(polygon);

  const targetDate = date || new Date().toISOString().split("T")[0];
  const fromDate = new Date(new Date(targetDate).getTime() - 15 * 86400000).toISOString().split("T")[0];

  const requestBody = {
    input: {
      bounds: {
        bbox: [minLng, minLat, maxLng, maxLat],
        properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
      },
      data: [{
        dataFilter: {
          timeRange: { from: `${fromDate}T00:00:00Z`, to: `${targetDate}T23:59:59Z` },
          mosaickingOrder: "leastCC",
          maxCloudCoverage: 30,
        },
        type: "sentinel-2-l2a",
      }],
    },
    output: {
      width: pixelsW, height: pixelsH,
      responses: [{ identifier: "default", format: { type: "image/png" } }],
    },
    evalscript: TRUE_COLOR_EVALSCRIPT,
  };

  console.log(`[Copernicus] True Color: ${fromDate} → ${targetDate} (${pixelsW}x${pixelsH}px)`);
  const res = await fetch(PROCESS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "image/png" },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[Copernicus] Error Process API:", res.status, errText);
    if (res.status === 400 && errText.includes("No valid data")) return null;
    throw new Error(`Error al obtener imagen satelital (${res.status})`);
  }

  return Buffer.from(await res.arrayBuffer());
}

/**
 * Obtiene un mapa coloreado de un índice espectral.
 * Genera PNG con ColorMapVisualizer, dataMask=0 → transparente.
 */
export async function getIndexMapImage(
  polygon: any,
  indexType: IndexType = "NDVI",
  date?: string,
  /**
   * true = la imagen es EXACTAMENTE la de ese día (una sola pasada).
   * false = mosaico de los 15 días previos escogiendo lo menos nublado.
   */
  exactDay = false,
): Promise<Buffer | null> {
  const token = await getAccessToken();
  const cfg = INDEX_CONFIGS[indexType];
  const { minLng, maxLng, minLat, maxLat, pixelsW, pixelsH } = getPolygonBoundsAndResolution(polygon, cfg.resolution);

  const targetDate = date || new Date().toISOString().split("T")[0];
  const fromDate = exactDay
    ? targetDate
    : new Date(new Date(targetDate).getTime() - 15 * 86400000).toISOString().split("T")[0];

  // Con día exacto ya sabemos que la PARCELA se ve despejada, así que no se
  // filtra por nubosidad de la escena completa: ese filtro descartaría pasadas
  // buenas solo porque hay nubes a kilómetros de distancia.
  const dataFilter: Record<string, unknown> = {
    timeRange: { from: `${fromDate}T00:00:00Z`, to: `${targetDate}T23:59:59Z` },
    mosaickingOrder: "leastCC",
  };
  if (!exactDay) dataFilter.maxCloudCoverage = 30;

  const requestBody = {
    input: {
      bounds: {
        bbox: [minLng, minLat, maxLng, maxLat],
        properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
      },
      data: [{
        dataFilter,
        type: "sentinel-2-l2a",
      }],
    },
    output: {
      width: pixelsW, height: pixelsH,
      responses: [{ identifier: "default", format: { type: "image/png" } }],
    },
    evalscript: buildColorMapEvalscript(indexType),
  };

  console.log(
    `[Copernicus] ${indexType} Map: ${exactDay ? `pasada del ${targetDate}` : `${fromDate} → ${targetDate}`} (${pixelsW}x${pixelsH}px)`
  );
  const res = await fetch(PROCESS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "image/png" },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[Copernicus] Error ${indexType} Map:`, res.status, errText);
    if (res.status === 400 && errText.includes("No valid data")) return null;
    throw new Error(`Error al obtener mapa ${indexType} (${res.status})`);
  }

  return Buffer.from(await res.arrayBuffer());
}

/**
 * Mapa del índice con la ÚLTIMA pasada despejada sobre la parcela.
 *
 * Es lo que se muestra en el Dashboard: en vez de un mosaico de dos semanas
 * fechado con "hoy", se busca cuándo pasó el satélite por última vez viendo la
 * huerta sin nubes y se trae esa imagen, con su fecha real.
 *
 * Si no hay ninguna pasada utilizable, cae al mosaico de siempre y devuelve
 * captureDate = null (para no mostrar una fecha que no corresponde).
 */
export async function getLatestClearIndexMap(
  polygon: any,
  indexType: IndexType = "NDVI",
  options?: { days?: number; minClearPct?: number },
): Promise<{ buffer: Buffer | null; captureDate: string | null; clearPct: number | null }> {
  let pass: ClearPass | null = null;
  try {
    pass = await findLatestClearPass(polygon, options);
  } catch (e: any) {
    console.error("[Copernicus] No se pudo buscar la última pasada despejada:", e?.message);
  }

  if (pass) {
    console.log(`[Copernicus] Última pasada sobre la parcela: ${pass.date} (${pass.clearPct}% despejado)`);
    const buffer = await getIndexMapImage(polygon, indexType, pass.date, true);
    if (buffer) return { buffer, captureDate: pass.date, clearPct: pass.clearPct };
    console.warn(`[Copernicus] La pasada del ${pass.date} no devolvió imagen; se usa el mosaico`);
  }

  // Respaldo: comportamiento anterior (mosaico de 15 días)
  const buffer = await getIndexMapImage(polygon, indexType);
  return { buffer, captureDate: null, clearPct: null };
}

// ============ VIGOR POR ZONAS DENTRO DE LA PARCELA ============

/**
 * Evalscript que devuelve el NDVI como imagen en escala de grises + máscara.
 * El valor -1..1 se guarda en 0..250 para poder leerlo píxel por píxel.
 */
const NDVI_RAW_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: ["B04", "B08", "dataMask"],
    output: { bands: 2, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  var suma = s.B08 + s.B04;
  var ndvi = suma === 0 ? 0 : (s.B08 - s.B04) / suma;
  var v = Math.round((ndvi + 1) / 2 * 250);
  return [Math.max(0, Math.min(250, v)), s.dataMask * 255];
}`;

/** Las nueve zonas de la parcela, tal como las nombraría alguien en el campo */
const ZONE_NAMES = [
  "noroeste", "norte", "noreste",
  "oeste", "centro", "este",
  "suroeste", "sur", "sureste",
];

export interface VigorZone {
  name: string;
  meanNdvi: number;
  /** Qué porcentaje de la parcela ocupa esta zona */
  areaPct: number;
}

export interface ParcelVigor {
  meanNdvi: number;
  minNdvi: number;
  maxNdvi: number;
  /** Reparto de la parcela por nivel de vigor (% del área) */
  distribution: { suelo: number; bajo: number; medio: number; alto: number };
  zones: VigorZone[];
  driest: VigorZone | null;
  strongest: VigorZone | null;
  /** Diferencia entre la zona más vigorosa y la más seca (uniformidad) */
  spread: number;
}

/**
 * Analiza el NDVI **por zonas dentro de la parcela**.
 *
 * En vez de un solo promedio (que esconde los problemas), se baja un raster
 * pequeño del índice y se mide zona por zona en una cuadrícula de 3x3. Así se
 * puede decir "el noreste está seco y el resto va bien" en lugar de un número
 * suelto que no dice dónde mirar.
 */
export async function getParcelVigor(
  polygon: any,
  date: string,
): Promise<ParcelVigor | null> {
  const token = await getAccessToken();
  const { minLng, maxLng, minLat, maxLat } = getPolygonBoundsAndResolution(polygon, 10);
  // Resolución baja a propósito: alcanza para ver zonas y pesa poquísimo
  const size = 96;

  const requestBody = {
    input: {
      bounds: {
        bbox: [minLng, minLat, maxLng, maxLat],
        properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
      },
      data: [{
        dataFilter: {
          timeRange: { from: `${date}T00:00:00Z`, to: `${date}T23:59:59Z` },
          mosaickingOrder: "leastCC",
        },
        type: "sentinel-2-l2a",
      }],
    },
    output: {
      width: size, height: size,
      responses: [{ identifier: "default", format: { type: "image/png" } }],
    },
    evalscript: NDVI_RAW_EVALSCRIPT,
  };

  const res = await fetch(PROCESS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "image/png" },
    body: JSON.stringify(requestBody),
  });
  if (!res.ok) {
    console.error("[Copernicus] Error obteniendo el raster de vigor:", res.status);
    return null;
  }

  const sharp = (await import("sharp")).default;
  const png = Buffer.from(await res.arrayBuffer());
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels; // gris + máscara (2), o RGBA si el servidor expande

  // Recolectar el NDVI de cada píxel válido y a qué zona pertenece
  const zoneSums = new Array(9).fill(0);
  const zoneCounts = new Array(9).fill(0);
  let total = 0, sum = 0, min = 1, max = -1;
  const bands = { suelo: 0, bajo: 0, medio: 0, alto: 0 };

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * channels;
      const mask = data[i + (channels - 1)]; // última banda = máscara/alfa
      if (mask === 0) continue; // fuera de la parcela o sin dato

      const ndvi = (data[i] / 250) * 2 - 1;
      sum += ndvi;
      total++;
      if (ndvi < min) min = ndvi;
      if (ndvi > max) max = ndvi;

      // Reparto por nivel de vigor
      if (ndvi < 0.2) bands.suelo++;
      else if (ndvi < 0.4) bands.bajo++;
      else if (ndvi < 0.6) bands.medio++;
      else bands.alto++;

      // Cuadrícula 3x3 — la fila 0 es el norte (las imágenes vienen con el
      // norte arriba), así que el índice mapea directo a los nombres
      const zx = Math.min(2, Math.floor((x / info.width) * 3));
      const zy = Math.min(2, Math.floor((y / info.height) * 3));
      const zi = zy * 3 + zx;
      zoneSums[zi] += ndvi;
      zoneCounts[zi]++;
    }
  }

  if (total === 0) return null;

  const pct = (n: number) => Math.round((n / total) * 1000) / 10;
  const zones: VigorZone[] = [];
  for (let i = 0; i < 9; i++) {
    // Zonas con muy pocos píxeles (esquinas fuera del polígono) no son fiables
    if (zoneCounts[i] < Math.max(4, total * 0.02)) continue;
    zones.push({
      name: ZONE_NAMES[i],
      meanNdvi: Math.round((zoneSums[i] / zoneCounts[i]) * 100) / 100,
      areaPct: pct(zoneCounts[i]),
    });
  }

  const ordered = [...zones].sort((a, b) => a.meanNdvi - b.meanNdvi);
  const driest = ordered[0] ?? null;
  const strongest = ordered[ordered.length - 1] ?? null;

  return {
    meanNdvi: Math.round((sum / total) * 100) / 100,
    minNdvi: Math.round(min * 100) / 100,
    maxNdvi: Math.round(max * 100) / 100,
    distribution: {
      suelo: pct(bands.suelo),
      bajo: pct(bands.bajo),
      medio: pct(bands.medio),
      alto: pct(bands.alto),
    },
    zones,
    driest,
    strongest,
    spread: driest && strongest ? Math.round((strongest.meanNdvi - driest.meanNdvi) * 100) / 100 : 0,
  };
}

// Backward compatibility
export const getNDVIMapImage = (polygon: any, date?: string) =>
  getIndexMapImage(polygon, "NDVI", date);
