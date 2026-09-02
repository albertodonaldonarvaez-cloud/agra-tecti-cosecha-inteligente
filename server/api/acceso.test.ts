/**
 * Pruebas del control de acceso de /api/v1, sobre HTTP real.
 *
 * Esta API sale a internet. Lo que se comprueba aquí no es que los datos estén
 * bien —eso es de otras pruebas— sino que nadie los alcance sin llave, que una
 * llave de solo lectura no pueda gastar la cuota de IA, y que cuando algo se
 * rechaza el agente reciba una respuesta con la que pueda hacer algo.
 *
 * Se simula la capa de llaves (probada aparte en apiKeys.test.ts) para poder
 * correr esto sin base de datos.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "http";

const estado = {
  verificacion: { ok: true, llave: { key: llaveFalsa("lectura"), user: usuarioFalso() } } as any,
  limite: { permitido: true, esperaSegundos: 0 },
  cuota: { permitido: true, usadas: 1, usadasIa: 0 } as any,
};

function llaveFalsa(scope: "lectura" | "lectura_ia") {
  return {
    id: 1,
    name: "Agente de prueba",
    scope,
    userId: 7,
    rateLimitPerMin: 60,
    dailyQuota: 5000,
    dailyAiQuota: 20,
    revokedAt: null,
    expiresAt: null,
  };
}

function usuarioFalso() {
  return { id: 7, email: "agente@agra-tecti.com", name: "Agente", role: "admin" };
}

vi.mock("../apiKeys", () => ({
  verifyApiKey: vi.fn(async () => estado.verificacion),
  checkRateLimit: vi.fn(() => estado.limite),
  consumirCuota: vi.fn(async () => estado.cuota),
  marcarUso: vi.fn(),
}));

// El catálogo y el diccionario no tocan la base: son los que se usan para probar
// el camino feliz sin levantar MySQL.
let servidor: Server;
let base: string;

beforeAll(async () => {
  const { crearApiV1 } = await import("./index");
  const app = express();
  app.use("/api/v1", crearApiV1());
  await new Promise<void>((listo) => {
    servidor = app.listen(0, () => listo());
  });
  const dir = servidor.address() as any;
  base = `http://127.0.0.1:${dir.port}/api/v1`;
});

afterAll(() => {
  servidor?.close();
});

beforeEach(() => {
  estado.verificacion = { ok: true, llave: { key: llaveFalsa("lectura"), user: usuarioFalso() } };
  estado.limite = { permitido: true, esperaSegundos: 0 };
  estado.cuota = { permitido: true, usadas: 1, usadasIa: 0 };
});

async function pedir(ruta: string, cabeceras: Record<string, string> = {}) {
  const r = await fetch(`${base}${ruta}`, { headers: cabeceras });
  return { estado: r.status, cabeceras: r.headers, cuerpo: await r.json() };
}

describe("puerta de entrada", () => {
  it("sin llave no se pasa, y se dice cómo conseguirla", async () => {
    estado.verificacion = { ok: false, motivo: "sin_llave" };
    const r = await pedir("/catalogo");

    expect(r.estado).toBe(401);
    expect(r.cuerpo.ok).toBe(false);
    expect(r.cuerpo.error.codigo).toBe("sin_llave");
    expect(r.cuerpo.error.ayuda).toContain("X-API-Key");
    // Ni un dato se escapa en la respuesta de rechazo
    expect(r.cuerpo.datos).toBeUndefined();
  });

  it("distingue una llave revocada de una que nunca existió", async () => {
    estado.verificacion = { ok: false, motivo: "revocada" };
    const revocada = await pedir("/catalogo");
    expect(revocada.cuerpo.error.codigo).toBe("revocada");
    expect(revocada.cuerpo.error.mensaje).toMatch(/revocada/);

    estado.verificacion = { ok: false, motivo: "caducada" };
    const caducada = await pedir("/catalogo");
    expect(caducada.cuerpo.error.mensaje).toMatch(/caducó/);
  });

  it("con llave buena responde con el envoltorio de siempre", async () => {
    const r = await pedir("/catalogo", { "X-API-Key": "agt_live_loquesea" });

    expect(r.estado).toBe(200);
    expect(r.cuerpo.ok).toBe(true);
    expect(r.cuerpo.datos.totalEndpoints).toBeGreaterThan(15);
    expect(r.cuerpo.meta.zonaHoraria).toBe("America/Mexico_City");
    expect(r.cuerpo.meta.cuota.limiteDiario).toBe(5000);
  });

  it("la portada no pide llave: es lo que se lee para saber cómo entrar", async () => {
    estado.verificacion = { ok: false, motivo: "sin_llave" };
    const r = await pedir("/");

    expect(r.estado).toBe(200);
    expect(r.cuerpo.datos.autenticacion).toContain("X-API-Key");
    expect(r.cuerpo.datos.soloLectura).toBe(true);
  });
});

describe("topes", () => {
  it("al pasarse del límite por minuto dice cuánto esperar", async () => {
    estado.limite = { permitido: false, esperaSegundos: 12 };
    const r = await pedir("/catalogo", { "X-API-Key": "agt_live_x" });

    expect(r.estado).toBe(429);
    expect(r.cabeceras.get("retry-after")).toBe("12");
    expect(r.cuerpo.error.codigo).toBe("demasiadas_peticiones");
    expect(r.cuerpo.error.ayuda).toContain("12 s");
  });

  it("al agotar la cuota del día explica cuándo se reinicia", async () => {
    estado.cuota = { permitido: false, motivo: "cuota_diaria", usadas: 5001, usadasIa: 0 };
    const r = await pedir("/catalogo", { "X-API-Key": "agt_live_x" });

    expect(r.estado).toBe(429);
    expect(r.cuerpo.error.codigo).toBe("cuota_diaria");
    expect(r.cuerpo.error.ayuda).toMatch(/medianoche/);
  });
});

describe("alcance de la llave", () => {
  it("una llave de solo lectura no puede pedir la redacción de la IA", async () => {
    const r = await pedir("/labores/reporte?desde=2026-08-01&hasta=2026-08-31&ia=true", {
      "X-API-Key": "agt_live_x",
    });

    expect(r.estado).toBe(403);
    expect(r.cuerpo.error.codigo).toBe("alcance_insuficiente");
    expect(r.cuerpo.error.ayuda).toContain("lectura_ia");
  });

  it("pero sí puede pedir el mismo reporte sin IA", async () => {
    // Sin base de datos la consulta falla, pero lo que importa es que ya no
    // se rechaza por alcance: el 403 se convierte en otra cosa
    const r = await pedir("/labores/reporte?desde=2026-08-01&hasta=2026-08-31", {
      "X-API-Key": "agt_live_x",
    });
    expect(r.cuerpo.error?.codigo).not.toBe("alcance_insuficiente");
  });
});

describe("errores que el agente tiene que poder corregir solo", () => {
  it("una fecha mal escrita se rechaza diciendo el formato", async () => {
    const r = await pedir("/cosecha/resumen?desde=31/08/2026", { "X-API-Key": "agt_live_x" });

    expect(r.estado).toBe(400);
    expect(r.cuerpo.error.codigo).toBe("fecha_invalida");
    expect(r.cuerpo.error.ayuda).toContain("YYYY-MM-DD");
  });

  it("un rango invertido se rechaza en vez de devolver vacío", async () => {
    const r = await pedir("/cosecha/resumen?desde=2026-09-01&hasta=2026-08-01", {
      "X-API-Key": "agt_live_x",
    });

    expect(r.estado).toBe(400);
    expect(r.cuerpo.error.codigo).toBe("rango_invertido");
  });

  it("una ruta que no existe manda al catálogo", async () => {
    const r = await pedir("/cosechas", { "X-API-Key": "agt_live_x" });

    expect(r.estado).toBe(404);
    expect(r.cuerpo.error.codigo).toBe("ruta_desconocida");
    expect(r.cuerpo.error.ayuda).toContain("/api/v1/catalogo");
  });

  it("un valor fuera del catálogo cerrado enumera los válidos", async () => {
    const r = await pedir("/series?granularidad=trimestre", { "X-API-Key": "agt_live_x" });

    expect(r.estado).toBe(400);
    expect(r.cuerpo.error.ayuda).toContain("dia, semana, mes");
  });
});
