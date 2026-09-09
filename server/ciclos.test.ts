/**
 * Pruebas de la regla que decide a qué ciclo pertenece una fecha.
 *
 * Esta regla la aplican dos cosas distintas: la migración que rellena el ciclo
 * en las cajas ya capturadas, y el alta de cajas desde la báscula. Si se
 * equivoca, no revienta nada — simplemente las cifras de un ciclo se van al
 * otro, y eso no se nota hasta que alguien compara dos cosechas.
 */
import { describe, it, expect } from "vitest";
import { resolverCiclo, finDeCiclo, rangosDeCiclo, cicloDeFecha, type CicloRango } from "./ciclos";

const HOY = "2026-09-08";

// Dos ciclos cerrados y uno abierto, con la pausa de dormancia entre ellos
const CICLOS: CicloRango[] = [
  { id: 1, startDate: "2024-01-15", endDate: "2024-11-30" },
  { id: 2, startDate: "2025-01-10", endDate: "2025-12-05" },
  { id: 3, startDate: "2026-01-20", endDate: null }, // el que está corriendo
];

describe("resolverCiclo", () => {
  it("ubica una fecha dentro de un ciclo cerrado", () => {
    expect(resolverCiclo("2024-08-14", CICLOS, HOY)).toBe(1);
    expect(resolverCiclo("2025-08-14", CICLOS, HOY)).toBe(2);
  });

  it("los bordes cuentan: el primer y el último día son del ciclo", () => {
    expect(resolverCiclo("2024-01-15", CICLOS, HOY)).toBe(1);
    expect(resolverCiclo("2024-11-30", CICLOS, HOY)).toBe(1);
    // Un día antes y un día después ya no
    expect(resolverCiclo("2024-01-14", CICLOS, HOY)).toBeNull();
    expect(resolverCiclo("2024-12-01", CICLOS, HOY)).toBeNull();
  });

  it("el ciclo abierto llega hasta hoy", () => {
    expect(resolverCiclo("2026-01-20", CICLOS, HOY)).toBe(3);
    expect(resolverCiclo(HOY, CICLOS, HOY)).toBe(3);
  });

  it("una fecha del futuro no pertenece a nada", () => {
    // Una caja fechada mañana es un error de captura, no cosecha adelantada.
    // Dejarla en nulo la deja a la vista; meterla al ciclo abierto la escondería.
    expect(resolverCiclo("2026-09-09", CICLOS, HOY)).toBeNull();
  });

  it("la pausa entre ciclos queda en nulo, no se reparte al vecino", () => {
    // Entre el cierre de un ciclo y la poda del siguiente pasan semanas
    expect(resolverCiclo("2024-12-20", CICLOS, HOY)).toBeNull();
    expect(resolverCiclo("2026-01-05", CICLOS, HOY)).toBeNull();
  });

  it("una fecha anterior a todo lo registrado queda en nulo", () => {
    expect(resolverCiclo("2023-05-01", CICLOS, HOY)).toBeNull();
  });

  it("sin ciclos registrados no inventa ninguno", () => {
    expect(resolverCiclo("2026-08-01", [], HOY)).toBeNull();
  });

  it("con ciclos traslapados siempre contesta lo mismo", () => {
    // Un traslape solo puede venir de un error de captura, pero la respuesta no
    // puede depender del orden en que MySQL devuelva las filas
    const traslapados: CicloRango[] = [
      { id: 7, startDate: "2026-01-01", endDate: "2026-12-31" },
      { id: 8, startDate: "2026-06-01", endDate: "2026-12-31" },
    ];
    const alReves = [...traslapados].reverse();

    expect(resolverCiclo("2026-08-01", traslapados, HOY)).toBe(8);
    expect(resolverCiclo("2026-08-01", alReves, HOY)).toBe(8);
    // Antes del traslape solo cabe el primero
    expect(resolverCiclo("2026-03-01", traslapados, HOY)).toBe(7);
  });

  it("desempata por id cuando dos ciclos arrancan el mismo día", () => {
    const gemelos: CicloRango[] = [
      { id: 4, startDate: "2026-02-01", endDate: null },
      { id: 5, startDate: "2026-02-01", endDate: null },
    ];
    expect(resolverCiclo("2026-05-01", gemelos, HOY)).toBe(5);
    expect(resolverCiclo("2026-05-01", [...gemelos].reverse(), HOY)).toBe(5);
  });
});

