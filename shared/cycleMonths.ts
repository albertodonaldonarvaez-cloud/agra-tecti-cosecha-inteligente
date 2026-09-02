/**
 * Alineación de la cosecha por mes de ciclo.
 *
 * Comparar "agosto contra agosto" no dice nada: cada ciclo arranca su cosecha
 * en su propia fecha, así que un ciclo que empezó en julio va en su segundo mes
 * cuando el que empezó en septiembre ni ha comenzado. La comparación honesta es
 * mes 1 contra mes 1, mes 2 contra mes 2, contados desde el arranque de cada
 * cosecha.
 *
 * Vive en shared/ porque la cuenta tiene que dar exactamente lo mismo aquí que
 * en el PERIOD_DIFF que agrupa la curva mensual en el servidor.
 */

export interface CicloComparable {
  id: number;
  name: string;
  harvestStart: string | null;
  monthCurve: { month: number; boxes: number; kg: number; firstQualityKg: number }[];
}

export interface ComparativoDeMes {
  cicloActual: string;
  cicloAnterior: string;
  /** 0 = mes en que arrancó la cosecha del ciclo */
  mesDeCosecha: number;
  kgActual: number;
  kgAnterior: number;
  /** null cuando el ciclo anterior no tuvo cosecha en ese mes: no hay base */
  diffPct: number | null;
}

/**
 * Meses de calendario entre una fecha y un mes dado.
 * Equivale al PERIOD_DIFF de MySQL: cuenta cambios de mes, no días cumplidos.
 */
export function mesesDeCalendario(desde: Date, anio: number, mes: number): number {
  return anio * 12 + mes - (desde.getFullYear() * 12 + desde.getMonth());
}

/**
 * Compara un mes de calendario contra el mismo mes de cosecha del ciclo
 * anterior. Los ciclos vienen del más reciente al más antiguo.
 */
export function compararConCicloAnterior(
  periodo: { anio?: number; mes?: number; totalWeight: number },
  ciclos: CicloComparable[]
): ComparativoDeMes | null {
  if (periodo.anio === undefined || periodo.mes === undefined) return null;
  if (ciclos.length < 2) return null;

  // El mes pertenece al ciclo más reciente cuya cosecha ya había arrancado
  const indice = ciclos.findIndex((c) => {
    if (!c.harvestStart) return false;
    const inicio = new Date(c.harvestStart + "T12:00:00");
    return mesesDeCalendario(inicio, periodo.anio!, periodo.mes!) >= 0;
  });
  if (indice === -1) return null;

  const actual = ciclos[indice];
  const anterior = ciclos[indice + 1];
  if (!anterior || !actual.harvestStart || !anterior.harvestStart) return null;

  const mesDeCosecha = mesesDeCalendario(
    new Date(actual.harvestStart + "T12:00:00"),
    periodo.anio,
    periodo.mes
  );

  const kgActual = Math.round((periodo.totalWeight / 1000) * 10) / 10;
  const kgAnterior = anterior.monthCurve.find((m) => m.month === mesDeCosecha)?.kg ?? 0;
  const diffPct = kgAnterior > 0 ? ((kgActual - kgAnterior) / kgAnterior) * 100 : null;

  return {
    cicloActual: actual.name,
    cicloAnterior: anterior.name,
    mesDeCosecha,
    kgActual,
    kgAnterior,
    diffPct,
  };
}
