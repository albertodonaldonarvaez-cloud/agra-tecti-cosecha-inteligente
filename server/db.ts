import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, apiConfig, harvesters, boxes, InsertBox, userActivityLogs } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Funciones para API Config
export async function getApiConfig() {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(apiConfig).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertApiConfig(config: { apiUrl: string; apiToken: string; assetId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await getApiConfig();
  if (existing) {
    await db.update(apiConfig).set({ ...config, updatedAt: new Date() }).where(eq(apiConfig.id, existing.id));
  } else {
    await db.insert(apiConfig).values(config);
  }
}

export async function updateLastSync() {
  const db = await getDb();
  if (!db) return;
  const existing = await getApiConfig();
  if (existing) {
    await db.update(apiConfig).set({ lastSync: new Date() }).where(eq(apiConfig.id, existing.id));
  }
}

// Funciones para Harvesters
export async function getAllHarvesters() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(harvesters).orderBy(harvesters.number);
}

export async function upsertHarvester(harvester: { number: number; customName?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(harvesters).values(harvester).onDuplicateKeyUpdate({
    set: { customName: harvester.customName, updatedAt: new Date() },
  });
}

// Funciones para Boxes
export async function upsertBox(box: InsertBox) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(boxes).values(box).onDuplicateKeyUpdate({
    set: {
      boxCode: box.boxCode,
      harvesterId: box.harvesterId,
      parcelCode: box.parcelCode,
      parcelName: box.parcelName,
      weight: box.weight,
      photoFilename: box.photoFilename,
      photoUrl: box.photoUrl,
      photoLargeUrl: box.photoLargeUrl,
      photoMediumUrl: box.photoMediumUrl,
      photoSmallUrl: box.photoSmallUrl,
      latitude: box.latitude,
      longitude: box.longitude,
      submissionTime: box.submissionTime,
      updatedAt: new Date(),
    },
  });
}

export async function getAllBoxes() {
  const db = await getDb();
  if (!db) return [];
  const { desc, eq } = await import("drizzle-orm");
  // Seleccionar solo campos necesarios para mejor rendimiento
  // Excluir cajas archivadas
  return await db.select({
    id: boxes.id,
    boxCode: boxes.boxCode,
    harvesterId: boxes.harvesterId,
    parcelCode: boxes.parcelCode,
    parcelName: boxes.parcelName,
    weight: boxes.weight,
    photoUrl: boxes.photoUrl,
    photoFilename: boxes.photoFilename,
    submissionTime: boxes.submissionTime,
    latitude: boxes.latitude,
    longitude: boxes.longitude,
  }).from(boxes).where(eq(boxes.archived, false)).orderBy(desc(boxes.submissionTime));
}

// Paginación optimizada para carga rápida
export async function getBoxesPaginated(params: {
  page: number;
  pageSize: number;
  filterDate?: string;
  filterParcel?: string;
  filterHarvester?: number;
  search?: string;
}) {
  const db = await getDb();
  if (!db) return { boxes: [], total: 0, page: params.page, pageSize: params.pageSize, totalPages: 0 };
  
  const { desc, and, eq, gte, lt, count, like } = await import("drizzle-orm");
  const offset = (params.page - 1) * params.pageSize;
  
  // Construir condiciones de filtro
  const conditions = [];
  
  // Siempre excluir cajas archivadas
  conditions.push(eq(boxes.archived, false));
  
  // Búsqueda por código de caja
  if (params.search && params.search.trim() !== '') {
    conditions.push(like(boxes.boxCode, `%${params.search.trim()}%`));
  }
  
  if (params.filterDate) {
    // Filtrar por fecha (formato YYYY-MM-DD)
    const startDate = new Date(params.filterDate + 'T00:00:00');
    const endDate = new Date(params.filterDate + 'T23:59:59');
    conditions.push(gte(boxes.submissionTime, startDate));
    conditions.push(lt(boxes.submissionTime, endDate));
  }
  
  if (params.filterParcel && params.filterParcel !== 'all') {
    conditions.push(eq(boxes.parcelCode, params.filterParcel));
  }
  
  if (params.filterHarvester && params.filterHarvester > 0) {
    conditions.push(eq(boxes.harvesterId, params.filterHarvester));
  }
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  // Obtener total de registros
  const totalResult = await db.select({ count: count() })
    .from(boxes)
    .where(whereClause);
  const total = totalResult[0]?.count || 0;
  
  // Obtener página de datos
  const data = await db.select({
    id: boxes.id,
    boxCode: boxes.boxCode,
    harvesterId: boxes.harvesterId,
    parcelCode: boxes.parcelCode,
    parcelName: boxes.parcelName,
    weight: boxes.weight,
    photoUrl: boxes.photoUrl,
    submissionTime: boxes.submissionTime,
  })
    .from(boxes)
    .where(whereClause)
    .orderBy(desc(boxes.submissionTime))
    .limit(params.pageSize)
    .offset(offset);
  
  return {
    boxes: data,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.ceil(total / params.pageSize),
  };
}

// Obtener opciones de filtro (fechas, parcelas, cortadoras únicas)
export async function getBoxFilterOptions() {
  const db = await getDb();
  if (!db) return { dates: [], parcels: [], harvesters: [] };
  
  const { sql } = await import("drizzle-orm");
  
  // Obtener fechas únicas (solo los últimos 60 días para rapidez)
  // Usar nombres de columnas en camelCase - excluir archivadas
  const datesResult = await db.execute(sql`
    SELECT DISTINCT DATE(submissionTime) as date 
    FROM boxes 
    WHERE archived = 0 AND submissionTime >= DATE_SUB(NOW(), INTERVAL 60 DAY)
    ORDER BY date DESC
  `);
  
  // Obtener parcelas únicas - excluir archivadas
  const parcelsResult = await db.execute(sql`
    SELECT DISTINCT parcelCode as code, parcelName as name 
    FROM boxes 
    WHERE archived = 0 AND parcelCode IS NOT NULL AND parcelCode != ''
    ORDER BY parcelCode
  `);
  
  // Obtener cortadoras únicas - excluir archivadas
  const harvestersResult = await db.execute(sql`
    SELECT DISTINCT harvesterId as id 
    FROM boxes 
    WHERE archived = 0
    ORDER BY harvesterId
  `);
  
  return {
    dates: (datesResult[0] as any[]).map(r => r.date),
    parcels: (parcelsResult[0] as any[]).map(r => ({ code: r.code, name: r.name })),
    harvesters: (harvestersResult[0] as any[]).map(r => r.id),
  };
}

export async function clearAllBoxes() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(boxes);
}

