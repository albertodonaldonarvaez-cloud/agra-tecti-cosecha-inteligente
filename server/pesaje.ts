/**
 * Pesaje de cajas desde el kiosco de báscula.
 *
 * El kiosco pesa sin señal y guarda en la tableta. Cuando vuelve la red vacía
 * su cola aquí. Eso define todo lo demás: esta función se va a llamar dos
 * veces con los mismos datos, y tiene que dar el mismo resultado.
 *
 * ── Lo que NO se rechaza ──────────────────────────────────────────────
 *
 * Un peso ya ocurrió. Devolver un error borra una medición del mundo real y
 * deja al kiosco reintentando para siempre. Por eso aquí solo se rechaza lo
 * que es imposible de guardar (sin código, sin peso, peso negativo) y todo lo
 * demás entra MARCADO:
 *
 *   · peso_alto        arriba de 15 kg. Es la misma regla que ya usa la
 *                      sincronización de Kobo: se guarda para revisión manual
 *                      porque casi siempre es un punto decimal mal puesto, y
 *                      descartarla perdería una caja buena de vez en cuando.
 *   · codigo_repetido  ya había una caja con ese código en el mismo ciclo.
 *                      Se guarda igual y se reporta: inflar el total es feo,
 *                      pero tirar el peso de una caja que sí se cosechó es
 *                      peor, y el duplicado se archiva desde la web en un
 *                      clic. GET /cosecha/conflictos los lista.
 *   · sin_etiqueta     el código no está en la tabla de etiquetas. Va a ser lo
 *                      normal durante semanas: esa tabla nació vacía en la
 *                      0027 y solo se llena con lo que se imprima de ahora en
 *                      adelante. Rechazar aquí dejaría la báscula inservible.
 *   · etiqueta_cancelada  volvió una etiqueta que se había dado por quemada.
 *
 * ── La idempotencia ───────────────────────────────────────────────────
 *
 * Cada pesaje viaja con un clientUuid que el kiosco genera al guardarlo en su
 * propia base, no al mandarlo. Si la respuesta se pierde a medio camino, el
 * reenvío trae el mismo uuid y aquí se contesta "duplicada" con el id de la
 * caja que ya se creó. La columna boxes.clientUuid tiene índice único, así que
 * ni siquiera dos envíos simultáneos pueden crear la caja dos veces: el
 * segundo choca contra el índice y se resuelve leyendo lo que escribió el
 * primero.
 *
 * ── Por qué el ciclo sale de la fecha ─────────────────────────────────
 *
 * Igual que en la pantalla de cajas: se deduce del momento del pesaje con
 * shared/ciclos.ts, la misma regla que usó la migración. Una cola de tres días
 * sin señal reparte sus cajas en el ciclo que les toca, no en el de hoy.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  boxTypes,
  boxes,
  harvesters,
  labels,
  parcels,
  productionCycles,
} from "../drizzle/schema";
import { getDb } from "./db";
import { resolverCiclo, type CicloRango } from "../shared/ciclos";
import { ErrorEtiqueta, desarmarCodigo, puedeTransicionar, type EstadoEtiqueta } from "./etiquetas";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import { PHOTOS_PUBLIC_PREFIX, PHOTOS_ROOT } from "./koboPhotoStore";

const ZONA = "America/Mexico_City";

/** Cuántas cajas caben en un envío. Una cola de un día cabe de sobra. */
export const CAJAS_POR_ENVIO = 200;

/** Arriba de esto se marca para revisión. NO se rechaza (ver koboSync.ts). */
export const PESO_ALTO_GRAMOS = 15_000;

/** Tope de cordura: una tonelada en una caja de higo no existe. */
export const PESO_MAXIMO_GRAMOS = 1_000_000;

/** Lo que ya usa historicalDataSync.ts para una caja sin parcela. */
export const SIN_PARCELA_CODIGO = "SIN_PARCELA";
export const SIN_PARCELA_NOMBRE = "Sin parcela definida";

/** Margen para el reloj de la tableta. Más allá, la fecha va al ciclo equivocado. */
const DIAS_DE_HOLGURA = 2;

// ───────────────────────────── el peso ─────────────────────────────

export interface PesoResuelto {
  bruto: number | null;
  tara: number | null;
  neto: number;
  avisos: string[];
}

