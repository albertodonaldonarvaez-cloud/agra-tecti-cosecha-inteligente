import { getDb } from "./db";
import { users, telegramLinkCodes, fieldNotes, fieldNotePhotos, parcels, apiConfig } from "../drizzle/schema";
import { eq, and, gt, sql, isNotNull } from "drizzle-orm";
// getTelegramConfig ya no se usa - todas las funciones usan getBotToken() local
import * as fs from "fs";
import * as path from "path";

// ============================================================
// Bot de Telegram para Notas de Campo
// Todo el flujo usa botones inline y reply keyboard.
// Sin comandos legacy — solo botones.
// ============================================================

interface ConversationState {
  step: "idle" | "waiting_category" | "waiting_description" | "waiting_photo" | "waiting_location" | "waiting_priority" | "waiting_parcel";
  data: {
    category?: string;
    description?: string;
    photoBase64?: string;
    latitude?: number;
    longitude?: number;
    priority?: string;
    parcelId?: number;
  };
  userId: number;
  lastActivity: number;
}

const conversations = new Map<string, ConversationState>();
let pollingOffset = 0;
let isPolling = false;
let pollTimer: NodeJS.Timeout | null = null;

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
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const err = await response.text();
      console.error(`[TG Bot] Error ${method}: ${response.status} - ${err}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`[TG Bot] Error ${method}:`, error);
    return null;
  }
}

async function sendMessage(botToken: string, chatId: string, text: string, opts?: { inline_keyboard?: any; reply_keyboard?: any; remove_keyboard?: boolean }): Promise<any> {
  const body: any = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  };
  if (opts?.inline_keyboard) {
    body.reply_markup = { inline_keyboard: opts.inline_keyboard };
  } else if (opts?.reply_keyboard) {
    body.reply_markup = {
      keyboard: opts.reply_keyboard,
      resize_keyboard: true,
      one_time_keyboard: true,
    };
  } else if (opts?.remove_keyboard) {
    body.reply_markup = { remove_keyboard: true };
  }
  return callTelegram(botToken, "sendMessage", body);
}

async function editMessageText(botToken: string, chatId: string, messageId: number, text: string, inlineKeyboard?: any): Promise<any> {
  const body: any = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  };
  if (inlineKeyboard) {
    body.reply_markup = { inline_keyboard: inlineKeyboard };
  }
  return callTelegram(botToken, "editMessageText", body);
}

async function downloadFile(botToken: string, fileId: string): Promise<Buffer | null> {
  try {
    const fileInfo = await callTelegram(botToken, "getFile", { file_id: fileId });
    if (!fileInfo?.result?.file_path) return null;
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`;
    const response = await fetch(fileUrl, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error("[TG Bot] Error descargando archivo:", error);
    return null;
  }
}

// ============================================================
// Funciones de base de datos
// ============================================================

async function getUserByChatId(chatId: string): Promise<any> {
  const db = await getDb();
  if (!db) return null;
  const [user] = await db.select().from(users).where(eq(users.telegramChatId, chatId));
  return user || null;
}

async function getActiveParcels(): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({ id: parcels.id, name: parcels.name, code: parcels.code })
    .from(parcels)
    .where(and(isNotNull(parcels.polygon)));
  return result.filter((p: any) => p.name);
}

async function generateFolio(): Promise<string> {
  const db = await getDb();
  if (!db) return `NC-${Date.now()}`;
  const [lastNote] = await db.select({ folio: fieldNotes.folio })
    .from(fieldNotes)
    .orderBy(sql`id DESC`)
    .limit(1);
  let nextNum = 1;
  if (lastNote?.folio) {
    const match = lastNote.folio.match(/NC-(\d+)/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }
  return `NC-${String(nextNum).padStart(6, "0")}`;
}

// Obtener solo el botToken sin requerir el chatId de errores
async function getBotToken(): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const configs = await db.select({
      botToken: apiConfig.telegramBotToken,
    }).from(apiConfig).limit(1);
    const config = configs[0];
    if (!config?.botToken) return null;
    return config.botToken;
  } catch (error) {
    console.error("[TG Bot] Error en getBotToken:", error);
    return null;
  }
}

async function getFieldNotesGroupChatId(): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) {
      console.log("[TG Bot] getFieldNotesGroupChatId: DB no disponible");
      return null;
    }
    const configs = await db.select({
      chatId: apiConfig.telegramFieldNotesChatId,
      enabled: apiConfig.telegramFieldNotesEnabled,
    }).from(apiConfig).limit(1);
    
    const config = configs[0];
    console.log("[TG Bot] getFieldNotesGroupChatId config:", JSON.stringify(config));
    
    if (!config) {
      console.log("[TG Bot] getFieldNotesGroupChatId: No hay config en apiConfig");
      return null;
    }
    if (!config.enabled) {
      console.log("[TG Bot] getFieldNotesGroupChatId: Notificaciones deshabilitadas");
      return null;
    }
    if (!config.chatId) {
      console.log("[TG Bot] getFieldNotesGroupChatId: No hay chatId configurado");
      return null;
    }
    console.log("[TG Bot] getFieldNotesGroupChatId: Retornando chatId:", config.chatId);
    return config.chatId;
  } catch (error) {
    console.error("[TG Bot] Error en getFieldNotesGroupChatId:", error);
    return null;
  }
}

