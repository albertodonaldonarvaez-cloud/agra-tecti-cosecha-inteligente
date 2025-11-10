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
  return await db.select().from(boxes).orderBy(boxes.submissionTime);
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
  
  return await query.orderBy(boxes.submissionTime);
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
