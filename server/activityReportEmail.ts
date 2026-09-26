import type { ActivitySummary } from "./activityReport";
import { LOGO_CID } from "./logo";
import { fechaCorta, plantillaAviso } from "./emailLayout";

// ============================================================
// El correo del reporte de actividades
//
// Es un aviso, no el reporte. Antes el cuerpo traía los totales, el resumen
// de la IA y la tabla de las sesenta primeras labores, y el adjunto repetía
// exactamente lo mismo: dos versiones de la misma cosa, una de ellas peor.
//
// Ahora el correo dice que llegó y el PDF adjunto es el reporte. La única
// cifra que sobrevive es cuántas labores hubo, porque es lo que decide si
// abres el documento ahora o el lunes.
// ============================================================

/** De cuántas labores se trata, en palabras */
function frase(summary: ActivitySummary, hayPdf: boolean): string {
  const cuerpo =
    summary.total === 0
      ? "No se registraron labores en la libreta de campo durante este periodo."
      : summary.total === 1
        ? "Se registró 1 labor en la libreta de campo."
        : `Se registraron ${summary.total} labores en la libreta de campo.`;

  if (summary.total === 0) return cuerpo;
  return hayPdf ? `${cuerpo} El detalle completo va en el PDF adjunto.` : cuerpo;
}

export function renderActivityEmailHtml(data: {
  period: { from: string; to: string };
  summary: ActivitySummary;
  scopeLabel: string;
  hasAttachment: boolean;
}): string {
  return plantillaAviso({
    titulo: "Reporte de actividades de campo",
    periodo: `${data.scopeLabel} · ${fechaCorta(data.period.from)} — ${fechaCorta(data.period.to)}`,
    frase: frase(data.summary, data.hasAttachment),
    adjunto: data.hasAttachment ? "Reporte completo en PDF" : undefined,
    logoCid: LOGO_CID,
  });
}

/** Versión en texto plano, para clientes que no muestran HTML */
export function renderActivityEmailText(data: {
  period: { from: string; to: string };
  summary: ActivitySummary;
  scopeLabel: string;
}): string {
  return [
    "REPORTE DE ACTIVIDADES DE CAMPO",
    `${data.scopeLabel} · ${fechaCorta(data.period.from)} a ${fechaCorta(data.period.to)}`,
    "",
    frase(data.summary, true),
    "",
    "Agra Tec-Ti · Correo automático, no hace falta responderlo.",
  ].join("\n");
}
