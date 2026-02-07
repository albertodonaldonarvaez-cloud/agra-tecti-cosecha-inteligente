import { getDb } from "./db";
import { boxes, parcels } from "../drizzle/schema";
import { eq, gt, and, isNull, sql } from "drizzle-orm";

// ============================================================
// Módulo de Notificaciones por Telegram
// Envía resúmenes de sincronización y errores al chat configurado
// ============================================================

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

interface SyncSummary {
  trigger: string; // "auto", "manual", "startup"
  processedCount: number;
  totalCount: number;
  errors: string[];
}

interface DatabaseIssues {
  duplicateBoxes: { boxCode: string; count: number }[];
  heavyBoxes: { boxCode: string; weight: number; parcelName: string }[];
  parcelsWithoutPolygon: { code: string; name: string; boxCount: number }[];
  totalDuplicates: number;
  totalHeavy: number;
  totalNoPolygon: number;
}

/**
 * Obtiene la configuración de Telegram desde la BD
 */
export async function getTelegramConfig(): Promise<TelegramConfig | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.execute(
      sql`SELECT telegramBotToken, telegramChatId FROM apiConfig LIMIT 1`
    );
    const rows = result[0] as any[];
    if (rows && rows.length > 0 && rows[0].telegramBotToken && rows[0].telegramChatId) {
      return {
        botToken: rows[0].telegramBotToken,
        chatId: rows[0].telegramChatId,
      };
    }
  } catch (error) {
    console.error("[Telegram] Error al obtener configuración:", error);
  }
  return null;
}

/**
 * Envía un mensaje por Telegram
 */
async function sendTelegramMessage(config: TelegramConfig, message: string): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`[Telegram] Error al enviar mensaje: ${response.status} - ${errorData}`);
      return false;
    }

    console.log("[Telegram] Mensaje enviado correctamente");
    return true;
  } catch (error: any) {
    console.error(`[Telegram] Error de conexión: ${error.message}`);
    return false;
  }
}

/**
 * Analiza los problemas actuales en la base de datos
 */
async function getDatabaseIssues(): Promise<DatabaseIssues | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    // 1. Códigos de caja duplicados (mismo código, diferente fecha, no archivados)
    const duplicatesResult = await db.execute(sql`
      SELECT boxCode, COUNT(*) as cnt 
      FROM boxes 
      WHERE archived = 0 AND manuallyEdited = 0
      GROUP BY boxCode 
      HAVING cnt > 1 
      ORDER BY cnt DESC 
      LIMIT 10
    `);
    const duplicateBoxes = (duplicatesResult[0] as any[]).map((r: any) => ({
      boxCode: r.boxCode,
      count: Number(r.cnt),
    }));
    
    // Total de duplicados
    const totalDupResult = await db.execute(sql`
      SELECT COUNT(*) as total FROM (
        SELECT boxCode FROM boxes 
        WHERE archived = 0 AND manuallyEdited = 0
        GROUP BY boxCode HAVING COUNT(*) > 1
      ) as dups
    `);
    const totalDuplicates = Number((totalDupResult[0] as any[])[0]?.total || 0);

    // 2. Cajas con peso mayor a 15 kg (no archivadas)
    const heavyResult = await db.execute(sql`
      SELECT boxCode, weight, parcelName 
      FROM boxes 
      WHERE weight > 15000 AND archived = 0 
      ORDER BY weight DESC 
      LIMIT 10
    `);
    const heavyBoxes = (heavyResult[0] as any[]).map((r: any) => ({
      boxCode: r.boxCode,
      weight: Number(r.weight) / 1000,
      parcelName: r.parcelName,
    }));

    const totalHeavyResult = await db.execute(sql`
      SELECT COUNT(*) as total FROM boxes WHERE weight > 15000 AND archived = 0
    `);
    const totalHeavy = Number((totalHeavyResult[0] as any[])[0]?.total || 0);

    // 3. Parcelas sin polígono que tienen cajas
    const noPolygonResult = await db.execute(sql`
      SELECT p.code, p.name, COUNT(b.id) as boxCount
      FROM parcels p
      INNER JOIN boxes b ON b.parcelCode = p.code AND b.archived = 0
      WHERE (p.polygon IS NULL OR p.polygon = '' OR p.polygon = '[]')
      GROUP BY p.code, p.name
      ORDER BY boxCount DESC
      LIMIT 10
    `);
    const parcelsWithoutPolygon = (noPolygonResult[0] as any[]).map((r: any) => ({
      code: r.code,
      name: r.name,
      boxCount: Number(r.boxCount),
    }));

    const totalNoPolyResult = await db.execute(sql`
      SELECT COUNT(DISTINCT p.code) as total
      FROM parcels p
      INNER JOIN boxes b ON b.parcelCode = p.code AND b.archived = 0
      WHERE (p.polygon IS NULL OR p.polygon = '' OR p.polygon = '[]')
    `);
    const totalNoPolygon = Number((totalNoPolyResult[0] as any[])[0]?.total || 0);

    return {
      duplicateBoxes,
      heavyBoxes,
      parcelsWithoutPolygon,
      totalDuplicates,
      totalHeavy,
      totalNoPolygon,
    };
  } catch (error) {
    console.error("[Telegram] Error al analizar BD:", error);
    return null;
  }
}

