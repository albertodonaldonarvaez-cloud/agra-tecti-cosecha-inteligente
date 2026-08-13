/**
 * Lectura de la telemetría satelital que YA está guardada en el servidor.
 *
 * REGLA DE ESTE ARCHIVO: aquí NUNCA se llama a Copernicus. Todo sale de la
 * base. Quien descarga es la revisión diaria (satelliteAutoSync), y abrir
 * Análisis de Parcela solo lee lo guardado.
 *
 * Antes cada visita a la pestaña satelital disparaba seis consultas al
 * satélite (mapa y serie de NDVI, NDRE y NDMI), la pantalla tardaba en cargar
 * y se gastaban llamadas a la API sin necesidad.
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";

export type IndexType = "NDVI" | "NDRE" | "NDMI";
const INDICES: IndexType[] = ["NDVI", "NDRE", "NDMI"];

/** Un punto de la serie que devuelve la API estadística de Copernicus */
export interface SeriePunto {
  date: string;
  mean: number;
  min: number;
  max: number;
  stDev?: number;
  noDataPct?: number;
}

/** drizzle.execute devuelve [filas, columnas]; esto saca las filas siempre igual */
function filas(res: any): any[] {
  return (res?.[0] ?? res?.rows ?? []) as any[];
}

function aFecha(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().split("T")[0];
  return String(v).split("T")[0];
}

function parseJson<T>(v: any, porDefecto: T): T {
  if (!v) return porDefecto;
  if (typeof v === "object") return v as T;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return porDefecto;
  }
}

// ============================================================
// TELEMETRÍA GUARDADA DE UNA PARCELA
// ============================================================

export interface TelemetriaIndice {
  indexType: IndexType;
  /** PNG en base64 del mapa coloreado (null si todavía no se ha descargado) */
  image: string | null;
  /** Día real de la pasada del satélite */
  captureDate: string | null;
  clearPct: number | null;
  cycleId: number | null;
  cycleName: string | null;
  /** Cuándo se guardó en el servidor */
  fetchedAt: string | null;
  series: SeriePunto[];
  seriesFrom: string | null;
  seriesTo: string | null;
  seriesFetchedAt: string | null;
}

export interface TelemetriaParcela {
  parcelId: number;
  indices: TelemetriaIndice[];
  /** Vigor por zonas de la última captura (cuadrícula 3×3) */
  vigor: { captureDate: string | null; cycleId: number | null; data: any } | null;
  /** Cuándo se refrescó por última vez algo de esta parcela */
  lastSyncAt: string | null;
  /** false = nunca se ha descargado nada todavía */
  hasData: boolean;
  /** Horas desde la última descarga (para avisar si algo se atoró) */
  ageHours: number | null;
}

/**
 * Todo lo satelital de una parcela en UNA sola consulta.
 * Sustituye a las seis que hacía la pantalla (mapa + serie × 3 índices).
 */
