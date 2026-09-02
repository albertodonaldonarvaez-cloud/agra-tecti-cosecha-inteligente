/**
 * Pruebas de los totales del reporte de actividades.
 *
 * Son las cifras que el productor ve arriba del reporte y las que se le mandan
 * a la IA para que redacte el resumen: si están mal, el informe miente con
 * mucha seguridad. Lo que se comprueba es lo que no es obvio:
 *  1. Una labor en varias parcelas no multiplica las horas de la operación.
 *  2. Los insumos solo se suman entre sí cuando comparten unidad.
 *  3. Las horas salen de las jornadas, no del calendario.
 */
import { describe, it, expect } from "vitest";
import { summarizeActivities } from "./activityReport";

function labor(over: Partial<any> = {}): any {
  return {
    id: 1,
    date: "2026-08-10",
    endDate: null,
    type: "riego",
    typeLabel: "Riego",
    subtype: null,
    description: "",
    performedBy: "Juan",
    status: "completada",
    statusLabel: "Completada",
    hours: 4,
    days: 1,
    sessions: [],
    parcelNames: ["Micaela"],
    products: [],
    tools: [],
    photoCount: 0,
    weather: null,
    temperature: null,
    ...over,
  };
}

describe("totales del reporte de actividades", () => {
  it("no multiplica las horas cuando una labor cubre varias parcelas", () => {
    const s = summarizeActivities([
      labor({ id: 1, hours: 6, parcelNames: ["Micaela", "Pilla", "Chicho"] }),
    ]);

    // La operación trabajó 6 horas, no 18
    expect(s.hours).toBe(6);
    // Pero las tres parcelas aparecen atendidas, con las horas repartidas
    expect(s.parcelsWorked).toBe(3);
    expect(s.byParcel.map((p) => p.name).sort()).toEqual(["Chicho", "Micaela", "Pilla"]);
    expect(s.byParcel[0].hours).toBe(2);
  });

  it("suma los insumos solo cuando comparten unidad", () => {
    const s = summarizeActivities([
      labor({ id: 1, products: [{ name: "Urea", typeLabel: "Fertilizante granular", quantity: "50", unit: "kg", plannedQuantity: null, dosisPerHectare: null, applicationMethod: null, notes: null }] }),
      labor({ id: 2, products: [{ name: "Urea", typeLabel: "Fertilizante granular", quantity: "25.5", unit: "kg", plannedQuantity: null, dosisPerHectare: null, applicationMethod: null, notes: null }] }),
      labor({ id: 3, products: [{ name: "Urea", typeLabel: "Fertilizante granular", quantity: "2", unit: "bulto", plannedQuantity: null, dosisPerHectare: null, applicationMethod: null, notes: null }] }),
    ]);

    const kg = s.products.find((p) => p.unit === "kg");
    const bultos = s.products.find((p) => p.unit === "bulto");

    expect(kg?.total).toBe(75.5);
    expect(kg?.times).toBe(2);
    // Los bultos van aparte: sumarlos con los kilos daría una cifra inventada
    expect(bultos?.total).toBe(2);
    expect(s.products).toHaveLength(2);
  });

  it("marca los insumos aplicados sin cantidad registrada en vez de contarlos como cero", () => {
    const s = summarizeActivities([
      labor({ id: 1, products: [{ name: "Foliar", typeLabel: "Nutriente foliar", quantity: null, unit: "lt", plannedQuantity: null, dosisPerHectare: null, applicationMethod: null, notes: null }] }),
      labor({ id: 2, products: [{ name: "Foliar", typeLabel: "Nutriente foliar", quantity: "3", unit: "lt", plannedQuantity: null, dosisPerHectare: null, applicationMethod: null, notes: null }] }),
    ]);

    const foliar = s.products[0];
    expect(foliar.total).toBe(3);
    expect(foliar.times).toBe(2);
    expect(foliar.sinCantidad).toBe(1);
  });

  it("separa lo cerrado de lo que sigue pendiente", () => {
    const s = summarizeActivities([
      labor({ id: 1, status: "completada" }),
      labor({ id: 2, status: "en_progreso" }),
      labor({ id: 3, status: "planificada" }),
      labor({ id: 4, status: "cancelada" }),
    ]);

    expect(s.total).toBe(4);
    expect(s.completed).toBe(1);
    expect(s.inProgress).toBe(1);
    expect(s.planned).toBe(1);
    expect(s.cancelled).toBe(1);
  });

  it("agrupa por responsable y por tipo de labor", () => {
    const s = summarizeActivities([
      labor({ id: 1, performedBy: "Juan", type: "riego", typeLabel: "Riego", hours: 3 }),
      labor({ id: 2, performedBy: "Juan", type: "poda", typeLabel: "Poda", hours: 5 }),
      labor({ id: 3, performedBy: "  ", type: "riego", typeLabel: "Riego", hours: 2 }),
    ]);

    expect(s.peopleCount).toBe(2);
    const juan = s.byPerson.find((p) => p.name === "Juan");
    expect(juan?.count).toBe(2);
    expect(juan?.hours).toBe(8);
    // Un responsable en blanco no se pierde: queda visible como faltante
    expect(s.byPerson.some((p) => p.name === "Sin responsable")).toBe(true);

    const riego = s.byType.find((t) => t.key === "riego");
    expect(riego?.count).toBe(2);
    expect(riego?.hours).toBe(5);
  });

  it("cuenta como general la labor que no tiene parcela asignada", () => {
    const s = summarizeActivities([labor({ id: 1, parcelNames: [] })]);

    expect(s.parcelsWorked).toBe(0);
    expect(s.byParcel[0].name).toBe("General (todas)");
  });
});
