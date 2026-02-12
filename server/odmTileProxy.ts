/**
 * Proxy de tiles para WebODM
 * 
 * Actúa como intermediario entre el navegador del cliente y el servidor WebODM.
 * Descarga los tiles con autenticación JWT y los cachea en disco.
 * 
 * IMPORTANTE: WebODM usa TMS (Y invertida). OpenLayers XYZ source envía Y normal (XYZ).
 * Este proxy recibe Y en formato XYZ y la convierte a TMS antes de pedir a WebODM.
 * 
 * Soporta capas: orthophoto, dsm, dtm, ndvi, vari
 */

import { Request, Response } from "express";
import { getWebodmConfig } from "./webodmService";
import * as fs from "fs";
import * as path from "path";

// Directorio de cache de tiles
const TILE_CACHE_DIR = process.env.TILE_CACHE_DIR || "/tmp/odm-tile-cache";

function ensureCacheDir(subDir: string) {
  const dir = path.join(TILE_CACHE_DIR, subDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Cache de token en memoria
let tokenCache: { token: string; serverUrl: string; expiresAt: number } | null = null;

async function getToken(): Promise<{ token: string; serverUrl: string } | null> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) {
    return { token: tokenCache.token, serverUrl: tokenCache.serverUrl };
  }

  const config = await getWebodmConfig();
  if (!config) {
    console.error("[ODM Tile Proxy] No WebODM config found");
    return null;
  }

  // Si hay token válido en BD
  if (config.token && config.tokenExpiresAt) {
    const expiresAt = new Date(config.tokenExpiresAt).getTime();
    if (expiresAt > Date.now() + 60000) {
      tokenCache = { token: config.token, serverUrl: config.serverUrl, expiresAt };
      return { token: config.token, serverUrl: config.serverUrl };
    }
  }

  // Solicitar nuevo token
  try {
    console.log(`[ODM Tile Proxy] Requesting new token from ${config.serverUrl}`);
    const response = await fetch(`${config.serverUrl}/api/token-auth/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`,
    });

    if (!response.ok) {
      console.error(`[ODM Tile Proxy] Auth failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const expiresAt = Date.now() + 5.5 * 60 * 60 * 1000;
    tokenCache = { token: data.token, serverUrl: config.serverUrl, expiresAt };

    // Actualizar BD
    try {
      const { getDb } = await import("./db");
      const { webodmConfig: webodmConfigTable } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (db) {
        await db.update(webodmConfigTable)
          .set({ token: data.token, tokenExpiresAt: new Date(expiresAt) })
          .where(eq(webodmConfigTable.id, config.id));
      }
    } catch (e) { /* no bloquear */ }

    return { token: data.token, serverUrl: config.serverUrl };
  } catch (err) {
    console.error("[ODM Tile Proxy] Auth error:", err);
    return null;
  }
}

/**
 * Mapeo de tipos de capa a parámetros de URL de WebODM
 */
const LAYER_CONFIG: Record<string, { path: string; params?: string }> = {
  orthophoto: { path: "orthophoto" },
  dsm: { path: "dsm" },
  dtm: { path: "dtm" },
  ndvi: { path: "orthophoto", params: "formula=NDVI&bands=RGN&color_map=rdylgn&rescale=-1,1" },
  vari: { path: "orthophoto", params: "formula=(G-R)/(G%2BR-B)&bands=RGB&color_map=rdylgn&rescale=-0.5,0.5" },
};

/**
 * Convierte coordenada Y de XYZ a TMS
 * TMS Y = (2^zoom - 1) - XYZ Y
 */
function xyzToTmsY(y: number, z: number): number {
  return Math.pow(2, z) - 1 - y;
}

/**
 * Proxy handler para tiles de WebODM
 * Ruta: /api/odm-tiles/:projectId/:taskUuid/:type/:z/:x/:y.png
 * 
 * Recibe coordenadas en formato XYZ (como las envía OpenLayers XYZ source)
 * y las convierte a TMS (como las espera WebODM) antes de hacer la petición.
 */
export async function proxyOdmTile(req: Request, res: Response) {
  try {
    const { projectId, taskUuid, type, z, x, y } = req.params;

    if (!projectId || !taskUuid || !type || !z || !x || !y) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const layerConfig = LAYER_CONFIG[type];
    if (!layerConfig) {
      return res.status(400).json({ error: `Invalid layer type: ${type}` });
    }

    // Parsear coordenadas
    const zNum = parseInt(z);
    const xNum = parseInt(x);
    const yClean = y.replace(".png", "");
    const yNum = parseInt(yClean);

    if (isNaN(zNum) || isNaN(xNum) || isNaN(yNum)) {
      return res.status(400).json({ error: "Invalid tile coordinates" });
    }

    // Convertir Y de XYZ a TMS para WebODM
    const tmsY = xyzToTmsY(yNum, zNum);

    // Verificar cache en disco
    const cacheKey = `${projectId}/${taskUuid}/${type}/${zNum}/${xNum}`;
    const cacheDir = ensureCacheDir(cacheKey);
    const cachePath = path.join(cacheDir, `${yNum}.png`);

    if (fs.existsSync(cachePath)) {
      const stat = fs.statSync(cachePath);
      // Cache válido por 7 días
      if (Date.now() - stat.mtimeMs < 7 * 24 * 60 * 60 * 1000) {
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=604800");
        res.setHeader("X-Tile-Cache", "HIT");
        return res.sendFile(cachePath);
      }
    }

    // Obtener token
    const auth = await getToken();
    if (!auth) {
      return res.status(503).json({ error: "WebODM no configurado o credenciales inválidas" });
    }

    // Construir URL del tile con TMS Y
    // WebODM acepta: /api/projects/{id}/tasks/{uuid}/{type}/tiles/{z}/{x}/{tmsY}.png?jwt=...
    let tileUrl = `${auth.serverUrl}/api/projects/${projectId}/tasks/${taskUuid}/${layerConfig.path}/tiles/${zNum}/${xNum}/${tmsY}.png?jwt=${auth.token}`;
    if (layerConfig.params) {
      tileUrl += `&${layerConfig.params}`;
    }

    // Descargar tile de WebODM
    const response = await fetch(tileUrl, {
      headers: {
        "Accept": "image/png,image/*,*/*",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Tile no existe (fuera del área) - devolver transparente
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=86400");
        const transparentPng = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRU5ErkJggg==",
          "base64"
        );
        return res.send(transparentPng);
      }
      if (response.status === 403) {
        tokenCache = null;
        console.warn(`[ODM Tile Proxy] 403 - Token expired, cleared cache`);
      }
      console.warn(`[ODM Tile Proxy] WebODM returned ${response.status} for tile z=${zNum} x=${xNum} tmsY=${tmsY}`);
      return res.status(response.status).json({ error: `WebODM error: ${response.status}` });
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());

    // Guardar en cache
    try {
      fs.writeFileSync(cachePath, buffer);
    } catch (e) {
      console.warn("[ODM Tile Proxy] Cache write failed:", e);
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.setHeader("X-Tile-Cache", "MISS");
    res.send(buffer);

  } catch (error: any) {
    console.error("[ODM Tile Proxy] Error:", error.message);
    res.status(500).json({ error: "Error al obtener tile" });
  }
}

/**
 * Endpoint para obtener los bounds (extensión geográfica) de una tarea
 * Ruta: /api/odm-bounds/:projectId/:taskUuid
 */
export async function getOdmTaskBounds(req: Request, res: Response) {
  try {
    const { projectId, taskUuid } = req.params;

    const auth = await getToken();
    if (!auth) {
      return res.status(503).json({ error: "WebODM no configurado" });
    }

    // Primero intentar tilejson que tiene bounds precisos
    try {
      const tilejsonRes = await fetch(
        `${auth.serverUrl}/api/projects/${projectId}/tasks/${taskUuid}/orthophoto/tiles.json?jwt=${auth.token}`
      );
      if (tilejsonRes.ok) {
        const tilejson = await tilejsonRes.json();
        if (tilejson.bounds && tilejson.bounds.length === 4) {
          res.setHeader("Cache-Control", "public, max-age=3600");
          return res.json({
            bounds: tilejson.bounds, // [minLon, minLat, maxLon, maxLat]
            center: tilejson.center,
            minzoom: tilejson.minzoom,
            maxzoom: tilejson.maxzoom,
          });
        }
      }
    } catch (e) {
      console.warn("[ODM Bounds] tilejson failed, trying task info");
    }

    // Fallback: obtener info de la tarea
    const response = await fetch(`${auth.serverUrl}/api/projects/${projectId}/tasks/${taskUuid}/`, {
      headers: { Authorization: `JWT ${auth.token}` },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "Error al obtener bounds" });
    }

    const task = await response.json();
    let bounds = null;

    if (task.orthophoto_extent) {
      bounds = extractBoundsArray(task.orthophoto_extent);
    } else if (task.dsm_extent) {
      bounds = extractBoundsArray(task.dsm_extent);
    }

    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({ bounds, name: task.name });

  } catch (error: any) {
    console.error("[ODM Bounds] Error:", error.message);
    res.status(500).json({ error: "Error al obtener bounds" });
  }
}

function extractBoundsArray(extent: any): number[] | null {
  try {
    if (extent && extent.coordinates && extent.coordinates[0]) {
      const coords = extent.coordinates[0];
      const lons = coords.map((c: number[]) => c[0]);
      const lats = coords.map((c: number[]) => c[1]);
      return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Endpoint para listar capas disponibles de una tarea
 * Ruta: /api/odm-layers/:projectId/:taskUuid
 */
export async function getOdmAvailableLayers(req: Request, res: Response) {
  try {
    const { projectId, taskUuid } = req.params;

    const auth = await getToken();
    if (!auth) {
      return res.status(503).json({ error: "WebODM no configurado" });
    }

    const response = await fetch(`${auth.serverUrl}/api/projects/${projectId}/tasks/${taskUuid}/`, {
      headers: { Authorization: `JWT ${auth.token}` },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "Error al obtener tarea" });
    }

    const task = await response.json();
    const assets = task.available_assets || [];

    const layers = [
      { id: "orthophoto", name: "Ortofoto", available: assets.includes("orthophoto.tif"), description: "Imagen aérea corregida" },
      { id: "ndvi", name: "NDVI", available: assets.includes("orthophoto.tif"), description: "Salud vegetal (infrarrojo)" },
      { id: "vari", name: "VARI", available: assets.includes("orthophoto.tif"), description: "Vegetación visible (RGB)" },
      { id: "dsm", name: "DSM", available: assets.includes("dsm.tif"), description: "Modelo de Superficie" },
      { id: "dtm", name: "DTM", available: assets.includes("dtm.tif"), description: "Modelo de Terreno" },
    ];

    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({ layers, assets });

  } catch (error: any) {
    console.error("[ODM Layers] Error:", error.message);
    res.status(500).json({ error: "Error al obtener capas" });
  }
}