describe("finDeCiclo", () => {
  it("un ciclo cerrado termina en su fecha de cierre", () => {
    expect(finDeCiclo({ id: 1, startDate: "2024-01-15", endDate: "2024-11-30" }, HOY))
      .toBe("2024-11-30");
  });

  it("un ciclo abierto llega hasta hoy", () => {
    expect(finDeCiclo({ id: 3, startDate: "2026-01-20", endDate: null }, HOY)).toBe(HOY);
  });
});

describe("rangosDeCiclo", () => {
  it("con ciclos que no se encinan, el rango es tal cual el del ciclo", () => {
    const rangos = rangosDeCiclo(CICLOS, HOY);
    expect(rangos).toEqual([
      { id: 1, desde: "2024-01-15", hasta: "2024-11-30" },
      { id: 2, desde: "2025-01-10", hasta: "2025-12-05" },
      { id: 3, desde: "2026-01-20", hasta: HOY },
    ]);
  });

  it("el ciclo abierto se corta en hoy, no en el futuro", () => {
    const [abierto] = rangosDeCiclo([{ id: 3, startDate: "2026-01-20", endDate: null }], HOY);
    expect(abierto.hasta).toBe(HOY);
  });

  it("da lo mismo que resolverCiclo, día por día", () => {
    // Esta es la que de verdad importa: el filtro de la pantalla usa rangos y
    // la etiqueta de cada renglón sale del mismo lado. Si se separaran, un
    // renglón diría "ciclo pasado" dentro del filtro del ciclo actual.
    const rangos = rangosDeCiclo(CICLOS, HOY);
    const dia = new Date("2023-12-01T12:00:00Z");
    const ultimo = new Date("2026-09-08T12:00:00Z");

    while (dia <= ultimo) {
      const fecha = dia.toISOString().slice(0, 10);
      expect(cicloDeFecha(fecha, rangos)).toBe(resolverCiclo(fecha, CICLOS, HOY));
      dia.setUTCDate(dia.getUTCDate() + 1);
    }
  });

  it("cuando dos ciclos se traslapan, al de antes se le recorta el final", () => {
    const traslapados: CicloRango[] = [
      { id: 7, startDate: "2026-01-01", endDate: "2026-12-31" },
      { id: 8, startDate: "2026-06-01", endDate: "2026-12-31" },
    ];
    expect(rangosDeCiclo(traslapados, HOY)).toEqual([
      { id: 7, desde: "2026-01-01", hasta: "2026-05-31" },
      { id: 8, desde: "2026-06-01", hasta: "2026-12-31" },
    ]);
  });

  it("no depende del orden en que vengan los ciclos", () => {
    const traslapados: CicloRango[] = [
      { id: 7, startDate: "2026-01-01", endDate: "2026-12-31" },
      { id: 8, startDate: "2026-06-01", endDate: "2026-12-31" },
    ];
    const alReves = [...traslapados].reverse();
    const porId = (r: { id: number }[]) => [...r].sort((a, b) => a.id - b.id);
    expect(porId(rangosDeCiclo(alReves, HOY))).toEqual(porId(rangosDeCiclo(traslapados, HOY)));
  });

  it("dos ciclos que arrancan el mismo día: el de id mayor se queda con todo", () => {
    const gemelos: CicloRango[] = [
      { id: 4, startDate: "2026-02-01", endDate: null },
      { id: 5, startDate: "2026-02-01", endDate: null },
    ];
    const rangos = rangosDeCiclo(gemelos, HOY);
    // Al 4 le queda un rango vacío, y así se nota que algo se capturó mal
    expect(rangos[0].hasta < rangos[0].desde).toBe(true);
    expect(cicloDeFecha("2026-05-01", rangos)).toBe(5);
  });

  it("sin ciclos no hay rangos ni fecha que pertenezca a algo", () => {
    expect(rangosDeCiclo([], HOY)).toEqual([]);
    expect(cicloDeFecha("2026-08-01", [])).toBeNull();
  });
});
