/**
 * Las rutas de pesaje del kiosco, sobre HTTP real.
 *
 * Aquí no se prueba la aritmética del peso —eso es de pesaje.test.ts— sino lo
 * que decide la puerta: quién puede escribir cajas, qué forma tiene un envío
 * que se acepta, y que un rechazo diga si conviene reintentar o no. Una
 * báscula sin señal reintenta sola, y un 400 mal puesto la deja reintentando
 * para siempre algo que nunca va a pasar.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "http";

const estado = {
  usuario: usuarioFalso(),
  recibido: null as any,
  errorAlRecibir: null as { codigo: string; mensaje: string; ayuda?: string } | null,
};

function usuarioFalso(extra: Record<string, unknown> = {}) {
  return {
    id: 7,
    email: "bascula1@agra-tecti.com",
    name: "Báscula 1",
    role: "user",
    canViewLabels: true,
    canWeighBoxes: true,
    isActive: true,
    ...extra,
  } as any;
}

vi.mock("../auth", () => ({
  getUserFromToken: vi.fn(async (token: string) => (token === "malo" ? null : estado.usuario)),
}));

vi.mock("../pesaje", async (original) => {
  const real = (await original()) as any;
  return {
    ...real,
    recibirCajas: vi.fn(async ({ cajas, usuarioId, deviceId }: any) => {
      if (estado.errorAlRecibir) {
        const e = estado.errorAlRecibir;
        throw new ErrorEtiquetaReal(e.codigo, e.mensaje, e.ayuda);
      }
      estado.recibido = { cajas, usuarioId, deviceId };
      return {
        recibidas: cajas.length,
        creadas: cajas.length,
        duplicadas: 0,
        rechazadas: 0,
        conRevision: 0,
        resultados: cajas.map((c: any, indice: number) => ({
          indice,
          clientUuid: c.clientUuid,
          codigo: c.codigo,
          estado: "creada",
          cajaId: 1000 + indice,
        })),
      };
    }),
    tiposDeCaja: vi.fn(async () => ({ tipos: [], nota: "sin tipos" })),
    estadoDeCaja: vi.fn(async (codigo: string, cicloId?: number | null) => ({
      codigo,
      cicloId: cicloId ?? null,
      pesada: false,
      veces: 0,
      cajas: [],
    })),
    conflictosDePesaje: vi.fn(async ({ cicloId }: any) => ({
      cicloId: cicloId ?? null,
      total: 0,
      conflictos: [],
    })),
  };
});

let ErrorEtiquetaReal: any;
let servidor: Server;
let base: string;

beforeAll(async () => {
  ErrorEtiquetaReal = (await import("../etiquetas")).ErrorEtiqueta;
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
  estado.recibido = null;
  estado.errorAlRecibir = null;
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

function unPesaje(extra: Record<string, unknown> = {}) {
  return {
    clientUuid: "5b9f0f4a-0000-4000-8000-000000000001",
    codigo: "07-001201",
    pesoBrutoGramos: 13450,
    taraGramos: 1200,
    pesadoEn: "2026-09-10T14:23:00-06:00",
    ...extra,
  };
}

describe("quién puede escribir cajas", () => {
  it("pesar tiene su propio permiso y no se hereda del de etiquetas", () => {
    // Imprimir de más cuesta papel. Pesar de más mete cajas en la cosecha, que
    // es el dato del que cuelga todo lo demás.
    estado.usuario = usuarioFalso({ canViewLabels: true, canWeighBoxes: false });
    return pedir("/cosecha/cajas", {
      method: "POST",
      body: JSON.stringify({ cajas: [unPesaje()] }),
    }).then((r) => {
      expect(r.estado).toBe(403);
      expect(r.cuerpo.error.codigo).toBe("sin_permiso");
      expect(r.cuerpo.error.ayuda).toContain("Pesar cajas");
    });
  });

  it("un administrador pesa aunque no tenga la casilla encendida", async () => {
    estado.usuario = usuarioFalso({ role: "admin", canWeighBoxes: false });
    const r = await pedir("/cosecha/cajas", {
      method: "POST",
      body: JSON.stringify({ cajas: [unPesaje()] }),
    });
    expect(r.estado).toBe(200);
  });

  it("sin sesión no se escribe nada", async () => {
    const r = await fetch(`${base}/cosecha/cajas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cajas: [unPesaje()] }),
    });
    expect(r.status).toBe(401);
    expect(estado.recibido).toBeNull();
  });

  it("consultar si una caja ya se pesó no exige el permiso de pesar", async () => {
    // El kiosco necesita preguntarlo ANTES de tener permiso de escribir, y es
    // una lectura de algo que la misma cuenta ya ve en la web
    estado.usuario = usuarioFalso({ canWeighBoxes: false });
    const r = await pedir("/cosecha/cajas/07-001201");
    expect(r.estado).toBe(200);
    expect(r.cuerpo.datos.codigo).toBe("07-001201");
  });
});

describe("la forma del envío", () => {
  it("cada caja llega con el usuario y el aparato que la pesó", async () => {
    const r = await pedir("/cosecha/cajas", {
      method: "POST",
      headers: { "X-Dispositivo": "bascula-1" },
      body: JSON.stringify({ cajas: [unPesaje(), unPesaje({ clientUuid: "otro" })] }),
    });

    expect(r.estado).toBe(200);
    expect(estado.recibido.usuarioId).toBe(7);
    expect(estado.recibido.deviceId).toBe("bascula-1");
    expect(estado.recibido.cajas).toHaveLength(2);
  });

  it("sin el encabezado del aparato se guarda en nulo, no se inventa", async () => {
    await pedir("/cosecha/cajas", {
      method: "POST",
      body: JSON.stringify({ cajas: [unPesaje()] }),
    });
    expect(estado.recibido.deviceId).toBeNull();
  });

  it("un cuerpo sin el arreglo de cajas dice qué mandar", async () => {
    const r = await pedir("/cosecha/cajas", { method: "POST", body: JSON.stringify({}) });
    expect(r.estado).toBe(400);
    expect(r.cuerpo.error.codigo).toBe("cajas_requerido");
    expect(r.cuerpo.error.ayuda).toContain("cajas");
  });

  it("una caja suelta fuera del arreglo no se cuela", async () => {
    const r = await pedir("/cosecha/cajas", {
      method: "POST",
      body: JSON.stringify(unPesaje()),
    });
    expect(r.estado).toBe(400);
    expect(estado.recibido).toBeNull();
  });

  it("cada resultado trae el índice de su caja, para poder casarlo con la cola", async () => {
    // El kiosco tiene que saber CUÁL de las doscientas quedó, no cuántas
    const r = await pedir("/cosecha/cajas", {
      method: "POST",
      body: JSON.stringify({ cajas: [unPesaje(), unPesaje({ clientUuid: "b", codigo: "07-001202" })] }),
    });
    expect(r.cuerpo.datos.resultados.map((x: any) => x.indice)).toEqual([0, 1]);
    expect(r.cuerpo.datos.resultados[1].codigo).toBe("07-001202");
  });
});

describe("rechazos con los que se puede decidir", () => {
  it("una tanda demasiado grande se parte, no se reintenta igual", async () => {
    estado.errorAlRecibir = {
      codigo: "envio_muy_grande",
      mensaje: "Llegaron 500 cajas y el máximo por envío es 200",
      ayuda: "Parte la cola en tandas de 200 o menos.",
    };
    const r = await pedir("/cosecha/cajas", {
      method: "POST",
      body: JSON.stringify({ cajas: [unPesaje()] }),
    });
    expect(r.estado).toBe(413);
    expect(r.cuerpo.error.ayuda).toContain("Parte la cola");
  });

  it("un ciclo que no existe es 400 y dice dónde ver los que sí", async () => {
    // 400 y no 404, igual que en etiquetas: lo que el kiosco mandó se puede
    // corregir, así que reintentar TAL CUAL nunca va a funcionar
    estado.errorAlRecibir = {
      codigo: "ciclo_desconocido",
      mensaje: "No existe el ciclo 99",
      ayuda: "Consulta GET /api/campo/v1/ciclos",
    };
    const r = await pedir("/cosecha/cajas", {
      method: "POST",
      body: JSON.stringify({ cajas: [unPesaje({ ciclo: 99 })] }),
    });
    expect(r.estado).toBe(400);
    expect(r.cuerpo.error.codigo).toBe("ciclo_desconocido");
  });

  it("si la base no está, es 503: reintentar más tarde sí sirve", async () => {
    estado.errorAlRecibir = { codigo: "sin_base", mensaje: "La base de datos no está disponible" };
    const r = await pedir("/cosecha/cajas", {
      method: "POST",
      body: JSON.stringify({ cajas: [unPesaje()] }),
    });
    expect(r.estado).toBe(503);
  });
});

describe("las rutas fijas no se confunden con un código de caja", () => {
  it("conflictos es la lista de duplicados, no una caja llamada conflictos", async () => {
    const r = await pedir("/cosecha/conflictos?ciclo=3");
    expect(r.estado).toBe(200);
    expect(r.cuerpo.datos.cicloId).toBe(3);
    expect(r.cuerpo.datos.conflictos).toEqual([]);
  });

  it("el catálogo de tipos de caja contesta aunque esté vacío", async () => {
    const r = await pedir("/cosecha/tipos-de-caja");
    expect(r.estado).toBe(200);
    expect(r.cuerpo.datos.tipos).toEqual([]);
  });
});
