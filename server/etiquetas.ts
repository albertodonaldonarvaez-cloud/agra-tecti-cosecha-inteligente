/**
 * Folios y etiquetas de cosecha.
 *
 * Aquí vive todo lo que sabe repartir folios y llevar la cuenta de cada
 * etiqueta. La pantalla web (por tRPC) y el kiosco de báscula (por REST)
 * llaman a estas mismas funciones: si cada una tuviera su copia, tarde o
 * temprano una repartiría un folio que la otra ya dio.
 *
 * ── El problema que resuelve el reparto ───────────────────────────────
 *
 * Antes el folio lo calculaba el navegador: preguntaba cuál fue el último,
 * le sumaba uno, imprimía, y después le avisaba al servidor qué rango había
 * usado. Entre la pregunta y el aviso hay una ventana —lo que tarde la
 * persona en darle a Imprimir— en la que la verdad todavía no está escrita.
 * Quien preguntara en esa ventana recibía el mismo número, y salían dos
 * juegos de etiquetas físicas idénticas.
 *
 * La solución no es preguntar más rápido: es quitar la pregunta. Aquí no
 * existe "¿cuál fue el último?" seguido de "yo uso estos". Existe una sola
 * operación —dame N— y la respuesta ES el apartado. Mientras corre, el
 * renglón del contador está bloqueado; la segunda báscula espera microsegundos
 * y recibe el rango siguiente.
 *
 * ── Por qué el contador es por ciclo ──────────────────────────────────
 *
 * El folio se reinicia en cada ciclo para que la etiqueta se quede corta y
 * legible. Eso significa que los códigos SE REPITEN entre ciclos, por diseño:
 * el mismo `01-000123` existe en la cosecha pasada y en la nueva. Por eso todo
 * lo que busca por código lleva ciclo, y la unicidad que exige la base es
 * (ciclo, cortadora, folio), no el código a secas.
 */
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  boxes,
  labelFolioCounters,
  labelPrintHistory,
  labels,
  productionCycles,
} from "../drizzle/schema";
import { getDb } from "./db";
import { resolverCiclo, type CicloRango } from "./ciclos";

// ─────────────────────────── topes y formato ───────────────────────────

/** El código impreso usa 6 dígitos de folio; más no cabe en el formato. */
export const FOLIO_MAXIMO = 999_999;

/** El agente de impresión TSPL rechaza lotes más grandes. */
export const LOTE_MAXIMO = 5_000;

export type EstadoEtiqueta = "asignada" | "impresa" | "usada" | "cancelada" | "reimpresa";

/**
 * Un rechazo con instrucciones. El `codigo` lo lee un programa; la `ayuda`
 * dice qué hacer para que la petición funcione.
 */
export class ErrorEtiqueta extends Error {
  constructor(
    public codigo: string,
    mensaje: string,
    public ayuda?: string,
  ) {
    super(mensaje);
    this.name = "ErrorEtiqueta";
  }
}

/**
 * El código que se imprime: dos dígitos de cortadora, guion, seis de folio.
 *
 * Este formato ya lo leen el escáner, el formulario de Kobo y todo el
 * histórico. No se toca — el ciclo va en la base de datos, no en el papel.
 */
export function armarCodigo(cortadora: number, folio: number): string {
  return `${String(cortadora).padStart(2, "0")}-${String(folio).padStart(6, "0")}`;
}

/** Lo contrario: de "07-000123" a la cortadora y el folio. */
export function desarmarCodigo(codigo: string): { cortadora: number; folio: number } | null {
  const m = /^(\d{1,3})-(\d{1,7})$/.exec(codigo.trim());
  if (!m) return null;
  return { cortadora: Number(m[1]), folio: Number(m[2]) };
}

/**
 * De dónde a dónde va el lote. Se separa del reparto para poder probar la
 * aritmética sin base de datos: equivocarse aquí en uno es lo que hace que
 * dos lotes seguidos compartan una etiqueta o dejen un folio sin usar.
 */
