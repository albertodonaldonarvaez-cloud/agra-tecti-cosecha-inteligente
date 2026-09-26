import nodemailer, { type Transporter } from "nodemailer";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { smtpConfig, sentEmails } from "../drizzle/schema";
import { encryptSecret, decryptSecret, isEncrypted } from "./encryption";

// ============================================================
// Correo saliente del sistema
//
// Una sola cuenta configurada en Ajustes manda todo lo que el sistema
// necesite enviar (hoy, el reporte de campo). La contraseña se guarda
// cifrada, igual que las demás credenciales del sistema, y nunca vuelve
// al navegador: la interfaz solo sabe si hay una guardada o no.
// ============================================================

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  fromName: string | null;
  fromEmail: string;
  defaultRecipients: string | null;
  enabled: boolean;
}

/**
 * Qué tipo de cifrado le toca a un puerto.
 *
 * El 465 habla TLS desde el primer byte; el 587 y el 25 empiezan en claro y
 * suben a TLS con STARTTLS. Son dos protocolos distintos y no hay servidor en
 * el mundo que los cruce, pero la pantalla dejaba marcar cualquier
 * combinación y el correo de la finca llevaba semanas sin salir por
 * exactamente eso: puerto 465 con el cifrado apagado, que se queda esperando
 * un saludo que nunca llega ("Greeting never received").
 *
 * Por eso el par lo decide el puerto y no la persona. Un puerto que no sea
 * uno de los tres conocidos sí respeta lo que se haya elegido: ahí no hay
 * ninguna convención que aplicar.
 */
export function cifradoParaElPuerto(puerto: number, elegido: boolean): boolean {
  if (puerto === 465) return true;
  if (puerto === 587 || puerto === 25) return false;
  return elegido;
}

/** Config cruda, con la contraseña todavía cifrada. Uso interno. */
async function readConfigRow() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(smtpConfig).limit(1);
  return rows[0] || null;
}

/** Lo que puede ver la interfaz: todo menos la contraseña */
export async function getSmtpConfigPublic() {
  const row = await readConfigRow();
  if (!row) return null;
  return {
    id: row.id,
    host: row.host,
    port: row.port,
    // El que de verdad se va a usar, no el que quedó guardado: así la
    // pantalla enseña lo mismo que hace el envío.
    secure: cifradoParaElPuerto(row.port, row.secure),
    username: row.username,
    hasPassword: !!row.password,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    defaultRecipients: row.defaultRecipients,
    enabled: row.enabled,
    lastTestAt: row.lastTestAt,
    lastTestOk: row.lastTestOk,
    lastTestError: row.lastTestError,
  };
}