async function createFieldNote(state: ConversationState): Promise<{ folio: string; id: number } | null> {
  const db = await getDb();
  if (!db) return null;

  const folio = await generateFolio();

  const [result] = await db.insert(fieldNotes).values({
    folio,
    description: state.data.description || "Nota desde Telegram",
    category: (state.data.category || "otro") as any,
    severity: (state.data.priority || "media") as any,
    status: "abierta" as any,
    parcelId: state.data.parcelId ?? null,
    latitude: state.data.latitude ? String(state.data.latitude) : null,
    longitude: state.data.longitude ? String(state.data.longitude) : null,
    reportedByUserId: state.userId,
  });

  // Guardar foto si existe
  if (state.data.photoBase64) {
    const dir = `/app/photos/field-notes/${folio}`;
    fs.mkdirSync(dir, { recursive: true });
    const fileName = `reporte-${Date.now()}.jpg`;
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, Buffer.from(state.data.photoBase64, "base64"));
    const photoUrl = `/app/photos/field-notes/${folio}/${fileName}`;
    await db.insert(fieldNotePhotos).values({
      fieldNoteId: result.insertId,
      photoPath: photoUrl,
      caption: "Foto del reporte (Telegram)",
      stage: "reporte" as any,
      uploadedByUserId: state.userId,
    });
  }

  return { folio, id: result.insertId };
}

// ============================================================
// Menú principal con botones
// ============================================================

function getMainMenuInline() {
  return [
    [{ text: "📝 Nueva Nota de Campo", callback_data: "menu_nueva_nota" }],
    [{ text: "📋 Mis Notas Recientes", callback_data: "menu_mis_notas" }],
    [{ text: "❓ Ayuda", callback_data: "menu_ayuda" }],
  ];
}

// ============================================================
// Limpieza de conversaciones expiradas
// ============================================================

function cleanExpiredConversations() {
  const now = Date.now();
  for (const [chatId, state] of conversations) {
    if (now - state.lastActivity > 30 * 60 * 1000) {
      conversations.delete(chatId);
    }
  }
}

// ============================================================
// Manejo de updates
// ============================================================

async function handleUpdate(botToken: string, update: any) {
  const message = update.message || update.callback_query?.message;
  if (!message) return;

  const chatId = String(message.chat.id);
  const chatType = message.chat.type;

  // Si es callback_query (botón inline presionado)
  if (update.callback_query) {
    await handleCallback(botToken, chatId, update.callback_query);
    return;
  }

  // Solo responder en chats privados
  if (chatType !== "private") return;

  const text = message.text?.trim() || "";
  const photo = message.photo;
  const location = message.location;

  // /start es el único comando que mantenemos (Telegram lo requiere)
  if (text === "/start") {
    const user = await getUserByChatId(chatId);
    if (user) {
      await sendMessage(botToken, chatId,
        `🌿 <b>AGRA-TECTI — Notas de Campo</b>\n\n` +
        `¡Hola <b>${user.name}</b>! 👋\n\n` +
        `¿Qué deseas hacer?`,
        { inline_keyboard: getMainMenuInline() }
      );
    } else {
      await sendMessage(botToken, chatId,
        `🌿 <b>AGRA-TECTI — Notas de Campo</b>\n\n` +
        `Tu cuenta aún no está vinculada.\n\n` +
        `Pide a tu administrador que te vincule desde la plataforma web.\n\n` +
        `Si ya tienes un código, presiónalo abajo:`,
        { inline_keyboard: [
          [{ text: "🔗 Ingresar código de vinculación", callback_data: "menu_vincular" }],
          [{ text: "❓ ¿Cómo me vinculo?", callback_data: "menu_ayuda_vincular" }],
        ]}
      );
    }
    return;
  }

  // Si el usuario está en proceso de vincular (esperando código)
  const state = conversations.get(chatId);
  if (state && (state as any).linkMode && text) {
    await handleLinkCode(botToken, chatId, text, message.from);
    return;
  }

  // Verificar si el usuario está vinculado
  const user = await getUserByChatId(chatId);
  if (!user) {
    await sendMessage(botToken, chatId,
      `⚠️ Tu cuenta no está vinculada.\n\nPide a tu administrador que te vincule.`,
      { inline_keyboard: [
        [{ text: "🔗 Ingresar código", callback_data: "menu_vincular" }],
        [{ text: "❓ Ayuda", callback_data: "menu_ayuda_vincular" }],
      ]}
    );
    return;
  }

  // Si el usuario envía una foto directamente (atajo rápido)
  if (photo && !conversations.has(chatId)) {
    await startNewNote(botToken, chatId, user.id);
    const noteState = conversations.get(chatId);
    if (noteState) {
      // Guardar foto y caption como descripción
      noteState.step = "waiting_photo";
      await handlePhotoStep(botToken, chatId, noteState, photo, message.caption);
    }
    return;
  }

  // Si envía ubicación directamente
  if (location && !conversations.has(chatId)) {
    await sendMessage(botToken, chatId,
      `📍 Ubicación recibida, pero no hay una nota en proceso.\n\n¿Qué deseas hacer?`,
      { inline_keyboard: getMainMenuInline(), remove_keyboard: true }
    );
    return;
  }

  // Si hay conversación activa, manejar el paso actual
  if (state) {
    state.lastActivity = Date.now();
    await handleConversationStep(botToken, chatId, state, message);
    return;
  }

  // Cualquier otro mensaje → mostrar menú con botones
  await sendMessage(botToken, chatId,
    `🌿 <b>AGRA-TECTI</b>\n\n¿Qué deseas hacer?`,
    { inline_keyboard: getMainMenuInline() }
  );
}

// ============================================================
// Manejo de vinculación
// ============================================================