function gramos(valor: unknown, nombre: string): number | null {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = Number(valor);
  if (!Number.isInteger(n)) {
    throw new ErrorEtiqueta(
      "peso_invalido",
      `"${nombre}" tiene que ser un número entero de gramos y llegó ${JSON.stringify(valor)}`,
      "El peso viaja en gramos enteros. 12.345 kg se manda como 12345.",
    );
  }
  if (n < 0) {
    throw new ErrorEtiqueta("peso_invalido", `"${nombre}" no puede ser negativo`);
  }
  if (n > PESO_MAXIMO_GRAMOS) {
    throw new ErrorEtiqueta(
      "peso_invalido",
      `"${nombre}" vale ${n} g, que es más de una tonelada`,
      "Revisa si la báscula mandó kilos donde se esperaban gramos.",
    );
  }
  return n;
}

/**
 * De lo que manda el kiosco al neto que se guarda.
 *
 * boxes.weight SIEMPRE ha sido el peso neto y lo sigue siendo. El bruto y la
 * tara se guardan aparte para poder auditar una báscula descalibrada.
 */
export function resolverPeso(crudo: {
  pesoBrutoGramos?: unknown;
  taraGramos?: unknown;
  pesoNetoGramos?: unknown;
}): PesoResuelto {
  const bruto = gramos(crudo.pesoBrutoGramos, "pesoBrutoGramos");
  const tara = gramos(crudo.taraGramos, "taraGramos");
  const netoDado = gramos(crudo.pesoNetoGramos, "pesoNetoGramos");
  const avisos: string[] = [];

  let neto: number;
  if (bruto !== null) {
    const t = tara ?? 0;
    if (t >= bruto) {
      throw new ErrorEtiqueta(
        "peso_no_positivo",
        `El bruto es ${bruto} g y la tara ${t} g: la caja pesaría cero o menos`,
        "Revisa la tara configurada en la báscula.",
      );
    }
    neto = bruto - t;
    // Que el kiosco mande las tres y no cuadren significa que alguien calculó
    // mal de un lado. Callarlo escondería el error justo donde importa.
    if (netoDado !== null && netoDado !== neto) {
      throw new ErrorEtiqueta(
        "peso_inconsistente",
        `Llegó neto ${netoDado} g, pero bruto menos tara da ${neto} g`,
        "Manda el bruto y la tara, o solo el neto. Los tres juntos tienen que cuadrar.",
      );
    }
    if (tara === null) avisos.push("sin_tara");
  } else {
    if (netoDado === null) {
      throw new ErrorEtiqueta(
        "peso_requerido",
        "No llegó ningún peso",
        "Manda pesoBrutoGramos (con taraGramos si la báscula la aplica) o pesoNetoGramos.",
      );
    }
    if (netoDado === 0) {
      throw new ErrorEtiqueta("peso_no_positivo", "El peso neto es cero");
    }
    neto = netoDado;
    avisos.push("sin_bruto");
  }

  if (neto > PESO_ALTO_GRAMOS) avisos.push("peso_alto");
  return { bruto, tara, neto, avisos };
}

// ───────────────────────────── la fecha ─────────────────────────────

function hoyMx(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
}

function diaEnZona(fecha: Date): string {
  return fecha.toLocaleDateString("en-CA", { timeZone: ZONA });
}

/**
 * Instante completo, con zona. No se acepta nada más suelto que esto, y la
 * razón es que todo lo que JavaScript acepta de más falla en silencio:
 *
 *   "10/09/2026"            se lee como 9 de OCTUBRE, a la americana
 *   "2026-09-07"            es medianoche UTC, o sea las 18:00 del día 6 en
 *                           México: la caja se va al día anterior
 *   "2026-09-07T14:23:00"   sin zona, se interpreta con el reloj del servidor,
 *                           que en el contenedor está en UTC
 *
 * Ninguno de los tres da un error: dan una fecha distinta de la que el pesador
 * tenía enfrente, y eso decide a qué día y a qué ciclo va la caja.
 */
const ISO_CON_ZONA =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?([.][0-9]+)?(Z|[+-][0-9]{2}:?[0-9]{2})$/;

/**
 * Cuándo se pesó, según la tableta.
 *
 * Se revisa contra el reloj del servidor porque una tableta con la hora mal
 * puesta no falla de forma ruidosa: mete la cosecha en el ciclo equivocado y
 * nadie se entera hasta que los totales no cuadran meses después.
 */
