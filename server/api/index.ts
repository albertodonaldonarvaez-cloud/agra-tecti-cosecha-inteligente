/**
 * Fachada REST /api/v1 — la puerta para agentes de IA y scripts.
 *
 * Por qué existe, si ya hay 237 procedimientos tRPC:
 *
 *  · tRPC viaja envuelto en superjson (?input={"json":…} y la respuesta dentro de
 *    result.data.json). Funciona, pero obliga a cada script externo a aprenderse
 *    el envoltorio antes de leer un solo dato.
 *  · No había forma de que un programa preguntara qué existe ni qué significan
 *    las cifras que recibe.
 *
 * Lo que esta capa NO hace es duplicar lógica. Cada endpoint llama a la misma
 * función que ya usa la web —muchas veces al mismo procedimiento tRPC, a través
 * de un caller interno— y solo se encarga de renombrar campos a nombres con
 * unidad y de aplanar la respuesta. Si un cálculo cambia, cambia en los dos lados
 * a la vez.
 *
 * Todo aquí es de solo lectura: no hay una sola ruta que escriba en la base.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { createCallerFactory } from "../_core/trpcNew";
import { appRouter } from "../routers";
import type { ApiKey, User } from "../../drizzle/schema";
import {
  checkRateLimit,
  consumirCuota,
  marcarUso,
  verifyApiKey,
  type MotivoRechazo,
} from "../apiKeys";
import { ApiError, responder, responderError } from "./util";
import { rutasCosecha } from "./cosecha";
import { rutasCampo } from "./campo";
import { rutasContexto } from "./contexto";
import { rutasMeta } from "./meta";

const crearCaller = createCallerFactory(appRouter);

export type Caller = ReturnType<typeof crearCaller>;

/** Lo que recibe cada manejador. `caller` es tRPC llamado desde dentro del proceso. */
export interface CtxApi {
  req: Request;
  res: Response;
  caller: Caller;
  key: ApiKey;
  user: User;
}

export interface ParametroDoc {
  nombre: string;
  tipo: "fecha" | "entero" | "texto" | "booleano" | "opcion";
  descripcion: string;
  obligatorio?: boolean;
  valores?: readonly string[];
  porDefecto?: string | number | boolean;
}

export interface DefinicionRuta {
  ruta: string;
  resumen: string;
  descripcion?: string;
  parametros?: ParametroDoc[];
  /**
   * Cuesta dinero: llama a DeepSeek o consume cuota satelital.
   * Puede ser una función cuando depende de la petición (ia=true en la URL):
   * cobrar cuota de IA a quien solo pidió las cifras sería mentirle al contador.
   */
  ia?: boolean | ((req: Request) => boolean);
  /** El manejador escribe la respuesta él mismo (NDJSON, descargas) */
  crudo?: boolean;
  ejemplo?: string;
  manejador: (ctx: CtxApi) => Promise<unknown>;
}

// ───────────────────────── autenticación ─────────────────────────

const MENSAJES: Record<MotivoRechazo, { estado: number; mensaje: string; ayuda: string }> = {
  sin_llave: {
    estado: 401,
    mensaje: "Falta la llave de API",
    ayuda: "Manda el encabezado X-API-Key: agt_live_… Se crea en Configuración → Llaves de API.",
  },
  formato: {
    estado: 401,
    mensaje: "La llave no tiene el formato esperado",
    ayuda: "Una llave válida empieza con agt_live_ — revisa que no se haya cortado al copiarla.",
  },
  desconocida: {
    estado: 401,
    mensaje: "Esa llave no existe",
    ayuda: "Verifica que la copiaste completa. Si la perdiste, hay que crear una nueva: no se puede recuperar.",
  },
  revocada: {
    estado: 401,
    mensaje: "Esa llave fue revocada",
    ayuda: "Pide una llave nueva en Configuración → Llaves de API.",
  },
  caducada: {
    estado: 401,
    mensaje: "Esa llave ya caducó",
    ayuda: "Pide una llave nueva o amplía su vigencia en Configuración → Llaves de API.",
  },
  sin_usuario: {
    estado: 403,
    mensaje: "El usuario dueño de la llave ya no existe",
    ayuda: "La cuenta a la que estaba ligada fue borrada. Hay que crear la llave otra vez.",
  },
};