async function handleLinkCode(botToken: string, chatId: string, code: string, from: any) {
  conversations.delete(chatId);

  const db = await getDb();
  if (!db) {
    await sendMessage(botToken, chatId, "❌ Error de conexión. Intenta más tarde.", { inline_keyboard: getMainMenuInline() });
    return;
  }

  const [linkCode] = await db.select()
    .from(telegramLinkCodes)
    .where(and(
      eq(telegramLinkCodes.code, code.toUpperCase().trim()),
      eq(telegramLinkCodes.used, false),
      gt(telegramLinkCodes.expiresAt, new Date()),
    ));

  if (!linkCode) {
    await sendMessage(botToken, chatId,
      `❌ <b>Código inválido o expirado.</b>\n\nPide a tu administrador un nuevo código.`,
      { inline_keyboard: [
        [{ text: "🔄 Intentar otro código", callback_data: "menu_vincular" }],
        [{ text: "❓ Ayuda", callback_data: "menu_ayuda_vincular" }],
      ]}
    );
    return;
  }

  await db.update(users).set({
    telegramChatId: chatId,
    telegramUsername: from?.username || from?.first_name || null,
    telegramLinkedAt: new Date(),
  }).where(eq(users.id, linkCode.userId));

  await db.update(telegramLinkCodes).set({ used: true }).where(eq(telegramLinkCodes.id, linkCode.id));

  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, linkCode.userId));

  await sendMessage(botToken, chatId,
    `✅ <b>¡Cuenta vinculada!</b>\n\n` +
    `Hola <b>${user?.name || "usuario"}</b>, ya estás conectado.\n\n` +
    `🔔 Recibirás notificaciones de tus notas de campo.\n\n` +
    `¿Qué deseas hacer?`,
    { inline_keyboard: getMainMenuInline() }
  );
}

// ============================================================
// Callbacks (botones inline)
// ============================================================

async function handleCallback(botToken: string, chatId: string, callbackQuery: any) {
  const data = callbackQuery.data;
  const messageId = callbackQuery.message?.message_id;

  // Responder al callback para quitar el "loading"
  await callTelegram(botToken, "answerCallbackQuery", { callback_query_id: callbackQuery.id });

  // --- Menú principal ---
  if (data === "menu_nueva_nota") {
    const user = await getUserByChatId(chatId);
    if (!user) return;
    await startNewNote(botToken, chatId, user.id);
    return;
  }

  if (data === "menu_mis_notas") {
    const user = await getUserByChatId(chatId);
    if (!user) return;
    await showMyNotes(botToken, chatId, user.id);
    return;
  }

  if (data === "menu_ayuda") {
    await sendHelpMessage(botToken, chatId);
    return;
  }

  if (data === "menu_vincular") {
    // Poner al usuario en modo "esperando código"
    conversations.set(chatId, {
      step: "idle",
      data: {},
      userId: 0,
      lastActivity: Date.now(),
      ...({ linkMode: true } as any),
    });
    await sendMessage(botToken, chatId,
      `🔗 <b>Vincular cuenta</b>\n\n` +
      `Escribe tu código de vinculación de 6 caracteres:`,
      { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "cancel_link" }]] }
    );
    return;
  }

  if (data === "cancel_link") {
    conversations.delete(chatId);
    await sendMessage(botToken, chatId, `Vinculación cancelada.\n\n¿Qué deseas hacer?`,
      { inline_keyboard: [
        [{ text: "🔗 Ingresar código", callback_data: "menu_vincular" }],
        [{ text: "❓ Ayuda", callback_data: "menu_ayuda_vincular" }],
      ]}
    );
    return;
  }

  if (data === "menu_ayuda_vincular") {
    await sendMessage(botToken, chatId,
      `🔗 <b>¿Cómo vincular tu cuenta?</b>\n\n` +
      `<b>Tu administrador te vincula:</b>\n` +
      `1. Entra a la plataforma web\n` +
      `2. Va a <b>Usuarios</b>\n` +
      `3. Busca tu nombre\n` +
      `4. Presiona <b>"Vincular Telegram"</b>\n` +
      `5. Te da un código de 6 caracteres\n` +
      `6. Envía ese código aquí`,
      { inline_keyboard: [
        [{ text: "🔗 Ya tengo mi código", callback_data: "menu_vincular" }],
        [{ text: "⬅️ Menú principal", callback_data: "menu_back" }],
      ]}
    );
    return;
  }

  if (data === "menu_back") {
    const user = await getUserByChatId(chatId);
    if (user) {
      await sendMessage(botToken, chatId, `¿Qué deseas hacer?`, { inline_keyboard: getMainMenuInline() });
    }
    return;
  }

  // --- Cancelar nota en proceso ---
  if (data === "cancel_note") {
    conversations.delete(chatId);
    // Quitar reply keyboard si hay
    await sendMessage(botToken, chatId, `❌ Nota cancelada.`, { remove_keyboard: true });
    await sendMessage(botToken, chatId, `¿Qué deseas hacer?`, { inline_keyboard: getMainMenuInline() });
    return;
  }

  // --- Flujo de nota ---
  const state = conversations.get(chatId);
  if (!state) return;
  state.lastActivity = Date.now();

  // Categoría seleccionada
  if (data.startsWith("cat_") && state.step === "waiting_category") {
    const category = data.replace("cat_", "");
    state.data.category = category;
    state.step = "waiting_description";
    const catInfo = CATEGORIES[category] || { label: category, emoji: "📋" };

    if (messageId) {
      await editMessageText(botToken, chatId, messageId, `✅ Categoría: <b>${catInfo.emoji} ${catInfo.label}</b>`);
    }

    await sendMessage(botToken, chatId,
      `Paso 2️⃣ de 5️⃣ — Escribe una <b>descripción</b> del problema:`,
      { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "cancel_note" }]] }
    );
    return;
  }

  // Omitir foto
  if (data === "skip_photo" && state.step === "waiting_photo") {
    if (messageId) {
      await editMessageText(botToken, chatId, messageId, `⏭️ Foto: <b>Omitida</b>`);
    }
    state.step = "waiting_location";
    await askLocation(botToken, chatId);
    return;
  }

  // Omitir ubicación
  if (data === "skip_location" && state.step === "waiting_location") {
    // Quitar reply keyboard
    await sendMessage(botToken, chatId, `⏭️ Ubicación: <b>Omitida</b>`, { remove_keyboard: true });
    state.step = "waiting_priority";
    await askPriority(botToken, chatId);
    return;
  }

  // Prioridad seleccionada
  if (data.startsWith("pri_") && state.step === "waiting_priority") {
    const priority = data.replace("pri_", "");
    state.data.priority = priority;
    const priInfo = PRIORITIES[priority] || { label: priority, emoji: "🟡" };

    if (messageId) {
      await editMessageText(botToken, chatId, messageId, `✅ Prioridad: <b>${priInfo.emoji} ${priInfo.label}</b>`);
    }

    // Mostrar parcelas
    const parcelsList = await getActiveParcels();
    if (parcelsList.length > 0) {
      state.step = "waiting_parcel";
      const rows: any[][] = [];
      const sliced = parcelsList.slice(0, 20);
      for (let i = 0; i < sliced.length; i += 2) {
        const row = [];
        row.push({ text: `🌱 ${sliced[i].name}`, callback_data: `parcel_${sliced[i].id}` });
        if (sliced[i + 1]) {
          row.push({ text: `🌱 ${sliced[i + 1].name}`, callback_data: `parcel_${sliced[i + 1].id}` });
        }
        rows.push(row);
      }
      rows.push([{ text: "⏭️ Sin parcela específica", callback_data: "parcel_none" }]);
      rows.push([{ text: "❌ Cancelar", callback_data: "cancel_note" }]);

      await sendMessage(botToken, chatId,
        `Paso 5️⃣ de 5️⃣ — Selecciona la <b>parcela</b>:`,
        { inline_keyboard: rows }
      );
    } else {
      await finishNote(botToken, chatId, state);
    }
    return;
  }

  // Parcela seleccionada
  if (data.startsWith("parcel_") && state.step === "waiting_parcel") {
    if (data !== "parcel_none") {
      state.data.parcelId = parseInt(data.replace("parcel_", ""));
    }

    if (messageId) {
      const parcelName = data === "parcel_none" ? "Sin parcela" : `Parcela #${state.data.parcelId}`;
      await editMessageText(botToken, chatId, messageId, `✅ Parcela: <b>${parcelName}</b>`);
    }

    await finishNote(botToken, chatId, state);
    return;
  }
}

