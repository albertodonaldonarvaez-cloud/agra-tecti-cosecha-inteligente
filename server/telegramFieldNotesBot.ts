import { getDb } from "./db";
import { users, telegramLinkCodes, fieldNotes, fieldNotePhotos, parcels } from "../drizzle/schema";
import { eq, and, gt, sql, isNull, isNotNull } from "drizzle-orm";
import { getTelegramConfig } from "./telegramBot";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// Bot de Telegram para Notas de Campo
// Permite a los usuarios vinculados crear notas de campo
// directamente desde Telegram con foto, texto y ubicación.
// También envía notificaciones cuando las notas cambian de estado.
// ============================================================

const TIMEZONE = "America/Mexico_City";

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

async function sendPhoto(botToken: string, chatId: string, photoUrl: string, caption?: string): Promise<any> {
  return callTelegram(botToken, "sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption: caption || undefined,
    parse_mode: "HTML",
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
// Flujo de conversación
// ============================================================

function cleanExpiredConversations() {
  const now = Date.now();
  for (const [chatId, state] of conversations) {
    if (now - state.lastActivity > 30 * 60 * 1000) { // 30 min timeout
      conversations.delete(chatId);
    }
  }
}

async function handleUpdate(botToken: string, update: any) {
  // Solo manejar mensajes privados (no grupos)
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
    await sendMessage(botToken, chatId, 
      `🌿 <b>AGRA-TECTI - Notas de Campo</b>\n\n` +
      `Bienvenido al bot de Notas de Campo.\n\n` +
      `<b>Comandos disponibles:</b>\n` +
      `/vincular [CÓDIGO] - Vincular tu cuenta\n` +
      `/nota - Crear una nueva nota de campo\n` +
      `/misnotas - Ver tus notas recientes\n` +
      `/ayuda - Ver esta ayuda\n\n` +
      `Para empezar, vincula tu cuenta con el código que te da la plataforma web.`
    );
    return;
  }

  // Comando /ayuda
  if (text === "/ayuda" || text === "/help") {
    await sendMessage(botToken, chatId,
      `🌿 <b>AGRA-TECTI - Ayuda</b>\n\n` +
      `<b>¿Cómo vincular mi cuenta?</b>\n` +
      `1. Entra a la plataforma web\n` +
      `2. Ve a tu perfil o configuración\n` +
      `3. Haz clic en "Vincular Telegram"\n` +
      `4. Copia el código y envíalo aquí con /vincular CÓDIGO\n\n` +
      `<b>¿Cómo crear una nota?</b>\n` +
      `1. Envía /nota\n` +
      `2. Selecciona la categoría\n` +
      `3. Escribe la descripción\n` +
      `4. Envía una foto\n` +
      `5. Envía tu ubicación\n` +
      `6. Selecciona la severidad\n\n` +
      `<b>Atajo rápido:</b>\n` +
      `También puedes enviar directamente una foto con descripción y el bot te guiará para completar la nota.\n\n` +
      `🤖 AGRA-TECTI Cosecha Inteligente`
    );
    return;
  }

  // Comando /vincular
  if (text.startsWith("/vincular")) {
    const code = text.replace("/vincular", "").trim();
    if (!code) {
      await sendMessage(botToken, chatId, "⚠️ Envía el comando con tu código:\n<code>/vincular TU-CÓDIGO</code>");
      return;
    }
    await handleLink(botToken, chatId, code, message.from);
    return;
  }

  // Verificar si el usuario está vinculado
  const user = await getUserByChatId(chatId);
  if (!user) {
    await sendMessage(botToken, chatId,
      `⚠️ Tu cuenta de Telegram no está vinculada.\n\n` +
      `Para vincularla:\n` +
      `1. Entra a la plataforma web\n` +
      `2. Ve a tu perfil\n` +
      `3. Genera un código de vinculación\n` +
      `4. Envíalo aquí: /vincular TU-CÓDIGO`
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

  // Si el usuario envía una foto directamente (atajo rápido)
  if (photo && !conversations.has(chatId)) {
    await startNewNote(botToken, chatId, user.id);
    // Procesar la foto inmediatamente
    const state = conversations.get(chatId);
    if (state) {
      state.step = "waiting_photo";
      await handlePhotoStep(botToken, chatId, state, photo, message.caption);
    }
    return;
  }

  // Si hay conversación activa, manejar el paso actual
  const state = conversations.get(chatId);
  if (state) {
    state.lastActivity = Date.now();
    await handleConversationStep(botToken, chatId, state, message);
    return;
  }

  // Mensaje no reconocido
  await sendMessage(botToken, chatId,
    `No entendí tu mensaje. Usa:\n` +
    `/nota - Crear nota de campo\n` +
    `/misnotas - Ver tus notas\n` +
    `/ayuda - Ver ayuda`
  );
}

async function handleLink(botToken: string, chatId: string, code: string, from: any) {
  const db = await getDb();
  if (!db) {
    await sendMessage(botToken, chatId, "❌ Error de conexión. Intenta más tarde.");
    return;
  }

  // Buscar código válido
  const [linkCode] = await db.select()
    .from(telegramLinkCodes)
    .where(and(
      eq(telegramLinkCodes.code, code.toUpperCase()),
      eq(telegramLinkCodes.used, false),
      gt(telegramLinkCodes.expiresAt, new Date()),
    ));

  if (!linkCode) {
    await sendMessage(botToken, chatId, "❌ Código inválido o expirado. Genera uno nuevo desde la plataforma web.");
    return;
  }

  // Vincular
  await db.update(users).set({
    telegramChatId: chatId,
    telegramUsername: from?.username || from?.first_name || null,
    telegramLinkedAt: new Date(),
  }).where(eq(users.id, linkCode.userId));

  // Marcar código como usado
  await db.update(telegramLinkCodes).set({ used: true }).where(eq(telegramLinkCodes.id, linkCode.id));

  // Obtener nombre del usuario
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, linkCode.userId));

  await sendMessage(botToken, chatId,
    `✅ <b>¡Cuenta vinculada exitosamente!</b>\n\n` +
    `Hola <b>${user?.name || "usuario"}</b>, tu cuenta de Telegram está vinculada.\n\n` +
    `Ahora puedes:\n` +
    `📝 /nota - Crear notas de campo\n` +
    `📋 /misnotas - Ver tus notas\n` +
    `🔔 Recibirás notificaciones cuando tus notas cambien de estado.\n\n` +
    `🌿 AGRA-TECTI Cosecha Inteligente`
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

  // Mostrar categorías como botones inline
  const keyboard = {
    inline_keyboard: Object.entries(CATEGORIES).map(([key, val]) => ([
      { text: `${val.emoji} ${val.label}`, callback_data: `cat_${key}` }
    ])),
  };

  await sendMessage(botToken, chatId,
    `📝 <b>Nueva Nota de Campo</b>\n\n` +
    `Selecciona la categoría del problema:`,
    keyboard
  );
}

async function handleCallback(botToken: string, chatId: string, callbackQuery: any) {
  const data = callbackQuery.data;
  const state = conversations.get(chatId);

  // Responder al callback para quitar el "loading"
  await callTelegram(botToken, "answerCallbackQuery", { callback_query_id: callbackQuery.id });

  if (!state) return;
  state.lastActivity = Date.now();

  // Categoría seleccionada
  if (data.startsWith("cat_") && state.step === "waiting_category") {
    const category = data.replace("cat_", "");
    state.data.category = category;
    state.step = "waiting_description";
    const catInfo = CATEGORIES[category] || { label: category, emoji: "📋" };
    await sendMessage(botToken, chatId,
      `${catInfo.emoji} Categoría: <b>${catInfo.label}</b>\n\n` +
      `Ahora escribe una <b>descripción</b> del problema que observas:`
    );
    return;
  }

  // Severidad seleccionada
  if (data.startsWith("sev_") && state.step === "waiting_severity") {
    const severity = data.replace("sev_", "");
    state.data.severity = severity;
    const sevInfo = SEVERITIES[severity] || { label: severity, emoji: "🟡" };

    // Mostrar parcelas para seleccionar
    const parcelsList = await getActiveParcels();
    if (parcelsList.length > 0) {
      state.step = "waiting_parcel";
      const keyboard = {
        inline_keyboard: [
          ...parcelsList.slice(0, 20).map((p: any) => ([
            { text: `🌱 ${p.name}`, callback_data: `parcel_${p.id}` }
          ])),
          [{ text: "⏭️ Sin parcela específica", callback_data: "parcel_none" }],
        ],
      };
      await sendMessage(botToken, chatId,
        `${sevInfo.emoji} Severidad: <b>${sevInfo.label}</b>\n\n` +
        `Selecciona la <b>parcela</b> donde encontraste el problema:`,
        keyboard
      );
    } else {
      // No hay parcelas, crear nota directamente
      await finishNote(botToken, chatId, state);
    }
    return;
  }

  // Parcela seleccionada
  if (data.startsWith("parcel_") && state.step === "waiting_parcel") {
    if (data !== "parcel_none") {
      state.data.parcelId = parseInt(data.replace("parcel_", ""));
    }
    await finishNote(botToken, chatId, state);
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
        await sendMessage(botToken, chatId, "✏️ Por favor escribe una descripción del problema:");
        return;
      }
      state.data.description = text || message.caption || "";
      state.step = "waiting_photo";
      await sendMessage(botToken, chatId,
        `✅ Descripción registrada.\n\n` +
        `📸 Ahora envía una <b>foto</b> del problema.\n` +
        `(Puedes tomar una foto o enviar una de tu galería)`
      );
      break;

    case "waiting_photo":
      if (photo) {
        await handlePhotoStep(botToken, chatId, state, photo, message.caption);
      } else {
        await sendMessage(botToken, chatId, "📸 Por favor envía una <b>foto</b> del problema:");
      }
      break;

    case "waiting_location":
      if (location) {
        state.data.latitude = location.latitude;
        state.data.longitude = location.longitude;
        state.step = "waiting_severity";
        await askSeverity(botToken, chatId);
      } else if (text.toLowerCase() === "omitir" || text === "/omitir") {
        state.step = "waiting_severity";
        await askSeverity(botToken, chatId);
      } else {
        await sendMessage(botToken, chatId,
          `📍 Envía tu <b>ubicación</b> usando el botón de adjuntar > Ubicación.\n\n` +
          `O escribe /omitir para continuar sin ubicación.`,
          {
            keyboard: [[{ text: "📍 Enviar ubicación", request_location: true }], [{ text: "⏭️ Omitir" }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          }
        );
      }
      break;

    case "waiting_severity":
      // Si escriben texto en lugar de usar botones
      const sevKey = Object.keys(SEVERITIES).find(k => text.toLowerCase().includes(k));
      if (sevKey) {
        state.data.severity = sevKey;
        const parcelsList = await getActiveParcels();
        if (parcelsList.length > 0) {
          state.step = "waiting_parcel";
          const keyboard = {
            inline_keyboard: [
              ...parcelsList.slice(0, 20).map((p: any) => ([
                { text: `🌱 ${p.name}`, callback_data: `parcel_${p.id}` }
              ])),
              [{ text: "⏭️ Sin parcela específica", callback_data: "parcel_none" }],
            ],
          };
          await sendMessage(botToken, chatId, `Selecciona la <b>parcela</b>:`, keyboard);
        } else {
          await finishNote(botToken, chatId, state);
        }
      } else {
        await askSeverity(botToken, chatId);
      }
      break;

    default:
      await sendMessage(botToken, chatId, "Usa /nota para crear una nueva nota de campo.");
      conversations.delete(chatId);
  }
}

async function handlePhotoStep(botToken: string, chatId: string, state: ConversationState, photo: any[], caption?: string) {
  // Tomar la foto de mayor resolución
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
      `📸 Foto recibida.\n\n✏️ Ahora escribe una <b>descripción</b> del problema:`
    );
    return;
  }

  state.step = "waiting_location";
  await sendMessage(botToken, chatId,
    `📸 Foto recibida.\n\n` +
    `📍 Ahora envía tu <b>ubicación</b> para geolocalizar el problema.\n` +
    `Usa el botón de adjuntar > Ubicación.\n\n` +
    `Escribe /omitir si no quieres enviar ubicación.`,
    {
      keyboard: [[{ text: "📍 Enviar ubicación", request_location: true }], [{ text: "⏭️ Omitir" }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    }
  );
}

async function askSeverity(botToken: string, chatId: string) {
  const keyboard = {
    inline_keyboard: Object.entries(SEVERITIES).map(([key, val]) => ([
      { text: `${val.emoji} ${val.label}`, callback_data: `sev_${key}` }
    ])),
  };
  await sendMessage(botToken, chatId,
    `Selecciona la <b>severidad</b> del problema:`,
    keyboard
  );
}

async function finishNote(botToken: string, chatId: string, state: ConversationState) {
  try {
    const result = await createFieldNote(state);
    if (!result) {
      await sendMessage(botToken, chatId, "❌ Error al crear la nota. Intenta de nuevo.");
      conversations.delete(chatId);
      return;
    }

    const catInfo = CATEGORIES[state.data.category || "otro"] || { label: "Otro", emoji: "📋" };
    const sevInfo = SEVERITIES[state.data.severity || "media"] || { label: "Media", emoji: "🟡" };

    let locationText = "No proporcionada";
    if (state.data.latitude && state.data.longitude) {
      locationText = `<a href="https://maps.google.com/?q=${state.data.latitude},${state.data.longitude}">Ver en mapa</a>`;
    }

    // Quitar teclado personalizado
    await sendMessage(botToken, chatId,
      `✅ <b>Nota de Campo Creada</b>\n\n` +
      `📋 Folio: <b>${result.folio}</b>\n` +
      `${catInfo.emoji} Categoría: ${catInfo.label}\n` +
      `${sevInfo.emoji} Severidad: ${sevInfo.label}\n` +
      `📝 ${state.data.description}\n` +
      `📍 Ubicación: ${locationText}\n` +
      `📸 Foto: ${state.data.photoBase64 ? "Sí" : "No"}\n\n` +
      `🔔 Te notificaremos cuando haya actualizaciones sobre esta nota.\n\n` +
      `🌿 AGRA-TECTI`,
      { remove_keyboard: true }
    );

    conversations.delete(chatId);
  } catch (error: any) {
    console.error("[TG Bot] Error al crear nota:", error);
    await sendMessage(botToken, chatId, `❌ Error: ${error.message}`);
    conversations.delete(chatId);
  }
}

async function showMyNotes(botToken: string, chatId: string, userId: number) {
  const db = await getDb();
  if (!db) {
    await sendMessage(botToken, chatId, "❌ Error de conexión.");
    return;
  }

  const notes = await db.select()
    .from(fieldNotes)
    .where(eq(fieldNotes.reportedByUserId, userId))
    .orderBy(sql`id DESC`)
    .limit(10);

  if (notes.length === 0) {
    await sendMessage(botToken, chatId, "📋 No tienes notas de campo registradas.\n\nUsa /nota para crear una.");
    return;
  }

  const statusEmoji: Record<string, string> = {
    abierta: "🟢",
    en_revision: "🔍",
    en_progreso: "🔨",
    resuelta: "✅",
    descartada: "⬜",
  };

  let msg = `📋 <b>Tus últimas notas de campo:</b>\n\n`;
  for (const note of notes) {
    const catInfo = CATEGORIES[(note as any).category] || { emoji: "📋", label: (note as any).category };
    const status = (note as any).status || "abierta";
    const emoji = statusEmoji[status] || "⬜";
    msg += `${emoji} <b>${(note as any).folio}</b> - ${catInfo.emoji} ${catInfo.label}\n`;
    msg += `   ${((note as any).description || "").substring(0, 60)}${((note as any).description || "").length > 60 ? "..." : ""}\n`;
    msg += `   Estado: ${status.replace("_", " ")}\n\n`;
  }

  await sendMessage(botToken, chatId, msg);
}

// ============================================================
// Notificaciones de cambio de estado
// ============================================================

export async function notifyNoteStatusChange(noteId: number, newStatus: string, resolvedByName?: string): Promise<boolean> {
  const config = await getTelegramConfig();
  if (!config) return false;

  const db = await getDb();
  if (!db) return false;

  // Obtener la nota y el usuario que la reportó
  const [note] = await db.select().from(fieldNotes).where(eq(fieldNotes.id, noteId));
  if (!note) return false;

  const reporterId = (note as any).reportedByUserId;
  if (!reporterId) return false;

  // Obtener el chatId del usuario
  const [user] = await db.select({ telegramChatId: users.telegramChatId, name: users.name })
    .from(users)
    .where(eq(users.id, reporterId));

  if (!user?.telegramChatId) return false;

  const statusLabels: Record<string, { label: string; emoji: string }> = {
    abierta: { label: "Abierta", emoji: "🟢" },
    en_revision: { label: "En revisión", emoji: "🔍" },
    en_progreso: { label: "En progreso", emoji: "🔨" },
    resuelta: { label: "Resuelta", emoji: "✅" },
    descartada: { label: "Descartada", emoji: "⬜" },
  };

  const statusInfo = statusLabels[newStatus] || { label: newStatus, emoji: "📋" };
  const catInfo = CATEGORIES[(note as any).category] || { label: (note as any).category, emoji: "📋" };

  let msg = `🔔 <b>Actualización de Nota de Campo</b>\n\n`;
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
  msg += `\n🌿 AGRA-TECTI`;

  // Enviar mensaje de texto
  await sendMessage(config.botToken, user.telegramChatId, msg);

  // Si es resuelta/descartada, enviar las fotos de resolución
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
        // Enviar como archivo local usando sendDocument con multipart
        try {
          const FormData = (await import("form-data")).default;
          const formData = new FormData();
          formData.append("chat_id", user.telegramChatId);
          formData.append("photo", fs.createReadStream(photoPath));
          formData.append("caption", `📸 Foto de resolución - ${(note as any).folio}`);

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

  // Continuar polling
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
