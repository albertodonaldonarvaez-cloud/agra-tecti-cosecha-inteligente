import { getDb } from "./db";
import { sql } from "drizzle-orm";

// ============================================================
// Notificación de Resumen Diario de Cosecha por Telegram
// Envía un resumen del día anterior a un Chat ID independiente
// NO se envía al arrancar el servidor
// ============================================================

const TIMEZONE = "America/Mexico_City";

interface HarvestConfig {
  botToken: string;
  chatId: string;
  hour: number;
  minute: number;
  enabled: boolean;
}

interface ParcelHarvestSummary {
  parcelCode: string;
  parcelName: string;
  totalBoxes: number;
  totalWeight: number;
  firstQualityWeight: number;
  secondQualityWeight: number;
  wasteWeight: number;
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let lastSentDate: string | null = null;

/**
 * Obtiene la configuración de notificación de cosecha desde la BD
 */
async function getHarvestConfig(): Promise<HarvestConfig | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.execute(
      sql`SELECT telegramBotToken, telegramHarvestChatId, telegramHarvestHour, telegramHarvestMinute, telegramHarvestEnabled FROM apiConfig LIMIT 1`
    );
    const rows = result[0] as any[];
    if (rows && rows.length > 0 && rows[0].telegramBotToken && rows[0].telegramHarvestChatId) {
      return {
        botToken: rows[0].telegramBotToken,
        chatId: rows[0].telegramHarvestChatId,
        hour: Number(rows[0].telegramHarvestHour ?? 7),
        minute: Number(rows[0].telegramHarvestMinute ?? 0),
        enabled: Boolean(rows[0].telegramHarvestEnabled),
      };
    }
  } catch (error) {
    console.error("[HarvestNotifier] Error al obtener configuración:", error);
  }
  return null;
}

/**
 * Obtiene la hora actual en zona horaria de México
 */
function getMexicoTime(date?: Date): { hour: number; minute: number; dateStr: string } {
  const d = date || new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0");
  const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0");

  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateStr = dateFormatter.format(d);

  return { hour, minute, dateStr };
}

/**
 * Obtiene la fecha de ayer en zona horaria de México (YYYY-MM-DD)
 */
function getYesterdayMexico(): string {
  const now = new Date();
  // Restar 24 horas
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dateFormatter.format(yesterday);
}

/**
 * Obtiene los datos de cosecha del día anterior por parcela
 */
async function getYesterdayHarvest(): Promise<{ totals: ParcelHarvestSummary; parcels: ParcelHarvestSummary[]; date: string } | null> {
  const db = await getDb();
  if (!db) return null;

  const yesterday = getYesterdayMexico();

  try {
    // Obtener resumen por parcela del día anterior
    const result = await db.execute(sql`
      SELECT 
        b.parcelCode,
        COALESCE(p.name, b.parcelName, b.parcelCode) as parcelName,
        COUNT(*) as totalBoxes,
        SUM(b.weight) / 1000 as totalWeight,
        SUM(CASE WHEN b.harvesterId NOT IN (98, 99) THEN b.weight ELSE 0 END) / 1000 as firstQualityWeight,
        SUM(CASE WHEN b.harvesterId = 98 THEN b.weight ELSE 0 END) / 1000 as secondQualityWeight,
        SUM(CASE WHEN b.harvesterId = 99 THEN b.weight ELSE 0 END) / 1000 as wasteWeight
      FROM boxes b
      LEFT JOIN parcels p ON p.code = b.parcelCode
      WHERE DATE(b.submissionTime) = ${yesterday} AND b.archived = 0
      GROUP BY b.parcelCode, p.name, b.parcelName
      ORDER BY totalWeight DESC
    `);

    const rows = result[0] as any[];
    if (!rows || rows.length === 0) return null;

    const parcels: ParcelHarvestSummary[] = rows.map((row: any) => ({
      parcelCode: row.parcelCode,
      parcelName: row.parcelName || row.parcelCode,
      totalBoxes: Number(row.totalBoxes),
      totalWeight: Number(Number(row.totalWeight).toFixed(2)),
      firstQualityWeight: Number(Number(row.firstQualityWeight).toFixed(2)),
      secondQualityWeight: Number(Number(row.secondQualityWeight).toFixed(2)),
      wasteWeight: Number(Number(row.wasteWeight).toFixed(2)),
    }));

    // Calcular totales
    const totals: ParcelHarvestSummary = {
      parcelCode: "TOTAL",
      parcelName: "TOTAL",
      totalBoxes: parcels.reduce((s, p) => s + p.totalBoxes, 0),
      totalWeight: Number(parcels.reduce((s, p) => s + p.totalWeight, 0).toFixed(2)),
      firstQualityWeight: Number(parcels.reduce((s, p) => s + p.firstQualityWeight, 0).toFixed(2)),
      secondQualityWeight: Number(parcels.reduce((s, p) => s + p.secondQualityWeight, 0).toFixed(2)),
      wasteWeight: Number(parcels.reduce((s, p) => s + p.wasteWeight, 0).toFixed(2)),
    };

    return { totals, parcels, date: yesterday };
  } catch (error) {
    console.error("[HarvestNotifier] Error al obtener datos de cosecha:", error);
    return null;
  }
}