export async function getStoredTelemetry(parcelId: number): Promise<TelemetriaParcela> {
  const drizzle = await getDb();
  const vacio: TelemetriaParcela = {
    parcelId,
    indices: INDICES.map((i) => ({
      indexType: i, image: null, captureDate: null, clearPct: null,
      cycleId: null, cycleName: null, fetchedAt: null,
      series: [], seriesFrom: null, seriesTo: null, seriesFetchedAt: null,
    })),
    vigor: null,
    lastSyncAt: null,
    hasData: false,
    ageHours: null,
  };
  if (!drizzle) return vacio;

  // Mapas + series + zonas de la parcela, de un jalón
  const res: any = await drizzle.execute(sql`
    SELECT c.dataType, c.indexType, c.mapDate, c.captureDate, c.clearPct, c.cycleId,
           c.fromDate, c.toDate, c.fetchedAt, c.data, cy.name AS cycleName
      FROM parcelSatelliteCache c
      LEFT JOIN productionCycles cy ON cy.id = c.cycleId
     WHERE c.parcelId = ${parcelId}
       AND (
            (c.dataType = 'map'   AND c.mapDate = 'latest')
         OR (c.dataType = 'stats' AND c.mapDate IS NULL)
         OR (c.dataType = 'zones' AND c.mapDate = 'latest')
       )
  `);
  const rows = filas(res);
  if (rows.length === 0) return vacio;

  let lastSyncAt: Date | null = null;
  const porIndice = new Map<IndexType, TelemetriaIndice>();
  for (const i of INDICES) {
    porIndice.set(i, {
      indexType: i, image: null, captureDate: null, clearPct: null,
      cycleId: null, cycleName: null, fetchedAt: null,
      series: [], seriesFrom: null, seriesTo: null, seriesFetchedAt: null,
    });
  }
  let vigor: TelemetriaParcela["vigor"] = null;

  for (const r of rows) {
    const cuando = r.fetchedAt ? new Date(r.fetchedAt) : null;
    if (cuando && (!lastSyncAt || cuando > lastSyncAt)) lastSyncAt = cuando;

    if (r.dataType === "zones") {
      vigor = {
        captureDate: aFecha(r.captureDate),
        cycleId: r.cycleId ?? null,
        data: parseJson<any>(r.data, null),
      };
      continue;
    }

    const destino = porIndice.get(r.indexType as IndexType);
    if (!destino) continue;

    if (r.dataType === "map") {
      destino.image = r.data ?? null;
      destino.captureDate = aFecha(r.captureDate);
      destino.clearPct = r.clearPct ?? null;
      destino.cycleId = r.cycleId ?? null;
      destino.cycleName = r.cycleName ?? null;
      destino.fetchedAt = cuando ? cuando.toISOString() : null;
    } else if (r.dataType === "stats") {
      destino.series = parseJson<SeriePunto[]>(r.data, []);
      destino.seriesFrom = aFecha(r.fromDate);
      destino.seriesTo = aFecha(r.toDate);
      destino.seriesFetchedAt = cuando ? cuando.toISOString() : null;
    }
  }

  const indices = INDICES.map((i) => porIndice.get(i)!);
  return {
    parcelId,
    indices,
    vigor,
    lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
    hasData: indices.some((i) => i.image || i.series.length > 0),
    ageHours: lastSyncAt ? Math.round(((Date.now() - lastSyncAt.getTime()) / 3600000) * 10) / 10 : null,
  };
}

// ============================================================
// COMPARACIÓN ENTRE CICLOS
// ============================================================

export interface ResumenIndice {
  promedio: number | null;
  maximo: number | null;
  minimo: number | null;
  /** Día del ciclo (0 = arranque) en que se alcanzó el máximo */
  diaMaximo: number | null;
  fechaMaximo: string | null;
  ultimo: number | null;
  fechaUltimo: string | null;
  puntos: number;
}

export interface CicloTelemetria {
  cycleId: number;
  cycleName: string;
  startDate: string;
  endDate: string | null;
  harvestStartDate: string | null;
  /** Ciclo sin fecha de cierre: el que está corriendo */
  enCurso: boolean;
  /** Días transcurridos del ciclo (hasta hoy si sigue abierto) */
  duracionDias: number;
  ndvi: ResumenIndice;
  ndre: ResumenIndice;
  ndmi: ResumenIndice;
  /**
   * Serie alineada por DÍA DEL CICLO, no por fecha del calendario: es lo que
   * permite poner dos ciclos encima y ver cuál venía mejor "al día 90".
   */
  serie: { dia: number; date: string; ndvi: number | null; ndre: number | null; ndmi: number | null }[];
  cosecha: { cajas: number; kg: number; dias: number; primera: string | null; ultima: string | null };
  labores: number;
}

export interface ComparativoCiclos {
  parcelId: number;
  parcelCode: string | null;
  ciclos: CicloTelemetria[];
  /** Días que abarca el ciclo más largo: sirve para el eje X del comparativo */
  maxDia: number;
  /** Datos satelitales que quedaron fuera de todo ciclo (antes del primero) */
  sinCiclo: number;
}