/** Acepta X-API-Key, o Authorization: Bearer agt_live_… para clientes que solo saben mandar Bearer */
function leerLlave(req: Request): string | undefined {
  const cabecera = req.header("x-api-key");
  if (cabecera) return cabecera.trim();
  const auth = req.header("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return undefined;
}

// ───────────────────────── montaje ─────────────────────────

export function crearApiV1(): Router {
  const api = Router();
  const rutas: DefinicionRuta[] = [
    ...rutasMeta(() => rutas),
    ...rutasCosecha,
    ...rutasCampo,
    ...rutasContexto,
  ];

  // Estas dos no piden llave: son el mínimo para que alguien que apenas está
  // conectando sepa si el servidor vive y cómo autenticarse.
  api.get("/", (_req, res) => {
    res.json({
      ok: true,
      datos: {
        nombre: "API de Agra Tec-Ti",
        version: "v1",
        soloLectura: true,
        autenticacion: "Encabezado X-API-Key con una llave agt_live_…",
        empezarPor: {
          catalogo: "/api/v1/catalogo",
          diccionario: "/api/v1/diccionario",
          openapi: "/api/v1/openapi.json",
          contexto: "/api/v1/contexto",
        },
      },
      meta: { generado: new Date().toISOString() },
    });
  });

  api.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resultado = await verifyApiKey(leerLlave(req));
      if (!resultado.ok || !resultado.llave) {
        const m = MENSAJES[resultado.motivo ?? "desconocida"];
        return responderError(res, m.estado, {
          codigo: resultado.motivo ?? "desconocida",
          mensaje: m.mensaje,
          ayuda: m.ayuda,
        });
      }

      const { key, user } = resultado.llave;

      // Límite por minuto antes que cualquier consulta: es lo que protege al
      // MySQL de producción de un script con un bucle mal cerrado.
      const limite = checkRateLimit(key.id, key.rateLimitPerMin);
      if (!limite.permitido) {
        res.setHeader("Retry-After", String(limite.esperaSegundos));
        return responderError(res, 429, {
          codigo: "demasiadas_peticiones",
          mensaje: `Esta llave permite ${key.rateLimitPerMin} peticiones por minuto`,
          ayuda: `Espera ${limite.esperaSegundos} s. Si el análisis necesita más, sube el límite de la llave o usa /api/v1/exportar/cajas para bajar todo de una vez.`,
        });
      }

      (res.locals as any).apiKey = key;
      (res.locals as any).apiUser = user;
      marcarUso(key.id, req.ip);
      next();
    } catch (e: any) {
      responderError(res, 500, {
        codigo: "error_autenticacion",
        mensaje: e?.message || "No se pudo validar la llave",
      });
    }
  });

  for (const def of rutas) {
    api.get(def.ruta, (req, res) => atender(def, req, res));
  }

  // Cualquier otra cosa: decir qué existe, en vez de un 404 mudo
  api.use((req: Request, res: Response) => {
    responderError(res, 404, {
      codigo: "ruta_desconocida",
      mensaje: `No existe ${req.method} /api/v1${req.path}`,
      ayuda: "Consulta /api/v1/catalogo para ver la lista completa de endpoints.",
    });
  });

  return api;
}

async function atender(def: DefinicionRuta, req: Request, res: Response): Promise<void> {
  const key: ApiKey = (res.locals as any).apiKey;
  const user: User = (res.locals as any).apiUser;
  const cuestaIa = typeof def.ia === "function" ? def.ia(req) : !!def.ia;

  // Los endpoints que cuestan dinero exigen una llave que lo autorice
  if (cuestaIa && key.scope !== "lectura_ia") {
    await consumirCuota(key, { path: req.path, error: true });
    responderError(res, 403, {
      codigo: "alcance_insuficiente",
      mensaje: "Este endpoint llama a la IA y esta llave es de solo lectura",
      ayuda: 'Pide una llave con alcance "lectura_ia", o usa la versión sin IA del mismo endpoint (parámetro ia=false).',
    });
    return;
  }

  const cuota = await consumirCuota(key, { esIa: cuestaIa, path: req.path });
  if (!cuota.permitido) {
    responderError(res, 429, {
      codigo: cuota.motivo!,
      mensaje: cuota.motivo === "cuota_ia"
        ? `Esta llave ya usó sus ${key.dailyAiQuota} llamadas de IA de hoy`
        : `Esta llave ya usó sus ${key.dailyQuota} llamadas de hoy`,
      ayuda: "La cuota se reinicia a medianoche (hora de México). Si el trabajo lo amerita, súbela en Configuración → Llaves de API.",
    });
    return;
  }

  try {
    const caller = crearCaller({ req, res, user });
    const datos = await def.manejador({ req, res, caller, key, user });
    if (def.crudo || res.headersSent) return;
    responder(res, datos, {
      cuota: { usadasHoy: cuota.usadas, limiteDiario: key.dailyQuota },
    });
  } catch (e: any) {
    await consumirCuota(key, { path: req.path, error: true });

    if (e instanceof ApiError) {
      responderError(res, e.estado, { codigo: e.codigo, mensaje: e.message, ayuda: e.ayuda });
      return;
    }
    // Un error de tRPC trae su propio código; traducirlo evita devolver 500
    // por algo que en realidad fue un parámetro mal puesto.
    const codigoTrpc = e?.code || e?.data?.code;
    if (codigoTrpc === "NOT_FOUND") {
      responderError(res, 404, { codigo: "no_encontrado", mensaje: e.message });
      return;
    }
    if (codigoTrpc === "BAD_REQUEST" || codigoTrpc === "PARSE_ERROR") {
      responderError(res, 400, { codigo: "peticion_invalida", mensaje: e.message });
      return;
    }
    if (codigoTrpc === "FORBIDDEN" || codigoTrpc === "UNAUTHORIZED") {
      responderError(res, 403, {
        codigo: "sin_permiso",
        mensaje: "El usuario dueño de la llave no tiene permiso para este dato",
        ayuda: "Liga la llave a un usuario con acceso a esa sección.",
      });
      return;
    }

    console.error(`[API v1] ${req.path}:`, e?.message);
    responderError(res, 500, {
      codigo: "error_interno",
      mensaje: e?.message || "Error inesperado",
    });
  }
}
