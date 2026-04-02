import { getDb } from "./db";
import { collaborators, collaboratorLinkCodes, fieldActivityAssignments, fieldActivities, fieldActivityParcels, parcels, fieldNotes, fieldNotePhotos, apiConfig, users } from "../drizzle/schema";
import { eq, and, gt, desc, inArray, sql, or } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// Bot de Telegram para Colaboradores de Campo
// Flujo amigable con botones inline para:
// 1. Gestionar tareas asignadas (ver, iniciar, completar con evidencia)
// 2. Crear notas de campo (reportar problemas)
// 3. Dar seguimiento a notas abiertas
// ============================================================

// ---- Tipos ----
interface CollabConversation {
  step: string;
  data: Record<string, any>;
  collaboratorId: number;
  lastActivity: number;
}

const collabConversations = new Map<string, CollabConversation>();

// ---- Constantes ----
const CATEGORIES: Record<string, { label: string; emoji: string }> = {
  arboles_mal_plantados: { label: "Árboles mal plantados", emoji: "🌳" },
  plaga_enfermedad: { label: "Plaga/Enfermedad", emoji: "🐛" },
  riego_drenaje: { label: "Riego/Drenaje", emoji: "💧" },
  dano_mecanico: { label: "Daño mecánico", emoji: "🔧" },
  maleza: { label: "Maleza", emoji: "🌿" },
  fertilizacion: { label: "Fertilización", emoji: "🧪" },
  suelo: { label: "Suelo", emoji: "🪨" },
  infraestructura: { label: "Infraestructura", emoji: "🏗️" },
  fauna: { label: "Fauna", emoji: "🦎" },
  otro: { label: "Otro", emoji: "📋" },
};

const PRIORITIES: Record<string, { label: string; emoji: string }> = {
  baja: { label: "Baja", emoji: "🟢" },
  media: { label: "Media", emoji: "🟡" },
  alta: { label: "Alta", emoji: "🟠" },
  critica: { label: "Crítica", emoji: "🔴" },
};

const ACTIVITY_TYPES: Record<string, { label: string; emoji: string }> = {
  riego: { label: "Riego", emoji: "💧" },
  fertilizacion: { label: "Fertilización", emoji: "🧪" },
  nutricion: { label: "Nutrición", emoji: "🌱" },
  poda: { label: "Poda", emoji: "✂️" },
  control_maleza: { label: "Control de maleza", emoji: "🌿" },
  control_plagas: { label: "Control de plagas", emoji: "🐛" },
  aplicacion_fitosanitaria: { label: "Aplicación fitosanitaria", emoji: "🧴" },
  otro: { label: "Otro", emoji: "📋" },
};

const STATUS_LABELS: Record<string, { label: string; emoji: string }> = {
  pendiente: { label: "Pendiente", emoji: "⏳" },
  en_progreso: { label: "En progreso", emoji: "🔄" },
  completada: { label: "Completada", emoji: "✅" },
  cancelada: { label: "Cancelada", emoji: "❌" },
};

// ============================================================
// Funciones de API de Telegram
// ============================================================
async function callTelegram(botToken: string, method: string, body?: any): Promise<any> {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const options: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(url, options);
  return res.json();
}

async function sendMessage(botToken: string, chatId: string, text: string, opts?: { inline_keyboard?: any; reply_keyboard?: any; remove_keyboard?: boolean }): Promise<any> {
  const body: any = { chat_id: chatId, text, parse_mode: "HTML" };
  if (opts?.inline_keyboard) {
    body.reply_markup = { inline_keyboard: opts.inline_keyboard };
  } else if (opts?.reply_keyboard) {
    body.reply_markup = { keyboard: opts.reply_keyboard, resize_keyboard: true, one_time_keyboard: true };
  } else if (opts?.remove_keyboard) {
    body.reply_markup = { remove_keyboard: true };
  }
  return callTelegram(botToken, "sendMessage", body);
}