function diasEntre(desde: string, hasta: string): number {
  const a = new Date(desde + "T12:00:00").getTime();
  const b = new Date(hasta + "T12:00:00").getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

function resumir(
  puntos: { dia: number; date: string; valor: number }[],
): ResumenIndice {
  if (puntos.length === 0) {
    return { promedio: null, maximo: null, minimo: null, diaMaximo: null, fechaMaximo: null, ultimo: null, fechaUltimo: null, puntos: 0 };
  }
  const r2 = (n: number) => Math.round(n * 1000) / 1000;
  let mejor = puntos[0];
  let peor = puntos[0];
  let suma = 0;
  for (const p of puntos) {
    if (p.valor > mejor.valor) mejor = p;
    if (p.valor < peor.valor) peor = p;
    suma += p.valor;
  }
  const ultimo = puntos[puntos.length - 1];
  return {
    promedio: r2(suma / puntos.length),
    maximo: r2(mejor.valor),
    minimo: r2(peor.valor),
    diaMaximo: mejor.dia,
    fechaMaximo: mejor.date,
    ultimo: r2(ultimo.valor),
    fechaUltimo: ultimo.date,
    puntos: puntos.length,
  };
}

/**
 * Telemetría de la parcela partida por ciclo de producción, con la cosecha y
 * las labores de cada uno.
 *
 * De dónde salen los datos: de la serie que ya está guardada (la que baja la
 * revisión diaria), que arranca en la primera cosecha registrada de la parcela.
 * Por eso alcanza para comparar ciclos anteriores desde el primer día, sin
 * volver a pedirle nada al satélite.
 */
export async function getCycleTelemetry(parcelId: number): Promise<ComparativoCiclos> {
  const drizzle = await getDb();
  const vacio: ComparativoCiclos = { parcelId, parcelCode: null, ciclos: [], maxDia: 0, sinCiclo: 0 };
  if (!drizzle) return vacio;

  const parcelaRes: any = await drizzle.execute(
    sql`SELECT code FROM parcels WHERE id = ${parcelId} LIMIT 1`
  );
  const parcelCode: string | null = filas(parcelaRes)[0]?.code ?? null;

  const ciclosRes: any = await drizzle.execute(sql`
    SELECT id, name, startDate, endDate, harvestStartDate
      FROM productionCycles
     ORDER BY startDate ASC
  `);
  const ciclos = filas(ciclosRes).map((c) => ({
    id: Number(c.id),
    name: String(c.name),
    startDate: aFecha(c.startDate)!,
    endDate: aFecha(c.endDate),
    harvestStartDate: aFecha(c.harvestStartDate),
  }));
  if (ciclos.length === 0) return { ...vacio, parcelCode };

  // Series guardadas de los tres índices
  const seriesRes: any = await drizzle.execute(sql`
    SELECT indexType, data FROM parcelSatelliteCache
     WHERE parcelId = ${parcelId} AND dataType = 'stats' AND mapDate IS NULL
  `);
  const series = new Map<IndexType, SeriePunto[]>();
  for (const r of filas(seriesRes)) {
    series.set(r.indexType as IndexType, parseJson<SeriePunto[]>(r.data, []));
  }

  // Un punto por fecha con los tres índices juntos
  const porFecha = new Map<string, { ndvi: number | null; ndre: number | null; ndmi: number | null }>();
  const anotar = (idx: IndexType, clave: "ndvi" | "ndre" | "ndmi") => {
    for (const p of series.get(idx) ?? []) {
      const fecha = aFecha(p.date);
      if (!fecha || typeof p.mean !== "number" || Number.isNaN(p.mean)) continue;
      const actual = porFecha.get(fecha) ?? { ndvi: null, ndre: null, ndmi: null };
      actual[clave] = Math.round(p.mean * 1000) / 1000;
      porFecha.set(fecha, actual);
    }
  };
  anotar("NDVI", "ndvi");
  anotar("NDRE", "ndre");
  anotar("NDMI", "ndmi");

  const hoy = new Date().toISOString().split("T")[0];
  const fechasOrdenadas = Array.from(porFecha.keys()).sort();

  // Cosecha y labores de la parcela agrupadas por ciclo
  const cosechaPorCiclo = new Map<number, { cajas: number; kg: number; dias: number; primera: string | null; ultima: string | null }>();
  const laboresPorCiclo = new Map<number, number>();

  for (const ciclo of ciclos) {
    const fin = ciclo.endDate ?? hoy;
    if (parcelCode) {
      const res: any = await drizzle.execute(sql`
        SELECT COUNT(*) AS cajas,
               COALESCE(SUM(weight), 0) / 1000 AS kg,
               COUNT(DISTINCT DATE(submissionTime)) AS dias,
               MIN(DATE(submissionTime)) AS primera,
               MAX(DATE(submissionTime)) AS ultima
          FROM boxes
         WHERE parcelCode = ${parcelCode} AND archived = 0
           AND DATE(submissionTime) BETWEEN ${ciclo.startDate} AND ${fin}
      `);
      const r = filas(res)[0] ?? {};
      cosechaPorCiclo.set(ciclo.id, {
        cajas: Number(r.cajas || 0),
        kg: Math.round(Number(r.kg || 0) * 100) / 100,
        dias: Number(r.dias || 0),
        primera: aFecha(r.primera),
        ultima: aFecha(r.ultima),
      });
    }

    const labRes: any = await drizzle.execute(sql`
      SELECT COUNT(DISTINCT a.id) AS total
        FROM fieldActivities a
        JOIN fieldActivityParcels ap ON ap.activityId = a.id
       WHERE ap.parcelId = ${parcelId}
         AND a.activityDate BETWEEN ${ciclo.startDate} AND ${fin}
    `);
    laboresPorCiclo.set(ciclo.id, Number(filas(labRes)[0]?.total || 0));
  }

  // Reparto de los puntos satelitales entre los ciclos
  let sinCiclo = 0;
  const resultado: CicloTelemetria[] = [];
  let maxDia = 0;

  for (const ciclo of ciclos) {
    const fin = ciclo.endDate ?? hoy;
    const serie: CicloTelemetria["serie"] = [];
    const ndvi: { dia: number; date: string; valor: number }[] = [];
    const ndre: { dia: number; date: string; valor: number }[] = [];
    const ndmi: { dia: number; date: string; valor: number }[] = [];

    for (const fecha of fechasOrdenadas) {
      if (fecha < ciclo.startDate || fecha > fin) continue;
      const v = porFecha.get(fecha)!;
      const dia = diasEntre(ciclo.startDate, fecha);
      serie.push({ dia, date: fecha, ndvi: v.ndvi, ndre: v.ndre, ndmi: v.ndmi });
      if (v.ndvi != null) ndvi.push({ dia, date: fecha, valor: v.ndvi });
      if (v.ndre != null) ndre.push({ dia, date: fecha, valor: v.ndre });
      if (v.ndmi != null) ndmi.push({ dia, date: fecha, valor: v.ndmi });
      if (dia > maxDia) maxDia = dia;
    }

    resultado.push({
      cycleId: ciclo.id,
      cycleName: ciclo.name,
      startDate: ciclo.startDate,
      endDate: ciclo.endDate,
      harvestStartDate: ciclo.harvestStartDate,
      enCurso: !ciclo.endDate,
      duracionDias: diasEntre(ciclo.startDate, fin),
      ndvi: resumir(ndvi),
      ndre: resumir(ndre),
      ndmi: resumir(ndmi),
      serie,
      cosecha: cosechaPorCiclo.get(ciclo.id) ?? { cajas: 0, kg: 0, dias: 0, primera: null, ultima: null },
      labores: laboresPorCiclo.get(ciclo.id) ?? 0,
    });
  }

  // Capturas anteriores al primer ciclo registrado: se cuentan para poder
  // decirle al usuario que hay datos que ningún ciclo cubre todavía
  const primerInicio = ciclos[0].startDate;
  for (const fecha of fechasOrdenadas) if (fecha < primerInicio) sinCiclo++;

  return {
    parcelId,
    parcelCode,
    // Del más reciente al más viejo: el ciclo en curso va primero
    ciclos: resultado.reverse(),
    maxDia,
    sinCiclo,
  };
}

// ============================================================
// TEXTO COMPARATIVO PARA LA IA
// ============================================================

/** Promedio de los puntos del ciclo hasta cierto día (null si no hay ninguno) */
function promedioHasta(serie: CicloTelemetria["serie"], hastaDia: number, campo: "ndvi" | "ndre" | "ndmi"): number | null {
  const valores = serie.filter((p) => p.dia <= hastaDia && p[campo] != null).map((p) => p[campo] as number);
  if (valores.length === 0) return null;
  return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 1000) / 1000;
}