/**
 * Formatea una fecha YYYY-MM-DD a formato legible en español
 */
function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${parseInt(day)} de ${months[parseInt(month) - 1]} ${year}`;
}

/**
 * Construye el mensaje de resumen de cosecha
 */
function buildHarvestMessage(data: { totals: ParcelHarvestSummary; parcels: ParcelHarvestSummary[]; date: string }): string {
  const { totals, parcels, date } = data;
  const dateFormatted = formatDate(date);

  let msg = `🌾 <b>RESUMEN DE COSECHA</b>\n`;
  msg += `📅 ${dateFormatted}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Totales generales
  msg += `📊 <b>Totales del Día</b>\n`;
  msg += `📦 Cajas: <b>${totals.totalBoxes.toLocaleString()}</b>\n`;
  msg += `⚖️ Kilos Totales: <b>${totals.totalWeight.toLocaleString(undefined, { minimumFractionDigits: 2 })} kg</b>\n`;
  msg += `🟢 1ra Calidad: <b>${totals.firstQualityWeight.toLocaleString(undefined, { minimumFractionDigits: 2 })} kg</b>`;
  if (totals.totalWeight > 0) {
    msg += ` (${((totals.firstQualityWeight / totals.totalWeight) * 100).toFixed(1)}%)`;
  }
  msg += `\n`;
  msg += `🟡 2da Calidad: <b>${totals.secondQualityWeight.toLocaleString(undefined, { minimumFractionDigits: 2 })} kg</b>`;
  if (totals.totalWeight > 0) {
    msg += ` (${((totals.secondQualityWeight / totals.totalWeight) * 100).toFixed(1)}%)`;
  }
  msg += `\n`;
  msg += `🔴 Desperdicio: <b>${totals.wasteWeight.toLocaleString(undefined, { minimumFractionDigits: 2 })} kg</b>`;
  if (totals.totalWeight > 0) {
    msg += ` (${((totals.wasteWeight / totals.totalWeight) * 100).toFixed(1)}%)`;
  }
  msg += `\n\n`;

  // Desglose por parcela
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🗺️ <b>Detalle por Parcela</b>\n\n`;

  for (const p of parcels) {
    msg += `📍 <b>${p.parcelName}</b>\n`;
    msg += `   📦 ${p.totalBoxes} cajas · ⚖️ ${p.totalWeight.toLocaleString(undefined, { minimumFractionDigits: 2 })} kg\n`;
    msg += `   🟢 ${p.firstQualityWeight.toLocaleString(undefined, { minimumFractionDigits: 2 })} kg`;
    msg += ` · 🟡 ${p.secondQualityWeight.toLocaleString(undefined, { minimumFractionDigits: 2 })} kg`;
    msg += ` · 🔴 ${p.wasteWeight.toLocaleString(undefined, { minimumFractionDigits: 2 })} kg\n\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🤖 AGRA-TECTI Cosecha Inteligente`;

  return msg;
}

/**
 * Envía el resumen de cosecha por Telegram
 */
async function sendHarvestSummary(): Promise<boolean> {
  const config = await getHarvestConfig();
  if (!config || !config.enabled) {
    return false;
  }

  const data = await getYesterdayHarvest();
  if (!data) {
    console.log("[HarvestNotifier] No hay datos de cosecha para ayer, omitiendo envío");
    return false;
  }

  const message = buildHarvestMessage(data);

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
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`[HarvestNotifier] Error al enviar: ${response.status} - ${errorData}`);
      return false;
    }

    console.log("[HarvestNotifier] Resumen de cosecha enviado correctamente");
    return true;
  } catch (error: any) {
    console.error(`[HarvestNotifier] Error de conexión: ${error.message}`);
    return false;
  }
}

/**
 * Verifica si es hora de enviar el resumen
 */
async function checkAndSend() {
  const config = await getHarvestConfig();
  if (!config || !config.enabled) return;

  const { hour, minute, dateStr } = getMexicoTime();

  // Verificar si es la hora y minuto configurados
  if (hour === config.hour && minute === config.minute) {
    // Verificar que no se haya enviado ya hoy
    if (lastSentDate === dateStr) return;

    console.log(`[HarvestNotifier] Hora de envío: ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} - Enviando resumen de cosecha`);
    lastSentDate = dateStr;
    await sendHarvestSummary();
  }
}

/**
 * Inicia el scheduler de notificación de cosecha
 * NO envía al arrancar, solo a la hora configurada
 */
export function startHarvestNotifier() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  console.log(`🌾 [HarvestNotifier] Scheduler iniciado. Verificando configuración cada minuto.`);

  // Verificar cada minuto
  schedulerInterval = setInterval(() => {
    checkAndSend().catch(err => console.error("[HarvestNotifier] Error:", err));
  }, 60 * 1000);

  // Log de la configuración actual
  getHarvestConfig().then(config => {
    if (config && config.enabled) {
      console.log(`🌾 [HarvestNotifier] Configurado: envío a las ${String(config.hour).padStart(2, '0')}:${String(config.minute).padStart(2, '0')} hora de México al chat ${config.chatId}`);
    } else {
      console.log(`🌾 [HarvestNotifier] No configurado o deshabilitado. Configurar en Ajustes.`);
    }
  });
}

/**
 * Detiene el scheduler
 */
export function stopHarvestNotifier() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("🌾 [HarvestNotifier] Scheduler detenido");
  }
}

/**
 * Envía un mensaje de prueba del resumen de cosecha
 */
export async function sendHarvestTestMessage(botToken: string, chatId: string): Promise<{ success: boolean; error?: string }> {
  // Intentar con datos reales de ayer, si no hay, enviar ejemplo
  const data = await getYesterdayHarvest();

  let message: string;
  if (data) {
    message = buildHarvestMessage(data);
  } else {
    const now = new Date();
    const timeStr = now.toLocaleString("es-MX", { timeZone: TIMEZONE });
    message = `🌾 <b>RESUMEN DE COSECHA - Mensaje de Prueba</b>\n` +
      `📅 ${timeStr}\n\n` +
      `✅ La conexión funciona correctamente.\n` +
      `ℹ️ No hay datos de cosecha de ayer para mostrar.\n` +
      `Cuando haya datos, recibirás el resumen completo con:\n` +
      `• Total de cajas y kilos\n` +
      `• Desglose por calidad (1ra, 2da, desperdicio)\n` +
      `• Detalle por parcela cosechada\n\n` +
      `🤖 AGRA-TECTI Cosecha Inteligente`;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any;
      return { success: false, error: errorData.description || `Error HTTP ${response.status}` };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Error de conexión" };
  }
}