async function editMessageText(botToken: string, chatId: string, messageId: number, text: string, inlineKeyboard?: any): Promise<any> {
  const body: any = { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" };
  if (inlineKeyboard) body.reply_markup = { inline_keyboard: inlineKeyboard };
  return callTelegram(botToken, "editMessageText", body);
}

async function answerCallbackQuery(botToken: string, callbackQueryId: string, text?: string): Promise<any> {
  return callTelegram(botToken, "answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

async function downloadFile(botToken: string, fileId: string): Promise<Buffer | null> {
  try {
    const fileInfo = await callTelegram(botToken, "getFile", { file_id: fileId });
    if (!fileInfo?.result?.file_path) return null;
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`;
    const res = await fetch(fileUrl, { signal: AbortSignal.timeout(30000) });
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// ============================================================
// Helpers de DB
// ============================================================
async function getBotToken(): Promise<string | null> {
  try {
    const db = await getDb();
    const [config] = await db.select({ token: apiConfig.telegramBotToken }).from(apiConfig);
    return config?.token || null;
  } catch { return null; }
}

async function getCollaboratorByChatId(chatId: string): Promise<any> {
  try {
    const db = await getDb();
    const [collab] = await db.select().from(collaborators).where(eq(collaborators.telegramChatId, chatId));
    return collab || null;
  } catch { return null; }
}

async function getActiveParcels(): Promise<any[]> {
  try {
    const db = await getDb();
    return await db.select().from(parcels).where(eq(parcels.isActive, true));
  } catch { return []; }
}

async function generateFolio(): Promise<string> {
  const db = await getDb();
  const [last] = await db.select({ folio: fieldNotes.folio }).from(fieldNotes).orderBy(desc(fieldNotes.id)).limit(1);
  if (!last?.folio) return "NC-000001";
  const num = parseInt(last.folio.replace("NC-", ""), 10);
  return `NC-${String(num + 1).padStart(6, "0")}`;
}

// ============================================================
// Menú principal para colaboradores
// ============================================================
function getMainMenu() {
  return [
    [{ text: "📋 Mis Tareas", callback_data: "collab_tasks" }],
    [{ text: "📝 Reportar Problema", callback_data: "collab_new_note" }],
    [{ text: "🔍 Notas Abiertas", callback_data: "collab_open_notes" }],
    [{ text: "👤 Mi Perfil", callback_data: "collab_profile" }],
  ];
}

// ============================================================
// Manejo de updates (llamado desde el bot principal)
// ============================================================
export async function handleCollaboratorUpdate(botToken: string, update: any): Promise<boolean> {
  // Retorna true si fue manejado como colaborador, false si no
  const message = update.message;
  const callbackQuery = update.callback_query;

  let chatId: string;
  if (callbackQuery) {
    chatId = String(callbackQuery.message?.chat?.id);
  } else if (message) {
    chatId = String(message.chat.id);
    if (message.chat.type !== "private") return false;
  } else {
    return false;
  }

  // Verificar si hay una conversación activa de colaborador
  const activeConv = collabConversations.get(chatId);
  if (activeConv) {
    if (callbackQuery) {
      await answerCallbackQuery(botToken, callbackQuery.id);
      await handleCollabCallback(botToken, chatId, callbackQuery, activeConv);
    } else if (message) {
      activeConv.lastActivity = Date.now();
      await handleCollabMessage(botToken, chatId, message, activeConv);
    }
    return true;
  }

  // Verificar si es un callback de colaborador
  if (callbackQuery?.data?.startsWith("collab_")) {
    const collab = await getCollaboratorByChatId(chatId);
    if (!collab) return false;
    await answerCallbackQuery(botToken, callbackQuery.id);
    await handleCollabCallback(botToken, chatId, callbackQuery, null);
    return true;
  }

  // Verificar si es un colaborador vinculado (para mensajes de texto)
  const collab = await getCollaboratorByChatId(chatId);
  if (collab) {
    // Es un colaborador, manejar
    if (message) {
      const text = message.text?.trim() || "";
      if (text === "/start") {
        await sendMessage(botToken, chatId,
          `🌾 <b>AGRA-TECTI — Colaborador</b>\n\n` +
          `¡Hola <b>${collab.name}</b>! 👋\n\n` +
          `Soy tu asistente de campo. Desde aquí puedes:\n\n` +
          `📋 Ver y gestionar tus <b>tareas asignadas</b>\n` +
          `📝 <b>Reportar problemas</b> en las parcelas\n` +
          `🔍 Dar <b>seguimiento</b> a notas abiertas\n\n` +
          `Selecciona una opción:`,
          { inline_keyboard: getMainMenu() }
        );
        return true;
      }
    }
    // Mostrar menú por defecto
    if (message && !message.photo && !message.location) {
      await sendMessage(botToken, chatId,
        `🌾 <b>AGRA-TECTI</b>\n\n¿Qué deseas hacer, <b>${collab.name}</b>?`,
        { inline_keyboard: getMainMenu() }
      );
      return true;
    }
    return false; // Dejar que el bot principal maneje fotos/ubicación si no hay conversación
  }

  // Verificar si está intentando vincular con código de colaborador
  if (message?.text) {
    const text = message.text.trim();
    // Intentar vincular si es un código de 6 dígitos
    if (/^\d{6}$/.test(text)) {
      const linked = await tryLinkCollaborator(botToken, chatId, text, message.from);
      if (linked) return true;
    }
  }

  return false; // No es un colaborador
}

// ============================================================
// Vinculación de colaborador
// ============================================================
async function tryLinkCollaborator(botToken: string, chatId: string, code: string, from: any): Promise<boolean> {
  const db = await getDb();
  const [linkCode] = await db.select()
    .from(collaboratorLinkCodes)
    .where(and(
      eq(collaboratorLinkCodes.code, code),
      eq(collaboratorLinkCodes.used, false),
      gt(collaboratorLinkCodes.expiresAt, new Date()),
    ));

  if (!linkCode) return false; // No es un código de colaborador válido

  // Vincular
  await db.update(collaborators).set({
    telegramChatId: chatId,
    telegramUsername: from?.username || from?.first_name || null,
    telegramLinkedAt: new Date(),
  }).where(eq(collaborators.id, linkCode.collaboratorId));

  await db.update(collaboratorLinkCodes).set({ used: true }).where(eq(collaboratorLinkCodes.id, linkCode.id));

  const [collab] = await db.select({ name: collaborators.name }).from(collaborators).where(eq(collaborators.id, linkCode.collaboratorId));

  await sendMessage(botToken, chatId,
    `✅ <b>¡Bienvenido al equipo!</b>\n\n` +
    `Hola <b>${collab?.name || "colaborador"}</b>, tu cuenta ha sido vinculada exitosamente.\n\n` +
    `🌾 Desde aquí podrás:\n` +
    `• Ver y gestionar tus tareas asignadas\n` +
    `• Reportar problemas en las parcelas\n` +
    `• Dar seguimiento a notas abiertas\n\n` +
    `¡Comencemos!`,
    { inline_keyboard: getMainMenu() }
  );
  return true;
}

// ============================================================
// Manejo de callbacks (botones inline)
// ============================================================
async function handleCollabCallback(botToken: string, chatId: string, callbackQuery: any, conv: CollabConversation | null) {
  const data = callbackQuery.data;
  const messageId = callbackQuery.message?.message_id;
  const collab = await getCollaboratorByChatId(chatId);
  if (!collab) return;

  // ---- MENÚ PRINCIPAL ----
  if (data === "collab_menu") {
    collabConversations.delete(chatId);
    await sendMessage(botToken, chatId,
      `🌾 <b>AGRA-TECTI</b>\n\n¿Qué deseas hacer, <b>${collab.name}</b>?`,
      { inline_keyboard: getMainMenu() }
    );
    return;
  }

  // ---- MIS TAREAS ----
  if (data === "collab_tasks") {
    await showTasks(botToken, chatId, collab.id);
    return;
  }

  // Ver detalle de tarea
  if (data.startsWith("collab_task_")) {
    const assignmentId = parseInt(data.replace("collab_task_", ""));
    await showTaskDetail(botToken, chatId, assignmentId, collab.id);
    return;
  }

  // Iniciar tarea
  if (data.startsWith("collab_start_")) {
    const assignmentId = parseInt(data.replace("collab_start_", ""));
    await startTask(botToken, chatId, assignmentId, collab.id);
    return;
  }

  // Completar tarea (pedir evidencia)
  if (data.startsWith("collab_complete_")) {
    const assignmentId = parseInt(data.replace("collab_complete_", ""));
    collabConversations.set(chatId, {
      step: "waiting_evidence_photo",
      data: { assignmentId },
      collaboratorId: collab.id,
      lastActivity: Date.now(),
    });
    await sendMessage(botToken, chatId,
      `📸 <b>Completar tarea</b>\n\n` +
      `Por favor, envía una <b>foto de evidencia</b> del trabajo realizado.\n\n` +
      `💡 <i>Puedes agregar un comentario como pie de foto.</i>`,
      { inline_keyboard: [
        [{ text: "⏭️ Completar sin foto", callback_data: "collab_skip_photo" }],
        [{ text: "❌ Cancelar", callback_data: "collab_menu" }],
      ]}
    );
    return;
  }

  // Completar sin foto
  if (data === "collab_skip_photo") {
    const conv2 = collabConversations.get(chatId);
    if (conv2 && conv2.step === "waiting_evidence_photo") {
      conv2.step = "waiting_evidence_notes";
      await sendMessage(botToken, chatId,
        `📝 <b>Notas de evidencia</b>\n\n` +
        `¿Deseas agregar algún comentario sobre el trabajo realizado?\n\n` +
        `Escribe tu comentario o presiona "Omitir":`,
        { inline_keyboard: [
          [{ text: "⏭️ Omitir comentario", callback_data: "collab_skip_notes" }],
          [{ text: "❌ Cancelar", callback_data: "collab_menu" }],
        ]}
      );
    }
    return;
  }

  // Omitir notas
  if (data === "collab_skip_notes") {
    const conv2 = collabConversations.get(chatId);
    if (conv2) {
      await completeTask(botToken, chatId, conv2);
    }
    return;
  }

  // Cancelar tarea
  if (data.startsWith("collab_cancel_task_")) {
    const assignmentId = parseInt(data.replace("collab_cancel_task_", ""));
    await cancelTask(botToken, chatId, assignmentId, collab.id);
    return;
  }

  // ---- NUEVA NOTA DE CAMPO ----
  if (data === "collab_new_note") {
    collabConversations.set(chatId, {
      step: "waiting_note_category",
      data: {},
      collaboratorId: collab.id,
      lastActivity: Date.now(),
    });
    const categoryButtons = Object.entries(CATEGORIES).map(([key, val]) => (
      [{ text: `${val.emoji} ${val.label}`, callback_data: `collab_cat_${key}` }]
    ));
    categoryButtons.push([{ text: "❌ Cancelar", callback_data: "collab_menu" }]);
    await sendMessage(botToken, chatId,
      `📝 <b>Reportar problema</b>\n\n` +
      `Selecciona la categoría del problema:`,
      { inline_keyboard: categoryButtons }
    );
    return;
  }

  // Seleccionar categoría de nota
  if (data.startsWith("collab_cat_")) {
    const category = data.replace("collab_cat_", "");
    const conv2 = collabConversations.get(chatId);
    if (conv2) {
      conv2.data.category = category;
      conv2.step = "waiting_note_description";
      const catInfo = CATEGORIES[category] || { emoji: "📋", label: category };
      await sendMessage(botToken, chatId,
        `${catInfo.emoji} <b>${catInfo.label}</b>\n\n` +
        `Ahora describe el problema que observas.\n\n` +
        `💡 <i>Sé lo más detallado posible: qué ves, dónde está, qué tan grave es.</i>`,
        { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "collab_menu" }]] }
      );
    }
    return;
  }

  // Seleccionar prioridad de nota
  if (data.startsWith("collab_pri_")) {
    const priority = data.replace("collab_pri_", "");
    const conv2 = collabConversations.get(chatId);
    if (conv2) {
      conv2.data.priority = priority;
      conv2.step = "waiting_note_parcel";
      // Mostrar parcelas
      const parcelList = await getActiveParcels();
      if (parcelList.length === 0) {
        conv2.data.parcelId = null;
        await finishNote(botToken, chatId, conv2);
        return;
      }
      const parcelButtons = parcelList.map(p => (
        [{ text: `🗺️ ${p.name}`, callback_data: `collab_parcel_${p.id}` }]
      ));
      parcelButtons.push([{ text: "⏭️ Sin parcela específica", callback_data: "collab_parcel_none" }]);
      parcelButtons.push([{ text: "❌ Cancelar", callback_data: "collab_menu" }]);
      await sendMessage(botToken, chatId,
        `🗺️ <b>¿En qué parcela?</b>\n\nSelecciona la parcela donde observaste el problema:`,
        { inline_keyboard: parcelButtons }
      );
    }
    return;
  }

  // Seleccionar parcela
  if (data.startsWith("collab_parcel_")) {
    const conv2 = collabConversations.get(chatId);
    if (conv2) {
      const val = data.replace("collab_parcel_", "");
      conv2.data.parcelId = val === "none" ? null : parseInt(val);
      await finishNote(botToken, chatId, conv2);
    }
    return;
  }

  // Omitir foto de nota
  if (data === "collab_note_skip_photo") {
    const conv2 = collabConversations.get(chatId);
    if (conv2) {
      conv2.step = "waiting_note_location";
      await askNoteLocation(botToken, chatId);
    }
    return;
  }

  // Omitir ubicación de nota
  if (data === "collab_note_skip_location") {
    const conv2 = collabConversations.get(chatId);
    if (conv2) {
      conv2.step = "waiting_note_priority";
      await askNotePriority(botToken, chatId);
    }
    return;
  }

  // ---- NOTAS ABIERTAS ----
  if (data === "collab_open_notes") {
    await showOpenNotes(botToken, chatId, collab.id);
    return;
  }

  // Ver detalle de nota
  if (data.startsWith("collab_note_")) {
    const noteId = parseInt(data.replace("collab_note_", ""));
    await showNoteDetail(botToken, chatId, noteId, collab.id);
    return;
  }

  // ---- CAMBIAR ESTADO DE NOTA: En proceso ----
  if (data.startsWith("collab_note_progress_")) {
    const noteId = parseInt(data.replace("collab_note_progress_", ""));
    await changeNoteStatus(botToken, chatId, noteId, "en_progreso", collab);
    return;
  }

  // ---- CAMBIAR ESTADO DE NOTA: En revisión ----
  if (data.startsWith("collab_note_review_")) {
    const noteId = parseInt(data.replace("collab_note_review_", ""));
    await changeNoteStatus(botToken, chatId, noteId, "en_revision", collab);
    return;
  }

  // ---- RESOLVER NOTA: Pedir evidencia ----
  if (data.startsWith("collab_note_resolve_")) {
    const noteId = parseInt(data.replace("collab_note_resolve_", ""));
    collabConversations.set(chatId, {
      step: "waiting_resolve_photo",
      data: { noteId },
      collaboratorId: collab.id,
      lastActivity: Date.now(),
    });
    await sendMessage(botToken, chatId,
      `\u2705 <b>Resolver nota</b>\n\n` +
      `Para marcar esta nota como resuelta, env\u00eda una <b>foto de evidencia</b> de c\u00f3mo se solucion\u00f3 el problema.\n\n` +
      `\ud83d\udca1 <i>Puedes agregar un comentario como pie de foto.</i>`,
      { inline_keyboard: [
        [{ text: "\u23ed\ufe0f Resolver sin foto", callback_data: "collab_resolve_skip_photo" }],
        [{ text: "\u274c Cancelar", callback_data: "collab_menu" }],
      ]}
    );
    return;
  }

  // Resolver sin foto
  if (data === "collab_resolve_skip_photo") {
    const conv2 = collabConversations.get(chatId);
    if (conv2 && conv2.step === "waiting_resolve_photo") {
      conv2.step = "waiting_resolve_notes";
      await sendMessage(botToken, chatId,
        `\ud83d\udcdd <b>Notas de resoluci\u00f3n</b>\n\n` +
        `\u00bfC\u00f3mo se solucion\u00f3 el problema? Escribe una breve descripci\u00f3n:`,
        { inline_keyboard: [
          [{ text: "\u23ed\ufe0f Omitir descripci\u00f3n", callback_data: "collab_resolve_skip_notes" }],
          [{ text: "\u274c Cancelar", callback_data: "collab_menu" }],
        ]}
      );
    }
    return;
  }

  // Omitir notas de resolución
  if (data === "collab_resolve_skip_notes") {
    const conv2 = collabConversations.get(chatId);
    if (conv2) {
      await resolveNote(botToken, chatId, conv2);
    }
    return;
  }

  // Agregar foto a nota existente
  if (data.startsWith("collab_addphoto_")) {
    const noteId = parseInt(data.replace("collab_addphoto_", ""));
    collabConversations.set(chatId, {
      step: "waiting_followup_photo",
      data: { noteId },
      collaboratorId: collab.id,
      lastActivity: Date.now(),
    });
    await sendMessage(botToken, chatId,
      `📸 <b>Agregar foto de seguimiento</b>\n\n` +
      `Envía la foto que deseas agregar a esta nota.\n\n` +
      `💡 <i>Puedes agregar un comentario como pie de foto.</i>`,
      { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "collab_menu" }]] }
    );
    return;
  }

  // ---- PERFIL ----
  if (data === "collab_profile") {
    await showProfile(botToken, chatId, collab);
    return;
  }
}

// ============================================================
// Manejo de mensajes de texto/fotos/ubicación
// ============================================================
async function handleCollabMessage(botToken: string, chatId: string, message: any, conv: CollabConversation) {
  const text = message.text?.trim() || "";
  const photo = message.photo;
  const location = message.location;

  // ---- EVIDENCIA DE TAREA ----
  if (conv.step === "waiting_evidence_photo") {
    if (photo) {
      const fileId = photo[photo.length - 1].file_id;
      const photoBuffer = await downloadFile(botToken, fileId);
      if (photoBuffer) {
        const dir = `/app/photos/collaborator-evidence`;
        fs.mkdirSync(dir, { recursive: true });
        const filename = `evidence-${conv.data.assignmentId}-${Date.now()}.jpg`;
        const filepath = path.join(dir, filename);
        fs.writeFileSync(filepath, photoBuffer);
        conv.data.evidencePhotoPath = filepath;
        conv.data.evidenceNotes = message.caption || "";
      }
      conv.step = "waiting_evidence_notes";
      if (message.caption) {
        // Ya tiene notas del caption
        await completeTask(botToken, chatId, conv);
      } else {
        await sendMessage(botToken, chatId,
          `✅ <b>Foto recibida</b>\n\n` +
          `¿Deseas agregar algún comentario sobre el trabajo realizado?`,
          { inline_keyboard: [
            [{ text: "⏭️ Omitir comentario", callback_data: "collab_skip_notes" }],
            [{ text: "❌ Cancelar", callback_data: "collab_menu" }],
          ]}
        );
      }
      return;
    }
    await sendMessage(botToken, chatId,
      `📸 Por favor envía una <b>foto</b> o presiona "Completar sin foto":`,
      { inline_keyboard: [
        [{ text: "⏭️ Completar sin foto", callback_data: "collab_skip_photo" }],
        [{ text: "❌ Cancelar", callback_data: "collab_menu" }],
      ]}
    );
    return;
  }

  if (conv.step === "waiting_evidence_notes") {
    if (text) {
      conv.data.evidenceNotes = text;
    }
    await completeTask(botToken, chatId, conv);
    return;
  }

  // ---- NUEVA NOTA: DESCRIPCIÓN ----
  if (conv.step === "waiting_note_description") {
    if (text) {
      conv.data.description = text;
      conv.step = "waiting_note_photo";
      await sendMessage(botToken, chatId,
        `📸 <b>Foto del problema</b>\n\n` +
        `Envía una foto del problema que observas.\n\n` +
        `💡 <i>Una buena foto ayuda a resolver más rápido.</i>`,
        { inline_keyboard: [
          [{ text: "⏭️ Continuar sin foto", callback_data: "collab_note_skip_photo" }],
          [{ text: "❌ Cancelar", callback_data: "collab_menu" }],
        ]}
      );
    } else {
      await sendMessage(botToken, chatId,
        `✏️ Por favor escribe una <b>descripción</b> del problema:`,
        { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "collab_menu" }]] }
      );
    }
    return;
  }

  // ---- NUEVA NOTA: FOTO ----
  if (conv.step === "waiting_note_photo") {
    if (photo) {
      const fileId = photo[photo.length - 1].file_id;
      const photoBuffer = await downloadFile(botToken, fileId);
      if (photoBuffer) {
        conv.data.photoBuffer = photoBuffer;
        if (message.caption && !conv.data.description) {
          conv.data.description = message.caption;
        }
      }
      await sendMessage(botToken, chatId, `✅ Foto recibida.`);
    }
    conv.step = "waiting_note_location";
    await askNoteLocation(botToken, chatId);
    return;
  }

  // ---- NUEVA NOTA: UBICACIÓN ----
  if (conv.step === "waiting_note_location") {
    if (location) {
      conv.data.latitude = location.latitude;
      conv.data.longitude = location.longitude;
      await sendMessage(botToken, chatId, `📍 Ubicación registrada.`, { remove_keyboard: true });
    }
    conv.step = "waiting_note_priority";
    await askNotePriority(botToken, chatId);
    return;
  }

  // ---- RESOLUCIÓN DE NOTA: FOTO ----
  if (conv.step === "waiting_resolve_photo") {
    if (photo) {
      const fileId = photo[photo.length - 1].file_id;
      const photoBuffer = await downloadFile(botToken, fileId);
      if (photoBuffer) {
        conv.data.resolvePhotoBuffer = photoBuffer;
        conv.data.resolveNotes = message.caption || "";
      }
      if (message.caption) {
        // Ya tiene notas del caption, resolver directamente
        await resolveNote(botToken, chatId, conv);
      } else {
        conv.step = "waiting_resolve_notes";
        await sendMessage(botToken, chatId,
          `\u2705 <b>Foto recibida</b>\n\n` +
          `\u00bfC\u00f3mo se solucion\u00f3 el problema? Escribe una breve descripci\u00f3n:`,
          { inline_keyboard: [
            [{ text: "\u23ed\ufe0f Omitir descripci\u00f3n", callback_data: "collab_resolve_skip_notes" }],
            [{ text: "\u274c Cancelar", callback_data: "collab_menu" }],
          ]}
        );
      }
      return;
    }
    await sendMessage(botToken, chatId,
      `\ud83d\udcf8 Por favor env\u00eda una <b>foto de evidencia</b> o presiona \"Resolver sin foto\":`,
      { inline_keyboard: [
        [{ text: "\u23ed\ufe0f Resolver sin foto", callback_data: "collab_resolve_skip_photo" }],
        [{ text: "\u274c Cancelar", callback_data: "collab_menu" }],
      ]}
    );
    return;
  }

  // ---- RESOLUCIÓN DE NOTA: NOTAS ----
  if (conv.step === "waiting_resolve_notes") {
    if (text) {
      conv.data.resolveNotes = text;
    }
    await resolveNote(botToken, chatId, conv);
    return;
  }

  // ---- FOTO DE SEGUIMIENTO ----
  if (conv.step === "waiting_followup_photo") {
    if (photo) {
      const fileId = photo[photo.length - 1].file_id;
      const photoBuffer = await downloadFile(botToken, fileId);
      if (photoBuffer) {
        await saveFollowupPhoto(conv.data.noteId, photoBuffer, message.caption);
        collabConversations.delete(chatId);
        await sendMessage(botToken, chatId,
          `✅ <b>Foto de seguimiento agregada</b>\n\n` +
          `La foto se ha guardado correctamente.`,
          { inline_keyboard: [
            [{ text: "🔍 Ver nota", callback_data: `collab_note_${conv.data.noteId}` }],
            [{ text: "🏠 Menú principal", callback_data: "collab_menu" }],
          ]}
        );
        return;
      }
    }
    await sendMessage(botToken, chatId,
      `📸 Por favor envía una <b>foto</b>:`,
      { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "collab_menu" }]] }
    );
    return;
  }

  // Default: mostrar menú
  collabConversations.delete(chatId);
  const collab = await getCollaboratorByChatId(chatId);
  await sendMessage(botToken, chatId,
    `🌾 <b>AGRA-TECTI</b>\n\n¿Qué deseas hacer, <b>${collab?.name || "colaborador"}</b>?`,
    { inline_keyboard: getMainMenu() }
  );
}