/**
 * Cómo va este ciclo comparado con los anteriores, EN EL MISMO MOMENTO del
 * cultivo. Se le pasa a la IA para que el diagnóstico deje de ser "el NDVI
 * está en 0.51" y pase a ser "va mejor/peor que el ciclo pasado a estas
 * alturas, que terminó con tanta cosecha".
 *
 * Comparar contra el promedio del ciclo completo anterior sería tramposo: un
 * ciclo a la mitad siempre perdería. Por eso se corta el ciclo anterior en el
 * mismo día de avance que lleva el actual.
 */
export async function buildCycleComparisonText(parcelId: number): Promise<string | null> {
  const comp = await getCycleTelemetry(parcelId);
  const conDatos = comp.ciclos.filter((c) => c.serie.length > 0);
  if (conDatos.length < 2) return null;

  const actual = conDatos[0];
  const dia = actual.duracionDias;
  const lineas: string[] = [
    `COMPARACIÓN CON CICLOS ANTERIORES (todo medido AL MISMO DÍA DE AVANCE, día ${dia} del ciclo):`,
  ];

  const baseNdvi = promedioHasta(actual.serie, dia, "ndvi");
  const baseNdmi = promedioHasta(actual.serie, dia, "ndmi");
  lineas.push(
    `- ${actual.cycleName} (EN CURSO, arrancó el ${actual.startDate}, lleva ${dia} días): ` +
    `NDVI ${baseNdvi ?? "n/d"}, NDMI ${baseNdmi ?? "n/d"}. ` +
    `Máximo del ciclo ${actual.ndvi.maximo ?? "n/d"} en el día ${actual.ndvi.diaMaximo ?? "n/d"}. ` +
    `Cosecha hasta hoy: ${actual.cosecha.kg} kg en ${actual.cosecha.cajas} cajas. ` +
    `Labores registradas: ${actual.labores}.`
  );

  for (const c of conDatos.slice(1, 4)) {
    const ndviMismoDia = promedioHasta(c.serie, dia, "ndvi");
    const ndmiMismoDia = promedioHasta(c.serie, dia, "ndmi");
    const dif = baseNdvi != null && ndviMismoDia != null
      ? ` (este ciclo va ${(baseNdvi - ndviMismoDia) >= 0 ? "+" : ""}${(baseNdvi - ndviMismoDia).toFixed(3)} contra él)`
      : "";
    lineas.push(
      `- ${c.cycleName} (${c.startDate} → ${c.endDate ?? "sin cierre"}): al día ${dia} iba en ` +
      `NDVI ${ndviMismoDia ?? "n/d"}, NDMI ${ndmiMismoDia ?? "n/d"}${dif}. ` +
      `En todo el ciclo promedió ${c.ndvi.promedio ?? "n/d"} con máximo ${c.ndvi.maximo ?? "n/d"} ` +
      `(día ${c.ndvi.diaMaximo ?? "n/d"}). Cosecha final: ${c.cosecha.kg} kg en ${c.cosecha.cajas} cajas ` +
      `y ${c.cosecha.dias} días de corte. Labores: ${c.labores}.`
    );
  }

  lineas.push(
    "USA ESTO: di claramente si la parcela viene mejor o peor que en el ciclo anterior a estas " +
    "alturas, y relaciona el vigor de aquel ciclo con la cosecha que terminó dando. " +
    "No compares contra el promedio del ciclo completo anterior si el actual va a la mitad."
  );

  return lineas.join("\n");
}