// ============================================================
// Flujo de conversación (mensajes de texto/foto/ubicación)
// ============================================================

async function handleConversationStep(botToken: string, chatId: string, state: ConversationState, message: any) {
  const text = message.text?.trim() || "";
  const photo = message.photo;
  const location = message.location;

  switch (state.step) {
    case "waiting_description":
      if (!text && !photo) {
        await sendMessage(botToken, chatId, "✏️ Escribe una descripción del problema:",
          { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "cancel_note" }]] }
        );
        return;
      }
      if (photo) {
        state.data.description = message.caption || "";
        state.step = "waiting_photo";
        await handlePhotoStep(botToken, chatId, state, photo, message.caption);
        return;
      }
      state.data.description = text;
      state.step = "waiting_photo";

      // Pedir foto con reply keyboard para abrir cámara rápido
      await sendMessage(botToken, chatId,
        `✅ Descripción registrada.\n\n` +
        `Paso 3️⃣ de 5️⃣ — <b>Toma una foto</b> del problema 📸\n\n` +
        `Presiona el botón de abajo para abrir la cámara rápidamente:`,
        { inline_keyboard: [
          [{ text: "⏭️ Omitir foto", callback_data: "skip_photo" }],
          [{ text: "❌ Cancelar", callback_data: "cancel_note" }],
        ]}
      );
      break;

    case "waiting_photo":
      if (photo) {
        await handlePhotoStep(botToken, chatId, state, photo, message.caption);
      } else {
        await sendMessage(botToken, chatId,
          "📸 Envía una <b>foto</b> del problema.\n\nPresiona el icono 📎 y selecciona <b>Cámara</b> para tomar una foto rápida.",
          { inline_keyboard: [
            [{ text: "⏭️ Omitir foto", callback_data: "skip_photo" }],
            [{ text: "❌ Cancelar", callback_data: "cancel_note" }],
          ]}
        );
      }
      break;

    case "waiting_location":
      if (location) {
        state.data.latitude = location.latitude;
        state.data.longitude = location.longitude;
        // Quitar reply keyboard
        await sendMessage(botToken, chatId, `✅ Ubicación registrada.`, { remove_keyboard: true });
        state.step = "waiting_priority";
        await askPriority(botToken, chatId);
      } else {
        // Reenviar el reply keyboard de ubicación
        await askLocation(botToken, chatId);
      }
      break;

    default:
      await sendMessage(botToken, chatId, `¿Qué deseas hacer?`, { inline_keyboard: getMainMenuInline(), remove_keyboard: true });
      conversations.delete(chatId);
  }
}