export function calcularRango(
  ultimoFolio: number,
  cantidad: number,
): { folioStart: number; folioEnd: number } {
  return { folioStart: ultimoFolio + 1, folioEnd: ultimoFolio + cantidad };
}

/** Revisa lo que se puede revisar antes de tocar la base. */
export function validarPeticion(cortadora: number, cantidad: number, ultimoFolio: number): void {
  if (!Number.isInteger(cortadora) || cortadora < 1 || cortadora > 99) {
    throw new ErrorEtiqueta(
      "cortadora_invalida",
      `La cortadora ${cortadora} no existe`,
      "El número va de 1 a 99. Las 98 y 99 no son personas: son segunda calidad y desperdicio.",
    );
  }
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    throw new ErrorEtiqueta("cantidad_invalida", "Hay que pedir al menos una etiqueta");
  }
  if (cantidad > LOTE_MAXIMO) {
    throw new ErrorEtiqueta(
      "lote_muy_grande",
      `Se pidieron ${cantidad} etiquetas y el máximo por lote es ${LOTE_MAXIMO}`,
      `Parte la impresión en lotes de ${LOTE_MAXIMO} o menos.`,
    );
  }
  const { folioEnd } = calcularRango(ultimoFolio, cantidad);
  if (folioEnd > FOLIO_MAXIMO) {
    throw new ErrorEtiqueta(
      "folio_agotado",
      `El ciclo llegó al folio ${ultimoFolio} y no caben ${cantidad} más`,
      `El código impreso solo admite ${FOLIO_MAXIMO} folios por ciclo. Cierra el ciclo para que la cuenta vuelva a empezar.`,
    );
  }
}

/**
 * Qué le puede pasar a una etiqueta desde donde está.
 *
 * `cancelada` y `usada` son finales a propósito: un folio quemado NO se
 * reutiliza. Reutilizarlo es justo la manera de acabar con dos etiquetas
 * físicas iguales, que es lo que todo esto trata de evitar.
 */
export const TRANSICIONES: Record<EstadoEtiqueta, EstadoEtiqueta[]> = {
  asignada: ["impresa", "cancelada"],
  impresa: ["usada", "cancelada", "reimpresa"],
  usada: [],
  cancelada: [],
  reimpresa: [],
};

export function puedeTransicionar(de: EstadoEtiqueta, a: EstadoEtiqueta): boolean {
  return TRANSICIONES[de]?.includes(a) ?? false;
}

// ─────────────────────────── ayudas internas ───────────────────────────

/** db.execute devuelve [filas, campos]; esto saca las filas. */
function filas<T = any>(resultado: unknown): T[] {
  if (Array.isArray(resultado) && Array.isArray(resultado[0])) return resultado[0] as T[];
  return (resultado as T[]) ?? [];
}

