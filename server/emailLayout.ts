// ============================================================
// El aspecto de los correos del sistema
//
// Un solo lugar decide cómo se ve TODO lo que sale por correo. Antes cada
// reporte traía sus propios colores y su propia tabla, y bastaba cambiar uno
// para que dejaran de parecer del mismo sistema.
//
// Por qué tablas y estilos en línea y no clases: los clientes de correo
// —Outlook sobre todo— tiran el <style> del <head> e ignoran flex, grid y
// buena parte del CSS moderno. Lo único que se respeta en todos es una tabla
// con el estilo pegado al elemento. Se ve anticuado a propósito.
// ============================================================

/** Los verdes de la aplicación: green-900, green-600, green-100 de Tailwind */
export const VERDE_OSCURO = "#14532d";
export const VERDE = "#16a34a";
export const VERDE_TENUE = "#dcfce7";
export const TINTA = "#1f2937";
export const GRIS = "#6b7280";
export const BORDE = "#e5e7eb";
export const FONDO = "#f1f5f9";
export const AMBAR = "#b45309";
export const ROJO = "#b91c1c";

const TIPOGRAFIA =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Escapa lo que venga de la base de datos antes de meterlo en el HTML */
export function esc(texto: unknown): string {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * "2026-09-21" → "21 sep 2026".
 *
 * El mediodía no es decorativo: `new Date("2026-09-21")` es medianoche UTC,
 * que en México son las 18:00 del día 20, y el correo diría un día menos.
 */
export function fechaCorta(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

/** "2026-09-21" → "lunes 21" */
export function diaDeLaSemana(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric" });
}

/** Número con separador de miles y los decimales que se le pidan */
export function num(valor: number, decimales = 0): string {
  if (!Number.isFinite(valor)) return "—";
  return valor.toLocaleString("es-MX", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/** Una celda de dato grande. Van en fila dentro de `filaDeKpis`. */
export function kpi(etiqueta: string, valor: string, tono: string = VERDE_OSCURO): string {
  return `<td align="center" width="20%" style="padding:12px 6px;border:1px solid ${BORDE};border-radius:8px;background:#f8fafc">
    <div style="font-size:21px;font-weight:700;color:${tono};line-height:1.1">${esc(valor)}</div>
    <div style="font-size:10px;color:${GRIS};text-transform:uppercase;letter-spacing:.06em;margin-top:5px">${esc(etiqueta)}</div>
  </td>`;
}

export function filaDeKpis(celdas: string[]): string {
  if (celdas.length === 0) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="5"><tr>${celdas.join("")}</tr></table>`;
}

/** Encabezado de sección: verde, en versalitas, con su subrayado */
export function titulo(texto: string): string {
  return `<h2 style="font-size:13px;font-weight:700;color:${VERDE_OSCURO};text-transform:uppercase;letter-spacing:.08em;margin:26px 0 10px;padding-bottom:6px;border-bottom:2px solid ${VERDE}">${esc(texto)}</h2>`;
}

export function parrafo(texto: string): string {
  return `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:${TINTA}">${esc(texto)}</p>`;
}

export function lista(puntos: string[]): string {
  if (puntos.length === 0) return "";
  return `<ul style="margin:0;padding-left:20px">${puntos
    .map((p) => `<li style="font-size:14px;line-height:1.6;color:${TINTA};margin-bottom:6px">${esc(p)}</li>`)
    .join("")}</ul>`;
}

/** Recuadro de aviso, para lo que hay que revisar a mano */
export function aviso(texto: string, tono: "ambar" | "rojo" = "ambar"): string {
  const color = tono === "rojo" ? ROJO : AMBAR;
  const fondo = tono === "rojo" ? "#fef2f2" : "#fffbeb";
  const borde = tono === "rojo" ? "#fecaca" : "#fde68a";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0">
    <tr><td style="background:${fondo};border:1px solid ${borde};border-left:4px solid ${color};border-radius:6px;padding:11px 14px;font-size:13px;line-height:1.55;color:${color}">${texto}</td></tr>
  </table>`;
}

export interface Columna {
  /** Encabezado de la columna */
  titulo: string;
  alinear?: "left" | "right" | "center";
  /** Evita que el navegador parta el contenido en dos renglones */
  sinCorte?: boolean;
}

/**
 * Tabla con el encabezado verde y las filas alternadas.
 * Las celdas ya vienen en HTML: quien llama decide si algo va en negritas o
 * de otro color, y es quien tiene que haber escapado el texto.
 */
export function tabla(columnas: Columna[], filas: string[][]): string {
  if (filas.length === 0) return "";

  const encabezado = columnas
    .map(
      (c) =>
        `<th align="${c.alinear || "left"}" style="padding:9px 10px;font-size:10px;color:#ffffff;text-transform:uppercase;letter-spacing:.06em;font-weight:700">${esc(c.titulo)}</th>`,
    )
    .join("");

  const cuerpo = filas
    .map((fila, i) => {
      const fondo = i % 2 === 0 ? "#ffffff" : "#f9fafb";
      const celdas = fila
        .map((celda, j) => {
          const c = columnas[j] || {};
          return `<td align="${c.alinear || "left"}" style="padding:8px 10px;border-bottom:1px solid ${BORDE};font-size:12px;color:${TINTA}${c.sinCorte ? ";white-space:nowrap" : ""}">${celda}</td>`;
        })
        .join("");
      return `<tr style="background:${fondo}">${celdas}</tr>`;
    })
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BORDE}">
    <tr style="background:${VERDE_OSCURO}">${encabezado}</tr>
    ${cuerpo}
  </table>`;
}

/**
 * El correo de aviso: llegó el reporte, y el reporte va adjunto.
 *
 * Antes el cuerpo del correo repetía el reporte entero —los totales, la
 * tabla de labores, el desglose— y el PDF traía otra vez lo mismo. Leerlo
 * dos veces no aporta nada y en el teléfono es una pared de números. El
 * correo avisa; el documento informa.
 *
 * Por eso aquí no hay tablas ni cifras: logo, una línea, y de qué periodo es.
 */
export function plantillaAviso(opciones: {
  /** Qué reporte llegó: "Reporte semanal de cosecha" */
  titulo: string;
  /** El periodo en palabras */
  periodo: string;
  /** La línea que explica qué trae, en una frase */
  frase: string;
  /** Nombre del PDF adjunto, si lo hay */
  adjunto?: string;
  /** El logo va como imagen en línea; sin él el correo sale igual */
  logoCid?: string;
}): string {
  const logo = opciones.logoCid
    ? `<img src="cid:${esc(opciones.logoCid)}" width="64" height="64" alt="Agra Tec-Ti"
         style="display:block;width:64px;height:64px;border:0;outline:none;text-decoration:none">`
    : `<div style="font-size:13px;font-weight:700;color:${VERDE_OSCURO};letter-spacing:.12em">AGRA TEC-TI</div>`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opciones.titulo)}</title></head>
<body style="margin:0;padding:0;background:${FONDO}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FONDO};padding:40px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e8efe9;border-radius:16px;box-shadow:0 10px 34px rgba(20,83,45,.09);font-family:${TIPOGRAFIA}">

  <!--
    El filo verde de arriba. Sin degradados ni sombras dentro de la tarjeta:
    Outlook los tira y quedaría una caja a medio pintar. Un rectángulo de
    color sí lo dibujan todos.
  -->
  <tr><td style="background:${VERDE};height:3px;line-height:3px;font-size:0;border-radius:16px 16px 0 0">&nbsp;</td></tr>

  <tr><td align="center" style="padding:38px 32px 0">${logo}</td></tr>

  <tr><td align="center" style="padding:22px 32px 0">
    <div style="font-size:20px;font-weight:700;color:${VERDE_OSCURO};line-height:1.3">${esc(opciones.titulo)}</div>
    <div style="font-size:13px;color:${GRIS};margin-top:7px">${esc(opciones.periodo)}</div>
  </td></tr>

  <tr><td align="center" style="padding:20px 32px 0">
    <div style="font-size:14px;line-height:1.65;color:${TINTA}">${esc(opciones.frase)}</div>
  </td></tr>

  ${
    opciones.adjunto
      ? `<tr><td align="center" style="padding:24px 32px 0">
          <table role="presentation" cellpadding="0" cellspacing="0" style="background:#f6faf7;border:1px solid ${VERDE_TENUE};border-radius:10px">
            <tr><td style="padding:12px 18px;font-size:12px;color:${VERDE_OSCURO};font-weight:600">${esc(opciones.adjunto)}</td></tr>
          </table>
        </td></tr>`
      : ""
  }

  <tr><td align="center" style="padding:32px 32px 36px">
    <div style="font-size:11px;color:#9ca3af;line-height:1.6">
      Agra Tec-Ti · Cosecha inteligente<br>
      Correo automático, no hace falta responderlo.
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/**
 * El sobre: cabecera verde, contenido y pie. Todo correo del sistema pasa
 * por aquí, y por eso todos se ven iguales.
 */
export function plantilla(opciones: {
  /** Lo que va en grande en la cabecera */
  titulo: string;
  /** El renglón chiquito de arriba, en versalitas */
  bajada: string;
  /** Izquierda de la barra gris: a qué se refiere el reporte */
  contexto?: string;
  /** Derecha de la barra gris: el periodo */
  periodo?: string;
  /** El HTML de en medio, ya armado con las piezas de este módulo */
  cuerpo: string;
  /** Renglón extra del pie, antes del descargo */
  pie?: string;
}): string {
  const barra =
    opciones.contexto || opciones.periodo
      ? `<tr><td style="padding:18px 28px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:13px;color:${TINTA};font-weight:600">${esc(opciones.contexto || "")}</td>
            <td align="right" style="font-size:13px;color:${GRIS}">${esc(opciones.periodo || "")}</td>
          </tr></table>
        </td></tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opciones.titulo)}</title></head>
<body style="margin:0;padding:0;background:${FONDO}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FONDO};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:760px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:${TIPOGRAFIA}">

  <tr><td style="background:${VERDE_OSCURO};padding:22px 28px">
    <div style="font-size:11px;color:${VERDE_TENUE};letter-spacing:.2em;text-transform:uppercase">Agra Tec-Ti · Cosecha inteligente</div>
    <div style="font-size:19px;font-weight:700;color:#ffffff;letter-spacing:.02em;margin-top:7px">${esc(opciones.titulo)}</div>
    <div style="font-size:11px;color:${VERDE_TENUE};letter-spacing:.14em;text-transform:uppercase;margin-top:5px">${esc(opciones.bajada)}</div>
  </td></tr>

  ${barra}

  <tr><td style="padding:16px 28px 28px">${opciones.cuerpo}</td></tr>

  <tr><td style="background:#f8fafc;padding:16px 28px;border-top:1px solid ${BORDE}">
    <div style="font-size:11px;color:${GRIS};line-height:1.6">
      ${opciones.pie ? `${esc(opciones.pie)}<br>` : ""}
      AGRA TEC-TI · Correo generado automáticamente por el sistema; no hace falta responderlo.<br>
      Valide las recomendaciones con su ingeniero agrónomo antes de aplicar productos o dosis.
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