export async function getBoxById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(boxes).where(eq(boxes.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Funciones para Users (admin)
export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(users).orderBy(users.createdAt);
}

export async function updateUserRole(userId: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
}

/**
 * Actualiza los permisos de un usuario
 * @param userId ID del usuario
 * @param permissions Objeto con los permisos a actualizar (campos canView*)
 */
export async function updateUserPermissions(userId: number, permissions: Record<string, boolean>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Construir objeto de actualización solo con campos válidos
  const updateData: Record<string, any> = { updatedAt: new Date() };
  
  // Lista de campos de permisos válidos en la tabla users
  const validPermissionFields = [
    'canViewDashboard',
    'canViewBoxes', 
    'canViewAnalytics',
    'canViewDailyAnalysis',
    'canViewClimate',
    'canViewPerformance',
    'canViewParcels',
    'canViewHarvesters',
    'canViewEditor',
    'canViewErrors',
  ];
  
  for (const [key, value] of Object.entries(permissions)) {
    if (validPermissionFields.includes(key)) {
      updateData[key] = value;
    }
  }
  
  await db.update(users).set(updateData).where(eq(users.id, userId));
}

export async function createManualUser(data: { name: string; email: string; password: string; role?: "user" | "admin" }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(users).values({
    name: data.name,
    email: data.email,
    password: data.password,
    role: data.role || "user",
  });
}

export async function getBoxesWithFilters(startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) return [];
  
  const { and, gte, lte, desc, eq } = await import("drizzle-orm");
  
  // Siempre excluir cajas archivadas
  const conditions: any[] = [eq(boxes.archived, false)];
  
  if (startDate) {
    conditions.push(gte(boxes.submissionTime, new Date(startDate)));
  }
  if (endDate) {
    conditions.push(lte(boxes.submissionTime, new Date(endDate)));
  }
  
  return await db.select().from(boxes)
    .where(and(...conditions))
    .orderBy(desc(boxes.submissionTime));
}

export async function getAvailableDates() {
  const db = await getDb();
  if (!db) return [];
  
  const { eq } = await import("drizzle-orm");
  
  // Solo cajas activas (no archivadas)
  const allBoxes = await db.select({
    submissionTime: boxes.submissionTime
  }).from(boxes).where(eq(boxes.archived, false));
  
  // Extraer solo las fechas únicas (sin hora)
  const uniqueDates = new Set(
    allBoxes.map(box => {
      const date = new Date(box.submissionTime);
      return date.toISOString().split('T')[0];
    })
  );
  
  return Array.from(uniqueDates);
}


