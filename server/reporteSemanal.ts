// ============================================================
// Reporte semanal por correo
//
// Una vez por semana el sistema manda a la plantilla lo que pasó en el campo
// la semana que acaba de cerrar: las labores de la libreta y, SOLO si hubo,
// la cosecha. Dos correos distintos y no uno solo, porque cada uno se reenvía
// a gente distinta: el de labores al agrónomo, el de cosecha a la gerencia.
//
// Reglas que se respetan porque ya estaban en el sistema:
//  - Cortadora 98 = segunda, 99 = desperdicio. Todo lo demás (incluida la 97,
//    recolecta) cuenta como primera. Igual que el aviso diario de Telegram y
//    que las gráficas.
//  - `boxes.weight` es el peso NETO y viene en gramos.
//  - Una caja de más de 15 kg no se descarta, se señala. Aquí se cuenta en
//    los avisos del pie, no se resta de los totales.
//
// Lo que NO hace: no manda nada si no está encendido en Ajustes, y no repite
// la misma semana aunque el servidor se reinicie diez veces (se guarda cuál
// fue la última semana enviada).
// ============================================================

import { eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { smtpConfig, users } from "../drizzle/schema";
import { type MailAttachment, parseRecipients, sendMail } from "./mailer";
import { fechaCorta, num, plantillaAviso } from "./emailLayout";
import { LOGO_CID, logoAdjunto } from "./logo";

const TAG = "[ReporteSemanal]";
const ZONA = "America/Mexico_City";

/** Por encima de esto la caja se señala para revisión, no se descarta */
const PESO_ALTO_GRAMOS = 15_000;

// ── Fechas ───────────────────────────────────────────────────

function hoyMx(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Día de la semana en formato ISO: 1 = lunes … 7 = domingo */
export function diaIso(fecha: string): number {
  const d = new Date(`${fecha}T12:00:00`);
  return ((d.getDay() + 6) % 7) + 1;
}

/**
 * Lunes a domingo de la última semana COMPLETA.
 *
 * "Completa" importa: si el correo sale un lunes y midiera los últimos siete
 * días, arrastraría el domingo a medias y el lunes anterior se contaría dos
 * veces entre una semana y la siguiente.
 */
export function semanaPasada(hoy: string = hoyMx()): { desde: string; hasta: string } {
  const lunesDeEstaSemana = sumarDias(hoy, -(diaIso(hoy) - 1));
  return { desde: sumarDias(lunesDeEstaSemana, -7), hasta: sumarDias(lunesDeEstaSemana, -1) };
}

// ── Configuración del envío ──────────────────────────────────

export interface ConfigSemanal {
  activo: boolean;
  /** 1 = lunes … 7 = domingo, hora de México */
  dia: number;
  hora: number;
  /** Mandarlo a todas las cuentas activas, además de los fijos de Ajustes */
  aTodos: boolean;
  /** Incluir el correo de cosecha cuando la semana tuvo cajas */
  conCosecha: boolean;
  ultimaSemana: string | null;
  ultimoEnvio: Date | null;
  ultimoError: string | null;
}

export async function leerConfigSemanal(): Promise<ConfigSemanal | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(smtpConfig).limit(1);
  if (!row) return null;
  return {
    activo: !!row.weeklyEnabled,
    dia: row.weeklyDay ?? 1,
    hora: row.weeklyHour ?? 7,
    aTodos: row.weeklyToAllUsers !== false,
    conCosecha: row.weeklyHarvest !== false,
    ultimaSemana: row.weeklyLastWeek ?? null,
    ultimoEnvio: row.weeklyLastAt ?? null,
    ultimoError: row.weeklyLastError ?? null,
  };
}

export async function guardarConfigSemanal(datos: {
  activo: boolean;
  dia: number;
  hora: number;
  aTodos: boolean;
  conCosecha: boolean;
}): Promise<ConfigSemanal | null> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const [row] = await db.select({ id: smtpConfig.id }).from(smtpConfig).limit(1);
  if (!row) {
    throw new Error("Primero guarda la cuenta de correo en Ajustes → Correo (SMTP).");
  }
  await db
    .update(smtpConfig)
    .set({
      weeklyEnabled: datos.activo,
      weeklyDay: Math.min(7, Math.max(1, Math.trunc(datos.dia))),
      weeklyHour: Math.min(23, Math.max(0, Math.trunc(datos.hora))),
      weeklyToAllUsers: datos.aTodos,
      weeklyHarvest: datos.conCosecha,
    })
    .where(eq(smtpConfig.id, row.id));
  return leerConfigSemanal();
}