// ============================================================
// Iniciar nueva nota
// ============================================================

async function startNewNote(botToken: string, chatId: string, userId: number) {
  const state: ConversationState = {
    step: "waiting_category",
    data: {},
    userId,
    lastActivity: Date.now(),
  };
  conversations.set(chatId, state);

  const catEntries = Object.entries(CATEGORIES);
  const rows: any[][] = [];
  for (let i = 0; i < catEntries.length; i += 2) {
    const row = [];
    row.push({ text: `${catEntries[i][1].emoji} ${catEntries[i][1].label}`, callback_data: `cat_${catEntries[i][0]}` });
    if (catEntries[i + 1]) {
      row.push({ text: `${catEntries[i + 1][1].emoji} ${catEntries[i + 1][1].label}`, callback_data: `cat_${catEntries[i + 1][0]}` });
    }
    rows.push(row);
  }
  rows.push([{ text: "❌ Cancelar", callback_data: "cancel_note" }]);

  await sendMessage(botToken, chatId,
    `📝 <b>Nueva Nota de Campo</b>\n\n` +
    `Paso 1️⃣ de 5️⃣ — Selecciona la <b>categoría</b>:`,
    { inline_keyboard: rows }
  );
}

// ============================================================
// Paso de foto
// ============================================================

async function handlePhotoStep(botToken: string, chatId: string, state: ConversationState, photo: any[], caption?: string) {
  const largestPhoto = photo[photo.length - 1];
  const buffer = await downloadFile(botToken, largestPhoto.file_id);
  if (buffer) {
    state.data.photoBase64 = buffer.toString("base64");
  }

  if (caption && !state.data.description) {
    state.data.description = caption;
  }

  // Si aún no tiene descripción, pedirla
  if (!state.data.description) {
    state.step = "waiting_description";
    await sendMessage(botToken, chatId,
      `📸 Foto recibida.\n\n✏️ Ahora escribe una <b>descripción</b> del problema:`,
      { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "cancel_note" }]] }
    );
    return;
  }

  // Si no tiene categoría (atajo rápido: envió foto directamente)
  if (!state.data.category) {
    state.step = "waiting_category";
    const catEntries = Object.entries(CATEGORIES);
    const rows: any[][] = [];
    for (let i = 0; i < catEntries.length; i += 2) {
      const row = [];
      row.push({ text: `${catEntries[i][1].emoji} ${catEntries[i][1].label}`, callback_data: `cat_${catEntries[i][0]}` });
      if (catEntries[i + 1]) {
        row.push({ text: `${catEntries[i + 1][1].emoji} ${catEntries[i + 1][1].label}`, callback_data: `cat_${catEntries[i + 1][0]}` });
      }
      rows.push(row);
    }
    rows.push([{ text: "❌ Cancelar", callback_data: "cancel_note" }]);

    await sendMessage(botToken, chatId,
      `📸 Foto recibida.\n\nSelecciona la <b>categoría</b>:`,
      { inline_keyboard: rows }
    );
    return;
  }

  // Continuar al paso de ubicación
  state.step = "waiting_location";
  await sendMessage(botToken, chatId, `📸 Foto recibida.`, { remove_keyboard: true });
  await askLocation(botToken, chatId);
}

// ============================================================
// Pedir ubicación con reply keyboard (botón grande)
// ============================================================

async function askLocation(botToken: string, chatId: string) {
  // Primero enviar instrucciones con botón de omitir
  await sendMessage(botToken, chatId,
    `Paso 4️⃣ de 5️⃣ — <b>Envía tu ubicación</b> 📍\n\n` +
    `Presiona el botón <b>"📍 Enviar mi ubicación"</b> que aparece abajo:`,
    {
      reply_keyboard: [
        [{ text: "📍 Enviar mi ubicación", request_location: true }],
      ],
    }
  );
  // Enviar botones inline para omitir/cancelar
  await sendMessage(botToken, chatId,
    `O si prefieres:`,
    { inline_keyboard: [
      [{ text: "⏭️ Omitir ubicación", callback_data: "skip_location" }],
      [{ text: "❌ Cancelar", callback_data: "cancel_note" }],
    ]}
  );
}

// ============================================================
// Pedir prioridad
// ============================================================

async function askPriority(botToken: string, chatId: string) {
  const rows: any[][] = [];
  const priEntries = Object.entries(PRIORITIES);
  rows.push(priEntries.map(([key, val]) => ({
    text: `${val.emoji} ${val.label}`,
    callback_data: `pri_${key}`,
  })));
  rows.push([{ text: "❌ Cancelar", callback_data: "cancel_note" }]);

  await sendMessage(botToken, chatId,
    `Paso 4️⃣ de 5️⃣ — Selecciona la <b>prioridad</b>:`,
    { inline_keyboard: rows }
  );
}

// ============================================================
// Finalizar nota
// ============================================================

