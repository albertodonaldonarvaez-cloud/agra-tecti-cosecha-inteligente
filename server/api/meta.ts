/**
 * Los tres endpoints que hacen que la API se pueda usar sin preguntarle a nadie:
 * qué existe (catálogo), qué significa (diccionario) y el esquema formal (OpenAPI).
 *
 * El catálogo y el OpenAPI se generan de la MISMA lista de rutas que se monta en
 * el servidor. No es un documento aparte que haya que acordarse de actualizar:
 * si un endpoint no está en la lista, no existe; si está, aparece documentado.
 * Esa es la única forma de que la documentación no se desfase.
 */
import type { DefinicionRuta, ParametroDoc } from "./index";

/**
 * El diccionario: lo que un agente NO puede deducir del JSON.
 *
 * Es el apartado más importante de toda la API. Sin él, un agente lee
 * `weight: 28450` y reporta 28 450 kilos cuando son 28.45; o ve la cortadora 98
 * en el ranking y la trata como si fuera una persona muy productiva.
 */
const DICCIONARIO = {
  zonaHoraria: {
    valor: "America/Mexico_City",
    nota:
      "Todas las fechas del negocio (días de cosecha, labores, cuotas) son días de calendario " +
      "en esta zona. Los campos que terminan en fecha/hora vienen en ISO 8601.",
  },
  unidades: {
    nota:
      "Los nombres de campo llevan la unidad pegada. Si un campo no la lleva, es un conteo.",
    campos: {
      pesoKg: "kilogramos",
      pesoToneladas: "toneladas métricas (1 000 kg)",
      pesoPromedioPorCajaKg: "kilogramos por caja",
      rendimientoKgPorHectarea: "kilogramos por hectárea productiva",
      hectareasTotales: "hectáreas",
      hectareasProductivas: "hectáreas en producción (menos que las totales)",
      horas: "horas de trabajo",
      porcentaje: "de 0 a 100, no de 0 a 1",
    },
    advertencia:
      "En la base de datos el peso de las cajas está guardado en GRAMOS (columna `weight`). " +
      "Esta API ya lo convierte: todo lo que sale de /api/v1 está en kilos o toneladas. " +
      "Si en algún momento consultas la base directamente, acuérdate de dividir entre 1000.",
  },
  cortadoras: {
    nota:
      "El número de cortadora identifica a la persona que cortó la caja, con DOS excepciones " +
      "que no son personas sino marcas de calidad.",
    codigos: {
      "1-97": "Cortadora real. El nombre, si está registrado, viene en /api/v1/cortadoras",
      "98": "No es una persona: son las cajas clasificadas como SEGUNDA calidad",
      "99": "No es una persona: son las cajas clasificadas como DESPERDICIO",
    },
    consecuencia:
      "/api/v1/cortadoras ya excluye la 98 y la 99. Si sumas cortadoras por tu cuenta desde " +
      "/api/v1/exportar/cajas, exclúyelas o el ranking saldrá con dos 'personas' inexistentes " +
      "en los primeros lugares.",
  },
  calidad: {
    primera: "Fruta de exportación. Es todo lo cortado por una cortadora del 1 al 97",
    segunda: "Fruta de menor calidad, marcada con la cortadora 98",
    desperdicio: "Fruta no aprovechable, marcada con la cortadora 99",
    nota: "Las tres suman el total de cajas. El campo `calidad` de cada caja ya viene resuelto.",
  },
  labores: {
    estados: ["planificada", "en_progreso", "completada", "cancelada"],
    responsable:
      "El campo `responsable` puede traer a toda una cuadrilla en un solo texto separado por " +
      "comas. No es una persona: si vas a contar gente, sepáralo por comas primero.",
    limitacion:
      "La columna del responsable admite 255 caracteres. En cuadrillas grandes el último " +
      "nombre puede aparecer cortado a media palabra: es un límite de la captura, no un error " +
      "de la API.",
  },
  notas: {
    estados: ["abierta", "en_revision", "en_progreso", "resuelta", "descartada"],
    gravedad: ["baja", "media", "alta", "critica"],
  },
  parcelas: {
    identificacion:
      "Cada parcela tiene un `id` numérico y un `codigo` de texto. Los endpoints de cosecha " +
      "usan el código; los de campo y satélite usan el id. /api/v1/parcelas trae los dos.",
    hectareas:
      "rendimientoKgPorHectarea llega en null cuando la parcela no tiene hectáreas productivas " +
      "registradas. No es cero: es que no se puede calcular.",
  },
  cajasArchivadas:
    "Las cajas archivadas (duplicados y errores de captura corregidos) quedan fuera de TODOS " +
    "los conteos de esta API. Los totales cuadran con lo que ve el productor en pantalla.",
  respuestas: {
    exito: '{ "ok": true, "datos": …, "meta": { "generado", "zonaHoraria", "cuota" } }',
    error: '{ "ok": false, "error": { "codigo", "mensaje", "ayuda" } }',
    nota: "El campo `ayuda` de los errores dice qué hacer para que la petición funcione.",
  },
  limites: {
    peticionesPorMinuto: "Depende de la llave. Al pasarse llega un 429 con Retry-After en segundos.",
    cuotaDiaria: "También por llave. Se reinicia a medianoche, hora de México.",
    cuotaDeIa:
      "Los endpoints que llaman a DeepSeek se cuentan aparte y exigen una llave con alcance " +
      "lectura_ia. Es lo que evita que un script en bucle vacíe la cuota contratada.",
  },
} as const;