export function resolverMomento(texto: unknown, ahora = new Date()): Date {
  if (texto === undefined || texto === null || texto === "") return ahora;
  const crudo = String(texto).trim();
  const fecha = ISO_CON_ZONA.test(crudo) ? new Date(crudo) : new Date(NaN);
  if (Number.isNaN(fecha.getTime())) {
    throw new ErrorEtiqueta(
      "fecha_invalida",
      `"pesadoEn" no se entiende o no trae zona horaria: ${JSON.stringify(texto)}`,
      "Manda el instante completo en ISO 8601 CON zona, por ejemplo 2026-09-10T14:23:00-06:00. Sin zona, la caja se guarda en otro día.",
    );
  }
  const dias = (fecha.getTime() - ahora.getTime()) / 86_400_000;
  if (dias > DIAS_DE_HOLGURA) {
    throw new ErrorEtiqueta(
      "fecha_futura",
      `"pesadoEn" cae ${Math.round(dias)} días en el futuro`,
      "El reloj de la tableta está mal. Corrígelo antes de vaciar la cola: la fecha decide a qué ciclo va la caja.",
    );
  }
  if (fecha.getUTCFullYear() < 2020) {
    throw new ErrorEtiqueta(
      "fecha_invalida",
      `"pesadoEn" cae en ${fecha.getUTCFullYear()}`,
      "El reloj de la tableta se reinició. Corrígelo antes de vaciar la cola.",
    );
  }
  return fecha;
}

// ───────────────────────────── recepción ─────────────────────────────

export interface CajaPesada {
  clientUuid?: unknown;
  codigo?: unknown;
  pesoBrutoGramos?: unknown;
  taraGramos?: unknown;
  pesoNetoGramos?: unknown;
  tipoCajaId?: unknown;
  ciclo?: unknown;
  parcela?: unknown;
  pesadoEn?: unknown;
  latitud?: unknown;
  longitud?: unknown;
}

export type EstadoRecepcion = "creada" | "duplicada" | "rechazada";

export interface ResultadoCaja {
  indice: number;
  clientUuid: string | null;
  codigo: string | null;
  estado: EstadoRecepcion;
  cajaId?: number;
  cicloId?: number | null;
  cicloNombre?: string | null;
  pesoNetoGramos?: number;
  etiquetaId?: number | null;
  avisos?: string[];
  error?: { codigo: string; mensaje: string; ayuda?: string };
}

async function baseDeDatos() {
  const db = await getDb();
  if (!db) throw new ErrorEtiqueta("sin_base", "La base de datos no está disponible");
  return db;
}

function filas<T = any>(resultado: unknown): T[] {
  if (Array.isArray(resultado) && Array.isArray(resultado[0])) return resultado[0] as T[];
  return (resultado as T[]) ?? [];
}

function textoCorto(valor: unknown, max: number): string | null {
  if (valor === undefined || valor === null || valor === "") return null;
  const t = String(valor).trim();
  return t === "" ? null : t.slice(0, max);
}

interface Preparada {
  indice: number;
  clientUuid: string;
  codigo: string;
  cortadora: number;
  peso: PesoResuelto;
  pesadoEn: Date;
  cicloId: number | null;
  cicloNombre: string | null;
  tipoCajaId: number | null;
  parcela: string | null;
  latitud: string | null;
  longitud: string | null;
  avisos: string[];
}

export interface ResumenRecepcion {
  recibidas: number;
  creadas: number;
  duplicadas: number;
  rechazadas: number;
  conRevision: number;
  resultados: ResultadoCaja[];
}