/**
 * A quién le llega el reporte.
 *
 * Las cuentas dadas de baja quedan fuera: `isActive` se apaga justamente para
 * cortarle el acceso a un aparato perdido o a quien ya no trabaja aquí, y
 * seguir mandándole los números de la finca sería dejar la puerta abierta por
 * otro lado. Los destinatarios fijos de Ajustes se suman siempre, para poder
 * incluir al contador o al cliente sin darles cuenta en el sistema.
 */
export async function destinatariosSemanales(aTodos: boolean): Promise<string[]> {
  const db = await getDb();
  const vistos = new Set<string>();
  const salida: string[] = [];

  const agregar = (correo: string | null | undefined) => {
    const limpio = (correo || "").trim();
    if (!limpio.includes("@")) return;
    const clave = limpio.toLowerCase();
    if (vistos.has(clave)) return;
    vistos.add(clave);
    salida.push(limpio);
  };

  if (db) {
    const [config] = await db.select({ fijos: smtpConfig.defaultRecipients }).from(smtpConfig).limit(1);
    parseRecipients(config?.fijos).forEach(agregar);

    if (aTodos) {
      const cuentas = await db
        .select({ email: users.email, activo: users.isActive })
        .from(users)
        .where(eq(users.isActive, true));
      cuentas.forEach((c) => agregar(c.email));
    }
  }

  return salida;
}

// ── Cosecha de la semana ─────────────────────────────────────

export interface LineaCosecha {
  nombre: string;
  cajas: number;
  kg: number;
  primera: number;
  segunda: number;
  desperdicio: number;
}

export interface CosechaSemana {
  totales: LineaCosecha;
  porParcela: LineaCosecha[];
  porDia: Array<{ fecha: string; cajas: number; kg: number; primera: number }>;
  porCortadora: Array<{ numero: number; nombre: string; cajas: number; kg: number }>;
  avisos: { sinParcela: number; pesoAlto: number; sinCiclo: number };
  /** Kilos de la semana anterior, para saber si se subió o se bajó */
  kgSemanaPrevia: number;
  ciclo: string | null;
}

const kg = (gramos: unknown) => Number(Number(gramos ?? 0).toFixed(2));

/**
 * Todo lo que se cosechó entre dos fechas. `null` cuando no hubo ni una caja:
 * quien llame decide si eso significa "no mandes el correo" o "dilo".
 */
