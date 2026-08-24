/**
 * Pruebas del clima aplicado a la planeación de labores.
 *
 * Lo que se comprueba:
 *  1. El criterio agronómico: cuándo un día sirve (o no) para asperjar, regar,
 *     podar, fertilizar o cortar fruta.
 *  2. Que la pantalla sepa cuándo estamos en temporada de cosecha, incluso si
 *     nadie capturó la fecha de inicio en la ficha del ciclo.
 *  3. Que cada labor quede pegada al clima de SU día: el que hubo si ya pasó,
 *     el pronosticado si está por venir.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluarLabor, evaluarCosecha, metodoDeLabor, type ClimaDia } from "./weatherPlanner";

function clima(p: Partial<ClimaDia> = {}): ClimaDia {
  return {
    date: "2026-08-20",
    temperatureMax: 28, temperatureMin: 16, temperatureMean: 22,
    precipitation: 0, precipitationProbability: 0,
    windSpeed: 6, cloudCover: 20,
    condition: "sunny", conditionText: "Despejado",
    esPronostico: true,
    ...p,
  };
}

/** Día de chubascos como el que destapó el falso positivo del machete */
const chubascos = () => clima({ precipitation: 9.5, precipitationProbability: 70, windSpeed: 8, condition: "rainy", conditionText: "Chubascos" });

describe("de qué depende cada labor: el MÉTODO, no el tipo", () => {
  it("saca el método del subtipo capturado en la libreta", () => {
    expect(metodoDeLabor("control_maleza", "Mecánico (machete)")).toBe("mecanico");
    expect(metodoDeLabor("control_maleza", "Herbicida selectivo")).toBe("aspersion");
    expect(metodoDeLabor("fertilizacion", "Foliar")).toBe("aspersion");
    expect(metodoDeLabor("fertilizacion", "Granular al suelo")).toBe("suelo");
    expect(metodoDeLabor("control_plagas", "Trampas")).toBe("mecanico");
    expect(metodoDeLabor("control_plagas", "Monitoreo")).toBe("observacion");
  });

  it("sin subtipo usa el método más común de ese tipo de labor", () => {
    expect(metodoDeLabor("control_maleza", null)).toBe("aspersion");
    expect(metodoDeLabor("fertilizacion", "")).toBe("suelo");
    expect(metodoDeLabor("poda", null)).toBeNull();
  });

  it("la lluvia NO arruina un control de maleza con machete", () => {
    const v = evaluarLabor("control_maleza", "Mecánico (machete)", chubascos(), 0);
    expect(v.nivel).toBe("bueno");
    expect(v.motivos.join(" ")).not.toContain("se lava");
  });

  it("pero el mismo día SÍ arruina el control de maleza con herbicida", () => {
    const v = evaluarLabor("control_maleza", "Herbicida postemergente", chubascos(), 0);
    expect(v.nivel).toBe("malo");
    expect(v.motivos.join(" ")).toContain("se lava");
  });

  it("con el terreno hecho un lodazal el trabajo mecánico sí se complica", () => {
    const v = evaluarLabor("control_maleza", "Mecánico (desbrozadora)", clima({ precipitation: 26, condition: "rainy" }), 0);
    expect(v.nivel).toBe("malo");
    expect(v.motivos.join(" ")).toContain("intransitable");
  });

  it("el viento no le hace nada a una labor manual", () => {
    const v = evaluarLabor("control_maleza", "Manual", clima({ windSpeed: 28 }), 0);
    expect(v.nivel).toBe("bueno");
  });

  it("una fertilización FOLIAR se juzga como aspersión, no como granulado", () => {
    const v = evaluarLabor("fertilizacion", "Foliar", clima({ windSpeed: 24 }), 0);
    expect(v.nivel).toBe("malo");
    expect(v.motivos.join(" ")).toContain("se va a otro lado");
  });

  it("una fertilización granular con lluvia moderada queda bien y lo explica", () => {
    const v = evaluarLabor("fertilizacion", "Granular al suelo", chubascos(), 0);
    expect(v.nivel).toBe("bueno");
    expect(v.motivos.join(" ")).toContain("incorporar");
  });
});

