/**
 * A qué ciclo de producción pertenece una fecha.
 *
 * El higo se maneja por ciclos: cada uno arranca con la poda y se cierra cuando
 * termina la cosecha. Como el ciclo se define por fechas, la pertenencia de una
 * caja se deduce sola — no hace falta que nadie la capture.
 *
 * Esta regla se usa en dos lados y tiene que ser LA MISMA en los dos:
 *   · la migración 0027, que rellena boxes.cycleId en lo ya capturado;
 *   · el alta de cajas desde la báscula, que resuelve el ciclo al vuelo.
 * Si se separaran, una caja vieja y una nueva del mismo día podrían acabar en
 * ciclos distintos.
 *
 * Todas las fechas son días de calendario "YYYY-MM-DD" en hora de México, que
 * es como ya se guardan startDate y endDate. Se comparan como texto a propósito:
 * en ese formato el orden alfabético es el orden cronológico, y así no entra en
 * juego ninguna zona horaria.
 */

export interface CicloRango {
  id: number;
  startDate: string; // "YYYY-MM-DD"
  endDate: string | null; // null = el ciclo sigue abierto
}

/**
 * Último día que le pertenece al ciclo.
 *
 * Se usa endDate y NO harvestEndDate: "se acabó la cosecha" no es lo mismo que
 * "se acabó el ciclo". Una caja rezagada, pesada después de marcar el fin de
 * cosecha, debe quedar en su ciclo y no huérfana.
 */
export function finDeCiclo(ciclo: CicloRango, hoy: string): string {
  return ciclo.endDate ?? hoy;
}

/**
 * El ciclo al que pertenece `fecha`, o null si no cae en ninguno.
 *
 * Devolver null es una respuesta legítima: entre el cierre de un ciclo y la poda
 * del siguiente hay semanas sin ciclo, y una fecha futura tampoco pertenece a
 * nada. Es mejor dejarlo en nulo —que se puede ver y corregir— que asignarlo a
 * la fuerza al ciclo más cercano y ensuciar sus cifras en silencio.
 *
 * Si dos ciclos llegaran a traslaparse por un error de captura, gana el de
 * arranque más reciente. No es que sea "lo correcto": es que la respuesta tiene
 * que ser siempre la misma, y no depender del orden en que vengan las filas.
 */
export function resolverCiclo(
  fecha: string,
  ciclos: CicloRango[],
  hoy: string,
): number | null {
  let elegido: CicloRango | null = null;

  for (const ciclo of ciclos) {
    if (fecha < ciclo.startDate) continue;
    if (fecha > finDeCiclo(ciclo, hoy)) continue;

    if (
      !elegido ||
      ciclo.startDate > elegido.startDate ||
      (ciclo.startDate === elegido.startDate && ciclo.id > elegido.id)
    ) {
      elegido = ciclo;
    }
  }

  return elegido?.id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// El ciclo visto como un rango de fechas
//
// `resolverCiclo` contesta caja por caja, y eso sirve cuando ya se tiene la
// fila. Para FILTRAR —"enséñame las cajas de la cosecha pasada"— hace falta lo
// contrario: el pedazo de calendario que le toca a cada ciclo, para poder
// pedirle a MySQL un rango de fechas que sí use el índice de submissionTime.
//
// Los dos caminos tienen que dar el mismo resultado. Si no, la etiqueta que
// aparece en un renglón diría un ciclo y el filtro lo metería en otro, y no hay
// nada más rápido para perderle la confianza a una pantalla.
// ─────────────────────────────────────────────────────────────────────────────

export interface RangoCiclo {
  id: number;
  /** Primer día del ciclo, "YYYY-MM-DD" */
  desde: string;
  /**
   * Último día que le toca. Si sale ANTES que `desde`, el ciclo no se quedó con
   * ningún día: otro ciclo que arranca igual o después se los llevó todos. Un
   * rango vacío no rompe nada —la consulta simplemente no devuelve cajas— y
   * deja el error de captura a la vista en lugar de repartir las cajas al azar.
   */
  hasta: string;
}

/** Día anterior a una fecha "YYYY-MM-DD", sin que entre en juego ninguna zona horaria. */
function diaAnterior(fecha: string): string {
  const d = new Date(fecha + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** ¿`b` le gana a `a` cuando las dos fechas caen en los dos ciclos? */
function leGana(a: CicloRango, b: CicloRango): boolean {
  if (b.startDate !== a.startDate) return b.startDate > a.startDate;
  return b.id > a.id;
}

/**
 * El pedazo de calendario que le toca a cada ciclo, ya resuelto el desempate.
 *
 * Con ciclos normales —que no se traslapan— cada rango es tal cual el del ciclo.
 * Cuando dos se encinan, el que arranca después se queda con el traslape
 * completo y al de antes se le recorta el final, que es lo mismo que contesta
 * `resolverCiclo` día por día.
 *
 * La única diferencia a propósito: si un ciclo se traslapara y además terminara
 * ANTES que el otro, `resolverCiclo` le devolvería los días de la cola y aquí
 * ya no, porque el rango se corta de una vez. Eso solo pasa con un ciclo metido
 * dentro de otro, que no es una cosecha sino un error de captura, y ahí importa
 * más que el filtro sea un rango contiguo que rescatar esos días.
 */
export function rangosDeCiclo(ciclos: CicloRango[], hoy: string): RangoCiclo[] {
  return ciclos.map((ciclo) => {
    const fin = finDeCiclo(ciclo, hoy);

    // El primer arranque, de los que le ganan, que caiga dentro de su rango
    let corte: string | null = null;
    for (const otro of ciclos) {
      if (otro === ciclo) continue;
      if (!leGana(ciclo, otro)) continue;
      if (otro.startDate > fin) continue;
      if (!corte || otro.startDate < corte) corte = otro.startDate;
    }

    const hasta = corte && diaAnterior(corte) < fin ? diaAnterior(corte) : fin;
    return { id: ciclo.id, desde: ciclo.startDate, hasta };
  });
}

/**
 * A qué ciclo pertenece una fecha, según los rangos ya resueltos.
 *
 * Es el mismo criterio que `resolverCiclo`, nada más que partiendo de los
 * rangos en vez de los ciclos, para que la etiqueta de un renglón y el filtro
 * de arriba no se puedan contradecir.
 */
export function cicloDeFecha(fecha: string, rangos: RangoCiclo[]): number | null {
  for (const r of rangos) {
    if (r.hasta < r.desde) continue; // rango vacío: no se queda con nada
    if (fecha >= r.desde && fecha <= r.hasta) return r.id;
  }
  return null;
}
