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
  const { desc } = await import("drizzle-orm");
  // Seleccionar solo campos necesarios para mejor rendimiento
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
  }).from(boxes).orderBy(desc(boxes.submissionTime));
}

// Paginación optimizada para carga rápida
export async function getBoxesPaginated(params: {
  page: number;
  pageSize: number;
  filterDate?: string;
  filterParcel?: string;
  filterHarvester?: number;
}) {
  const db = await getDb();
  if (!db) return { boxes: [], total: 0, page: params.page, pageSize: params.pageSize, totalPages: 0 };
  
  const { desc, sql, and, eq, gte, lt, count } = await import("drizzle-orm");
  const offset = (params.page - 1) * params.pageSize;
  
  // Construir condiciones de filtro
  const conditions = [];
  
  if (params.filterDate) {
    // Filtrar por fecha (formato YYYY-MM-DD)
    const startDate = new Date(params.filterDate);
    const endDate = new Date(params.filterDate);
    endDate.setDate(endDate.getDate() + 1);
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
  
  // Obtener fechas únicas (solo los últimos 30 días para rapidez)
  const datesResult = await db.execute(sql`
    SELECT DISTINCT DATE(submission_time) as date 
    FROM boxes 
    WHERE submission_time >= DATE_SUB(NOW(), INTERVAL 60 DAY)
    ORDER BY date DESC
  `);
  
  // Obtener parcelas únicas
  const parcelsResult = await db.execute(sql`
    SELECT DISTINCT parcel_code as code, parcel_name as name 
    FROM boxes 
    WHERE parcel_code IS NOT NULL AND parcel_code != ''
    ORDER BY parcel_code
  `);
  
  // Obtener cortadoras únicas
  const harvestersResult = await db.execute(sql`
    SELECT DISTINCT harvester_id as id 
    FROM boxes 
    ORDER BY harvester_id
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

export async function updateUserPermissions(userId: number, permissions: {
  canViewDashboard: boolean;
  canViewBoxes: boolean;
  canViewAnalytics: boolean;
  canViewDailyAnalysis: boolean;
  canViewParcels: boolean;
  canViewHarvesters: boolean;
  canViewErrors: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ ...permissions, updatedAt: new Date() }).where(eq(users.id, userId));
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
