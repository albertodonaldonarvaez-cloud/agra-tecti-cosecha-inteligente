/**
 * Pruebas de la telemetría satelital guardada en el servidor.
 *
 * Lo que se comprueba es lo que motivó el cambio:
 *  1. Abrir Análisis de Parcela lee de la base y NO llama a Copernicus.
 *  2. La revisión diaria no descarga nada si la pasada más reciente es la que
 *     ya estaba guardada (que es donde se ahorran las llamadas a la API).
 *  3. Los datos quedan partidos por ciclo y alineados por día del ciclo, para
 *     poder comparar un ciclo contra otro en el mismo momento del cultivo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Base de datos falsa: responde según lo que pida la consulta ──
let respuestas: { match: string; rows: any[] }[] = [];
let ejecutadas: string[] = [];
let selects: any[][] = [];

/** Texto estático de una consulta sql`...` (sin los parámetros) */
function textoSql(q: any): string {
  const chunks = q?.queryChunks ?? [];
  return chunks
    .map((c: any) => (Array.isArray(c?.value) ? c.value.join(" ") : ""))
    .join(" ");
}

const baseFalsa = {
  execute: async (q: any) => {
    const txt = textoSql(q);
    ejecutadas.push(txt.replace(/\s+/g, " ").trim());
    const r = respuestas.find((x) => txt.includes(x.match));
    return [r ? r.rows : [], []];
  },
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
};

vi.mock("./db", async () => {
  const real = await vi.importActual<any>("./db");
  return { ...real, getDb: async () => baseFalsa };
});

// ── Copernicus falso: cuenta cuántas veces se le llama ──
const llamadas = { passes: 0, history: 0, map: 0, vigor: 0 };
vi.mock("./copernicusService", () => ({
  listClearPasses: async () => {
    llamadas.passes++;
    return [{ date: "2026-08-09", clearPct: 96 }];
  },
  getIndexHistory: async () => {
    llamadas.history++;
    return [{ date: "2026-08-09", mean: 0.5, min: 0.2, max: 0.8, stDev: 0.1, noDataPct: 0 }];
  },
  getIndexMapImage: async () => {
    llamadas.map++;
    return Buffer.from("imagen");
  },
  getParcelVigor: async () => {
    llamadas.vigor++;
    return {
      meanNdvi: 0.5, minNdvi: 0.2, maxNdvi: 0.8,
      distribution: { suelo: 5, bajo: 10, medio: 40, alto: 45 },
      zones: [{ name: "centro", meanNdvi: 0.5, areaPct: 11 }],
      driest: { name: "sur", meanNdvi: 0.3 },
    };
  },
}));

const { getStoredTelemetry, getCycleTelemetry, buildCycleComparisonText } = await import("./parcelTelemetry");
const { syncOneParcel } = await import("./satelliteAutoSync");

beforeEach(() => {
  respuestas = [];
  ejecutadas = [];
  selects = [];
  llamadas.passes = 0;
  llamadas.history = 0;
  llamadas.map = 0;
  llamadas.vigor = 0;
});

describe("getStoredTelemetry", () => {
  it("arma mapa, serie y zonas de los tres índices sin tocar el satélite", async () => {
    respuestas = [{
      match: "FROM parcelSatelliteCache",
      rows: [
        { dataType: "map", indexType: "NDVI", mapDate: "latest", captureDate: "2026-08-09", clearPct: 96, cycleId: 3, cycleName: "Ciclo 2026-2027", fetchedAt: new Date(), data: "data:image/png;base64,AAA" },
        { dataType: "map", indexType: "NDRE", mapDate: "latest", captureDate: "2026-08-09", clearPct: 96, cycleId: 3, cycleName: "Ciclo 2026-2027", fetchedAt: new Date(), data: "data:image/png;base64,BBB" },
        { dataType: "stats", indexType: "NDVI", mapDate: null, fromDate: "2025-01-01", toDate: "2026-08-12", fetchedAt: new Date(), data: JSON.stringify([{ date: "2026-08-09", mean: 0.51, min: 0.2, max: 0.8 }]) },
        { dataType: "zones", indexType: "NDVI", mapDate: "latest", captureDate: "2026-08-09", cycleId: 3, fetchedAt: new Date(), data: JSON.stringify({ meanNdvi: 0.51 }) },
      ],
    }];

    const t = await getStoredTelemetry(12);

    expect(t.hasData).toBe(true);
    expect(t.indices).toHaveLength(3);
    const ndvi = t.indices.find((i) => i.indexType === "NDVI")!;
    expect(ndvi.image).toBe("data:image/png;base64,AAA");
    expect(ndvi.captureDate).toBe("2026-08-09");
    expect(ndvi.cycleName).toBe("Ciclo 2026-2027");
    expect(ndvi.series).toHaveLength(1);
    expect(t.vigor?.data.meanNdvi).toBe(0.51);
    // El índice sin datos guardados viene vacío, no rompe
    expect(t.indices.find((i) => i.indexType === "NDMI")!.image).toBeNull();
    // Y lo importante: NI UNA llamada al satélite
    expect(llamadas).toEqual({ passes: 0, history: 0, map: 0, vigor: 0 });
    // Una sola consulta a la base, no seis
    expect(ejecutadas).toHaveLength(1);
  });

  it("responde vacío (sin reventar) cuando la parcela no tiene nada guardado", async () => {
    const t = await getStoredTelemetry(99);
    expect(t.hasData).toBe(false);
    expect(t.indices).toHaveLength(3);
    expect(llamadas.map).toBe(0);
  });
});