export async function resumenCosechaSemana(desde: string, hasta: string): Promise<CosechaSemana | null> {
  const db = await getDb();
  if (!db) return null;

  const [filasParcela] = (await db.execute(sql`
    SELECT
      COALESCE(p.name, b.parcelName, b.parcelCode) AS nombre,
      COUNT(*) AS cajas,
      SUM(b.weight) / 1000 AS kg,
      SUM(CASE WHEN b.harvesterId NOT IN (98, 99) THEN b.weight ELSE 0 END) / 1000 AS primera,
      SUM(CASE WHEN b.harvesterId = 98 THEN b.weight ELSE 0 END) / 1000 AS segunda,
      SUM(CASE WHEN b.harvesterId = 99 THEN b.weight ELSE 0 END) / 1000 AS desperdicio
    FROM boxes b
    LEFT JOIN parcels p ON p.code = b.parcelCode
    WHERE DATE(b.submissionTime) BETWEEN ${desde} AND ${hasta} AND b.archived = 0
    GROUP BY nombre
    ORDER BY kg DESC
  `)) as any;

  const porParcela: LineaCosecha[] = (filasParcela as any[]).map((f) => ({
    nombre: String(f.nombre || "Sin parcela definida"),
    cajas: Number(f.cajas),
    kg: kg(f.kg),
    primera: kg(f.primera),
    segunda: kg(f.segunda),
    desperdicio: kg(f.desperdicio),
  }));

  if (porParcela.length === 0) return null;

  const totales: LineaCosecha = {
    nombre: "TOTAL",
    cajas: porParcela.reduce((s, p) => s + p.cajas, 0),
    kg: kg(porParcela.reduce((s, p) => s + p.kg, 0)),
    primera: kg(porParcela.reduce((s, p) => s + p.primera, 0)),
    segunda: kg(porParcela.reduce((s, p) => s + p.segunda, 0)),
    desperdicio: kg(porParcela.reduce((s, p) => s + p.desperdicio, 0)),
  };

  // DATE_FORMAT y no DATE(): el conector devuelve una columna DATE como objeto
  // Date en UTC, y al formatearla en México se recorría un día hacia atrás.
  const [filasDia] = (await db.execute(sql`
    SELECT
      DATE_FORMAT(b.submissionTime, '%Y-%m-%d') AS fecha,
      COUNT(*) AS cajas,
      SUM(b.weight) / 1000 AS kg,
      SUM(CASE WHEN b.harvesterId NOT IN (98, 99) THEN b.weight ELSE 0 END) / 1000 AS primera
    FROM boxes b
    WHERE DATE(b.submissionTime) BETWEEN ${desde} AND ${hasta} AND b.archived = 0
    GROUP BY fecha
    ORDER BY fecha ASC
  `)) as any;

  const porDia = (filasDia as any[]).map((f) => ({
    fecha: String(f.fecha),
    cajas: Number(f.cajas),
    kg: kg(f.kg),
    primera: kg(f.primera),
  }));

  const [filasCortadora] = (await db.execute(sql`
    SELECT
      b.harvesterId AS numero,
      h.customName AS nombre,
      COUNT(*) AS cajas,
      SUM(b.weight) / 1000 AS kg
    FROM boxes b
    LEFT JOIN harvesters h ON h.number = b.harvesterId
    WHERE DATE(b.submissionTime) BETWEEN ${desde} AND ${hasta} AND b.archived = 0
      AND b.harvesterId NOT IN (97, 98, 99)
    GROUP BY b.harvesterId, h.customName
    ORDER BY kg DESC
    LIMIT 10
  `)) as any;

  const porCortadora = (filasCortadora as any[]).map((f) => ({
    numero: Number(f.numero),
    nombre: String(f.nombre || `Cortadora ${String(f.numero).padStart(2, "0")}`),
    cajas: Number(f.cajas),
    kg: kg(f.kg),
  }));

  const [filasAviso] = (await db.execute(sql`
    SELECT
      SUM(CASE WHEN b.parcelCode IS NULL OR b.parcelCode = '' OR b.parcelCode = 'SIN_PARCELA' THEN 1 ELSE 0 END) AS sinParcela,
      SUM(CASE WHEN b.weight > ${PESO_ALTO_GRAMOS} THEN 1 ELSE 0 END) AS pesoAlto,
      SUM(CASE WHEN b.cycleId IS NULL THEN 1 ELSE 0 END) AS sinCiclo
    FROM boxes b
    WHERE DATE(b.submissionTime) BETWEEN ${desde} AND ${hasta} AND b.archived = 0
  `)) as any;

  const a = (filasAviso as any[])[0] || {};
  const avisos = {
    sinParcela: Number(a.sinParcela || 0),
    pesoAlto: Number(a.pesoAlto || 0),
    sinCiclo: Number(a.sinCiclo || 0),
  };

  const previaDesde = sumarDias(desde, -7);
  const previaHasta = sumarDias(hasta, -7);
  const [filasPrevias] = (await db.execute(sql`
    SELECT SUM(b.weight) / 1000 AS kg
    FROM boxes b
    WHERE DATE(b.submissionTime) BETWEEN ${previaDesde} AND ${previaHasta} AND b.archived = 0
  `)) as any;
  const kgSemanaPrevia = kg((filasPrevias as any[])[0]?.kg);

  const [filasCiclo] = (await db.execute(sql`
    SELECT name FROM productionCycles
    WHERE startDate <= ${hasta} AND COALESCE(endDate, ${hasta}) >= ${desde}
    ORDER BY startDate DESC LIMIT 1
  `)) as any;
  const ciclo = (filasCiclo as any[])[0]?.name ? String((filasCiclo as any[])[0].name) : null;

  return { totales, porParcela, porDia, porCortadora, avisos, kgSemanaPrevia, ciclo };
}

