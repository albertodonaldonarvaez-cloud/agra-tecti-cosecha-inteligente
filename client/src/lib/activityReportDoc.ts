import { esc, getReportCss, printHintHtml } from "./reportTheme";

/**
 * Documento del reporte de actividades de campo.
 *
 * Arma el HTML completo que se manda a imprimir (o se adjunta al correo).
 * Todo lo que sabe de las labores viene del servidor —incluido el resumen que
 * redacta la IA—; aquí solo se decide cómo se ve en el papel.
 */

// ── Tipos que devuelve reports.getActivityReport ──────────────

export interface ActivityProductLine {
  name: string;
  typeLabel: string;
  quantity: string | null;
  unit: string | null;
  plannedQuantity: string | null;
  dosisPerHectare: string | null;
  applicationMethod: string | null;
  notes: string | null;
}

export interface ActivityLine {
  id: number;
  date: string;
  endDate: string | null;
  type: string;
  typeLabel: string;
  subtype: string | null;
  description: string;
  performedBy: string;
  status: string;
  statusLabel: string;
  hours: number | null;
  days: number;
  sessions: Array<{ date: string; start: string | null; end: string | null; notes: string | null }>;
  parcelNames: string[];
  products: ActivityProductLine[];
  tools: string[];
  photoCount: number;
  weather: string | null;
  temperature: string | null;
}

export interface ActivityReportData {
  period: { from: string; to: string };
  summary: {
    total: number;
    completed: number;
    inProgress: number;
    planned: number;
    cancelled: number;
    hours: number;
    workDays: number;
    parcelsWorked: number;
    peopleCount: number;
    photos: number;
    byType: Array<{ key: string; label: string; count: number; hours: number }>;
    byParcel: Array<{ key: string; name: string; count: number; hours: number }>;
    byPerson: Array<{ key: string; name: string; count: number; hours: number }>;
    products: Array<{ name: string; typeLabel: string; unit: string; total: number; times: number; sinCantidad: number }>;
    tools: Array<{ name: string; count: number }>;
  };
  activities: ActivityLine[];
  ai: {
    resumen: string;
    porLabor: Array<{ labor: string; texto: string }>;
    insumos: string | null;
    pendientes: string | null;
    recomendaciones: string[];
  } | null;
}

// ── Utilidades de formato ─────────────────────────────────────

function fechaLarga(iso: string): string {
  if (!iso) return "—";
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fechaCorta(iso: string): string {
  if (!iso) return "—";
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

function num(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 1 });
}

// ── Piezas del documento ──────────────────────────────────────

function kpi(label: string, value: string, sub: string, color: string): string {
  return `<div class="metric-card ${color}">
    <div class="metric-label">${esc(label)}</div>
    <div class="metric-value">${esc(value)}</div>
    ${sub ? `<div class="metric-sub">${esc(sub)}</div>` : ""}
  </div>`;
}

function seccion(titulo: string): string {
  return `<div class="section-title">${esc(titulo)}</div>`;
}

/** Barras horizontales con el reparto de un total */
function barras(filas: Array<{ label: string; value: number; caption?: string }>, unidad: string): string {
  const max = Math.max(...filas.map((f) => f.value), 1);
  const cuerpo = filas
    .map(
      (f) => `<div class="bar-row">
        <div class="bar-label">${esc(f.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, Math.round((f.value / max) * 100))}%"></div></div>
        <div class="bar-val">${esc(f.caption ?? `${num(f.value)} ${unidad}`)}</div>
      </div>`
    )
    .join("");
  return `<div class="bar-block">${cuerpo}</div>`;
}

function bloqueIa(titulo: string, texto: string, subtitulo: string): string {
  return `<div class="ia-card">
    <div class="ia-card-bar"></div>
    <div class="ia-card-header">
      <span class="ia-title">${esc(titulo)}</span>
      <span class="ia-sub">${esc(subtitulo)}</span>
    </div>
    <div class="ia-card-body">${esc(texto)}</div>
  </div>`;
}

/**
 * "Juan, Pedro, María y 12 más". El campo de responsables trae la cuadrilla
 * completa —a veces quince nombres— y ponerla entera hacía que cada ficha
 * ocupara media hoja y el reporte fuera ilegible.
 */