// Obtener códigos de caja duplicados
export async function getDuplicateBoxCodes() {
  const db = await getDb();
  if (!db) return [];
  
  const { sql } = await import("drizzle-orm");
  
  const result = await db.execute(sql`
    SELECT boxCode, COUNT(*) as count 
    FROM boxes 
    WHERE archived = 0
    GROUP BY boxCode 
    HAVING COUNT(*) > 1
  `);
  
  return (result[0] as any[]).map(r => r.boxCode);
}

// Obtener parcelas sin polígono definido
export async function getParcelsWithoutPolygon() {
  const db = await getDb();
  if (!db) return [];
  
  const { sql } = await import("drizzle-orm");
  
  // Obtener códigos de parcela de cajas que no tienen polígono en la tabla parcels
  // Excluir cajas archivadas
  const result = await db.execute(sql`
    SELECT DISTINCT b.parcelCode 
    FROM boxes b 
    LEFT JOIN parcels p ON b.parcelCode = p.code 
    WHERE (p.polygon IS NULL OR p.polygon = '' OR p.id IS NULL)
    AND b.archived = 0
  `);
  
  return (result[0] as any[]).map(r => r.parcelCode);
}

// Obtener parcelas con polígono definido (para el selector)
export async function getParcelsWithPolygon() {
  const db = await getDb();
  if (!db) return [];
  
  const { sql } = await import("drizzle-orm");
  
  const result = await db.execute(sql`
    SELECT code, name 
    FROM parcels 
    WHERE polygon IS NOT NULL AND polygon != '' AND isActive = 1
    ORDER BY code
  `);
  
  return (result[0] as any[]).map(r => ({ code: r.code, name: r.name }));
}

// Endpoint para editor de cajas con paginación y filtros de errores
export async function getBoxesForEditor(params: {
  page: number;
  pageSize: number;
  search?: string;
  filterError?: 'all' | 'duplicates' | 'no_polygon' | 'overweight';
  duplicateCodes?: string[];
  parcelsWithoutPolygon?: string[];
  sortBy?: 'boxCode' | 'parcelCode' | 'parcelName' | 'harvesterId' | 'weight' | 'submissionTime';
  sortOrder?: 'asc' | 'desc';
}) {
  const db = await getDb();
  if (!db) return { boxes: [], total: 0, page: params.page, pageSize: params.pageSize, totalPages: 0 };
  
  const { desc, asc, and, like, count, inArray, eq } = await import("drizzle-orm");
  const offset = (params.page - 1) * params.pageSize;
  
  // Construir condiciones de filtro
  const conditions = [];
  
  // Siempre excluir cajas archivadas
  conditions.push(eq(boxes.archived, false));
  
  // Búsqueda por código de caja
  if (params.search && params.search.trim() !== '') {
    conditions.push(like(boxes.boxCode, `%${params.search.trim()}%`));
  }
  
  // Filtro de errores
  if (params.filterError === 'duplicates' && params.duplicateCodes && params.duplicateCodes.length > 0) {
    conditions.push(inArray(boxes.boxCode, params.duplicateCodes));
  } else if (params.filterError === 'no_polygon' && params.parcelsWithoutPolygon && params.parcelsWithoutPolygon.length > 0) {
    conditions.push(inArray(boxes.parcelCode, params.parcelsWithoutPolygon));
  } else if (params.filterError === 'overweight') {
    const { gt } = await import("drizzle-orm");
    conditions.push(gt(boxes.weight, 15000)); // > 15 kg
  }
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  // Obtener total de registros
  const totalResult = await db.select({ count: count() })
    .from(boxes)
    .where(whereClause);
  const total = totalResult[0]?.count || 0;
  
  // Determinar columna y orden de ordenamiento
  const sortColumn = params.sortBy || 'submissionTime';
  const sortFn = params.sortOrder === 'asc' ? asc : desc;
  
  const columnMap = {
    boxCode: boxes.boxCode,
    parcelCode: boxes.parcelCode,
    parcelName: boxes.parcelName,
    harvesterId: boxes.harvesterId,
    weight: boxes.weight,
    submissionTime: boxes.submissionTime,
  };
  
  const orderByColumn = columnMap[sortColumn] || boxes.submissionTime;
  
  // Obtener página de datos
  const data = await db.select({
    id: boxes.id,
    boxCode: boxes.boxCode,
    harvesterId: boxes.harvesterId,
    parcelCode: boxes.parcelCode,
    parcelName: boxes.parcelName,
    weight: boxes.weight,
    photoUrl: boxes.photoUrl,
    photoFilename: boxes.photoFilename,
    submissionTime: boxes.submissionTime,
    latitude: boxes.latitude,
    longitude: boxes.longitude,
  })
    .from(boxes)
    .where(whereClause)
    .orderBy(sortFn(orderByColumn))
    .limit(params.pageSize)
    .offset(offset);
  
  return {
    boxes: data,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.ceil(total / params.pageSize),
  };
}


