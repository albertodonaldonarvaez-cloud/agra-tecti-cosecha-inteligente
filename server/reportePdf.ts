// ============================================================
// Los PDF de los reportes
//
// El reporte por correo sale solo, de madrugada, sin que haya un navegador
// abierto en ningún lado. Por eso el PDF NO se puede armar como lo arma la
// pantalla de Reportes (imprimir el HTML): aquí se dibuja.
//
// Por qué pdfkit y no un navegador sin ventana: meter Chromium al contenedor
// son ~400 MB más sobre una imagen de Alpine, más fuentes, más un proceso que
// se cuelga y deja zombis. pdfkit es JavaScript puro, no necesita nada del
// sistema y en una imagen Alpine simplemente funciona. El precio es acomodar
// las tablas a mano, que es lo que hace este módulo.
//
// El aspecto es el de la aplicación: vidrio. No se puede desenfocar dentro de
// un PDF, así que se imita con lo que sí hay — degradados radiales por
// detrás, rellenos translúcidos por encima, un filo claro en el borde de
// arriba de cada tarjeta y esquinas muy redondeadas. Todo el texto se queda
// oscuro sobre claro, porque esto se imprime.
//
// Las acentuadas y la ñ salen bien con la Helvetica de fábrica (WinAnsi
// cubre el latín occidental). No hace falta cargar una fuente.
// ============================================================

import PDFDocument from "pdfkit";
import { logoPng } from "./logo";

const VERDE_PROFUNDO = "#0b3d2c";
const VERDE_OSCURO = "#14532d";
const VERDE = "#16a34a";
const VERDE_VIVO = "#4ade80";
const TINTA = "#1f2937";
const GRIS = "#6b7280";
const BORDE = "#dbe5de";
const AMBAR = "#b45309";

const MARGEN = 40;
const ANCHO_HOJA = 612; // carta, en puntos
const ALTO_HOJA = 792;
const ANCHO = ANCHO_HOJA - MARGEN * 2;
/** Por debajo de aquí ya se pisaría el pie de página */
const LIMITE = ALTO_HOJA - MARGEN - 26;

export interface ColumnaPdf {
  titulo: string;
  /** Proporción del ancho total. Se normalizan entre todas. */
  peso: number;
  alinear?: "left" | "right" | "center";
}

export interface SeccionPdf {
  titulo: string;
  /** Texto suelto antes de la tabla */
  parrafos?: string[];
  vinetas?: string[];
  columnas?: ColumnaPdf[];
  filas?: string[][];
  /** Renglón que se repite al pie de la tabla, en negritas */
  totales?: string[];
}

export interface DocumentoPdf {
  titulo: string;
  subtitulo: string;
  contexto?: string;
  periodo: string;
  kpis: Array<{ etiqueta: string; valor: string }>;
  secciones: SeccionPdf[];
  /** Advertencias que van en un panel ámbar al final */
  avisos?: string[];
}

type Doc = InstanceType<typeof PDFDocument>;

// ── Piezas de vidrio ─────────────────────────────────────────

/**
 * Una tarjeta translúcida: deja ver el fondo, tiene el canto suave y un filo
 * claro arriba. Ese filo es lo que la hace parecer vidrio y no papel: es el
 * brillo del borde superior, que en la pantalla lo da el desenfoque.
 */
function tarjeta(
  doc: Doc,
  x: number,
  y: number,
  ancho: number,
  alto: number,
  opciones?: { radio?: number; tono?: string; opacidad?: number; borde?: string; filo?: boolean },
): void {
  const radio = opciones?.radio ?? 10;
  doc.save();
  doc.fillOpacity(opciones?.opacidad ?? 0.72);
  doc.roundedRect(x, y, ancho, alto, radio).fill(opciones?.tono ?? "#ffffff");
  doc.fillOpacity(1);
  doc.strokeOpacity(0.9);
  doc.roundedRect(x, y, ancho, alto, radio).lineWidth(0.7).stroke(opciones?.borde ?? BORDE);
  if (opciones?.filo !== false) {
    doc.strokeOpacity(0.85);
    doc
      .moveTo(x + radio, y + 0.9)
      .lineTo(x + ancho - radio, y + 0.9)
      .lineWidth(0.9)
      .stroke("#ffffff");
  }
  doc.restore();
}

