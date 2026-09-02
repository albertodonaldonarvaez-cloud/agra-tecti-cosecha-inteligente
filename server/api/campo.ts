/**
 * Endpoints de campo: parcelas, ciclos, labores, notas, almacén y clima.
 *
 * Casi todos delegan en el procedimiento tRPC que ya usa la web, para que la
 * cifra que ve el agente y la que ve el productor en pantalla sean la misma.
 * Lo que sí cambia aquí son dos cosas: se recortan campos que a un agente le
 * estorban (el GeoJSON del polígono pesa más que todo lo demás junto) y se
 * ponen topes donde el procedimiento original no los tiene.
 */
import type { DefinicionRuta } from "./index";
import { ApiError, entero, hoyMx, rango, sumarDias, texto } from "./util";

/** Ventana por omisión cuando no se pide rango: 90 días hacia atrás */
function rangoDeLabores(req: Parameters<typeof rango>[0]) {
  const { desde, hasta } = rango(req, 800);
  return {
    desde: desde ?? sumarDias(hoyMx(), -90),
    hasta: hasta ?? hoyMx(),
    fueImplicito: !desde,
  };
}

export const rutasCampo: DefinicionRuta[] = [
  // ───────────────────────── parcelas ─────────────────────────
  {
    ruta: "/parcelas",
    resumen: "Catálogo de parcelas con hectáreas, árboles y cultivo",
    descripcion:
      "No incluye el polígono: es un GeoJSON que pesa más que el resto del catálogo junto. " +
      "Si lo necesitas, pídelo por parcela en /api/v1/parcelas/:id con poligono=true.",
    parametros: [
      { nombre: "activas", tipo: "booleano", descripcion: "Solo las parcelas activas", porDefecto: false },
    ],
    ejemplo: "/api/v1/parcelas?activas=true",
    async manejador({ req, caller }) {
      const soloActivas = String(req.query.activas ?? "").toLowerCase();
      const activas = soloActivas === "true" || soloActivas === "1";

      const [lista, detalles] = await Promise.all([
        activas ? caller.parcels.listActive() : caller.parcels.list(),
        caller.parcelAnalysis.getAllDetails(),
      ]);

      const porParcela = new Map<number, any>();
      for (const d of (detalles as any[]) ?? []) porParcela.set(d.parcelId, d);

      return {
        parcelas: ((lista as any[]) ?? []).map((p) => {
          const d = porParcela.get(p.id);
          return {
            id: p.id,
            codigo: p.code,
            nombre: p.name,
            activa: !!p.isActive,
            tienePoligono: !!p.polygon && p.polygon !== "[]",
            hectareasTotales: d?.totalHectares ? Number(d.totalHectares) : null,
            hectareasProductivas: d?.productiveHectares ? Number(d.productiveHectares) : null,
            arbolesProductivos: d?.productiveTrees ?? null,
            cultivo: d?.cropName ?? null,
            variedad: d?.varietyName ?? null,
            fechaSiembra: d?.plantingDate ?? null,
            riego: d?.irrigationType ?? null,
          };
        }),
      };
    },
  },

  {
    ruta: "/parcelas/:id",
    resumen: "Una parcela con su ficha y su cosecha",
    parametros: [
      { nombre: "poligono", tipo: "booleano", descripcion: "Incluir el GeoJSON del polígono", porDefecto: false },
    ],
    ejemplo: "/api/v1/parcelas/12",
    async manejador({ req, caller }) {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, "id_invalido", `"${req.params.id}" no es un id de parcela válido`,
          "Consulta /api/v1/parcelas para ver los ids disponibles");
      }

      const lista = ((await caller.parcels.list()) as any[]) ?? [];
      const parcela = lista.find((p) => p.id === id);
      if (!parcela) {
        throw new ApiError(404, "parcela_no_encontrada", `No existe la parcela con id ${id}`,
          "Consulta /api/v1/parcelas para ver los ids disponibles");
      }

      const [ficha, cosecha] = await Promise.all([
        caller.parcelAnalysis.getDetails({ parcelId: id }).catch(() => null),
        caller.parcelAnalysis.getHarvestStats({ parcelCode: parcela.code }).catch(() => null),
      ]);

      const incluirPoligono = String(req.query.poligono ?? "").toLowerCase();
      return {
        id: parcela.id,
        codigo: parcela.code,
        nombre: parcela.name,
        activa: !!parcela.isActive,
        ficha: ficha ?? null,
        cosecha: cosecha ?? null,
        poligono:
          incluirPoligono === "true" || incluirPoligono === "1" ? (parcela.polygon ?? null) : undefined,
      };
    },
  },

  {
    ruta: "/parcelas/:id/telemetria",
    resumen: "Historial satelital de la parcela: NDVI, vigor e índices",
    descripcion: "Lee lo ya guardado por la revisión satelital automática; no dispara una consulta nueva a Copernicus.",
    ejemplo: "/api/v1/parcelas/12/telemetria",
    async manejador({ req, caller }) {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, "id_invalido", `"${req.params.id}" no es un id de parcela válido`);
      }
      const porCiclo = String(req.query.porCiclo ?? "").toLowerCase();
      if (porCiclo === "true" || porCiclo === "1") {
        return caller.copernicus.getCycleTelemetry({ parcelId: id });
      }
      return caller.copernicus.getTelemetry({ parcelId: id });
    },
  },

  // ───────────────────────── ciclos ─────────────────────────
  {
    ruta: "/ciclos",
    resumen: "Ciclos de producción con su cosecha acumulada",
    ejemplo: "/api/v1/ciclos",
    async manejador({ caller }) {
      return { ciclos: await caller.cycles.overview() };
    },
  },

  {
    ruta: "/ciclos/comparacion",
    resumen: "Compara el ciclo en curso contra los anteriores",
    descripcion:
      "Alinea los ciclos por mes de calendario, no por días transcurridos: comparar el mes 3 " +
      "de un ciclo con el mes 3 del anterior es lo que tiene sentido agronómico.",
    parametros: [
      { nombre: "limite", tipo: "entero", descripcion: "Cuántos ciclos comparar (2 a 5)", porDefecto: 3 },
    ],
    ejemplo: "/api/v1/ciclos/comparacion?limite=2",
    async manejador({ req, caller }) {
      const limite = entero(req, "limite", { min: 2, max: 5, porDefecto: 3 })!;
      return caller.cycles.comparison({ limit: limite });
    },
  },

  // ───────────────────────── labores ─────────────────────────
  {
    ruta: "/labores",
    resumen: "Labores de campo con parcelas, insumos, herramientas y jornadas",
    descripcion:
      "Si no se pide rango, devuelve los últimos 90 días. El tope existe porque cada labor " +
      "arrastra sus parcelas, insumos, fotos y jornadas: pedir el histórico entero son miles " +
      "de consultas.",
    parametros: [
      { nombre: "desde", tipo: "fecha", descripcion: "Primer día incluido" },
      { nombre: "hasta", tipo: "fecha", descripcion: "Último día incluido" },
      { nombre: "tipo", tipo: "texto", descripcion: "Tipo de labor (riego, poda, fertilizacion…)" },
      { nombre: "estado", tipo: "texto", descripcion: "planificada, en_progreso, completada o cancelada" },
      { nombre: "parcela", tipo: "entero", descripcion: "Id de parcela" },
    ],
    ejemplo: "/api/v1/labores?desde=2026-08-01&hasta=2026-08-31&estado=completada",
    async manejador({ req, caller }) {
      const { desde, hasta, fueImplicito } = rangoDeLabores(req);
      const labores = (await caller.fieldNotebook.list({
        startDate: desde,
        endDate: hasta,
        activityType: texto(req, "tipo", 64),
        status: texto(req, "estado", 32),
        parcelId: entero(req, "parcela", { min: 1 }),
      })) as any[];

      return {
        periodo: { desde, hasta, porOmision: fueImplicito },
        total: labores.length,
        labores: labores.map((a) => ({
          id: a.id,
          fecha: a.activityDate,
          fechaFin: a.endDate ?? null,
          tipo: a.activityType,
          subtipo: a.activitySubtype ?? null,
          descripcion: a.description ?? null,
          responsable: a.performedBy ?? null,
          estado: a.status,
          horas: a.hoursWorked ? Number(a.hoursWorked) : null,
          parcelas: (a.parcels ?? []).map((p: any) => ({ id: p.id, nombre: p.name })),
          insumos: (a.products ?? []).map((p: any) => ({
            nombre: p.productName,
            cantidad: p.quantity ? Number(p.quantity) : null,
            unidad: p.unit ?? null,
            dosisPorHectarea: p.dosisPerHectare ? Number(p.dosisPerHectare) : null,
          })),
          herramientas: (a.tools ?? []).map((t: any) => t.toolName),
          jornadas: (a.workSessions ?? []).length,
          fotos: (a.photos ?? []).length,
        })),
      };
    },
  },

  {
    ruta: "/labores/resumen",
    resumen: "Conteos de labores por tipo y estado",
    ejemplo: "/api/v1/labores/resumen",
    async manejador({ caller }) {
      return caller.fieldNotebook.stats();
    },
  },

  {
    ruta: "/labores/reporte",
    resumen: "Reporte de labores del periodo, con redacción de la IA",
    descripcion:
      "El mismo reporte que se manda por correo. Con ia=true lo redacta DeepSeek y consume " +
      "cuota de IA; con ia=false salen solo las cifras, sin costo.",
    parametros: [
      { nombre: "desde", tipo: "fecha", descripcion: "Primer día incluido", obligatorio: true },
      { nombre: "hasta", tipo: "fecha", descripcion: "Último día incluido", obligatorio: true },
      { nombre: "parcela", tipo: "entero", descripcion: "Id de parcela (omitir para todas)" },
      { nombre: "ia", tipo: "booleano", descripcion: "Pedirle a DeepSeek que lo redacte", porDefecto: false },
    ],
    ejemplo: "/api/v1/labores/reporte?desde=2026-08-01&hasta=2026-08-31&ia=true",
    // Solo cuenta como llamada de IA cuando de verdad se pide la redacción
    ia: (req) => {
      const v = String(req.query.ia ?? "").toLowerCase();
      return v === "true" || v === "1" || v === "si" || v === "sí";
    },
    async manejador({ req, caller }) {
      const { desde, hasta } = rango(req, 800);
      if (!desde || !hasta) {
        throw new ApiError(400, "falta_parametro", 'Este reporte necesita "desde" y "hasta"',
          "Ejemplo: /api/v1/labores/reporte?desde=2026-08-01&hasta=2026-08-31");
      }
      const conIa = String(req.query.ia ?? "").toLowerCase();
      return caller.reports.getActivityReport({
        fromDate: desde,
        toDate: hasta,
        parcelId: entero(req, "parcela", { min: 1 }) ?? null,
        withAi: conIa === "true" || conIa === "1",
      });
    },
  },

  // ───────────────────────── notas de campo ─────────────────────────
  {
    ruta: "/notas",
    resumen: "Notas y reportes levantados en campo",
    parametros: [
      { nombre: "estado", tipo: "texto", descripcion: "abierta, en_revision, en_progreso, resuelta o descartada" },
      { nombre: "categoria", tipo: "texto", descripcion: "Categoría de la nota" },
      { nombre: "gravedad", tipo: "texto", descripcion: "baja, media, alta o critica" },
      { nombre: "parcela", tipo: "entero", descripcion: "Id de parcela" },
    ],
    ejemplo: "/api/v1/notas?estado=abierta&gravedad=critica",
    async manejador({ req, caller }) {
      const notas = (await caller.fieldNotes.list({
        status: texto(req, "estado", 32),
        category: texto(req, "categoria", 64),
        severity: texto(req, "gravedad", 32),
        parcelId: entero(req, "parcela", { min: 1 }),
      })) as any[];

      return {
        total: notas.length,
        notas: notas.map((n) => ({
          id: n.id,
          titulo: n.title,
          descripcion: n.description ?? null,
          categoria: n.category,
          gravedad: n.severity,
          estado: n.status,
          parcelaId: n.parcelId ?? null,
          reportadaPor: n.reportedBy ?? null,
          creada: n.createdAt,
        })),
      };
    },
  },

  {
    ruta: "/notas/resumen",
    resumen: "Cuántas notas hay abiertas, en proceso y críticas",
    ejemplo: "/api/v1/notas/resumen",
    async manejador({ caller }) {
      return caller.fieldNotes.summary();
    },
  },

  // ───────────────────────── almacén ─────────────────────────
  {
    ruta: "/almacen/resumen",
    resumen: "Existencias, insumos por agotarse y herramientas prestadas",
    ejemplo: "/api/v1/almacen/resumen",
    async manejador({ caller }) {
      return caller.warehouse.summary();
    },
  },

  {
    ruta: "/almacen/productos",
    resumen: "Insumos con existencia actual y mínimo",
    parametros: [
      { nombre: "categoria", tipo: "texto", descripcion: "Categoría del insumo" },
      { nombre: "buscar", tipo: "texto", descripcion: "Texto libre sobre el nombre" },
      { nombre: "porAgotarse", tipo: "booleano", descripcion: "Solo los que están en o bajo el mínimo" },
    ],
    ejemplo: "/api/v1/almacen/productos?porAgotarse=true",
    async manejador({ req, caller }) {
      const bajo = String(req.query.porAgotarse ?? "").toLowerCase();
      const productos = (await caller.warehouse.listProducts({
        category: texto(req, "categoria", 64),
        search: texto(req, "buscar", 64),
        lowStock: bajo === "true" || bajo === "1",
      })) as any[];

      return {
        total: productos.length,
        productos: productos.map((p) => ({
          id: p.id,
          nombre: p.name,
          categoria: p.category ?? null,
          existencia: p.currentStock !== null ? Number(p.currentStock) : null,
          minimo: p.minimumStock !== null ? Number(p.minimumStock) : null,
          unidad: p.unit ?? null,
          caduca: p.expirationDate ?? null,
        })),
      };
    },
  },

  // ───────────────────────── clima ─────────────────────────
  {
    ruta: "/clima",
    resumen: "Clima registrado en un rango de fechas",
    parametros: [
      { nombre: "desde", tipo: "fecha", descripcion: "Primer día incluido", obligatorio: true },
      { nombre: "hasta", tipo: "fecha", descripcion: "Último día incluido", obligatorio: true },
    ],
    ejemplo: "/api/v1/clima?desde=2026-08-01&hasta=2026-08-31",
    async manejador({ req, caller }) {
      const { desde, hasta } = rango(req, 400);
      if (!desde || !hasta) {
        throw new ApiError(400, "falta_parametro", 'El clima necesita "desde" y "hasta"',
          "Ejemplo: /api/v1/clima?desde=2026-08-01&hasta=2026-08-31");
      }
      return caller.weather.getForDateRange({ startDate: desde, endDate: hasta });
    },
  },

  {
    ruta: "/clima/pronostico",
    resumen: "Pronóstico de los próximos días",
    parametros: [
      { nombre: "dias", tipo: "entero", descripcion: "Días a pronosticar (1 a 16)", porDefecto: 7 },
    ],
    ejemplo: "/api/v1/clima/pronostico?dias=10",
    async manejador({ req, caller }) {
      const dias = entero(req, "dias", { min: 1, max: 16, porDefecto: 7 })!;
      const [actual, extendido] = await Promise.all([
        caller.weather.getCurrent().catch(() => null),
        caller.weather.getExtendedForecast({ days: dias }),
      ]);
      return { actual, pronostico: extendido };
    },
  },

  // ───────────────────────── gente ─────────────────────────
  {
    ruta: "/colaboradores",
    resumen: "Personas dadas de alta y sus puestos",
    ejemplo: "/api/v1/colaboradores",
    async manejador({ caller }) {
      const [gente, puestos] = await Promise.all([
        caller.collaborators.list(),
        caller.collaborators.listRoles(),
      ]);
      return {
        colaboradores: ((gente as any[]) ?? []).map((c) => ({
          id: c.id,
          nombre: c.name,
          puesto: c.role ?? null,
          activo: !!c.isActive,
          telefono: c.phone ?? null,
        })),
        puestos,
      };
    },
  },

  // ───────────────────────── resúmenes ─────────────────────────
  {
    ruta: "/resumen-semanal",
    resumen: "Los resúmenes semanales que ya genera el sistema",
    parametros: [
      { nombre: "limite", tipo: "entero", descripcion: "Cuántas semanas (1 a 26)", porDefecto: 8 },
    ],
    ejemplo: "/api/v1/resumen-semanal?limite=4",
    async manejador({ req, caller }) {
      const limite = entero(req, "limite", { min: 1, max: 26, porDefecto: 8 })!;
      return { semanas: await caller.weeklySummary.list({ limit: limite }) };
    },
  },
];