// Archivar una caja (en lugar de eliminar)
export async function archiveBox(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(boxes).set({ 
    archived: true, 
    archivedAt: new Date(),
    updatedAt: new Date() 
  }).where(eq(boxes.id, id));
}

// Archivar múltiples cajas
export async function archiveBoxesBatch(boxIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { inArray } = await import("drizzle-orm");
  
  await db.update(boxes).set({ 
    archived: true, 
    archivedAt: new Date(),
    updatedAt: new Date() 
  }).where(inArray(boxes.id, boxIds));
  
  return { archived: boxIds.length };
}

// Restaurar una caja archivada
export async function restoreBox(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(boxes).set({ 
    archived: false, 
    archivedAt: null,
    updatedAt: new Date() 
  }).where(eq(boxes.id, id));
}

// Obtener cajas archivadas (para vista de archivo)
export async function getArchivedBoxes(params: {
  page: number;
  pageSize: number;
  search?: string;
}) {
  const db = await getDb();
  if (!db) return { boxes: [], total: 0, page: params.page, pageSize: params.pageSize, totalPages: 0 };
  
  const { desc, and, eq, count, like } = await import("drizzle-orm");
  const offset = (params.page - 1) * params.pageSize;
  
  const conditions = [eq(boxes.archived, true)];
  
  if (params.search && params.search.trim() !== '') {
    conditions.push(like(boxes.boxCode, `%${params.search.trim()}%`));
  }
  
  const whereClause = and(...conditions);
  
  const totalResult = await db.select({ count: count() })
    .from(boxes)
    .where(whereClause);
  const total = totalResult[0]?.count || 0;
  
  const data = await db.select({
    id: boxes.id,
    boxCode: boxes.boxCode,
    harvesterId: boxes.harvesterId,
    parcelCode: boxes.parcelCode,
    parcelName: boxes.parcelName,
    weight: boxes.weight,
    photoUrl: boxes.photoUrl,
    submissionTime: boxes.submissionTime,
    archivedAt: boxes.archivedAt,
  })
    .from(boxes)
    .where(whereClause)
    .orderBy(desc(boxes.archivedAt))
    .limit(params.pageSize)
    .offset(offset);
  
  return {
    boxes: data,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.ceil(total / params.pageSize),
  };
}

// Actualizar código de caja (marca como editada manualmente)
export async function updateBoxCode(id: number, newBoxCode: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Obtener código original antes de editar
  const currentBox = await db.select().from(boxes).where(eq(boxes.id, id)).limit(1);
  const originalCode = currentBox[0]?.originalBoxCode || currentBox[0]?.boxCode || null;
  
  await db.update(boxes).set({ 
    boxCode: newBoxCode,
    manuallyEdited: true,
    editedAt: new Date(),
    originalBoxCode: originalCode,
    updatedAt: new Date() 
  }).where(eq(boxes.id, id));
}


// ==========================================
// ESTADÍSTICAS AGREGADAS (para Dashboard optimizado)
// ==========================================

// Estadísticas generales: totales, pesos, calidades
export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return null;
  
  const { sql } = await import("drizzle-orm");
  
  const result = await db.execute(sql`
    SELECT 
      COUNT(*) as total,
      SUM(weight) as totalWeight,
      COUNT(CASE WHEN harvesterId NOT IN (98, 99) THEN 1 END) as firstQuality,
      COUNT(CASE WHEN harvesterId = 98 THEN 1 END) as secondQuality,
      COUNT(CASE WHEN harvesterId = 99 THEN 1 END) as waste,
      SUM(CASE WHEN harvesterId NOT IN (98, 99) THEN weight ELSE 0 END) as firstQualityWeight,
      SUM(CASE WHEN harvesterId = 98 THEN weight ELSE 0 END) as secondQualityWeight,
      SUM(CASE WHEN harvesterId = 99 THEN weight ELSE 0 END) as wasteWeight,
      MIN(submissionTime) as firstDate,
      MAX(submissionTime) as lastDate
    FROM boxes 
    WHERE archived = 0
  `);
  
  const row = (result[0] as unknown as any[])[0];
  if (!row || row.total === 0) return null;
  
  const total = Number(row.total);
  return {
    total,
    totalWeight: Number(row.totalWeight) / 1000,
    firstQuality: Number(row.firstQuality),
    secondQuality: Number(row.secondQuality),
    waste: Number(row.waste),
    firstQualityWeight: Number(row.firstQualityWeight) / 1000,
    secondQualityWeight: Number(row.secondQualityWeight) / 1000,
    wasteWeight: Number(row.wasteWeight) / 1000,
    firstQualityPercent: total > 0 ? Number((Number(row.firstQuality) / total * 100).toFixed(1)) : 0,
    secondQualityPercent: total > 0 ? Number((Number(row.secondQuality) / total * 100).toFixed(1)) : 0,
    wastePercent: total > 0 ? Number((Number(row.waste) / total * 100).toFixed(1)) : 0,
    firstDate: row.firstDate ? new Date(row.firstDate).toISOString().split('T')[0] : null,
    lastDate: row.lastDate ? new Date(row.lastDate).toISOString().split('T')[0] : null,
  };
}

