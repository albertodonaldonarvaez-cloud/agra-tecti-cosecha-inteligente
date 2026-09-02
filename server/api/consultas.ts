/**
 * Consultas agregadas que antes no existían en el servidor.
 *
 * Estas cuatro son la razón de la fase 3. Todas comparten un criterio: la suma
 * la hace MySQL, no Node. La pantalla de rendimiento por cortadora hoy se baja
 * las 28 000+ cajas al navegador para sacar un ranking de veinte renglones
 * (client/src/pages/HarvesterPerformance.tsx llama a boxes.list, que no tiene
 * tope); un agente que preguntara "¿quién cortó más esta semana?" tendría que
 * repetir esa misma descarga. Agregar en SQL resuelve las dos cosas.
 *
 * Recordatorio para quien lea el SQL: `weight` está en GRAMOS, y las cortadoras
 * 98 y 99 no son personas — son las cajas marcadas como segunda calidad y como
 * desperdicio.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { aKg, comoDia, num, porcentaje } from "./util";

const SEGUNDA = 98;
const DESPERDICIO = 99;

/** MySQL devuelve [filas, campos]; en todo el proyecto se desenvuelve así */
function filas(resultado: unknown): any[] {
  return ((resultado as any)?.[0] ?? []) as any[];
}

function filtroFechas(desde?: string, hasta?: string) {
  let f = sql``;
  if (desde) f = sql`${f} AND DATE(submissionTime) >= ${desde}`;
  if (hasta) f = sql`${f} AND DATE(submissionTime) <= ${hasta}`;
  return f;
}

// ───────────────────────── cosecha por parcela ─────────────────────────

export async function cosechaPorParcela(desde?: string, hasta?: string) {
  const db = await getDb();
  if (!db) return [];

  const r = await db.execute(sql`
    SELECT
      b.parcelCode,
      MAX(b.parcelName) AS parcelName,
      COUNT(*) AS cajas,
      SUM(b.weight) AS peso,
      COUNT(CASE WHEN b.harvesterId NOT IN (${SEGUNDA}, ${DESPERDICIO}) THEN 1 END) AS primera,
      COUNT(CASE WHEN b.harvesterId = ${SEGUNDA} THEN 1 END) AS segunda,
      COUNT(CASE WHEN b.harvesterId = ${DESPERDICIO} THEN 1 END) AS desperdicio,
      SUM(CASE WHEN b.harvesterId NOT IN (${SEGUNDA}, ${DESPERDICIO}) THEN b.weight ELSE 0 END) AS pesoPrimera,
      SUM(CASE WHEN b.harvesterId = ${SEGUNDA} THEN b.weight ELSE 0 END) AS pesoSegunda,
      SUM(CASE WHEN b.harvesterId = ${DESPERDICIO} THEN b.weight ELSE 0 END) AS pesoDesperdicio,
      MIN(DATE(b.submissionTime)) AS primerDia,
      MAX(DATE(b.submissionTime)) AS ultimoDia,
      COUNT(DISTINCT DATE(b.submissionTime)) AS diasConCosecha,
      p.id AS parcelId,
      d.productiveHectares AS hectareas,
      d.productiveTrees AS arboles
    FROM boxes b
    LEFT JOIN parcels p ON p.code = b.parcelCode
    LEFT JOIN parcelDetails d ON d.parcelId = p.id
    WHERE b.archived = 0 ${filtroFechas(desde, hasta)}
    GROUP BY b.parcelCode, p.id, d.productiveHectares, d.productiveTrees
    ORDER BY peso DESC
  `);

  return filas(r).map((f) => {
    const cajas = num(f.cajas);
    const hectareas = f.hectareas ? Number(f.hectareas) : null;
    const pesoKg = aKg(f.peso);
    return {
      parcelaId: f.parcelId ?? null,
      codigo: f.parcelCode,
      nombre: f.parcelName,
      cajas,
      pesoKg,
      pesoPromedioPorCajaKg: cajas ? Number((pesoKg / cajas).toFixed(2)) : 0,
      primera: { cajas: num(f.primera), pesoKg: aKg(f.pesoPrimera), porcentaje: porcentaje(num(f.primera), cajas) },
      segunda: { cajas: num(f.segunda), pesoKg: aKg(f.pesoSegunda), porcentaje: porcentaje(num(f.segunda), cajas) },
      desperdicio: { cajas: num(f.desperdicio), pesoKg: aKg(f.pesoDesperdicio), porcentaje: porcentaje(num(f.desperdicio), cajas) },
      hectareasProductivas: hectareas,
      arbolesProductivos: f.arboles ?? null,
      // El rendimiento por hectárea es la cifra que de verdad compara parcelas;
      // sin hectáreas registradas se devuelve null en vez de un cero engañoso
      rendimientoKgPorHectarea: hectareas ? Number((pesoKg / hectareas).toFixed(1)) : null,
      primerDia: comoDia(f.primerDia),
      ultimoDia: comoDia(f.ultimoDia),
      diasConCosecha: num(f.diasConCosecha),
    };
  });
}

