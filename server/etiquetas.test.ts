/**
 * Pruebas de la aritmética y las reglas del reparto de folios.
 *
 * Lo que se prueba aquí es lo que puede fallar en silencio: un rango mal
 * calculado no revienta nada, solo hace que dos lotes seguidos compartan una
 * etiqueta — y eso no se nota hasta que dos cajas distintas llegan con el
 * mismo código a la recepción.
 *
 * El bloqueo de la fila del contador no se puede probar sin MySQL; lo que sí
 * se prueba es todo lo que se decide antes y después de tocarla.
 */
import { describe, it, expect } from "vitest";
import {
  armarCodigo,
  desarmarCodigo,
  calcularRango,
  validarPeticion,
  puedeTransicionar,
  TRANSICIONES,
  ErrorEtiqueta,
  FOLIO_MAXIMO,
  LOTE_MAXIMO,
  PLANTILLA_TSPL,
  plantillaImpresion,
  type EstadoEtiqueta,
} from "./etiquetas";

describe("el código impreso", () => {
  it("rellena a dos dígitos de cortadora y seis de folio", () => {
    // Este formato ya lo leen el escáner, Kobo y todo el histórico
    expect(armarCodigo(7, 123)).toBe("07-000123");
    expect(armarCodigo(1, 1)).toBe("01-000001");
    expect(armarCodigo(42, 999999)).toBe("42-999999");
  });

  it("las cortadoras especiales se ven igual que las demás", () => {
    // 98 y 99 no son personas: son segunda calidad y desperdicio
    expect(armarCodigo(98, 500)).toBe("98-000500");
    expect(armarCodigo(99, 500)).toBe("99-000500");
  });

  it("se puede volver a desarmar", () => {
    expect(desarmarCodigo("07-000123")).toEqual({ cortadora: 7, folio: 123 });
    expect(desarmarCodigo(" 07-000123 ")).toEqual({ cortadora: 7, folio: 123 });
  });

  it("rechaza lo que no tiene forma de código", () => {
    expect(desarmarCodigo("hola")).toBeNull();
    expect(desarmarCodigo("07000123")).toBeNull();
    expect(desarmarCodigo("")).toBeNull();
  });

  it("armar y desarmar son la misma operación al derecho y al revés", () => {
    for (const [cortadora, folio] of [[1, 1], [7, 123], [98, 45678], [99, 999999]]) {
      expect(desarmarCodigo(armarCodigo(cortadora, folio))).toEqual({ cortadora, folio });
    }
  });
});

describe("el rango del lote", () => {
  it("empieza en el siguiente al último entregado", () => {
    // Si empezara en el último, la primera etiqueta del lote repetiría
    // la última del lote anterior
    expect(calcularRango(1200, 200)).toEqual({ folioStart: 1201, folioEnd: 1400 });
  });

  it("un ciclo recién abierto arranca en el folio 1", () => {
    expect(calcularRango(0, 50)).toEqual({ folioStart: 1, folioEnd: 50 });
  });

  it("pedir una sola etiqueta da un rango de una", () => {
    expect(calcularRango(999, 1)).toEqual({ folioStart: 1000, folioEnd: 1000 });
  });

  it("dos lotes seguidos no comparten ni un folio", () => {
    const primero = calcularRango(0, 200);
    const segundo = calcularRango(primero.folioEnd, 200);
    expect(segundo.folioStart).toBe(primero.folioEnd + 1);
    expect(segundo.folioStart).toBe(201);
  });
});