export async function recibirCajas(params: {
  cajas: CajaPesada[];
  usuarioId: number;
  deviceId: string | null;
}): Promise<ResumenRecepcion> {
  const { cajas, usuarioId, deviceId } = params;

  if (!Array.isArray(cajas) || cajas.length === 0) {
    throw new ErrorEtiqueta(
      "envio_vacio",
      "No llegó ninguna caja",
      'Manda {"cajas": [ … ]} con al menos una.',
    );
  }
  if (cajas.length > CAJAS_POR_ENVIO) {
    throw new ErrorEtiqueta(
      "envio_muy_grande",
      `Llegaron ${cajas.length} cajas y el máximo por envío es ${CAJAS_POR_ENVIO}`,
      `Parte la cola en tandas de ${CAJAS_POR_ENVIO} o menos.`,
    );
  }

  const db = await baseDeDatos();

  // Contexto que se lee UNA vez para todo el envío. Leerlo por caja convertiría
  // una cola de doscientas en ochocientas consultas al MySQL de producción.
  const ciclos = (await db
    .select({
      id: productionCycles.id,
      name: productionCycles.name,
      startDate: productionCycles.startDate,
      endDate: productionCycles.endDate,
    })
    .from(productionCycles)) as Array<CicloRango & { name: string }>;
  const nombreDeCiclo = new Map(ciclos.map((c) => [c.id, c.name]));
  const hoy = hoyMx();

  const tipos = await db
    .select({ id: boxTypes.id, tareGrams: boxTypes.tareGrams, isActive: boxTypes.isActive })
    .from(boxTypes);
  const taraDeTipo = new Map(tipos.map((t) => [t.id, t]));

  // ── Primera pasada: lo que se puede revisar sin tocar la base ──
  const resultados: ResultadoCaja[] = [];
  const listas: Preparada[] = [];
  const vistosEnEsteEnvio = new Set<string>();

  cajas.forEach((cruda, indice) => {
    const clientUuid = textoCorto(cruda.clientUuid, 64);
    const codigo = textoCorto(cruda.codigo, 64);
    try {
      if (!clientUuid) {
        throw new ErrorEtiqueta(
          "client_uuid_requerido",
          "Falta clientUuid",
          "Genera un uuid al guardar el pesaje en la tableta, no al mandarlo: es lo que hace que reenviar no duplique la caja.",
        );
      }
      if (vistosEnEsteEnvio.has(clientUuid)) {
        throw new ErrorEtiqueta(
          "client_uuid_repetido",
          `El clientUuid ${clientUuid} viene dos veces en el mismo envío`,
          "Cada pesaje lleva el suyo.",
        );
      }
      vistosEnEsteEnvio.add(clientUuid);

      if (!codigo) {
        throw new ErrorEtiqueta(
          "codigo_requerido",
          "Falta el código de la caja",
          "Un peso sin código no se puede cotejar con nada. Déjalo en la tableta y resuélvelo a mano.",
        );
      }
      const partes = desarmarCodigo(codigo);
      if (!partes) {
        throw new ErrorEtiqueta(
          "codigo_invalido",
          `"${codigo}" no tiene la forma de un código de caja`,
          "El formato es CC-FFFFFF, por ejemplo 07-000123.",
        );
      }

      const avisos: string[] = [];

      // La tara puede venir del catálogo en vez de tecleada. Es justo para lo
      // que existe boxTypes: teclearla cientos de veces al día se equivoca.
      let taraGramos = cruda.taraGramos;
      let tipoCajaId: number | null = null;
      if (cruda.tipoCajaId !== undefined && cruda.tipoCajaId !== null && cruda.tipoCajaId !== "") {
        const id = Number(cruda.tipoCajaId);
        const tipo = Number.isInteger(id) ? taraDeTipo.get(id) : undefined;
        if (!tipo) {
          throw new ErrorEtiqueta(
            "tipo_de_caja_desconocido",
            `No existe el tipo de caja ${cruda.tipoCajaId}`,
            "Consulta GET /api/campo/v1/cosecha/tipos-de-caja.",
          );
        }
        tipoCajaId = tipo.id;
        if (!tipo.isActive) avisos.push("tipo_de_caja_inactivo");
        if (taraGramos === undefined || taraGramos === null || taraGramos === "") {
          taraGramos = tipo.tareGrams;
        }
      }

      const peso = resolverPeso({
        pesoBrutoGramos: cruda.pesoBrutoGramos,
        taraGramos,
        pesoNetoGramos: cruda.pesoNetoGramos,
      });
      avisos.push(...peso.avisos);

      const pesadoEn = resolverMomento(cruda.pesadoEn);

      // El ciclo: el que se pida a propósito, o el que le toque a la fecha.
      let cicloId: number | null;
      if (cruda.ciclo !== undefined && cruda.ciclo !== null && cruda.ciclo !== "") {
        const id = Number(cruda.ciclo);
        if (!Number.isInteger(id) || !nombreDeCiclo.has(id)) {
          throw new ErrorEtiqueta(
            "ciclo_desconocido",
            `No existe el ciclo ${cruda.ciclo}`,
            "Consulta GET /api/campo/v1/ciclos, o no mandes el campo y se deduce de la fecha.",
          );
        }
        cicloId = id;
      } else {
        cicloId = resolverCiclo(diaEnZona(pesadoEn), ciclos, hoy);
        // Sin ciclo no es un error: la pantalla de cajas ya sabe enseñarlas
        // aparte, y son justo las que hay que revisar.
        if (cicloId === null) avisos.push("sin_ciclo");
      }

      listas.push({
        indice,
        clientUuid,
        codigo,
        cortadora: partes.cortadora,
        peso,
        pesadoEn,
        cicloId,
        cicloNombre: cicloId === null ? null : nombreDeCiclo.get(cicloId) ?? null,
        tipoCajaId,
        parcela: textoCorto(cruda.parcela, 64),
        latitud: textoCorto(cruda.latitud, 64),
        longitud: textoCorto(cruda.longitud, 64),
        avisos,
      });
    } catch (e) {
      if (!(e instanceof ErrorEtiqueta)) throw e;
      resultados.push({
        indice,
        clientUuid,
        codigo,
        estado: "rechazada",
        error: { codigo: e.codigo, mensaje: e.message, ayuda: e.ayuda },
      });
    }
  });

  if (listas.length === 0) {
    return resumir(cajas.length, resultados);
  }

  // ── Segunda pasada: lo que sí necesita la base, en bloque ──
  const uuids = listas.map((l) => l.clientUuid);
  const yaGuardadas = new Map<string, { id: number; cycleId: number | null }>();
  for (const fila of await db
    .select({ id: boxes.id, clientUuid: boxes.clientUuid, cycleId: boxes.cycleId })
    .from(boxes)
    .where(inArray(boxes.clientUuid, uuids))) {
    if (fila.clientUuid) yaGuardadas.set(fila.clientUuid, { id: fila.id, cycleId: fila.cycleId });
  }

  // Los códigos agrupados por ciclo.
  //
  // Se busca así, y no por código a secas, porque el único índice que hay es
  // (cycleId, boxCode) y su primera columna es el ciclo: una consulta que solo
  // filtra por código no lo puede usar y recorre la tabla entera de cajas. Una
  // tanda trae uno o dos ciclos, así que esto son una o dos búsquedas exactas.
  const porCiclo = new Map<number | null, Set<string>>();
  for (const l of listas) {
    const grupo = porCiclo.get(l.cicloId) ?? new Set<string>();
    grupo.add(l.codigo);
    porCiclo.set(l.cicloId, grupo);
  }
  const grupos = Array.from(porCiclo, ([ciclo, codigos]) => ({
    ciclo,
    codigos: Array.from(codigos),
  }));

  const deEseCiclo = (ciclo: number | null) =>
    ciclo === null ? isNull(boxes.cycleId) : eq(boxes.cycleId, ciclo);

  // Códigos que ya traen una caja. El folio se reinicia en cada ciclo, así que
  // el mismo 07-000123 existe a propósito en dos cosechas y solo choca dentro
  // de la suya.
  const ocupados = new Set<string>();
  for (const grupo of grupos) {
    for (const fila of await db
      .select({ boxCode: boxes.boxCode, cycleId: boxes.cycleId })
      .from(boxes)
      .where(
        and(
          deEseCiclo(grupo.ciclo),
          inArray(boxes.boxCode, grupo.codigos),
          eq(boxes.archived, false),
        ),
      )) {
      ocupados.add(`${fila.cycleId ?? "sin"}|${fila.boxCode}`);
    }
  }

  // Lo mismo con las etiquetas: su clave única también empieza por el ciclo.
  const etiquetas = new Map<string, { id: number; status: EstadoEtiqueta; boxId: number | null }>();
  for (const grupo of grupos) {
    if (grupo.ciclo === null) continue; // sin ciclo no hay etiqueta que buscar
    for (const fila of await db
      .select({
        id: labels.id,
        cycleId: labels.cycleId,
        code: labels.code,
        status: labels.status,
        boxId: labels.boxId,
      })
      .from(labels)
      .where(and(eq(labels.cycleId, grupo.ciclo), inArray(labels.code, grupo.codigos)))) {
      etiquetas.set(`${fila.cycleId}|${fila.code}`, {
        id: fila.id,
        status: fila.status as EstadoEtiqueta,
        boxId: fila.boxId,
      });
    }
  }

  // Las parcelas que se nombraron, para poder guardar el nombre y no solo el código
  const nombreDeParcela = new Map<string, string>();
  const codigosDeParcela = Array.from(
    new Set(listas.map((l) => l.parcela).filter((p): p is string => !!p)),
  );
  if (codigosDeParcela.length > 0) {
    for (const fila of await db
      .select({ code: parcels.code, name: parcels.name })
      .from(parcels)
      .where(inArray(parcels.code, codigosDeParcela))) {
      nombreDeParcela.set(fila.code, fila.name);
    }
  }

  // Las cortadoras que aparezcan y no estén dadas de alta. Es lo mismo que hace
  // la sincronización de Kobo: la cortadora la crea el primer dato que la nombra.
  const cortadoras = Array.from(new Set(listas.map((l) => l.cortadora)));
  for (const numero of cortadoras) {
    await db
      .insert(harvesters)
      .values({ number: numero })
      .onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
  }

  for (const lista of listas) {
    const clave = `${lista.cicloId ?? "sin"}|${lista.codigo}`;
    try {
      const yaEstaba = yaGuardadas.get(lista.clientUuid);
      if (yaEstaba) {
        resultados.push({
          indice: lista.indice,
          clientUuid: lista.clientUuid,
          codigo: lista.codigo,
          estado: "duplicada",
          cajaId: yaEstaba.id,
          cicloId: yaEstaba.cycleId,
          cicloNombre:
            yaEstaba.cycleId === null ? null : nombreDeCiclo.get(yaEstaba.cycleId) ?? null,
          avisos: ["ya_estaba"],
        });
        continue;
      }

      const avisos = [...lista.avisos];
      if (ocupados.has(clave)) avisos.push("codigo_repetido");

      const etiqueta = lista.cicloId === null ? undefined : etiquetas.get(clave);
      if (!etiqueta) avisos.push("sin_etiqueta");
      else if (etiqueta.status === "cancelada") avisos.push("etiqueta_cancelada");
      else if (etiqueta.status === "usada") avisos.push("etiqueta_ya_usada");

      const parcelaNombre = lista.parcela ? nombreDeParcela.get(lista.parcela) : undefined;
      if (lista.parcela && !parcelaNombre) avisos.push("parcela_desconocida");
      if (!lista.parcela) avisos.push("sin_parcela");

      const [insertada] = await db.insert(boxes).values({
        boxCode: lista.codigo,
        harvesterId: lista.cortadora,
        parcelCode: parcelaNombre ? lista.parcela! : SIN_PARCELA_CODIGO,
        parcelName: parcelaNombre ?? SIN_PARCELA_NOMBRE,
        weight: lista.peso.neto,
        grossWeight: lista.peso.bruto,
        tareWeight: lista.peso.tara,
        boxTypeId: lista.tipoCajaId,
        cycleId: lista.cicloId,
        latitude: lista.latitud,
        longitude: lista.longitud,
        submissionTime: lista.pesadoEn,
        weighedAt: lista.pesadoEn,
        weighedByUserId: usuarioId,
        deviceId,
        clientUuid: lista.clientUuid,
        labelId: etiqueta && etiqueta.status !== "usada" ? etiqueta.id : null,
        origin: "bascula",
      });

      const cajaId = Number((insertada as any)?.insertId ?? 0);

      // La etiqueta se cierra solo si podía cerrarse. Una ya usada conserva su
      // primera caja: cambiarla perdería el rastro de cuál llegó antes.
      if (etiqueta && puedeTransicionar(etiqueta.status, "usada")) {
        await db
          .update(labels)
          .set({ status: "usada", boxId: cajaId, usedAt: lista.pesadoEn })
          .where(and(eq(labels.id, etiqueta.id), eq(labels.status, etiqueta.status)));
        etiqueta.status = "usada";
        etiqueta.boxId = cajaId;
      }

      ocupados.add(clave);
      resultados.push({
        indice: lista.indice,
        clientUuid: lista.clientUuid,
        codigo: lista.codigo,
        estado: "creada",
        cajaId,
        cicloId: lista.cicloId,
        cicloNombre: lista.cicloNombre,
        pesoNetoGramos: lista.peso.neto,
        etiquetaId: etiqueta?.id ?? null,
        avisos,
      });
    } catch (e: any) {
      // Choque contra el índice único: otro envío ganó la carrera con el mismo
      // uuid. No es un fallo, es exactamente lo que el índice está para evitar.
      if (e?.code === "ER_DUP_ENTRY" || /Duplicate entry/i.test(String(e?.message))) {
        const [fila] = await db
          .select({ id: boxes.id, cycleId: boxes.cycleId })
          .from(boxes)
          .where(eq(boxes.clientUuid, lista.clientUuid))
          .limit(1);
        if (fila) {
          resultados.push({
            indice: lista.indice,
            clientUuid: lista.clientUuid,
            codigo: lista.codigo,
            estado: "duplicada",
            cajaId: fila.id,
            cicloId: fila.cycleId,
            avisos: ["ya_estaba"],
          });
          continue;
        }
      }
      console.error(`[Pesaje] No se pudo guardar ${lista.codigo}:`, e?.message);
      resultados.push({
        indice: lista.indice,
        clientUuid: lista.clientUuid,
        codigo: lista.codigo,
        estado: "rechazada",
        error: {
          codigo: "no_se_pudo_guardar",
          mensaje: e?.message || "Error al guardar la caja",
          ayuda: "Consérvala en la tableta y reintenta: el clientUuid evita que se duplique.",
        },
      });
    }
  }

  resultados.sort((a, b) => a.indice - b.indice);
  return resumir(cajas.length, resultados);
}

