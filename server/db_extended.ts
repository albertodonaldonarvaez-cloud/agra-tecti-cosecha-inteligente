import { eq, desc, and, gte, lte } from "drizzle-orm";
import { getDb } from "./db";
import { parcels, uploadErrors, uploadBatches, locationConfig, InsertParcel, InsertUploadError, InsertLocationConfig } from "../drizzle/schema";

// ============================================
// FUNCIONES PARA PARCELAS
// ============================================

export async function getAllParcels() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(parcels).orderBy(parcels.code);
}

export async function getActiveParcels() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(parcels).where(eq(parcels.isActive, true)).orderBy(parcels.code);
}

export async function getParcelByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(parcels).where(eq(parcels.code, code)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertParcel(parcel: InsertParcel) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(parcels).values(parcel).onDuplicateKeyUpdate({
    set: {
      name: parcel.name,
      polygon: parcel.polygon,
      isActive: parcel.isActive,
      updatedAt: new Date(),
    },
  });
}

export async function updateParcelPolygon(code: string, polygon: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parcels)
    .set({ polygon, updatedAt: new Date() })
    .where(eq(parcels.code, code));
}

export async function toggleParcelActive(code: string, isActive: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(parcels)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(parcels.code, code));
}

export async function deleteParcel(code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(parcels).where(eq(parcels.code, code));
}

// ============================================
// FUNCIONES PARA ERRORES DE CARGA
// ============================================

export async function getUploadErrorsByBatch(batchId: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(uploadErrors)
    .where(eq(uploadErrors.uploadBatchId, batchId))
    .orderBy(uploadErrors.createdAt);
}

export async function getAllUploadErrors(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(uploadErrors)
    .orderBy(desc(uploadErrors.createdAt))
    .limit(limit);
}

export async function getUnresolvedErrors() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(uploadErrors)
    .where(eq(uploadErrors.resolved, false))
    .orderBy(desc(uploadErrors.createdAt));
}

export async function markErrorAsResolved(errorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(uploadErrors)
    .set({ resolved: true })
    .where(eq(uploadErrors.id, errorId));
}

export async function deleteUploadError(errorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(uploadErrors).where(eq(uploadErrors.id, errorId));
}

export async function clearResolvedErrors() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(uploadErrors).where(eq(uploadErrors.resolved, true));
}

export async function clearAllErrors() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(uploadErrors);
}

export async function insertUploadError(error: InsertUploadError) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(uploadErrors).values(error);
}

// ============================================
// FUNCIONES PARA LOTES DE CARGA
// ============================================

export async function getAllUploadBatches(limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(uploadBatches)
    .orderBy(desc(uploadBatches.createdAt))
    .limit(limit);
}

export async function getUploadBatchById(batchId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(uploadBatches)
    .where(eq(uploadBatches.batchId, batchId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function deleteUploadBatch(batchId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Eliminar errores asociados primero
  await db.delete(uploadErrors).where(eq(uploadErrors.uploadBatchId, batchId));
  
  // Eliminar el lote
  await db.delete(uploadBatches).where(eq(uploadBatches.batchId, batchId));
}

// ============================================
// ESTADÍSTICAS DE ERRORES
// ============================================

export async function getErrorStatsByBatch(batchId: string) {
  const db = await getDb();
  if (!db) return null;
  
  const errors = await getUploadErrorsByBatch(batchId);
  
  const stats = {
    total: errors.length,
    byType: {} as Record<string, number>,
    resolved: 0,
    unresolved: 0,
  };
  
  for (const error of errors) {
    stats.byType[error.errorType] = (stats.byType[error.errorType] || 0) + 1;
    if (error.resolved) {
      stats.resolved++;
    } else {
      stats.unresolved++;
    }
  }
  
  return stats;
}


// ============================================
// FUNCIONES PARA CONFIGURACIÓN DE UBICACIÓN
// ============================================

export async function getLocationConfig() {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(locationConfig).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function upsertLocationConfig(config: InsertLocationConfig) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await getLocationConfig();
  
  if (existing) {
    await db.update(locationConfig)
      .set({
        locationName: config.locationName,
        latitude: config.latitude,
        longitude: config.longitude,
        timezone: config.timezone || "America/Mexico_City",
        updatedAt: new Date(),
      })
      .where(eq(locationConfig.id, existing.id));
  } else {
    await db.insert(locationConfig).values(config);
  }
}