// ============================================================
// Funciones de tareas
// ============================================================
async function showTasks(botToken: string, chatId: string, collaboratorId: number) {
  const db = await getDb();
  const assignments = await db.select()
    .from(fieldActivityAssignments)
    .where(and(
      eq(fieldActivityAssignments.collaboratorId, collaboratorId),
      or(
        eq(fieldActivityAssignments.status, "pendiente"),
        eq(fieldActivityAssignments.status, "en_progreso"),
      ),
    ))
    .orderBy(desc(fieldActivityAssignments.createdAt));

  if (assignments.length === 0) {
    await sendMessage(botToken, chatId,
      `📋 <b>Mis Tareas</b>\n\n` +
      `No tienes tareas pendientes. ¡Buen trabajo! 🎉\n\n` +
      `Cuando te asignen una nueva tarea, recibirás una notificación aquí.`,
      { inline_keyboard: [[{ text: "🏠 Menú principal", callback_data: "collab_menu" }]] }
    );
    return;
  }

  let msg = `📋 <b>Mis Tareas</b> (${assignments.length})\n\n`;
  const buttons: any[] = [];

  for (const a of assignments) {
    const [activity] = await db.select().from(fieldActivities).where(eq(fieldActivities.id, a.activityId));
    if (!activity) continue;
    const typeInfo = ACTIVITY_TYPES[activity.activityType] || { emoji: "📋", label: activity.activityType };
    const statusInfo = STATUS_LABELS[a.status] || { emoji: "❓", label: a.status };
    msg += `${statusInfo.emoji} <b>${typeInfo.emoji} ${typeInfo.label}</b>\n`;
    msg += `   📅 ${activity.activityDate}\n`;
    msg += `   ${activity.description.substring(0, 60)}${activity.description.length > 60 ? "..." : ""}\n\n`;
    buttons.push([{ text: `${statusInfo.emoji} ${typeInfo.label} — ${activity.activityDate}`, callback_data: `collab_task_${a.id}` }]);
  }

  buttons.push([{ text: "🏠 Menú principal", callback_data: "collab_menu" }]);
  await sendMessage(botToken, chatId, msg, { inline_keyboard: buttons });
}