/**
 * Cuáles avisos piden que alguien mire, y cuáles solo describen el dato.
 *
 * La diferencia decide si el contador sirve para algo. Hoy CASI TODA caja trae
 * `sin_parcela` y `sin_etiqueta`, porque el kiosco todavía no pregunta la
 * parcela y la tabla de etiquetas nació vacía. Si esos contaran, el resumen
 * diría "200 de 200 por revisar" en cada tanda y nadie volvería a mirarlo.
 */
const AVISOS_QUE_PIDEN_REVISION = new Set([
  "peso_alto",
  "codigo_repetido",
  "etiqueta_cancelada",
  "etiqueta_ya_usada",
  "sin_ciclo",
  "parcela_desconocida",
  "tipo_de_caja_inactivo",
]);

function resumir(recibidas: number, resultados: ResultadoCaja[]): ResumenRecepcion {
  return {
    recibidas,
    creadas: resultados.filter((r) => r.estado === "creada").length,
    duplicadas: resultados.filter((r) => r.estado === "duplicada").length,
    rechazadas: resultados.filter((r) => r.estado === "rechazada").length,
    conRevision: resultados.filter((r) =>
      (r.avisos ?? []).some((a) => AVISOS_QUE_PIDEN_REVISION.has(a)),
    ).length,
    resultados,
  };
}

