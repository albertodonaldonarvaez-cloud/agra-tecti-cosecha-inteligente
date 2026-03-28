import { getDb } from "./db";
import { users, telegramLinkCodes, fieldNotes, fieldNotePhotos, parcels } from "../drizzle/schema";
import { eq, and, gt, sql, isNotNull } from "drizzle-orm";
import { getTelegramConfig } from "./telegramBot";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// Bot de Telegram para Notas de Campo
// Permite a los usuarios vinculados crear notas de campo
// directamente desde Telegram con foto, texto y ubicación.
// También envía notificaciones cuando las notas cambian de estado.
// ============================================================

// Estado de conversación por chatId
interface ConversationState {
  step: "idle" | "waiting_category" | "waiting_description" | "waiting_photo" | "waiting_location" | "waiting_severity" | "waiting_parcel";
  data: {
    category?: string;
    description?: string;
    photoBase64?: string;
    latitude?: number;
    longitude?: number;
    severity?: string;
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

const SEVERITIES: Record<string, { label: string; emoji: string }> = {
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
  const response = await fetch(url, options);
  if (!response.ok) {
    const err = await response.text();
    console.error(`[TG Bot] Error ${method}: ${response.status} - ${err}`);
    return null;
  }
  return await response.json();
}

async function sendMessage(botToken: string, chatId: string, text: string, replyMarkup?: any): Promise<any> {
  return callTelegram(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

async function editMessageText(botToken: string, chatId: string, messageId: number, text: string, replyMarkup?: any): Promise<any> {
  return callTelegram(botToken, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
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

async function createFieldNote(state: ConversationState): Promise<{ folio: string; id: number } | null> {
  const db = await getDb();
  if (!db) return null;

  const folio = await generateFolio();

  const [result] = await db.insert(fieldNotes).values({
    folio,
    description: state.data.description || "Nota desde Telegram",
    category: (state.data.category || "otro") as any,
    severity: (state.data.severity || "media") as any,
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

function getMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📝 Nueva Nota de Campo", callback_data: "menu_nueva_nota" }],
      [{ text: "📋 Mis Notas Recientes", callback_data: "menu_mis_notas" }],
      [{ text: "❓ Ayuda", callback_data: "menu_ayuda" }],
    ],
  };
}

function getCancelKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "❌ Cancelar", callback_data: "cancel_note" }],
    ],
  };
}

// ============================================================
// Flujo de conversación
// ============================================================

function cleanExpiredConversations() {
  const now = Date.now();
  for (const [chatId, state] of conversations) {
    if (now - state.lastActivity > 30 * 60 * 1000) {
      conversations.delete(chatId);
    }
  }
}

async function handleUpdate(botToken: string, update: any) {
  const message = update.message || update.callback_query?.message;
  if (!message) return;

  const chatId = String(message.chat.id);
  const chatType = message.chat.type;

  // Si es callback_query (botón presionado)
  if (update.callback_query) {
    await handleCallback(botToken, chatId, update.callback_query);
    return;
  }

  // Solo responder en chats privados
  if (chatType !== "private") return;

  const text = message.text?.trim() || "";
  const photo = message.photo;
  const location = message.location;

  // Comando /start
  if (text === "/start") {
    const user = await getUserByChatId(chatId);
    if (user) {
      await sendMessage(botToken, chatId,
        `🌿 <b>AGRA-TECTI - Notas de Campo</b>\n\n` +
        `¡Hola <b>${user.name}</b>! 👋\n\n` +
        `¿Qué deseas hacer?`,
        getMainMenuKeyboard()
      );
    } else {
      await sendMessage(botToken, chatId,
        `🌿 <b>AGRA-TECTI - Notas de Campo</b>\n\n` +
        `Bienvenido. Tu cuenta aún no está vinculada.\n\n` +
        `Para vincularla, pide a tu administrador que te vincule desde la plataforma web, o envía:\n` +
        `<code>/vincular TU-CÓDIGO</code>`,
        {
          inline_keyboard: [
            [{ text: "❓ ¿Cómo me vinculo?", callback_data: "menu_ayuda_vincular" }],
          ],
        }
      );
    }
    return;
  }

  // Comando /vincular
  if (text.startsWith("/vincular")) {
    const code = text.replace("/vincular", "").trim();
    if (!code) {
      await sendMessage(botToken, chatId,
        `⚠️ Envía el comando con tu código:\n<code>/vincular TU-CÓDIGO</code>`,
        { inline_keyboard: [[{ text: "❓ ¿Dónde obtengo el código?", callback_data: "menu_ayuda_vincular" }]] }
      );
      return;
    }
    await handleLink(botToken, chatId, code, message.from);
    return;
  }

  // Verificar si el usuario está vinculado
  const user = await getUserByChatId(chatId);
  if (!user) {
    await sendMessage(botToken, chatId,
      `⚠️ Tu cuenta no está vinculada.\n\n` +
      `Pide a tu administrador que te vincule, o envía:\n` +
      `<code>/vincular TU-CÓDIGO</code>`,
      { inline_keyboard: [[{ text: "❓ ¿Cómo me vinculo?", callback_data: "menu_ayuda_vincular" }]] }
    );
    return;
  }

  // Comando /nota
  if (text === "/nota") {
    await startNewNote(botToken, chatId, user.id);
    return;
  }

  // Comando /misnotas
  if (text === "/misnotas") {
    await showMyNotes(botToken, chatId, user.id);
    return;
  }

  // Comando /ayuda
  if (text === "/ayuda" || text === "/help") {
    await sendHelpMessage(botToken, chatId);
    return;
  }

  // Comando /cancelar
  if (text === "/cancelar") {
    if (conversations.has(chatId)) {
      conversations.delete(chatId);
      await sendMessage(botToken, chatId,
        `❌ Nota cancelada.\n\n¿Qué deseas hacer?`,
        getMainMenuKeyboard()
      );
    } else {
      await sendMessage(botToken, chatId, `No hay ninguna nota en proceso.`, getMainMenuKeyboard());
    }
    return;
  }

  // Si el usuario envía una foto directamente (atajo rápido)
  if (photo && !conversations.has(chatId)) {
    await startNewNote(botToken, chatId, user.id);
    const state = conversations.get(chatId);
    if (state) {
      state.step = "waiting_photo";
      await handlePhotoStep(botToken, chatId, state, photo, message.caption);
    }
    return;
  }

  // Si envía ubicación directamente sin conversación activa
  if (location && !conversations.has(chatId)) {
    await sendMessage(botToken, chatId,
      `📍 Ubicación recibida, pero no hay una nota en proceso.\n\n¿Qué deseas hacer?`,
      getMainMenuKeyboard()
    );
    return;
  }

  // Si hay conversación activa, manejar el paso actual
  const state = conversations.get(chatId);
  if (state) {
    state.lastActivity = Date.now();
    await handleConversationStep(botToken, chatId, state, message);
    return;
  }

  // Mensaje no reconocido - mostrar menú
  await sendMessage(botToken, chatId,
    `¿Qué deseas hacer?`,
    getMainMenuKeyboard()
  );
}

async function handleLink(botToken: string, chatId: string, code: string, from: any) {
  const db = await getDb();
  if (!db) {
    await sendMessage(botToken, chatId, "❌ Error de conexión. Intenta más tarde.");
    return;
  }

  const [linkCode] = await db.select()
    .from(telegramLinkCodes)
    .where(and(
      eq(telegramLinkCodes.code, code.toUpperCase()),
      eq(telegramLinkCodes.used, false),
      gt(telegramLinkCodes.expiresAt, new Date()),
    ));

  if (!linkCode) {
    await sendMessage(botToken, chatId,
      `❌ Código inválido o expirado.\n\nPide a tu administrador un nuevo código.`,
      { inline_keyboard: [[{ text: "❓ Ayuda", callback_data: "menu_ayuda_vincular" }]] }
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
    getMainMenuKeyboard()
  );
}

async function startNewNote(botToken: string, chatId: string, userId: number) {
  const state: ConversationState = {
    step: "waiting_category",
    data: {},
    userId,
    lastActivity: Date.now(),
  };
  conversations.set(chatId, state);

  // Categorías en filas de 2 botones
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

async function handleCallback(botToken: string, chatId: string, callbackQuery: any) {
  const data = callbackQuery.data;
  const messageId = callbackQuery.message?.message_id;

  // Responder al callback para quitar el "loading"
  await callTelegram(botToken, "answerCallbackQuery", { callback_query_id: callbackQuery.id });

  // Menú principal
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

  if (data === "menu_ayuda_vincular") {
    await sendMessage(botToken, chatId,
      `🔗 <b>¿Cómo vincular tu cuenta?</b>\n\n` +
      `<b>Opción 1 — Tu administrador te vincula:</b>\n` +
      `Tu admin entra a Usuarios en la web, busca tu nombre y presiona "Vincular Telegram".\n\n` +
      `<b>Opción 2 — Tú te vinculas:</b>\n` +
      `1. Entra a la plataforma web\n` +
      `2. Ve a Notas de Campo\n` +
      `3. Presiona "Vincular Telegram"\n` +
      `4. Copia el código y envíalo aquí:\n` +
      `<code>/vincular TU-CÓDIGO</code>`,
      { inline_keyboard: [[{ text: "⬅️ Menú principal", callback_data: "menu_back" }]] }
    );
    return;
  }

  if (data === "menu_back") {
    const user = await getUserByChatId(chatId);
    if (user) {
      await sendMessage(botToken, chatId, `¿Qué deseas hacer?`, getMainMenuKeyboard());
    }
    return;
  }

  // Cancelar nota en proceso
  if (data === "cancel_note") {
    conversations.delete(chatId);
    if (messageId) {
      await editMessageText(botToken, chatId, messageId,
        `❌ Nota cancelada.`
      );
    }
    await sendMessage(botToken, chatId, `¿Qué deseas hacer?`, getMainMenuKeyboard());
    return;
  }

  const state = conversations.get(chatId);
  if (!state) return;
  state.lastActivity = Date.now();

  // Categoría seleccionada
  if (data.startsWith("cat_") && state.step === "waiting_category") {
    const category = data.replace("cat_", "");
    state.data.category = category;
    state.step = "waiting_description";
    const catInfo = CATEGORIES[category] || { label: category, emoji: "📋" };

    // Editar el mensaje anterior para mostrar la selección
    if (messageId) {
      await editMessageText(botToken, chatId, messageId,
        `✅ Categoría: <b>${catInfo.emoji} ${catInfo.label}</b>`
      );
    }

    await sendMessage(botToken, chatId,
      `Paso 2️⃣ de 5️⃣ — Escribe una <b>descripción</b> del problema:`,
      getCancelKeyboard()
    );
    return;
  }

  // Severidad seleccionada
  if (data.startsWith("sev_") && state.step === "waiting_severity") {
    const severity = data.replace("sev_", "");
    state.data.severity = severity;
    const sevInfo = SEVERITIES[severity] || { label: severity, emoji: "🟡" };

    if (messageId) {
      await editMessageText(botToken, chatId, messageId,
        `✅ Severidad: <b>${sevInfo.emoji} ${sevInfo.label}</b>`
      );
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
      await editMessageText(botToken, chatId, messageId,
        `✅ Parcela: <b>${parcelName}</b>`
      );
    }

    await finishNote(botToken, chatId, state);
    return;
  }

  // Omitir ubicación
  if (data === "skip_location" && state.step === "waiting_location") {
    if (messageId) {
      await editMessageText(botToken, chatId, messageId,
        `⏭️ Ubicación: <b>Omitida</b>`
      );
    }
    state.step = "waiting_severity";
    await askSeverity(botToken, chatId);
    return;
  }
}

async function handleConversationStep(botToken: string, chatId: string, state: ConversationState, message: any) {
  const text = message.text?.trim() || "";
  const photo = message.photo;
  const location = message.location;

  switch (state.step) {
    case "waiting_description":
      if (!text && !photo) {
        await sendMessage(botToken, chatId, "✏️ Escribe una descripción del problema:", getCancelKeyboard());
        return;
      }
      if (photo) {
        // Si envían foto en paso de descripción, guardar caption como descripción y procesar foto
        state.data.description = message.caption || "";
        state.step = "waiting_photo";
        await handlePhotoStep(botToken, chatId, state, photo, message.caption);
        return;
      }
      state.data.description = text;
      state.step = "waiting_photo";
      await sendMessage(botToken, chatId,
        `✅ Descripción registrada.\n\n` +
        `Paso 3️⃣ de 5️⃣ — Envía una <b>foto</b> del problema 📸\n` +
        `(Toma una foto o envía de tu galería)`,
        getCancelKeyboard()
      );
      break;

    case "waiting_photo":
      if (photo) {
        await handlePhotoStep(botToken, chatId, state, photo, message.caption);
      } else {
        await sendMessage(botToken, chatId, "📸 Envía una <b>foto</b> del problema:", getCancelKeyboard());
      }
      break;

    case "waiting_location":
      if (location) {
        state.data.latitude = location.latitude;
        state.data.longitude = location.longitude;
        await sendMessage(botToken, chatId, `✅ Ubicación registrada.`);
        state.step = "waiting_severity";
        await askSeverity(botToken, chatId);
      } else if (text.toLowerCase() === "omitir" || text === "/omitir") {
        state.step = "waiting_severity";
        await askSeverity(botToken, chatId);
      } else {
        await sendMessage(botToken, chatId,
          `📍 Envía tu <b>ubicación</b> usando el clip 📎 > Ubicación`,
          {
            inline_keyboard: [
              [{ text: "⏭️ Omitir ubicación", callback_data: "skip_location" }],
              [{ text: "❌ Cancelar", callback_data: "cancel_note" }],
            ],
          }
        );
      }
      break;

    case "waiting_severity":
      const sevKey = Object.keys(SEVERITIES).find(k => text.toLowerCase().includes(k));
      if (sevKey) {
        state.data.severity = sevKey;
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
          rows.push([{ text: "⏭️ Sin parcela", callback_data: "parcel_none" }]);
          rows.push([{ text: "❌ Cancelar", callback_data: "cancel_note" }]);
          await sendMessage(botToken, chatId, `Selecciona la <b>parcela</b>:`, { inline_keyboard: rows });
        } else {
          await finishNote(botToken, chatId, state);
        }
      } else {
        await askSeverity(botToken, chatId);
      }
      break;

    default:
      await sendMessage(botToken, chatId, `¿Qué deseas hacer?`, getMainMenuKeyboard());
      conversations.delete(chatId);
  }
}

async function handlePhotoStep(botToken: string, chatId: string, state: ConversationState, photo: any[], caption?: string) {
  const config = await getTelegramConfig();
  if (!config) return;

  const largestPhoto = photo[photo.length - 1];
  const buffer = await downloadFile(config.botToken, largestPhoto.file_id);
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
      getCancelKeyboard()
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

  state.step = "waiting_location";
  await sendMessage(botToken, chatId,
    `📸 Foto recibida.\n\n` +
    `Paso 4️⃣ de 5️⃣ — Envía tu <b>ubicación</b> 📍\n` +
    `Usa el clip 📎 > Ubicación`,
    {
      inline_keyboard: [
        [{ text: "⏭️ Omitir ubicación", callback_data: "skip_location" }],
        [{ text: "❌ Cancelar", callback_data: "cancel_note" }],
      ],
    }
  );
}

async function askSeverity(botToken: string, chatId: string) {
  const rows: any[][] = [];
  const sevEntries = Object.entries(SEVERITIES);
  // Todas en una fila horizontal
  rows.push(sevEntries.map(([key, val]) => ({
    text: `${val.emoji} ${val.label}`,
    callback_data: `sev_${key}`,
  })));
  rows.push([{ text: "❌ Cancelar", callback_data: "cancel_note" }]);

  await sendMessage(botToken, chatId,
    `Paso 4️⃣ de 5️⃣ — Selecciona la <b>severidad</b>:`,
    { inline_keyboard: rows }
  );
}

async function finishNote(botToken: string, chatId: string, state: ConversationState) {
  try {
    // Mensaje de "creando..."
    const loadingMsg = await sendMessage(botToken, chatId, `⏳ Creando nota de campo...`);

    const result = await createFieldNote(state);
    if (!result) {
      await sendMessage(botToken, chatId, "❌ Error al crear la nota. Intenta de nuevo.", getMainMenuKeyboard());
      conversations.delete(chatId);
      return;
    }

    const catInfo = CATEGORIES[state.data.category || "otro"] || { label: "Otro", emoji: "📋" };
    const sevInfo = SEVERITIES[state.data.severity || "media"] || { label: "Media", emoji: "🟡" };

    let locationText = "No proporcionada";
    if (state.data.latitude && state.data.longitude) {
      locationText = `📍 <a href="https://maps.google.com/?q=${state.data.latitude},${state.data.longitude}">Ver en mapa</a>`;
    }

    // Editar el mensaje de "creando..." con el resultado
    if (loadingMsg?.result?.message_id) {
      await editMessageText(botToken, chatId, loadingMsg.result.message_id,
        `✅ <b>¡Nota Creada!</b>\n\n` +
        `📋 Folio: <b>${result.folio}</b>\n` +
        `${catInfo.emoji} Categoría: ${catInfo.label}\n` +
        `${sevInfo.emoji} Severidad: ${sevInfo.label}\n` +
        `📝 ${state.data.description}\n` +
        `${locationText}\n` +
        `📸 Foto: Sí\n\n` +
        `🔔 Te notificaremos cuando haya novedades.`
      );
    } else {
      await sendMessage(botToken, chatId,
        `✅ <b>¡Nota Creada!</b>\n\n` +
        `📋 Folio: <b>${result.folio}</b>\n` +
        `${catInfo.emoji} Categoría: ${catInfo.label}\n` +
        `${sevInfo.emoji} Severidad: ${sevInfo.label}\n` +
        `📝 ${state.data.description}\n` +
        `${locationText}\n` +
        `📸 Foto: Sí\n\n` +
        `🔔 Te notificaremos cuando haya novedades.`
      );
    }

    // Mostrar menú principal
    await sendMessage(botToken, chatId, `¿Qué más deseas hacer?`, getMainMenuKeyboard());

    conversations.delete(chatId);
  } catch (error: any) {
    console.error("[TG Bot] Error al crear nota:", error);
    await sendMessage(botToken, chatId, `❌ Error: ${error.message}`, getMainMenuKeyboard());
    conversations.delete(chatId);
  }
}

async function showMyNotes(botToken: string, chatId: string, userId: number) {
  const db = await getDb();
  if (!db) {
    await sendMessage(botToken, chatId, "❌ Error de conexión.", getMainMenuKeyboard());
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
      {
        inline_keyboard: [
          [{ text: "📝 Crear una nota", callback_data: "menu_nueva_nota" }],
          [{ text: "⬅️ Menú principal", callback_data: "menu_back" }],
        ],
      }
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

async function sendHelpMessage(botToken: string, chatId: string) {
  await sendMessage(botToken, chatId,
    `🌿 <b>AGRA-TECTI — Ayuda</b>\n\n` +
    `<b>📝 Crear nota:</b>\n` +
    `Presiona "Nueva Nota" o envía una foto directamente.\n\n` +
    `<b>📋 Ver notas:</b>\n` +
    `Presiona "Mis Notas" para ver tus reportes.\n\n` +
    `<b>🔔 Notificaciones:</b>\n` +
    `Recibirás un mensaje cuando tus notas cambien de estado, incluyendo fotos de resolución.\n\n` +
    `<b>🔗 Vincular cuenta:</b>\n` +
    `Tu admin puede vincularte desde la web, o usa /vincular CÓDIGO.\n\n` +
    `<b>Comandos:</b>\n` +
    `/nota — Nueva nota\n` +
    `/misnotas — Ver notas\n` +
    `/cancelar — Cancelar nota en proceso\n` +
    `/ayuda — Esta ayuda`,
    {
      inline_keyboard: [
        [{ text: "⬅️ Menú principal", callback_data: "menu_back" }],
      ],
    }
  );
}

// ============================================================
// Notificaciones de cambio de estado
// ============================================================

export async function notifyNoteStatusChange(noteId: number, newStatus: string, resolvedByName?: string): Promise<boolean> {
  const config = await getTelegramConfig();
  if (!config) return false;

  const db = await getDb();
  if (!db) return false;

  const [note] = await db.select().from(fieldNotes).where(eq(fieldNotes.id, noteId));
  if (!note) return false;

  const reporterId = (note as any).reportedByUserId;
  if (!reporterId) return false;

  const [user] = await db.select({ telegramChatId: users.telegramChatId, name: users.name })
    .from(users)
    .where(eq(users.id, reporterId));

  if (!user?.telegramChatId) return false;

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

  await sendMessage(config.botToken, user.telegramChatId, msg);

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

          const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendPhoto`, {
            method: "POST",
            body: formData as any,
            signal: AbortSignal.timeout(30000),
          });
          if (!response.ok) {
            console.error("[TG Bot] Error enviando foto:", await response.text());
          }
        } catch (err) {
          console.error("[TG Bot] Error enviando foto de resolución:", err);
        }
      }
    }
  }

  return true;
}

// ============================================================
// Polling de actualizaciones
// ============================================================

async function pollUpdates() {
  const config = await getTelegramConfig();
  if (!config) {
    console.log("[TG Bot] No hay configuración de Telegram, reintentando en 60s...");
    pollTimer = setTimeout(pollUpdates, 60000);
    return;
  }

  try {
    cleanExpiredConversations();

    const result = await callTelegram(config.botToken, "getUpdates", {
      offset: pollingOffset,
      timeout: 25,
      allowed_updates: ["message", "callback_query"],
    });

    if (result?.result) {
      for (const update of result.result) {
        pollingOffset = update.update_id + 1;
        try {
          await handleUpdate(config.botToken, update);
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