async function showTaskDetail(botToken: string, chatId: string, assignmentId: number, collaboratorId: number) {
  const db = await getDb();
  const [assignment] = await db.select().from(fieldActivityAssignments).where(eq(fieldActivityAssignments.id, assignmentId));
  if (!assignment || assignment.collaboratorId !== collaboratorId) {
    await sendMessage(botToken, chatId, "❌ Tarea no encontrada.", { inline_keyboard: [[{ text: "🏠 Menú", callback_data: "collab_menu" }]] });
    return;
  }

  const [activity] = await db.select().from(fieldActivities).where(eq(fieldActivities.id, assignment.activityId));
  if (!activity) {
    await sendMessage(botToken, chatId, "❌ Actividad no encontrada.", { inline_keyboard: [[{ text: "🏠 Menú", callback_data: "collab_menu" }]] });
    return;
  }

  // Obtener parcelas
  const actParcels = await db.select().from(fieldActivityParcels).where(eq(fieldActivityParcels.activityId, activity.id));
  let parcelNames = "Sin parcela asignada";
  if (actParcels.length > 0) {
    const parcelIds = actParcels.map(p => p.parcelId);
    const parcelRows = await db.select({ name: parcels.name }).from(parcels).where(inArray(parcels.id, parcelIds));
    parcelNames = parcelRows.map(p => p.name).join(", ");
  }

  const typeInfo = ACTIVITY_TYPES[activity.activityType] || { emoji: "📋", label: activity.activityType };
  const statusInfo = STATUS_LABELS[assignment.status] || { emoji: "❓", label: assignment.status };

  let msg = `${typeInfo.emoji} <b>${typeInfo.label}</b>\n\n`;
  msg += `📅 <b>Fecha:</b> ${activity.activityDate}\n`;
  msg += `⏰ <b>Horario:</b> ${activity.startTime || "—"} a ${activity.endTime || "—"}\n`;
  msg += `🗺️ <b>Parcelas:</b> ${parcelNames}\n`;
  msg += `📊 <b>Estado:</b> ${statusInfo.emoji} ${statusInfo.label}\n\n`;
  msg += `📝 <b>Descripción:</b>\n${activity.description}\n`;

  if (activity.weatherCondition) {
    msg += `\n🌤️ <b>Clima:</b> ${activity.weatherCondition}`;
  }

  const buttons: any[] = [];
  if (assignment.status === "pendiente") {
    buttons.push([{ text: "▶️ Iniciar tarea", callback_data: `collab_start_${assignmentId}` }]);
    buttons.push([{ text: "❌ No puedo realizarla", callback_data: `collab_cancel_task_${assignmentId}` }]);
  } else if (assignment.status === "en_progreso") {
    buttons.push([{ text: "✅ Completar tarea", callback_data: `collab_complete_${assignmentId}` }]);
    buttons.push([{ text: "❌ Cancelar tarea", callback_data: `collab_cancel_task_${assignmentId}` }]);
  }
  buttons.push([{ text: "📋 Mis tareas", callback_data: "collab_tasks" }]);
  buttons.push([{ text: "🏠 Menú principal", callback_data: "collab_menu" }]);

  await sendMessage(botToken, chatId, msg, { inline_keyboard: buttons });
}