// Datos diarios agregados para gráfica de evolución (GROUP BY fecha)
export async function getDailyChartData(month?: string) {
  const db = await getDb();
  if (!db) return [];
  
  const { sql } = await import("drizzle-orm");
  
  let dateFilter = sql``;
  if (month && month !== 'all') {
    const [year, m] = month.split('-').map(Number);
    const startDate = `${year}-${String(m).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(m).padStart(2, '0')}-31`;
    dateFilter = sql` AND DATE(submissionTime) >= ${startDate} AND DATE(submissionTime) <= ${endDate}`;
  }
  
  const result = await db.execute(sql`
    SELECT 
      DATE(submissionTime) as date,
      COUNT(*) as totalBoxes,
      SUM(CASE WHEN harvesterId NOT IN (98, 99) THEN weight ELSE 0 END) / 1000 as primera,
      SUM(CASE WHEN harvesterId = 98 THEN weight ELSE 0 END) / 1000 as segunda,
      SUM(CASE WHEN harvesterId = 99 THEN weight ELSE 0 END) / 1000 as desperdicio,
      SUM(weight) / 1000 as totalWeight,
      SUM(CASE WHEN harvesterId NOT IN (98, 99) THEN weight ELSE 0 END) / 1000 as firstQualityWeight
    FROM boxes 
    WHERE archived = 0 ${dateFilter}
    GROUP BY DATE(submissionTime)
    ORDER BY DATE(submissionTime) ASC
  `);
  
  return (result[0] as unknown as any[]).map(row => ({
    date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
    totalBoxes: Number(row.totalBoxes),
    primera: Number(Number(row.primera).toFixed(2)),
    segunda: Number(Number(row.segunda).toFixed(2)),
    desperdicio: Number(Number(row.desperdicio).toFixed(2)),
    totalWeight: Number(Number(row.totalWeight).toFixed(2)),
    firstQualityWeight: Number(Number(row.firstQualityWeight).toFixed(2)),
  }));
}

// Obtener meses disponibles con datos de cosecha
export async function getAvailableMonths() {
  const db = await getDb();
  if (!db) return [];
  
  const { sql } = await import("drizzle-orm");
  
  const result = await db.execute(sql`
    SELECT DISTINCT DATE_FORMAT(submissionTime, '%Y-%m') as month
    FROM boxes 
    WHERE archived = 0
    ORDER BY month DESC
  `);
  
  return (result[0] as unknown as any[]).map(row => String(row.month));
}

// Obtener últimas N cajas con fotos (para el carrusel de imágenes)
export async function getRecentBoxesWithPhotos(limit: number = 5) {
  const db = await getDb();
  if (!db) return [];
  
  const { desc, eq, and, isNotNull } = await import("drizzle-orm");
  
  return await db.select({
    id: boxes.id,
    boxCode: boxes.boxCode,
    harvesterId: boxes.harvesterId,
    parcelCode: boxes.parcelCode,
    parcelName: boxes.parcelName,
    weight: boxes.weight,
    photoUrl: boxes.photoUrl,
    photoLargeUrl: boxes.photoLargeUrl,
    submissionTime: boxes.submissionTime,
  })
    .from(boxes)
    .where(and(eq(boxes.archived, false), isNotNull(boxes.photoUrl)))
    .orderBy(desc(boxes.submissionTime))
    .limit(limit);
}