function hoyMx(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

async function baseDeDatos() {
  const db = await getDb();
  if (!db) throw new ErrorEtiqueta("sin_base", "La base de datos no está disponible");
  return db;
}

export interface CicloActivo {
  id: number;
  name: string;
  startDate: string;
  endDate: string | null;
}

/**
 * El ciclo al que pertenece hoy, con la misma regla que usó la migración para
 * rellenar el histórico (ver server/ciclos.ts). Null si no hay ninguno abierto.
 */
export async function cicloDeHoy(): Promise<CicloActivo | null> {
  const db = await baseDeDatos();
  const todos = await db
    .select({
      id: productionCycles.id,
      name: productionCycles.name,
      startDate: productionCycles.startDate,
      endDate: productionCycles.endDate,
    })
    .from(productionCycles);

  const hoy = hoyMx();
  const id = resolverCiclo(hoy, todos as CicloRango[], hoy);
  return id === null ? null : (todos.find((c) => c.id === id) as CicloActivo);
}

/** Un ciclo concreto, por id. */
async function cicloPorId(id: number): Promise<CicloActivo | null> {
  const db = await baseDeDatos();
  const [c] = await db
    .select({
      id: productionCycles.id,
      name: productionCycles.name,
      startDate: productionCycles.startDate,
      endDate: productionCycles.endDate,
    })
    .from(productionCycles)
    .where(eq(productionCycles.id, id))
    .limit(1);
  return (c as CicloActivo) ?? null;
}

/**
 * El ciclo para el que se va a imprimir.
 *
 * Por omisión es el de hoy. Se puede pedir otro a propósito: en el cambio de
 * ciclo puede haber cortadoras terminando la cosecha vieja mientras el ciclo
 * nuevo ya está abierto, y sus etiquetas tienen que llevar la numeración del
 * ciclo al que van a pertenecer las cajas, no la del calendario.
 *
 * Que sea explícito importa: la caja se va a buscar por (ciclo, código), así
 * que una etiqueta apartada en el ciclo equivocado no encuentra su caja.
 */
async function exigirCiclo(cicloId?: number | null): Promise<CicloActivo> {
  if (cicloId !== undefined && cicloId !== null) {
    const elegido = await cicloPorId(cicloId);
    if (!elegido) {
      throw new ErrorEtiqueta(
        "ciclo_desconocido",
        `No existe el ciclo ${cicloId}`,
        "Consulta los ciclos disponibles antes de apartar folios.",
      );
    }
    return elegido;
  }

  const ciclo = await cicloDeHoy();
  if (!ciclo) {
    throw new ErrorEtiqueta(
      "sin_ciclo_abierto",
      "Hoy no cae dentro de ningún ciclo de producción",
      "Abre el ciclo en Ciclos de producción, o di explícitamente para qué ciclo quieres imprimir. Un folio sin ciclo no se puede repartir sin riesgo de repetirlo.",
    );
  }
  return ciclo;
}

export interface CicloParaImprimir extends CicloActivo {
  /** true si hoy cae dentro de este ciclo */
  esElDeHoy: boolean;
  /** Último folio repartido. El siguiente lote empieza en este + 1 */
  ultimoFolio: number;
  impresas: number;
  pendientes: number;
}

/**
 * Los ciclos entre los que se puede escoger al imprimir, con su contador.
 *
 * Se listan del más reciente al más viejo. El de hoy va marcado para que la
 * pantalla lo escoja sola: imprimir para otro ciclo tiene que ser una decisión,
 * no un descuido.
 */
export async function ciclosParaImprimir(limite = 6): Promise<CicloParaImprimir[]> {
  const db = await baseDeDatos();
  const hoy = hoyMx();

  const todos = await db
    .select({
      id: productionCycles.id,
      name: productionCycles.name,
      startDate: productionCycles.startDate,
      endDate: productionCycles.endDate,
    })
    .from(productionCycles)
    .orderBy(desc(productionCycles.startDate), desc(productionCycles.id))
    .limit(limite);

  const idDeHoy = resolverCiclo(hoy, todos as CicloRango[], hoy);

  const cuentas = filas<{ cycleId: number; ultimoFolio: number; impresas: number; pendientes: number }>(
    await db.execute(sql`
      SELECT c.id AS cycleId,
             COALESCE(f.lastFolio, (
               SELECT COALESCE(MAX(h.folioEnd), 0) FROM labelPrintHistory h WHERE h.cycleId = c.id
             )) AS ultimoFolio,
             (SELECT COUNT(*) FROM labels l WHERE l.cycleId = c.id AND l.status IN ('impresa','usada')) AS impresas,
             (SELECT COUNT(*) FROM labels l WHERE l.cycleId = c.id AND l.status = 'impresa') AS pendientes
      FROM productionCycles c
      LEFT JOIN labelFolioCounters f ON f.cycleId = c.id
    `),
  );
  const porCiclo = new Map(cuentas.map((c) => [Number(c.cycleId), c]));

  return todos.map((c) => {
    const cuenta = porCiclo.get(c.id);
    return {
      ...(c as CicloActivo),
      esElDeHoy: c.id === idDeHoy,
      ultimoFolio: Number(cuenta?.ultimoFolio ?? 0),
      impresas: Number(cuenta?.impresas ?? 0),
      pendientes: Number(cuenta?.pendientes ?? 0),
    };
  });
}

// ─────────────────────────── reparto de folios ───────────────────────────

export interface EtiquetaAsignada {
  folio: number;
  codigo: string;
}

export interface ResultadoLote {
  loteId: number;
  cicloId: number;
  cicloNombre: string;
  cortadora: number;
  texto: string;
  cantidad: number;
  folioStart: number;
  folioEnd: number;
  etiquetas: EtiquetaAsignada[];
  /** true si este lote ya existía: se reenvió el mismo clientUuid */
  yaExistia: boolean;
}

/**
 * Aparta N folios para una cortadora y deja creadas sus etiquetas.
 *
 * Devuelve el lote en estado "pendiente": los folios ya son suyos, pero
 * todavía no cuentan como impresos. Quien imprima tiene que confirmar o
 * cancelar después — así, si la impresora se atora, los folios quedan
 * quemados y el siguiente lote sigue de largo en vez de repetirlos.
 *
 * Es idempotente por `clientUuid`: si al kiosco se le cae la señal justo al
 * mandar la petición y reintenta, recibe el mismo rango en vez de apartar el
 * doble.
 */
export async function apartarFolios(params: {
  cortadora: number;
  cantidad: number;
  texto: string;
  /** Para qué ciclo. Por omisión, el de hoy. */
  cicloId?: number | null;
  usuarioId?: number | null;
  deviceId?: string | null;
  clientUuid?: string | null;
}): Promise<ResultadoLote> {
  const db = await baseDeDatos();
  const ciclo = await exigirCiclo(params.cicloId);

  // Un reintento no vuelve a apartar: se contesta lo que ya se dio.
  if (params.clientUuid) {
    const previo = await db
      .select()
      .from(labelPrintHistory)
      .where(eq(labelPrintHistory.clientUuid, params.clientUuid))
      .limit(1);
    if (previo.length > 0) {
      const lote = previo[0];
      const suyas = await db
        .select({ folio: labels.folio, codigo: labels.code })
        .from(labels)
        .where(eq(labels.batchId, lote.id))
        .orderBy(labels.folio);
      return {
        loteId: lote.id,
        cicloId: lote.cycleId ?? ciclo.id,
        cicloNombre: ciclo.name,
        cortadora: lote.harvesterNumber,
        texto: lote.labelText,
        cantidad: lote.quantity,
        folioStart: lote.folioStart,
        folioEnd: lote.folioEnd,
        etiquetas: suyas,
        yaExistia: true,
      };
    }
  }

  return await db.transaction(async (tx) => {
    // El contador del ciclo tiene que existir para poder bloquearlo, y arranca
    // donde ese ciclo se haya quedado:
    //
    //   · un ciclo recién abierto no tiene historial → empieza en cero, que es
    //     el reinicio del folio;
    //   · un ciclo que ya imprimió sigue desde su propio máximo, así que poder
    //     escoger un ciclo viejo nunca repite un código dentro de él.
    //
    // INSERT IGNORE: si el contador ya existe, esto no lo toca.
    await tx.execute(sql`
      INSERT IGNORE INTO labelFolioCounters (cycleId, lastFolio)
      SELECT ${ciclo.id}, COALESCE(MAX(folioEnd), 0)
      FROM labelPrintHistory WHERE cycleId = ${ciclo.id}
    `);

    // FOR UPDATE bloquea el renglón hasta que esta transacción termine. Es lo
    // único que impide que dos básculas lean el mismo último folio.
    const actual = filas<{ lastFolio: number }>(
      await tx.execute(
        sql`SELECT lastFolio FROM labelFolioCounters WHERE cycleId = ${ciclo.id} FOR UPDATE`,
      ),
    );
    const ultimoFolio = Number(actual[0]?.lastFolio ?? 0);

    validarPeticion(params.cortadora, params.cantidad, ultimoFolio);
    const { folioStart, folioEnd } = calcularRango(ultimoFolio, params.cantidad);

    await tx.execute(
      sql`UPDATE labelFolioCounters SET lastFolio = ${folioEnd} WHERE cycleId = ${ciclo.id}`,
    );

    const [lote] = await tx.insert(labelPrintHistory).values({
      harvesterNumber: params.cortadora,
      labelText: params.texto,
      folioStart,
      folioEnd,
      quantity: params.cantidad,
      printedBy: params.usuarioId ?? null,
      cycleId: ciclo.id,
      deviceId: params.deviceId ?? null,
      clientUuid: params.clientUuid ?? null,
      status: "pendiente",
    });

    const loteId = Number((lote as any).insertId);

    const etiquetas: EtiquetaAsignada[] = [];
    for (let folio = folioStart; folio <= folioEnd; folio++) {
      etiquetas.push({ folio, codigo: armarCodigo(params.cortadora, folio) });
    }

    // En tandas para no armar una sola instrucción enorme con lotes de 5000.
    const TANDA = 1000;
    for (let i = 0; i < etiquetas.length; i += TANDA) {
      await tx.insert(labels).values(
        etiquetas.slice(i, i + TANDA).map((e) => ({
          cycleId: ciclo.id,
          harvesterNumber: params.cortadora,
          folio: e.folio,
          code: e.codigo,
          batchId: loteId,
          status: "asignada" as const,
          printedByUserId: params.usuarioId ?? null,
          deviceId: params.deviceId ?? null,
        })),
      );
    }

    return {
      loteId,
      cicloId: ciclo.id,
      cicloNombre: ciclo.name,
      cortadora: params.cortadora,
      texto: params.texto,
      cantidad: params.cantidad,
      folioStart,
      folioEnd,
      etiquetas,
      yaExistia: false,
    };
  });
}

// ─────────────────────────── cierre del lote ───────────────────────────

async function loteOFalla(db: any, loteId: number) {
  const [lote] = await db
    .select()
    .from(labelPrintHistory)
    .where(eq(labelPrintHistory.id, loteId))
    .limit(1);
  if (!lote) {
    throw new ErrorEtiqueta("lote_desconocido", `No existe el lote ${loteId}`);
  }
  return lote;
}

/** La impresora terminó bien: las etiquetas salen al campo y deben regresar. */
export async function confirmarLote(loteId: number): Promise<{ confirmadas: number }> {
  const db = await baseDeDatos();
  const lote = await loteOFalla(db, loteId);

  if (lote.status === "cancelado") {
    throw new ErrorEtiqueta(
      "lote_cancelado",
      "Ese lote ya se había cancelado y sus folios quedaron quemados",
      "Pide un lote nuevo: los folios cancelados no se reutilizan.",
    );
  }

  const ahora = new Date();
  await db
    .update(labels)
    .set({ status: "impresa", printedAt: ahora })
    .where(and(eq(labels.batchId, loteId), eq(labels.status, "asignada")));
  await db
    .update(labelPrintHistory)
    .set({ status: "impreso" })
    .where(eq(labelPrintHistory.id, loteId));

  const cuenta = filas<{ n: number }>(
    await db.execute(
      sql`SELECT COUNT(*) AS n FROM labels WHERE batchId = ${loteId} AND status = 'impresa'`,
    ),
  );
  return { confirmadas: Number(cuenta[0]?.n ?? 0) };
}

/**
 * Se atoró el rollo, se cortó a la mitad, salió al revés.
 *
 * Los folios quedan quemados: no se devuelven al contador. Perder doscientos
 * números no cuesta nada; repetirlos cuesta una recepción entera.
 *
 * Las etiquetas que ya regresaron con una caja (`usada`) no se tocan: cancelar
 * un lote no puede borrar cosecha que ya se pesó.
 */
export async function cancelarLote(
  loteId: number,
  motivo?: string,
): Promise<{ canceladas: number }> {
  const db = await baseDeDatos();
  await loteOFalla(db, loteId);

  const ahora = new Date();
  await db
    .update(labels)
    .set({ status: "cancelada", canceledAt: ahora, canceledReason: motivo?.slice(0, 255) ?? null })
    .where(and(eq(labels.batchId, loteId), inArray(labels.status, ["asignada", "impresa"])));
  await db
    .update(labelPrintHistory)
    .set({ status: "cancelado" })
    .where(eq(labelPrintHistory.id, loteId));

  const cuenta = filas<{ n: number }>(
    await db.execute(
      sql`SELECT COUNT(*) AS n FROM labels WHERE batchId = ${loteId} AND status = 'cancelada'`,
    ),
  );
  return { canceladas: Number(cuenta[0]?.n ?? 0) };
}

/**
 * Una etiqueta se mojó o se despegó: sale otra con folio nuevo.
 *
 * La vieja queda marcada como reemplazada y apunta a la nueva, para que el
 * conteo de "impresas que nunca volvieron" no se descuadre con las que sí
 * volvieron pero con otro número.
 */
export async function reimprimirEtiqueta(params: {
  codigo: string;
  motivo?: string;
  cicloId?: number | null;
  usuarioId?: number | null;
  deviceId?: string | null;
  clientUuid?: string | null;
}): Promise<ResultadoLote & { reemplaza: string }> {
  const db = await baseDeDatos();
  const ciclo = await exigirCiclo(params.cicloId);

  const [vieja] = await db
    .select()
    .from(labels)
    .where(and(eq(labels.cycleId, ciclo.id), eq(labels.code, params.codigo)))
    .limit(1);

  if (!vieja) {
    throw new ErrorEtiqueta(
      "etiqueta_desconocida",
      `La etiqueta ${params.codigo} no existe en el ciclo ${ciclo.name}`,
      "Revisa el código. Recuerda que el folio se reinicia en cada ciclo: ese código puede existir en una cosecha anterior.",
    );
  }
  if (!puedeTransicionar(vieja.status as EstadoEtiqueta, "reimpresa")) {
    throw new ErrorEtiqueta(
      "estado_no_permite",
      `La etiqueta ${params.codigo} está ${vieja.status} y no se puede reimprimir`,
      vieja.status === "usada"
        ? "Esa etiqueta ya regresó con una caja pesada."
        : "Solo se reimprime una etiqueta que anda en el campo.",
    );
  }

  const nuevo = await apartarFolios({
    cortadora: vieja.harvesterNumber,
    cantidad: 1,
    texto: `Reimpresión de ${params.codigo}`,
    cicloId: ciclo.id,
    usuarioId: params.usuarioId,
    deviceId: params.deviceId,
    clientUuid: params.clientUuid,
  });

  const [reemplazo] = await db
    .select({ id: labels.id })
    .from(labels)
    .where(eq(labels.batchId, nuevo.loteId))
    .limit(1);

  await db
    .update(labels)
    .set({ status: "reimpresa", replacedByLabelId: reemplazo?.id ?? null })
    .where(eq(labels.id, vieja.id));

  return { ...nuevo, reemplaza: params.codigo };
}

// ─────────────────────────── consultas ───────────────────────────

/**
 * El expediente de una etiqueta.
 *
 * Para códigos anteriores a este módulo no hay renglón en `labels`, así que se
 * contesta con los datos del lote que la imprimió en vez de inventar uno: se
 * sabe de qué tanda salió y cuándo, que es lo que se puede saber de verdad.
 */
export async function expedienteEtiqueta(codigo: string, cicloId?: number) {
  const db = await baseDeDatos();
  const ciclo = cicloId ?? (await cicloDeHoy())?.id ?? null;

  const partes = desarmarCodigo(codigo);
  if (!partes) {
    throw new ErrorEtiqueta(
      "codigo_invalido",
      `"${codigo}" no tiene la forma de un código de caja`,
      "El formato es CC-FFFFFF, por ejemplo 07-000123.",
    );
  }

  const encontradas = await db
    .select()
    .from(labels)
    .where(
      ciclo === null
        ? eq(labels.code, codigo)
        : and(eq(labels.code, codigo), eq(labels.cycleId, ciclo)),
    )
    .limit(1);

  // En qué otros ciclos existe el mismo código: con el folio reiniciándose,
  // esto no es un error sino la norma, y quien pregunte debe saberlo.
  const enOtrosCiclos = filas<{ cycleId: number; nombre: string }>(
    await db.execute(sql`
      SELECT l.cycleId, c.name AS nombre
      FROM labels l LEFT JOIN productionCycles c ON c.id = l.cycleId
      WHERE l.code = ${codigo}
      GROUP BY l.cycleId, c.name
    `),
  );

  if (encontradas.length === 0) {
    // Camino de lo viejo: el rango del lote todavía sabe la respuesta
    const lotes = filas<any>(
      await db.execute(sql`
        SELECT id, harvesterNumber, labelText, folioStart, folioEnd, printedAt, cycleId
        FROM labelPrintHistory
        WHERE harvesterNumber = ${partes.cortadora}
          AND folioStart <= ${partes.folio} AND folioEnd >= ${partes.folio}
        ORDER BY printedAt DESC LIMIT 1
      `),
    );
    if (lotes.length === 0) {
      throw new ErrorEtiqueta(
        "etiqueta_desconocida",
        `No hay rastro de la etiqueta ${codigo}`,
        "Puede ser de antes de que se llevara el control por etiqueta, o el código está mal leído.",
      );
    }
    return {
      codigo,
      detalle: "lote",
      aviso: "Esta etiqueta es anterior al control por etiqueta: solo se conoce el lote del que salió.",
      lote: lotes[0],
      enOtrosCiclos,
    };
  }

  const etiqueta = encontradas[0];
  const caja = etiqueta.boxId
    ? (await db.select().from(boxes).where(eq(boxes.id, etiqueta.boxId)).limit(1))[0] ?? null
    : null;
  const [lote] = await db
    .select()
    .from(labelPrintHistory)
    .where(eq(labelPrintHistory.id, etiqueta.batchId))
    .limit(1);

  return { codigo, detalle: "etiqueta", etiqueta, caja, lote, enOtrosCiclos };
}

/**
 * Las impresas que nunca volvieron. Es el reporte que hoy no existe y el que
 * convierte "imprimimos de más" en un número por cortadora.
 */
export async function etiquetasPendientes(params: {
  cicloId?: number;
  cortadora?: number;
  limite?: number;
}) {
  const db = await baseDeDatos();
  const ciclo = params.cicloId ?? (await cicloDeHoy())?.id ?? null;
  if (ciclo === null) return { cicloId: null, cortadoras: [], total: 0 };

  const condiciones = [eq(labels.cycleId, ciclo), eq(labels.status, "impresa")];
  if (params.cortadora !== undefined) {
    condiciones.push(eq(labels.harvesterNumber, params.cortadora));
  }

  const porCortadora = await db
    .select({
      cortadora: labels.harvesterNumber,
      pendientes: sql<number>`COUNT(*)`,
      primerFolio: sql<number>`MIN(${labels.folio})`,
      ultimoFolio: sql<number>`MAX(${labels.folio})`,
      masVieja: sql<string>`MIN(${labels.printedAt})`,
    })
    .from(labels)
    .where(and(...condiciones))
    .groupBy(labels.harvesterNumber)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(params.limite ?? 100);

  const total = porCortadora.reduce((s, c) => s + Number(c.pendientes), 0);
  return { cicloId: ciclo, cortadoras: porCortadora, total };
}

/** Cuántas impresas, usadas y canceladas lleva el ciclo. */
export async function resumenEtiquetas(cicloId?: number) {
  const db = await baseDeDatos();
  const ciclo = cicloId ?? (await cicloDeHoy())?.id ?? null;
  if (ciclo === null) return { cicloId: null, porEstado: {}, total: 0, porCortadora: [] };

  const estados = filas<{ status: EstadoEtiqueta; n: number }>(
    await db.execute(
      sql`SELECT status, COUNT(*) AS n FROM labels WHERE cycleId = ${ciclo} GROUP BY status`,
    ),
  );

  const porEstado: Record<string, number> = {};
  let total = 0;
  for (const e of estados) {
    porEstado[e.status] = Number(e.n);
    total += Number(e.n);
  }

  const porCortadora = filas<any>(
    await db.execute(sql`
      SELECT harvesterNumber AS cortadora,
             COUNT(*) AS total,
             SUM(status = 'impresa')   AS pendientes,
             SUM(status = 'usada')     AS usadas,
             SUM(status = 'cancelada') AS canceladas
      FROM labels WHERE cycleId = ${ciclo}
      GROUP BY harvesterNumber ORDER BY total DESC
    `),
  );

  return { cicloId: ciclo, porEstado, total, porCortadora };
}

/** El historial de impresión. */
export async function listarLotes(params: {
  cicloId?: number;
  cortadora?: number;
  desde?: string;
  hasta?: string;
  limite?: number;
}) {
  const db = await baseDeDatos();
  const condiciones = [];
  if (params.cicloId !== undefined) condiciones.push(eq(labelPrintHistory.cycleId, params.cicloId));
  if (params.cortadora !== undefined) {
    condiciones.push(eq(labelPrintHistory.harvesterNumber, params.cortadora));
  }
  if (params.desde) condiciones.push(gte(labelPrintHistory.printedAt, new Date(`${params.desde}T00:00:00`)));
  if (params.hasta) condiciones.push(lte(labelPrintHistory.printedAt, new Date(`${params.hasta}T23:59:59`)));

  const base = db.select().from(labelPrintHistory);
  const consulta = condiciones.length > 0 ? base.where(and(...condiciones)) : base;
  return await consulta.orderBy(desc(labelPrintHistory.printedAt)).limit(params.limite ?? 50);
}

// ─────────────────────────── plantilla de impresión ───────────────────────────

/**
 * El formato TSPL con marcadores, servido desde el servidor.
 *
 * Va aquí y no dentro del kiosco para que cambiar el diseño de la etiqueta no
 * exija un APK nuevo ni bajar a las básculas del campo. Los marcadores los
 * reemplaza quien imprime: {{texto}} y {{codigo}}.
 */
export const PLANTILLA_TSPL = [
  "SIZE 38 mm, 25 mm",
  "GAP 3 mm, 0 mm",
  "DIRECTION 1",
  "CLS",
  'TEXT 65,10,"2",0,1,1,"{{texto}}"',
  'BARCODE 45,50,"128",75,1,0,2,3,"{{codigo}}"',
  "PRINT 1,1",
].join("\r\n");

export function plantillaImpresion() {
  return {
    formato: "TSPL",
    impresora: "Sumprint XP-365B y compatibles",
    medida: { anchoMm: 38, altoMm: 25, separacionMm: 3 },
    marcadores: {
      "{{texto}}": "El texto de arriba, por ejemplo “Cosecha SR 30”",
      "{{codigo}}": "El código de barras, con la forma CC-FFFFFF",
    },
    plantilla: PLANTILLA_TSPL,
    nota: "Una etiqueta por bloque. Para un lote, se repite el bloque cambiando {{codigo}}.",
  };
}
