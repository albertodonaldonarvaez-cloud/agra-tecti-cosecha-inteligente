import { getApiConfig, updateLastSync } from "./db";
import { syncFromKoboAPI } from "./koboSync";
import { sendSyncNotification } from "./telegramBot";

// ============================================================
// Sincronización Automática de KoboToolbox
// Ejecuta la sincronización 2 veces al día (mañana y tarde)
// Todas las horas se manejan en zona horaria America/Mexico_City
// ============================================================

const TIMEZONE = "America/Mexico_City";

interface SyncLog {
  timestamp: Date;
  status: "success" | "error";
  message: string;
  processedCount?: number;
  totalCount?: number;
}

// Historial de sincronizaciones (últimas 20)
const syncHistory: SyncLog[] = [];
const MAX_HISTORY = 20;

// Estado del scheduler
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastScheduledRun: Date | null = null;

// Horarios de sincronización (hora de México)
// Por defecto: 7:00 AM y 3:00 PM hora de México
let syncHours = [7, 15];

/**
 * Obtiene la hora actual en la zona horaria de México
 */
function getMexicoTime(date?: Date): { hour: number; minute: number; dateStr: string } {
  const d = date || new Date();
  // Usar Intl.DateTimeFormat para obtener la hora en zona horaria de México
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0");
  const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0");
  
  // Obtener fecha en formato YYYY-MM-DD en zona horaria de México
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
 * Formatea una fecha en zona horaria de México para mostrar
 */
function formatMexicoTime(date: Date): string {
  return date.toLocaleString("es-MX", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function addToHistory(log: SyncLog) {
  syncHistory.unshift(log);
  if (syncHistory.length > MAX_HISTORY) {
    syncHistory.pop();
  }
}

/**
 * Ejecuta la sincronización con KoboToolbox
 */
async function runSync(trigger: string = "auto"): Promise<SyncLog> {
  if (isRunning) {
    const log: SyncLog = {
      timestamp: new Date(),
      status: "error",
      message: "Sincronización ya en progreso, omitiendo...",
    };
    addToHistory(log);
    return log;
  }

  isRunning = true;
  const mexicoTime = getMexicoTime();
  console.log(`🔄 [AutoSync] Iniciando sincronización automática (${trigger}) - Hora México: ${String(mexicoTime.hour).padStart(2, '0')}:${String(mexicoTime.minute).padStart(2, '0')}...`);

  try {
    const config = await getApiConfig();

    if (!config || !config.apiUrl || !config.apiToken || !config.assetId) {
      const log: SyncLog = {
        timestamp: new Date(),
        status: "error",
        message: "Configuración de API incompleta. Configura la API en Ajustes.",
      };
      addToHistory(log);
      console.log("⚠️ [AutoSync] Configuración de API incompleta, omitiendo sincronización");
      return log;
    }

    // Sincronizar sin filtro de fecha para obtener todos los datos nuevos
    const result = await syncFromKoboAPI(
      config.apiUrl,
      config.apiToken,
      config.assetId
    );

    await updateLastSync();

    const log: SyncLog = {
      timestamp: new Date(),
      status: "success",
      message: `Sincronización completada: ${result.processedCount} nuevos de ${result.totalCount} registros`,
      processedCount: result.processedCount,
      totalCount: result.totalCount,
    };
    addToHistory(log);
    console.log(`✅ [AutoSync] ${log.message}`);

    // Enviar notificación por Telegram
    try {
      await sendSyncNotification({
        trigger,
        processedCount: result.processedCount,
        totalCount: result.totalCount,
        errors: result.errors || [],
        autoResolveResult: result.autoResolveResult || null,
      });
    } catch (telegramError) {
      console.error("[AutoSync] Error al enviar notificación Telegram:", telegramError);
    }

    return log;
  } catch (error: any) {
    const log: SyncLog = {
      timestamp: new Date(),
      status: "error",
      message: `Error: ${error.message || error}`,
    };
    addToHistory(log);
    console.error(`❌ [AutoSync] ${log.message}`);

    // Notificar error por Telegram
    try {
      await sendSyncNotification({
        trigger,
        processedCount: 0,
        totalCount: 0,
        errors: [`Error de sincronización: ${error.message || error}`],
      });
    } catch (telegramError) {
      console.error("[AutoSync] Error al enviar notificación Telegram:", telegramError);
    }

    return log;
  } finally {
    isRunning = false;
    lastScheduledRun = new Date();
  }
}

/**
 * Verifica si es hora de ejecutar la sincronización
 * Compara la hora actual de MÉXICO con los horarios configurados
 */
function checkAndRun() {
  const { hour: currentHour, minute: currentMinute, dateStr: todayStr } = getMexicoTime();

  // Solo ejecutar en el minuto 0 de las horas configuradas
  if (syncHours.includes(currentHour) && currentMinute === 0) {
    // Verificar que no se haya ejecutado ya en esta hora
    if (lastScheduledRun) {
      const lastRun = getMexicoTime(lastScheduledRun);
      
      if (lastRun.hour === currentHour && lastRun.dateStr === todayStr) {
        // Ya se ejecutó en esta hora hoy, omitir
        return;
      }
    }

    console.log(`⏰ [AutoSync] Hora de México: ${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')} - Ejecutando sincronización programada`);
    runSync("scheduled").catch(console.error);
  }
}

/**
 * Inicia el scheduler de sincronización automática
 */
export function startAutoSync(hours?: number[]) {
  if (hours && hours.length > 0) {
    syncHours = hours;
  }

  // Detener scheduler anterior si existe
  stopAutoSync();

  const mexicoTime = getMexicoTime();
  console.log(`⏰ [AutoSync] Scheduler iniciado. Sincronización a las: ${syncHours.map(h => `${String(h).padStart(2, '0')}:00`).join(', ')} hora de México (${TIMEZONE})`);
  console.log(`⏰ [AutoSync] Hora actual de México: ${String(mexicoTime.hour).padStart(2, '0')}:${String(mexicoTime.minute).padStart(2, '0')}`);

  // Verificar cada minuto si es hora de sincronizar
  schedulerInterval = setInterval(checkAndRun, 60 * 1000);

  // Verificar inmediatamente al iniciar (por si el servidor arranca justo a la hora)
  checkAndRun();

  // Ejecutar una sincronización inicial al arrancar el servidor (después de 30 segundos)
  setTimeout(() => {
    console.log("🚀 [AutoSync] Ejecutando sincronización inicial al arrancar...");
    runSync("startup").catch(console.error);
  }, 30 * 1000);
}

/**
 * Detiene el scheduler de sincronización automática
 */
export function stopAutoSync() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("⏹️ [AutoSync] Scheduler detenido");
  }
}

/**
 * Ejecuta una sincronización manual (desde la UI)
 */
export async function triggerManualSync(): Promise<SyncLog> {
  return await runSync("manual");
}

/**
 * Obtiene el estado actual del scheduler y el historial
 */
export function getAutoSyncStatus() {
  return {
    isActive: schedulerInterval !== null,
    isRunning,
    syncHours: syncHours.map(h => `${String(h).padStart(2, '0')}:00`),
    lastRun: lastScheduledRun,
    nextRun: getNextRunTime(),
    history: syncHistory,
    timezone: TIMEZONE,
  };
}

/**
 * Actualiza los horarios de sincronización
 */
export function updateSyncHours(hours: number[]) {
  if (hours.length === 0) return;
  syncHours = hours.filter(h => h >= 0 && h <= 23);
  console.log(`⏰ [AutoSync] Horarios actualizados: ${syncHours.map(h => `${String(h).padStart(2, '0')}:00`).join(', ')} hora de México`);
}

/**
 * Calcula la próxima hora de ejecución en zona horaria de México
 * Retorna un objeto con la hora formateada para mostrar directamente
 */
function getNextRunTime(): string | null {
  if (syncHours.length === 0) return null;

  const now = new Date();
  const { hour: currentHour, minute: currentMinute } = getMexicoTime(now);

  // Buscar la próxima hora de sincronización
  const sortedHours = [...syncHours].sort((a, b) => a - b);
  
  // Buscar la próxima hora hoy
  for (const hour of sortedHours) {
    if (hour > currentHour || (hour === currentHour && currentMinute === 0)) {
      // Calcular la diferencia en milisegundos hasta esa hora de México
      // Primero, obtener el offset actual de México
      const diffToTarget = (hour - currentHour) * 60 * 60 * 1000 - currentMinute * 60 * 1000;
      const targetDate = new Date(now.getTime() + diffToTarget);
      // Ajustar al minuto 0
      targetDate.setSeconds(0, 0);
      return targetDate.toISOString();
    }
  }

  // Si no hay más horas hoy, la próxima es mañana a la primera hora
  const hoursUntilTomorrow = (24 - currentHour + sortedHours[0]) * 60 * 60 * 1000 - currentMinute * 60 * 1000;
  const tomorrowTarget = new Date(now.getTime() + hoursUntilTomorrow);
  tomorrowTarget.setSeconds(0, 0);
  return tomorrowTarget.toISOString();
}
