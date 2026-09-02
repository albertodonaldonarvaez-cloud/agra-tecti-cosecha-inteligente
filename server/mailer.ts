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
    secure: row.secure,
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
    secure: data.secure,
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

let cachedTransport: { transport: Transporter; from: string } | null = null;

async function getTransport(): Promise<{ transport: Transporter; from: string }> {
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

  const transport = nodemailer.createTransport({
    host: row.host,
    port: row.port,
    secure: row.secure, // 465 = TLS directo; 587/25 = STARTTLS
    auth: row.username ? { user: row.username, pass: password } : undefined,
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

  const from = row.fromName ? `"${row.fromName}" <${row.fromEmail}>` : row.fromEmail;
  cachedTransport = { transport, from };
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
}): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const recipients = options.to.filter((r) => r.includes("@"));
  if (recipients.length === 0) {
    return { ok: false, error: "No hay destinatarios válidos" };
  }

  let ok = false;
  let error: string | undefined;
  let messageId: string | undefined;

  try {
    const { transport, from } = await getTransport();
    const info = await transport.sendMail({
      from,
      to: recipients.join(", "),
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments,
    });
    ok = true;
    messageId = info.messageId;
  } catch (err: any) {
    error = String(err?.message || err).slice(0, 480);
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

  try {
    const { transport } = await getTransport();
    await transport.verify();
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
    message = String(err?.message || err).slice(0, 480);
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