// ── El correo de cosecha ─────────────────────────────────────

/**
 * El correo de cosecha: un aviso, no el reporte.
 *
 * De toda la semana sobrevive una sola cifra —los kilos— porque es la que se
 * lee de un vistazo en el teléfono y decide si abres el documento ahora o
 * despues. El desglose por dia, por parcela y por cortadora esta en el PDF,
 * y repetirlo aqui solo obligaba a leerlo dos veces.
 */
export function renderCosechaEmailHtml(datos: {
  periodo: { desde: string; hasta: string };
  cosecha: CosechaSemana;
  hayPdf?: boolean;
}): string {
  const t = datos.cosecha.totales;
  const dias = datos.cosecha.porDia.length;

  return plantillaAviso({
    titulo: "Reporte semanal de cosecha",
    periodo: `${datos.cosecha.ciclo ? `Ciclo ${datos.cosecha.ciclo} · ` : ""}${fechaCorta(datos.periodo.desde)} — ${fechaCorta(datos.periodo.hasta)}`,
    frase:
      `Se cosecharon ${num(t.kg, 0)} kg en ${num(t.cajas)} cajas, ` +
      `a lo largo de ${dias} ${dias === 1 ? "día" : "días"} de corte.` +
      (datos.hayPdf === false ? "" : " El desglose completo va en el PDF adjunto."),
    adjunto: datos.hayPdf === false ? undefined : "Reporte completo en PDF",
    logoCid: LOGO_CID,
  });
}

export function renderCosechaEmailText(datos: {
  periodo: { desde: string; hasta: string };
  cosecha: CosechaSemana;
}): string {
  const t = datos.cosecha.totales;
  return [
    "REPORTE SEMANAL DE COSECHA",
    `${fechaCorta(datos.periodo.desde)} a ${fechaCorta(datos.periodo.hasta)}`,
    "",
    `Se cosecharon ${num(t.kg, 0)} kg en ${num(t.cajas)} cajas.`,
    "El desglose completo va en el PDF adjunto.",
    "",
    "Agra Tec-Ti · Correo automático, no hace falta responderlo.",
  ].join("\n");
}

// ── El envío ─────────────────────────────────────────────────

export interface ResultadoSemanal {
  enviado: boolean;
  motivo?: string;
  semana: { desde: string; hasta: string };
  destinatarios: number;
  correos: Array<{ tipo: "actividades" | "cosecha"; ok: boolean; error?: string }>;
}

/**
 * Arma y manda los correos de una semana.
 *
 * Se puede llamar a mano desde Ajustes (con `forzar`) o desde el reloj. El de
 * actividades sale siempre, aunque la semana haya estado tranquila: que no
 * llegue nada es indistinguible de que el sistema se cayó. El de cosecha solo
 * sale si hubo cajas, porque fuera de temporada serían cinco meses de correos
 * en cero.
 */