// ───────────────────────────── consultas ─────────────────────────────

/** Los tipos de caja con su tara. Vacío hasta que alguien dé de alta el primero. */
export async function tiposDeCaja() {
  const db = await baseDeDatos();
  const lista = await db
    .select({
      id: boxTypes.id,
      nombre: boxTypes.name,
      taraGramos: boxTypes.tareGrams,
      porOmision: boxTypes.isDefault,
      activo: boxTypes.isActive,
      notas: boxTypes.notes,
    })
    .from(boxTypes)
    .orderBy(boxTypes.name);
  return {
    tipos: lista,
    nota:
      lista.length === 0
        ? "Todavía no hay tipos de caja dados de alta. Mientras tanto, manda taraGramos en cada pesaje."
        : "Manda tipoCajaId y la tara sale de aquí. Si además mandas taraGramos, gana la que mandes.",
  };
}

/**
 * Qué se sabe de un código: si ya llegó pesado y cuántas veces.
 *
 * Es lo que le permite al kiosco contestar "esta caja ya se pesó" mirando al
 * servidor y no solo a su propia memoria. Dos básculas no se ven entre ellas.
 */
export async function estadoDeCaja(codigo: string, cicloId?: number | null) {
  const db = await baseDeDatos();
  const limpio = codigo.trim();
  if (!desarmarCodigo(limpio)) {
    throw new ErrorEtiqueta(
      "codigo_invalido",
      `"${codigo}" no tiene la forma de un código de caja`,
      "El formato es CC-FFFFFF, por ejemplo 07-000123.",
    );
  }

  const condiciones = [eq(boxes.boxCode, limpio), eq(boxes.archived, false)];
  if (cicloId !== undefined && cicloId !== null) condiciones.push(eq(boxes.cycleId, cicloId));

  const cajas = await db
    .select({
      id: boxes.id,
      cicloId: boxes.cycleId,
      cortadora: boxes.harvesterId,
      parcela: boxes.parcelCode,
      pesoNetoGramos: boxes.weight,
      pesoBrutoGramos: boxes.grossWeight,
      taraGramos: boxes.tareWeight,
      pesadoEn: boxes.weighedAt,
      fecha: boxes.submissionTime,
      origen: boxes.origin,
      clientUuid: boxes.clientUuid,
    })
    .from(boxes)
    .where(and(...condiciones))
    .orderBy(boxes.submissionTime);

  return {
    codigo: limpio,
    cicloId: cicloId ?? null,
    pesada: cajas.length > 0,
    veces: cajas.length,
    cajas,
    aviso:
      cajas.length > 1
        ? "Este código tiene más de una caja: alguna se pesó dos veces. Se resuelve archivando la que sobre."
        : undefined,
  };
}

