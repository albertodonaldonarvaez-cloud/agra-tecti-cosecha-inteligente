/**
 * Pruebas del archivo local de fotos de KoboToolbox.
 *
 * Lo que se comprueba es justo lo que motivó el cambio:
 *  1. Una foto que ya está en el servidor no se vuelve a pedir a Kobo.
 *  2. Al descargarla queda el archivo en disco, la caja apuntando a él y las
 *     cuatro variantes de la URL resolviendo al mismo archivo.
 *  3. Si Kobo falla con una foto, la ronda sigue con las demás y esa caja
 *     queda marcada con el error en vez de tumbar la sincronización.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";

// ── Disco falso ──────────────────────────────────────────────
const disco = new Map<string, Buffer>();

vi.mock("fs/promises", () => {
  const api = {
    mkdir: async () => undefined,
    writeFile: async (ruta: string, datos: Buffer) => {
      disco.set(ruta, datos);
    },
    rename: async (origen: string, destino: string) => {
      const datos = disco.get(origen);
      disco.delete(origen);
      if (datos) disco.set(destino, datos);
    },
    stat: async (ruta: string) => {
      const datos = disco.get(ruta);
      if (!datos) throw new Error("ENOENT");
      return { isFile: () => true, size: datos.length };
    },
  };
  return { ...api, default: api };
});

// ── Base de datos falsa ──────────────────────────────────────
let selects: any[][] = [];
const inserts: any[] = [];
const updates: any[] = [];

const baseFalsa = {
  select: () => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (res: any, rej: any) => Promise.resolve(selects.shift() ?? []).then(res, rej),
    };
    return chain;
  },
  insert: () => ({
    values: (v: any) => ({
      onDuplicateKeyUpdate: async () => {
        inserts.push(v);
      },
    }),
  }),
  update: () => ({
    set: (v: any) => ({
      where: async () => {
        updates.push(v);
      },
    }),
  }),
};

vi.mock("./db", () => ({
  getDb: async () => baseFalsa,
  getApiConfig: async () => ({
    apiUrl: "https://kf.ejemplo.com",
    apiToken: "token-de-prueba",
    assetId: "abc",
  }),
}));

// ── Kobo falso ───────────────────────────────────────────────
let peticiones: string[] = [];
let fallaKoboEn: string[] = [];

function montarFetch() {
  globalThis.fetch = (async (url: any) => {
    const dir = String(url);
    peticiones.push(dir);
    if (fallaKoboEn.some((f) => dir.includes(f))) {
      return { ok: false, status: 404, statusText: "Not Found", headers: new Headers() } as any;
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "image/jpeg", "content-length": "5" }),
      arrayBuffer: async () => new TextEncoder().encode("foto!").buffer,
    } as any;
  }) as any;
}

process.env.PHOTOS_DIR = "/fotos-de-prueba";

const cargar = () => import("./koboPhotoStore");

function caja(id: number, code: string) {
  return {
    id,
    boxCode: code,
    photoUrl: `https://kf.ejemplo.com/media/${code}.jpg`,
    photoLargeUrl: `https://kf.ejemplo.com/media/${code}.jpg?large`,
    photoMediumUrl: `https://kf.ejemplo.com/media/${code}.jpg?medium`,
    photoSmallUrl: `https://kf.ejemplo.com/media/${code}.jpg?small`,
    submissionTime: new Date("2026-08-15T14:00:00Z"),
  };
}

beforeEach(() => {
  disco.clear();
  selects = [];
  inserts.length = 0;
  updates.length = 0;
  peticiones = [];
  fallaKoboEn = [];
  montarFetch();
});

describe("archivo local de fotos de Kobo", () => {
  it("guarda la foto en el servidor y deja la caja apuntando a la copia", async () => {
    const { runPhotoBackfill } = await cargar();

    selects = [
      [caja(1, "10-000001")], // cajas pendientes
      [], // koboPhotos: todavía no hay copia
      [{ n: 0 }], // pendientes tras la ronda
    ];

    const log = await runPhotoBackfill({ trigger: "prueba" });

    expect(log.downloaded).toBe(1);
    expect(log.failed).toBe(0);

    // El archivo quedó escrito dentro de la carpeta de fotos de Kobo
    const rutas = [...disco.keys()];
    expect(rutas).toHaveLength(1);
    expect(rutas[0]).toContain("kobo");
    expect(rutas[0]).toContain("10-000001");

    // La caja quedó marcada con la ruta pública y sin error
    const marcada = updates.find((u) => u.photoLocalPath);
    expect(marcada.photoLocalPath.startsWith("/app/photos/kobo/")).toBe(true);
    expect(marcada.photoDownloadError).toBeNull();

    // Las cuatro variantes de la URL resuelven al mismo archivo
    expect(inserts).toHaveLength(4);
    const destinos = new Set(inserts.map((i) => i.localPath));
    expect(destinos.size).toBe(1);
    expect(new Set(inserts.map((i) => i.variant))).toEqual(
      new Set(["original", "large", "medium", "small"])
    );

    // Solo se bajó una imagen, no cuatro
    expect(peticiones).toHaveLength(1);
  });

  it("no vuelve a pedirle a Kobo una foto que ya está en el servidor", async () => {
    const { findLocalCopy, ensureLocalCopy } = await cargar();

    // La clave del disco falso se arma igual que en el codigo (path.join)
    disco.set(
      path.join("/fotos-de-prueba", "kobo/2026-08/10-000002_abc.jpg"),
      Buffer.from("foto!")
    );
    selects = [
      [{ localPath: "/app/photos/kobo/2026-08/10-000002_abc.jpg", contentType: "image/jpeg" }],
      [{ localPath: "/app/photos/kobo/2026-08/10-000002_abc.jpg", contentType: "image/jpeg" }],
    ];

    const encontrada = await findLocalCopy("https://kf.ejemplo.com/media/10-000002.jpg");
    expect(encontrada?.localPath).toContain("10-000002");

    await ensureLocalCopy("https://kf.ejemplo.com/media/10-000002.jpg", "token-de-prueba");
    expect(peticiones).toHaveLength(0);
  });

  it("un fallo de Kobo no detiene la ronda: marca la caja y sigue con la siguiente", async () => {
    const { runPhotoBackfill } = await cargar();

    fallaKoboEn = ["10-000003"];
    selects = [
      [caja(3, "10-000003"), caja(4, "10-000004")], // dos pendientes
      [], // sin copia de la primera
      [], // sin copia de la segunda
      [{ n: 1 }], // queda una pendiente
    ];

    const log = await runPhotoBackfill({ trigger: "prueba", concurrency: 1 });

    expect(log.downloaded).toBe(1);
    expect(log.failed).toBe(1);

    // La que falló quedó con el error anotado, no con ruta local
    const conError = updates.find((u) => u.photoDownloadError);
    expect(conError.photoDownloadError).toContain("404");

    // La otra sí se guardó
    expect([...disco.keys()].some((r) => r.includes("10-000004"))).toBe(true);
  });
});