async function startTask(botToken: string, chatId: string, assignmentId: number, collaboratorId: number) {
  const db = await getDb();
  const [assignment] = await db.select().from(fieldActivityAssignments).where(eq(fieldActivityAssignments.id, assignmentId));
  if (!assignment || assignment.collaboratorId !== collaboratorId) return;

  await db.update(fieldActivityAssignments).set({
    status: "en_progreso",
    startedAt: new Date(),
  }).where(eq(fieldActivityAssignments.id, assignmentId));

  // Actualizar también la actividad padre si estaba planificada
  await db.update(fieldActivities).set({
    status: "en_progreso",
  }).where(and(
    eq(fieldActivities.id, assignment.activityId),
    eq(fieldActivities.status, "planificada"),
  ));

  await sendMessage(botToken, chatId,
    `▶️ <b>¡Tarea iniciada!</b>\n\n` +
    `Se ha registrado el inicio de tu tarea.\n` +
    `Cuando termines, presiona "Completar" para enviar la evidencia.`,
    { inline_keyboard: [
      [{ text: "✅ Completar tarea", callback_data: `collab_complete_${assignmentId}` }],
      [{ text: "📋 Mis tareas", callback_data: "collab_tasks" }],
      [{ text: "🏠 Menú principal", callback_data: "collab_menu" }],
    ]}
  );
}

async function completeTask(botToken: string, chatId: string, conv: CollabConversation) {
  const db = await getDb();
  const assignmentId = conv.data.assignmentId;

  const updateData: any = {
    status: "completada",
    completedAt: new Date(),
  };
  if (conv.data.evidencePhotoPath) updateData.evidencePhotoPath = conv.data.evidencePhotoPath;
  if (conv.data.evidenceNotes) updateData.evidenceNotes = conv.data.evidenceNotes;

  await db.update(fieldActivityAssignments).set(updateData).where(eq(fieldActivityAssignments.id, assignmentId));

  // Verificar si todas las asignaciones de la actividad están completadas
  const [assignment] = await db.select().from(fieldActivityAssignments).where(eq(fieldActivityAssignments.id, assignmentId));
  if (assignment) {
    const allAssignments = await db.select().from(fieldActivityAssignments).where(eq(fieldActivityAssignments.activityId, assignment.activityId));
    const allCompleted = allAssignments.every(a => a.status === "completada" || a.status === "cancelada");
    if (allCompleted) {
      await db.update(fieldActivities).set({ status: "completada" }).where(eq(fieldActivities.id, assignment.activityId));
    }
  }

  collabConversations.delete(chatId);

  await sendMessage(botToken, chatId,
    `✅ <b>¡Tarea completada!</b> 🎉\n\n` +
    `Se ha registrado la finalización de tu tarea` +
    (conv.data.evidencePhotoPath ? ` con foto de evidencia` : ``) +
    (conv.data.evidenceNotes ? ` y comentarios` : ``) +
    `.\n\n¡Excelente trabajo!`,
    { inline_keyboard: [
      [{ text: "📋 Mis tareas", callback_data: "collab_tasks" }],
      [{ text: "🏠 Menú principal", callback_data: "collab_menu" }],
    ]}
  );

  // Notificar al grupo de notas de campo
  try {
    await notifyGroupTaskCompleted(conv.data.assignmentId);
  } catch (err) {
    console.error("[Collab Bot] Error notificando completación:", err);
  }
}

async function cancelTask(botToken: string, chatId: string, assignmentId: number, collaboratorId: number) {
  const db = await getDb();
  const [assignment] = await db.select().from(fieldActivityAssignments).where(eq(fieldActivityAssignments.id, assignmentId));
  if (!assignment || assignment.collaboratorId !== collaboratorId) return;

  await db.update(fieldActivityAssignments).set({
    status: "cancelada",
  }).where(eq(fieldActivityAssignments.id, assignmentId));

  await sendMessage(botToken, chatId,
    `❌ <b>Tarea cancelada</b>\n\n` +
    `Se ha registrado que no puedes realizar esta tarea.`,
    { inline_keyboard: [
      [{ text: "📋 Mis tareas", callback_data: "collab_tasks" }],
      [{ text: "🏠 Menú principal", callback_data: "collab_menu" }],
    ]}
  );
}