describe("lo que se rechaza antes de tocar la base", () => {
  it("acepta una petición normal", () => {
    expect(() => validarPeticion(7, 200, 1200)).not.toThrow();
  });

  it("rechaza una cortadora fuera de rango y explica el 98 y 99", () => {
    expect(() => validarPeticion(0, 10, 0)).toThrow(ErrorEtiqueta);
    expect(() => validarPeticion(100, 10, 0)).toThrow(ErrorEtiqueta);
    try {
      validarPeticion(150, 10, 0);
    } catch (e) {
      expect((e as ErrorEtiqueta).codigo).toBe("cortadora_invalida");
      expect((e as ErrorEtiqueta).ayuda).toMatch(/98 y 99/);
    }
  });

  it("acepta las cortadoras especiales, que sí existen", () => {
    expect(() => validarPeticion(97, 10, 0)).not.toThrow();
    expect(() => validarPeticion(98, 10, 0)).not.toThrow();
    expect(() => validarPeticion(99, 10, 0)).not.toThrow();
  });

  it("rechaza cantidades imposibles", () => {
    expect(() => validarPeticion(7, 0, 0)).toThrow(ErrorEtiqueta);
    expect(() => validarPeticion(7, -5, 0)).toThrow(ErrorEtiqueta);
    expect(() => validarPeticion(7, 1.5, 0)).toThrow(ErrorEtiqueta);
  });

  it("topa el lote donde topa el agente de impresión", () => {
    expect(() => validarPeticion(7, LOTE_MAXIMO, 0)).not.toThrow();
    try {
      validarPeticion(7, LOTE_MAXIMO + 1, 0);
      throw new Error("debió rechazarse");
    } catch (e) {
      expect((e as ErrorEtiqueta).codigo).toBe("lote_muy_grande");
      // La ayuda tiene que decir qué hacer, no solo que estuvo mal
      expect((e as ErrorEtiqueta).ayuda).toMatch(/Parte la impresión/);
    }
  });

  it("no deja pasar del folio 999999, que ya no cabe en el código", () => {
    // Sin este freno saldría "07-1000000": siete dígitos, y el escáner
    // devolvería un código que no coincide con nada
    expect(() => validarPeticion(7, 1, FOLIO_MAXIMO - 1)).not.toThrow();
    try {
      validarPeticion(7, 2, FOLIO_MAXIMO - 1);
      throw new Error("debió rechazarse");
    } catch (e) {
      expect((e as ErrorEtiqueta).codigo).toBe("folio_agotado");
      expect((e as ErrorEtiqueta).ayuda).toMatch(/Cierra el ciclo/);
    }
  });
});

describe("la vida de una etiqueta", () => {
  it("el camino normal es asignada, impresa, usada", () => {
    expect(puedeTransicionar("asignada", "impresa")).toBe(true);
    expect(puedeTransicionar("impresa", "usada")).toBe(true);
  });

  it("un folio cancelado no revive nunca", () => {
    // Revivirlo es exactamente la manera de acabar con dos etiquetas
    // físicas iguales, que es lo que todo esto trata de evitar
    for (const destino of Object.keys(TRANSICIONES) as EstadoEtiqueta[]) {
      expect(puedeTransicionar("cancelada", destino)).toBe(false);
    }
  });

  it("una etiqueta que ya regresó con su caja es final", () => {
    for (const destino of Object.keys(TRANSICIONES) as EstadoEtiqueta[]) {
      expect(puedeTransicionar("usada", destino)).toBe(false);
    }
  });

  it("no se puede saltar de apartada a usada sin haberse impreso", () => {
    // Una caja no puede llegar con una etiqueta que nunca salió de la impresora
    expect(puedeTransicionar("asignada", "usada")).toBe(false);
  });

  it("solo se reimprime lo que anda en el campo", () => {
    expect(puedeTransicionar("impresa", "reimpresa")).toBe(true);
    expect(puedeTransicionar("asignada", "reimpresa")).toBe(false);
    expect(puedeTransicionar("usada", "reimpresa")).toBe(false);
  });

  it("un lote que se atora se puede cancelar en cualquiera de sus dos etapas", () => {
    expect(puedeTransicionar("asignada", "cancelada")).toBe(true);
    expect(puedeTransicionar("impresa", "cancelada")).toBe(true);
  });
});

describe("plantilla de impresión", () => {
  it("trae los dos marcadores que hay que reemplazar", () => {
    expect(PLANTILLA_TSPL).toContain("{{texto}}");
    expect(PLANTILLA_TSPL).toContain("{{codigo}}");
  });

  it("conserva la medida de la etiqueta que ya se usa", () => {
    // 38 x 25 mm es el rollo que ya está comprado
    const p = plantillaImpresion();
    expect(p.medida).toEqual({ anchoMm: 38, altoMm: 25, separacionMm: 3 });
    expect(PLANTILLA_TSPL).toContain("SIZE 38 mm, 25 mm");
  });

  it("un código real cabe sin dejar marcadores sueltos", () => {
    const salida = PLANTILLA_TSPL
      .replace("{{texto}}", "Cosecha SR 30")
      .replace("{{codigo}}", armarCodigo(7, 123));
    expect(salida).not.toMatch(/\{\{/);
    expect(salida).toContain("07-000123");
  });
});