/**
 * Construye el mensaje de resumen de sincronización
 */
function buildSyncMessage(summary: SyncSummary, issues: DatabaseIssues | null): string {
  const now = new Date();
  const timeStr = now.toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
  
  let triggerLabel = "Automática";
  if (summary.trigger === "manual") triggerLabel = "Manual";
  if (summary.trigger === "startup") triggerLabel = "Al arrancar";

  let msg = `🌿 <b>AGRA-TECTI - Sincronización ${triggerLabel}</b>\n`;
  msg += `📅 ${timeStr}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Resumen de sincronización
  msg += `📊 <b>Resumen de Sincronización</b>\n`;
  msg += `• Registros en Kobo: ${summary.totalCount}\n`;
  msg += `• Nuevos importados: ${summary.processedCount}\n`;
  msg += `• Omitidos/existentes: ${summary.totalCount - summary.processedCount}\n\n`;

  // Errores de la sincronización actual
  const realErrors = summary.errors.filter(e => 
    !e.startsWith("Ya importado") && 
    !e.startsWith("Omitido") && 
    !e.startsWith("Registro duplicado exacto")
  );
  
  if (realErrors.length > 0) {
    msg += `⚠️ <b>Errores en esta sincronización</b>\n`;
    const maxErrors = Math.min(realErrors.length, 5);
    for (let i = 0; i < maxErrors; i++) {
      msg += `• ${realErrors[i]}\n`;
    }
    if (realErrors.length > 5) {
      msg += `  ... y ${realErrors.length - 5} más\n`;
    }
    msg += `\n`;
  }

  // Estado de la base de datos
  if (issues) {
    const hasIssues = issues.totalDuplicates > 0 || issues.totalHeavy > 0 || issues.totalNoPolygon > 0;
    
    if (hasIssues) {
      msg += `🔍 <b>Estado de la Base de Datos</b>\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    // Duplicados
    if (issues.totalDuplicates > 0) {
      msg += `🔴 <b>Códigos Duplicados: ${issues.totalDuplicates}</b>\n`;
      for (const dup of issues.duplicateBoxes.slice(0, 5)) {
        msg += `  • ${dup.boxCode} (${dup.count}x)\n`;
      }
      if (issues.totalDuplicates > 5) {
        msg += `  ... y ${issues.totalDuplicates - 5} más\n`;
      }
      msg += `\n`;
    }

    // Peso alto
    if (issues.totalHeavy > 0) {
      msg += `🟡 <b>Peso Mayor a 15 kg: ${issues.totalHeavy}</b>\n`;
      for (const heavy of issues.heavyBoxes.slice(0, 5)) {
        msg += `  • ${heavy.boxCode}: ${heavy.weight.toFixed(2)} kg (${heavy.parcelName})\n`;
      }
      if (issues.totalHeavy > 5) {
        msg += `  ... y ${issues.totalHeavy - 5} más\n`;
      }
      msg += `\n`;
    }

    // Parcelas sin polígono
    if (issues.totalNoPolygon > 0) {
      msg += `🟠 <b>Parcelas sin Polígono: ${issues.totalNoPolygon}</b>\n`;
      for (const parcel of issues.parcelsWithoutPolygon.slice(0, 5)) {
        msg += `  • ${parcel.name} (${parcel.code}): ${parcel.boxCount} cajas\n`;
      }
      if (issues.totalNoPolygon > 5) {
        msg += `  ... y ${issues.totalNoPolygon - 5} más\n`;
      }
      msg += `\n`;
    }

    if (!hasIssues) {
      msg += `✅ <b>Sin problemas detectados en la BD</b>\n\n`;
    }
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🤖 AGRA-TECTI Cosecha Inteligente`;

  return msg;
}

/**
 * Envía la notificación de sincronización por Telegram
 * Se llama después de cada sincronización (auto o manual)
 */
export async function sendSyncNotification(summary: SyncSummary): Promise<boolean> {
  const config = await getTelegramConfig();
  if (!config) {
    console.log("[Telegram] No configurado, omitiendo notificación");
    return false;
  }

  const issues = await getDatabaseIssues();
  const message = buildSyncMessage(summary, issues);

  return await sendTelegramMessage(config, message);
}

/**
 * Envía un mensaje de prueba para verificar la configuración
 */
export async function sendTestMessage(botToken: string, chatId: string): Promise<{ success: boolean; error?: string }> {
  const now = new Date();
  const timeStr = now.toLocaleString("es-MX", { timeZone: "America/Mexico_City" });

  const message = `🌿 <b>AGRA-TECTI - Mensaje de Prueba</b>\n` +
    `📅 ${timeStr}\n\n` +
    `✅ La conexión con Telegram funciona correctamente.\n` +
    `Las notificaciones de sincronización se enviarán a este chat.\n\n` +
    `🤖 AGRA-TECTI Cosecha Inteligente`;

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any;
      const errorMsg = errorData.description || `Error HTTP ${response.status}`;
      return { success: false, error: errorMsg };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Error de conexión" };
  }
}
