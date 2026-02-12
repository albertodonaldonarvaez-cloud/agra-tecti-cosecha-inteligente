/**
 * ODM Auto Sync - Sincronización semanal de vuelos WebODM
 * Verifica cada semana si hay vuelos nuevos en WebODM y notifica por Telegram
 */

import { getOdmProjects, getOdmProjectTasks, getParcelOdmMappings, getWebodmConfig } from "./webodmService";
import { getTelegramConfig } from "./telegramBot";

const TIMEZONE = "America/Mexico_City";

interface OdmSyncResult {
  totalProjects: number;
  totalTasks: number;
  newTasks: OdmNewTask[];
  completedTasks: OdmCompletedTask[];
  processingTasks: OdmProcessingTask[];
  failedTasks: OdmFailedTask[];
  parcelSummary: OdmParcelSummary[];
}

interface OdmNewTask {
  projectId: number;
  projectName: string;
  parcelName: string | null;
  taskName: string;
  taskUuid: string;
  status: number;
  statusLabel: string;
  imagesCount: number;
  createdAt: string;
}

interface OdmCompletedTask {
  projectId: number;
  projectName: string;
  parcelName: string | null;
  taskName: string;
  taskUuid: string;
  imagesCount: number;
  processingTime: number;
  createdAt: string;
}

interface OdmProcessingTask {
  projectId: number;
  projectName: string;
  parcelName: string | null;
  taskName: string;
  status: number;
  statusLabel: string;
}

interface OdmFailedTask {
  projectId: number;
  projectName: string;
  parcelName: string | null;
  taskName: string;
  lastError: string;
}

interface OdmParcelSummary {
  parcelName: string;
  projectName: string;
  totalTasks: number;
  completedTasks: number;
  latestTaskDate: string | null;
  latestTaskName: string | null;
}

// Estado del scheduler
let odmSyncInterval: ReturnType<typeof setInterval> | null = null;
let lastOdmSync: Date | null = null;
let lastKnownTaskUuids: Set<string> = new Set();
let isFirstRun = true;

const STATUS_MAP: Record<number, string> = {
  10: "En cola",
  20: "Procesando",
  30: "Fallido",
  40: "Completado",
  50: "Cancelado",
};

function getMexicoTime(date?: Date): { hour: number; minute: number; dayOfWeek: number; dateStr: string } {
  const d = date || new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(d);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0");
  const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0");
  const weekday = parts.find(p => p.type === "weekday")?.value || "";

  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[weekday] ?? new Date().getDay();

  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateStr = dateFormatter.format(d);

  return { hour, minute, dayOfWeek, dateStr };
}

