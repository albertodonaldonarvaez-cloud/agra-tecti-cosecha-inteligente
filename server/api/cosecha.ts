/**
 * Endpoints de cosecha: lo que se cortó, cuánto pesó y con qué calidad.
 *
 * Los nombres de campo llevan la unidad pegada (pesoKg, pesoToneladas) porque en
 * la base el peso está en gramos y un agente que lea "peso" y asuma kilos se
 * equivoca por mil sin que nada se lo advierta.
 */
import type { DefinicionRuta } from "./index";
import { ApiError, aKg, entero, fecha, opcion, rango, texto } from "./util";
import {
  GRANULARIDADES,
  METRICAS,
  contarCajas,
  cosechaPorParcela,
  loteDeCajas,
  rendimientoCortadoras,
  serie,
  type Granularidad,
  type Metrica,
} from "./consultas";

export const rutasCosecha: DefinicionRuta[] = [
  {
    ruta: "/cosecha/resumen",
    resumen: "Totales de cosecha y reparto de calidad en un rango de fechas",
    descripcion:
      "Sin fechas devuelve el histórico completo. Las tres calidades salen por separado: " +
      "primera es todo lo cortado por una persona, segunda son las cajas marcadas con la " +
      "cortadora 98 y desperdicio las marcadas con la 99.",
    parametros: [
      { nombre: "desde", tipo: "fecha", descripcion: "Primer día incluido (YYYY-MM-DD)" },
      { nombre: "hasta", tipo: "fecha", descripcion: "Último día incluido (YYYY-MM-DD)" },
    ],
    ejemplo: "/api/v1/cosecha/resumen?desde=2026-08-01&hasta=2026-08-31",
    async manejador({ req, caller }) {
      const { desde, hasta } = rango(req, 2000);
      const s = await caller.boxes.dashboardStats({ startDate: desde, endDate: hasta });

      if (!s) {
        return {
          hayDatos: false,
          cajas: 0,
          mensaje: "No hay cajas registradas en ese rango",
          periodo: { desde: desde ?? null, hasta: hasta ?? null },
        };
      }

      return {
        hayDatos: true,
        periodo: {
          desde: desde ?? s.firstDate,
          hasta: hasta ?? s.lastDate,
          primerDiaConCosecha: s.firstDate,
          ultimoDiaConCosecha: s.lastDate,
        },
        cajas: s.total,
        pesoKg: Number(s.totalWeight.toFixed(2)),
        pesoToneladas: Number((s.totalWeight / 1000).toFixed(3)),
        pesoPromedioPorCajaKg: s.total ? Number((s.totalWeight / s.total).toFixed(2)) : 0,
        primera: {
          cajas: s.firstQuality,
          pesoKg: Number(s.firstQualityWeight.toFixed(2)),
          porcentaje: s.firstQualityPercent,
        },
        segunda: {
          cajas: s.secondQuality,
          pesoKg: Number(s.secondQualityWeight.toFixed(2)),
          porcentaje: s.secondQualityPercent,
        },
        desperdicio: {
          cajas: s.waste,
          pesoKg: Number(s.wasteWeight.toFixed(2)),
          porcentaje: s.wastePercent,
        },
      };
    },
  },

  {
    ruta: "/cosecha/diaria",
    resumen: "Cosecha día por día, con el desglose de las tres calidades",
    parametros: [
      { nombre: "desde", tipo: "fecha", descripcion: "Primer día incluido" },
      { nombre: "hasta", tipo: "fecha", descripcion: "Último día incluido" },
      { nombre: "mes", tipo: "texto", descripcion: 'Mes completo en formato YYYY-MM (alternativa a desde/hasta)' },
    ],
    ejemplo: "/api/v1/cosecha/diaria?desde=2026-08-01&hasta=2026-08-31",
    async manejador({ req, caller }) {
      const { desde, hasta } = rango(req, 2000);
      const mes = texto(req, "mes", 7);
      if (mes && !/^\d{4}-\d{2}$/.test(mes)) {
        throw new ApiError(400, "mes_invalido", `"mes" debe tener el formato YYYY-MM, llegó "${mes}"`);
      }

      const dias = await caller.boxes.dailyChartData({ month: mes, startDate: desde, endDate: hasta });

      return {
        dias: dias.map((d) => ({
          fecha: d.date,
          cajas: d.totalBoxes,
          pesoKg: d.totalWeight,
          primeraKg: d.primera,
          segundaKg: d.segunda,
          desperdicioKg: d.desperdicio,
        })),
        totales: {
          dias: dias.length,
          cajas: dias.reduce((t, d) => t + d.totalBoxes, 0),
          pesoKg: Number(dias.reduce((t, d) => t + d.totalWeight, 0).toFixed(2)),
        },
      };
    },
  },

  {
    ruta: "/cosecha/por-parcela",
    resumen: "Cosecha, calidad y rendimiento por hectárea de cada parcela",
    descripcion:
      "La suma la hace la base de datos. rendimientoKgPorHectarea sale null cuando la " +
      "parcela no tiene hectáreas productivas registradas: un cero ahí haría creer que no produjo.",
    parametros: [
      { nombre: "desde", tipo: "fecha", descripcion: "Primer día incluido" },
      { nombre: "hasta", tipo: "fecha", descripcion: "Último día incluido" },
    ],
    ejemplo: "/api/v1/cosecha/por-parcela?desde=2026-08-01&hasta=2026-08-31",
    async manejador({ req }) {
      const { desde, hasta } = rango(req, 2000);
      const parcelas = await cosechaPorParcela(desde, hasta);
      return {
        parcelas,
        totales: {
          parcelas: parcelas.length,
          cajas: parcelas.reduce((t, p) => t + p.cajas, 0),
          pesoKg: Number(parcelas.reduce((t, p) => t + p.pesoKg, 0).toFixed(2)),
          sinHectareasRegistradas: parcelas.filter((p) => p.hectareasProductivas === null).length,
        },
      };
    },
  },

  {
    ruta: "/cosecha/fechas",
    resumen: "Qué días y qué meses tienen cosecha registrada",
    descripcion:
      "Sirve para no pedir rangos vacíos: un agente puede consultarlo primero y acotar sus " +
      "preguntas a los días que sí existen.",
    ejemplo: "/api/v1/cosecha/fechas",
    async manejador({ caller }) {
      const [dias, meses, inicio] = await Promise.all([
        caller.analytics.getAvailableDates(),
        caller.boxes.availableMonths(undefined),
        caller.boxes.harvestStartDate(),
      ]);
      return {
        inicioDeCosecha: inicio ?? null,
        dias,
        meses,
        totalDias: Array.isArray(dias) ? dias.length : 0,
      };
    },
  },

  {
    ruta: "/cortadoras",
    resumen: "Rendimiento por cortadora, ordenado por kilos",
    descripcion:
      "Excluye las cortadoras 98 y 99, que no son personas sino marcas de segunda calidad " +
      "y de desperdicio. cajasPorDia y kgPorDia se calculan sobre los días en que esa " +
      "cortadora efectivamente trabajó, no sobre los días del rango.",
    parametros: [
      { nombre: "desde", tipo: "fecha", descripcion: "Primer día incluido" },
      { nombre: "hasta", tipo: "fecha", descripcion: "Último día incluido" },
      { nombre: "limite", tipo: "entero", descripcion: "Cuántas cortadoras devolver", porDefecto: 100 },
    ],
    ejemplo: "/api/v1/cortadoras?desde=2026-08-01&hasta=2026-08-31&limite=10",
    async manejador({ req }) {
      const { desde, hasta } = rango(req, 2000);
      const limite = entero(req, "limite", { min: 1, max: 500, porDefecto: 100 })!;
      const cortadoras = await rendimientoCortadoras(desde, hasta, limite);
      return {
        cortadoras,
        totales: {
          cortadoras: cortadoras.length,
          cajas: cortadoras.reduce((t, c) => t + c.cajas, 0),
          pesoKg: Number(cortadoras.reduce((t, c) => t + c.pesoKg, 0).toFixed(2)),
        },
      };
    },
  },

  {
    ruta: "/series",
    resumen: "Cualquier métrica de cosecha, siempre con la misma forma",
    descripcion:
      "Devuelve {periodo, valor, cajas} sin importar la métrica, para poder cruzar dos " +
      "series sin normalizar nada. En granularidad semanal, el periodo es el lunes de esa semana.",
    parametros: [
      {
        nombre: "metrica",
        tipo: "opcion",
        descripcion: "Qué medir",
        valores: METRICAS,
        porDefecto: "kg",
      },
      {
        nombre: "granularidad",
        tipo: "opcion",
        descripcion: "Tamaño del periodo",
        valores: GRANULARIDADES,
        porDefecto: "dia",
      },
      { nombre: "desde", tipo: "fecha", descripcion: "Primer día incluido" },
      { nombre: "hasta", tipo: "fecha", descripcion: "Último día incluido" },
      { nombre: "parcela", tipo: "texto", descripcion: "Código de parcela para acotar la serie" },
    ],
    ejemplo: "/api/v1/series?metrica=calidad_pct&granularidad=semana&desde=2026-06-01",
    async manejador({ req }) {
      const { desde, hasta } = rango(req, 2000);
      const metrica = opcion<Metrica>(req, "metrica", METRICAS, "kg")!;
      const granularidad = opcion<Granularidad>(req, "granularidad", GRANULARIDADES, "dia")!;
      const parcela = texto(req, "parcela", 64);

      const r = await serie({ metrica, granularidad, desde, hasta, parcela });
      return {
        metrica,
        granularidad,
        unidad: r.unidad,
        parcela: parcela ?? null,
        puntos: r.puntos,
      };
    },
  },

  {
    ruta: "/cajas",
    resumen: "Cajas una por una, paginadas",
    descripcion:
      "Para revisar casos concretos. Si lo que necesitas es el histórico completo, usa " +
      "/api/v1/exportar/cajas: va por cursor y no repite filas.",
    parametros: [
      { nombre: "pagina", tipo: "entero", descripcion: "Número de página", porDefecto: 1 },
      { nombre: "porPagina", tipo: "entero", descripcion: "Filas por página (máximo 100)", porDefecto: 50 },
      { nombre: "fecha", tipo: "fecha", descripcion: "Un solo día" },
      { nombre: "parcela", tipo: "texto", descripcion: "Código de parcela" },
      { nombre: "cortadora", tipo: "entero", descripcion: "Número de cortadora" },
      { nombre: "buscar", tipo: "texto", descripcion: "Texto libre sobre el código de caja" },
    ],
    ejemplo: "/api/v1/cajas?fecha=2026-08-31&porPagina=20",
    async manejador({ req, caller }) {
      const r = await caller.boxes.listPaginated({
        page: entero(req, "pagina", { min: 1, porDefecto: 1 })!,
        pageSize: entero(req, "porPagina", { min: 10, max: 100, porDefecto: 50 })!,
        filterDate: fecha(req, "fecha"),
        filterParcel: texto(req, "parcela", 64),
        filterHarvester: entero(req, "cortadora", { min: 0, max: 9999 }),
        search: texto(req, "buscar", 64),
      });

      const cajas = ((r as any)?.boxes ?? []) as any[];
      return {
        cajas: cajas.map((b) => ({
          id: b.id,
          codigo: b.boxCode,
          cortadora: b.harvesterId,
          calidad: b.harvesterId === 98 ? "segunda" : b.harvesterId === 99 ? "desperdicio" : "primera",
          parcelaCodigo: b.parcelCode,
          parcelaNombre: b.parcelName,
          pesoKg: aKg(b.weight),
          latitud: b.latitude ? Number(b.latitude) : null,
          longitud: b.longitude ? Number(b.longitude) : null,
          registrado: b.submissionTime,
        })),
        paginacion: {
          pagina: (r as any)?.page ?? 1,
          porPagina: (r as any)?.pageSize ?? cajas.length,
          total: (r as any)?.total ?? cajas.length,
          totalPaginas: (r as any)?.totalPages ?? 1,
        },
      };
    },
  },

  {
    ruta: "/exportar/cajas",
    resumen: "Histórico completo de cajas, por cursor, en NDJSON",
    descripcion:
      "Una caja por línea en formato JSON (NDJSON), para leerlo de corrido sin cargar todo " +
      "en memoria. Repite la llamada pasando el cursor que viene en el encabezado " +
      "X-Siguiente-Cursor hasta que ese encabezado ya no venga. Va por cursor y no por " +
      "página porque la sincronización con Kobo mete cajas nuevas dos veces al día: con " +
      "paginado normal, las filas se recorren y terminarías con registros repetidos.",
    parametros: [
      { nombre: "cursor", tipo: "entero", descripcion: "Id de la última caja del lote anterior" },
      { nombre: "limite", tipo: "entero", descripcion: "Cajas por lote (máximo 5000)", porDefecto: 1000 },
      { nombre: "desde", tipo: "fecha", descripcion: "Primer día incluido" },
      { nombre: "hasta", tipo: "fecha", descripcion: "Último día incluido" },
      { nombre: "parcela", tipo: "texto", descripcion: "Código de parcela" },
    ],
    ejemplo: "/api/v1/exportar/cajas?limite=2000&desde=2026-01-01",
    crudo: true,
    async manejador({ req, res }) {
      const { desde, hasta } = rango(req, 5000);
      const parcela = texto(req, "parcela", 64);
      const limite = entero(req, "limite", { min: 1, max: 5000, porDefecto: 1000 })!;
      const cursor = entero(req, "cursor", { min: 0 });

      const { cajas, siguienteCursor } = await loteDeCajas({ cursor, limite, desde, hasta, parcela });

      // En el primer lote se dice cuántas son en total, para poder mostrar avance
      if (!cursor) {
        res.setHeader("X-Total-Aproximado", String(await contarCajas(desde, hasta, parcela)));
      }
      if (siguienteCursor !== null) {
        res.setHeader("X-Siguiente-Cursor", String(siguienteCursor));
      }
      res.setHeader("X-Filas", String(cajas.length));
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");

      for (const caja of cajas) res.write(`${JSON.stringify(caja)}\n`);
      res.end();
      return undefined;
    },
  },
];