describe("criterio agronómico", () => {
  it("un día tranquilo sirve para asperjar", () => {
    const v = evaluarLabor("aplicacion_fitosanitaria", "Preventiva", clima(), 0);
    expect(v.nivel).toBe("bueno");
  });

  it("con viento fuerte la aspersión no sirve", () => {
    const v = evaluarLabor("aplicacion_fitosanitaria", null, clima({ windSpeed: 24 }), 0);
    expect(v.nivel).toBe("malo");
    expect(v.motivos.join(" ")).toContain("se va a otro lado");
  });

  it("si llueve fuerte AL DÍA SIGUIENTE, la aplicación se lava", () => {
    const v = evaluarLabor("control_plagas", "Insecticida", clima(), 12);
    expect(v.nivel).toBe("malo");
    expect(v.motivos.join(" ")).toContain("día siguiente");
  });

  it("el riego se desperdicia si viene lluvia", () => {
    const v = evaluarLabor("riego", "Goteo", clima({ precipitationProbability: 80 }), 18);
    expect(v.nivel).toBe("malo");
  });

  it("podar con humedad es mal día, sea cual sea el tipo de poda", () => {
    const v = evaluarLabor("poda", "Formación", clima({ precipitation: 4, condition: "rainy" }), 0);
    expect(v.nivel).toBe("malo");
    expect(v.motivos.join(" ")).toContain("enfermedades");
  });

  it("fertilizar al suelo sin nada de agua se marca como incompleto", () => {
    const v = evaluarLabor("fertilizacion", "Granular al suelo", clima(), 0);
    expect(v.nivel).toBe("cuidado");
    expect(v.motivos.join(" ")).toContain("superficie");
  });

  it("el calor extremo es malo para cualquier labor", () => {
    const v = evaluarLabor("riego", null, clima({ temperatureMax: 39 }), 0);
    expect(v.nivel).toBe("malo");
    expect(v.motivos.join(" ")).toContain("Calor extremo");
  });

  it("cortar fruta con lluvia fuerte es mal día", () => {
    const v = evaluarCosecha(clima({ precipitation: 15, condition: "rainy" }));
    expect(v.nivel).toBe("malo");
    expect(v.motivos.join(" ")).toContain("se abre");
  });

  it("cortar con buen tiempo no genera advertencias", () => {
    const v = evaluarCosecha(clima());
    expect(v.nivel).toBe("bueno");
  });

  it("sin datos de clima no se inventa un veredicto bueno", () => {
    expect(evaluarLabor("riego", null, null, null).nivel).toBe("cuidado");
    expect(evaluarCosecha(null).nivel).toBe("cuidado");
  });

  it("habla en pasado de lo que ya ocurrió y en futuro de lo que viene", () => {
    const pasado = evaluarCosecha(clima({ precipitation: 15, esPronostico: false }));
    expect(pasado.motivos.join(" ")).toContain("cayeron");
    const futuro = evaluarCosecha(clima({ precipitation: 15, esPronostico: true }));
    expect(futuro.motivos.join(" ")).toContain("se esperan");
  });
});

// ============================================================
// ARMADO COMPLETO
// ============================================================

let respuestas: { match: string; rows: any[] }[] = [];

function textoSql(q: any): string {
  return (q?.queryChunks ?? [])
    .map((c: any) => (Array.isArray(c?.value) ? c.value.join(" ") : ""))
    .join(" ");
}

const baseFalsa = {
  execute: async (q: any) => {
    const txt = textoSql(q);
    const r = respuestas.find((x) => txt.includes(x.match));
    return [r ? r.rows : [], []];
  },
};

vi.mock("./db", async () => {
  const real = await vi.importActual<any>("./db");
  return { ...real, getDb: async () => baseFalsa };
});

vi.mock("./db_extended", () => ({
  getLocationConfig: async () => ({
    latitude: "20.5", longitude: "-101.2", timezone: "America/Mexico_City",
  }),
}));

/** Clima falso: un día seco y otro lluvioso, para ver que cada labor tome el suyo */
const climaFalso: Record<string, any> = {};
vi.mock("./weatherService", () => ({
  getHistoricalWeatherDetailed: async () =>
    Object.values(climaFalso).filter((d: any) => d.__pasado),
  getExtendedForecast: async () =>
    Object.values(climaFalso).filter((d: any) => !d.__pasado),
}));

const { getWeatherPlanner } = await import("./weatherPlanner");

