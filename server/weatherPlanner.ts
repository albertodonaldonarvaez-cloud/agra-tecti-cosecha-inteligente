/**
 * Clima aplicado a la planeación de labores.
 *
 * La pantalla de Clima servía para una sola cosa: cruzar temperatura y lluvia
 * contra la cosecha. Este módulo la convierte en una herramienta de planeación:
 *
 *  - Qué clima HUBO el día de cada labor que ya se hizo (¿se lavó la
 *    aplicación?, ¿se podó con lluvia?).
 *  - Qué clima HABRÁ los días de las labores planeadas, con un veredicto por
 *    tipo de labor (una aspersión con viento no sirve; un riego antes de una
 *    lluvia se desperdicia).
 *  - En qué momento del ciclo estamos, para poner la cosecha al frente cuando
 *    es temporada y las labores al frente cuando no.
 *
 * Todo el criterio agronómico vive AQUÍ, no en la pantalla, para que la web y
 * cualquier otro consumidor (IA, Telegram) digan lo mismo.
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";

const TIMEZONE = "America/Mexico_City";

/** Hoy en la zona del negocio, no en la del servidor */
function hoyMx(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString("en-CA");
}

function diasEntre(desde: string, hasta: string): number {
  const a = new Date(desde + "T12:00:00").getTime();
  const b = new Date(hasta + "T12:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

function filas(res: any): any[] {
  return (res?.[0] ?? res?.rows ?? []) as any[];
}

function aFecha(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toLocaleDateString("en-CA");
  return String(v).split("T")[0];
}

// ============================================================
// CRITERIO AGRONÓMICO
// ============================================================

export type Nivel = "bueno" | "cuidado" | "malo";

export interface ClimaDia {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  temperatureMean: number;
  precipitation: number;
  precipitationProbability: number;
  windSpeed: number;
  cloudCover: number;
  condition: string;
  conditionText: string;
  /** true = pronóstico; false = ya ocurrió */
  esPronostico: boolean;
}

export interface Veredicto {
  nivel: Nivel;
  /** Frases cortas, en el idioma del campo */
  motivos: string[];
}

/** Etiquetas de los tipos de labor, para no repetirlas en cada pantalla */
export const TIPOS_LABOR: Record<string, string> = {
  riego: "Riego",
  fertilizacion: "Fertilización",
  nutricion: "Nutrición foliar",
  poda: "Poda",
  control_maleza: "Control de maleza",
  control_plagas: "Control de plagas",
  aplicacion_fitosanitaria: "Aplicación fitosanitaria",
  otro: "Otra labor",
};

/** Labores que se asperjan: el viento y la lluvia posterior las arruinan */
const SE_ASPERJA = new Set(["nutricion", "control_maleza", "control_plagas", "aplicacion_fitosanitaria"]);

const peor = (a: Nivel, b: Nivel): Nivel =>
  a === "malo" || b === "malo" ? "malo" : a === "cuidado" || b === "cuidado" ? "cuidado" : "bueno";

/**
 * Qué tan buen día es (o fue) para una labor.
 *
 * @param lluviaDespues mm que cayeron/caerán en las ~24 h siguientes. Es el
 *        dato que decide si una aspersión se lava, y por eso va aparte.
 */
export function evaluarLabor(
  activityType: string,
  clima: ClimaDia | null,
  lluviaDespues: number | null,
): Veredicto {
  if (!clima) return { nivel: "cuidado", motivos: ["Sin datos de clima para ese día"] };

  const motivos: string[] = [];
  let nivel: Nivel = "bueno";
  const lluvia = clima.precipitation ?? 0;
  const prob = clima.precipitationProbability ?? 0;
  const viento = clima.windSpeed ?? 0;
  const tMax = clima.temperatureMax ?? 0;
  const tMin = clima.temperatureMin ?? 0;
  const verbo = clima.esPronostico ? "se esperan" : "cayeron";

  // ── Reglas comunes ──
  if (tMax >= 38) {
    nivel = peor(nivel, "malo");
    motivos.push(`Calor extremo (${tMax.toFixed(0)}°C): riesgo para la planta y para la gente`);
  } else if (tMax >= 34) {
    nivel = peor(nivel, "cuidado");
    motivos.push(`Hace mucho calor (${tMax.toFixed(0)}°C): trabajar temprano`);
  }
  if (tMin <= 2) {
    nivel = peor(nivel, "malo");
    motivos.push(`Riesgo de helada (mínima ${tMin.toFixed(0)}°C)`);
  }

  // ── Reglas por tipo de labor ──
  if (SE_ASPERJA.has(activityType)) {
    if (lluvia >= 5) {
      nivel = peor(nivel, "malo");
      motivos.push(`${verbo} ${lluvia.toFixed(0)} mm de lluvia: la aplicación se lava`);
    } else if (lluvia >= 1 || prob >= 60) {
      nivel = peor(nivel, "cuidado");
      motivos.push(lluvia >= 1
        ? `${verbo} ${lluvia.toFixed(1)} mm: puede lavar parte del producto`
        : `${prob}% de probabilidad de lluvia`);
    }
    if (lluviaDespues != null && lluviaDespues >= 5 && lluvia < 5) {
      nivel = peor(nivel, "malo");
      motivos.push(`Llueve fuerte al día siguiente (${lluviaDespues.toFixed(0)} mm): no da tiempo de secar`);
    }
    if (viento >= 20) {
      nivel = peor(nivel, "malo");
      motivos.push(`Viento de ${viento.toFixed(0)} km/h: la aspersión se va a otro lado`);
    } else if (viento >= 12) {
      nivel = peor(nivel, "cuidado");
      motivos.push(`Viento de ${viento.toFixed(0)} km/h: aplicar temprano o al atardecer`);
    }
    if (tMax >= 32) {
      nivel = peor(nivel, "cuidado");
      motivos.push("Con este calor el caldo se evapora antes de entrar a la hoja");
    }
  }

  if (activityType === "riego") {
    if (lluvia >= 10 || (lluviaDespues ?? 0) >= 10) {
      nivel = peor(nivel, "malo");
      motivos.push("Con esta lluvia el riego se desperdicia");
    } else if (lluvia >= 3 || (lluviaDespues ?? 0) >= 5 || prob >= 60) {
      nivel = peor(nivel, "cuidado");
      motivos.push("Va a llover: conviene bajar la lámina o esperar");
    }
    if (tMax >= 34 && lluvia < 1) motivos.push("Calor fuerte y sin lluvia: la planta lo va a agradecer");
  }

  if (activityType === "poda") {
    if (lluvia >= 1 || prob >= 60) {
      nivel = peor(nivel, "malo");
      motivos.push("Podar con humedad abre la puerta a enfermedades por el corte");
    } else if ((lluviaDespues ?? 0) >= 5) {
      nivel = peor(nivel, "cuidado");
      motivos.push("Llueve al día siguiente: los cortes no alcanzan a cicatrizar");
    }
  }

  if (activityType === "fertilizacion") {
    if (lluvia >= 25 || (lluviaDespues ?? 0) >= 25) {
      nivel = peor(nivel, "malo");
      motivos.push("Lluvia fuerte: el fertilizante se lava antes de que lo tome la planta");
    } else if ((lluviaDespues ?? 0) >= 3 && (lluviaDespues ?? 0) < 25) {
      motivos.push("Lluvia ligera después: ayuda a incorporar el granulado");
    } else if (lluvia < 1 && (lluviaDespues ?? 0) < 1) {
      nivel = peor(nivel, "cuidado");
      motivos.push("Sin lluvia ni riego el granulado se queda en la superficie");
    }
  }

  if (motivos.length === 0) motivos.push("Condiciones normales para esta labor");
  return { nivel, motivos };
}

/** Veredicto pensado para el corte de fruta */
export function evaluarCosecha(clima: ClimaDia | null): Veredicto {
  if (!clima) return { nivel: "cuidado", motivos: ["Sin datos de clima para ese día"] };
  const motivos: string[] = [];
  let nivel: Nivel = "bueno";
  const lluvia = clima.precipitation ?? 0;
  const prob = clima.precipitationProbability ?? 0;
  const tMax = clima.temperatureMax ?? 0;
  const verbo = clima.esPronostico ? "se esperan" : "cayeron";

  if (lluvia >= 10) {
    nivel = "malo";
    motivos.push(`${verbo} ${lluvia.toFixed(0)} mm: el higo se abre y se pudre, y la caja llega mojada`);
  } else if (lluvia >= 2 || prob >= 60) {
    nivel = "cuidado";
    motivos.push(lluvia >= 2
      ? `${verbo} ${lluvia.toFixed(1)} mm: cortar en cuanto seque`
      : `${prob}% de probabilidad de lluvia: adelantar el corte`);
  }
  if (tMax >= 36) {
    nivel = peor(nivel, "cuidado");
    motivos.push(`${tMax.toFixed(0)}°C: madura de golpe, hay que cortar temprano y sombrear la fruta`);
  }
  if (motivos.length === 0) motivos.push("Buen día para cortar");
  return { nivel, motivos };
}

// ============================================================
// ARMADO DE LA PLANEACIÓN
// ============================================================

export interface LaborConClima {
  id: number;
  activityType: string;
  activityTypeLabel: string;
  activitySubtype: string | null;
  description: string;
  activityDate: string;
  status: string;
  performedBy: string;
  parcelas: string[];
  personas: number;
  clima: ClimaDia | null;
  veredicto: Veredicto;
  /** Días desde hoy: negativo = pasado, 0 = hoy, positivo = futuro */
  enDias: number;
}

export interface DiaAgenda {
  date: string;
  clima: ClimaDia | null;
  labores: LaborConClima[];
  /** Veredicto del día para cortar fruta (lo que importa en temporada) */
  cosecha: Veredicto;
  /**
   * Veredicto del día para asperjar. Es el que manda fuera de temporada:
   * la aspersión es la labor que más depende del clima (viento, lluvia
   * posterior y calor la arruinan), así que sirve de termómetro del día.
   */
  aspersion: Veredicto;
  /** Labores que HOY convendría programar ese día, por el clima que se espera */
  sugerencias: string[];
}

export interface PlaneacionClima {
  hoy: string;
  ciclo: {
    id: number;
    name: string;
    startDate: string;
    endDate: string | null;
    diaDelCiclo: number;
    /** Rango de cosecha detectado (de la ficha del ciclo o de las cajas) */
    cosechaInicio: string | null;
    cosechaFin: string | null;
  } | null;
  /** true = hay que poner la cosecha al frente */
  temporadaCosecha: boolean;
  /** Cómo se supo: para poder explicárselo al usuario */
  motivoTemporada: string;
  cosechaReciente: { dias: number; cajas: number; kg: number };
  pasadas: LaborConClima[];
  planeadas: LaborConClima[];
  agenda: DiaAgenda[];
}

/** Mapa de clima por fecha, juntando lo que pasó y lo que viene */
async function climaPorFecha(desde: string, hasta: string): Promise<Map<string, ClimaDia>> {
  const mapa = new Map<string, ClimaDia>();
  const dbExt = await import("./db_extended");
  const config = await dbExt.getLocationConfig();
  if (!config) return mapa;

  const { getHistoricalWeatherDetailed, getExtendedForecast } = await import("./weatherService");
  const hoy = hoyMx();

  // Lo que ya pasó
  if (desde < hoy) {
    try {
      const hist = await getHistoricalWeatherDetailed(
        config.latitude, config.longitude, desde,
        hasta < hoy ? hasta : sumarDias(hoy, -1), config.timezone,
      );
      for (const d of hist) {
        mapa.set(d.date, { ...d, esPronostico: false });
      }
    } catch (e: any) {
      console.error("[Planeación] No se pudo traer el clima histórico:", e?.message);
    }
  }

  // Lo que viene (hoy incluido)
  if (hasta >= hoy) {
    try {
      const dias = Math.min(16, Math.max(1, diasEntre(hoy, hasta) + 1));
      const fc = await getExtendedForecast(config.latitude, config.longitude, dias, config.timezone);
      for (const d of fc) {
        mapa.set(d.date, { ...d, esPronostico: true });
      }
    } catch (e: any) {
      console.error("[Planeación] No se pudo traer el pronóstico:", e?.message);
    }
  }

  return mapa;
}

/** Lluvia de los días siguientes a uno dado (para saber si se lava lo aplicado) */
function lluviaSiguiente(mapa: Map<string, ClimaDia>, fecha: string): number | null {
  const d = mapa.get(sumarDias(fecha, 1));
  return d ? d.precipitation ?? 0 : null;
}

/**
 * Todo lo que la pantalla de Clima necesita para planear.
 *
 * @param pastDays  cuántos días atrás mirar las labores ya hechas
 * @param aheadDays cuántos días adelante planear (tope 16, que es hasta donde
 *                  llega el pronóstico de Open-Meteo)
 */
export async function getWeatherPlanner(
  pastDays = 30,
  aheadDays = 7,
): Promise<PlaneacionClima> {
  const drizzle = await getDb();
  const hoy = hoyMx();
  const desde = sumarDias(hoy, -Math.abs(pastDays));
  const hasta = sumarDias(hoy, Math.min(16, Math.abs(aheadDays)));

  const vacio: PlaneacionClima = {
    hoy, ciclo: null, temporadaCosecha: false,
    motivoTemporada: "Sin ciclos registrados",
    cosechaReciente: { dias: 14, cajas: 0, kg: 0 },
    pasadas: [], planeadas: [], agenda: [],
  };
  if (!drizzle) return vacio;

  // ── Ciclo en curso ──
  let ciclo: PlaneacionClima["ciclo"] = null;
  try {
    const res: any = await drizzle.execute(sql`
      SELECT id, name, startDate, endDate, harvestStartDate, harvestEndDate
        FROM productionCycles
       WHERE startDate <= ${hoy} AND (endDate IS NULL OR endDate >= ${hoy})
       ORDER BY startDate DESC LIMIT 1
    `);
    const c = filas(res)[0];
    if (c) {
      ciclo = {
        id: Number(c.id),
        name: String(c.name),
        startDate: aFecha(c.startDate)!,
        endDate: aFecha(c.endDate),
        diaDelCiclo: diasEntre(aFecha(c.startDate)!, hoy),
        cosechaInicio: aFecha(c.harvestStartDate),
        cosechaFin: aFecha(c.harvestEndDate),
      };
    }
  } catch (e: any) {
    console.error("[Planeación] No se pudo leer el ciclo:", e?.message);
  }

  // ── ¿Estamos en temporada de cosecha? ──
  // Dos señales: lo que dice la ficha del ciclo y lo que dicen las cajas.
  // Las cajas mandan: si está entrando fruta, es temporada aunque nadie haya
  // capturado la fecha de inicio de cosecha en el ciclo.
  let cajasRecientes = 0;
  let kgRecientes = 0;
  const VENTANA = 14;
  try {
    const res: any = await drizzle.execute(sql`
      SELECT COUNT(*) AS cajas, COALESCE(SUM(weight), 0) / 1000 AS kg
        FROM boxes
       WHERE archived = 0 AND DATE(submissionTime) >= ${sumarDias(hoy, -VENTANA)}
    `);
    const r = filas(res)[0] ?? {};
    cajasRecientes = Number(r.cajas || 0);
    kgRecientes = Math.round(Number(r.kg || 0));
  } catch { /* sin cajas */ }

  let temporadaCosecha = false;
  let motivoTemporada = "";
  if (cajasRecientes > 0) {
    temporadaCosecha = true;
    motivoTemporada = `Entraron ${cajasRecientes} cajas en los últimos ${VENTANA} días`;
  } else if (ciclo?.cosechaInicio && hoy >= ciclo.cosechaInicio && (!ciclo.cosechaFin || hoy <= ciclo.cosechaFin)) {
    temporadaCosecha = true;
    motivoTemporada = `El ciclo marca cosecha del ${ciclo.cosechaInicio} en adelante`;
  } else if (ciclo) {
    motivoTemporada = ciclo.cosechaInicio && hoy < ciclo.cosechaInicio
      ? `La cosecha del ciclo arranca el ${ciclo.cosechaInicio}`
      : "No hay corte en curso: el enfoque está en las labores";
  } else {
    motivoTemporada = "Sin ciclo abierto: el enfoque está en las labores";
  }

  // ── Clima del periodo completo ──
  const clima = await climaPorFecha(desde, hasta);

  // ── Labores del periodo, con sus parcelas y su gente ──
  let labores: LaborConClima[] = [];
  try {
    const res: any = await drizzle.execute(sql`
      SELECT a.id, a.activityType, a.activitySubtype, a.description, a.activityDate,
             a.status, a.performedBy,
             GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR '||') AS parcelas,
             COUNT(DISTINCT asg.collaboratorId) AS personas
        FROM fieldActivities a
        LEFT JOIN fieldActivityParcels ap ON ap.activityId = a.id
        LEFT JOIN parcels p ON p.id = ap.parcelId
        LEFT JOIN fieldActivityAssignments asg ON asg.activityId = a.id
       WHERE a.activityDate BETWEEN ${desde} AND ${hasta}
       GROUP BY a.id
       ORDER BY a.activityDate ASC, a.id ASC
    `);
    labores = filas(res).map((r) => {
      const fecha = aFecha(r.activityDate)!;
      const c = clima.get(fecha) ?? null;
      const tipo = String(r.activityType);
      return {
        id: Number(r.id),
        activityType: tipo,
        activityTypeLabel: TIPOS_LABOR[tipo] ?? tipo,
        activitySubtype: r.activitySubtype ?? null,
        description: String(r.description ?? ""),
        activityDate: fecha,
        status: String(r.status),
        performedBy: String(r.performedBy ?? ""),
        parcelas: r.parcelas ? String(r.parcelas).split("||") : [],
        personas: Number(r.personas || 0),
        clima: c,
        veredicto: evaluarLabor(tipo, c, lluviaSiguiente(clima, fecha)),
        enDias: diasEntre(hoy, fecha),
      };
    });
  } catch (e: any) {
    console.error("[Planeación] No se pudieron leer las labores:", e?.message);
  }

  // Pasadas = ya ocurrieron (con el clima que hubo).
  // Planeadas = de hoy en adelante, o atrasadas sin completar.
  const pasadas = labores
    .filter((l) => l.enDias < 0 && (l.status === "completada" || l.status === "cancelada"))
    .sort((a, b) => b.activityDate.localeCompare(a.activityDate));
  const planeadas = labores
    .filter((l) => l.enDias >= 0 || (l.status !== "completada" && l.status !== "cancelada"))
    .sort((a, b) => a.activityDate.localeCompare(b.activityDate));

  // ── Agenda de los próximos días ──
  const agenda: DiaAgenda[] = [];
  for (let i = 0; i <= Math.min(16, Math.abs(aheadDays)); i++) {
    const fecha = sumarDias(hoy, i);
    const c = clima.get(fecha) ?? null;
    const delDia = planeadas.filter((l) => l.activityDate === fecha);

    // Qué convendría hacer ese día según cómo se ve el clima
    const lluviaDespues = lluviaSiguiente(clima, fecha);
    const sugerencias: string[] = [];
    if (c) {
      for (const tipo of ["aplicacion_fitosanitaria", "riego", "poda", "fertilizacion"]) {
        const v = evaluarLabor(tipo, c, lluviaDespues);
        if (v.nivel === "bueno") sugerencias.push(TIPOS_LABOR[tipo]);
      }
    }

    agenda.push({
      date: fecha,
      clima: c,
      labores: delDia,
      cosecha: evaluarCosecha(c),
      aspersion: evaluarLabor("aplicacion_fitosanitaria", c, lluviaDespues),
      sugerencias,
    });
  }

  return {
    hoy,
    ciclo,
    temporadaCosecha,
    motivoTemporada,
    cosechaReciente: { dias: VENTANA, cajas: cajasRecientes, kg: kgRecientes },
    pasadas,
    planeadas,
    agenda,
  };
}