/** Un halo de color suave. Es lo que da profundidad por detrás del vidrio. */
function halo(doc: Doc, x: number, y: number, radio: number, color: string, opacidad: number): void {
  doc.save();
  doc.fillOpacity(opacidad);
  const g = doc.radialGradient(x, y, 0, x, y, radio);
  g.stop(0, color);
  g.stop(1, color, 0);
  doc.circle(x, y, radio).fill(g);
  doc.restore();
}

/** El fondo de cada página: un lavado casi blanco con dos luces verdes */
function fondo(doc: Doc, primera: boolean): void {
  const g = doc.linearGradient(0, 0, 0, ALTO_HOJA);
  g.stop(0, "#f3f8f4");
  g.stop(0.45, "#fbfdfb");
  g.stop(1, "#f6faf7");
  doc.rect(0, 0, ANCHO_HOJA, ALTO_HOJA).fill(g);

  if (primera) {
    halo(doc, ANCHO_HOJA - 60, 120, 260, VERDE_VIVO, 0.16);
    halo(doc, 40, 470, 300, "#34d399", 0.09);
  } else {
    halo(doc, ANCHO_HOJA - 30, 60, 200, VERDE_VIVO, 0.09);
  }
}

/**
 * El logo, incrustado UNA vez por documento.
 *
 * `doc.image(buffer, …)` vuelve a meter el archivo entero en cada llamada, y
 * el logo aparece en la cabecera de todas las páginas: un reporte de cinco
 * hojas pesaba 200 kB de los cuales 150 eran el mismo PNG cinco veces.
 * `openImage` lo incrusta una sola vez y las páginas lo referencian.
 */
const logoAbierto = new WeakMap<object, unknown>();

function logoDelDocumento(doc: Doc): unknown | null {
  const guardado = logoAbierto.get(doc);
  if (guardado !== undefined) return guardado;

  const png = logoPng();
  let imagen: unknown = null;
  if (png) {
    try {
      imagen = (doc as any).openImage(png);
    } catch (e) {
      console.warn("[ReportePdf] No se pudo incrustar el logo:", e);
    }
  }
  logoAbierto.set(doc, imagen);
  return imagen;
}

/** El logo dentro de su pastilla esmerilada */
function pastillaDelLogo(doc: Doc, x: number, y: number, lado: number): void {
  doc.save();
  doc.fillOpacity(0.93);
  doc.roundedRect(x, y, lado, lado, lado * 0.29).fill("#ffffff");
  doc.restore();

  const imagen = logoDelDocumento(doc);
  if (!imagen) return;
  const margen = lado * 0.17;
  try {
    doc.image(imagen as any, x + margen, y + margen, {
      fit: [lado - margen * 2, lado - margen * 2],
      align: "center",
    });
  } catch {
    // Una imagen que pdfkit no sepa dibujar no puede tumbar el reporte
  }
}

/** La cabecera grande de la primera página */
function bandaDelTitulo(doc: Doc, d: DocumentoPdf): void {
  const y = 26;
  const alto = 88;

  const g = doc.linearGradient(MARGEN, y, MARGEN + ANCHO, y + alto);
  g.stop(0, VERDE_PROFUNDO);
  g.stop(0.55, VERDE_OSCURO);
  g.stop(1, VERDE);
  doc.roundedRect(MARGEN, y, ANCHO, alto, 18).fill(g);

  // El reflejo de arriba, que es lo que lo despega del papel
  doc.save();
  doc.fillOpacity(0.13);
  doc.roundedRect(MARGEN, y, ANCHO, alto * 0.46, 18).fill("#ffffff");
  doc.restore();

  pastillaDelLogo(doc, MARGEN + 18, y + 19, 50);

  const xTexto = MARGEN + 18 + 50 + 16;
  const anchoTexto = ANCHO - (xTexto - MARGEN) - 18;

  doc.save();
  doc.fillOpacity(0.72);
  doc.font("Helvetica").fontSize(7).fillColor("#ffffff");
  doc.text("AGRA TEC-TI · COSECHA INTELIGENTE", xTexto, y + 20, {
    width: anchoTexto,
    characterSpacing: 1.3,
    lineBreak: false,
  });
  doc.restore();

  doc.font("Helvetica-Bold").fontSize(16).fillColor("#ffffff");
  doc.text(d.titulo, xTexto, y + 34, { width: anchoTexto, lineBreak: false });

  doc.save();
  doc.fillOpacity(0.78);
  doc.font("Helvetica").fontSize(7.5).fillColor("#d1fae5");
  doc.text(d.subtitulo, xTexto, y + 58, { width: anchoTexto, characterSpacing: 0.8, lineBreak: false });
  doc.restore();

  doc.y = y + alto + 16;
  doc.fillColor(TINTA);
}

