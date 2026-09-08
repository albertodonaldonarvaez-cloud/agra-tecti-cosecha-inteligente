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
