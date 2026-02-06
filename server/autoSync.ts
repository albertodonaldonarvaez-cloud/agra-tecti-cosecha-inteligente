import { getApiConfig, updateLastSync } from "./db";
import { syncFromKoboAPI } from "./koboSync";

// ============================================================
// Sincronización Automática de KoboToolbox
// Ejecuta la sincronización 2 veces al día (mañana y tarde)
// ============================================================

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

// Horarios de sincronización (hora del servidor)
// Por defecto: 7:00 AM y 3:00 PM hora del servidor
let syncHours = [7, 15];

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
  console.log(`🔄 [AutoSync] Iniciando sincronización automática (${trigger})...`);

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
    return log;
  } catch (error: any) {
    const log: SyncLog = {
      timestamp: new Date(),
      status: "error",
      message: `Error: ${error.message || error}`,
    };
    addToHistory(log);
    console.error(`❌ [AutoSync] ${log.message}`);
    return log;
  } finally {
    isRunning = false;
    lastScheduledRun = new Date();
  }
}

/**
 * Verifica si es hora de ejecutar la sincronización
 * Compara la hora actual del servidor con los horarios configurados
 */
function checkAndRun() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Solo ejecutar en el minuto 0 de las horas configuradas
  if (syncHours.includes(currentHour) && currentMinute === 0) {
    // Verificar que no se haya ejecutado ya en esta hora
    if (lastScheduledRun) {
      const lastRunHour = lastScheduledRun.getHours();
      const lastRunDate = lastScheduledRun.toDateString();
      const nowDate = now.toDateString();
      
      if (lastRunHour === currentHour && lastRunDate === nowDate) {
        // Ya se ejecutó en esta hora hoy, omitir
        return;
      }
    }

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

  console.log(`⏰ [AutoSync] Scheduler iniciado. Sincronización a las: ${syncHours.map(h => `${String(h).padStart(2, '0')}:00`).join(', ')} hora servidor`);
  console.log(`⏰ [AutoSync] Hora actual del servidor: ${new Date().toLocaleTimeString()}`);

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
  };
}

/**
 * Actualiza los horarios de sincronización
 */
export function updateSyncHours(hours: number[]) {
  if (hours.length === 0) return;
  syncHours = hours.filter(h => h >= 0 && h <= 23);
  console.log(`⏰ [AutoSync] Horarios actualizados: ${syncHours.map(h => `${String(h).padStart(2, '0')}:00`).join(', ')}`);
}

/**
 * Calcula la próxima hora de ejecución
 */
function getNextRunTime(): string | null {
  if (syncHours.length === 0) return null;

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Buscar la próxima hora de sincronización
  const sortedHours = [...syncHours].sort((a, b) => a - b);
  
  for (const hour of sortedHours) {
    if (hour > currentHour || (hour === currentHour && currentMinute < 0)) {
      const next = new Date(now);
      next.setHours(hour, 0, 0, 0);
      return next.toISOString();
    }
  }

  // Si no hay más horas hoy, la próxima es mañana
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(sortedHours[0], 0, 0, 0);
  return next.toISOString();
}
