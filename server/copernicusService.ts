import { getDb } from "./db";
import { apiConfig } from "../drizzle/schema";
import { decryptSecret, isEncrypted } from "./encryption";

/**
 * Servicio de Copernicus CDSE (Copernicus Data Space Ecosystem).
 * Usa Sentinel-2 L2A para NDVI estadístico e imágenes True Color / NDVI Map.
 *
 * APIs utilizadas:
 * - Auth: https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
 * - Statistical: https://sh.dataspace.copernicus.eu/api/v1/statistics
 * - Process: https://sh.dataspace.copernicus.eu/api/v1/process
 */

const AUTH_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const STATS_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics";
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";

// Cache del access token en memoria
let cachedToken: { token: string; expiresAt: number } | null = null;

// EvalScript para NDVI estadístico con outputs nombrados (corregido según docs)
const NDVI_STATS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: ["B04", "B08", "dataMask"],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}

function evaluatePixel(sample) {
  let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
  return {
    ndvi: [isFinite(ndvi) ? ndvi : -2],
    dataMask: [sample.dataMask]
  };
}`;

// EvalScript para True Color (RGB)
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

// EvalScript para NDVI con simbología de colores (mapa visual)
const NDVI_COLOR_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: ["B04", "B08", "dataMask"],
    output: { bands: 4 }
  };
}

const map = [
  [-1.0, 0x040ED8],
  [-0.1, 0x040ED8],
  [0.0,  0x8B4513],
  [0.1,  0xA0522D],
  [0.2,  0xFF8C00],
  [0.3,  0xFFD700],
  [0.4,  0xADFF2F],
  [0.5,  0x7CFC00],
  [0.6,  0x228B22],
  [0.8,  0x006400],
  [1.0,  0x004D00],
];

const visualizer = new ColorMapVisualizer(map);

function evaluatePixel(sample) {
  if (sample.dataMask === 0) return [0, 0, 0, 0];
  let ndvi = index(sample.B08, sample.B04);
  let rgb = visualizer.process(ndvi);
  return rgb.concat(sample.dataMask);
}`;

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

    // Desencriptar el secret
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
 * Autentica con CDSE y obtiene un access_token.
 * Cachea el token en memoria hasta que expire.
 */
export async function getAccessToken(): Promise<string> {
  // Verificar cache
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

  console.log("[Copernicus] Token obtenido, expira en", data.expires_in, "segundos");
  return cachedToken.token;
}

/**
 * Obtiene el histórico de NDVI para un polígono GeoJSON.
 * Usa la Statistical API de Sentinel Hub con outputs nombrados.
 */
export async function getNDVIHistory(
  polygon: any,
  fromDate: string,
  toDate: string
): Promise<Array<{ date: string; mean: number; min: number; max: number; stDev: number; noDataPct: number }>> {
  const token = await getAccessToken();

  const requestBody = {
    input: {
      bounds: {
        geometry: {
          type: "Polygon",
          coordinates: polygon.coordinates,
        },
      },
      data: [{
        dataFilter: {
          mosaickingOrder: "leastCC",
        },
        type: "sentinel-2-l2a",
      }],
    },
    aggregation: {
      timeRange: {
        from: `${fromDate}T00:00:00Z`,
        to: `${toDate}T23:59:59Z`,
      },
      aggregationInterval: {
        of: "P5D",
      },
      resx: 10,
      resy: 10,
      evalscript: NDVI_STATS_EVALSCRIPT,
    },
  };

  console.log(`[Copernicus] Solicitando NDVI histórico: ${fromDate} → ${toDate}`);
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
    console.error("[Copernicus] Error Statistical API:", res.status, errText);
    throw new Error(`Error al obtener NDVI satelital (${res.status})`);
  }

  const data = await res.json();

  // Parsear respuesta — output nombrado "ndvi" → outputs.ndvi.bands.B0.stats
  const results: Array<{ date: string; mean: number; min: number; max: number; stDev: number; noDataPct: number }> = [];

  if (data.data) {
    for (const interval of data.data) {
      const dateStr = interval.interval?.from?.split("T")[0];
      // Buscar stats en múltiples paths posibles (named output vs default)
      const stats = interval.outputs?.ndvi?.bands?.B0?.stats
                 || interval.outputs?.default?.bands?.B0?.stats
                 || interval.outputs?.data?.bands?.B0?.stats;

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

  console.log(`[Copernicus] NDVI histórico: ${results.length} puntos de datos`);
  return results;
}

/**
 * Helper: Calcula bbox y resolución para un polígono.
 */
function getPolygonBoundsAndResolution(polygon: any) {
  const coords = polygon.coordinates[0];
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const widthDeg = maxLng - minLng;
  const heightDeg = maxLat - minLat;
  const metersPerDegLng = 111320 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  const metersPerDegLat = 110540;
  const widthM = widthDeg * metersPerDegLng;
  const heightM = heightDeg * metersPerDegLat;
  const pixelsW = Math.min(Math.max(Math.round(widthM / 10), 64), 512);
  const pixelsH = Math.min(Math.max(Math.round(heightM / 10), 64), 512);

  return { minLng, maxLng, minLat, maxLat, pixelsW, pixelsH };
}

/**
 * Obtiene una imagen True Color (RGB) de Sentinel-2 para un polígono.
 */
export async function getTrueColorImage(
  polygon: any,
  date?: string
): Promise<Buffer | null> {
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
          timeRange: {
            from: `${fromDate}T00:00:00Z`,
            to: `${targetDate}T23:59:59Z`,
          },
          mosaickingOrder: "leastCC",
          maxCloudCoverage: 30,
        },
        type: "sentinel-2-l2a",
      }],
    },
    output: {
      width: pixelsW,
      height: pixelsH,
      responses: [{
        identifier: "default",
        format: { type: "image/png" },
      }],
    },
    evalscript: TRUE_COLOR_EVALSCRIPT,
  };

  console.log(`[Copernicus] True Color: ${fromDate} → ${targetDate} (${pixelsW}x${pixelsH}px)`);
  const res = await fetch(PROCESS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[Copernicus] Error Process API:", res.status, errText);
    if (res.status === 400 && errText.includes("No valid data")) return null;
    throw new Error(`Error al obtener imagen satelital (${res.status})`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Obtiene un mapa NDVI coloreado (simbología completa) de Sentinel-2.
 * Usa ColorMapVisualizer para generar colores:
 * Azul=agua, Café=suelo, Naranja=escasa, Amarillo=media, Verde claro=moderada, Verde oscuro=densa
 */
export async function getNDVIMapImage(
  polygon: any,
  date?: string
): Promise<Buffer | null> {
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
          timeRange: {
            from: `${fromDate}T00:00:00Z`,
            to: `${targetDate}T23:59:59Z`,
          },
          mosaickingOrder: "leastCC",
          maxCloudCoverage: 30,
        },
        type: "sentinel-2-l2a",
      }],
    },
    output: {
      width: pixelsW,
      height: pixelsH,
      responses: [{
        identifier: "default",
        format: { type: "image/png" },
      }],
    },
    evalscript: NDVI_COLOR_EVALSCRIPT,
  };

  console.log(`[Copernicus] NDVI Map: ${fromDate} → ${targetDate} (${pixelsW}x${pixelsH}px)`);
  const res = await fetch(PROCESS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[Copernicus] Error NDVI Map:", res.status, errText);
    if (res.status === 400 && errText.includes("No valid data")) return null;
    throw new Error(`Error al obtener mapa NDVI (${res.status})`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
