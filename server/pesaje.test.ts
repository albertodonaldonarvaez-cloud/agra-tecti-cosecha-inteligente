/**
 * Las reglas del pesaje que se pueden probar sin base de datos.
 *
 * Son las dos que deciden si un dato entra bien o entra mal para siempre: la
 * aritmética del peso y la lectura de la fecha. Equivocarse en la primera
 * guarda kilos que nunca se cosecharon; en la segunda, mete la cosecha en el
 * ciclo equivocado y nadie se entera hasta que los totales no cuadran.
 */
import { describe, it, expect } from "vitest";
import { ErrorEtiqueta } from "./etiquetas";
import { PESO_ALTO_GRAMOS, resolverMomento, resolverPeso } from "./pesaje";

/** Lo que tira resolverPeso, para poder afirmar sobre el código y no el texto. */
function codigoDelError(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErrorEtiqueta) return e.codigo;
    throw e;
  }
  return "no_falló";
}

describe("resolverPeso", () => {
  it("el neto es el bruto menos la tara", () => {
    const p = resolverPeso({ pesoBrutoGramos: 13450, taraGramos: 1200 });
    expect(p.neto).toBe(12250);
    expect(p.bruto).toBe(13450);
    expect(p.tara).toBe(1200);
    expect(p.avisos).toEqual([]);
  });

  it("sin tara el neto es el bruto, y queda dicho que no se aplicó tara", () => {
    // No es lo mismo "la tara es cero" que "nadie aplicó tara". Lo segundo es
    // lo que hay que poder encontrar después para auditar una báscula.
    const p = resolverPeso({ pesoBrutoGramos: 9000 });
    expect(p.neto).toBe(9000);
    expect(p.tara).toBeNull();
    expect(p.avisos).toContain("sin_tara");
  });

  it("acepta solo el neto cuando la báscula ya restó la tara ella sola", () => {
    const p = resolverPeso({ pesoNetoGramos: 8400 });
    expect(p.neto).toBe(8400);
    expect(p.bruto).toBeNull();
    expect(p.avisos).toContain("sin_bruto");
  });

  it("si mandan los tres y no cuadran, se rechaza en vez de escoger uno", () => {
    // Callarlo escondería un error de cálculo justo donde importa
    expect(codigoDelError(() =>
      resolverPeso({ pesoBrutoGramos: 13450, taraGramos: 1200, pesoNetoGramos: 12000 }),
    )).toBe("peso_inconsistente");
  });

  it("si los tres cuadran, no estorba", () => {
    const p = resolverPeso({ pesoBrutoGramos: 13450, taraGramos: 1200, pesoNetoGramos: 12250 });
    expect(p.neto).toBe(12250);
  });

  it("una tara mayor o igual que el bruto no da una caja de peso cero", () => {
    expect(codigoDelError(() => resolverPeso({ pesoBrutoGramos: 1200, taraGramos: 1200 })))
      .toBe("peso_no_positivo");
    expect(codigoDelError(() => resolverPeso({ pesoBrutoGramos: 900, taraGramos: 1200 })))
      .toBe("peso_no_positivo");
  });

  it("el peso va en gramos enteros: un decimal es una unidad mal convertida", () => {
    expect(codigoDelError(() => resolverPeso({ pesoNetoGramos: 12.345 }))).toBe("peso_invalido");
  });

  it("rechaza lo negativo y lo imposible", () => {
    expect(codigoDelError(() => resolverPeso({ pesoNetoGramos: -5 }))).toBe("peso_invalido");
    expect(codigoDelError(() => resolverPeso({ pesoNetoGramos: 2_000_000 }))).toBe("peso_invalido");
  });

  it("sin ningún peso no hay caja que guardar", () => {
    expect(codigoDelError(() => resolverPeso({}))).toBe("peso_requerido");
  });

  it("una caja pesada de más SE GUARDA, marcada", () => {
    // Es la misma decisión que ya tomó koboSync: casi siempre es un punto
    // decimal mal puesto, pero descartarla perdería una caja buena de vez en
    // cuando, y una caja perdida no se recupera.
    const p = resolverPeso({ pesoNetoGramos: PESO_ALTO_GRAMOS + 1 });
    expect(p.neto).toBe(PESO_ALTO_GRAMOS + 1);
    expect(p.avisos).toContain("peso_alto");
  });

  it("justo en el límite todavía no se marca", () => {
    expect(resolverPeso({ pesoNetoGramos: PESO_ALTO_GRAMOS }).avisos).not.toContain("peso_alto");
  });
});

describe("resolverMomento", () => {
  const ahora = new Date("2026-09-10T20:00:00Z");

  it("sin fecha, se pesó ahora", () => {
    expect(resolverMomento(undefined, ahora).getTime()).toBe(ahora.getTime());
    expect(resolverMomento("", ahora).getTime()).toBe(ahora.getTime());
  });

  it("respeta la fecha que trae la cola, que puede ser de hace días", () => {
    // Es lo que hace que una cola de tres días sin señal reparta sus cajas en
    // el ciclo que les toca y no todas en el de hoy
    const f = resolverMomento("2026-09-07T14:23:00-06:00", ahora);
    expect(f.toISOString()).toBe("2026-09-07T20:23:00.000Z");
  });

  it("una tableta con el reloj adelantado se detiene antes de escribir", () => {
    expect(codigoDelError(() => resolverMomento("2026-12-01T10:00:00Z", ahora)))
      .toBe("fecha_futura");
  });

  it("unas horas de adelanto sí pasan: los relojes no son exactos", () => {
    expect(() => resolverMomento("2026-09-10T23:00:00Z", ahora)).not.toThrow();
  });

  it("un reloj que se reinició de fábrica no mete cajas en 1970", () => {
    expect(codigoDelError(() => resolverMomento("1970-01-01T00:00:00Z", ahora)))
      .toBe("fecha_invalida");
  });

  it("una fecha a la mexicana no se lee a la americana", () => {
    // new Date("10/09/2026") daría el 9 de OCTUBRE sin quejarse. Ese es
    // exactamente el error que no se descubre hasta que no cuadran los totales.
    expect(codigoDelError(() => resolverMomento("10/09/2026", ahora))).toBe("fecha_invalida");
  });

  it("una fecha sin hora se rechaza, porque caería en el día anterior", () => {
    // "2026-09-07" es medianoche UTC, o sea las 18:00 del 6 en México
    expect(codigoDelError(() => resolverMomento("2026-09-07", ahora))).toBe("fecha_invalida");
  });

  it("una hora sin zona se rechaza: se leería con el reloj del contenedor", () => {
    expect(codigoDelError(() => resolverMomento("2026-09-07T14:23:00", ahora)))
      .toBe("fecha_invalida");
  });

  it("con Z también vale", () => {
    expect(resolverMomento("2026-09-07T20:23:00Z", ahora).toISOString())
      .toBe("2026-09-07T20:23:00.000Z");
  });
});
