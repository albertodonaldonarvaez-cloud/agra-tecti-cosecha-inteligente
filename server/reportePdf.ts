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
// Las acentuadas y la ñ salen bien con la Helvetica de fábrica (WinAnsi
// cubre el latín occidental). No hace falta cargar una fuente.
// ============================================================

import PDFDocument from "pdfkit";

const VERDE_OSCURO = "#14532d";
const VERDE = "#16a34a";
const TINTA = "#1f2937";
const GRIS = "#6b7280";
const GRIS_CLARO = "#f3f4f6";
const BORDE = "#e5e7eb";

const MARGEN = 40;
const ANCHO_HOJA = 612; // carta, en puntos
const ALTO_HOJA = 792;
const ANCHO = ANCHO_HOJA - MARGEN * 2;

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
  /** Advertencias que van en un recuadro ámbar al final */
  avisos?: string[];
}

type Doc = InstanceType<typeof PDFDocument>;

/** Ancho útil de cada columna a partir de sus pesos */
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
  const alto = 18;
  doc.rect(MARGEN, y, ANCHO, alto).fill(VERDE_OSCURO);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.5);
  let x = MARGEN;
  columnas.forEach((c, i) => {
    doc.text(c.titulo.toUpperCase(), x + 5, y + 6, {
      width: anchoCol[i] - 10,
      align: c.alinear || "left",
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

    if (doc.y + alto > ALTO_HOJA - MARGEN - 24) {
      doc.addPage();
      cabeceraDeTabla(doc, columnas, anchoCol);
      doc.font(negritas ? "Helvetica-Bold" : "Helvetica").fontSize(8);
    }

    const y = doc.y;
    if (negritas) {
      doc.rect(MARGEN, y, ANCHO, alto).fill("#e8f5ec");
    } else if (indice % 2 === 1) {
      doc.rect(MARGEN, y, ANCHO, alto).fill("#fafafa");
    }
    doc.fillColor(TINTA);

    let x = MARGEN;
    celdas.forEach((texto, i) => {
      doc.text(texto || "", x + 5, y + 5, {
        width: anchoCol[i] - 10,
        align: columnas[i]?.alinear || "left",
      });
      x += anchoCol[i];
    });

    doc.y = y + alto;
    doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + ANCHO, doc.y).strokeColor(BORDE).lineWidth(0.5).stroke();
  };

  filas.forEach((f, i) => pintarFila(f, i, false));
  if (totales) pintarFila(totales, filas.length, true);

  doc.fillColor(TINTA).font("Helvetica").fontSize(9);
  doc.moveDown(0.8);
}

function tituloDeSeccion(doc: Doc, texto: string): void {
  if (doc.y > ALTO_HOJA - MARGEN - 70) doc.addPage();
  doc.moveDown(0.4);
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(10).fillColor(VERDE_OSCURO);
  doc.text(texto.toUpperCase(), MARGEN, y, { width: ANCHO, characterSpacing: 0.6 });
  doc.moveTo(MARGEN, doc.y + 2).lineTo(MARGEN + ANCHO, doc.y + 2).strokeColor(VERDE).lineWidth(1.4).stroke();
  doc.y += 8;
  doc.fillColor(TINTA).font("Helvetica").fontSize(9);
}

function bandaDelTitulo(doc: Doc, d: DocumentoPdf): void {
  const alto = 74;
  doc.rect(0, 0, ANCHO_HOJA, alto).fill(VERDE_OSCURO);

  doc.fillColor("#a7f3d0").font("Helvetica").fontSize(7.5);
  doc.text("AGRA TEC-TI · COSECHA INTELIGENTE", MARGEN, 16, { width: ANCHO, characterSpacing: 1.4 });

  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(17);
  doc.text(d.titulo, MARGEN, 31, { width: ANCHO });

  doc.fillColor("#a7f3d0").font("Helvetica").fontSize(8);
  doc.text(d.subtitulo, MARGEN, 54, { width: ANCHO, characterSpacing: 0.8 });

  doc.y = alto + 16;
  doc.fillColor(TINTA);
}

function barraDeContexto(doc: Doc, d: DocumentoPdf): void {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(TINTA);
  doc.text(d.contexto || "", MARGEN, y, { width: ANCHO / 2 });
  doc.font("Helvetica").fontSize(9).fillColor(GRIS);
  doc.text(d.periodo, MARGEN + ANCHO / 2, y, { width: ANCHO / 2, align: "right" });
  doc.y = y + 18;
  doc.fillColor(TINTA);
}

function filaDeKpis(doc: Doc, kpis: DocumentoPdf["kpis"]): void {
  if (kpis.length === 0) return;
  const hueco = 6;
  const ancho = (ANCHO - hueco * (kpis.length - 1)) / kpis.length;
  const alto = 44;
  const y = doc.y;

  kpis.forEach((k, i) => {
    const x = MARGEN + i * (ancho + hueco);
    doc.roundedRect(x, y, ancho, alto, 5).fillAndStroke(GRIS_CLARO, BORDE);
    doc.fillColor(VERDE_OSCURO).font("Helvetica-Bold").fontSize(14);
    doc.text(k.valor, x, y + 9, { width: ancho, align: "center", lineBreak: false });
    doc.fillColor(GRIS).font("Helvetica").fontSize(6.5);
    doc.text(k.etiqueta.toUpperCase(), x, y + 28, { width: ancho, align: "center", characterSpacing: 0.5, lineBreak: false });
  });

  doc.y = y + alto + 10;
  doc.fillColor(TINTA).font("Helvetica").fontSize(9);
}

function recuadroDeAvisos(doc: Doc, avisos: string[]): void {
  if (avisos.length === 0) return;
  tituloDeSeccion(doc, "Para revisar");

  doc.font("Helvetica").fontSize(8.5).fillColor("#92400e");
  const texto = avisos.map((a) => `•  ${a}`).join("\n");
  const alto = doc.heightOfString(texto, { width: ANCHO - 22 }) + 16;

  if (doc.y + alto > ALTO_HOJA - MARGEN - 24) doc.addPage();

  const y = doc.y;
  doc.roundedRect(MARGEN, y, ANCHO, alto, 4).fillAndStroke("#fffbeb", "#fde68a");
  doc.rect(MARGEN, y, 3, alto).fill("#b45309");
  doc.fillColor("#92400e").font("Helvetica").fontSize(8.5);
  doc.text(texto, MARGEN + 12, y + 8, { width: ANCHO - 22 });
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

    const y = ALTO_HOJA - MARGEN + 6;
    doc.moveTo(MARGEN, y - 6).lineTo(MARGEN + ANCHO, y - 6).strokeColor(BORDE).lineWidth(0.5).stroke();
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
        info: { Title: d.titulo, Author: "Agra Tec-Ti", Subject: d.periodo },
      });

      const trozos: Buffer[] = [];
      doc.on("data", (t: Buffer) => trozos.push(t));
      doc.on("error", reject);
      doc.on("end", () => resolve(Buffer.concat(trozos)));

      bandaDelTitulo(doc, d);
      barraDeContexto(doc, d);
      filaDeKpis(doc, d.kpis);

      for (const seccion of d.secciones) {
        tituloDeSeccion(doc, seccion.titulo);

        for (const p of seccion.parrafos || []) {
          doc.font("Helvetica").fontSize(9).fillColor(TINTA);
          doc.text(p, MARGEN, doc.y, { width: ANCHO, align: "justify", lineGap: 1.5 });
          doc.moveDown(0.5);
        }

        for (const v of seccion.vinetas || []) {
          doc.font("Helvetica").fontSize(9).fillColor(TINTA);
          doc.text(`•  ${v}`, MARGEN + 6, doc.y, { width: ANCHO - 6, lineGap: 1.5 });
          doc.moveDown(0.3);
        }

        if (seccion.columnas && seccion.filas && seccion.filas.length > 0) {
          doc.moveDown(0.2);
          tabla(doc, seccion.columnas, seccion.filas, seccion.totales);
        }
      }

      recuadroDeAvisos(doc, d.avisos || []);

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
