// ============================================================
// El reporte semanal de actividades, al grupo de Telegram
//
// Va al MISMO grupo que ya recibe el resumen diario de cosecha, y reusa el
// mismo bot y el mismo chat que están en apiConfig. Lo que no toca es ese
// resumen diario: sigue saliendo cada mañana con sus reglas de siempre.
// Esto se suma, una vez por semana.
//
// Por qué el mensaje sí trae los números y el correo no: son dos sitios
// distintos. El correo llega con un PDF que se abre de un toque, así que
// repetirlo en el cuerpo sobra. En un grupo de Telegram nadie abre el
// adjunto en el campo — se lee el mensaje y se sigue trabajando. El PDF va
// detrás, para quien lo quiera archivar.
// ============================================================

import { sql } from "drizzle-orm";
import { getDb } from "./db";
import type { ActivityAiSummary, ActivitySummary } from "./activityReport";

const TAG = "[TelegramSemanal]";

/** Telegram corta el mensaje en 4096; se deja aire para no llegar al filo */
const LIMITE_MENSAJE = 3800;

export interface DestinoTelegram {
  botToken: string;
  chatId: string;
  /** Si el envío semanal de actividades está encendido */
  activo: boolean;
}

/**
 * El bot y el grupo de cosecha, tal como los dejó la pantalla de Ajustes.
 * `null` cuando falta el bot o el grupo: sin eso no hay a dónde mandar.
 */
export async function destinoDeCosecha(): Promise<DestinoTelegram | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const resultado = await db.execute(sql`
      SELECT telegramBotToken, telegramHarvestChatId, telegramWeeklyEnabled
      FROM apiConfig LIMIT 1
    `);
    const filas = resultado[0] as unknown as any[];
    const fila = filas?.[0];
    if (!fila?.telegramBotToken || !fila?.telegramHarvestChatId) return null;

    return {
      botToken: String(fila.telegramBotToken),
      chatId: String(fila.telegramHarvestChatId),
      activo: Boolean(fila.telegramWeeklyEnabled),
    };
  } catch (e) {
    console.error(`${TAG} No se pudo leer la configuración de Telegram:`, e);
    return null;
  }
}

/** Telegram interpreta HTML: lo que venga de la base hay que escaparlo */
function esc(texto: unknown): string {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Sin ceros de relleno: en un chat "340 kg" se lee, "340.00 kg" estorba.
 * Los decimales aparecen solo cuando los hay.
 */
function num(valor: number, decimales = 0): string {
  if (!Number.isFinite(valor)) return "—";
  return valor.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: decimales });
}

/**
 * "del 14 al 20 de septiembre" cuando la semana no cambia de mes, y
 * "del 28 de septiembre al 4 de octubre" cuando sí. Repetir el mes las dos
 * veces se lee como un formulario.
 */
function rangoEnPalabras(desde: string, hasta: string): string {
  const a = new Date(`${desde.slice(0, 10)}T12:00:00`);
  const b = new Date(`${hasta.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${desde} al ${hasta}`;

  const mesDeB = b.toLocaleDateString("es-MX", { month: "long" });
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `del ${a.getDate()} al ${b.getDate()} de ${mesDeB}`;
  }
  const mesDeA = a.toLocaleDateString("es-MX", { month: "long" });
  return `del ${a.getDate()} de ${mesDeA} al ${b.getDate()} de ${mesDeB}`;
}