function cuadrillaCorta(texto: string | null | undefined): string {
  const nombres = (texto ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  if (nombres.length === 0) return "sin asignar";
  if (nombres.length <= 3) return nombres.join(", ");
  return `${nombres.slice(0, 3).join(", ")} y ${nombres.length - 3} más`;
}

/** Ficha de una labor con todo su detalle */
function tarjetaActividad(a: ActivityLine): string {
  const clase =
    a.status === "completada" ? "" : a.status === "cancelada" ? "cancelada" : "pendiente";

  const rango =
    a.endDate && a.endDate !== a.date
      ? `${fechaCorta(a.date)} — ${fechaCorta(a.endDate)}`
      : fechaCorta(a.date);

  const insumos = a.products
    .map((p) => {
      const cantidad = p.quantity ? `${p.quantity}${p.unit ? ` ${p.unit}` : ""}` : "sin cantidad";
      const dosis = p.dosisPerHectare ? ` · dosis ${p.dosisPerHectare}` : "";
      const metodo = p.applicationMethod ? ` · ${p.applicationMethod}` : "";
      return `${esc(p.name)} (${esc(cantidad)}${esc(dosis)}${esc(metodo)})`;
    })
    .join(", ");



  const meta: string[] = [];
  meta.push(`<span><b>Responsable:</b> ${esc(cuadrillaCorta(a.performedBy))}</span>`);
  meta.push(
    `<span><b>Parcela:</b> ${esc(a.parcelNames.length ? a.parcelNames.join(", ") : "General (todas)")}</span>`
  );
  if (a.hours) meta.push(`<span><b>Tiempo:</b> ${num(a.hours)} h en ${a.days} día(s)</span>`);
  if (a.tools.length) meta.push(`<span><b>Equipo:</b> ${esc(a.tools.join(", "))}</span>`);
  if (a.weather) {
    meta.push(`<span><b>Clima:</b> ${esc(a.weather)}${a.temperature ? ` ${esc(a.temperature)}` : ""}</span>`);
  }
  if (a.photoCount > 0) meta.push(`<span><b>Fotos:</b> ${a.photoCount}</span>`);

  const etiquetaEstado =
    a.status === "completada" ? "ok" : a.status === "cancelada" ? "neutral" : "warn";

  return `<div class="activity-card ${clase}">
    <div class="ac-head">
      <div class="ac-title">${esc(a.typeLabel)}${a.subtype ? ` <span class="ac-sub">${esc(a.subtype)}</span>` : ""}</div>
      <div class="ac-date">${esc(rango)} &nbsp; <span class="tag ${etiquetaEstado}">${esc(a.statusLabel)}</span></div>
    </div>
    ${a.description ? `<div class="ac-desc">${esc(a.description)}</div>` : ""}
    ${insumos ? `<div class="ac-desc"><b>Insumos:</b> ${insumos}</div>` : ""}
    <div class="ac-meta">${meta.join("")}</div>
  </div>`;
}

/**
 * Alto aproximado de una ficha, en píxeles.
 * No se puede medir el alto real antes de imprimir, así que se estima con
 * holgura para repartir las labores entre hojas sin que queden cortadas.
 */
function altoTarjeta(a: ActivityLine): number {
  let alto = 24 + 30; // renglón de título + margen, relleno y borde
  if (a.description) alto += Math.max(1, Math.ceil(a.description.length / 118)) * 14;
  if (a.products.length) {
    const largo = a.products.reduce((s, p) => s + p.name.length + 34, 0);
    alto += Math.max(1, Math.ceil(largo / 118)) * 14;
  }
  // Renglón de datos: responsable, parcela, tiempo, equipo, clima, fotos
  const datos = 2 + (a.hours ? 1 : 0) + (a.tools.length ? 1 : 0) + (a.weather ? 1 : 0) + (a.photoCount > 0 ? 1 : 0);
  alto += 10 + Math.ceil(datos / 3) * 13;
  return alto;
}

// ── Maquetación por bloques ───────────────────────────────────
//
// El reporte no puede repartirse "a ojo": la primera versión metía en la
// portada las cifras, el resumen, dos gráficas y la tabla de gente, y con una
// cuadrilla grande eso se pasaba de la hoja —el pie de página terminaba
// impreso arriba de la hoja siguiente y la numeración dejaba de cuadrar—.
//
// Ahora cada pieza declara cuánto ocupa y se van acomodando en las hojas hasta
// llenarlas. Las medidas son estimaciones en píxeles, deliberadamente
// generosas: es preferible que sobre blanco al pie de una hoja a que el
// contenido se derrame.

interface Bloque {
  html: string;
  alto: number;
  /** Título del encabezado corrido cuando el bloque abre una hoja */
  grupo: string;
}

/** Alto aproximado de un texto corrido, en píxeles */
function altoTexto(texto: string, porRenglon = 112, alturaRenglon = 15.5): number {
  const renglones = Math.max(1, Math.ceil(texto.length / porRenglon));
  return renglones * alturaRenglon;
}

const ALTO_TITULO = 36;
const ALTO_NOTA = 24;

/** Espacio útil de la portada: descuenta encabezado, banda, cifras y pie */
const ALTO_UTIL_PORTADA = 675;
/** Espacio útil de las hojas siguientes: descuenta encabezado corrido y pie */
const ALTO_UTIL_HOJA = 875;

export interface ActivityDocOptions {
  scopeLabel: string;
  logo: string | null;
  generatedAt?: Date;
}

export function buildActivityReportHtml(data: ActivityReportData, opts: ActivityDocOptions): string {
  const { summary, ai, activities } = data;
  const generado = opts.generatedAt || new Date();
  const periodo = `${fechaLarga(data.period.from)} — ${fechaLarga(data.period.to)}`;

  // ── Las piezas del reporte, cada una con lo que ocupa ──
  const bloques: Bloque[] = [];
  const agregar = (grupo: string, html: string, alto: number) => bloques.push({ grupo, html, alto });

  // Resumen ejecutivo
  if (ai?.resumen) {
    agregar(
      "Panorama del periodo",
      seccion("Resumen ejecutivo") +
        bloqueIa("Análisis Agra Tec-Ti", ai.resumen, "redactado con IA sobre el registro del periodo"),
      ALTO_TITULO + 47 + altoTexto(ai.resumen, 104)
    );
  } else {
    const texto = `Se registraron ${summary.total} labores en el periodo, ${summary.completed} de ellas completadas, con ${num(summary.hours)} horas de trabajo repartidas en ${summary.parcelsWorked} parcela(s).`;
    agregar(
      "Panorama del periodo",
      seccion("Resumen del periodo") + `<div class="prose"><p>${esc(texto)}</p></div>`,
      ALTO_TITULO + altoTexto(texto)
    );
  }

  // La barra mide horas cuando las hay: es lo que de verdad distingue una labor
  // de otra. Contando veces, cinco labores hechas una vez cada una dan cinco
  // barras iguales que no dicen nada.
  const hayHoras = summary.hours > 0;

  /** Ordena por la misma magnitud que dibuja la barra, si no se ve revuelta */
  const porValor = <T extends { count: number; hours: number }>(filas: T[]): T[] =>
    [...filas].sort((a, b) => (hayHoras ? b.hours - a.hours : b.count - a.count));

  if (summary.byType.length > 0) {
    agregar(
      "Panorama del periodo",
      seccion("Labores por tipo") +
        `<div class="section-note">Cuántas veces se hizo cada labor y cuánto tiempo se le dedicó.</div>` +
        barras(
          porValor(summary.byType).map((t) => ({
            label: t.label,
            value: hayHoras ? t.hours : t.count,
            caption: `${t.count === 1 ? "1 vez" : `${t.count} veces`} · ${num(t.hours)} h`,
          })),
          "veces"
        ),
      ALTO_TITULO + ALTO_NOTA + 34 + summary.byType.length * 16
    );
  }

  if (summary.byParcel.length > 0) {
    const filas = porValor(summary.byParcel).slice(0, 12);
    agregar(
      "Panorama del periodo",
      seccion("Dónde se trabajó") +
        barras(
          filas.map((p) => ({
            label: p.name,
            value: hayHoras ? p.hours : p.count,
            caption: `${p.count === 1 ? "1 labor" : `${p.count} labores`} · ${num(p.hours)} h`,
          })),
          "labores"
        ) +
        (summary.byParcel.length > filas.length
          ? `<div class="fine-print">Y ${summary.byParcel.length - filas.length} parcela(s) más con una labor cada una.</div>`
          : ""),
      ALTO_TITULO + 34 + filas.length * 16 + (summary.byParcel.length > filas.length ? 26 : 0)
    );
  }

  if (summary.byPerson.length > 0) {
    const filas = summary.byPerson.slice(0, 20);
    agregar(
      "Quién trabajó",
      seccion("Quién trabajó") +
        `<div class="section-note">Personas que participaron. Las horas de una labor se reparten entre quienes la hicieron, para que la suma siga siendo el tiempo real de la operación.</div>` +
        `<div class="glass-table-container"><table>
          <thead><tr><th>Persona</th><th class="text-right">Labores</th><th class="text-right">Horas</th></tr></thead>
          <tbody>${filas
            .map(
              (p) =>
                `<tr><td class="parcel-name">${esc(p.name)}</td><td class="text-right">${p.count}</td><td class="text-right">${num(p.hours)}</td></tr>`
            )
            .join("")}</tbody>
        </table></div>` +
        (summary.byPerson.length > filas.length
          ? `<div class="fine-print">Y ${summary.byPerson.length - filas.length} persona(s) más con menos labores en el periodo.</div>`
          : ""),
      ALTO_TITULO + ALTO_NOTA + 38 + filas.length * 21 + (summary.byPerson.length > filas.length ? 26 : 0)
    );
  }

  // Insumos
  if (summary.products.length > 0) {
    agregar(
      "Insumos y equipo",
      seccion("Insumos aplicados") +
        `<div class="section-note">Suma de lo aplicado en el periodo. Las cantidades solo se suman entre sí cuando comparten unidad.</div>` +
        `<div class="glass-table-container"><table>
          <thead><tr><th>Producto</th><th>Tipo</th><th class="text-right">Cantidad total</th><th class="text-right">Aplicaciones</th></tr></thead>
          <tbody>${summary.products
            .map(
              (p) => `<tr>
                <td class="parcel-name">${esc(p.name)}</td>
                <td class="muted">${esc(p.typeLabel)}</td>
                <td class="text-right">${p.total > 0 ? `${num(p.total)} ${esc(p.unit)}` : "—"}${p.sinCantidad > 0 ? ` <span class="muted">(${p.sinCantidad} sin registrar)</span>` : ""}</td>
                <td class="text-right">${p.times}</td>
              </tr>`
            )
            .join("")}</tbody>
        </table></div>`,
      ALTO_TITULO + ALTO_NOTA + 38 + summary.products.length * 22
    );
  } else {
    agregar(
      "Insumos y equipo",
      seccion("Insumos aplicados") +
        `<div class="prose"><p>No se registró ningún producto aplicado en las labores de este periodo. Sin ese registro no se puede calcular dosis por hectárea ni consumo del almacén.</p></div>`,
      ALTO_TITULO + 40
    );
  }

  if (ai?.insumos) {
    agregar(
      "Insumos y equipo",
      bloqueIa("Lectura de los insumos", ai.insumos, "análisis con IA"),
      47 + altoTexto(ai.insumos, 104)
    );
  }

  if (summary.tools.length > 0) {
    agregar(
      "Insumos y equipo",
      seccion("Equipo utilizado") +
        `<div class="cat-pills">${summary.tools
          .map((t) => `<div class="cat-pill"><span class="cp-count">${t.count}</span><span class="cp-label">${esc(t.name)}</span></div>`)
          .join("")}</div>`,
      ALTO_TITULO + Math.ceil(summary.tools.length / 4) * 28 + 10
    );
  }

  if (ai && ai.porLabor.length > 0) {
    const texto = ai.porLabor.map((l) => `${l.labor}. ${l.texto}`).join(" ");
    agregar(
      "Cómo se ejecutó cada labor",
      seccion("Cómo se ejecutó cada labor") +
        `<div class="prose">${ai.porLabor
          .map((l) => `<p><strong>${esc(l.labor)}.</strong> ${esc(l.texto)}</p>`)
          .join("")}</div>`,
      ALTO_TITULO + altoTexto(texto) + ai.porLabor.length * 8
    );
  }

  const pendientes = ai?.pendientes
    ?? (summary.inProgress + summary.planned > 0
      ? `${summary.inProgress} labor(es) en proceso y ${summary.planned} planificada(s) sin cerrar al final del periodo.`
      : null);
  if (pendientes) {
    agregar(
      "Pendientes y recomendaciones",
      seccion("Pendientes") + `<div class="sla-alert">${esc(pendientes)}</div>`,
      ALTO_TITULO + altoTexto(pendientes, 118) + 22
    );
  }

  if (ai && ai.recomendaciones.length > 0) {
    agregar(
      "Pendientes y recomendaciones",
      seccion("Recomendaciones") +
        `<ul class="check-list">${ai.recomendaciones.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`,
      ALTO_TITULO + ai.recomendaciones.reduce((s, r) => s + altoTexto(r, 108) + 12, 0)
    );
  }

  // Detalle de cada labor
  if (activities.length === 0) {
    agregar(
      "Detalle de labores",
      seccion("Detalle de labores") +
        `<div class="prose"><p>No se registraron actividades de campo en este periodo.</p></div>`,
      ALTO_TITULO + 40
    );
  } else {
    agregar(
      "Detalle de labores",
      seccion("Detalle de labores") +
        `<div class="section-note">Cada labor con su registro completo: descripción, insumos, equipo, responsable y tiempo.</div>`,
      ALTO_TITULO + ALTO_NOTA
    );
    for (const a of activities) {
      agregar("Detalle de labores", tarjetaActividad(a), altoTarjeta(a));
    }
  }

  const nota = `Este reporte se arma con lo capturado en la libreta de campo durante el periodo. Las labores sin parcela asignada se consideran generales. Las horas salen de las jornadas registradas; una labor sin jornada capturada aparece sin tiempo.${ai ? " El texto de análisis fue redactado con inteligencia artificial a partir de ese mismo registro: valídelo con su ingeniero agrónomo antes de aplicar productos o dosis." : ""}`;
  agregar("Detalle de labores", `<div class="fine-print">${esc(nota)}</div>`, altoTexto(nota, 150, 13) + 14);

  // ── Reparto en hojas ──
  const hojas: Bloque[][] = [];
  let actual: Bloque[] = [];
  let alto = 0;
  let capacidad = ALTO_UTIL_PORTADA;

  for (const bloque of bloques) {
    // Un bloque más alto que la hoja no se puede partir: se le da una hoja
    // propia y se deja que se derrame, antes que perderlo
    if (actual.length > 0 && alto + bloque.alto > capacidad) {
      hojas.push(actual);
      actual = [];
      alto = 0;
      capacidad = ALTO_UTIL_HOJA;
    }
    actual.push(bloque);
    alto += bloque.alto;
  }
  if (actual.length > 0) hojas.push(actual);
  if (hojas.length === 0) hojas.push([]);

  const totalPaginas = hojas.length;
  let numeroPagina = 0;

  // Cierra el contenido, pone el pie y cierra la página. El orden importa: si
  // el pie queda dentro de .main-content, las páginas se anidan una dentro de
  // otra y la impresión sale corrida.
  const pie = () => {
    numeroPagina++;
    return `</div>
    <div class="page-footer">
      <div class="footer-brand">${opts.logo ? `<img src="${opts.logo}" alt="" />` : ""}AGRA TEC-TI — agra-tecti.com</div>
      <div class="footer-center">Reporte de Actividades — Confidencial</div>
      <div class="page-pill">Página ${numeroPagina} de ${totalPaginas}</div>
    </div>
  </div>`;
  };

  let html = "";

  hojas.forEach((hoja, indice) => {
    if (indice === 0) {
      // ── Portada ──
      html += `<div class="page"><div class="main-content">`;
      html += `<div class="header">
        <div class="brand">
          ${opts.logo ? `<img src="${opts.logo}" alt="Agra Tec-Ti" />` : ""}
          <div class="brand-text">
            <h1>REPORTE DE ACTIVIDADES DE CAMPO</h1>
            <span>Libreta de campo · Insumos · Inteligencia artificial</span>
          </div>
        </div>
        <div class="header-right">
          <div class="report-type">Emitido</div>
          <div class="report-name">${esc(
            generado.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
          )}</div>
        </div>
      </div>`;
      html += `<div class="date-banner">
        <div class="period">${esc(opts.scopeLabel)} &nbsp;·&nbsp; ${esc(periodo)}</div>
        <div class="badge">${summary.total === 1 ? "1 labor" : `${summary.total} labores`}</div>
      </div>`;
      html += `<div class="metrics-grid">`;
      html += kpi("Labores", String(summary.total), "en el periodo", "green");
      html += kpi("Completadas", String(summary.completed), `${summary.inProgress + summary.planned} sin cerrar`, summary.completed === summary.total ? "green" : "amber");
      html += kpi("Horas", num(summary.hours), `${summary.workDays} jornada(s)`, "purple");
      html += kpi("Parcelas", String(summary.parcelsWorked), "atendidas", "blue");
      html += kpi("Personas", String(summary.peopleCount), "participaron", "cyan");
      html += kpi("Insumos", String(summary.products.length), "productos usados", "green");
      html += `</div>`;
    } else {
      // ── Hojas siguientes: encabezado corrido con el tema que abre la hoja ──
      const titulo = hoja[0]?.grupo || "Reporte de actividades";
      html += `<div class="page">
        <div class="sub-header">
          <h2>${opts.logo ? `<img src="${opts.logo}" alt="" />` : ""}${esc(titulo)}</h2>
          <span class="sh-info">${esc(opts.scopeLabel)} · ${esc(periodo)}</span>
        </div>
        <div class="main-content">`;
    }

    html += hoja.map((b) => b.html).join("");
    html += pie();
  });

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte de Actividades — ${esc(opts.scopeLabel)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>${getReportCss()}</style>
</head>
<body>
${printHintHtml()}
${html}
</body>
</html>`;
}
