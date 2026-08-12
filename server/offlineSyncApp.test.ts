/**
 * Pruebas de las piezas nuevas del sync con la app de campo:
 *  - offlineSync.syncProducts (alta, edición y producto borrado en la web)
 *  - offlineSync.syncAppLogs (bitácora del teléfono)
 *
 * No se usa una base real: se sustituye la conexión por una que ANOTA lo que
 * el router intentó hacer. Lo que interesa comprobar es justo eso — qué
 * columnas se tocan y cuáles NO —, porque el riesgo real es que una edición
 * desde el teléfono borre stock, costos o proveedor capturados en la oficina.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTableName } from "drizzle-orm";

/** Operaciones que el router ejecutó contra la "base" */
type Op =
  | { tipo: "insert"; tabla: string; values: any; onDuplicate?: any }
  | { tipo: "update"; tabla: string; set: any };

let ops: Op[] = [];
/** Filas que devuelve cada SELECT, por nombre de tabla y en orden de llamada */
let selects: Record<string, any[][]> = {};

function tomarSelect(tabla: string): any[] {
  const cola = selects[tabla];
  if (!cola || cola.length === 0) return [];
  return cola.shift() as any[];
}

/** Cadena de consulta que se puede encadenar y esperar (como la de drizzle) */
function consulta(tabla: { nombre: string }) {
  const chain: any = {
    from(t: any) {
      tabla.nombre = getTableName(t);
      return chain;
    },
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    then(resolve: any, reject: any) {
      return Promise.resolve(tomarSelect(tabla.nombre)).then(resolve, reject);
    },
  };
  return chain;
}

const baseFalsa = {
  select: () => consulta({ nombre: "" }),
  insert: (t: any) => ({
    values: (values: any) => {
      const op: Op = { tipo: "insert", tabla: getTableName(t), values };
      ops.push(op);
      return {
        onDuplicateKeyUpdate: async (x: any) => {
          (op as any).onDuplicate = x;
        },
      };
    },
  }),
  update: (t: any) => ({
    set: (set: any) => ({
      where: async () => {
        ops.push({ tipo: "update", tabla: getTableName(t), set });
      },
    }),
  }),
};

vi.mock("./db", async () => {
  const real = await vi.importActual<any>("./db");
  return { ...real, getDb: async () => baseFalsa };
});

// El alta de notas avisa por Telegram; aquí no interesa
vi.mock("./telegramFieldNotesBot", () => ({
  notifyGroupNewNoteFromWeb: async () => {},
}));

const { appRouter } = await import("./routers");

const ctx = {
  user: { id: 7, name: "Encargado", role: "user" },
  req: { headers: {}, ip: "10.0.0.9" },
  res: {},
} as any;

beforeEach(() => {
  ops = [];
  selects = {};
});

