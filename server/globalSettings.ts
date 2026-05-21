import { getDb } from "./db";
import { apiConfig } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Módulo de configuraciones globales.
 * Lee/escribe settings desde la tabla apiConfig (fila única).
 * 
 * Mapea claves lógicas a columnas reales de apiConfig.
 * Esto arregla el import dinámico que ya existía en telegramFieldNotesBot.ts
 */

// Mapeo de claves lógicas → columnas de apiConfig
const COLUMN_MAP: Record<string, string> = {
  telegramBotToken: "telegramBotToken",
  telegramChatId: "telegramChatId",
  telegramGroupChatId: "telegramFieldNotesChatId",
  telegramHarvestChatId: "telegramHarvestChatId",
  copernicusClientId: "copernicusClientId",
  copernicusClientSecret: "copernicusClientSecret",
};

/**
 * Obtiene un setting global de la tabla apiConfig.
 */
export async function getGlobalSetting(key: string): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const columnName = COLUMN_MAP[key] || key;
    const rows = await db.execute(
      sql.raw(`SELECT \`${columnName}\` as val FROM apiConfig LIMIT 1`)
    );

    // drizzle execute retorna [rows, fields]
    const result = (rows as any)?.[0]?.[0] || (rows as any)?.[0];
    if (!result) return null;
    return result.val || null;
  } catch (error) {
    console.error(`[GlobalSettings] Error obteniendo '${key}':`, error);
    return null;
  }
}

/**
 * Guarda un setting global en la tabla apiConfig.
 */
export async function setGlobalSetting(key: string, value: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const columnName = COLUMN_MAP[key] || key;
    await db.execute(
      sql.raw(`UPDATE apiConfig SET \`${columnName}\` = '${value.replace(/'/g, "''")}'`)
    );
  } catch (error) {
    console.error(`[GlobalSettings] Error guardando '${key}':`, error);
    throw error;
  }
}