// ───────────────────────── rendimiento por cortadora ─────────────────────────

export async function rendimientoCortadoras(desde?: string, hasta?: string, limite = 100) {
  const db = await getDb();
  if (!db) return [];

  const r = await db.execute(sql`
    SELECT
      b.harvesterId,
      h.customName AS nombre,
      COUNT(*) AS cajas,
      SUM(b.weight) AS peso,
      AVG(b.weight) AS pesoPromedio,
      MIN(b.weight) AS pesoMinimo,
      MAX(b.weight) AS pesoMaximo,
      COUNT(DISTINCT DATE(b.submissionTime)) AS diasTrabajados,
      COUNT(DISTINCT b.parcelCode) AS parcelas,
      MIN(DATE(b.submissionTime)) AS primerDia,
      MAX(DATE(b.submissionTime)) AS ultimoDia
    FROM boxes b
    LEFT JOIN harvesters h ON h.number = b.harvesterId
    WHERE b.archived = 0
      AND b.harvesterId NOT IN (${SEGUNDA}, ${DESPERDICIO})
      ${filtroFechas(desde, hasta)}
    GROUP BY b.harvesterId, h.customName
    ORDER BY peso DESC
    LIMIT ${limite}
  `);

  return filas(r).map((f, i) => {
    const cajas = num(f.cajas);
    const dias = num(f.diasTrabajados);
    return {
      posicion: i + 1,
      cortadora: num(f.harvesterId),
      nombre: f.nombre || null,
      cajas,
      pesoKg: aKg(f.peso),
      pesoPromedioPorCajaKg: aKg(f.pesoPromedio),
      pesoMinimoKg: aKg(f.pesoMinimo),
      pesoMaximoKg: aKg(f.pesoMaximo),
      diasTrabajados: dias,
      cajasPorDia: dias ? Number((cajas / dias).toFixed(1)) : 0,
      kgPorDia: dias ? Number((aKg(f.peso) / dias).toFixed(1)) : 0,
      parcelasDistintas: num(f.parcelas),
      primerDia: comoDia(f.primerDia),
      ultimoDia: comoDia(f.ultimoDia),
    };
  });
}

// ───────────────────────── series temporales ─────────────────────────

export const METRICAS = [
  "cajas",
  "kg",
  "primera_kg",
  "segunda_kg",
  "desperdicio_kg",
  "calidad_pct",
  "peso_promedio_kg",
] as const;

export const GRANULARIDADES = ["dia", "semana", "mes"] as const;

export type Metrica = (typeof METRICAS)[number];
export type Granularidad = (typeof GRANULARIDADES)[number];

/**
 * Cualquier métrica de cosecha con la misma forma de respuesta.
 *
 * Antes cada gráfica tenía su endpoint y su estructura propia: un agente que
 * quisiera cruzar kilos contra calidad tenía que normalizar dos formatos antes
 * de empezar. Aquí siempre salen {periodo, valor} y la unidad va aparte.
 */