// ============================================================
// Funciones de notas de campo
// ============================================================
async function askNoteLocation(botToken: string, chatId: string) {
  await sendMessage(botToken, chatId,
    `📍 <b>Ubicación</b>\n\n` +
    `Comparte tu ubicación actual para registrar dónde está el problema.\n\n` +
    `💡 <i>Presiona el clip 📎 → Ubicación → Enviar mi ubicación actual</i>`,
    { inline_keyboard: [
      [{ text: "⏭️ Omitir ubicación", callback_data: "collab_note_skip_location" }],
      [{ text: "❌ Cancelar", callback_data: "collab_menu" }],
    ]}
  );
}

async function askNotePriority(botToken: string, chatId: string) {
  const buttons = Object.entries(PRIORITIES).map(([key, val]) => (
    [{ text: `${val.emoji} ${val.label}`, callback_data: `collab_pri_${key}` }]
  ));
  buttons.push([{ text: "❌ Cancelar", callback_data: "collab_menu" }]);
  await sendMessage(botToken, chatId,
    `⚠️ <b>Prioridad</b>\n\n` +
    `¿Qué tan urgente es este problema?\n\n` +
    `🟢 <b>Baja</b> — No es urgente\n` +
    `🟡 <b>Media</b> — Necesita atención pronto\n` +
    `🟠 <b>Alta</b> — Requiere atención rápida\n` +
    `🔴 <b>Crítica</b> — Atención inmediata`,
    { inline_keyboard: buttons }
  );
}

async function finishNote(botToken: string, chatId: string, conv: CollabConversation) {
  try {
    const db = await getDb();
    const folio = await generateFolio();

    // Crear la nota
    const [result] = await db.insert(fieldNotes).values({
      folio,
      description: conv.data.description || "Sin descripción",
      category: conv.data.category as any,
      severity: (conv.data.priority || "media") as any,
      status: "abierta",
      parcelId: conv.data.parcelId || null,
      latitude: conv.data.latitude ? String(conv.data.latitude) : null,
      longitude: conv.data.longitude ? String(conv.data.longitude) : null,
      reportedByUserId: 0, // 0 = reportado por colaborador
    });

    const noteId = result.insertId;

    // Guardar foto si existe
    if (conv.data.photoBuffer) {
      const dir = `/app/photos/field-notes/${folio}`;
      fs.mkdirSync(dir, { recursive: true });
      const filename = `reporte-${Date.now()}.jpg`;
      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, conv.data.photoBuffer);
      await db.insert(fieldNotePhotos).values({
        fieldNoteId: noteId,
        photoPath: filepath,
        stage: "reporte",
        uploadedByUserId: 0,
      });
    }

    // Obtener nombre de parcela
    let parcelName = "";
    if (conv.data.parcelId) {
      const [p] = await db.select({ name: parcels.name }).from(parcels).where(eq(parcels.id, conv.data.parcelId));
      parcelName = p?.name || "";
    }

    const catInfo = CATEGORIES[conv.data.category] || { emoji: "📋", label: conv.data.category };
    const priInfo = PRIORITIES[conv.data.priority || "media"] || { emoji: "🟡", label: "Media" };

    collabConversations.delete(chatId);

    await sendMessage(botToken, chatId,
      `✅ <b>¡Nota creada!</b>\n\n` +
      `📋 <b>Folio:</b> ${folio}\n` +
      `${catInfo.emoji} <b>Categoría:</b> ${catInfo.label}\n` +
      `${priInfo.emoji} <b>Prioridad:</b> ${priInfo.label}\n` +
      (parcelName ? `🗺️ <b>Parcela:</b> ${parcelName}\n` : ``) +
      `\n📝 ${conv.data.description}\n\n` +
      `Se notificará al equipo para su atención. ¡Gracias por reportar! 🙏`,
      { inline_keyboard: [
        [{ text: "📝 Reportar otro problema", callback_data: "collab_new_note" }],
        [{ text: "🏠 Menú principal", callback_data: "collab_menu" }],
      ]}
    );

    // Notificar al grupo
    try {
      const collab = await getCollaboratorByChatId(chatId);
      const { notifyGroupNewNoteFromWeb } = await import("./telegramFieldNotesBot");
      await notifyGroupNewNoteFromWeb(
        noteId,
        folio,
        conv.data.description || "",
        conv.data.category || "",
        conv.data.priority || "media",
        parcelName || undefined,
        collab?.name ? `${collab.name} (colaborador)` : "Colaborador",
        conv.data.photoBuffer ? `/app/photos/field-notes/${folio}/reporte-${Date.now()}.jpg` : undefined,
      );
    } catch (err) {
      console.error("[Collab Bot] Error notificando al grupo:", err);
    }

  } catch (error) {
    console.error("[Collab Bot] Error creando nota:", error);
    collabConversations.delete(chatId);
    await sendMessage(botToken, chatId,
      `❌ <b>Error al crear la nota</b>\n\nPor favor intenta de nuevo.`,
      { inline_keyboard: getMainMenu() }
    );
  }
}

async function saveFollowupPhoto(noteId: number, photoBuffer: Buffer, caption?: string) {
  const db = await getDb();
  const [note] = await db.select({ folio: fieldNotes.folio }).from(fieldNotes).where(eq(fieldNotes.id, noteId));
  if (!note) return;

  const dir = `/app/photos/field-notes/${note.folio}`;
  fs.mkdirSync(dir, { recursive: true });
  const filename = `seguimiento-${Date.now()}.jpg`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, photoBuffer);

  await db.insert(fieldNotePhotos).values({
    fieldNoteId: noteId,
    photoPath: filepath,
    caption: caption || null,
    stage: "revision",
    uploadedByUserId: 0,
  });
}

// ============================================================
// Funciones de notas abiertas
// ============================================================
async function showOpenNotes(botToken: string, chatId: string, collaboratorId: number) {
  const db = await getDb();
  const notes = await db.select()
    .from(fieldNotes)
    .where(or(
      eq(fieldNotes.status, "abierta"),
      eq(fieldNotes.status, "en_revision"),
      eq(fieldNotes.status, "en_progreso"),
    ))
    .orderBy(desc(fieldNotes.createdAt))
    .limit(15);

  if (notes.length === 0) {
    await sendMessage(botToken, chatId,
      `🔍 <b>Notas Abiertas</b>\n\n` +
      `No hay notas abiertas en este momento. ¡Todo en orden! ✨`,
      { inline_keyboard: [[{ text: "🏠 Menú principal", callback_data: "collab_menu" }]] }
    );
    return;
  }

  let msg = `🔍 <b>Notas Abiertas</b> (${notes.length})\n\n`;
  const buttons: any[] = [];

  for (const note of notes) {
    const catInfo = CATEGORIES[(note as any).category] || { emoji: "📋", label: (note as any).category };
    const sevInfo = PRIORITIES[(note as any).severity] || { emoji: "🟡", label: (note as any).severity };
    msg += `${sevInfo.emoji} <b>${note.folio}</b> — ${catInfo.emoji} ${catInfo.label}\n`;
    msg += `   ${note.description.substring(0, 50)}${note.description.length > 50 ? "..." : ""}\n\n`;
    buttons.push([{ text: `${sevInfo.emoji} ${note.folio} — ${catInfo.label}`, callback_data: `collab_note_${note.id}` }]);
  }

  buttons.push([{ text: "🏠 Menú principal", callback_data: "collab_menu" }]);
  await sendMessage(botToken, chatId, msg, { inline_keyboard: buttons });
}

