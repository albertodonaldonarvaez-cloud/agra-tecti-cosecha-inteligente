/**
 * Pruebas del catálogo y del esquema OpenAPI.
 *
 * El catálogo es lo primero que consulta un agente para saber qué puede pedir.
 * Si se desfasa de las rutas reales, el agente escribe scripts contra endpoints
 * que no existen —o peor, no se entera de los que sí— y el error aparece hasta
 * que alguien lo corre. Estas pruebas exigen que catálogo y rutas sean la misma
 * lista, y que cada endpoint venga documentado antes de poder montarse.
 */
import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { rutasCosecha } from "./cosecha";
import { rutasCampo } from "./campo";
import { rutasContexto } from "./contexto";
import { rutasMeta } from "./meta";
import type { DefinicionRuta } from "./index";

const TODAS: DefinicionRuta[] = [];
TODAS.push(...rutasMeta(() => TODAS), ...rutasCosecha, ...rutasCampo, ...rutasContexto);

/** Contexto mínimo: al catálogo y al OpenAPI solo les importa la lista de rutas */
function ctx(extra: Partial<Request> = {}) {
  return {
    req: { query: {}, protocol: "https", get: () => "agra-tecti.com", ...extra } as unknown as Request,
  } as any;
}

describe("rutas de la API", () => {
  it("monta algo en cada área que un agente necesita", () => {
    const rutas = TODAS.map((r) => r.ruta);
    for (const esperada of [
      "/catalogo",
      "/diccionario",
      "/openapi.json",
      "/contexto",
      "/cosecha/resumen",
      "/cosecha/diaria",
      "/cosecha/por-parcela",
      "/cortadoras",
      "/series",
      "/exportar/cajas",
      "/parcelas",
      "/ciclos",
      "/labores",
      "/notas",
      "/almacen/resumen",
      "/clima",
    ]) {
      expect(rutas, `falta ${esperada}`).toContain(esperada);
    }
  });

  it("no repite rutas", () => {
    const rutas = TODAS.map((r) => r.ruta);
    expect(new Set(rutas).size).toBe(rutas.length);
  });

  it("cada endpoint trae resumen y ejemplo", () => {
    for (const r of TODAS) {
      expect(r.resumen.length, `${r.ruta} sin resumen`).toBeGreaterThan(10);
      expect(r.ejemplo, `${r.ruta} sin ejemplo`).toBeTruthy();
      // El ejemplo tiene que apuntar a la ruta que documenta, o manda al agente
      // a copiar una URL equivocada
      const base = r.ruta.split(":")[0];
      expect(r.ejemplo, `${r.ruta} con ejemplo que no corresponde`).toContain(`/api/v1${base}`);
    }
  });

  it("todo parámetro documentado tiene descripción, y las opciones listan sus valores", () => {
    for (const r of TODAS) {
      for (const p of r.parametros ?? []) {
        expect(p.descripcion.length, `${r.ruta}?${p.nombre} sin descripción`).toBeGreaterThan(5);
        if (p.tipo === "opcion") {
          expect(p.valores?.length, `${r.ruta}?${p.nombre} sin valores válidos`).toBeGreaterThan(1);
        }
      }
    }
  });
});

describe("catálogo", () => {
  it("lista exactamente las rutas montadas", async () => {
    const def = TODAS.find((r) => r.ruta === "/catalogo")!;
    const catalogo: any = await def.manejador(ctx());

    expect(catalogo.totalEndpoints).toBe(TODAS.length);
    expect(catalogo.endpoints.map((e: any) => e.ruta).sort())
      .toEqual(TODAS.map((r) => `/api/v1${r.ruta}`).sort());
    expect(catalogo.soloLectura).toBe(true);
  });

  it("avisa cuáles cuestan dinero", async () => {
    const def = TODAS.find((r) => r.ruta === "/catalogo")!;
    const catalogo: any = await def.manejador(ctx());

    const reporte = catalogo.endpoints.find((e: any) => e.ruta === "/api/v1/labores/reporte");
    // Ese endpoint solo gasta si se pide la redacción, y el catálogo lo dice así
    expect(reporte.cuestaIa).toBe("solo si se pide ia=true");

    const resumen = catalogo.endpoints.find((e: any) => e.ruta === "/api/v1/cosecha/resumen");
    expect(resumen.cuestaIa).toBe(false);
  });

  it("manda al agente al diccionario antes de interpretar cifras", async () => {
    const def = TODAS.find((r) => r.ruta === "/catalogo")!;
    const catalogo: any = await def.manejador(ctx());
    expect(catalogo.siguientePaso).toContain("/api/v1/diccionario");
  });
});

describe("diccionario", () => {
  it("declara lo que no se puede deducir del JSON", async () => {
    const def = TODAS.find((r) => r.ruta === "/diccionario")!;
    const d: any = await def.manejador(ctx());

    // Las dos trampas que hacen que un reporte mienta con seguridad
    expect(d.unidades.advertencia).toMatch(/GRAMOS/);
    expect(d.cortadoras.codigos["98"]).toMatch(/SEGUNDA/);
    expect(d.cortadoras.codigos["99"]).toMatch(/DESPERDICIO/);
    expect(d.zonaHoraria.valor).toBe("America/Mexico_City");
    // Y la que descubrimos armando el reporte de actividades
    expect(d.labores.responsable).toMatch(/cuadrilla/);
  });
});

describe("esquema OpenAPI", () => {
  it("traduce los parámetros de ruta al formato de OpenAPI", async () => {
    const def = TODAS.find((r) => r.ruta === "/openapi.json")!;
    const esquema: any = await def.manejador(ctx());

    // Express usa :id; OpenAPI usa {id}
    expect(esquema.paths["/parcelas/{id}"]).toBeDefined();
    expect(esquema.paths["/parcelas/:id"]).toBeUndefined();

    const enRuta = esquema.paths["/parcelas/{id}"].get.parameters.find((p: any) => p.in === "path");
    expect(enRuta.name).toBe("id");
    expect(enRuta.required).toBe(true);
  });

  it("describe la autenticación por llave", async () => {
    const def = TODAS.find((r) => r.ruta === "/openapi.json")!;
    const esquema: any = await def.manejador(ctx());

    expect(esquema.openapi).toBe("3.1.0");
    expect(esquema.components.securitySchemes.LlaveDeApi.name).toBe("X-API-Key");
    expect(esquema.servers[0].url).toBe("https://agra-tecti.com/api/v1");
  });

  it("documenta los tres rechazos que un script tiene que saber manejar", async () => {
    const def = TODAS.find((r) => r.ruta === "/openapi.json")!;
    const esquema: any = await def.manejador(ctx());
    const respuestas = esquema.paths["/cosecha/resumen"].get.responses;

    expect(respuestas["401"]).toBeDefined(); // llave mala
    expect(respuestas["403"]).toBeDefined(); // sin alcance
    expect(respuestas["429"]).toBeDefined(); // se pasó de cuota
  });

  it("marca la exportación como NDJSON y no como JSON", async () => {
    const def = TODAS.find((r) => r.ruta === "/openapi.json")!;
    const esquema: any = await def.manejador(ctx());
    const contenido = esquema.paths["/exportar/cajas"].get.responses["200"].content;
    expect(Object.keys(contenido)).toEqual(["application/x-ndjson"]);
  });
});