/**
 * Códigos con más de una caja en el mismo ciclo.
 *
 * Se aceptan a propósito al recibirlas (perder un peso real es peor que un
 * duplicado visible), así que tiene que haber dónde verlos.
 */
export async function conflictosDePesaje(params: { cicloId?: number | null; limite?: number }) {
  const db = await baseDeDatos();
  const limite = Math.min(Math.max(params.limite ?? 50, 1), 200);
  const ciclo = params.cicloId ?? null;

  const encontrados = filas<{
    cycleId: number | null;
    boxCode: string;
    veces: number;
    gramos: number;
    primera: unknown;
    ultima: unknown;
  }>(
    await db.execute(sql`
      SELECT cycleId, boxCode, COUNT(*) AS veces, SUM(weight) AS gramos,
             MIN(submissionTime) AS primera, MAX(submissionTime) AS ultima
      FROM boxes
      WHERE archived = 0
        ${ciclo === null ? sql`AND cycleId IS NOT NULL` : sql`AND cycleId = ${ciclo}`}
      GROUP BY cycleId, boxCode
      HAVING COUNT(*) > 1
      ORDER BY ultima DESC
      LIMIT ${limite}
    `),
  );

  return {
    cicloId: ciclo,
    total: encontrados.length,
    conflictos: encontrados.map((c) => ({
      cicloId: c.cycleId,
      codigo: c.boxCode,
      veces: Number(c.veces),
      gramosSumados: Number(c.gramos),
      primera: c.primera,
      ultima: c.ultima,
    })),
    significado:
      "Cada renglón es un código que tiene más de una caja. Una de ellas sobra: archívala desde el Editor de Cajas.",
  };
}