async function showNoteDetail(botToken: string, chatId: string, noteId: number, collaboratorId: number) {
  const db = await getDb();
  const [note] = await db.select().from(fieldNotes).where(eq(fieldNotes.id, noteId));
  if (!note) {
    await sendMessage(botToken, chatId, "❌ Nota no encontrada.", { inline_keyboard: [[{ text: "🏠 Menú", callback_data: "collab_menu" }]] });
    return;
  }

  const catInfo = CATEGORIES[(note as any).category] || { emoji: "📋", label: (note as any).category };
  const sevInfo = PRIORITIES[(note as any).severity] || { emoji: "🟡", label: (note as any).severity };

  let parcelName = "Sin parcela";
  if (note.parcelId) {
    const [p] = await db.select({ name: parcels.name }).from(parcels).where(eq(parcels.id, note.parcelId));
    parcelName = p?.name || "Sin parcela";
  }

  // Contar fotos
  const photos = await db.select().from(fieldNotePhotos).where(eq(fieldNotePhotos.fieldNoteId, noteId));

  let msg = `📋 <b>Nota ${note.folio}</b>\n\n`;
  msg += `${catInfo.emoji} <b>Categoría:</b> ${catInfo.label}\n`;
  msg += `${sevInfo.emoji} <b>Prioridad:</b> ${sevInfo.label}\n`;
  msg += `🗺️ <b>Parcela:</b> ${parcelName}\n`;
  msg += `📊 <b>Estado:</b> ${(note as any).status}\n`;
  msg += `📷 <b>Fotos:</b> ${photos.length}\n`;
  msg += `📅 <b>Fecha:</b> ${note.createdAt.toLocaleDateString("es-MX")}\n\n`;
  msg += `📝 <b>Descripción:</b>\n${note.description}\n`;

  if (note.resolutionNotes) {
    msg += `\n✅ <b>Resolución:</b>\n${note.resolutionNotes}`;
  }

  const buttons: any[] = [];
  const noteStatus = (note as any).status;
  if (noteStatus !== "resuelta" && noteStatus !== "descartada") {
    // Botones de cambio de estado según estado actual
    if (noteStatus === "abierta") {
      buttons.push([{ text: "🔄 Poner en proceso", callback_data: `collab_note_progress_${noteId}` }]);
      buttons.push([{ text: "🔍 Poner en revisión", callback_data: `collab_note_review_${noteId}` }]);
    } else if (noteStatus === "en_progreso") {
      buttons.push([{ text: "🔍 Poner en revisión", callback_data: `collab_note_review_${noteId}` }]);
    }
    if (noteStatus === "abierta" || noteStatus === "en_progreso" || noteStatus === "en_revision") {
      buttons.push([{ text: "✅ Resolver con evidencia", callback_data: `collab_note_resolve_${noteId}` }]);
    }
    buttons.push([{ text: "📸 Agregar foto de seguimiento", callback_data: `collab_addphoto_${noteId}` }]);
  }
  buttons.push([{ text: "🔍 Notas abiertas", callback_data: "collab_open_notes" }]);
  buttons.push([{ text: "🏠 Menú principal", callback_data: "collab_menu" }]);

  // Enviar fotos si hay
  if (photos.length > 0) {
    const botToken2 = await getBotToken();
    if (botToken2) {
      for (const photo of photos.slice(0, 3)) { // Max 3 fotos
        const photoPath = (photo as any).photoPath;
        if (photoPath && fs.existsSync(photoPath)) {
          try {
            const photoBuffer = fs.readFileSync(photoPath);
            const blob = new Blob([photoBuffer], { type: "image/jpeg" });
            const formData = new globalThis.FormData();
            formData.append("chat_id", chatId);
            formData.append("photo", blob, "foto.jpg");
            formData.append("caption", `📸 ${(photo as any).stage || "reporte"} — ${note.folio}`);
            await fetch(`https://api.telegram.org/bot${botToken2}/sendPhoto`, {
              method: "POST",
              body: formData,
              signal: AbortSignal.timeout(30000),
            });
          } catch (err) {
            console.error("[Collab Bot] Error enviando foto:", err);
          }
        }
      }
    }
  }

  await sendMessage(botToken, chatId, msg, { inline_keyboard: buttons });
}

// ============================================================
// Gestión de estado de notas de campo
// ============================================================
async function changeNoteStatus(botToken: string, chatId: string, noteId: number, newStatus: string, collab: any) {
  try {
    const db = await getDb();
    const [note] = await db.select().from(fieldNotes).where(eq(fieldNotes.id, noteId));
    if (!note) {
      await sendMessage(botToken, chatId, "❌ Nota no encontrada.", { inline_keyboard: [[{ text: "🏠 Menú", callback_data: "collab_menu" }]] });
      return;
    }

    // Actualizar estado en la DB
    await db.update(fieldNotes).set({
      status: newStatus as any,
    }).where(eq(fieldNotes.id, noteId));

    const statusLabels: Record<string, { label: string; emoji: string }> = {
      en_progreso: { label: "En proceso", emoji: "🔨" },
      en_revision: { label: "En revisión", emoji: "🔍" },
    };
    const statusInfo = statusLabels[newStatus] || { label: newStatus, emoji: "📋" };

    // Confirmar al colaborador
    await sendMessage(botToken, chatId,
      `${statusInfo.emoji} <b>Estado actualizado</b>\n\n` +
      `La nota <b>${(note as any).folio}</b> ahora está <b>${statusInfo.label}</b>.\n\n` +
      `Se notificará al equipo de este cambio.`,
      { inline_keyboard: [
        [{ text: "🔍 Ver nota", callback_data: `collab_note_${noteId}` }],
        [{ text: "🔍 Notas abiertas", callback_data: "collab_open_notes" }],
        [{ text: "🏠 Menú principal", callback_data: "collab_menu" }],
      ]}
    );

    // Notificar al creador de la nota y al grupo usando la función del bot principal
    try {
      const { notifyNoteStatusChange } = await import("./telegramFieldNotesBot");
      await notifyNoteStatusChange(noteId, newStatus, `${collab.name} (colaborador)`);
      console.log(`[Collab Bot] Notificación enviada: nota ${(note as any).folio} → ${newStatus} por ${collab.name}`);
    } catch (err) {
      console.error("[Collab Bot] Error notificando cambio de estado:", err);
    }

  } catch (error) {
    console.error("[Collab Bot] Error cambiando estado de nota:", error);
    await sendMessage(botToken, chatId,
      `❌ <b>Error al actualizar el estado</b>\n\nPor favor intenta de nuevo.`,
      { inline_keyboard: [[{ text: "🏠 Menú", callback_data: "collab_menu" }]] }
    );
  }
}

async function resolveNote(botToken: string, chatId: string, conv: CollabConversation) {
  try {
    const db = await getDb();
    const noteId = conv.data.noteId;
    const [note] = await db.select().from(fieldNotes).where(eq(fieldNotes.id, noteId));
    if (!note) {
      collabConversations.delete(chatId);
      await sendMessage(botToken, chatId, "❌ Nota no encontrada.", { inline_keyboard: [[{ text: "🏠 Menú", callback_data: "collab_menu" }]] });
      return;
    }

    const collab = await getCollaboratorByChatId(chatId);

    // Guardar foto de resolución si existe
    if (conv.data.resolvePhotoBuffer) {
      const dir = `/app/photos/field-notes/${(note as any).folio}`;
      fs.mkdirSync(dir, { recursive: true });
      const filename = `resolucion-${Date.now()}.jpg`;
      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, conv.data.resolvePhotoBuffer);
      await db.insert(fieldNotePhotos).values({
        fieldNoteId: noteId,
        photoPath: filepath,
        stage: "resolucion" as any,
        uploadedByUserId: 0,
        caption: conv.data.resolveNotes || null,
      });
    }

    // Actualizar la nota como resuelta
    await db.update(fieldNotes).set({
      status: "resuelta" as any,
      resolutionNotes: conv.data.resolveNotes || `Resuelto por ${collab?.name || "colaborador"}`,
      resolvedByUserId: 0, // 0 = resuelto por colaborador
      resolvedAt: new Date(),
    }).where(eq(fieldNotes.id, noteId));

    collabConversations.delete(chatId);

    await sendMessage(botToken, chatId,
      `✅ <b>¡Nota resuelta!</b> 🎉\n\n` +
      `La nota <b>${(note as any).folio}</b> ha sido marcada como resuelta` +
      (conv.data.resolvePhotoBuffer ? ` con foto de evidencia` : ``) +
      (conv.data.resolveNotes ? ` y notas de resolución` : ``) +
      `.\n\n` +
      `Se notificará a quien levantó la nota y al equipo. ¡Excelente trabajo! 🙏`,
      { inline_keyboard: [
        [{ text: "🔍 Notas abiertas", callback_data: "collab_open_notes" }],
        [{ text: "🏠 Menú principal", callback_data: "collab_menu" }],
      ]}
    );

    // Notificar al creador de la nota y al grupo
    try {
      const { notifyNoteStatusChange } = await import("./telegramFieldNotesBot");
      await notifyNoteStatusChange(noteId, "resuelta", `${collab?.name || "Colaborador"} (colaborador)`);
      console.log(`[Collab Bot] Nota ${(note as any).folio} resuelta por ${collab?.name}. Notificaciones enviadas.`);
    } catch (err) {
      console.error("[Collab Bot] Error notificando resolución:", err);
    }

  } catch (error) {
    console.error("[Collab Bot] Error resolviendo nota:", error);
    collabConversations.delete(chatId);
    await sendMessage(botToken, chatId,
      `❌ <b>Error al resolver la nota</b>\n\nPor favor intenta de nuevo.`,
      { inline_keyboard: [[{ text: "🏠 Menú", callback_data: "collab_menu" }]] }
    );
  }
}