/** La cabecera delgada de las páginas siguientes */
function encabezadoContinuacion(doc: Doc, d: DocumentoPdf): void {
  const y = 24;
  const alto = 38;
  tarjeta(doc, MARGEN, y, ANCHO, alto, { radio: 12, opacidad: 0.66 });
  pastillaDelLogo(doc, MARGEN + 9, y + 7, 24);

  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(VERDE_OSCURO);
  doc.text(d.titulo, MARGEN + 44, y + 11, { width: ANCHO * 0.55, lineBreak: false });
  doc.font("Helvetica").fontSize(8).fillColor(GRIS);
  doc.text(d.periodo, MARGEN + ANCHO * 0.6, y + 12, { width: ANCHO * 0.4 - 14, align: "right", lineBreak: false });

  doc.y = y + alto + 14;
  doc.fillColor(TINTA);
}

function barraDeContexto(doc: Doc, d: DocumentoPdf): void {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(VERDE_OSCURO);
  doc.text(d.contexto || "", MARGEN + 2, y, { width: ANCHO / 2, lineBreak: false });
  doc.font("Helvetica").fontSize(9).fillColor(GRIS);
  doc.text(d.periodo, MARGEN + ANCHO / 2, y, { width: ANCHO / 2 - 2, align: "right", lineBreak: false });
  doc.y = y + 18;
  doc.fillColor(TINTA);
}

function filaDeKpis(doc: Doc, kpis: DocumentoPdf["kpis"]): void {
  if (kpis.length === 0) return;
  const hueco = 7;
  const ancho = (ANCHO - hueco * (kpis.length - 1)) / kpis.length;
  const alto = 50;
  const y = doc.y;

  kpis.forEach((k, i) => {
    const x = MARGEN + i * (ancho + hueco);
    tarjeta(doc, x, y, ancho, alto, { radio: 12, opacidad: 0.78 });
    doc.fillColor(VERDE_OSCURO).font("Helvetica-Bold").fontSize(14);
    doc.text(k.valor, x, y + 12, { width: ancho, align: "center", lineBreak: false });
    doc.fillColor(GRIS).font("Helvetica").fontSize(6.5);
    doc.text(k.etiqueta.toUpperCase(), x, y + 32, {
      width: ancho,
      align: "center",
      characterSpacing: 0.5,
      lineBreak: false,
    });
  });

  doc.y = y + alto + 14;
  doc.fillColor(TINTA).font("Helvetica").fontSize(9);
}

function tituloDeSeccion(doc: Doc, texto: string): void {
  if (doc.y > LIMITE - 60) doc.addPage();
  doc.moveDown(0.35);
  const y = doc.y;

  // Una gota verde en vez de un subrayado de lado a lado: pesa menos
  doc.save();
  doc.roundedRect(MARGEN + 1, y + 1.5, 3, 9, 1.5).fill(VERDE);
  doc.restore();

  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(VERDE_OSCURO);
  doc.text(texto.toUpperCase(), MARGEN + 11, y, { width: ANCHO - 11, characterSpacing: 0.7 });

  doc.save();
  doc.strokeOpacity(0.5);
  const g = doc.linearGradient(MARGEN, 0, MARGEN + ANCHO, 0);
  g.stop(0, VERDE);
  g.stop(1, "#ffffff");
  doc.moveTo(MARGEN, doc.y + 3).lineTo(MARGEN + ANCHO, doc.y + 3).lineWidth(1).stroke(g);
  doc.restore();

  doc.y += 10;
  doc.fillColor(TINTA).font("Helvetica").fontSize(9);
}

// ── Tablas ───────────────────────────────────────────────────