async function finishNote(botToken: string, chatId: string, state: ConversationState) {
  try {
    const loadingMsg = await sendMessage(botToken, chatId, `⏳ Creando nota de campo...`, { remove_keyboard: true });

    const result = await createFieldNote(state);
    if (!result) {
      await sendMessage(botToken, chatId, "❌ Error al crear la nota. Intenta de nuevo.", { inline_keyboard: getMainMenuInline() });
      conversations.delete(chatId);
      return;
    }

    const catInfo = CATEGORIES[state.data.category || "otro"] || { label: "Otro", emoji: "📋" };
    const priInfo = PRIORITIES[state.data.priority || "media"] || { label: "Media", emoji: "🟡" };

    let locationText = "No proporcionada";
    if (state.data.latitude && state.data.longitude) {
      locationText = `📍 <a href="https://maps.google.com/?q=${state.data.latitude},${state.data.longitude}">Ver en mapa</a>`;
    }

    const summaryMsg =
      `✅ <b>¡Nota Creada!</b>\n\n` +
      `📋 Folio: <b>${result.folio}</b>\n` +
      `${catInfo.emoji} Categoría: ${catInfo.label}\n` +
      `${priInfo.emoji} Prioridad: ${priInfo.label}\n` +
      `📝 ${state.data.description}\n` +
      `${state.data.photoBase64 ? "📸 Foto: Sí" : "📸 Foto: No"}\n` +
      `${locationText}\n\n` +
      `🔔 Te notificaremos cuando haya novedades.`;

    if (loadingMsg?.result?.message_id) {
      await editMessageText(botToken, chatId, loadingMsg.result.message_id, summaryMsg);
    } else {
      await sendMessage(botToken, chatId, summaryMsg);
    }

    // Notificar al grupo de notas de campo si está configurado
    await notifyGroupNewNote(result.folio, state);

    await sendMessage(botToken, chatId, `¿Qué más deseas hacer?`, { inline_keyboard: getMainMenuInline() });
    conversations.delete(chatId);
  } catch (error: any) {
    console.error("[TG Bot] Error al crear nota:", error);
    await sendMessage(botToken, chatId, `❌ Error: ${error.message}`, { inline_keyboard: getMainMenuInline() });
    conversations.delete(chatId);
  }
}

// ============================================================
// Notificar al grupo configurado
// ============================================================

async function notifyGroupNewNote(folio: string, state: ConversationState) {
  console.log("[TG Bot] notifyGroupNewNote llamada para folio:", folio);
  const botToken = await getBotToken();
  if (!botToken) {
    console.log("[TG Bot] notifyGroupNewNote: No hay botToken");
    return;
  }

  const groupChatId = await getFieldNotesGroupChatId();
  console.log("[TG Bot] notifyGroupNewNote: groupChatId =", groupChatId);
  if (!groupChatId) {
    console.log("[TG Bot] notifyGroupNewNote: No hay groupChatId, abortando");
    return;
  }

  const db = await getDb();
  if (!db) return;

  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, state.userId));
  const catInfo = CATEGORIES[state.data.category || "otro"] || { label: "Otro", emoji: "📋" };
  const priInfo = PRIORITIES[state.data.priority || "media"] || { label: "Media", emoji: "🟡" };

  let locationText = "";
  if (state.data.latitude && state.data.longitude) {
    locationText = `\n📍 <a href="https://maps.google.com/?q=${state.data.latitude},${state.data.longitude}">Ver ubicación</a>`;
  }

  const msg =
    `🆕 <b>Nueva Nota de Campo</b>\n\n` +
    `📋 Folio: <b>${folio}</b>\n` +
    `👤 Reportó: ${user?.name || "Desconocido"}\n` +
    `${catInfo.emoji} Categoría: ${catInfo.label}\n` +
    `${priInfo.emoji} Prioridad: ${priInfo.label}\n` +
    `📝 ${(state.data.description || "").substring(0, 200)}` +
    `${state.data.photoBase64 ? "\n📸 Con foto" : ""}` +
    `${locationText}`;

  await sendMessage(botToken, groupChatId, msg);

  // Si tiene foto, enviarla al grupo
  if (state.data.photoBase64) {
    try {
      const FormData = (await import("form-data")).default;
      const formData = new FormData();
      formData.append("chat_id", groupChatId);
      const photoBuffer = Buffer.from(state.data.photoBase64, "base64");
      formData.append("photo", photoBuffer, { filename: "reporte.jpg", contentType: "image/jpeg" });
      formData.append("caption", `📸 Foto — ${folio}`);

      await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: "POST",
        body: formData as any,
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      console.error("[TG Bot] Error enviando foto al grupo:", err);
    }
  }
}

// ============================================================
// Mostrar notas del usuario
// ============================================================

async function showMyNotes(botToken: string, chatId: string, userId: number) {
  const db = await getDb();
  if (!db) {
    await sendMessage(botToken, chatId, "❌ Error de conexión.", { inline_keyboard: getMainMenuInline() });
    return;
  }

  const notes = await db.select()
    .from(fieldNotes)
    .where(eq(fieldNotes.reportedByUserId, userId))
    .orderBy(sql`id DESC`)
    .limit(10);

  if (notes.length === 0) {
    await sendMessage(botToken, chatId,
      `📋 No tienes notas de campo registradas.`,
      { inline_keyboard: [
        [{ text: "📝 Crear una nota", callback_data: "menu_nueva_nota" }],
        [{ text: "⬅️ Menú principal", callback_data: "menu_back" }],
      ]}
    );
    return;
  }

  const statusEmoji: Record<string, string> = {
    abierta: "🔴",
    en_revision: "🔍",
    en_progreso: "🔨",
    resuelta: "✅",
    descartada: "⬜",
  };

  let msg = `📋 <b>Tus últimas notas:</b>\n\n`;
  for (const note of notes) {
    const catInfo = CATEGORIES[(note as any).category] || { emoji: "📋", label: (note as any).category };
    const status = (note as any).status || "abierta";
    const emoji = statusEmoji[status] || "⬜";
    msg += `${emoji} <b>${(note as any).folio}</b> — ${catInfo.emoji} ${catInfo.label}\n`;
    msg += `   ${((note as any).description || "").substring(0, 50)}${((note as any).description || "").length > 50 ? "..." : ""}\n\n`;
  }

  await sendMessage(botToken, chatId, msg, {
    inline_keyboard: [
      [{ text: "📝 Nueva nota", callback_data: "menu_nueva_nota" }],
      [{ text: "⬅️ Menú principal", callback_data: "menu_back" }],
    ],
  });
}