export async function serie(opciones: {
  metrica: Metrica;
  granularidad: Granularidad;
  desde?: string;
  hasta?: string;
  parcela?: string;
}) {
  const db = await getDb();
  if (!db) return { unidad: "", puntos: [] as { periodo: string; valor: number; cajas: number }[] };

  const { metrica, granularidad, desde, hasta, parcela } = opciones;

  const periodo =
    granularidad === "mes"
      ? sql`DATE_FORMAT(submissionTime, '%Y-%m')`
      : granularidad === "semana"
        // Lunes de la semana: fecha real y ordenable, mucho más útil para un
        // agente que el número de semana ISO suelto
        ? sql`DATE_FORMAT(DATE_SUB(DATE(submissionTime), INTERVAL WEEKDAY(submissionTime) DAY), '%Y-%m-%d')`
        : sql`DATE_FORMAT(submissionTime, '%Y-%m-%d')`;

  const valor = (() => {
    switch (metrica) {
      case "cajas": return sql`COUNT(*)`;
      case "kg": return sql`SUM(weight) / 1000`;
      case "primera_kg": return sql`SUM(CASE WHEN harvesterId NOT IN (${SEGUNDA}, ${DESPERDICIO}) THEN weight ELSE 0 END) / 1000`;
      case "segunda_kg": return sql`SUM(CASE WHEN harvesterId = ${SEGUNDA} THEN weight ELSE 0 END) / 1000`;
      case "desperdicio_kg": return sql`SUM(CASE WHEN harvesterId = ${DESPERDICIO} THEN weight ELSE 0 END) / 1000`;
      case "calidad_pct": return sql`COUNT(CASE WHEN harvesterId NOT IN (${SEGUNDA}, ${DESPERDICIO}) THEN 1 END) * 100 / COUNT(*)`;
      case "peso_promedio_kg": return sql`AVG(weight) / 1000`;
    }
  })();

  const filtroParcela = parcela ? sql` AND parcelCode = ${parcela}` : sql``;

  const r = await db.execute(sql`
    SELECT ${periodo} AS periodo, ${valor} AS valor, COUNT(*) AS cajas
    FROM boxes
    WHERE archived = 0 ${filtroFechas(desde, hasta)}${filtroParcela}
    GROUP BY periodo
    ORDER BY periodo ASC
  `);

  const unidades: Record<Metrica, string> = {
    cajas: "cajas",
    kg: "kg",
    primera_kg: "kg",
    segunda_kg: "kg",
    desperdicio_kg: "kg",
    calidad_pct: "%",
    peso_promedio_kg: "kg",
  };

  return {
    unidad: unidades[metrica],
    puntos: filas(r).map((f) => ({
      periodo: String(f.periodo),
      valor: Number(Number(f.valor ?? 0).toFixed(2)),
      cajas: num(f.cajas),
    })),
  };
}

// ───────────────────────── exportación por cursor ─────────────────────────

/**
 * Trozo de cajas para bajar el histórico completo.
 *
 * Va por cursor sobre el id y no por número de página a propósito: con paginado
 * por desplazamiento, si entran cajas nuevas a media descarga —y entran, la
 * sincronización con Kobo corre dos veces al día— las filas se recorren y el
 * agente termina con registros repetidos y otros que nunca vio.
 */
export async function loteDeCajas(opciones: {
  cursor?: number;
  limite: number;
  desde?: string;
  hasta?: string;
  parcela?: string;
}) {
  const db = await getDb();
  if (!db) return { cajas: [], siguienteCursor: null as number | null };

  const { cursor, limite, desde, hasta, parcela } = opciones;
  const filtroCursor = cursor ? sql` AND b.id > ${cursor}` : sql``;
  const filtroParcela = parcela ? sql` AND b.parcelCode = ${parcela}` : sql``;

  const r = await db.execute(sql`
    SELECT
      b.id, b.boxCode, b.harvesterId, b.parcelCode, b.parcelName, b.weight,
      b.latitude, b.longitude, b.submissionTime, b.photoLocalPath, b.manuallyEdited
    FROM boxes b
    WHERE b.archived = 0 ${filtroCursor}
      ${desde ? sql` AND DATE(b.submissionTime) >= ${desde}` : sql``}
      ${hasta ? sql` AND DATE(b.submissionTime) <= ${hasta}` : sql``}
      ${filtroParcela}
    ORDER BY b.id ASC
    LIMIT ${limite}
  `);

  const cajas = filas(r).map((f) => ({
    id: num(f.id),
    codigo: f.boxCode,
    cortadora: num(f.harvesterId),
    calidad: f.harvesterId === SEGUNDA ? "segunda" : f.harvesterId === DESPERDICIO ? "desperdicio" : "primera",
    parcelaCodigo: f.parcelCode,
    parcelaNombre: f.parcelName,
    pesoKg: aKg(f.weight),
    latitud: f.latitude ? Number(f.latitude) : null,
    longitud: f.longitude ? Number(f.longitude) : null,
    fecha: comoDia(f.submissionTime),
    registrado: f.submissionTime instanceof Date ? f.submissionTime.toISOString() : String(f.submissionTime),
    tieneFoto: !!f.photoLocalPath,
    editadaAMano: !!f.manuallyEdited,
  }));

  return {
    cajas,
    // Solo hay cursor siguiente si el lote vino lleno: un lote incompleto es el final
    siguienteCursor: cajas.length === limite ? cajas[cajas.length - 1].id : null,
  };
}

/** Cuántas cajas caben en la exportación, para que el agente sepa cuánto le falta */
export async function contarCajas(desde?: string, hasta?: string, parcela?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const filtroParcela = parcela ? sql` AND parcelCode = ${parcela}` : sql``;
  const r = await db.execute(sql`
    SELECT COUNT(*) AS total FROM boxes
    WHERE archived = 0 ${filtroFechas(desde, hasta)}${filtroParcela}
  `);
  return num(filas(r)[0]?.total);
}
