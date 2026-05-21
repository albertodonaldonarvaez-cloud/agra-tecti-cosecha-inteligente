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
  date?: string
): Promise<Buffer | null> {
  const token = await getAccessToken();
  const cfg = INDEX_CONFIGS[indexType];
  const { minLng, maxLng, minLat, maxLat, pixelsW, pixelsH } = getPolygonBoundsAndResolution(polygon, cfg.resolution);

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
    evalscript: buildColorMapEvalscript(indexType),
  };

  console.log(`[Copernicus] ${indexType} Map: ${fromDate} → ${targetDate} (${pixelsW}x${pixelsH}px)`);
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

// Backward compatibility
export const getNDVIMapImage = (polygon: any, date?: string) =>
  getIndexMapImage(polygon, "NDVI", date);