// ============================================================
// Perfil del colaborador
// ============================================================
async function showProfile(botToken: string, chatId: string, collab: any) {
  const db = await getDb();

  // Contar tareas
  const allAssignments = await db.select().from(fieldActivityAssignments).where(eq(fieldActivityAssignments.collaboratorId, collab.id));
  const completed = allAssignments.filter(a => a.status === "completada").length;
  const pending = allAssignments.filter(a => a.status === "pendiente" || a.status === "en_progreso").length;

  let msg = `👤 <b>Mi Perfil</b>\n\n`;
  msg += `📛 <b>Nombre:</b> ${collab.name}\n`;
  if (collab.role) msg += `🏷️ <b>Rol:</b> ${collab.role}\n`;
  if (collab.phone) msg += `📱 <b>Teléfono:</b> ${collab.phone}\n`;
  msg += `\n📊 <b>Estadísticas:</b>\n`;
  msg += `   📋 Total de tareas: ${allAssignments.length}\n`;
  msg += `   ✅ Completadas: ${completed}\n`;
  msg += `   ⏳ Pendientes: ${pending}\n`;
  msg += `\n📅 <b>Vinculado desde:</b> ${collab.telegramLinkedAt ? collab.telegramLinkedAt.toLocaleDateString("es-MX") : "—"}`;

  await sendMessage(botToken, chatId, msg, {
    inline_keyboard: [[{ text: "🏠 Menú principal", callback_data: "collab_menu" }]]
  });
}

// ============================================================
// Notificaciones
// ============================================================
export async function notifyCollaboratorNewTask(collaboratorId: number, activityId: number) {
  const botToken = await getBotToken();
  if (!botToken) return;

  const db = await getDb();
  const [collab] = await db.select().from(collaborators).where(eq(collaborators.id, collaboratorId));
  if (!collab?.telegramChatId) return;

  const [activity] = await db.select().from(fieldActivities).where(eq(fieldActivities.id, activityId));
  if (!activity) return;

  // Obtener parcelas
  const actParcels = await db.select().from(fieldActivityParcels).where(eq(fieldActivityParcels.activityId, activityId));
  let parcelNames = "Sin parcela";
  if (actParcels.length > 0) {
    const parcelIds = actParcels.map(p => p.parcelId);
    const parcelRows = await db.select({ name: parcels.name }).from(parcels).where(inArray(parcels.id, parcelIds));
    parcelNames = parcelRows.map(p => p.name).join(", ");
  }

  const typeInfo = ACTIVITY_TYPES[activity.activityType] || { emoji: "📋", label: activity.activityType };

  // Obtener el assignmentId
  const [assignment] = await db.select().from(fieldActivityAssignments).where(and(
    eq(fieldActivityAssignments.activityId, activityId),
    eq(fieldActivityAssignments.collaboratorId, collaboratorId),
  ));

  await sendMessage(botToken, collab.telegramChatId,
    `🔔 <b>¡Nueva tarea asignada!</b>\n\n` +
    `${typeInfo.emoji} <b>${typeInfo.label}</b>\n\n` +
    `📅 <b>Fecha:</b> ${activity.activityDate}\n` +
    `⏰ <b>Horario:</b> ${activity.startTime || "—"} a ${activity.endTime || "—"}\n` +
    `🗺️ <b>Parcelas:</b> ${parcelNames}\n\n` +
    `📝 ${activity.description}\n\n` +
    `Presiona "Ver tarea" para más detalles.`,
    { inline_keyboard: [
      ...(assignment ? [[{ text: "👁️ Ver tarea", callback_data: `collab_task_${assignment.id}` }]] : []),
      [{ text: "📋 Mis tareas", callback_data: "collab_tasks" }],
    ]}
  );
}

async function notifyGroupTaskCompleted(assignmentId: number) {
  const botToken = await getBotToken();
  if (!botToken) return;

  const db = await getDb();
  const [assignment] = await db.select().from(fieldActivityAssignments).where(eq(fieldActivityAssignments.id, assignmentId));
  if (!assignment) return;

  const [collab] = await db.select().from(collaborators).where(eq(collaborators.id, assignment.collaboratorId));
  const [activity] = await db.select().from(fieldActivities).where(eq(fieldActivities.id, assignment.activityId));
  if (!activity) return;

  const typeInfo = ACTIVITY_TYPES[activity.activityType] || { emoji: "📋", label: activity.activityType };

  // Obtener groupChatId
  const [config] = await db.select({ chatId: apiConfig.telegramFieldNotesChatId, enabled: apiConfig.telegramFieldNotesEnabled }).from(apiConfig);
  const isEnabled = config?.enabled === true || (config?.enabled as any) === 1 || (config?.enabled as any) === "1";
  if (!isEnabled || !config?.chatId) return;

  await sendMessage(botToken, config.chatId,
    `✅ <b>Tarea completada</b>\n\n` +
    `${typeInfo.emoji} <b>${typeInfo.label}</b>\n` +
    `📅 ${activity.activityDate}\n` +
    `👷 <b>Completada por:</b> ${collab?.name || "Colaborador"}\n` +
    (assignment.evidenceNotes ? `📝 ${assignment.evidenceNotes}\n` : ``) +
    `\n📝 ${activity.description.substring(0, 100)}`,
  );

  // Enviar foto de evidencia si existe
  if (assignment.evidencePhotoPath && fs.existsSync(assignment.evidencePhotoPath)) {
    try {
      const photoBuffer = fs.readFileSync(assignment.evidencePhotoPath);
      const blob = new Blob([photoBuffer], { type: "image/jpeg" });
      const formData = new globalThis.FormData();
      formData.append("chat_id", config.chatId);
      formData.append("photo", blob, "evidencia.jpg");
      formData.append("caption", `📸 Evidencia — ${collab?.name || "Colaborador"}`);
      await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      console.error("[Collab Bot] Error enviando foto de evidencia al grupo:", err);
    }
  }
}

// ============================================================
// Limpieza de conversaciones expiradas
// ============================================================
export function cleanExpiredCollabConversations() {
  const now = Date.now();
  for (const [chatId, conv] of collabConversations) {
    if (now - conv.lastActivity > 10 * 60 * 1000) { // 10 minutos
      collabConversations.delete(chatId);
    }
  }
}