describe("offlineSync.syncProducts", () => {
  it("da de alta un producto capturado en el campo", async () => {
    // No existe todavía: el SELECT por clientUuid viene vacío, y el de después
    // del insert ya trae el id asignado
    selects.warehouseProducts = [[], [{ id: 31 }]];

    const caller = appRouter.createCaller(ctx);
    const r = await caller.offlineSync.syncProducts({
      products: [{
        clientUuid: "11111111-1111-4111-8111-111111111111",
        name: "Sulfato de cobre",
        brand: "Agroquímicos del Bajío",
        category: "fungicida",
        unit: "kg",
      }],
    });

    expect(r.results[0].status).toBe("created");
    expect(r.results[0].serverId).toBe(31);
    const insert = ops.find((o) => o.tipo === "insert") as any;
    expect(insert.values.clientUuid).toBe("11111111-1111-4111-8111-111111111111");
    expect(insert.values.name).toBe("Sulfato de cobre");
    expect(insert.values.category).toBe("fungicida");
    // description es NOT NULL en el esquema: nunca puede quedar vacía
    expect(insert.values.description).toBeTruthy();
  });

  it("edita un producto creado en la web SIN tocar stock, costo ni proveedor", async () => {
    selects.warehouseProducts = [[{ id: 88 }]];

    const caller = appRouter.createCaller(ctx);
    const r = await caller.offlineSync.syncProducts({
      products: [{
        clientUuid: "22222222-2222-4222-8222-222222222222",
        serverId: 88,
        name: "Urea 46",
        category: "fertilizante_granular",
        unit: "bulto",
        storageLocation: "Bodega 2, anaquel A",
      }],
    });

    expect(r.results[0].status).toBe("updated");
    expect(r.results[0].serverId).toBe(88);
    const update = ops.find((o) => o.tipo === "update") as any;
    expect(update.set.name).toBe("Urea 46");
    expect(update.set.unit).toBe("bulto");
    expect(update.set.storageLocation).toBe("Bodega 2, anaquel A");
    // Lo que se captura en la oficina NO viaja en el SET
    for (const campo of [
      "currentStock", "minimumStock", "costPerUnit", "supplierId",
      "supplier", "lotNumber", "expirationDate", "clientUuid",
    ]) {
      expect(update.set).not.toHaveProperty(campo);
    }
    // Tampoco los campos que el teléfono no mandó
    expect(update.set).not.toHaveProperty("brand");
    expect(update.set).not.toHaveProperty("activeIngredient");
    expect(update.set).not.toHaveProperty("description");
    // Y nunca se inserta un duplicado
    expect(ops.some((o) => o.tipo === "insert")).toBe(false);
  });

  it("vacía un campo cuando el teléfono lo manda en blanco", async () => {
    selects.warehouseProducts = [[{ id: 90 }]];
    const caller = appRouter.createCaller(ctx);
    await caller.offlineSync.syncProducts({
      products: [{
        clientUuid: "33333333-3333-4333-8333-333333333333",
        serverId: 90,
        name: "Agua",
        brand: "",
        concentration: "  ",
      }],
    });
    const update = ops.find((o) => o.tipo === "update") as any;
    expect(update.set.brand).toBeNull();
    expect(update.set.concentration).toBeNull();
  });

  it("avisa (sin recrearlo) cuando el producto ya se borró en la web", async () => {
    selects.warehouseProducts = [[]]; // el SELECT por serverId no encuentra nada

    const caller = appRouter.createCaller(ctx);
    const r = await caller.offlineSync.syncProducts({
      products: [{
        clientUuid: "44444444-4444-4444-8444-444444444444",
        serverId: 404,
        name: "Producto fantasma",
      }],
    });

    expect(r.results[0].status).toBe("deleted");
    expect(ops).toHaveLength(0);
  });
});

describe("offlineSync.syncAppLogs", () => {
  it("guarda los eventos del teléfono marcados como 'app' y con su hora real", async () => {
    const caller = appRouter.createCaller(ctx);
    const r = await caller.offlineSync.syncAppLogs({
      device: "Motorola moto g54 · Android 14",
      appVersion: "1.8.0",
      logs: [
        {
          clientLogId: "log-1",
          action: "login",
          screen: "Inicio de sesión",
          detail: "Entró Juan",
          occurredAt: "2026-08-10T13:45:00Z",
        },
        {
          clientLogId: "log-2",
          action: "photo_capture",
          screen: "Notas de campo",
          detail: "Foto comprimida · 1920×1440 · 6800 KB → 440 KB (93% menos)",
          originalBytes: 6_963_200,
          finalBytes: 450_560,
          occurredAt: "2026-08-10T13:47:10Z",
        },
      ],
    });

    expect(r.storedCount).toBe(2);
    expect(r.storedIds).toEqual(["log-1", "log-2"]);
    expect(ops).toHaveLength(2);

    const primero = ops[0] as any;
    expect(primero.tabla).toBe("userActivityLogs");
    expect(primero.values.source).toBe("app");
    expect(primero.values.userId).toBe(7);
    expect(primero.values.device).toBe("Motorola moto g54 · Android 14");
    expect(primero.values.appVersion).toBe("1.8.0");
    // La hora del teléfono es la buena: el evento pudo subirse días después
    expect(primero.values.occurredAt).toEqual(new Date("2026-08-10T13:45:00Z"));
    // Reintentar el lote no puede duplicar
    expect(primero.onDuplicate).toBeTruthy();

    const foto = ops[1] as any;
    expect(foto.values.action).toBe("photo_capture");
    expect(foto.values.originalBytes).toBe(6_963_200);
    expect(foto.values.finalBytes).toBe(450_560);
  });

  it("acepta el evento aunque el reloj del teléfono venga corrido", async () => {
    const caller = appRouter.createCaller(ctx);
    const r = await caller.offlineSync.syncAppLogs({
      logs: [{ clientLogId: "log-3", action: "app_open", occurredAt: "no-es-una-fecha" }],
    });
    expect(r.storedCount).toBe(1);
    expect((ops[0] as any).values.occurredAt).toBeNull();
  });

  it("rechaza una acción que no existe en el catálogo", async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.offlineSync.syncAppLogs({
        logs: [{ clientLogId: "log-4", action: "borrar_todo" as any, occurredAt: "2026-08-10T13:45:00Z" }],
      })
    ).rejects.toThrow();
    expect(ops).toHaveLength(0);
  });
});
