/**
 * Pruebas de cómo la API lee los parámetros que le manda un agente.
 *
 * Lo que se está protegiendo es una falla silenciosa: si una fecha mal escrita
 * se ignora en vez de rechazarse, el agente recibe un rango vacío y concluye
 * "no hubo cosecha esos días". Un error es información; un cero inventado, no.
 */
import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { ApiError, aKg, comoDia, entero, fecha, opcion, porcentaje, rango, sumarDias, texto } from "./util";

/** Petición falsa: a estos ayudantes solo les importa req.query */
function pedir(query: Record<string, unknown>): Request {
  return { query } as unknown as Request;
}

describe("fechas", () => {
  it("acepta el formato acordado", () => {
    expect(fecha(pedir({ desde: "2026-08-31" }), "desde")).toBe("2026-08-31");
  });

  it("rechaza otros formatos en vez de dejar que MySQL adivine", () => {
    // Si esto pasara, el agente recibiría un rango vacío y reportaría que no
    // hubo cosecha, que es peor que un error.
    for (const malo of ["31/08/2026", "2026-8-31", "ayer", "2026-08-31T10:00:00"]) {
      expect(() => fecha(pedir({ desde: malo }), "desde")).toThrow(ApiError);
    }
  });

  it("rechaza una fecha con forma correcta pero que no existe", () => {
    expect(() => fecha(pedir({ desde: "2026-02-31" }), "desde")).toThrow(ApiError);
  });

  it("deja pasar la ausencia si es opcional y la exige si no lo es", () => {
    expect(fecha(pedir({}), "desde")).toBeUndefined();
    expect(() => fecha(pedir({}), "desde", true)).toThrow(/Falta el parámetro/);
  });

  it("el error dice qué formato se espera", () => {
    try {
      fecha(pedir({ hasta: "31-08-2026" }), "hasta");
      throw new Error("debió fallar");
    } catch (e: any) {
      expect(e).toBeInstanceOf(ApiError);
      expect(e.ayuda).toContain("YYYY-MM-DD");
    }
  });
});

describe("rango de fechas", () => {
  it("avisa cuando el rango viene al revés", () => {
    expect(() => rango(pedir({ desde: "2026-09-01", hasta: "2026-08-01" })))
      .toThrow(/posterior/);
  });

  it("pone tope a la amplitud para no dejar el MySQL trabajando de más", () => {
    expect(() => rango(pedir({ desde: "2020-01-01", hasta: "2026-01-01" }), 400))
      .toThrow(/rango pedido/);
  });

  it("y el error dice cómo partir la consulta", () => {
    try {
      rango(pedir({ desde: "2020-01-01", hasta: "2026-01-01" }), 400);
      throw new Error("debió fallar");
    } catch (e: any) {
      expect(e.ayuda).toContain("400 días");
    }
  });

  it("un rango justo en el límite sí pasa", () => {
    const r = rango(pedir({ desde: "2026-01-01", hasta: "2026-01-31" }), 30);
    expect(r.desde).toBe("2026-01-01");
    expect(r.hasta).toBe("2026-01-31");
  });

  it("acepta que falte un extremo", () => {
    expect(rango(pedir({ desde: "2026-01-01" })).hasta).toBeUndefined();
    expect(rango(pedir({})).desde).toBeUndefined();
  });
});

describe("números", () => {
  it("usa el valor por omisión cuando no viene", () => {
    expect(entero(pedir({}), "limite", { porDefecto: 50 })).toBe(50);
  });

  it("rechaza texto y decimales", () => {
    expect(() => entero(pedir({ limite: "muchos" }), "limite")).toThrow(ApiError);
    expect(() => entero(pedir({ limite: "10.5" }), "limite")).toThrow(ApiError);
  });

  it("aplica los topes y explica el máximo", () => {
    expect(() => entero(pedir({ limite: "0" }), "limite", { min: 1 })).toThrow(/menor que 1/);
    try {
      entero(pedir({ limite: "99999" }), "limite", { max: 5000 });
      throw new Error("debió fallar");
    } catch (e: any) {
      expect(e.ayuda).toContain("exportar/cajas");
    }
  });
});

describe("opciones cerradas", () => {
  const validas = ["dia", "semana", "mes"] as const;

  it("no distingue mayúsculas", () => {
    expect(opcion(pedir({ g: "MES" }), "g", validas)).toBe("mes");
  });

  it("cuando el valor no existe, dice cuáles sí", () => {
    try {
      opcion(pedir({ g: "trimestre" }), "g", validas);
      throw new Error("debió fallar");
    } catch (e: any) {
      expect(e.ayuda).toBe("Valores válidos: dia, semana, mes");
    }
  });
});

describe("conversiones", () => {
  it("convierte gramos a kilos, que es el error de mil que se quiere evitar", () => {
    expect(aKg(28450)).toBe(28.45);
    expect(aKg("1000")).toBe(1);
    expect(aKg(null)).toBe(0);
  });

  it("saca porcentajes sin dividir entre cero", () => {
    expect(porcentaje(87, 100)).toBe(87);
    expect(porcentaje(1, 3)).toBe(33.3);
    expect(porcentaje(5, 0)).toBe(0);
  });

  it("normaliza el día venga como Date o como texto", () => {
    expect(comoDia(new Date(2026, 7, 31, 23, 30))).toBe("2026-08-31");
    expect(comoDia("2026-08-31T00:00:00.000Z")).toBe("2026-08-31");
  });

  it("suma días sin que la zona horaria mueva la fecha", () => {
    expect(sumarDias("2026-08-31", 1)).toBe("2026-09-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("texto", () => {
  it("recorta lo que se pase de largo en vez de rechazarlo", () => {
    expect(texto(pedir({ buscar: "  hola  " }), "buscar")).toBe("hola");
    expect(texto(pedir({ buscar: "x".repeat(500) }), "buscar", 10)).toHaveLength(10);
    expect(texto(pedir({}), "buscar")).toBeUndefined();
  });
});