function anchos(columnas: ColumnaPdf[]): number[] {
  const suma = columnas.reduce((s, c) => s + c.peso, 0) || 1;
  return columnas.map((c) => (c.peso / suma) * ANCHO);
}

/** Alto que va a ocupar una fila, que es el de la celda más alta */
function altoDeFila(doc: Doc, celdas: string[], anchoCol: number[], padding = 5): number {
  let alto = 0;
  celdas.forEach((texto, i) => {
    const h = doc.heightOfString(texto || "", { width: anchoCol[i] - padding * 2 });
    if (h > alto) alto = h;
  });
  return alto + padding * 2;
}

function cabeceraDeTabla(doc: Doc, columnas: ColumnaPdf[], anchoCol: number[]): void {
  const y = doc.y;
  const alto = 20;

  doc.save();
  doc.fillOpacity(0.14);
  doc.roundedRect(MARGEN, y, ANCHO, alto, 7).fill(VERDE_OSCURO);
  doc.restore();

  doc.fillColor(VERDE_OSCURO).font("Helvetica-Bold").fontSize(7.5);
  let x = MARGEN;
  columnas.forEach((c, i) => {
    doc.text(c.titulo.toUpperCase(), x + 6, y + 7, {
      width: anchoCol[i] - 12,
      align: c.alinear || "left",
      characterSpacing: 0.4,
      lineBreak: false,
    });
    x += anchoCol[i];
  });

  doc.y = y + alto;
  doc.fillColor(TINTA);
}

/**
 * Dibuja una tabla, partiéndola entre páginas cuando hace falta y repitiendo
 * la cabecera arriba de cada trozo. Sin eso, la segunda página de un reporte
 * largo son columnas de números sin nombre.
 */
function tabla(doc: Doc, columnas: ColumnaPdf[], filas: string[][], totales?: string[]): void {
  const anchoCol = anchos(columnas);
  cabeceraDeTabla(doc, columnas, anchoCol);
  doc.font("Helvetica").fontSize(8);

  const pintarFila = (celdas: string[], indice: number, negritas: boolean) => {
    doc.font(negritas ? "Helvetica-Bold" : "Helvetica").fontSize(8);
    const alto = altoDeFila(doc, celdas, anchoCol);

    if (doc.y + alto > LIMITE) {
      doc.addPage();
      cabeceraDeTabla(doc, columnas, anchoCol);
      doc.font(negritas ? "Helvetica-Bold" : "Helvetica").fontSize(8);
    }

    const y = doc.y;
    if (negritas) {
      doc.save();
      doc.fillOpacity(0.16);
      doc.roundedRect(MARGEN, y, ANCHO, alto, 6).fill(VERDE);
      doc.restore();
    } else if (indice % 2 === 0) {
      doc.save();
      doc.fillOpacity(0.55);
      doc.rect(MARGEN, y, ANCHO, alto).fill("#ffffff");
      doc.restore();
    }
    doc.fillColor(negritas ? VERDE_OSCURO : TINTA);

    let x = MARGEN;
    celdas.forEach((texto, i) => {
      doc.text(texto || "", x + 6, y + 5, {
        width: anchoCol[i] - 12,
        align: columnas[i]?.alinear || "left",
      });
      x += anchoCol[i];
    });

    doc.y = y + alto;
    if (!negritas) {
      doc.save();
      doc.strokeOpacity(0.7);
      doc.moveTo(MARGEN + 4, doc.y).lineTo(MARGEN + ANCHO - 4, doc.y).lineWidth(0.5).stroke(BORDE);
      doc.restore();
    }
  };

  filas.forEach((f, i) => pintarFila(f, i, false));
  if (totales) pintarFila(totales, filas.length, true);

  doc.fillColor(TINTA).font("Helvetica").fontSize(9);
  doc.moveDown(0.8);
}