// ============================================================
// Ayuda
// ============================================================

async function sendHelpMessage(botToken: string, chatId: string) {
  await sendMessage(botToken, chatId,
    `🌿 <b>AGRA-TECTI — Ayuda</b>\n\n` +
    `<b>📝 Crear nota:</b>\n` +
    `Presiona "Nueva Nota" y sigue los botones.\n` +
    `También puedes enviar una foto directamente para crear una nota rápida.\n\n` +
    `<b>📋 Ver notas:</b>\n` +
    `Presiona "Mis Notas" para ver tus reportes.\n\n` +
    `<b>🔔 Notificaciones:</b>\n` +
    `Recibirás un mensaje cuando tus notas cambien de estado, incluyendo fotos de resolución.\n\n` +
    `<b>📍 Ubicación:</b>\n` +
    `Cuando se te pida, presiona el botón "Enviar mi ubicación" que aparece en la parte inferior.\n\n` +
    `<b>📸 Fotos:</b>\n` +
    `Presiona el icono 📎 y selecciona "Cámara" para tomar una foto rápida.`,
    { inline_keyboard: [[{ text: "⬅️ Menú principal", callback_data: "menu_back" }]] }
  );
}

// ============================================================
// Notificaciones de cambio de estado
// ============================================================

export async function notifyNoteStatusChange(noteId: number, newStatus: string, resolvedByName?: string): Promise<boolean> {
  console.log("[TG Bot] notifyNoteStatusChange llamada para noteId:", noteId, "newStatus:", newStatus);
  const botToken = await getBotToken();
  if (!botToken) {
    console.log("[TG Bot] notifyNoteStatusChange: No hay botToken");
    return false;
  }

  const db = await getDb();
  if (!db) {
    console.log("[TG Bot] notifyNoteStatusChange: DB no disponible");
    return false;
  }

  const [note] = await db.select().from(fieldNotes).where(eq(fieldNotes.id, noteId));
  if (!note) return false;

  const reporterId = (note as any).reportedByUserId;
  const user = reporterId
    ? (await db.select({ telegramChatId: users.telegramChatId, name: users.name }).from(users).where(eq(users.id, reporterId)))[0]
    : null;

  const statusLabels: Record<string, { label: string; emoji: string }> = {
    abierta: { label: "Abierta", emoji: "🔴" },
    en_revision: { label: "En revisión", emoji: "🔍" },
    en_progreso: { label: "En progreso", emoji: "🔨" },
    resuelta: { label: "Resuelta", emoji: "✅" },
    descartada: { label: "Descartada", emoji: "⬜" },
  };

  const statusInfo = statusLabels[newStatus] || { label: newStatus, emoji: "📋" };
  const catInfo = CATEGORIES[(note as any).category] || { label: (note as any).category, emoji: "📋" };

  let msg = `🔔 <b>Actualización de Nota</b>\n\n`;
  msg += `📋 Folio: <b>${(note as any).folio}</b>\n`;
  msg += `${catInfo.emoji} ${catInfo.label}\n`;
  msg += `📝 ${((note as any).description || "").substring(0, 100)}\n\n`;
  msg += `${statusInfo.emoji} Nuevo estado: <b>${statusInfo.label}</b>\n`;
  if (resolvedByName) {
    msg += `👤 Atendido por: ${resolvedByName}\n`;
  }
  if ((note as any).resolutionNotes && (newStatus === "resuelta" || newStatus === "descartada")) {
    msg += `💬 Notas: ${(note as any).resolutionNotes}\n`;
  }

  // Notificar al usuario que reportó
  if (user?.telegramChatId) {
    await sendMessage(botToken, user.telegramChatId, msg);

    // Si es resuelta/descartada, enviar fotos de resolución
    if (newStatus === "resuelta" || newStatus === "descartada") {
      const photos = await db.select()
        .from(fieldNotePhotos)
        .where(and(
          eq(fieldNotePhotos.fieldNoteId, noteId),
          eq(fieldNotePhotos.stage, "resolucion" as any),
        ));

      for (const photo of photos) {
        const photoPath = (photo as any).photoPath;
        if (photoPath && fs.existsSync(photoPath)) {
          try {
            const FormData = (await import("form-data")).default;
            const formData = new FormData();
            formData.append("chat_id", user.telegramChatId);
            formData.append("photo", fs.createReadStream(photoPath));
            formData.append("caption", `📸 Foto de resolución — ${(note as any).folio}`);

            await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
              method: "POST",
              body: formData as any,
              signal: AbortSignal.timeout(30000),
            });
          } catch (err) {
            console.error("[TG Bot] Error enviando foto de resolución:", err);
          }
        }
      }
    }
  }

  // Notificar al grupo de notas de campo
  const groupChatId = await getFieldNotesGroupChatId();
  console.log("[TG Bot] notifyNoteStatusChange: groupChatId =", groupChatId);
  if (groupChatId) {
    console.log("[TG Bot] notifyNoteStatusChange: Enviando al grupo...");
    await sendMessage(botToken, groupChatId, msg);
    console.log("[TG Bot] notifyNoteStatusChange: Enviado al grupo OK");

    // Enviar fotos de la etapa al grupo
    try {
      const stage = (newStatus === "resuelta" || newStatus === "descartada") ? "resolucion" : "revision";
      const groupPhotos = await db.select()
        .from(fieldNotePhotos)
        .where(and(
          eq(fieldNotePhotos.fieldNoteId, noteId),
          eq(fieldNotePhotos.stage, stage as any),
        ));

      for (const gPhoto of groupPhotos) {
        const gPhotoPath = (gPhoto as any).photoPath;
        if (gPhotoPath && fs.existsSync(gPhotoPath)) {
          try {
            const FormData = (await import("form-data")).default;
            const formData = new FormData();
            formData.append("chat_id", groupChatId);
            formData.append("photo", fs.createReadStream(gPhotoPath));
            formData.append("caption", `📸 Foto de ${stage} — ${(note as any).folio}`);

            await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
              method: "POST",
              body: formData as any,
              signal: AbortSignal.timeout(30000),
            });
            console.log("[TG Bot] Foto de", stage, "enviada al grupo OK");
          } catch (err) {
            console.error("[TG Bot] Error enviando foto al grupo:", err);
          }
        } else {
          console.log("[TG Bot] Foto no encontrada en disco:", gPhotoPath);
        }
      }
    } catch (photoErr) {
      console.error("[TG Bot] Error al enviar fotos al grupo:", photoErr);
    }
  }

  return true;
}