describe("syncOneParcel", () => {
  const parcela = { id: 5, name: "El Higueral", code: "P05", polygon: JSON.stringify({ type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] }) };

  it("NO descarga nada cuando la pasada más reciente ya estaba guardada", async () => {
    selects = [[parcela]];
    respuestas = [
      // El cache de pasadas está vencido, así que sí se consulta la lista...
      { match: "dataType = 'passes'", rows: [] },
      // ...y resulta que la pasada del 9 de agosto ya está completa en la base
      { match: "MAX(CASE WHEN dataType = 'map'", rows: [{ captureDate: "2026-08-09", mapas: 3, series: 3 }] },
    ];

    const r = await syncOneParcel(5);

    expect(r.status).toBe("sin-cambios");
    expect(r.captureDate).toBe("2026-08-09");
    // Se preguntó si había algo nuevo (barato)...
    expect(llamadas.passes).toBe(1);
    // ...pero no se descargó NADA (que es lo caro)
    expect(llamadas.history).toBe(0);
    expect(llamadas.map).toBe(0);
    expect(llamadas.vigor).toBe(0);
  });

  it("descarga todo cuando aparece una pasada nueva", async () => {
    selects = [[parcela], []]; // parcela + primera caja de cosecha (sin cosecha)
    respuestas = [
      { match: "dataType = 'passes'", rows: [] },
      // Lo guardado es de una pasada anterior
      { match: "MAX(CASE WHEN dataType = 'map'", rows: [{ captureDate: "2026-07-30", mapas: 3, series: 3 }] },
      { match: "FROM productionCycles", rows: [] },
    ];

    const r = await syncOneParcel(5);

    expect(r.status).toBe("actualizada");
    expect(r.captureDate).toBe("2026-08-09");
    expect(llamadas.vigor).toBe(1);
    expect(llamadas.history).toBe(3); // NDVI, NDRE, NDMI
    expect(llamadas.map).toBe(3);
    // Se guardó el historial de la captura, no solo la foto más reciente
    expect(ejecutadas.some((q) => q.includes("INSERT INTO parcelSatelliteHistory"))).toBe(true);
  });

  it("descarga aunque la pasada sea la misma si se pide a mano (force)", async () => {
    selects = [[parcela], []];
    respuestas = [
      { match: "dataType = 'passes'", rows: [] },
      { match: "MAX(CASE WHEN dataType = 'map'", rows: [{ captureDate: "2026-08-09", mapas: 3, series: 3 }] },
      { match: "FROM productionCycles", rows: [] },
    ];

    const r = await syncOneParcel(5, { force: true });

    expect(r.status).toBe("actualizada");
    expect(llamadas.map).toBe(3);
  });

  it("descarga si falta algo, aunque la fecha coincida (primera vez a medias)", async () => {
    selects = [[parcela], []];
    respuestas = [
      { match: "dataType = 'passes'", rows: [] },
      // Misma fecha, pero solo hay un mapa y ninguna serie
      { match: "MAX(CASE WHEN dataType = 'map'", rows: [{ captureDate: "2026-08-09", mapas: 1, series: 0 }] },
      { match: "FROM productionCycles", rows: [] },
    ];

    const r = await syncOneParcel(5);

    expect(r.status).toBe("actualizada");
    expect(llamadas.history).toBe(3);
  });
});