// Obtener datos de cosecha agrupados por día para correlación con clima
// OPTIMIZADO: Solo campos mínimos, usa harvesterId para calidad, índice en submissionTime
export async function getHarvestByDay() {
  const db = await getDb();
  if (!db) return [];
  
  const { sql } = await import("drizzle-orm");
  
  const result = await db.execute(sql`
    SELECT 
      DATE(submissionTime) as date,
      COUNT(*) as boxes,
      COALESCE(SUM(weight), 0) as totalWeight,
      SUM(CASE WHEN harvesterId NOT IN (98, 99) THEN 1 ELSE 0 END) as firstQuality,
      SUM(CASE WHEN harvesterId = 98 THEN 1 ELSE 0 END) as secondQuality,
      SUM(CASE WHEN harvesterId = 99 THEN 1 ELSE 0 END) as waste,
      COALESCE(SUM(CASE WHEN harvesterId NOT IN (98, 99) THEN weight ELSE 0 END), 0) as firstQualityWeight,
      COALESCE(SUM(CASE WHEN harvesterId = 98 THEN weight ELSE 0 END), 0) as secondQualityWeight,
      COALESCE(SUM(CASE WHEN harvesterId = 99 THEN weight ELSE 0 END), 0) as wasteWeight
    FROM boxes 
    WHERE archived = 0
    GROUP BY DATE(submissionTime)
    HAVING COUNT(*) > 0
    ORDER BY date ASC
  `);
  
  return (result[0] as unknown as any[]).map(row => ({
    date: String(row.date).split('T')[0],
    boxes: Number(row.boxes),
    totalWeight: Number(row.totalWeight),
    firstQuality: Number(row.firstQuality),
    secondQuality: Number(row.secondQuality || 0),
    waste: Number(row.waste || 0),
    firstQualityWeight: Number(row.firstQualityWeight || 0),
    secondQualityWeight: Number(row.secondQualityWeight || 0),
    wasteWeight: Number(row.wasteWeight || 0),
  }));
}

// Obtener la fecha de inicio de cosecha (primera caja registrada)
export async function getHarvestStartDate() {
  const db = await getDb();
  if (!db) return null;
  
  const { sql } = await import("drizzle-orm");
  
  const result = await db.execute(sql`
    SELECT MIN(DATE(submissionTime)) as startDate
    FROM boxes 
    WHERE archived = 0
  `);
  
  const rows = result[0] as unknown as any[];
  if (rows.length === 0 || !rows[0].startDate) return null;
  return String(rows[0].startDate).split('T')[0];
}


// ==========================================
// AUTO-RESOLUCIÓN DE DUPLICADOS
// ==========================================

/**
 * Auto-resolver códigos de caja duplicados:
 * 1. Si un código se repite en DÍAS DISTINTOS → agregar "1" al final del código más nuevo
 * 2. Si un código se repite con <10 min de diferencia → archivar la más nueva O la de menor peso
 * 
 * Retorna un resumen de las acciones realizadas.
 */