// ============================================================
// Notificar al grupo cuando se crea una nota desde la web
// ============================================================

export async function notifyGroupNewNoteFromWeb(noteId: number, folio: string, description: string, category: string, severity: string, parcelName?: string, reporterName?: string, photoPath?: string): Promise<boolean> {
  console.log("[TG Bot] notifyGroupNewNoteFromWeb llamada para folio:", folio);
  const botToken = await getBotToken();
  if (!botToken) {
    console.log("[TG Bot] notifyGroupNewNoteFromWeb: No hay botToken");
    return false;
  }

  const groupChatId = await getFieldNotesGroupChatId();
  console.log("[TG Bot] notifyGroupNewNoteFromWeb: groupChatId =", groupChatId);
  if (!groupChatId) {
    console.log("[TG Bot] notifyGroupNewNoteFromWeb: No hay groupChatId, abortando");
    return false;
  }

  const catInfo = CATEGORIES[category] || { label: category, emoji: "📋" };
  const priorityLabels: Record<string, string> = { baja: "🟢 Baja", media: "🟡 Media", alta: "🟠 Alta", critica: "🔴 Crítica" };
  const priorityText = priorityLabels[severity] || severity;

  let msg = `🆕 <b>Nueva Nota de Campo</b>\n\n`;
  msg += `📋 Folio: <b>${folio}</b>\n`;
  msg += `${catInfo.emoji} ${catInfo.label}\n`;
  msg += `⚡ Prioridad: ${priorityText}\n`;
  if (parcelName) msg += `📍 Parcela: ${parcelName}\n`;
  if (reporterName) msg += `👤 Reportó: ${reporterName}\n`;
  msg += `\n📝 ${description.substring(0, 200)}\n`;
  msg += `\n🌐 <i>Creada desde la web</i>`;

  await sendMessage(botToken, groupChatId, msg);
  console.log("[TG Bot] notifyGroupNewNoteFromWeb: Mensaje enviado al grupo OK");

  // Enviar foto si existe
  if (photoPath) {
    try {
      const photoFs = await import("fs");
      if (photoFs.existsSync(photoPath)) {
        const FormData = (await import("form-data")).default;
        const formData = new FormData();
        formData.append("chat_id", groupChatId);
        formData.append("photo", photoFs.createReadStream(photoPath));
        formData.append("caption", `📸 Foto — ${folio}`);
        await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: "POST",
          body: formData as any,
          signal: AbortSignal.timeout(30000),
        });
      }
    } catch (err) {
      console.error("[TG Bot] Error enviando foto al grupo:", err);
    }
  }

  return true;
}

// ============================================================
// Polling de actualizaciones
// ============================================================

async function pollUpdates() {
  const botToken = await getBotToken();
  if (!botToken) {
    console.log("[TG Bot] No hay botToken configurado, reintentando en 60s...");
    pollTimer = setTimeout(pollUpdates, 60000);
    return;
  }

  try {
    cleanExpiredConversations();

    const result = await callTelegram(botToken, "getUpdates", {
      offset: pollingOffset,
      timeout: 25,
      allowed_updates: ["message", "callback_query"],
    });

    if (result?.result) {
      for (const update of result.result) {
        pollingOffset = update.update_id + 1;
        try {
          await handleUpdate(botToken, update);
        } catch (error) {
          console.error("[TG Bot] Error procesando update:", error);
        }
      }
    }
  } catch (error: any) {
    if (error.name !== "AbortError") {
      console.error("[TG Bot] Error en polling:", error.message);
    }
  }

  if (isPolling) {
    pollTimer = setTimeout(pollUpdates, 1000);
  }
}

// ============================================================
// Inicio y parada del bot
// ============================================================

export function startFieldNotesBot() {
  if (isPolling) {
    console.log("[TG Bot] Bot ya está corriendo");
    return;
  }
  isPolling = true;
  console.log("🤖 [TG Bot] Bot de Notas de Campo iniciado (polling)");
  pollUpdates();
}

export function stopFieldNotesBot() {
  isPolling = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  console.log("[TG Bot] Bot de Notas de Campo detenido");
}