export async function saveSmtpConfig(data: {
  host: string;
  port: number;
  secure: boolean;
  username?: string | null;
  /** Vacío o ausente = conservar la contraseña que ya estaba guardada */
  password?: string | null;
  fromName?: string | null;
  fromEmail: string;
  defaultRecipients?: string | null;
  enabled?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const existing = await readConfigRow();

  // Guardar la contraseña cifrada; si viene vacía, no pisar la que ya había
  let password = existing?.password ?? null;
  if (data.password && data.password.trim() !== "") {
    password = encryptSecret(data.password);
  }

  const values = {
    host: data.host.trim(),
    port: data.port,
    secure: cifradoParaElPuerto(data.port, data.secure),
    username: data.username?.trim() || null,
    password,
    fromName: data.fromName?.trim() || "Agra Tec-Ti",
    fromEmail: data.fromEmail.trim(),
    defaultRecipients: data.defaultRecipients?.trim() || null,
    enabled: data.enabled ?? true,
  };

  if (existing) {
    await db.update(smtpConfig).set({ ...values, updatedAt: new Date() }).where(eq(smtpConfig.id, existing.id));
  } else {
    await db.insert(smtpConfig).values(values);
  }

  // La configuración cambió: el transporte anterior ya no sirve
  cachedTransport = null;
  return getSmtpConfigPublic();
}

// ── Transporte ───────────────────────────────────────────────

/** Lo que necesita `diagnosticarSmtp` para explicar un fallo */
export interface ContextoSmtp {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  fromEmail: string;
}

let cachedTransport: { transport: Transporter; from: string; ctx: ContextoSmtp } | null = null;

async function getTransport(): Promise<{ transport: Transporter; from: string; ctx: ContextoSmtp }> {
  if (cachedTransport) return cachedTransport;

  const row = await readConfigRow();
  if (!row) {
    throw new Error("El correo no está configurado. Ve a Ajustes → Correo (SMTP).");
  }
  if (!row.enabled) {
    throw new Error("El envío de correo está desactivado en Ajustes.");
  }

  let password = row.password || undefined;
  if (password && isEncrypted(password)) {
    try {
      password = decryptSecret(password);
    } catch {
      throw new Error("No se pudo descifrar la contraseña del correo. Vuelve a guardarla en Ajustes.");
    }
  }

  // También al leer, no solo al guardar: la configuración que ya está en la
  // base se escribió cuando la pantalla permitía cruzarlos, y así se arregla
  // sola sin que nadie tenga que volver a entrar a Ajustes.
  const secure = cifradoParaElPuerto(row.port, row.secure);

  const transport = nodemailer.createTransport({
    host: row.host,
    port: row.port,
    secure, // 465 = TLS directo; 587/25 = STARTTLS
    // Con usuario y contraseña en el 587, exigir que la sesión se cifre antes
    // de autenticarse. Sin esto, un servidor que no ofrezca STARTTLS recibiría
    // la contraseña en claro y nadie se enteraría.
    requireTLS: !secure && row.port === 587 && !!row.username,
    auth: row.username ? { user: row.username, pass: password } : undefined,
    tls: { servername: row.host },
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

  const from = row.fromName ? `"${row.fromName}" <${row.fromEmail}>` : row.fromEmail;
  const ctx: ContextoSmtp = {
    host: row.host,
    port: row.port,
    secure,
    username: row.username,
    fromEmail: row.fromEmail,
  };
  cachedTransport = { transport, from, ctx };
  return cachedTransport;
}

/** Separa "a@b.com, c@d.com" o saltos de línea en una lista limpia */
export function parseRecipients(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0 && r.includes("@"));
}

// ── Diagnóstico de fallos ────────────────────────────────────

/**
 * Traduce el error de nodemailer a algo que se pueda arreglar.
 *
 * El error crudo ("wrong version number", "Greeting never received",
 * "ETIMEDOUT") no le dice nada a quien configura el correo, y son siempre las
 * mismas cuatro o cinco causas: el puerto no cuadra con la casilla de cifrado,
 * el proveedor exige contraseña de aplicación, el servidor de producción tiene
 * bloqueada la salida, o el remitente no es el de la cuenta.
 *
 * Pura a propósito: recibe el error y la configuración y devuelve texto, para
 * poder probarla sin levantar un servidor de correo.
 */
export function diagnosticarSmtp(
  error: unknown,
  ctx: { host: string; port: number; secure: boolean; username?: string | null; fromEmail?: string | null },
): string {
  const err = error as any;
  const crudo = String(err?.message || err || "").trim();
  const codigo = String(err?.code || "");
  const respuesta = Number(err?.responseCode || 0);
  const texto = `${crudo} ${String(err?.response || "")}`.toLowerCase();
  const host = (ctx.host || "").toLowerCase();

  const esGmail = host.includes("gmail") || host.includes("googlemail");
  const esOutlook = host.includes("outlook") || host.includes("office365") || host.includes("hotmail");

  /** Pega el error original al final, que para eso lo mandó el servidor */
  const con = (explicacion: string) => `${explicacion} (el servidor dijo: ${crudo})`;

  // 1. El puerto y la casilla de cifrado no cuadran. Es la causa más común
  //    porque la pantalla deja marcar cualquier combinación.
  if (texto.includes("wrong version number") || texto.includes("packet length too long")) {
    return con(
      `El puerto ${ctx.port} y el cifrado no cuadran: estás hablando en claro con un puerto cifrado. ` +
        `Marca la casilla de conexión cifrada directa si usas el 465, o cambia al puerto 587 y déjala desmarcada.`,
    );
  }
  if (texto.includes("greeting never received") || codigo === "ETIMEDOUT" && ctx.port === 465 && !ctx.secure) {
    return con(
      `El servidor nunca saludó. Casi siempre es el puerto ${ctx.port} con el cifrado al revés: ` +
        `en el 465 la casilla de conexión cifrada directa va MARCADA, en el 587 va desmarcada.`,
    );
  }
  if (texto.includes("ssl") && texto.includes("routines")) {
    return con(
      `Falló el cifrado con el servidor. Revisa que el puerto ${ctx.port} y la casilla de conexión cifrada ` +
        `directa vayan juntos: 465 marcada, 587 desmarcada.`,
    );
  }

  // 2. No hay camino hasta el servidor de correo.
  if (codigo === "ENOTFOUND" || codigo === "EAI_AGAIN" || texto.includes("getaddrinfo")) {
    return con(`No existe el servidor "${ctx.host}". Revisa que esté bien escrito (por ejemplo smtp.gmail.com).`);
  }
  if (codigo === "ECONNREFUSED") {
    return con(`El servidor rechazó la conexión en el puerto ${ctx.port}. Comprueba que ese sea el puerto correcto.`);
  }
  if (codigo === "ETIMEDOUT" || codigo === "ESOCKET" || texto.includes("timeout")) {
    return con(
      `No se pudo llegar a ${ctx.host}:${ctx.port} desde el servidor. Lo más común es que el proveedor del ` +
        `servidor (AWS, Oracle, Google Cloud…) tenga bloqueada la salida de correo: hay que pedirle que abra ` +
        `el puerto ${ctx.port}, o usar el 587 si estabas en el 465. Ojo: desde tu computadora sí funciona ` +
        `aunque desde el servidor no, así que la prueba hay que hacerla desde el sistema.`,
    );
  }

  // 3. Credenciales.
  if (codigo === "EAUTH" || respuesta === 535 || respuesta === 534 || respuesta === 530 || texto.includes("authentication")) {
    if (esGmail) {
      return con(
        `Gmail no acepta la contraseña normal de la cuenta. Hay que activar la verificación en dos pasos y ` +
          `generar una "contraseña de aplicación" de 16 letras en la cuenta de Google, y pegar esa aquí. ` +
          `El usuario debe ser el correo completo.`,
      );
    }
    if (esOutlook) {
      return con(
        `Microsoft rechazó la contraseña. Las cuentas de Microsoft 365 ya no permiten autenticación básica: ` +
          `hay que habilitar SMTP AUTH para el buzón, o usar el relay de la organización.`,
      );
    }
    return con(
      `El servidor rechazó el usuario o la contraseña. Suele ser que el usuario tiene que ser el correo ` +
        `completo, o que la cuenta pide una contraseña de aplicación en vez de la normal.`,
    );
  }

  // 4. El servidor conecta y autentica, pero no acepta el envío.
  if (respuesta === 550 || respuesta === 553 || texto.includes("relay") || texto.includes("not allowed")) {
    return con(
      `El servidor aceptó la cuenta pero no el envío. Casi siempre el correo remitente ` +
        `(${ctx.fromEmail || "el configurado"}) tiene que ser el mismo de la cuenta con la que te conectas` +
        (ctx.username ? ` (${ctx.username})` : "") +
        `, o un alias autorizado.`,
    );
  }
  if (respuesta === 552 || respuesta === 523 || texto.includes("message size")) {
    return con(`El correo pesa más de lo que acepta el servidor. Manda el reporte sin el documento adjunto.`);
  }
  if (texto.includes("self-signed") || texto.includes("self signed") || texto.includes("altname")) {
    return con(
      `El certificado del servidor no coincide con "${ctx.host}". Revisa que el nombre del servidor sea ` +
        `exactamente el que te dio tu proveedor.`,
    );
  }
  if (respuesta === 421 || texto.includes("too many") || texto.includes("rate")) {
    return con(`El servidor está limitando los envíos. Espera unos minutos y vuelve a intentar.`);
  }

  return crudo || "El envío falló sin mensaje del servidor";
}

export interface MailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

/**
 * Manda un correo y lo deja anotado en la bitácora.
 * Nunca lanza por un fallo de envío: devuelve el motivo, para que quien llame
 * decida si eso rompe su flujo o solo se avisa.
 */
export async function sendMail(options: {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
  kind?: string;
  userId?: number | null;
  /**
   * Manda una sola copia con los destinatarios ocultos. Es lo que usa el envío
   * semanal: un correo a toda la plantilla con todos en el "para" le enseña a
   * cada quien la libreta de direcciones de los demás.
   */
  oculto?: boolean;
}): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const recipients = options.to.filter((r) => r.includes("@"));
  if (recipients.length === 0) {
    return { ok: false, error: "No hay destinatarios válidos" };
  }

  let ok = false;
  let error: string | undefined;
  let messageId: string | undefined;

  try {
    const { transport, from, ctx } = await getTransport();
    try {
      const info = await transport.sendMail({
        from,
        // En copia oculta el sobre necesita un "para": va el propio remitente.
        to: options.oculto ? ctx.fromEmail : recipients.join(", "),
        bcc: options.oculto ? recipients.join(", ") : undefined,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
      });
      ok = true;
      messageId = info.messageId;
    } catch (err: any) {
      error = diagnosticarSmtp(err, ctx).slice(0, 480);
      throw err;
    }
  } catch (err: any) {
    // El fallo pudo ser del envío (ya traducido arriba) o de armar el
    // transporte, que trae su propio mensaje en español.
    error = error || String(err?.message || err).slice(0, 480);
    console.error("[Correo] Falló el envío:", error);
    // Un rechazo puede venir de credenciales cambiadas: rearmar el transporte
    cachedTransport = null;
  }

  try {
    const db = await getDb();
    if (db) {
      await db.insert(sentEmails).values({
        subject: options.subject.slice(0, 500),
        recipients: recipients.join(", "),
        kind: options.kind || "reporte",
        ok,
        error: error || null,
        sentByUserId: options.userId ?? null,
      });
    }
  } catch (logError) {
    console.error("[Correo] No se pudo anotar el envío en la bitácora:", logError);
  }

  return { ok, error, messageId };
}

/**
 * Prueba la conexión con el servidor de correo sin mandar nada, y opcionalmente
 * manda un correo de prueba. Guarda el resultado para mostrarlo en Ajustes.
 */
export async function testSmtp(sendTo?: string): Promise<{ ok: boolean; message: string }> {
  let ok = false;
  let message = "";

  let ctx: ContextoSmtp | null = null;

  try {
    const armado = await getTransport();
    ctx = armado.ctx;
    await armado.transport.verify();
    ok = true;
    message = "Conexión con el servidor de correo correcta";

    if (sendTo && sendTo.includes("@")) {
      const result = await sendMail({
        to: [sendTo],
        subject: "Prueba de correo — Agra Tec-Ti",
        html: `<p>Si estás leyendo esto, el sistema ya puede enviar correo.</p>
               <p style="color:#64748b;font-size:13px">Enviado desde Agra Tec-Ti el ${new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}.</p>`,
        text: "Si estás leyendo esto, el sistema ya puede enviar correo.",
        kind: "prueba",
      });
      ok = result.ok;
      message = result.ok
        ? `Correo de prueba enviado a ${sendTo}`
        : `La conexión funciona pero el envío falló: ${result.error}`;
    }
  } catch (err: any) {
    ok = false;
    // Sin ctx el fallo es de configuración (no hay cuenta, está apagada, la
    // contraseña no se pudo descifrar) y ese mensaje ya viene en español.
    message = ctx ? diagnosticarSmtp(err, ctx).slice(0, 480) : String(err?.message || err).slice(0, 480);
  }

  // Dejar constancia del último intento para que Ajustes lo muestre
  try {
    const db = await getDb();
    const existing = await readConfigRow();
    if (db && existing) {
      await db
        .update(smtpConfig)
        .set({ lastTestAt: new Date(), lastTestOk: ok, lastTestError: ok ? null : message.slice(0, 500) })
        .where(eq(smtpConfig.id, existing.id));
    }
  } catch { /* la prueba ya dio su resultado */ }

  return { ok, message };
}

/** Últimos correos enviados, para la pantalla de Ajustes */
export async function getRecentEmails(limit: number = 15) {
  const db = await getDb();
  if (!db) return [];
  const { desc } = await import("drizzle-orm");
  return await db.select().from(sentEmails).orderBy(desc(sentEmails.createdAt)).limit(limit);
}