/** Recorta sin partir una palabra a la mitad */
function recortar(texto: string, maximo: number): string {
  const limpio = texto.trim();
  if (limpio.length <= maximo) return limpio;
  const corte = limpio.slice(0, maximo);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > maximo * 0.6 ? corte.slice(0, espacio) : corte).trimEnd()}…`;
}

const RAYA = "━━━━━━━━━━━━━━━━━━━━━━";

/**
 * El mensaje que se lee en el grupo.
 *
 * Las listas van acotadas a propósito: una semana de riego puede traer
 * cuarenta labores del mismo tipo y el mensaje reventaría el límite de
 * Telegram, que además lo rechaza entero en vez de recortarlo. Lo que no
 * cabe está en el PDF que va detrás.
 */
export function mensajeDeActividades(datos: {
  periodo: { desde: string; hasta: string };
  summary: ActivitySummary;
  ai: ActivityAiSummary | null;
}): string {
  const { summary, ai } = datos;
  const partes: string[] = [];

  partes.push("🌱 <b>REPORTE SEMANAL DE ACTIVIDADES</b>");
  partes.push(`📅 Semana ${rangoEnPalabras(datos.periodo.desde, datos.periodo.hasta)}`);
  partes.push(RAYA);
  partes.push("");

  if (summary.total === 0) {
    partes.push("No se registró ninguna labor en la libreta de campo esta semana.");
    partes.push("");
    partes.push(RAYA);
    partes.push("🤖 AGRA-TECTI Cosecha Inteligente");
    return partes.join("\n");
  }

  partes.push("📋 <b>Resumen de la semana</b>");
  partes.push(`✅ Labores: <b>${num(summary.total)}</b> (${num(summary.completed)} completadas)`);
  partes.push(`⏱️ Horas de trabajo: <b>${num(summary.hours, 1)}</b>`);
  partes.push(`🗺️ Parcelas atendidas: <b>${num(summary.parcelsWorked)}</b>`);
  partes.push(`👥 Personas: <b>${num(summary.peopleCount)}</b>`);
  partes.push("");

  if (summary.byType.length > 0) {
    partes.push(RAYA);
    partes.push("🚜 <b>Por tipo de labor</b>");
    partes.push("");
    for (const t of summary.byType.slice(0, 7)) {
      partes.push(`• <b>${esc(t.label)}</b> — ${num(t.count)} ${t.count === 1 ? "labor" : "labores"}${t.hours ? ` · ${num(t.hours, 1)} h` : ""}`);
    }
    if (summary.byType.length > 7) partes.push(`  <i>y ${summary.byType.length - 7} tipo(s) más</i>`);
    partes.push("");
  }

  if (summary.products.length > 0) {
    partes.push(RAYA);
    partes.push("🧪 <b>Insumos aplicados</b>");
    partes.push("");
    for (const p of summary.products.slice(0, 8)) {
      const cantidad = p.total > 0 ? `${num(p.total, 2)} ${p.unit}`.trim() : "sin cantidad";
      partes.push(`• <b>${esc(p.name)}</b> — ${esc(cantidad)} (${num(p.times)} aplic.)`);
    }
    if (summary.products.length > 8) partes.push(`  <i>y ${summary.products.length - 8} producto(s) más</i>`);
    partes.push("");
  }

  if (summary.byParcel.length > 0) {
    partes.push(RAYA);
    partes.push("📍 <b>Parcelas atendidas</b>");
    partes.push("");
    for (const p of summary.byParcel.slice(0, 8)) {
      partes.push(`• ${esc(p.name)} — ${num(p.count)} ${p.count === 1 ? "labor" : "labores"}`);
    }
    if (summary.byParcel.length > 8) partes.push(`  <i>y ${summary.byParcel.length - 8} parcela(s) más</i>`);
    partes.push("");
  }

  if (ai?.resumen) {
    partes.push(RAYA);
    partes.push("🧠 <b>Lectura de la semana</b>");
    partes.push("");
    partes.push(esc(recortar(ai.resumen, 600)));
    partes.push("");
  }

  const pendientes: string[] = [];
  if (summary.planned > 0) pendientes.push(`${num(summary.planned)} planificada(s) sin ejecutar`);
  if (summary.inProgress > 0) pendientes.push(`${num(summary.inProgress)} en proceso`);
  if (summary.cancelled > 0) pendientes.push(`${num(summary.cancelled)} cancelada(s)`);
  if (pendientes.length > 0) {
    partes.push(RAYA);
    partes.push(`⚠️ <b>Pendientes</b>: ${pendientes.join(" · ")}`);
    partes.push("");
  }

  partes.push(RAYA);
  partes.push("🤖 AGRA-TECTI Cosecha Inteligente");

  const mensaje = partes.join("\n");
  // Red de seguridad: Telegram rechaza el mensaje entero si se pasa del
  // límite, y quedarse sin reporte es peor que quedarse sin la última
  // sección. Las listas ya vienen acotadas; esto es por si acaso.
  return mensaje.length <= LIMITE_MENSAJE
    ? mensaje
    : `${recortar(mensaje, LIMITE_MENSAJE - 60)}\n\n<i>El detalle completo va en el PDF adjunto.</i>`;
}

// ── Envío ────────────────────────────────────────────────────

async function llamar(destino: DestinoTelegram, metodo: string, cuerpo: BodyInit, cabeceras?: HeadersInit) {
  const respuesta = await fetch(`https://api.telegram.org/bot${destino.botToken}/${metodo}`, {
    method: "POST",
    headers: cabeceras,
    body: cuerpo,
    signal: AbortSignal.timeout(60_000),
  });
  const datos: any = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || datos?.ok === false) {
    throw new Error(datos?.description || `Telegram respondió ${respuesta.status}`);
  }
  return datos;
}

/**
 * Manda el reporte al grupo: primero el mensaje, luego el PDF.
 *
 * En ese orden y no al revés: el mensaje es lo que la gente lee en el
 * teléfono, y si va detrás del documento queda empujado hacia abajo en el
 * chat. Si el PDF falla, el mensaje ya salió y el reporte llegó igual — por
 * eso el fallo del documento no tumba el envío.
 */
export async function enviarActividadesPorTelegram(opciones: {
  periodo: { desde: string; hasta: string };
  summary: ActivitySummary;
  ai: ActivityAiSummary | null;
  pdf?: Buffer | null;
  nombrePdf?: string;
}): Promise<{ ok: boolean; error?: string; omitido?: boolean }> {
  const destino = await destinoDeCosecha();
  if (!destino) {
    return { ok: false, omitido: true, error: "Falta el bot o el grupo de Telegram en Ajustes." };
  }

  try {
    await llamar(
      destino,
      "sendMessage",
      JSON.stringify({
        chat_id: destino.chatId,
        text: mensajeDeActividades(opciones),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      { "Content-Type": "application/json" },
    );
  } catch (e: any) {
    const error = String(e?.message || e).slice(0, 300);
    console.error(`${TAG} No se pudo mandar el mensaje:`, error);
    return { ok: false, error };
  }

  if (opciones.pdf) {
    try {
      const form = new FormData();
      form.append("chat_id", destino.chatId);
      form.append("caption", "Reporte completo de la semana");
      form.append(
        "document",
        new Blob([new Uint8Array(opciones.pdf)], { type: "application/pdf" }),
        opciones.nombrePdf || "actividades.pdf",
      );
      await llamar(destino, "sendDocument", form);
    } catch (e: any) {
      // El mensaje ya llegó: esto se anota y no se convierte en un fallo
      console.error(`${TAG} El mensaje salió pero el PDF no:`, String(e?.message || e));
    }
  }

  return { ok: true };
}
