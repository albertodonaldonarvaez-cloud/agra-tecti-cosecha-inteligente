/**
 * Pruebas de la comparación mes a mes entre ciclos.
 *
 * La cuenta que importa es la alineación: comparar "agosto contra agosto" no
 * dice nada si un ciclo arrancó su cosecha en julio y el otro en septiembre.
 * Lo que se compara es mes 1 contra mes 1 desde el arranque de cada cosecha, y
 * esa cuenta tiene que dar exactamente lo mismo aquí que en el PERIOD_DIFF con
 * el que el servidor agrupa la curva mensual.
 */
import { describe, it, expect } from "vitest";
import { compararConCicloAnterior, mesesDeCalendario, type CicloComparable } from "../shared/cycleMonths";

const ciclo = (over: Partial<CicloComparable>): CicloComparable => ({
  id: 1,
  name: "Ciclo",
  harvestStart: "2026-07-10",
  monthCurve: [],
  ...over,
});

describe("alineación por mes de cosecha", () => {
  it("cuenta meses de calendario, no días cumplidos", () => {
    const inicio = new Date("2026-07-28T12:00:00");
    // Del 28 de julio al 1 de agosto no hay un mes cumplido, pero sí un cambio
    // de mes: es el mes 1 de la cosecha, igual que lo cuenta PERIOD_DIFF
    expect(mesesDeCalendario(inicio, 2026, 7)).toBe(1);
    expect(mesesDeCalendario(inicio, 2026, 6)).toBe(0);
    expect(mesesDeCalendario(inicio, 2027, 0)).toBe(6);
  });

  it("compara contra el mismo mes de cosecha del ciclo anterior, no contra el mismo mes del calendario", () => {
    const ciclos = [
      ciclo({ id: 2, name: "Ciclo 2026", harvestStart: "2026-07-10" }),
      ciclo({
        id: 1,
        name: "Ciclo 2025",
        harvestStart: "2025-09-05", // arrancó dos meses más tarde en el calendario
        monthCurve: [
          { month: 0, boxes: 100, kg: 900, firstQualityKg: 800 },
          { month: 1, boxes: 200, kg: 1800, firstQualityKg: 1600 },
        ],
      }),
    ];

    // Agosto de 2026 es el mes 1 de cosecha del ciclo nuevo; se compara contra
    // el mes 1 del anterior (que en calendario fue octubre de 2025)
    const r = compararConCicloAnterior({ anio: 2026, mes: 7, totalWeight: 2_160_000 }, ciclos);

    expect(r).not.toBeNull();
    expect(r!.mesDeCosecha).toBe(1);
    expect(r!.kgActual).toBe(2160);
    expect(r!.kgAnterior).toBe(1800);
    expect(r!.diffPct).toBeCloseTo(20, 5);
    expect(r!.cicloAnterior).toBe("Ciclo 2025");
  });

  it("no inventa un porcentaje cuando el ciclo anterior no cosechó ese mes", () => {
    const ciclos = [
      ciclo({ id: 2, name: "Ciclo 2026", harvestStart: "2026-07-10" }),
      ciclo({ id: 1, name: "Ciclo 2025", harvestStart: "2025-09-05", monthCurve: [] }),
    ];

    const r = compararConCicloAnterior({ anio: 2026, mes: 7, totalWeight: 500_000 }, ciclos);

    expect(r!.kgAnterior).toBe(0);
    // Dividir entre cero daría "infinito por ciento arriba"
    expect(r!.diffPct).toBeNull();
  });

  it("ignora los meses anteriores al arranque de cualquier cosecha", () => {
    const ciclos = [
      ciclo({ id: 2, name: "Ciclo 2026", harvestStart: "2026-07-10" }),
      ciclo({ id: 1, name: "Ciclo 2025", harvestStart: "2025-09-05" }),
    ];

    // Enero de 2025: antes de que arrancara ningún ciclo de la lista
    expect(compararConCicloAnterior({ anio: 2025, mes: 0, totalWeight: 1000 }, ciclos)).toBeNull();
  });

  it("no compara si solo hay un ciclo registrado", () => {
    const ciclos = [ciclo({ id: 2, name: "Ciclo 2026" })];
    expect(compararConCicloAnterior({ anio: 2026, mes: 7, totalWeight: 1000 }, ciclos)).toBeNull();
  });

  it("asigna el mes al ciclo más reciente que ya había arrancado", () => {
    const ciclos = [
      ciclo({ id: 3, name: "Ciclo 2026", harvestStart: "2026-07-10", monthCurve: [] }),
      ciclo({
        id: 2, name: "Ciclo 2025", harvestStart: "2025-07-01",
        monthCurve: [{ month: 0, boxes: 10, kg: 100, firstQualityKg: 90 }],
      }),
      ciclo({ id: 1, name: "Ciclo 2024", harvestStart: "2024-07-01" }),
    ];

    // Julio de 2025 pertenece al ciclo 2025 y se compara contra el 2024
    const r = compararConCicloAnterior({ anio: 2025, mes: 6, totalWeight: 150_000 }, ciclos);
    expect(r!.cicloActual).toBe("Ciclo 2025");
    expect(r!.cicloAnterior).toBe("Ciclo 2024");
  });
});