export function rutasMeta(obtenerRutas: () => DefinicionRuta[]): DefinicionRuta[] {
  return [
    {
      ruta: "/catalogo",
      resumen: "Lista de todo lo que se puede consultar, con sus parámetros",
      descripcion:
        "Se genera de la misma lista de rutas que monta el servidor, así que no puede " +
        "desfasarse de la realidad. Es la primera llamada recomendada para un agente nuevo.",
      ejemplo: "/api/v1/catalogo",
      async manejador() {
        const rutas = obtenerRutas();
        return {
          version: "v1",
          base: "/api/v1",
          soloLectura: true,
          totalEndpoints: rutas.length,
          endpoints: rutas.map((r) => ({
            metodo: "GET",
            ruta: `/api/v1${r.ruta}`,
            resumen: r.resumen,
            descripcion: r.descripcion,
            cuestaIa: typeof r.ia === "function" ? "solo si se pide ia=true" : !!r.ia,
            formato: r.crudo ? "NDJSON (una línea por registro)" : "JSON",
            parametros: (r.parametros ?? []).map((p) => ({
              nombre: p.nombre,
              tipo: p.tipo,
              obligatorio: !!p.obligatorio,
              descripcion: p.descripcion,
              valores: p.valores,
              porDefecto: p.porDefecto,
            })),
            ejemplo: r.ejemplo,
          })),
          siguientePaso:
            "Consulta /api/v1/diccionario antes de interpretar cifras: ahí están las unidades " +
            "y los códigos que no se pueden deducir del JSON.",
        };
      },
    },

    {
      ruta: "/diccionario",
      resumen: "Unidades, códigos y trampas de los datos",
      descripcion:
        "Lo que un programa no puede adivinar leyendo el JSON: que el peso está en gramos en " +
        "la base, que las cortadoras 98 y 99 no son personas, y que el responsable de una " +
        "labor puede ser una cuadrilla entera en un solo texto.",
      ejemplo: "/api/v1/diccionario",
      async manejador() {
        return DICCIONARIO;
      },
    },

    {
      ruta: "/openapi.json",
      resumen: "Esquema OpenAPI 3.1 de toda la API",
      descripcion:
        "Para generar clientes o cargar la API en herramientas que hablen OpenAPI. Se arma de " +
        "la misma lista de rutas que el catálogo.",
      ejemplo: "/api/v1/openapi.json",
      async manejador({ req }) {
        return construirOpenApi(obtenerRutas(), `${req.protocol}://${req.get("host")}/api/v1`);
      },
    },
  ];
}

// ───────────────────────── OpenAPI ─────────────────────────

function tipoOpenApi(p: ParametroDoc) {
  switch (p.tipo) {
    case "entero":
      return { type: "integer" as const };
    case "booleano":
      return { type: "boolean" as const };
    case "fecha":
      return { type: "string" as const, format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
    case "opcion":
      return { type: "string" as const, enum: p.valores ? [...p.valores] : undefined };
    default:
      return { type: "string" as const };
  }
}

function construirOpenApi(rutas: DefinicionRuta[], servidor: string) {
  const paths: Record<string, unknown> = {};

  for (const r of rutas) {
    // OpenAPI usa {id}; Express usa :id
    const ruta = r.ruta.replace(/:(\w+)/g, "{$1}");
    const enRuta = Array.from(r.ruta.matchAll(/:(\w+)/g)).map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema: { type: "integer" },
      description: "Identificador numérico",
    }));

    paths[ruta] = {
      get: {
        summary: r.resumen,
        description: r.descripcion,
        parameters: [
          ...enRuta,
          ...(r.parametros ?? []).map((p) => ({
            name: p.nombre,
            in: "query",
            required: !!p.obligatorio,
            description: p.descripcion,
            schema: { ...tipoOpenApi(p), default: p.porDefecto },
          })),
        ],
        responses: {
          "200": {
            description: "Consulta correcta",
            content: r.crudo
              ? { "application/x-ndjson": { schema: { type: "string" } } }
              : {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        ok: { type: "boolean" },
                        datos: {},
                        meta: { type: "object" },
                      },
                    },
                  },
                },
          },
          "401": { description: "Llave ausente, desconocida, revocada o caducada" },
          "403": { description: "La llave no tiene alcance para este endpoint" },
          "429": { description: "Se pasó del límite por minuto o de la cuota diaria" },
        },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "API de Agra Tec-Ti",
      version: "1.0.0",
      description:
        "API de solo lectura para agentes de IA y scripts. Antes de interpretar cifras, " +
        "consulta /diccionario: el peso viene en kilos aquí pero en gramos en la base, y las " +
        "cortadoras 98 y 99 no son personas sino marcas de segunda calidad y desperdicio.",
    },
    servers: [{ url: servidor }],
    security: [{ LlaveDeApi: [] }],
    components: {
      securitySchemes: {
        LlaveDeApi: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Llave agt_live_… creada en Configuración → Llaves de API",
        },
      },
    },
    paths,
  };
}
