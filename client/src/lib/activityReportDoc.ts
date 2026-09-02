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
  meta.push(`<span><b>Responsable:</b> ${esc(a.performedBy || "sin asignar")}</span>`);
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
 * Cuánto ocupa una tarjeta, en "renglones" aproximados.
 * No hay forma de medir el alto real antes de imprimir, así que se estima para
 * repartir las labores entre páginas sin que queden cortadas.
 */
function pesoTarjeta(a: ActivityLine): number {
  let peso = 3; // encabezado + meta
  if (a.description) peso += Math.ceil(a.description.length / 110);
  if (a.products.length) peso += Math.ceil((a.products.length * 45) / 110) + 1;
  return peso;
}

// ── Documento ─────────────────────────────────────────────────

export interface ActivityDocOptions {
  scopeLabel: string;
  logo: string | null;
  generatedAt?: Date;
}

export function buildActivityReportHtml(data: ActivityReportData, opts: ActivityDocOptions): string {
  const { summary, ai, activities } = data;
  const generado = opts.generatedAt || new Date();
  const periodo = `${fechaLarga(data.period.from)} — ${fechaLarga(data.period.to)}`;

  // ── Reparto de las labores por página ──
  // Estimación deliberadamente conservadora: es preferible que sobre espacio
  // en la hoja a que una labor se derrame y empuje la maquetación
  const PESO_MAX = 22;
  const paginasDetalle: ActivityLine[][] = [];
  let actual: ActivityLine[] = [];
  let peso = 0;
  for (const a of activities) {
    const p = pesoTarjeta(a);
    if (actual.length > 0 && peso + p > PESO_MAX) {
      paginasDetalle.push(actual);
      actual = [];
      peso = 0;
    }
    actual.push(a);
    peso += p;
  }
  if (actual.length > 0) paginasDetalle.push(actual);

  const hayPaginaInsumos = summary.products.length > 0 || summary.tools.length > 0 || !!ai?.insumos;
  // Sin labores igual se imprime una página de detalle que lo dice
  const paginasDeDetalle = paginasDetalle.length || 1;
  const totalPaginas = 1 + (hayPaginaInsumos ? 1 : 0) + paginasDeDetalle;

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

  const encabezadoCorrido = (titulo: string) => `<div class="page">
    <div class="sub-header">
      <h2>${opts.logo ? `<img src="${opts.logo}" alt="" />` : ""}${esc(titulo)}</h2>
      <span class="sh-info">${esc(opts.scopeLabel)} · ${esc(periodo)}</span>
    </div>
    <div class="main-content">`;

  let html = "";

  // ══════════════ PÁGINA 1 — PANORAMA ══════════════
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
    <div class="badge">${summary.total} labor${summary.total === 1 ? "" : "es"}</div>
  </div>`;

  html += `<div class="metrics-grid">`;
  html += kpi("Labores", String(summary.total), "en el periodo", "green");
  html += kpi("Completadas", String(summary.completed), `${summary.inProgress + summary.planned} sin cerrar`, summary.completed === summary.total ? "green" : "amber");
  html += kpi("Horas", num(summary.hours), `${summary.workDays} jornada(s)`, "purple");
  html += kpi("Parcelas", String(summary.parcelsWorked), "atendidas", "blue");
  html += kpi("Personas", String(summary.peopleCount), "participaron", "cyan");
  html += kpi("Insumos", String(summary.products.length), "productos usados", "green");
  html += `</div>`;

  if (ai?.resumen) {
    html += seccion("Resumen ejecutivo");
    html += bloqueIa("Análisis Agra Tec-Ti", ai.resumen, "redactado con IA sobre el registro del periodo");
  } else {
    html += seccion("Resumen del periodo");
    html += `<div class="prose"><p>Se registraron ${summary.total} labores en el periodo, ${summary.completed} de ellas completadas, con ${num(summary.hours)} horas de trabajo repartidas en ${summary.parcelsWorked} parcela(s).</p></div>`;
  }

  // La barra mide horas cuando las hay: es lo que de verdad distingue una labor
  // de otra. Contando veces, cinco labores hechas una vez cada una dan cinco
  // barras iguales que no dicen nada.
  const hayHoras = summary.hours > 0;

  if (summary.byType.length > 0) {
    html += seccion("Labores por tipo");
    html += `<div class="section-note">Cuántas veces se hizo cada labor y cuánto tiempo se le dedicó.</div>`;
    html += barras(
      summary.byType.map((t) => ({
        label: t.label,
        value: hayHoras ? t.hours : t.count,
        caption: `${t.count} vez${t.count === 1 ? "" : "ces"} · ${num(t.hours)} h`,
      })),
      "veces"
    );
  }

  if (summary.byParcel.length > 0) {
    html += seccion("Dónde se trabajó");
    html += barras(
      summary.byParcel.slice(0, 12).map((p) => ({
        label: p.name,
        value: hayHoras ? p.hours : p.count,
        caption: `${p.count} labor${p.count === 1 ? "" : "es"} · ${num(p.hours)} h`,
      })),
      "labores"
    );
  }

  if (summary.byPerson.length > 0) {
    html += seccion("Quién trabajó");
    html += `<div class="glass-table-container"><table>
      <thead><tr><th>Responsable</th><th class="text-right">Labores</th><th class="text-right">Horas</th></tr></thead>
      <tbody>${summary.byPerson
        .map(
          (p) =>
            `<tr><td class="parcel-name">${esc(p.name)}</td><td class="text-right">${p.count}</td><td class="text-right">${num(p.hours)}</td></tr>`
        )
        .join("")}</tbody>
    </table></div>`;
  }

  html += pie();

  // ══════════════ PÁGINA 2 — INSUMOS Y CIERRE ══════════════
  if (hayPaginaInsumos) {
    html += encabezadoCorrido("Insumos, equipo y pendientes");

    if (summary.products.length > 0) {
      html += seccion("Insumos aplicados");
      html += `<div class="section-note">Suma de lo aplicado en el periodo. Las cantidades solo se suman entre sí cuando comparten unidad.</div>`;
      html += `<div class="glass-table-container"><table>
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
      </table></div>`;
    }

    if (ai?.insumos) {
      html += bloqueIa("Lectura de los insumos", ai.insumos, "análisis con IA");
    }

    if (summary.tools.length > 0) {
      html += seccion("Equipo utilizado");
      html += `<div class="cat-pills">${summary.tools
        .map((t) => `<div class="cat-pill"><span class="cp-count">${t.count}</span><span class="cp-label">${esc(t.name)}</span></div>`)
        .join("")}</div>`;
    }

    if (ai && ai.porLabor.length > 0) {
      html += seccion("Cómo se ejecutó cada labor");
      html += `<div class="prose">${ai.porLabor
        .map((l) => `<p><strong>${esc(l.labor)}.</strong> ${esc(l.texto)}</p>`)
        .join("")}</div>`;
    }

    if (ai?.pendientes) {
      html += seccion("Pendientes");
      html += `<div class="sla-alert">${esc(ai.pendientes)}</div>`;
    } else if (summary.inProgress + summary.planned > 0) {
      html += seccion("Pendientes");
      html += `<div class="sla-alert">${summary.inProgress} labor(es) en proceso y ${summary.planned} planificada(s) sin cerrar al final del periodo.</div>`;
    }

    if (ai && ai.recomendaciones.length > 0) {
      html += seccion("Recomendaciones");
      html += `<ul class="check-list">${ai.recomendaciones.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`;
    }

    html += `<div class="fine-print">
      Este reporte se arma con lo capturado en la libreta de campo durante el periodo. Las labores sin
      parcela asignada se consideran generales y aplican a toda la operación. Las horas salen de las
      jornadas registradas; una labor sin jornada capturada aparece sin tiempo.
      ${ai ? " El texto de análisis fue redactado con inteligencia artificial a partir de ese mismo registro: valídelo con su ingeniero agrónomo antes de tomar decisiones de aplicación." : ""}
    </div>`;

    html += pie();
  }

  // ══════════════ PÁGINAS DE DETALLE ══════════════
  paginasDetalle.forEach((grupo, i) => {
    html += encabezadoCorrido(
      paginasDetalle.length > 1
        ? `Detalle de labores (${i + 1}/${paginasDetalle.length})`
        : "Detalle de labores"
    );
    if (i === 0) {
      html += `<div class="section-note">Cada labor con su registro completo: descripción, insumos, equipo, responsable y tiempo.</div>`;
    }
    html += grupo.map(tarjetaActividad).join("");
    html += pie();
  });

  // Sin actividades: una sola página lo dice y ya
  if (activities.length === 0) {
    html += encabezadoCorrido("Detalle de labores");
    html += `<div class="prose"><p>No se registraron actividades de campo en este periodo.</p></div>`;
    html += pie();
  }

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