function hoyMx() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}
function mas(dias: number) {
  const d = new Date(hoyMx() + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString("en-CA");
}

function ponClima(date: string, pasado: boolean, extra: any = {}) {
  climaFalso[date] = {
    date, temperatureMax: 29, temperatureMin: 17, temperatureMean: 23,
    precipitation: 0, precipitationProbability: 0, windSpeed: 5, cloudCover: 10,
    weatherCode: 0, condition: "sunny", conditionText: "Despejado",
    __pasado: pasado, ...extra,
  };
}

beforeEach(() => {
  respuestas = [];
  for (const k of Object.keys(climaFalso)) delete climaFalso[k];
});

describe("getWeatherPlanner", () => {
  it("detecta temporada de cosecha por las cajas, aunque el ciclo no la tenga capturada", async () => {
    respuestas = [
      { match: "FROM productionCycles", rows: [{ id: 4, name: "Ciclo 2026-2027", startDate: "2026-01-15", endDate: null, harvestStartDate: null, harvestEndDate: null }] },
      { match: "FROM boxes", rows: [{ cajas: 340, kg: 5200 }] },
      { match: "FROM fieldActivities", rows: [] },
    ];

    const r = await getWeatherPlanner(30, 7);

    expect(r.temporadaCosecha).toBe(true);
    expect(r.motivoTemporada).toContain("340 cajas");
    expect(r.ciclo?.name).toBe("Ciclo 2026-2027");
    expect(r.cosechaReciente.kg).toBe(5200);
  });

  it("fuera de temporada lo dice y no marca cosecha", async () => {
    respuestas = [
      { match: "FROM productionCycles", rows: [{ id: 4, name: "Ciclo 2026-2027", startDate: "2026-01-15", endDate: null, harvestStartDate: "2027-05-01", harvestEndDate: null }] },
      { match: "FROM boxes", rows: [{ cajas: 0, kg: 0 }] },
      { match: "FROM fieldActivities", rows: [] },
    ];

    const r = await getWeatherPlanner(30, 7);

    expect(r.temporadaCosecha).toBe(false);
    expect(r.motivoTemporada).toContain("2027-05-01");
  });

  it("pega a cada labor el clima de SU día y la separa en hecha o planeada", async () => {
    const ayer = mas(-1);
    const enTres = mas(3);
    ponClima(ayer, true, { precipitation: 14, condition: "rainy", conditionText: "Lluvia fuerte" });
    ponClima(hoyMx(), false);
    ponClima(mas(1), false);
    ponClima(mas(2), false);
    ponClima(enTres, false, { windSpeed: 26, conditionText: "Ventoso" });
    for (let i = 4; i <= 7; i++) ponClima(mas(i), false);

    respuestas = [
      { match: "FROM productionCycles", rows: [{ id: 4, name: "Ciclo 2026-2027", startDate: "2026-01-15", endDate: null, harvestStartDate: null, harvestEndDate: null }] },
      { match: "FROM boxes", rows: [{ cajas: 0, kg: 0 }] },
      {
        match: "FROM fieldActivities", rows: [
          { id: 1, activityType: "poda", activitySubtype: null, description: "Poda de formación", activityDate: ayer, status: "completada", performedBy: "Cuadrilla 1", parcelas: "El Higueral", personas: 4 },
          { id: 2, activityType: "aplicacion_fitosanitaria", activitySubtype: "Preventiva", description: "Aplicación preventiva", activityDate: enTres, status: "planificada", performedBy: "Cuadrilla 2", parcelas: "El Higueral||La Loma", personas: 3 },
          { id: 3, activityType: "control_maleza", activitySubtype: "Mecánico (machete)", description: "Rosando", activityDate: enTres, status: "planificada", performedBy: "Cuadrilla 3", parcelas: "MICAELA", personas: 7 },
        ],
      },
    ];

    const r = await getWeatherPlanner(30, 7);

    // La poda de ayer, ya terminada, con la lluvia que hubo
    expect(r.pasadas).toHaveLength(1);
    const poda = r.pasadas[0];
    expect(poda.activityTypeLabel).toBe("Poda");
    expect(poda.clima?.precipitation).toBe(14);
    expect(poda.clima?.esPronostico).toBe(false);
    expect(poda.veredicto.nivel).toBe("malo");
    expect(poda.enDias).toBe(-1);

    // La aplicación de dentro de tres días, con el viento pronosticado
    expect(r.planeadas).toHaveLength(2);
    const app = r.planeadas.find((l) => l.activityType === "aplicacion_fitosanitaria")!;
    expect(app.parcelas).toEqual(["El Higueral", "La Loma"]);
    expect(app.personas).toBe(3);
    expect(app.clima?.esPronostico).toBe(true);
    expect(app.veredicto.nivel).toBe("malo");
    expect(app.enDias).toBe(3);

    // La agenda cubre hoy + los días pedidos y coloca la labor en su día
    expect(r.agenda).toHaveLength(8);
    expect(r.agenda[0].date).toBe(hoyMx());
    expect(r.agenda[3].labores.map((l) => l.id).sort()).toEqual([2, 3]);
    // El machete del MISMO día ventoso no hereda el problema de la aspersión
    const machete = r.planeadas.find((l) => l.activityType === "control_maleza")!;
    expect(machete.veredicto.nivel).toBe("bueno");
    // Un día despejado sí sugiere labores y se marca como buen día de campo
    expect(r.agenda[1].sugerencias.length).toBeGreaterThan(0);
    expect(r.agenda[1].aspersion.nivel).toBe('bueno');
    // El día ventoso NO es buen día de aspersión, aunque sí lo sea de corte
    expect(r.agenda[3].aspersion.nivel).toBe('malo');
    expect(r.agenda[3].cosecha.nivel).toBe('bueno');
  });

  it("una labor vencida sin completar sigue contando como pendiente", async () => {
    const haceDias = mas(-4);
    ponClima(haceDias, true);
    ponClima(hoyMx(), false);

    respuestas = [
      { match: "FROM productionCycles", rows: [] },
      { match: "FROM boxes", rows: [{ cajas: 0, kg: 0 }] },
      {
        match: "FROM fieldActivities", rows: [
          { id: 9, activityType: "riego", activitySubtype: null, description: "Riego programado", activityDate: haceDias, status: "planificada", performedBy: "Juan", parcelas: null, personas: 0 },
        ],
      },
    ];

    const r = await getWeatherPlanner(30, 7);

    expect(r.pasadas).toHaveLength(0);
    expect(r.planeadas).toHaveLength(1);
    expect(r.planeadas[0].enDias).toBe(-4);
    expect(r.ciclo).toBeNull();
  });
});
