/**
 * Pruebas del kiosco de báscula sobre HTTP real.
 *
 * Aquí no se comprueba que los folios se repartan bien —eso es de
 * etiquetas.test.ts— sino que nadie entre sin sesión, que una cuenta apagada
 * deje de servir, y que el kiosco reciba rechazos con los que pueda decidir
 * si reintentar o avisarle a alguien.
 *
 * Se sustituyen solo las funciones que tocan la base; las validaciones puras
 * siguen siendo las de verdad.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "http";

const estado = {
  usuario: usuarioFalso(),
  lote: {
    loteId: 42,
    cicloId: 3,
    cicloNombre: "ciclo 2026-2027",
    cortadora: 7,
    texto: "Cosecha SR 30",
    cantidad: 200,
    folioStart: 1201,
    folioEnd: 1400,
    etiquetas: [],
    yaExistia: false,
  } as any,
  errorAlApartar: null as { codigo: string; mensaje: string; ayuda?: string } | null,
};

function usuarioFalso(extra: Record<string, unknown> = {}) {
  return {
    id: 7,
    email: "bascula1@agra-tecti.com",
    name: "Báscula 1",
    role: "user",
    canViewLabels: true,
    isActive: true,
    ...extra,
  } as any;
}

vi.mock("../auth", () => ({
  getUserFromToken: vi.fn(async (token: string) => (token === "malo" ? null : estado.usuario)),
}));

vi.mock("../etiquetas", async (original) => {
  const real = (await original()) as any;
  return {
    ...real,
    cicloDeHoy: vi.fn(async () => ({
      id: 3, name: "ciclo 2026-2027", startDate: "2026-01-20", endDate: null,
    })),
    apartarFolios: vi.fn(async () => {
      if (estado.errorAlApartar) {
        const e = estado.errorAlApartar;
        throw new real.ErrorEtiqueta(e.codigo, e.mensaje, e.ayuda);
      }
      return estado.lote;
    }),
    ciclosParaImprimir: vi.fn(async () => ([
      { id: 4, name: "ciclo 2026-2027", startDate: "2026-08-01", endDate: null,
        esElDeHoy: true, ultimoFolio: 0, impresas: 0, pendientes: 0 },
      { id: 3, name: "ciclo 2025-2026", startDate: "2025-01-20", endDate: "2026-07-31",
        esElDeHoy: false, ultimoFolio: 30450, impresas: 30450, pendientes: 12 },
    ])),
    confirmarLote: vi.fn(async () => ({ confirmadas: 200 })),
    cancelarLote: vi.fn(async () => ({ canceladas: 200 })),
    reimprimirEtiqueta: vi.fn(async () => ({ ...estado.lote, reemplaza: "07-000123" })),
    etiquetasPendientes: vi.fn(async () => ({ cicloId: 3, cortadoras: [], total: 0 })),
    resumenEtiquetas: vi.fn(async () => ({ cicloId: 3, porEstado: {}, total: 0, porCortadora: [] })),
    listarLotes: vi.fn(async () => []),
    expedienteEtiqueta: vi.fn(async (codigo: string) => {
      if (codigo === "07-999999") {
        throw new real.ErrorEtiqueta("etiqueta_desconocida", `No hay rastro de ${codigo}`);
      }
      return { codigo, detalle: "etiqueta", enOtrosCiclos: [] };
    }),
  };
});

let servidor: Server;
let base: string;

beforeAll(async () => {
  const { crearApiCampo } = await import("./index");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/campo/v1", crearApiCampo());
  await new Promise<void>((listo) => {
    servidor = app.listen(0, () => listo());
  });
  base = `http://127.0.0.1:${(servidor.address() as any).port}/api/campo/v1`;
});

afterAll(() => servidor?.close());

beforeEach(() => {
  estado.usuario = usuarioFalso();
  estado.errorAlApartar = null;
});

async function pedir(ruta: string, opciones: RequestInit = {}) {
  const r = await fetch(`${base}${ruta}`, {
    ...opciones,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer bueno",
      ...(opciones.headers ?? {}),
    },
  });
  return { estado: r.status, cuerpo: await r.json() };
}

describe("puerta de entrada", () => {
  it("sin token no se pasa, y se dice de dónde sale uno", async () => {
    const r = await fetch(`${base}/ciclos/actual`);
    const cuerpo = await r.json();

    expect(r.status).toBe(401);
    expect(cuerpo.error.codigo).toBe("sin_sesion");
    expect(cuerpo.error.ayuda).toContain("auth.loginMobile");
    expect(cuerpo.datos).toBeUndefined();
  });

  it("un token caducado se distingue de no haber mandado ninguno", async () => {
    const r = await pedir("/ciclos/actual", { headers: { Authorization: "Bearer malo" } });
    expect(r.estado).toBe(401);
    expect(r.cuerpo.error.codigo).toBe("sesion_invalida");
    expect(r.cuerpo.error.ayuda).toContain("refreshMobile");
  });

  it("una cuenta apagada deja de servir aunque el token siga vivo", async () => {
    // Es lo que permite cortarle la sesión a una tableta perdida sin borrar al
    // usuario ni arrastrar el rastro de lo que capturó
    estado.usuario = usuarioFalso({ isActive: false });
    const r = await pedir("/ciclos/actual");
    expect(r.estado).toBe(403);
    expect(r.cuerpo.error.codigo).toBe("cuenta_desactivada");
  });

  it("la portada no pide sesión: es lo que se lee para saber cómo entrar", async () => {
    const r = await fetch(`${base}/`);
    const cuerpo = await r.json();
    expect(r.status).toBe(200);
    expect(cuerpo.datos.autenticacion).toContain("Bearer");
    expect(cuerpo.datos.nota).toMatch(/Nunca mandes un folio/);
  });

  it("sin permiso de etiquetas se puede consultar pero no imprimir", async () => {
    estado.usuario = usuarioFalso({ canViewLabels: false, role: "user" });

    const consulta = await pedir("/etiquetas/resumen");
    expect(consulta.estado).toBe(200);

    const impresion = await pedir("/etiquetas/lotes", {
      method: "POST",
      body: JSON.stringify({ cortadora: 7, cantidad: 200, texto: "Cosecha SR 30" }),
    });
    expect(impresion.estado).toBe(403);
    expect(impresion.cuerpo.error.codigo).toBe("sin_permiso");
  });

  it("un administrador imprime aunque no tenga el permiso marcado", async () => {
    estado.usuario = usuarioFalso({ canViewLabels: false, role: "admin" });
    const r = await pedir("/etiquetas/lotes", {
      method: "POST",
      body: JSON.stringify({ cortadora: 7, cantidad: 200, texto: "Cosecha SR 30" }),
    });
    expect(r.estado).toBe(200);
  });
});

describe("orden de las rutas", () => {
  // /etiquetas/:codigo es la última a propósito. Si estuviera antes, Express
  // tomaría "pendientes" como un código de caja y el reporte de merma
  // contestaría "no existe la etiqueta pendientes".
  it("pendientes es el reporte, no un código de caja", async () => {
    const r = await pedir("/etiquetas/pendientes");
    expect(r.estado).toBe(200);
    expect(r.cuerpo.datos.significado).toMatch(/todavía no regresan/);
  });

  it("resumen es el corte del ciclo", async () => {
    const r = await pedir("/etiquetas/resumen");
    expect(r.estado).toBe(200);
    expect(r.cuerpo.datos.cicloId).toBe(3);
  });

  it("lotes es el historial", async () => {
    const r = await pedir("/etiquetas/lotes");
    expect(r.estado).toBe(200);
    expect(r.cuerpo.datos.lotes).toEqual([]);
  });

  it("y un código de verdad sí llega al expediente", async () => {
    const r = await pedir("/etiquetas/07-000123");
    expect(r.estado).toBe(200);
    expect(r.cuerpo.datos.codigo).toBe("07-000123");
  });
});

describe("apartar folios", () => {
  it("devuelve el rango que tocó y dice qué hacer después", async () => {
    const r = await pedir("/etiquetas/lotes", {
      method: "POST",
      headers: { "X-Dispositivo": "bascula-1" },
      body: JSON.stringify({ cortadora: 7, cantidad: 200, texto: "Cosecha SR 30" }),
    });

    expect(r.estado).toBe(200);
    expect(r.cuerpo.datos.folioStart).toBe(1201);
    expect(r.cuerpo.datos.folioEnd).toBe(1400);
    // El kiosco tiene que saber que falta confirmar, o los folios se quedan
    // apartados sin contar como impresos
    expect(r.cuerpo.datos.siguientePaso).toContain("/confirmar");
    expect(r.cuerpo.meta.dispositivo).toBe("bascula-1");
  });

  it("un reenvío del mismo clientUuid avisa que no se pidió de más", async () => {
    estado.lote = { ...estado.lote, yaExistia: true };
    const r = await pedir("/etiquetas/lotes", {
      method: "POST",
      body: JSON.stringify({ cortadora: 7, cantidad: 200, texto: "x", clientUuid: "abc" }),
    });
    expect(r.cuerpo.datos.siguientePaso).toMatch(/no se pidió de más/);
  });

  it("rechaza una petición sin los datos mínimos", async () => {
    const sinTexto = await pedir("/etiquetas/lotes", {
      method: "POST",
      body: JSON.stringify({ cortadora: 7, cantidad: 200 }),
    });
    expect(sinTexto.estado).toBe(400);
    expect(sinTexto.cuerpo.error.codigo).toBe("texto_requerido");

    const sinCortadora = await pedir("/etiquetas/lotes", {
      method: "POST",
      body: JSON.stringify({ cantidad: 200, texto: "x" }),
    });
    expect(sinCortadora.estado).toBe(400);
    expect(sinCortadora.cuerpo.error.codigo).toBe("cortadora_invalido");
  });

  it("cancelar avisa que esos folios no se reutilizan", async () => {
    const r = await pedir("/etiquetas/lotes/42/cancelar", {
      method: "POST",
      body: JSON.stringify({ motivo: "se atoró el rollo" }),
    });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.datos.nota).toMatch(/No se reutilizan/);
  });
});

describe("rechazos que el kiosco tiene que saber leer", () => {
  it("sin ciclo abierto contesta 409, no 400", async () => {
    // La diferencia importa: un 400 le dice al kiosco "corrige y reintenta",
    // y esto no lo puede corregir el kiosco. Reintentarlo en bucle no arregla
    // nada y llena la base de intentos.
    estado.errorAlApartar = {
      codigo: "sin_ciclo_abierto",
      mensaje: "Hoy no cae dentro de ningún ciclo de producción",
      ayuda: "Abre el ciclo en Ciclos de producción antes de imprimir.",
    };
    const r = await pedir("/etiquetas/lotes", {
      method: "POST",
      body: JSON.stringify({ cortadora: 7, cantidad: 200, texto: "x" }),
    });

    expect(r.estado).toBe(409);
    expect(r.cuerpo.error.codigo).toBe("sin_ciclo_abierto");
    expect(r.cuerpo.error.ayuda).toContain("Ciclos de producción");
  });

  it("un folio agotado también es 409: no depende del kiosco", async () => {
    estado.errorAlApartar = {
      codigo: "folio_agotado",
      mensaje: "El ciclo llegó al tope",
      ayuda: "Cierra el ciclo.",
    };
    const r = await pedir("/etiquetas/lotes", {
      method: "POST",
      body: JSON.stringify({ cortadora: 7, cantidad: 200, texto: "x" }),
    });
    expect(r.estado).toBe(409);
  });

  it("una etiqueta que no existe es 404", async () => {
    const r = await pedir("/etiquetas/07-999999");
    expect(r.estado).toBe(404);
    expect(r.cuerpo.error.codigo).toBe("etiqueta_desconocida");
  });

  it("una ruta inventada manda a la portada", async () => {
    const r = await pedir("/etiquetas-de-parcela");
    expect(r.estado).toBe(404);
    expect(r.cuerpo.error.codigo).toBe("ruta_desconocida");
    expect(r.cuerpo.error.ayuda).toContain("/api/campo/v1/");
  });
});

describe("escoger el ciclo al imprimir", () => {
  it("lista los ciclos y marca cuál es el de hoy", async () => {
    const r = await pedir("/ciclos");

    expect(r.estado).toBe(200);
    expect(r.cuerpo.datos.ciclos).toHaveLength(2);
    const deHoy = r.cuerpo.datos.ciclos.filter((c: any) => c.esElDeHoy);
    expect(deHoy).toHaveLength(1);
    expect(deHoy[0].name).toBe("ciclo 2026-2027");
    // Un ciclo recién abierto empieza en cero; el viejo sigue donde se quedó
    expect(deHoy[0].ultimoFolio).toBe(0);
    expect(r.cuerpo.datos.ciclos[1].ultimoFolio).toBe(30450);
  });

  it("avisa que mandar otro ciclo tiene consecuencias", async () => {
    const r = await pedir("/ciclos");
    expect(r.cuerpo.datos.nota).toMatch(/no encuentra su caja/);
  });

  it("sin decir ciclo, se aparta para el de hoy", async () => {
    const { apartarFolios } = (await import("../etiquetas")) as any;
    apartarFolios.mockClear();

    await pedir("/etiquetas/lotes", {
      method: "POST",
      body: JSON.stringify({ cortadora: 7, cantidad: 200, texto: "x" }),
    });

    // undefined y no un número: quien no manda ciclo está diciendo "el de hoy",
    // que lo resuelve el servidor, no el kiosco
    expect(apartarFolios.mock.calls[0][0].cicloId).toBeUndefined();
  });

  it("se puede apartar para un ciclo anterior a propósito", async () => {
    const { apartarFolios } = (await import("../etiquetas")) as any;
    apartarFolios.mockClear();

    const r = await pedir("/etiquetas/lotes", {
      method: "POST",
      body: JSON.stringify({ cortadora: 7, cantidad: 200, texto: "x", ciclo: 3 }),
    });

    expect(r.estado).toBe(200);
    expect(apartarFolios.mock.calls[0][0].cicloId).toBe(3);
  });

  it("un ciclo que no es un id se rechaza diciendo dónde ver los buenos", async () => {
    const r = await pedir("/etiquetas/lotes", {
      method: "POST",
      body: JSON.stringify({ cortadora: 7, cantidad: 200, texto: "x", ciclo: "el pasado" }),
    });

    expect(r.estado).toBe(400);
    expect(r.cuerpo.error.codigo).toBe("ciclo_invalido");
    expect(r.cuerpo.error.ayuda).toContain("/ciclos");
  });

  it("un ciclo inexistente es 400, no 409: el kiosco lo puede corregir", async () => {
    estado.errorAlApartar = {
      codigo: "ciclo_desconocido",
      mensaje: "No existe el ciclo 999",
      ayuda: "Consulta los ciclos disponibles antes de apartar folios.",
    };
    const r = await pedir("/etiquetas/lotes", {
      method: "POST",
      body: JSON.stringify({ cortadora: 7, cantidad: 200, texto: "x", ciclo: 999 }),
    });

    expect(r.estado).toBe(400);
    expect(r.cuerpo.error.codigo).toBe("ciclo_desconocido");
  });
});