export async function enviarReporteSemanal(opciones?: {
  semana?: { desde: string; hasta: string };
  forzar?: boolean;
  usuarioId?: number | null;
  /** Solo probar: manda ambos correos a una dirección y no toca la marca */
  soloA?: string;
}): Promise<ResultadoSemanal> {
  const semana = opciones?.semana || semanaPasada();
  const config = await leerConfigSemanal();

  if (!config) {
    return { enviado: false, motivo: "Falta configurar la cuenta de correo en Ajustes.", semana, destinatarios: 0, correos: [] };
  }
  if (!config.activo && !opciones?.forzar) {
    return { enviado: false, motivo: "El envío semanal está apagado en Ajustes.", semana, destinatarios: 0, correos: [] };
  }

  const destinatarios = opciones?.soloA
    ? parseRecipients(opciones.soloA)
    : await destinatariosSemanales(config.aTodos);

  if (destinatarios.length === 0) {
    return {
      enviado: false,
      motivo: "Nadie a quién mandarlo: no hay cuentas activas con correo ni destinatarios fijos.",
      semana,
      destinatarios: 0,
      correos: [],
    };
  }

  const correos: ResultadoSemanal["correos"] = [];

  /**
   * Arma el PDF sin poner en riesgo el correo.
   *
   * Si el dibujo falla —un nombre rarísimo, una tabla imposible— es mucho
   * peor quedarse sin reporte que quedarse sin adjunto: el cuerpo del correo
   * ya trae los totales y la tabla. Por eso esto devuelve null en vez de
   * reventar el envío.
   */
  const pdfSeguro = async (armar: () => Promise<Buffer>, nombre: string) => {
    // El logo va siempre: es la imagen en linea del cuerpo, no un adjunto
    // que la gente vea colgando del correo.
    const adjuntos: MailAttachment[] = [...logoAdjunto()];
    try {
      adjuntos.push({ filename: nombre, content: await armar(), contentType: "application/pdf" });
    } catch (e) {
      console.error(`${TAG} No se pudo generar ${nombre}, va el correo sin adjunto:`, e);
    }
    return { adjuntos, hayPdf: adjuntos.some((a) => a.filename === nombre) };
  };

  // 1. Actividades de campo — siempre
  try {
    const { buildActivityReport } = await import("./activityReport");
    const { renderActivityEmailHtml, renderActivityEmailText } = await import("./activityReportEmail");
    const datos = await buildActivityReport({ fromDate: semana.desde, toDate: semana.hasta });

    const { generarPdf } = await import("./reportePdf");
    const { documentoDeActividades } = await import("./reporteDocumentos");
    const { adjuntos, hayPdf } = await pdfSeguro(
      () => generarPdf(documentoDeActividades({ ...datos, scopeLabel: "Todas las parcelas" })),
      `actividades-${semana.desde}_${semana.hasta}.pdf`,
    );

    const r = await sendMail({
      to: destinatarios,
      subject: `Actividades de campo · semana del ${fechaCorta(semana.desde)} al ${fechaCorta(semana.hasta)}`,
      html: renderActivityEmailHtml({ ...datos, scopeLabel: "Todas las parcelas", hasAttachment: hayPdf }),
      text: renderActivityEmailText({ ...datos, scopeLabel: "Todas las parcelas" }),
      attachments: adjuntos,
      kind: "semanal-actividades",
      userId: opciones?.usuarioId ?? null,
      oculto: destinatarios.length > 1,
    });
    correos.push({ tipo: "actividades", ok: r.ok, error: r.error });
  } catch (e: any) {
    const error = String(e?.message || e).slice(0, 300);
    console.error(`${TAG} Falló el reporte de actividades:`, error);
    correos.push({ tipo: "actividades", ok: false, error });
  }

  // 2. Cosecha — solo si hubo
  if (config.conCosecha) {
    try {
      const cosecha = await resumenCosechaSemana(semana.desde, semana.hasta);
      if (cosecha) {
        const { generarPdf } = await import("./reportePdf");
        const { documentoDeCosecha } = await import("./reporteDocumentos");
        const { adjuntos, hayPdf } = await pdfSeguro(
          () => generarPdf(documentoDeCosecha({ periodo: semana, cosecha })),
          `cosecha-${semana.desde}_${semana.hasta}.pdf`,
        );

        const r = await sendMail({
          to: destinatarios,
          subject: `Cosecha · semana del ${fechaCorta(semana.desde)} al ${fechaCorta(semana.hasta)} — ${num(cosecha.totales.kg, 0)} kg`,
          html: renderCosechaEmailHtml({ periodo: semana, cosecha, hayPdf }),
          text: renderCosechaEmailText({ periodo: semana, cosecha }),
          attachments: adjuntos,
          kind: "semanal-cosecha",
          userId: opciones?.usuarioId ?? null,
          oculto: destinatarios.length > 1,
        });
        correos.push({ tipo: "cosecha", ok: r.ok, error: r.error });
      }
    } catch (e: any) {
      const error = String(e?.message || e).slice(0, 300);
      console.error(`${TAG} Falló el reporte de cosecha:`, error);
      correos.push({ tipo: "cosecha", ok: false, error });
    }
  }

  const todoBien = correos.length > 0 && correos.every((c) => c.ok);

  // La marca de "ya mandé esta semana" solo se pone en el envío de verdad.
  // Una prueba a una dirección suelta no puede dejar sin correo a la plantilla.
  if (!opciones?.soloA) {
    try {
      const db = await getDb();
      const [row] = db ? await db.select({ id: smtpConfig.id }).from(smtpConfig).limit(1) : [];
      if (db && row) {
        await db
          .update(smtpConfig)
          .set({
            weeklyLastWeek: todoBien ? semana.desde : null,
            weeklyLastAt: new Date(),
            weeklyLastError: todoBien
              ? null
              : (correos.find((c) => !c.ok)?.error || "No se pudo enviar").slice(0, 500),
          })
          .where(eq(smtpConfig.id, row.id));
      }
    } catch (e) {
      console.error(`${TAG} No se pudo anotar el resultado del envío:`, e);
    }
  }

  return {
    enviado: todoBien,
    motivo: todoBien ? undefined : correos.find((c) => !c.ok)?.error,
    semana,
    destinatarios: destinatarios.length,
    correos,
  };
}