function panelDeAvisos(doc: Doc, avisos: string[]): void {
  if (avisos.length === 0) return;
  tituloDeSeccion(doc, "Para revisar");

  doc.font("Helvetica").fontSize(8.5);
  const texto = avisos.map((a) => `•  ${a}`).join("\n");
  const alto = doc.heightOfString(texto, { width: ANCHO - 26 }) + 18;

  if (doc.y + alto > LIMITE) doc.addPage();

  const y = doc.y;
  tarjeta(doc, MARGEN, y, ANCHO, alto, { radio: 10, tono: "#fef3c7", opacidad: 0.62, borde: "#fcd9a0" });
  doc.save();
  doc.roundedRect(MARGEN + 1, y + 6, 3, alto - 12, 1.5).fill(AMBAR);
  doc.restore();

  doc.fillColor("#8a4b06").font("Helvetica").fontSize(8.5);
  doc.text(texto, MARGEN + 14, y + 9, { width: ANCHO - 26 });
  doc.y = y + alto + 6;
  doc.fillColor(TINTA);
}

/**
 * Numera las páginas al final, cuando ya se sabe cuántas hay.
 * `bufferPages` es justo para esto: mantiene las páginas en memoria en vez de
 * escribirlas conforme se llenan.
 */
function pieDePagina(doc: Doc, generado: string): void {
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(rango.start + i);

    // El pie va DEBAJO del margen inferior, y pdfkit, cuando el texto se sale
    // del área útil, añade una página. Numerar diez páginas creaba diez hojas
    // en blanco, cada una con su propio pie, que a su vez pedía otra. Bajar el
    // margen a cero mientras se dibuja el pie es lo que rompe esa cadena.
    const margenAbajo = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const y = ALTO_HOJA - MARGEN + 8;
    doc.save();
    doc.strokeOpacity(0.6);
    doc.moveTo(MARGEN, y - 8).lineTo(MARGEN + ANCHO, y - 8).lineWidth(0.5).stroke(BORDE);
    doc.restore();

    doc.font("Helvetica").fontSize(7).fillColor(GRIS);
    doc.text(generado, MARGEN, y, { width: ANCHO * 0.7, lineBreak: false });
    doc.text(`Página ${i + 1} de ${rango.count}`, MARGEN + ANCHO * 0.7, y, {
      width: ANCHO * 0.3,
      align: "right",
      lineBreak: false,
    });

    doc.page.margins.bottom = margenAbajo;
  }
}

/**
 * Arma el PDF y lo devuelve como Buffer, listo para adjuntar al correo.
 *
 * Buffer y no archivo: el correo se lo lleva en memoria y no queda basura en
 * el disco del contenedor cuando un envío falla a la mitad.
 */
export function generarPdf(d: DocumentoPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
        bufferPages: true,
        // Sin primera página automática: hace falta enganchar el fondo ANTES
        // de que exista una hoja, o la primera saldría sin él.
        autoFirstPage: false,
        info: { Title: d.titulo, Author: "Agra Tec-Ti", Subject: d.periodo },
      });

      const trozos: Buffer[] = [];
      doc.on("data", (t: Buffer) => trozos.push(t));
      doc.on("error", reject);
      doc.on("end", () => resolve(Buffer.concat(trozos)));

      let hojas = 0;
      doc.on("pageAdded", () => {
        hojas++;
        fondo(doc, hojas === 1);
        if (hojas > 1) encabezadoContinuacion(doc, d);
      });

      doc.addPage();
      bandaDelTitulo(doc, d);
      barraDeContexto(doc, d);
      filaDeKpis(doc, d.kpis);

      for (const seccion of d.secciones) {
        tituloDeSeccion(doc, seccion.titulo);

        for (const p of seccion.parrafos || []) {
          doc.font("Helvetica").fontSize(9).fillColor(TINTA);
          doc.text(p, MARGEN + 2, doc.y, { width: ANCHO - 4, align: "justify", lineGap: 1.8 });
          doc.moveDown(0.5);
        }

        for (const v of seccion.vinetas || []) {
          doc.font("Helvetica").fontSize(9).fillColor(TINTA);
          doc.text(`•  ${v}`, MARGEN + 8, doc.y, { width: ANCHO - 10, lineGap: 1.8 });
          doc.moveDown(0.3);
        }

        if (seccion.columnas && seccion.filas && seccion.filas.length > 0) {
          doc.moveDown(0.25);
          tabla(doc, seccion.columnas, seccion.filas, seccion.totales);
        }
      }

      panelDeAvisos(doc, d.avisos || []);

      const generado = `Generado por Agra Tec-Ti el ${new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
        dateStyle: "long",
        timeStyle: "short",
      })}`;
      pieDePagina(doc, generado);

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
