/**
 * Tema de los reportes en PDF.
 *
 * El diseño anterior era "glassmorphism": fondos translúcidos, manchas
 * difuminadas y tipografía de 7 px. En pantalla pasaba, pero impreso se veía
 * sucio —el desenfoque se rasteriza, los degradados se bandean y el texto de
 * 7 px es ilegible en papel—. Este tema está pensado al revés: primero el
 * papel. Fondo blanco, un solo verde institucional, reglas finas, jerarquía
 * por tamaño y espaciado, y tipografía que se puede leer sin acercar la hoja.
 *
 * Los nombres de clase son los mismos de siempre, así que los reportes que ya
 * existían se ven distintos sin tocar el código que arma su HTML.
 */

export const REPORT_COLORS = {
  verde: "#0f5132",
  verdeMedio: "#198754",
  verdeClaro: "#d1e7dd",
  tinta: "#1f2937",
  gris: "#6b7280",
  grisClaro: "#9ca3af",
  borde: "#e5e7eb",
  bordeFuerte: "#cbd5e1",
  fondoSuave: "#f8fafc",
  ambar: "#b45309",
  rojo: "#b91c1c",
  azul: "#1d4ed8",
};

export function getReportCss(): string {
  return `
    :root {
      --verde: ${REPORT_COLORS.verde};
      --verde-medio: ${REPORT_COLORS.verdeMedio};
      --verde-claro: ${REPORT_COLORS.verdeClaro};
      --tinta: ${REPORT_COLORS.tinta};
      --gris: ${REPORT_COLORS.gris};
      --gris-claro: ${REPORT_COLORS.grisClaro};
      --borde: ${REPORT_COLORS.borde};
      --borde-fuerte: ${REPORT_COLORS.bordeFuerte};
      --fondo-suave: ${REPORT_COLORS.fondoSuave};
      --ambar: ${REPORT_COLORS.ambar};
      --rojo: ${REPORT_COLORS.rojo};
      /* Nombres viejos, por si queda HTML que los use */
      --primary: ${REPORT_COLORS.verde};
      --primary-light: ${REPORT_COLORS.verdeMedio};
      --accent: #0891b2;
      --text-dark: ${REPORT_COLORS.tinta};
      --text-muted: ${REPORT_COLORS.gris};
    }

    @page { size: letter; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #eef2f6;
      color: var(--tinta);
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      -webkit-font-smoothing: antialiased;
    }

    .page {
      width: 8.5in; min-height: 11in;
      background: #ffffff;
      margin: 0 auto;
      position: relative;
      display: flex; flex-direction: column;
      page-break-after: always;
    }
    .page:last-child { page-break-after: auto; }

    /* Las manchas difuminadas del diseño anterior: fuera del papel */
    .glass-bg, .blob, .liquid-line { display: none !important; }

    .main-content { flex: 1; padding: 20px 46px 14px 46px; position: relative; z-index: 1; }

    /* ── Encabezado de portada ─────────────────────────────── */
    .header {
      display: flex; align-items: flex-end; justify-content: space-between;
      padding-bottom: 12px; margin-bottom: 16px;
      border-bottom: 2.5px solid var(--verde);
    }
    .brand { display: flex; align-items: center; gap: 11px; }
    .brand img { height: 40px; width: 40px; border-radius: 8px; object-fit: contain; }
    .brand-text h1 {
      font-size: 19px; font-weight: 800; color: var(--verde);
      letter-spacing: -0.2px; line-height: 1.1;
    }
    .brand-text span {
      display: block; margin-top: 3px;
      font-size: 7px; font-weight: 600; color: var(--verde-medio);
      text-transform: uppercase; letter-spacing: 2.4px;
    }
    .header-right { text-align: right; }
    .header-right .report-type {
      font-size: 8px; font-weight: 700; color: var(--gris);
      text-transform: uppercase; letter-spacing: 1.6px;
    }
    .header-right .report-name {
      font-size: 13px; font-weight: 700; color: var(--tinta); margin-top: 3px;
    }

    /* ── Encabezado corrido de las páginas siguientes ──────── */
    .sub-header {
      background: var(--verde);
      padding: 11px 46px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .sub-header h2 {
      color: #ffffff; font-size: 12.5px; font-weight: 700;
      display: flex; align-items: center; gap: 8px; letter-spacing: 0.2px;
    }
    .sub-header h2 img { height: 18px; width: 18px; border-radius: 4px; }
    .sub-header .sh-info { font-size: 8.5px; color: #a7d8c0; letter-spacing: 0.4px; }
    .sub-header + .main-content { padding-top: 18px; }

    /* ── Banda de periodo ──────────────────────────────────── */
    .date-banner {
      background: var(--fondo-suave);
      border-left: 3px solid var(--verde-medio);
      padding: 9px 14px; margin-bottom: 14px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .date-banner .period {
      font-size: 10.5px; font-weight: 600; color: var(--tinta);
      display: flex; align-items: center; gap: 7px;
    }
    .date-banner .badge {
      background: var(--verde); color: #ffffff;
      padding: 3px 11px; border-radius: 3px;
      font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px;
    }
    .date-banner svg { width: 14px; height: 14px; color: var(--verde-medio); }

    /* ── Tarjetas de cifras ────────────────────────────────── */
    .metrics-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
      gap: 8px; margin-bottom: 14px;
    }
    .metric-card {
      border: 1px solid var(--borde); border-top: 2.5px solid var(--gris-claro);
      border-radius: 4px; padding: 9px 11px; background: #ffffff;
    }
    .metric-card.green  { border-top-color: ${REPORT_COLORS.verdeMedio}; }
    .metric-card.blue   { border-top-color: ${REPORT_COLORS.azul}; }
    .metric-card.cyan   { border-top-color: #0891b2; }
    .metric-card.amber  { border-top-color: ${REPORT_COLORS.ambar}; }
    .metric-card.purple { border-top-color: #6d28d9; }
    .metric-card.red    { border-top-color: ${REPORT_COLORS.rojo}; }
    .metric-label {
      font-size: 7.5px; font-weight: 700; color: var(--gris);
      text-transform: uppercase; letter-spacing: 1px; margin-bottom: 3px;
    }
    .metric-value { font-size: 19px; font-weight: 800; color: var(--verde); line-height: 1.05; }
    .metric-sub { font-size: 7.5px; color: var(--gris); margin-top: 2px; }

    /* ── Títulos de sección ────────────────────────────────── */
    .section-title {
      font-size: 10.5px; font-weight: 800; color: var(--verde);
      text-transform: uppercase; letter-spacing: 1.3px;
      margin: 16px 0 7px; padding-bottom: 5px;
      border-bottom: 1.5px solid var(--verde-claro);
      display: flex; align-items: center; gap: 7px;
    }
    .section-title:first-child { margin-top: 0; }
    .section-title svg { width: 12px; height: 12px; color: var(--verde-medio); }
    .section-note {
      font-size: 8px; color: var(--gris); margin: -3px 0 8px; line-height: 1.5;
    }

    /* ── Tablas ────────────────────────────────────────────── */
    .glass-table-container {
      border: 1px solid var(--borde); border-radius: 4px;
      overflow: hidden; margin-bottom: 12px; background: #ffffff;
    }
    table { width: 100%; border-collapse: collapse; font-size: 8.5px; }
    thead tr { background: var(--verde); }
    thead th {
      color: #ffffff; padding: 7px 9px; text-align: left;
      font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
    }
    thead th.text-right { text-align: right; }
    tbody tr { border-bottom: 1px solid var(--borde); }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:nth-child(even) { background: var(--fondo-suave); }
    tbody tr.risk-row { background: #fef2f2 !important; }
    tbody tr.risk-row td:first-child { box-shadow: inset 2px 0 0 ${REPORT_COLORS.rojo}; }
    tbody td { padding: 6px 9px; color: var(--tinta); vertical-align: top; line-height: 1.45; }
    tbody td.text-right { text-align: right; }
    tbody td.font-bold { font-weight: 700; }
    tbody td.parcel-name { font-weight: 600; color: var(--verde); }
    tbody td.muted { color: var(--gris); }
    tfoot tr { background: var(--verde-claro); }
    tfoot td { padding: 7px 9px; font-weight: 700; font-size: 8.5px; color: var(--verde); }
    tfoot td.text-right { text-align: right; }

    /* ── Etiquetas ─────────────────────────────────────────── */
    .ndvi-badge, .tag {
      display: inline-block; padding: 2px 7px; border-radius: 3px;
      font-size: 7.5px; font-weight: 700; letter-spacing: 0.3px;
    }
    .ndvi-badge.healthy, .tag.ok { background: #d1e7dd; color: #0f5132; }
    .ndvi-badge.moderate, .tag.warn { background: #fef3c7; color: #92400e; }
    .ndvi-badge.critical, .tag.bad { background: #fee2e2; color: #991b1b; }
    .tag.info { background: #dbeafe; color: #1e40af; }
    .tag.neutral { background: #f1f5f9; color: #475569; }

    /* ── Aviso de riesgo ───────────────────────────────────── */
    .risk-alert {
      background: #fef2f2; border: 1px solid #fecaca; border-left: 3px solid ${REPORT_COLORS.rojo};
      border-radius: 4px; padding: 9px 13px; margin-bottom: 10px;
      display: flex; align-items: center; gap: 10px;
    }
    .risk-icon {
      width: 22px; height: 22px; background: ${REPORT_COLORS.rojo}; border-radius: 4px;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .risk-icon svg { width: 12px; height: 12px; color: #ffffff; }
    .risk-text strong { font-size: 9.5px; color: #991b1b; display: block; }
    .risk-text span { font-size: 8.5px; color: #b91c1c; }
    .sla-alert {
      background: #fef2f2; border-left: 3px solid ${REPORT_COLORS.rojo};
      padding: 8px 13px; font-size: 8.5px; font-weight: 600; color: #991b1b; margin-bottom: 10px;
    }

    /* ── Clima ─────────────────────────────────────────────── */
    .climate-strip { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .climate-item {
      flex: 1; min-width: 96px; border: 1px solid var(--borde); border-radius: 4px;
      padding: 8px 11px; display: flex; align-items: center; gap: 8px; background: #ffffff;
    }
    .climate-item svg { width: 15px; height: 15px; flex-shrink: 0; }
    .climate-item .cl-label {
      font-size: 7.5px; color: var(--gris); text-transform: uppercase; letter-spacing: 0.8px;
    }
    .climate-item .cl-value { font-size: 13px; font-weight: 700; }
    .cl-temp-max { color: #b91c1c; }
    .cl-temp-min { color: #1d4ed8; }
    .cl-rain { color: #0e7490; }
    .cl-days { color: var(--verde-medio); }
    .climate-vertical { border: 1px solid var(--borde); border-radius: 4px; padding: 10px 13px; }
    .climate-v-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 5px 0; border-bottom: 1px solid var(--borde); font-size: 9px;
    }
    .climate-v-item:last-child { border-bottom: none; }

    /* ── Bloque de análisis con IA ─────────────────────────── */
    .ia-card {
      border: 1px solid var(--borde); border-radius: 4px;
      overflow: hidden; margin-bottom: 12px; background: #ffffff;
      break-inside: avoid;
    }
    .ia-card-bar { height: 2.5px; background: var(--verde-medio); }
    .ia-card-header {
      display: flex; align-items: center; gap: 7px;
      padding: 9px 14px 0 14px;
    }
    .ia-card-header svg { width: 14px; height: 14px; color: var(--verde-medio); }
    .ia-card-header .ia-title {
      font-size: 9.5px; font-weight: 800; color: var(--verde);
      text-transform: uppercase; letter-spacing: 1.1px;
    }
    .ia-card-header .ia-sub { font-size: 8px; color: var(--gris); margin-left: 4px; }
    .ia-card-body {
      padding: 7px 14px 13px 14px;
      font-size: 9.5px; line-height: 1.62; color: var(--tinta);
      white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word;
      text-align: justify;
    }

    /* Párrafos de cuerpo, para texto redactado */
    .prose { font-size: 9.5px; line-height: 1.62; color: var(--tinta); text-align: justify; }
    .prose p { margin-bottom: 7px; }
    .prose p:last-child { margin-bottom: 0; }
    .prose strong { font-weight: 700; color: var(--verde); }

    /* Listas de recomendaciones */
    .check-list { list-style: none; margin-bottom: 12px; }
    .check-list li {
      position: relative; padding: 5px 0 5px 20px;
      font-size: 9.5px; line-height: 1.55; color: var(--tinta);
      border-bottom: 1px solid var(--borde);
    }
    .check-list li:last-child { border-bottom: none; }
    .check-list li::before {
      content: ''; position: absolute; left: 4px; top: 11px;
      width: 6px; height: 6px; border-radius: 50%; background: var(--verde-medio);
    }

    /* Ficha de dos columnas (etiqueta / valor) */
    .fact-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 0;
      border: 1px solid var(--borde); border-radius: 4px; overflow: hidden; margin-bottom: 12px;
    }
    .fact {
      padding: 8px 11px; border-right: 1px solid var(--borde); border-bottom: 1px solid var(--borde);
    }
    .fact .fact-label {
      font-size: 7px; font-weight: 700; color: var(--gris);
      text-transform: uppercase; letter-spacing: 0.9px; margin-bottom: 3px;
    }
    .fact .fact-value { font-size: 10px; font-weight: 600; color: var(--tinta); line-height: 1.35; }

    /* Tarjeta de una labor, para el detalle largo */
    .activity-card {
      border: 1px solid var(--borde); border-left: 3px solid var(--verde-medio);
      border-radius: 4px; padding: 10px 13px; margin-bottom: 9px;
      break-inside: avoid; page-break-inside: avoid;
    }
    .activity-card.pendiente { border-left-color: ${REPORT_COLORS.ambar}; }
    .activity-card.cancelada { border-left-color: ${REPORT_COLORS.grisClaro}; }
    .activity-card .ac-head {
      display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 4px;
    }
    .activity-card .ac-title { font-size: 10.5px; font-weight: 700; color: var(--verde); }
    .activity-card .ac-sub { font-size: 8px; color: var(--gris); font-weight: 400; }
    .activity-card .ac-date { font-size: 8.5px; color: var(--gris); white-space: nowrap; }
    .activity-card .ac-desc {
      font-size: 9px; line-height: 1.55; color: var(--tinta); margin: 4px 0 6px;
    }
    .activity-card .ac-meta {
      display: flex; flex-wrap: wrap; gap: 5px 14px;
      font-size: 8px; color: var(--gris); padding-top: 5px; border-top: 1px solid var(--borde);
    }
    .activity-card .ac-meta b { color: var(--tinta); font-weight: 600; }

    /* Barras horizontales (reparto por tipo, por parcela…) */
    .ndvi-chart-container, .bar-block {
      border: 1px solid var(--borde); border-radius: 4px; padding: 11px 13px; margin-bottom: 12px;
    }
    .ndvi-chart-title { font-size: 9px; font-weight: 700; color: var(--verde); margin-bottom: 8px; }
    .ndvi-bar-row, .bar-row { display: flex; align-items: center; gap: 7px; margin-bottom: 5px; }
    .ndvi-bar-row:last-child, .bar-row:last-child { margin-bottom: 0; }
    .ndvi-bar-label, .bar-label {
      font-size: 8.5px; font-weight: 600; color: var(--tinta); width: 108px;
      text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0;
    }
    .ndvi-bar-track, .bar-track {
      flex: 1; height: 11px; background: #f1f5f9; border-radius: 2px; overflow: hidden;
    }
    .ndvi-bar-fill, .bar-fill { height: 100%; background: var(--verde-medio); border-radius: 2px; }
    .ndvi-bar-fill.healthy { background: ${REPORT_COLORS.verdeMedio}; }
    .ndvi-bar-fill.moderate { background: ${REPORT_COLORS.ambar}; }
    .ndvi-bar-fill.critical { background: ${REPORT_COLORS.rojo}; }
    .ndvi-bar-val, .bar-val {
      font-size: 8.5px; font-weight: 700; width: 52px; text-align: left; flex-shrink: 0; color: var(--tinta);
    }

    /* ── Otros bloques heredados ───────────────────────────── */
    .summary-bar {
      background: var(--verde); color: #ffffff; padding: 9px 16px; border-radius: 4px;
      font-size: 10.5px; font-weight: 700; margin-bottom: 12px;
      display: flex; align-items: center; gap: 8px;
    }
    .summary-bar svg { width: 14px; height: 14px; }
    .two-col { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 12px; margin-bottom: 10px; }
    .notes-kpis { display: flex; gap: 8px; margin-bottom: 12px; }
    .note-kpi { flex: 1; border: 1px solid var(--borde); border-radius: 4px; padding: 8px; text-align: center; }
    .note-kpi .nk-val { font-size: 17px; font-weight: 800; }
    .note-kpi .nk-label {
      font-size: 7.5px; color: var(--gris); text-transform: uppercase; letter-spacing: 0.8px; margin-top: 2px;
    }
    .spatial-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
    .spatial-cell { border: 1px solid var(--borde); border-radius: 4px; padding: 9px; text-align: center; }
    .spatial-cell.problem { border-color: #fecaca; background: #fef2f2; }
    .spatial-cell .sc-label { font-size: 7.5px; font-weight: 700; color: var(--verde); margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.6px; }
    .spatial-cell.problem .sc-label { color: #991b1b; }
    .spatial-cell .sc-ndvi { font-size: 18px; font-weight: 800; color: var(--verde-medio); }
    .spatial-cell.problem .sc-ndvi { color: ${REPORT_COLORS.rojo}; }
    .spatial-cell .sc-sub { font-size: 7px; color: var(--gris); margin-top: 2px; }
    .maps-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; }
    .map-card { border: 1px solid var(--borde); border-radius: 4px; overflow: hidden; text-align: center; }
    .map-card .map-title {
      font-size: 9px; font-weight: 700; color: var(--verde); padding: 7px 0 4px 0;
      text-transform: uppercase; letter-spacing: 0.8px;
    }
    .map-card img { width: 100%; max-height: 130px; object-fit: contain; padding: 0 7px 4px 7px; }
    .map-card .map-no-img { padding: 26px 8px; font-size: 8.5px; color: var(--gris); }
    .map-card .map-trend { font-size: 8.5px; font-weight: 600; padding: 4px 0 7px 0; }
    .trend-up { color: var(--verde-medio); }
    .trend-down { color: ${REPORT_COLORS.rojo}; }
    .trend-stable { color: ${REPORT_COLORS.ambar}; }
    .cat-pills { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
    .cat-pill {
      border: 1px solid var(--borde); border-radius: 3px; padding: 4px 9px;
      display: flex; align-items: center; gap: 5px; background: var(--fondo-suave);
    }
    .cat-pill .cp-count { font-size: 11px; font-weight: 800; color: var(--verde); }
    .cat-pill .cp-label { font-size: 8px; color: var(--tinta); }
    .inactive-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
    .inactive-chip {
      background: var(--fondo-suave); border: 1px solid var(--borde); border-radius: 3px;
      padding: 3px 8px; font-size: 8px; color: var(--gris);
    }

    /* Letra chica: notas al pie de una sección, fuentes, avisos */
    .fine-print {
      font-size: 7.5px; line-height: 1.55; color: var(--gris);
      padding-top: 7px; margin-bottom: 10px;
    }
    .fine-print strong { color: var(--tinta); }

    /* ── Pie de página ─────────────────────────────────────── */
    .page-footer {
      margin-top: auto; padding: 9px 46px;
      border-top: 1px solid var(--borde);
      display: flex; align-items: center; justify-content: space-between;
      background: #ffffff;
    }
    .footer-brand {
      font-size: 7.5px; color: var(--gris); display: flex; align-items: center; gap: 6px;
      letter-spacing: 0.3px;
    }
    .footer-brand img { height: 11px; width: 11px; border-radius: 2px; }
    .footer-center { font-size: 7.5px; color: var(--gris-claro); letter-spacing: 0.3px; }
    .page-pill {
      color: var(--gris); font-size: 7.5px; font-weight: 600; letter-spacing: 0.3px;
    }

    @media print {
      body { background: #ffffff; }
      .page { box-shadow: none; margin: 0; }
      .no-print { display: none !important; }
    }
    @media screen {
      body { padding: 24px 0; }
      .page { box-shadow: 0 2px 16px rgba(15,81,50,0.10); margin-bottom: 22px; }
    }
  `;
}

/** Escapa texto para meterlo en el HTML del reporte, conservando acentos */
export function esc(text: unknown): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