// ── El reloj ─────────────────────────────────────────────────

let relojIniciado = false;

function horaMx(): number {
  return parseInt(
    new Date().toLocaleString("en-US", { timeZone: ZONA, hour: "2-digit", hour12: false }),
    10,
  );
}

/**
 * Revisa cada media hora si toca mandar.
 *
 * No usa cron: el contenedor se reinicia con cada despliegue y un cron en
 * memoria se perdería la ventana si el reinicio cae justo a esa hora. En vez
 * de eso se pregunta "¿ya es el día y la hora, y todavía no mando esta
 * semana?", que da la misma respuesta correcta sin importar cuántas veces se
 * reinicie el servidor ni a qué hora vuelva.
 */
export function startWeeklyReportMailer() {
  if (relojIniciado) return;
  relojIniciado = true;
  console.log(`${TAG} Reloj iniciado (revisa cada 30 min si toca el envío semanal)`);

  const revisar = async () => {
    try {
      const config = await leerConfigSemanal();
      if (!config || !config.activo) return;

      const hoy = hoyMx();
      const diaDeHoy = diaIso(hoy);

      // Todavía no toca.
      if (diaDeHoy < config.dia) return;
      if (diaDeHoy === config.dia && horaMx() < config.hora) return;
      // Pasado el día y la hora sí se manda, aunque sea con retraso: si el
      // servidor estuvo caído el lunes entero, el reporte sale el martes en
      // vez de perderse esa semana.

      const semana = semanaPasada(hoy);
      if (config.ultimaSemana === semana.desde) return; // ya salió

      // Falló el intento anterior. Reintentar cada media hora contra un
      // servidor de correo averiado solo llena la bitácora de errores; una
      // vez cada dos horas alcanza para que se arregle solo en cuanto
      // alguien corrija las credenciales.
      if (config.ultimoError && config.ultimoEnvio) {
        const desdeElUltimo = Date.now() - new Date(config.ultimoEnvio).getTime();
        if (desdeElUltimo < 2 * 60 * 60 * 1000) return;
      }

      console.log(`${TAG} Enviando el reporte de la semana ${semana.desde} → ${semana.hasta}`);
      const r = await enviarReporteSemanal({ semana });
      console.log(
        `${TAG} ${r.enviado ? "Enviado" : "Falló"} a ${r.destinatarios} destinatario(s): ` +
          r.correos.map((c) => `${c.tipo}=${c.ok ? "ok" : c.error}`).join(", "),
      );
    } catch (e) {
      console.error(`${TAG} Error en el reloj:`, e);
    }
  };

  // A los tres minutos del arranque: deja que la base y las migraciones
  // terminen antes de preguntarle nada.
  setTimeout(revisar, 3 * 60 * 1000);
  setInterval(revisar, 30 * 60 * 1000);
}

/** Lo usa Ajustes para enseñar cuándo sale el próximo */
export function proximoEnvio(config: ConfigSemanal, hoy: string = hoyMx()): string {
  const diasHasta = (config.dia - diaIso(hoy) + 7) % 7;
  const fecha = sumarDias(hoy, diasHasta === 0 && horaMx() >= config.hora ? 7 : diasHasta);
  return `${fechaCorta(fecha)} a las ${String(config.hora).padStart(2, "0")}:00`;
}
