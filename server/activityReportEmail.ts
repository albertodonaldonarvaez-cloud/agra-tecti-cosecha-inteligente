import type { ActivityAiSummary, ActivityLine, ActivitySummary } from "./activityReport";

// ============================================================
// Cuerpo del correo del reporte de actividades
//
// Los clientes de correo (Outlook sobre todo) ignoran flex, grid y buena parte
// del CSS moderno, así que esto se arma con tablas y estilos en línea a
// propósito. El documento completo va adjunto; aquí va el resumen legible.
// ============================================================

const VERDE = "#0f5132";
const VERDE_CLARO = "#198754";
const TINTA = "#1f2937";
const GRIS = "#6b7280";
const BORDE = "#e5e7eb";

function esc(text: unknown): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fecha(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function kpi(label: string, value: string): string {
  return `<td align="center" style="padding:12px 8px;border:1px solid ${BORDE};border-radius:8px;background:#f8fafc">
    <div style="font-size:22px;font-weight:700;color:${VERDE};line-height:1.1">${esc(value)}</div>
    <div style="font-size:11px;color:${GRIS};text-transform:uppercase;letter-spacing:.06em;margin-top:4px">${esc(label)}</div>
  </td>`;
}

function titulo(text: string): string {
  return `<h2 style="font-size:14px;font-weight:700;color:${VERDE};text-transform:uppercase;letter-spacing:.08em;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid ${VERDE_CLARO}">${esc(text)}</h2>`;
}

function parrafo(text: string): string {
  return `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:${TINTA}">${esc(text)}</p>`;
}

/**
 * Cuerpo del correo: los totales, el resumen de la IA y la tabla de labores.
 * El detalle completo (insumos, jornadas, herramientas) va en el adjunto.
 */
export function renderActivityEmailHtml(data: {
  period: { from: string; to: string };
  summary: ActivitySummary;
  activities: ActivityLine[];
  ai: ActivityAiSummary | null;
  scopeLabel: string;
  hasAttachment: boolean;
}): string {
  const { summary, ai, activities } = data;

  const filasLabores = activities
    .slice(0, 60)
    .map((a, i) => {
      const fondo = i % 2 === 0 ? "#ffffff" : "#f9fafb";
      const destino = a.parcelNames.length ? a.parcelNames.join(", ") : "General";
      const insumos = a.products.length
        ? a.products.map((p) => `${p.name}${p.quantity ? ` ${p.quantity}${p.unit || ""}` : ""}`).join(", ")
        : "—";
      return `<tr style="background:${fondo}">
        <td style="padding:8px 10px;border-bottom:1px solid ${BORDE};font-size:12px;color:${GRIS};white-space:nowrap">${esc(fecha(a.date))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BORDE};font-size:12px;color:${TINTA};font-weight:600">${esc(a.typeLabel)}${a.subtype ? ` <span style="font-weight:400;color:${GRIS}">(${esc(a.subtype)})</span>` : ""}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BORDE};font-size:12px;color:${TINTA}">${esc(destino)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BORDE};font-size:12px;color:${TINTA}">${esc(insumos)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BORDE};font-size:12px;color:${TINTA};text-align:right;white-space:nowrap">${a.hours ? `${a.hours} h` : "—"}</td>
        <td style="padding:8px 10px;border-bottom:1px solid ${BORDE};font-size:12px;color:${a.status === "completada" ? VERDE_CLARO : "#b45309"};white-space:nowrap">${esc(a.statusLabel)}</td>
      </tr>`;
    })
    .join("");

  const restantes = activities.length - Math.min(activities.length, 60);

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:760px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">

  <tr><td style="background:${VERDE};padding:24px 28px">
    <div style="font-size:19px;font-weight:700;color:#ffffff;letter-spacing:.02em">REPORTE DE ACTIVIDADES DE CAMPO</div>
    <div style="font-size:11px;color:#a7f3d0;letter-spacing:.18em;text-transform:uppercase;margin-top:6px">Libreta de campo · Insumos · Inteligencia artificial</div>
  </td></tr>

  <tr><td style="padding:20px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:13px;color:${TINTA};font-weight:600">${esc(data.scopeLabel)}</td>
        <td align="right" style="font-size:13px;color:${GRIS}">${esc(fecha(data.period.from))} — ${esc(fecha(data.period.to))}</td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:16px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>
      ${kpi("Labores", String(summary.total))}
      ${kpi("Completadas", String(summary.completed))}
      ${kpi("Horas", String(summary.hours))}
      ${kpi("Parcelas", String(summary.parcelsWorked))}
      ${kpi("Personas", String(summary.peopleCount))}
    </tr></table>
  </td></tr>

  <tr><td style="padding:0 28px 28px">
    ${ai ? `${titulo("Resumen ejecutivo")}${parrafo(ai.resumen)}` : ""}
    ${ai?.insumos ? `${titulo("Insumos aplicados")}${parrafo(ai.insumos)}` : ""}
    ${ai?.pendientes ? `${titulo("Pendientes")}${parrafo(ai.pendientes)}` : ""}
    ${
      ai && ai.recomendaciones.length > 0
        ? `${titulo("Recomendaciones")}<ul style="margin:0;padding-left:20px">${ai.recomendaciones
            .map((r) => `<li style="font-size:14px;line-height:1.6;color:${TINTA};margin-bottom:6px">${esc(r)}</li>`)
            .join("")}</ul>`
        : ""
    }

    ${titulo("Labores del periodo")}
    ${
      activities.length === 0
        ? parrafo("No se registraron actividades en este periodo.")
        : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BORDE};border-radius:8px">
            <tr style="background:${VERDE}">
              <th align="left" style="padding:9px 10px;font-size:10px;color:#ffffff;text-transform:uppercase;letter-spacing:.06em">Fecha</th>
              <th align="left" style="padding:9px 10px;font-size:10px;color:#ffffff;text-transform:uppercase;letter-spacing:.06em">Labor</th>
              <th align="left" style="padding:9px 10px;font-size:10px;color:#ffffff;text-transform:uppercase;letter-spacing:.06em">Parcela</th>
              <th align="left" style="padding:9px 10px;font-size:10px;color:#ffffff;text-transform:uppercase;letter-spacing:.06em">Insumos</th>
              <th align="right" style="padding:9px 10px;font-size:10px;color:#ffffff;text-transform:uppercase;letter-spacing:.06em">Horas</th>
              <th align="left" style="padding:9px 10px;font-size:10px;color:#ffffff;text-transform:uppercase;letter-spacing:.06em">Estado</th>
            </tr>
            ${filasLabores}
          </table>
          ${restantes > 0 ? `<p style="margin:10px 0 0;font-size:12px;color:${GRIS}">Y ${restantes} labor(es) más en el reporte adjunto.</p>` : ""}`
    }

    ${
      data.hasAttachment
        ? `<p style="margin:22px 0 0;font-size:13px;color:${GRIS};padding-top:14px;border-top:1px solid ${BORDE}">
             El reporte completo va adjunto a este correo. Ábrelo en el navegador y usa <strong>Imprimir → Guardar como PDF</strong> si necesitas archivarlo.
           </p>`
        : ""
    }
  </td></tr>

  <tr><td style="background:#f8fafc;padding:16px 28px;border-top:1px solid ${BORDE}">
    <div style="font-size:11px;color:${GRIS};line-height:1.6">
      AGRA TEC-TI · Reporte generado automáticamente${ai ? " con apoyo de inteligencia artificial" : ""}.<br>
      Valide las recomendaciones con su ingeniero agrónomo antes de aplicar productos o dosis.
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** Versión en texto plano, para clientes que no muestran HTML */
export function renderActivityEmailText(data: {
  period: { from: string; to: string };
  summary: ActivitySummary;
  ai: ActivityAiSummary | null;
  scopeLabel: string;
}): string {
  const lineas = [
    "REPORTE DE ACTIVIDADES DE CAMPO",
    `${data.scopeLabel} · ${fecha(data.period.from)} a ${fecha(data.period.to)}`,
    "",
    `Labores: ${data.summary.total} (${data.summary.completed} completadas)`,
    `Horas de trabajo: ${data.summary.hours}`,
    `Parcelas atendidas: ${data.summary.parcelsWorked}`,
    "",
  ];
  if (data.ai) {
    lineas.push("RESUMEN", data.ai.resumen, "");
    if (data.ai.pendientes) lineas.push("PENDIENTES", data.ai.pendientes, "");
    if (data.ai.recomendaciones.length) {
      lineas.push("RECOMENDACIONES");
      data.ai.recomendaciones.forEach((r) => lineas.push(`- ${r}`));
      lineas.push("");
    }
  }
  lineas.push("El reporte completo va adjunto a este correo.");
  return lineas.join("\n");
}