export async function autoResolveDuplicates() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { sql } = await import("drizzle-orm");
  
  const renamed: { id: number; oldCode: string; newCode: string; reason: string }[] = [];
  const archived: { id: number; code: string; reason: string }[] = [];
  
  // 1. Obtener todos los códigos duplicados (no archivados)
  const duplicateResult = await db.execute(sql`
    SELECT boxCode, COUNT(*) as cnt 
    FROM boxes 
    WHERE archived = 0
    GROUP BY boxCode 
    HAVING COUNT(*) > 1
  `);
  
  const duplicateCodes = (duplicateResult[0] as unknown as any[]).map(r => r.boxCode);
  
  if (duplicateCodes.length === 0) {
    return { renamed, archived, message: "No se encontraron duplicados para resolver." };
  }
  
  // 2. Para cada código duplicado, obtener todas las cajas con ese código
  for (const code of duplicateCodes) {
    const boxesResult = await db.execute(sql`
      SELECT id, boxCode, weight, submissionTime, manuallyEdited
      FROM boxes 
      WHERE boxCode = ${code} AND archived = 0
      ORDER BY submissionTime ASC
    `);
    
    const dupes = (boxesResult[0] as unknown as any[]);
    if (dupes.length < 2) continue;
    
    // Agrupar por día (YYYY-MM-DD)
    const byDay: Map<string, any[]> = new Map();
    for (const box of dupes) {
      const day = new Date(box.submissionTime).toISOString().split('T')[0];
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(box);
    }
    
    const days = Array.from(byDay.keys()).sort();
    
    if (days.length > 1) {
      // === CASO 1: Código repetido en DÍAS DISTINTOS ===
      // Renombrar las cajas de los días posteriores agregando "1" al final
      // Mantener el primer día sin cambios
      for (let i = 1; i < days.length; i++) {
        const dayBoxes = byDay.get(days[i])!;
        for (const box of dayBoxes) {
          // No renombrar cajas editadas manualmente
          if (box.manuallyEdited) continue;
          
          // Generar nuevo código: agregar "1" al final
          let newCode = box.boxCode + "1";
          
          // Verificar que el nuevo código no exista ya
          const existsResult = await db.execute(sql`
            SELECT COUNT(*) as cnt FROM boxes WHERE boxCode = ${newCode} AND archived = 0
          `);
          const exists = (existsResult[0] as unknown as any[])[0]?.cnt > 0;
          if (exists) {
            // Si ya existe, agregar "2", "3", etc.
            let suffix = 2;
            while (true) {
              newCode = box.boxCode + String(suffix);
              const checkResult = await db.execute(sql`
                SELECT COUNT(*) as cnt FROM boxes WHERE boxCode = ${newCode} AND archived = 0
              `);
              if ((checkResult[0] as unknown as any[])[0]?.cnt === 0) break;
              suffix++;
              if (suffix > 9) break; // Seguridad
            }
          }
          
          // Renombrar la caja
          await db.execute(sql`
            UPDATE boxes 
            SET boxCode = ${newCode}, 
                originalBoxCode = COALESCE(originalBoxCode, ${box.boxCode}),
                updatedAt = NOW()
            WHERE id = ${box.id}
          `);
          
          renamed.push({
            id: box.id,
            oldCode: box.boxCode,
            newCode,
            reason: `Código repetido en día distinto (${days[0]} vs ${days[i]})`
          });
        }
      }
    } else {
      // === CASO 2: Código repetido en el MISMO DÍA ===
      // Verificar si están a menos de 10 minutos
      const dayBoxes = byDay.get(days[0])!;
      
      // Ordenar por submissionTime
      dayBoxes.sort((a: any, b: any) => new Date(a.submissionTime).getTime() - new Date(b.submissionTime).getTime());
      
      // Comparar pares consecutivos
      const toArchive: Set<number> = new Set();
      
      for (let i = 0; i < dayBoxes.length - 1; i++) {
        for (let j = i + 1; j < dayBoxes.length; j++) {
          const timeA = new Date(dayBoxes[i].submissionTime).getTime();
          const timeB = new Date(dayBoxes[j].submissionTime).getTime();
          const diffMinutes = Math.abs(timeB - timeA) / (1000 * 60);
          
          if (diffMinutes < 10) {
            // Archivar la más nueva O la de menor peso
            // Prioridad: archivar la de menor peso; si pesan igual, archivar la más nueva
            const weightA = Number(dayBoxes[i].weight);
            const weightB = Number(dayBoxes[j].weight);
            
            let archiveId: number;
            if (weightA < weightB) {
              archiveId = dayBoxes[i].id;
            } else if (weightB < weightA) {
              archiveId = dayBoxes[j].id;
            } else {
              // Mismo peso: archivar la más nueva (j es más nueva)
              archiveId = dayBoxes[j].id;
            }
            
            // No archivar cajas editadas manualmente
            const archiveBox = dayBoxes.find((b: any) => b.id === archiveId);
            if (archiveBox && !archiveBox.manuallyEdited) {
              toArchive.add(archiveId);
            }
          }
        }
      }
      
      // Ejecutar archivado
      for (const archiveId of Array.from(toArchive)) {
        const box = dayBoxes.find((b: any) => b.id === archiveId);
        if (!box) continue;
        
        await db.execute(sql`
          UPDATE boxes 
          SET archived = 1, archivedAt = NOW(), updatedAt = NOW()
          WHERE id = ${archiveId}
        `);
        
        archived.push({
          id: archiveId,
          code: box.boxCode,
          reason: `Duplicado cercano (<10 min) en el mismo día - peso: ${(Number(box.weight) / 1000).toFixed(2)} kg`
        });
      }
    }
  }
  
  const message = `Auto-resolución completada: ${renamed.length} renombradas, ${archived.length} archivadas.`;
  console.log(`🔧 ${message}`);
  
  return { renamed, archived, message };
}


// ============================================================
// Funciones de Gestión de Usuarios (eliminar, contraseña, perfil, logs)
// ============================================================

/**
 * Eliminar un usuario por ID (no permite eliminar al propio admin)
 */
export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Primero eliminar logs de actividad del usuario
  await db.delete(userActivityLogs).where(eq(userActivityLogs.userId, userId));
  // Luego eliminar el usuario
  await db.delete(users).where(eq(users.id, userId));
}

/**
 * Cambiar la contraseña de un usuario (admin o el propio usuario)
 */
export async function changeUserPassword(userId: number, hashedPassword: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set({ 
    password: hashedPassword, 
    updatedAt: new Date() 
  }).where(eq(users.id, userId));
}

/**
 * Actualizar perfil de usuario (nombre, bio, teléfono, avatar)
 */