describe("getCycleTelemetry", () => {
  const serieNdvi = JSON.stringify([
    // Ciclo viejo (arrancó 2024-11-01)
    { date: "2024-12-01", mean: 0.30, min: 0.1, max: 0.5 },
    { date: "2025-03-01", mean: 0.55, min: 0.3, max: 0.7 },
    // Ciclo nuevo (arrancó 2025-11-01)
    { date: "2025-12-01", mean: 0.35, min: 0.1, max: 0.6 },
    { date: "2026-03-01", mean: 0.62, min: 0.4, max: 0.8 },
  ]);

  function prepara() {
    selects = [];
    respuestas = [
      { match: "SELECT code FROM parcels", rows: [{ code: "P05" }] },
      {
        match: "FROM productionCycles", rows: [
          { id: 1, name: "Ciclo 2024-2025", startDate: "2024-11-01", endDate: "2025-09-30", harvestStartDate: null },
          { id: 2, name: "Ciclo 2025-2026", startDate: "2025-11-01", endDate: null, harvestStartDate: null },
        ],
      },
      { match: "dataType = 'stats'", rows: [{ indexType: "NDVI", data: serieNdvi }] },
      { match: "FROM boxes", rows: [{ cajas: 120, kg: 4800, dias: 20, primera: "2025-06-01", ultima: "2025-07-15" }] },
      { match: "FROM fieldActivities", rows: [{ total: 7 }] },
    ];
  }

  it("reparte las capturas por ciclo y las alinea por día del ciclo", async () => {
    prepara();
    const c = await getCycleTelemetry(5);

    expect(c.ciclos).toHaveLength(2);
    // El ciclo en curso va primero
    expect(c.ciclos[0].cycleName).toBe("Ciclo 2025-2026");
    expect(c.ciclos[0].enCurso).toBe(true);
    expect(c.ciclos[1].enCurso).toBe(false);

    // Cada ciclo se quedó con SUS dos capturas
    expect(c.ciclos[0].serie.map((p) => p.date)).toEqual(["2025-12-01", "2026-03-01"]);
    expect(c.ciclos[1].serie.map((p) => p.date)).toEqual(["2024-12-01", "2025-03-01"]);

    // Alineadas por día del ciclo: el 1 de diciembre es el día 30 en ambos
    expect(c.ciclos[0].serie[0].dia).toBe(30);
    expect(c.ciclos[1].serie[0].dia).toBe(30);

    // Resumen del índice
    expect(c.ciclos[0].ndvi.maximo).toBe(0.62);
    expect(c.ciclos[1].ndvi.maximo).toBe(0.55);
    expect(c.ciclos[0].ndvi.promedio).toBeCloseTo(0.485, 3);

    // Cosecha y labores por ciclo
    expect(c.ciclos[0].cosecha.cajas).toBe(120);
    expect(c.ciclos[0].labores).toBe(7);

    // Y sin pedirle nada al satélite
    expect(llamadas).toEqual({ passes: 0, history: 0, map: 0, vigor: 0 });
  });

  it("arma el texto comparativo cortando el ciclo anterior en el mismo día de avance", async () => {
    prepara();
    const texto = await buildCycleComparisonText(5);

    expect(texto).toBeTruthy();
    expect(texto).toContain("Ciclo 2025-2026");
    expect(texto).toContain("Ciclo 2024-2025");
    expect(texto).toContain("AL MISMO DÍA DE AVANCE");
    // El ciclo anterior aparece con su cosecha final, que es con lo que hay
    // que relacionar el vigor
    expect(texto).toContain("Cosecha final");
  });

  it("no inventa comparación cuando solo hay un ciclo con datos", async () => {
    respuestas = [
      { match: "SELECT code FROM parcels", rows: [{ code: "P05" }] },
      { match: "FROM productionCycles", rows: [{ id: 2, name: "Ciclo 2025-2026", startDate: "2025-11-01", endDate: null, harvestStartDate: null }] },
      { match: "dataType = 'stats'", rows: [{ indexType: "NDVI", data: serieNdvi }] },
      { match: "FROM boxes", rows: [{ cajas: 0, kg: 0, dias: 0, primera: null, ultima: null }] },
      { match: "FROM fieldActivities", rows: [{ total: 0 }] },
    ];
    expect(await buildCycleComparisonText(5)).toBeNull();
  });
});