// ─────────────────────────── foto de la caja ───────────────────────────

/** Nombre de archivo seguro: solo lo que puede traer un uuid. */
function uuidSeguro(valor: unknown): string | null {
  const t = String(valor ?? "").trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(t) ? t : null;
}

/**
 * La foto que la báscula tomó al pesar. Llega después de la caja (la caja
 * viaja en JSON por tandas; la foto es un archivo aparte), y se cuelga de la
 * caja por su clientUuid: es lo único que las dos partes comparten con
 * certeza aunque la respuesta del pesaje se haya perdido.
 *
 * Se guarda comprimida en /app/photos/bascula/ (el mismo volumen que las
 * copias de Kobo) y se apunta desde boxes.photoUrl / photoLocalPath, que es
 * lo que la pantalla de cajas ya sabe mostrar. Reenviar la misma foto solo
 * la reemplaza: no hay nada que se duplique.
 */
export async function guardarFotoCaja(params: {
  clientUuid: unknown;
  archivoTemporal: string;
  usuarioId?: number | null;
}): Promise<{ cajaId: number; codigo: string; fotoUrl: string; reemplazo: boolean }> {
  const db = await baseDeDatos();
  const uuid = uuidSeguro(params.clientUuid);
  if (!uuid) {
    throw new ErrorEtiqueta(
      "clientUuid_invalido",
      "Falta el clientUuid de la caja o no tiene forma de uuid",
      "Manda el mismo clientUuid con el que se guardó el pesaje.",
    );
  }

  const [caja] = await db
    .select({ id: boxes.id, boxCode: boxes.boxCode, photoLocalPath: boxes.photoLocalPath })
    .from(boxes)
    .where(eq(boxes.clientUuid, uuid))
    .limit(1);
  if (!caja) {
    throw new ErrorEtiqueta(
      "caja_desconocida",
      `No hay ninguna caja con clientUuid ${uuid}`,
      "Manda primero el pesaje a POST /cosecha/cajas y, cuando conteste creada o duplicada, sube la foto.",
    );
  }

  const relativa = path.join("bascula", `${uuid}.jpg`);
  const destino = path.join(PHOTOS_ROOT, relativa);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  try {
    // Misma compresión que las fotos de notas de campo: máximo 1920 px, JPEG 80 %.
    const comprimida = await sharp(params.archivoTemporal)
      .rotate()
      .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    await fs.writeFile(destino, comprimida);
  } catch (e) {
    console.warn("[Kiosco] sharp falló con la foto de la caja, se guarda tal cual:", e);
    await fs.copyFile(params.archivoTemporal, destino);
  } finally {
    await fs.unlink(params.archivoTemporal).catch(() => undefined);
  }

  const publica = `${PHOTOS_PUBLIC_PREFIX}/${relativa.split(path.sep).join("/")}`;
  await db
    .update(boxes)
    .set({
      photoFilename: `${uuid}.jpg`,
      photoUrl: publica,
      photoLocalPath: publica,
      photoDownloadedAt: new Date(),
      photoDownloadError: null,
    })
    .where(eq(boxes.id, caja.id));

  return { cajaId: caja.id, codigo: caja.boxCode, fotoUrl: publica, reemplazo: !!caja.photoLocalPath };
}
