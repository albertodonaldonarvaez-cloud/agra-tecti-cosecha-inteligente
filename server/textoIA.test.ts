/**
 * El texto de la IA tal como llega de DeepSeek, y cómo queda para mostrarse.
 *
 * Los casos salen de respuestas reales: títulos con distintos niveles de "#",
 * negritas que hacen de título, viñetas con "*", espacios dobles al final y
 * frases de cortesía al arranque. Lo que se cuida es que no quede ni un
 * asterisco a la vista y que la estructura (títulos, listas) sobreviva.
 */
import { describe, it, expect } from "vitest";
import {
  bloquesDeTextoIA,
  fragmentosDe,
  limpiarTextoIA,
  textoIAComoHtml,
  textoIAPlano,
} from "../shared/textoIA";

describe("limpiarTextoIA", () => {
  it("lleva cualquier nivel de título a ###", () => {
    expect(limpiarTextoIA("# Estado\n## Riego\n#### Plagas")).toBe("### Estado\n### Riego\n### Plagas");
  });

  it("una línea toda en negritas es un título", () => {
    expect(limpiarTextoIA("**Diagnóstico:**\nTodo bien")).toBe("### Diagnóstico\nTodo bien");
  });

  it("'Acciones:' sola en su renglón es un título, una frase larga no", () => {
    expect(limpiarTextoIA("Acciones:  \n1. Regar")).toBe("### Acciones\n1. Regar");
    const frase = "Para el riego de esta semana conviene revisar lo siguiente:";
    expect(limpiarTextoIA(frase)).toBe(frase);
  });

  it("unifica las viñetas y los números", () => {
    expect(limpiarTextoIA("* uno\n• dos\n  + tres\n1) cuatro")).toBe("- uno\n- dos\n- tres\n1. cuatro");
  });

  it("no confunde una negrita al inicio con una viñeta", () => {
    expect(limpiarTextoIA("**Micaela** está seca")).toBe("**Micaela** está seca");
  });

  it("quita la frase de cortesía, las cercas de código y los separadores", () => {
    const crudo = "Claro, aquí tienes el análisis:\n```markdown\n### Estado\n---\nBien\n```";
    expect(limpiarTextoIA(crudo)).toBe("### Estado\n\nBien");
  });

  it("convierte una tabla en viñetas", () => {
    const tabla = "| Parcela | NDVI |\n|---|---|\n| Micaela | 0.31 |";
    expect(limpiarTextoIA(tabla)).toBe("- Parcela · NDVI\n- Micaela · 0.31");
  });

  it("no deja pasar el razonamiento si viene mezclado", () => {
    expect(limpiarTextoIA("<think>pienso…</think>Respuesta")).toBe("Respuesta");
  });

  it("no truena con algo que no es texto", () => {
    expect(limpiarTextoIA(null)).toBe("");
    expect(limpiarTextoIA(undefined)).toBe("");
  });
});

describe("fragmentosDe", () => {
  it("separa las negritas", () => {
    expect(fragmentosDe("El **noreste** está seco")).toEqual([
      { texto: "El " },
      { texto: "noreste", negrita: true },
      { texto: " está seco" },
    ]);
  });

  it("quita cursivas y asteriscos sueltos sin tocar nombres con guion bajo", () => {
    expect(fragmentosDe("Labor _urgente_ de control_maleza *")).toEqual([
      { texto: "Labor urgente de control_maleza " },
    ]);
  });
});

describe("bloquesDeTextoIA", () => {
  it("arma títulos, párrafos y listas", () => {
    const bloques = bloquesDeTextoIA("### Estado\nVigor bajo.\nSigue igual.\n\n- Regar\n\n- Revisar emisores\n\n1. Hoy\n2. Mañana");
    expect(bloques.map((b) => b.tipo)).toEqual(["titulo", "parrafo", "lista", "lista"]);
    // Dos renglones seguidos son el mismo párrafo
    expect((bloques[1] as any).lineas).toHaveLength(2);
    // El renglón vacío entre viñetas no parte la lista
    expect((bloques[2] as any).items).toHaveLength(2);
    expect((bloques[3] as any).numerada).toBe(true);
  });

  it("la respuesta real de DeepSeek queda sin marcas", () => {
    const real =
      "Diagnóstico: NDVI en descenso (0.41 → 0.31).  \n" +
      "Acciones:  \n" +
      "1. Inspeccionar el **sector noreste**.  \n" +
      "2. Corregir el riego.";
    const bloques = bloquesDeTextoIA(real);
    expect(bloques.map((b) => b.tipo)).toEqual(["parrafo", "titulo", "lista"]);
    expect(JSON.stringify(bloques)).not.toContain("*");
  });
});

describe("salidas", () => {
  it("el HTML escapa y no deja saltos entre etiquetas", () => {
    const html = textoIAComoHtml("### Riego <urgente>\n- Revisar **Micaela**");
    expect(html).toBe("<h4>Riego &lt;urgente&gt;</h4><ul><li>Revisar <strong>Micaela</strong></li></ul>");
    expect(html).not.toContain("\n");
  });

  it("el texto plano conserva renglones y viñetas", () => {
    expect(textoIAPlano("### Acciones\n- Regar **hoy**\n- Podar")).toBe("Acciones\n\n• Regar hoy\n• Podar");
  });
});
