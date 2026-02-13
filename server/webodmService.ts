/**
 * WebODM Service - Proxy server-side para la API de WebODM
 * Maneja autenticación, cache de tokens y consultas a proyectos/tareas
 */

import { getDb } from "./db";
import { webodmConfig, parcelOdmMapping, parcelDetails, crops, cropVarieties, parcelNotes, users } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

// ============ CONFIGURACIÓN WebODM ============

export async function getWebodmConfig() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(webodmConfig).limit(1);
  return rows[0] || null;
}

export async function saveWebodmConfig(data: {
  serverUrl: string;
  username: string;
  password: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const existing = await db.select().from(webodmConfig).limit(1);
  // Limpiar URL trailing slash
  const cleanUrl = data.serverUrl.replace(/\/+$/, "");

  if (existing.length > 0) {
    await db
      .update(webodmConfig)
      .set({ serverUrl: cleanUrl, username: data.username, password: data.password, token: null, tokenExpiresAt: null })
      .where(eq(webodmConfig.id, existing[0].id));
    return { ...existing[0], ...data, serverUrl: cleanUrl };
  } else {
    const result = await db.insert(webodmConfig).values({
      serverUrl: cleanUrl,
      username: data.username,
      password: data.password,
    });
    return { id: (result as any)[0].insertId, ...data, serverUrl: cleanUrl };
  }
}

// ============ AUTENTICACIÓN WebODM ============

async function getValidToken(): Promise<{ token: string; serverUrl: string } | null> {
  const config = await getWebodmConfig();
  if (!config) return null;

  // Verificar si el token cacheado aún es válido (con 10 min de margen)
  if (config.token && config.tokenExpiresAt) {
    const expiresAt = new Date(config.tokenExpiresAt).getTime();
    const now = Date.now();
    if (expiresAt - now > 10 * 60 * 1000) {
      return { token: config.token, serverUrl: config.serverUrl };
    }
  }

  // Solicitar nuevo token
  try {
    const response = await fetch(`${config.serverUrl}/api/token-auth/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`,
    });

    if (!response.ok) {
      console.error(`[WebODM] Auth failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const token = data.token;

    // Guardar token (expira en 6 horas por defecto)
    const expiresAt = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // 5.5h para margen
    const db = await getDb();
    if (db) {
      await db
        .update(webodmConfig)
        .set({ token, tokenExpiresAt: expiresAt })
        .where(eq(webodmConfig.id, config.id));
    }

    return { token, serverUrl: config.serverUrl };
  } catch (err) {
    console.error("[WebODM] Auth error:", err);
    return null;
  }
}

async function webodmFetch(path: string): Promise<any> {
  const auth = await getValidToken();
  if (!auth) throw new Error("WebODM no configurado o credenciales inválidas");

  const url = `${auth.serverUrl}${path}`;
  const response = await fetch(url, {
    headers: { Authorization: `JWT ${auth.token}` },
  });

  if (!response.ok) {
    if (response.status === 403) {
      // Token expirado, limpiar cache
      const db = await getDb();
      const config = await getWebodmConfig();
      if (db && config) {
        await db.update(webodmConfig).set({ token: null, tokenExpiresAt: null }).where(eq(webodmConfig.id, config.id));
      }
      throw new Error("Token expirado. Intente de nuevo.");
    }
    throw new Error(`WebODM API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// ============ PROYECTOS Y TAREAS WebODM ============

export async function testWebodmConnection(): Promise<{ success: boolean; message: string; projectCount?: number }> {
  try {
    const data = await webodmFetch("/api/projects/?ordering=-created_at");
    return {
      success: true,
      message: `Conexión exitosa. ${data.count || data.length || 0} proyectos encontrados.`,
      projectCount: data.count || data.length || 0,
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Error de conexión" };
  }
}

export async function getOdmProjects(): Promise<any[]> {
  try {
    const data = await webodmFetch("/api/projects/?ordering=-created_at&page_size=100");
    // La API puede devolver paginado {count, results} o array directo
    return Array.isArray(data) ? data : data.results || [];
  } catch (err) {
    console.error("[WebODM] Error fetching projects:", err);
    return [];
  }
}

export async function getOdmProjectTasks(projectId: number): Promise<any[]> {
  try {
    const tasks = await webodmFetch(`/api/projects/${projectId}/tasks/`);
    if (Array.isArray(tasks) && tasks.length > 0) {
      const t = tasks[0];
      console.log(`[WebODM] Project ${projectId}: ${tasks.length} tasks.`);
      console.log(`[WebODM] First task: id=${t.id}, uuid=${t.uuid || '(empty)'}, name=${t.name}, status=${t.status}`);
    }
    // IMPORTANTE: En esta instancia de WebODM, task.id YA es el UUID (el campo uuid siempre está vacío).
    // Normalizamos para que el frontend siempre tenga un uuid válido.
    const normalized = Array.isArray(tasks) ? tasks.map((t: any) => ({
      ...t,
      uuid: t.uuid || t.id,  // Si uuid está vacío, usar id (que ya es UUID en esta instancia)
    })) : [];
    return normalized;
  } catch (err) {
    console.error(`[WebODM] Error fetching tasks for project ${projectId}:`, err);
    return [];
  }
}

export async function getOdmTaskDetail(projectId: number, taskId: number): Promise<any> {
  return webodmFetch(`/api/projects/${projectId}/tasks/${taskId}/`);
}

export async function getOdmTilesJson(projectId: number, taskId: string, type: "orthophoto" | "dsm" | "dtm" = "orthophoto"): Promise<any> {
  return webodmFetch(`/api/projects/${projectId}/tasks/${taskId}/${type}/tiles.json`);
}

/**
 * Genera la URL de tiles TMS para usar en OpenLayers
 * Incluye el JWT token como querystring
 */
export async function getOdmTileUrl(projectId: number, taskUuid: string, type: "orthophoto" | "dsm" | "dtm" = "orthophoto"): Promise<string | null> {
  const auth = await getValidToken();
  if (!auth) return null;
  return `${auth.serverUrl}/api/projects/${projectId}/tasks/${taskUuid}/${type}/tiles/{z}/{x}/{y}.png?jwt=${auth.token}`;
}

/**
 * Obtiene URLs de tiles para todas las capas disponibles de una tarea
 */
export async function getOdmTaskTileUrls(projectId: number, taskUuid: string, availableAssets: string[]): Promise<Record<string, string>> {
  const auth = await getValidToken();
  if (!auth) return {};

  const urls: Record<string, string> = {};
  const baseUrl = `${auth.serverUrl}/api/projects/${projectId}/tasks/${taskUuid}`;
  const jwt = `jwt=${auth.token}`;

  // Orthophoto siempre disponible si hay orthophoto.tif
  if (availableAssets.includes("orthophoto.tif")) {
    urls.orthophoto = `${baseUrl}/orthophoto/tiles/{z}/{x}/{y}.png?${jwt}`;
  }

  // DSM (modelo de superficie digital)
  urls.dsm = `${baseUrl}/dsm/tiles/{z}/{x}/{y}.png?${jwt}`;

  // DTM (modelo de terreno digital)
  urls.dtm = `${baseUrl}/dtm/tiles/{z}/{x}/{y}.png?${jwt}`;

  return urls;
}

// ============ MAPEO PARCELA <-> PROYECTO ODM ============

export async function getParcelOdmMappings() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(parcelOdmMapping);
}

export async function getParcelOdmMapping(parcelId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(parcelOdmMapping).where(eq(parcelOdmMapping.parcelId, parcelId));
  return rows[0] || null;
}

export async function saveParcelOdmMapping(parcelId: number, odmProjectId: number, odmProjectName?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const existing = await db.select().from(parcelOdmMapping).where(eq(parcelOdmMapping.parcelId, parcelId));

  if (existing.length > 0) {
    await db
      .update(parcelOdmMapping)
      .set({ odmProjectId, odmProjectName: odmProjectName || null })
      .where(eq(parcelOdmMapping.id, existing[0].id));
    return { ...existing[0], odmProjectId, odmProjectName };
  } else {
    await db.insert(parcelOdmMapping).values({ parcelId, odmProjectId, odmProjectName: odmProjectName || null });
    return { parcelId, odmProjectId, odmProjectName };
  }
}

export async function deleteParcelOdmMapping(parcelId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(parcelOdmMapping).where(eq(parcelOdmMapping.parcelId, parcelId));
}

// ============ DETALLES DE PARCELA ============

export async function getParcelDetails(parcelId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(parcelDetails).where(eq(parcelDetails.parcelId, parcelId));
  return rows[0] || null;
}

export async function getAllParcelDetails() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(parcelDetails);
}

export async function saveParcelDetails(parcelId: number, data: {
  totalHectares?: string | null;
  productiveHectares?: string | null;
  treeDensityPerHectare?: string | null;
  totalTrees?: number | null;
  productiveTrees?: number | null;
  newTrees?: number | null;
  cropId?: number | null;
  varietyId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const existing = await db.select().from(parcelDetails).where(eq(parcelDetails.parcelId, parcelId));

  if (existing.length > 0) {
    await db.update(parcelDetails).set(data).where(eq(parcelDetails.id, existing[0].id));
    return { ...existing[0], ...data };
  } else {
    await db.insert(parcelDetails).values({ parcelId, ...data });
    return { parcelId, ...data };
  }
}

// ============ DATOS DE COSECHA POR PARCELA ============

export async function getParcelHarvestStats(parcelCode: string) {
  const db = await getDb();
  if (!db) return null;

  const { sql } = await import("drizzle-orm");

  const result = await db.execute(sql`
    SELECT 
      COUNT(*) as totalBoxes,
      SUM(weight) / 1000 as totalWeight,
      SUM(CASE WHEN harvesterId NOT IN (98, 99) THEN weight ELSE 0 END) / 1000 as firstQualityWeight,
      SUM(CASE WHEN harvesterId = 98 THEN weight ELSE 0 END) / 1000 as secondQualityWeight,
      SUM(CASE WHEN harvesterId = 99 THEN weight ELSE 0 END) / 1000 as wasteWeight,
      MIN(DATE(submissionTime)) as firstDate,
      MAX(DATE(submissionTime)) as lastDate,
      COUNT(DISTINCT DATE(submissionTime)) as harvestDays
    FROM boxes 
    WHERE parcelCode = ${parcelCode} AND archived = 0
  `);

  const row = (result[0] as unknown as any[])[0];
  if (!row || !row.totalBoxes || Number(row.totalBoxes) === 0) return null;

  return {
    totalBoxes: Number(row.totalBoxes),
    totalWeight: Number(Number(row.totalWeight).toFixed(2)),
    firstQualityWeight: Number(Number(row.firstQualityWeight).toFixed(2)),
    secondQualityWeight: Number(Number(row.secondQualityWeight).toFixed(2)),
    wasteWeight: Number(Number(row.wasteWeight).toFixed(2)),
    firstDate: row.firstDate instanceof Date ? row.firstDate.toISOString().split("T")[0] : String(row.firstDate || ""),
    lastDate: row.lastDate instanceof Date ? row.lastDate.toISOString().split("T")[0] : String(row.lastDate || ""),
    harvestDays: Number(row.harvestDays),
  };
}

export async function getParcelDailyHarvest(parcelCode: string) {
  const db = await getDb();
  if (!db) return [];

  const { sql } = await import("drizzle-orm");

  const result = await db.execute(sql`
    SELECT 
      DATE(submissionTime) as date,
      COUNT(*) as totalBoxes,
      SUM(weight) / 1000 as totalWeight,
      SUM(CASE WHEN harvesterId NOT IN (98, 99) THEN weight ELSE 0 END) / 1000 as firstQualityWeight,
      SUM(CASE WHEN harvesterId = 98 THEN weight ELSE 0 END) / 1000 as secondQualityWeight,
      SUM(CASE WHEN harvesterId = 99 THEN weight ELSE 0 END) / 1000 as wasteWeight
    FROM boxes 
    WHERE parcelCode = ${parcelCode} AND archived = 0
    GROUP BY DATE(submissionTime)
    ORDER BY DATE(submissionTime) DESC
  `);

  return (result[0] as unknown as any[]).map((row) => ({
    date: row.date instanceof Date ? row.date.toISOString().split("T")[0] : String(row.date),
    totalBoxes: Number(row.totalBoxes),
    totalWeight: Number(Number(row.totalWeight).toFixed(2)),
    firstQualityWeight: Number(Number(row.firstQualityWeight).toFixed(2)),
    secondQualityWeight: Number(Number(row.secondQualityWeight).toFixed(2)),
    wasteWeight: Number(Number(row.wasteWeight).toFixed(2)),
  }));
}

// ============ CULTIVOS Y VARIEDADES ============

export async function getAllCrops() {
  const db = await getDb();
  if (!db) return [];
  const allCrops = await db.select().from(crops);
  const allVarieties = await db.select().from(cropVarieties);
  
  return allCrops.map(c => ({
    ...c,
    varieties: allVarieties.filter(v => v.cropId === c.id),
  }));
}

export async function createCrop(data: { name: string; description?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(crops).values({
    name: data.name,
    description: data.description || null,
  });
  return { id: (result as any)[0].insertId, ...data };
}

export async function updateCrop(id: number, data: { name?: string; description?: string | null; isActive?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(crops).set(data).where(eq(crops.id, id));
  return { success: true };
}

export async function deleteCrop(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Eliminar variedades asociadas primero
  await db.delete(cropVarieties).where(eq(cropVarieties.cropId, id));
  await db.delete(crops).where(eq(crops.id, id));
  return { success: true };
}

export async function createVariety(data: { cropId: number; name: string; description?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(cropVarieties).values({
    cropId: data.cropId,
    name: data.name,
    description: data.description || null,
  });
  return { id: (result as any)[0].insertId, ...data };
}

export async function updateVariety(id: number, data: { name?: string; description?: string | null; isActive?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(cropVarieties).set(data).where(eq(cropVarieties.id, id));
  return { success: true };
}

export async function deleteVariety(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(cropVarieties).where(eq(cropVarieties.id, id));
  return { success: true };
}

// ============ NOTAS DE PARCELA ============

export async function getParcelNotes(parcelId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const allNotes = await db
    .select()
    .from(parcelNotes)
    .where(eq(parcelNotes.parcelId, parcelId))
    .orderBy(desc(parcelNotes.createdAt));
  
  // Obtener nombres de autores
  const userIds = [...new Set(allNotes.map(n => n.userId))];
  const allUsers = userIds.length > 0
    ? await db.select({ id: users.id, name: users.name }).from(users)
    : [];
  
  const userMap = new Map(allUsers.map(u => [u.id, u.name]));
  
  return allNotes.map(n => ({
    id: n.id,
    parcelId: n.parcelId,
    userId: n.userId,
    authorName: userMap.get(n.userId) || "Usuario",
    content: n.content,
    createdAt: n.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: n.updatedAt?.toISOString() || new Date().toISOString(),
  }));
}

export async function addParcelNote(parcelId: number, userId: number, content: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(parcelNotes).values({
    parcelId,
    userId,
    content,
  });
  return { id: (result as any)[0].insertId, parcelId, userId, content };
}

export async function deleteParcelNote(noteId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(parcelNotes).where(eq(parcelNotes.id, noteId));
  return { success: true };
}
