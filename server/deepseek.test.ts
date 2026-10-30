/**
 * La llamada a DeepSeek, sin red: el fetch es de mentiras.
 *
 * Lo que importa aquí es lo que pasa cuando algo sale mal, porque es lo que
 * se ve en producción: que un modelo renombrado no deje la pantalla en blanco,
 * que una clave mala no se reintente gastando, y que el motivo llegue en
 * palabras que se puedan mostrar.
 */
import { describe, it, expect } from "vitest";
import { MODELO_IA, MODELO_RESPALDO, explicarError, pedirADeepSeek, type DependenciasIA } from "./deepseek";

/** Respuesta de la API con lo mínimo que se lee */
function ok(content: string, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      model: "deepseek-v4-pro",
      choices: [{ message: { content }, finish_reason: "stop", ...extra }],
      usage: { completion_tokens: 10, completion_tokens_details: { reasoning_tokens: 5 } },
    }),
    { status: 200 },
  );
}

function error(status: number, message: string) {
  return new Response(JSON.stringify({ error: { message } }), { status });
}

/** Un fetch que contesta en orden y anota qué modelo se pidió en cada vuelta */
function falso(respuestas: Array<Response | Error>, clave: string | null = "sk-prueba") {
  const modelos: string[] = [];
  const deps: DependenciasIA = {
    fetch: (async (_url: any, init: any) => {
      modelos.push(JSON.parse(init.body).model);
      const r = respuestas.shift();
      if (r instanceof Error) throw r;
      return r!;
    }) as any,
    clave: async () => (clave ? { key: clave } : { key: null, motivo: "No hay clave" }),
  };
  return { deps, modelos };
}

const PETICION = { etiqueta: "[prueba]", prompt: "hola" };

describe("pedirADeepSeek", () => {
  it("usa el modelo principal y limpia el texto", async () => {
    const { deps, modelos } = falso([ok("Claro, aquí va:\n**Estado:**\n* bien")]);
    const r = await pedirADeepSeek(PETICION, deps);
    expect(r).toEqual({ ok: true, texto: "### Estado\n- bien", modelo: "deepseek-v4-pro" });
    expect(modelos).toEqual([MODELO_IA]);
  });

  it("si el modelo ya no existe, entra el de respaldo", async () => {
    const { deps, modelos } = falso([
      error(400, "The supported API model names are deepseek-flash, but you passed deepseek-v4-pro"),
      ok("Todo en orden"),
    ]);
    const r = await pedirADeepSeek(PETICION, deps);
    expect(r.ok).toBe(true);
    expect(modelos).toEqual([MODELO_IA, MODELO_RESPALDO]);
  });

  it("una respuesta vacía por falta de presupuesto también va al respaldo", async () => {
    const { deps, modelos } = falso([ok("", { finish_reason: "length" }), ok("Ya respondí")]);
    const r = await pedirADeepSeek(PETICION, deps);
    expect(r).toMatchObject({ ok: true, texto: "Ya respondí" });
    expect(modelos).toHaveLength(2);
  });

  it("una clave rechazada no se reintenta", async () => {
    const { deps, modelos } = falso([error(401, "Authentication Fails")]);
    const r = await pedirADeepSeek(PETICION, deps);
    expect(r).toMatchObject({ ok: false, sinClave: false });
    expect((r as any).detalle).toContain("401");
    expect(modelos).toHaveLength(1);
  });

  it("si fallan los dos, dice los dos motivos", async () => {
    const { deps } = falso([error(503, "busy"), new Error("socket hang up")]);
    const r = await pedirADeepSeek(PETICION, deps);
    expect(r.ok).toBe(false);
    expect((r as any).detalle).toContain("503");
    expect((r as any).detalle).toContain("socket hang up");
  });

  it("sin clave no llama a nadie y lo dice", async () => {
    const { deps, modelos } = falso([], null);
    const r = await pedirADeepSeek(PETICION, deps);
    expect(r).toEqual({ ok: false, sinClave: true, detalle: "No hay clave" });
    expect(modelos).toHaveLength(0);
  });

  it("en modo JSON pide response_format y no toca el texto", async () => {
    let cuerpo: any = null;
    const deps: DependenciasIA = {
      fetch: (async (_u: any, init: any) => { cuerpo = JSON.parse(init.body); return ok('{"resumen":"**x**"}'); }) as any,
      clave: async () => ({ key: "sk" }),
    };
    const r = await pedirADeepSeek({ ...PETICION, json: true }, deps);
    expect(cuerpo.response_format).toEqual({ type: "json_object" });
    expect(r).toMatchObject({ ok: true, texto: '{"resumen":"**x**"}' });
  });
});

describe("explicarError", () => {
  it("el saldo agotado se dice claro y no se reintenta", () => {
    expect(explicarError(402, "{}")).toMatchObject({ reintentable: false });
    expect(explicarError(402, "{}").detalle).toContain("saldo");
  });

  it("no muestra el request_id de DeepSeek", () => {
    const e = explicarError(422, JSON.stringify({ error: { message: "Bad param (request_id: abc-123)" } }));
    expect(e.detalle).toBe("DeepSeek respondió 422: Bad param");
  });
});