function formatProcessingTime(ms: number): string {
  if (!ms || ms < 0) return "-";
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

/**
 * Escanea todos los proyectos ODM vinculados y detecta cambios
 */
export async function scanOdmFlights(): Promise<OdmSyncResult | null> {
  const config = await getWebodmConfig();
  if (!config) {
    console.log("[ODM Sync] WebODM no configurado, omitiendo escaneo");
    return null;
  }

  const mappings = await getParcelOdmMappings();
  if (mappings.length === 0) {
    console.log("[ODM Sync] No hay parcelas vinculadas a proyectos ODM");
    return null;
  }

  const result: OdmSyncResult = {
    totalProjects: 0,
    totalTasks: 0,
    newTasks: [],
    completedTasks: [],
    processingTasks: [],
    failedTasks: [],
    parcelSummary: [],
  };

  // Obtener todos los proyectos únicos vinculados
  const projectIds = Array.from(new Set(mappings.map(m => m.odmProjectId)));
  result.totalProjects = projectIds.length;

  // Crear mapa de projectId -> parcelName
  const projectToParcel: Record<number, string> = {};
  for (const m of mappings) {
    projectToParcel[m.odmProjectId] = m.odmProjectName || `Parcela ${m.parcelId}`;
  }

  const currentTaskUuids = new Set<string>();

  for (const projectId of projectIds) {
    try {
      const tasks = await getOdmProjectTasks(projectId);
      const parcelName = projectToParcel[projectId] || `Proyecto ${projectId}`;

      // Resumen por parcela
      const completedCount = tasks.filter((t: any) => t.status === 40).length;
      const latestTask = tasks.sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      result.parcelSummary.push({
        parcelName,
        projectName: `Proyecto #${projectId}`,
        totalTasks: tasks.length,
        completedTasks: completedCount,
        latestTaskDate: latestTask?.created_at || null,
        latestTaskName: latestTask?.name || null,
      });

      for (const task of tasks) {
        result.totalTasks++;
        currentTaskUuids.add(task.uuid);

        // Detectar tareas nuevas (no vistas antes)
        if (!isFirstRun && !lastKnownTaskUuids.has(task.uuid)) {
          result.newTasks.push({
            projectId,
            projectName: parcelName,
            parcelName,
            taskName: task.name || `Tarea #${task.id}`,
            taskUuid: task.uuid,
            status: task.status,
            statusLabel: STATUS_MAP[task.status] || "Desconocido",
            imagesCount: task.images_count || 0,
            createdAt: task.created_at,
          });
        }

        // Clasificar por estado
        if (task.status === 40) {
          result.completedTasks.push({
            projectId,
            projectName: parcelName,
            parcelName,
            taskName: task.name || `Tarea #${task.id}`,
            taskUuid: task.uuid,
            imagesCount: task.images_count || 0,
            processingTime: task.processing_time || 0,
            createdAt: task.created_at,
          });
        } else if (task.status === 20 || task.status === 10) {
          result.processingTasks.push({
            projectId,
            projectName: parcelName,
            parcelName,
            taskName: task.name || `Tarea #${task.id}`,
            status: task.status,
            statusLabel: STATUS_MAP[task.status] || "Desconocido",
          });
        } else if (task.status === 30) {
          result.failedTasks.push({
            projectId,
            projectName: parcelName,
            parcelName,
            taskName: task.name || `Tarea #${task.id}`,
            lastError: task.last_error || "Error desconocido",
          });
        }
      }
    } catch (err) {
      console.error(`[ODM Sync] Error escaneando proyecto ${projectId}:`, err);
    }
  }

  // Actualizar UUIDs conocidos
  lastKnownTaskUuids = currentTaskUuids;
  if (isFirstRun) isFirstRun = false;

  return result;
}

/**
 * Construye el mensaje de Telegram para el reporte ODM
 */
function buildOdmTelegramMessage(result: OdmSyncResult): string {
  const now = new Date();
  const timeStr = now.toLocaleString("es-MX", { timeZone: TIMEZONE });

  let msg = `🛩️ <b>AGRA-TECTI - Reporte de Vuelos ODM</b>\n`;
  msg += `📅 ${timeStr}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Resumen general
  msg += `📊 <b>Resumen General</b>\n`;
  msg += `• Proyectos vinculados: ${result.totalProjects}\n`;
  msg += `• Total de vuelos: ${result.totalTasks}\n`;
  msg += `• Completados: ${result.completedTasks.length}\n`;
  if (result.processingTasks.length > 0) {
    msg += `• En proceso: ${result.processingTasks.length}\n`;
  }
  if (result.failedTasks.length > 0) {
    msg += `• Fallidos: ${result.failedTasks.length}\n`;
  }
  msg += `\n`;

  // Vuelos nuevos detectados
  if (result.newTasks.length > 0) {
    msg += `🆕 <b>Vuelos Nuevos Detectados: ${result.newTasks.length}</b>\n`;
    for (const task of result.newTasks.slice(0, 10)) {
      const dateStr = new Date(task.createdAt).toLocaleDateString("es-MX", {
        timeZone: TIMEZONE,
        day: "2-digit",
        month: "short",
      });
      msg += `  • <b>${task.taskName}</b> (${task.parcelName})\n`;
      msg += `    ${task.statusLabel} | ${task.imagesCount} imgs | ${dateStr}\n`;
    }
    if (result.newTasks.length > 10) {
      msg += `  ... y ${result.newTasks.length - 10} más\n`;
    }
    msg += `\n`;
  }

  // Tareas en proceso
  if (result.processingTasks.length > 0) {
    msg += `⏳ <b>En Proceso:</b>\n`;
    for (const task of result.processingTasks.slice(0, 5)) {
      msg += `  • ${task.taskName} (${task.parcelName}) - ${task.statusLabel}\n`;
    }
    msg += `\n`;
  }

  // Tareas fallidas
  if (result.failedTasks.length > 0) {
    msg += `❌ <b>Vuelos Fallidos:</b>\n`;
    for (const task of result.failedTasks.slice(0, 5)) {
      msg += `  • ${task.taskName} (${task.parcelName})\n`;
      const shortError = task.lastError.length > 80 ? task.lastError.substring(0, 80) + "..." : task.lastError;
      msg += `    <i>${shortError}</i>\n`;
    }
    msg += `\n`;
  }

  // Resumen por parcela
  if (result.parcelSummary.length > 0) {
    msg += `🌿 <b>Resumen por Parcela</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (const ps of result.parcelSummary) {
      msg += `\n📍 <b>${ps.parcelName}</b>\n`;
      msg += `  Vuelos: ${ps.completedTasks}/${ps.totalTasks} completados\n`;
      if (ps.latestTaskDate) {
        const latestDate = new Date(ps.latestTaskDate).toLocaleDateString("es-MX", {
          timeZone: TIMEZONE,
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
        msg += `  Último vuelo: ${ps.latestTaskName || "Sin nombre"} (${latestDate})\n`;
      }
    }
    msg += `\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🤖 AGRA-TECTI Cosecha Inteligente`;

  return msg;
}

/**
 * Envía la notificación de reporte ODM por Telegram
 */
async function sendOdmTelegramNotification(result: OdmSyncResult): Promise<boolean> {
  const config = await getTelegramConfig();
  if (!config) {
    console.log("[ODM Sync] Telegram no configurado, omitiendo notificación");
    return false;
  }

  const message = buildOdmTelegramMessage(result);

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
      console.error(`[ODM Sync] Error al enviar Telegram: ${response.status} - ${errorData}`);
      return false;
    }

    console.log("[ODM Sync] Notificación Telegram enviada correctamente");
    return true;
  } catch (error: any) {
    console.error(`[ODM Sync] Error de conexión Telegram: ${error.message}`);
    return false;
  }
}

/**
 * Ejecuta el escaneo y envía notificación
 */
async function runOdmSync(): Promise<void> {
  const mexicoTime = getMexicoTime();
  console.log(`🛩️ [ODM Sync] Iniciando escaneo semanal - Hora México: ${String(mexicoTime.hour).padStart(2, "0")}:${String(mexicoTime.minute).padStart(2, "0")}`);

  try {
    const result = await scanOdmFlights();
    if (!result) return;

    lastOdmSync = new Date();

    // Siempre notificar en el escaneo semanal (tiene info de resumen)
    await sendOdmTelegramNotification(result);

    console.log(`✅ [ODM Sync] Escaneo completado: ${result.totalTasks} vuelos en ${result.totalProjects} proyectos, ${result.newTasks.length} nuevos`);
  } catch (error) {
    console.error("[ODM Sync] Error en escaneo:", error);
  }
}

/**
 * Verifica si es hora de ejecutar el escaneo semanal
 * Se ejecuta cada lunes a las 8:00 AM hora de México
 */
function checkAndRunOdm(): void {
  const { hour, minute, dayOfWeek, dateStr } = getMexicoTime();

  // Lunes (1) a las 8:00 AM
  if (dayOfWeek === 1 && hour === 8 && minute === 0) {
    if (lastOdmSync) {
      const lastSyncMx = getMexicoTime(lastOdmSync);
      if (lastSyncMx.dateStr === dateStr) {
        return; // Ya se ejecutó hoy
      }
    }

    console.log(`⏰ [ODM Sync] Lunes 8:00 AM hora de México - Ejecutando escaneo semanal`);
    runOdmSync().catch(console.error);
  }
}

/**
 * Inicia el scheduler de sincronización semanal de ODM
 */
export function startOdmAutoSync(): void {
  if (odmSyncInterval) {
    clearInterval(odmSyncInterval);
  }

  console.log(`🛩️ [ODM Sync] Scheduler iniciado. Escaneo semanal: Lunes 8:00 AM hora de México (${TIMEZONE})`);

  // Verificar cada minuto
  odmSyncInterval = setInterval(checkAndRunOdm, 60 * 1000);

  // Escaneo inicial al arrancar (después de 60 segundos para que la BD esté lista)
  setTimeout(() => {
    console.log("🛩️ [ODM Sync] Ejecutando escaneo inicial al arrancar...");
    runOdmSync().catch(console.error);
  }, 60 * 1000);
}

/**
 * Detiene el scheduler
 */
export function stopOdmAutoSync(): void {
  if (odmSyncInterval) {
    clearInterval(odmSyncInterval);
    odmSyncInterval = null;
    console.log("⏹️ [ODM Sync] Scheduler detenido");
  }
}

/**
 * Ejecuta un escaneo manual (desde la UI)
 */
export async function triggerManualOdmSync(): Promise<OdmSyncResult | null> {
  console.log("🛩️ [ODM Sync] Escaneo manual solicitado");
  const result = await scanOdmFlights();
  if (result) {
    lastOdmSync = new Date();
    await sendOdmTelegramNotification(result);
  }
  return result;
}

/**
 * Obtiene el estado del scheduler ODM
 */
export function getOdmSyncStatus() {
  return {
    isActive: odmSyncInterval !== null,
    lastSync: lastOdmSync,
    schedule: "Lunes 8:00 AM hora de México",
    timezone: TIMEZONE,
  };
}
