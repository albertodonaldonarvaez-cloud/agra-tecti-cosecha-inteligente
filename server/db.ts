import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, apiConfig, harvesters, boxes, InsertBox } from "../drizzle/schema";
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
  // Usar nombres de columnas en camelCase
  const datesResult = await db.execute(sql`
    SELECT DISTINCT DATE(submissionTime) as date 
    FROM boxes 
    WHERE submissionTime >= DATE_SUB(NOW(), INTERVAL 60 DAY)
    ORDER BY date DESC
  `);
  
  // Obtener parcelas únicas
  const parcelsResult = await db.execute(sql`
    SELECT DISTINCT parcelCode as code, parcelName as name 
    FROM boxes 
    WHERE parcelCode IS NOT NULL AND parcelCode != ''
    ORDER BY parcelCode
  `);
  
  // Obtener cortadoras únicas
  const harvestersResult = await db.execute(sql`
    SELECT DISTINCT harvesterId as id 
    FROM boxes 
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
  
  let query = db.select().from(boxes);
  
  if (startDate && endDate) {
    const { and, gte, lte } = await import("drizzle-orm");
    query = query.where(
      and(
        gte(boxes.submissionTime, new Date(startDate)),
        lte(boxes.submissionTime, new Date(endDate))
      )
    ) as any;
  } else if (startDate) {
    const { gte } = await import("drizzle-orm");
    query = query.where(gte(boxes.submissionTime, new Date(startDate))) as any;
  } else if (endDate) {
    const { lte } = await import("drizzle-orm");
    query = query.where(lte(boxes.submissionTime, new Date(endDate))) as any;
  }
  
  const { desc } = await import("drizzle-orm");
  return await query.orderBy(desc(boxes.submissionTime));
}

export async function getAvailableDates() {
  const db = await getDb();
  if (!db) return [];
  
  const allBoxes = await db.select({
    submissionTime: boxes.submissionTime
  }).from(boxes);
  
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

// Actualizar código de caja
export async function updateBoxCode(id: number, newBoxCode: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(boxes).set({ 
    boxCode: newBoxCode,
    updatedAt: new Date() 
  }).where(eq(boxes.id, id));
}
