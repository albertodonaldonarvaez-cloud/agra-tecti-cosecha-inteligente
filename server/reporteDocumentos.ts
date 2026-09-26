// ============================================================
// De los datos del reporte al documento imprimible
//
// `reportePdf.ts` sabe dibujar tablas y no sabe nada de higos. Aquí está lo
// contrario: qué secciones lleva cada reporte, en qué orden y qué se señala.
// Separarlos deja cambiar el aspecto de todos los PDF tocando un solo módulo,
// y cambiar lo que dice un reporte sin tocar el dibujo.
//
// Solo importa tipos de los otros módulos: nada de esto se ejecuta al cargar,
// así que no hay dependencia circular con reporteSemanal.
// ============================================================

import type { ActivityAiSummary, ActivityLine, ActivitySummary } from "./activityReport";
import type { DocumentoPdf, SeccionPdf } from "./reportePdf";
import type { CosechaSemana } from "./reporteSemanal";

function fechaCorta(iso: string): string {
  if (!iso) return "—";
  // Mediodía: "2026-09-21" a secas es medianoche UTC, que en México todavía
  // es el día 20, y el reporte diría un día menos.
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

function num(valor: number, decimales = 0): string {
  if (!Number.isFinite(valor)) return "—";
  return valor.toLocaleString("es-MX", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

function pct(parte: number, total: number): string {
  if (!total) return "—";
  return `${((parte / total) * 100).toFixed(1)}%`;
}

/** El reporte de actividades de campo, listo para `generarPdf` */
export function documentoDeActividades(datos: {
  period: { from: string; to: string };
  summary: ActivitySummary;
  activities: ActivityLine[];
  ai: ActivityAiSummary | null;
  scopeLabel: string;
}): DocumentoPdf {
  const { summary, activities, ai } = datos;
  const secciones: SeccionPdf[] = [];

  if (ai) {
    const parrafos = [ai.resumen];
    if (ai.insumos) parrafos.push(ai.insumos);
    if (ai.pendientes) parrafos.push(`Pendientes: ${ai.pendientes}`);
    secciones.push({ titulo: "Resumen ejecutivo", parrafos });
    if (ai.recomendaciones.length > 0) {
      secciones.push({ titulo: "Recomendaciones", vinetas: ai.recomendaciones });
    }
  }

  // A diferencia del correo, aquí van TODAS las labores: el PDF es justamente
  // el detalle completo que el cuerpo del correo recorta a sesenta renglones.
  secciones.push({
    titulo: "Labores del periodo",
    parrafos: activities.length === 0 ? ["No se registraron actividades en este periodo."] : undefined,
    columnas: [
      { titulo: "Fecha", peso: 8 },
      { titulo: "Labor", peso: 18 },
      { titulo: "Parcela", peso: 16 },
      { titulo: "Responsable", peso: 17 },
      { titulo: "Insumos", peso: 23 },
      { titulo: "Horas", peso: 7, alinear: "right" },
      { titulo: "Estado", peso: 11 },
    ],
    filas: activities.map((a) => [
      fechaCorta(a.date),
      a.subtype ? `${a.typeLabel} (${a.subtype})` : a.typeLabel,
      a.parcelNames.length ? a.parcelNames.join(", ") : "General",
      a.performedBy || "—",
      a.products.length
        ? a.products.map((p) => `${p.name}${p.quantity ? ` ${p.quantity}${p.unit || ""}` : ""}`).join(", ")
        : "—",
      a.hours ? String(a.hours) : "—",
      a.statusLabel,
    ]),
  });

  if (summary.products.length > 0) {
    secciones.push({
      titulo: "Insumos aplicados",
      columnas: [
        { titulo: "Producto", peso: 34 },
        { titulo: "Tipo", peso: 30 },
        { titulo: "Cantidad total", peso: 20, alinear: "right" },
        { titulo: "Aplicaciones", peso: 16, alinear: "right" },
      ],
      filas: summary.products.map((p) => [
        p.name,
        p.typeLabel,
        p.total > 0 ? `${num(p.total, 2)} ${p.unit}`.trim() : "sin cantidad",
        String(p.times),
      ]),
    });
  }

  if (summary.byParcel.length > 0) {
    secciones.push({
      titulo: "Trabajo por parcela",
      columnas: [
        { titulo: "Parcela", peso: 60 },
        { titulo: "Labores", peso: 20, alinear: "right" },
        { titulo: "Horas", peso: 20, alinear: "right" },
      ],
      filas: summary.byParcel.map((p) => [p.name, String(p.count), num(p.hours, 1)]),
    });
  }

  if (summary.byPerson.length > 0) {
    secciones.push({
      titulo: "Participación",
      columnas: [
        { titulo: "Persona", peso: 60 },
        { titulo: "Labores", peso: 20, alinear: "right" },
        { titulo: "Horas", peso: 20, alinear: "right" },
      ],
      filas: summary.byPerson.map((p) => [p.name, String(p.count), num(p.hours, 1)]),
    });
  }

  // Lo que no está cerrado se señala, no se esconde: es justo lo que hay que
  // arrastrar a la semana que empieza.
  const avisos: string[] = [];
  if (summary.planned > 0) avisos.push(`${summary.planned} labor(es) quedaron planificadas y todavía no se ejecutan.`);
  if (summary.inProgress > 0) avisos.push(`${summary.inProgress} labor(es) siguen en proceso.`);
  if (summary.cancelled > 0) avisos.push(`${summary.cancelled} labor(es) se cancelaron.`);

  return {
    titulo: "Reporte de actividades de campo",
    subtitulo: "LIBRETA DE CAMPO · INSUMOS · JORNADAS",
    contexto: datos.scopeLabel,
    periodo: `${fechaCorta(datos.period.from)} — ${fechaCorta(datos.period.to)}`,
    kpis: [
      { etiqueta: "Labores", valor: String(summary.total) },
      { etiqueta: "Completadas", valor: String(summary.completed) },
      { etiqueta: "Horas", valor: num(summary.hours, 1) },
      { etiqueta: "Parcelas", valor: String(summary.parcelsWorked) },
      { etiqueta: "Personas", valor: String(summary.peopleCount) },
    ],
    secciones,
    avisos,
  };
}

/** El reporte de cosecha de la semana, listo para `generarPdf` */
export function documentoDeCosecha(datos: {
  periodo: { desde: string; hasta: string };
  cosecha: CosechaSemana;
}): DocumentoPdf {
  const c = datos.cosecha;
  const t = c.totales;

  const secciones: SeccionPdf[] = [
    {
      titulo: "Calidad de la semana",
      vinetas: [
        `Primera: ${num(t.primera, 0)} kg (${pct(t.primera, t.kg)})`,
        `Segunda: ${num(t.segunda, 0)} kg (${pct(t.segunda, t.kg)})`,
        `Desperdicio: ${num(t.desperdicio, 0)} kg (${pct(t.desperdicio, t.kg)})`,
      ],
    },
    {
      titulo: "Día por día",
      columnas: [
        { titulo: "Día", peso: 34 },
        { titulo: "Cajas", peso: 20, alinear: "right" },
        { titulo: "Kilos", peso: 23, alinear: "right" },
        { titulo: "1ra calidad", peso: 23, alinear: "right" },
      ],
      filas: c.porDia.map((d) => [
        new Date(`${d.fecha}T12:00:00`).toLocaleDateString("es-MX", {
          weekday: "long",
          day: "numeric",
          month: "short",
        }),
        num(d.cajas),
        num(d.kg, 0),
        `${num(d.primera, 0)} (${pct(d.primera, d.kg)})`,
      ]),
      totales: ["TOTAL", num(t.cajas), num(t.kg, 0), `${num(t.primera, 0)} (${pct(t.primera, t.kg)})`],
    },
    {
      titulo: "Por parcela",
      columnas: [
        { titulo: "Parcela", peso: 28 },
        { titulo: "Cajas", peso: 13, alinear: "right" },
        { titulo: "Kilos", peso: 16, alinear: "right" },
        { titulo: "1ra", peso: 14, alinear: "right" },
        { titulo: "2da", peso: 14, alinear: "right" },
        { titulo: "Desperdicio", peso: 15, alinear: "right" },
      ],
      filas: c.porParcela.map((p) => [
        p.nombre,
        num(p.cajas),
        num(p.kg, 0),
        num(p.primera, 0),
        num(p.segunda, 0),
        num(p.desperdicio, 0),
      ]),
      totales: [
        "TOTAL",
        num(t.cajas),
        num(t.kg, 0),
        num(t.primera, 0),
        num(t.segunda, 0),
        num(t.desperdicio, 0),
      ],
    },
  ];

  if (c.porCortadora.length > 0) {
    secciones.push({
      titulo: "Las diez cortadoras con más kilos",
      columnas: [
        { titulo: "#", peso: 10 },
        { titulo: "Cortadora", peso: 54 },
        { titulo: "Cajas", peso: 18, alinear: "right" },
        { titulo: "Kilos", peso: 18, alinear: "right" },
      ],
      filas: c.porCortadora.map((h) => [
        String(h.numero).padStart(2, "0"),
        h.nombre,
        num(h.cajas),
        num(h.kg, 0),
      ]),
    });
  }

  const avisos: string[] = [];
  if (c.avisos.sinParcela > 0) {
    avisos.push(`${num(c.avisos.sinParcela)} caja(s) entraron sin parcela: no suman a ninguna parcela del desglose.`);
  }
  if (c.avisos.pesoAlto > 0) {
    avisos.push(
      `${num(c.avisos.pesoAlto)} caja(s) pesan más de 15 kg. Sí están contadas en los totales; conviene revisar si fue la báscula o la captura.`,
    );
  }
  if (c.avisos.sinCiclo > 0) {
    avisos.push(`${num(c.avisos.sinCiclo)} caja(s) con una fecha que no cae en ningún ciclo registrado.`);
  }

  return {
    titulo: "Reporte semanal de cosecha",
    subtitulo: "CAJAS · KILOS · CALIDAD · PARCELAS",
    contexto: c.ciclo ? `Ciclo ${c.ciclo}` : "Cosecha de la semana",
    periodo: `${fechaCorta(datos.periodo.desde)} — ${fechaCorta(datos.periodo.hasta)}`,
    kpis: [
      { etiqueta: "Cajas", valor: num(t.cajas) },
      { etiqueta: "Kilos", valor: num(t.kg, 0) },
      { etiqueta: "1ra calidad", valor: pct(t.primera, t.kg) },
      { etiqueta: "Parcelas", valor: String(c.porParcela.length) },
      { etiqueta: "Días de corte", valor: String(c.porDia.length) },
    ],
    secciones,
    avisos,
  };
}