export async function updateUserProfile(userId: number, data: {
  name?: string;
  bio?: string | null;
  phone?: string | null;
  avatarColor?: string;
  avatarEmoji?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.bio !== undefined) updateData.bio = data.bio;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.avatarColor !== undefined) updateData.avatarColor = data.avatarColor;
  if (data.avatarEmoji !== undefined) updateData.avatarEmoji = data.avatarEmoji;
  
  await db.update(users).set(updateData).where(eq(users.id, userId));
}

// ============================================================
// Funciones de Logs de Actividad
// ============================================================

/**
 * Registrar una actividad de usuario
 */
export async function logUserActivity(data: {
  userId: number;
  action: "login" | "logout" | "page_view" | "page_leave";
  page?: string;
  pageName?: string;
  sessionId?: string;
  durationSeconds?: number;
  ipAddress?: string;
  userAgent?: string;
}) {
  const db = await getDb();
  if (!db) return;
  
  try {
    await db.insert(userActivityLogs).values({
      userId: data.userId,
      action: data.action,
      page: data.page || null,
      pageName: data.pageName || null,
      sessionId: data.sessionId || null,
      durationSeconds: data.durationSeconds || null,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
    });
  } catch (err) {
    console.error("[DB] Error al registrar actividad:", err);
  }
}

/**
 * Obtener logs de actividad de un usuario específico
 */
export async function getUserActivityLogs(userId: number, limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  
  const { sql, desc } = await import("drizzle-orm");
  
  const result = await db.select()
    .from(userActivityLogs)
    .where(eq(userActivityLogs.userId, userId))
    .orderBy(desc(userActivityLogs.createdAt))
    .limit(limit);
  
  return result;
}

/**
 * Obtener todos los logs de actividad (admin)
 */
export async function getAllActivityLogs(limit: number = 200) {
  const db = await getDb();
  if (!db) return [];
  
  const { sql, desc } = await import("drizzle-orm");
  
  const result = await db.execute(sql`
    SELECT 
      l.*,
      u.name as userName,
      u.email as userEmail,
      u.avatarColor,
      u.avatarEmoji
    FROM userActivityLogs l
    LEFT JOIN users u ON l.userId = u.id
    ORDER BY l.createdAt DESC
    LIMIT ${limit}
  `);
  
  return (result[0] as unknown as any[]);
}

/**
 * Obtener resumen de actividad por usuario (admin)
 */
export async function getUserActivitySummary() {
  const db = await getDb();
  if (!db) return [];
  
  const { sql } = await import("drizzle-orm");
  
  const result = await db.execute(sql`
    SELECT 
      u.id,
      u.name,
      u.email,
      u.role,
      u.avatarColor,
      u.avatarEmoji,
      u.lastSignedIn,
      COUNT(CASE WHEN l.action = 'login' THEN 1 END) as totalLogins,
      COUNT(CASE WHEN l.action = 'page_view' THEN 1 END) as totalPageViews,
      COALESCE(SUM(CASE WHEN l.action = 'page_leave' THEN l.durationSeconds ELSE 0 END), 0) as totalDurationSeconds,
      MAX(l.createdAt) as lastActivity,
      (SELECT l2.page FROM userActivityLogs l2 WHERE l2.userId = u.id AND l2.action = 'page_view' ORDER BY l2.createdAt DESC LIMIT 1) as lastPage
    FROM users u
    LEFT JOIN userActivityLogs l ON u.id = l.userId
    GROUP BY u.id
    ORDER BY lastActivity DESC
  `);
  
  return (result[0] as unknown as any[]);
}

/**
 * Obtener las páginas más visitadas por un usuario
 */
export async function getUserTopPages(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { sql } = await import("drizzle-orm");
  
  const result = await db.execute(sql`
    SELECT 
      page,
      pageName,
      COUNT(*) as visits,
      COALESCE(SUM(durationSeconds), 0) as totalDuration,
      COALESCE(AVG(durationSeconds), 0) as avgDuration,
      MAX(createdAt) as lastVisit
    FROM userActivityLogs
    WHERE userId = ${userId} AND action = 'page_view' AND page IS NOT NULL
    GROUP BY page, pageName
    ORDER BY visits DESC
  `);
  
  return (result[0] as unknown as any[]);
}

/**
 * Limpiar logs antiguos (más de 90 días)
 */
export async function cleanOldActivityLogs() {
  const db = await getDb();
  if (!db) return 0;
  
  const { sql } = await import("drizzle-orm");
  
  const result = await db.execute(sql`
    DELETE FROM userActivityLogs 
    WHERE createdAt < DATE_SUB(NOW(), INTERVAL 90 DAY)
  `);
  
  return (result[0] as any).affectedRows || 0;
}
