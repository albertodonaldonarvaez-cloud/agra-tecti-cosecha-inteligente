/**
 * API del kiosco de báscula — /api/campo/v1
 *
 * Esta es la superficie que consume la app de Android: a diferencia de
 * /api/v1, que quedó de SOLO LECTURA para los agentes de IA, aquí sí se
 * escribe. Van aparte a propósito, porque tienen distinto público, distinta
 * autenticación y distintas garantías, y conviene que "nada de /api/v1
 * escribe en la base" siga siendo cierto.
 *
 * Autenticación: el MISMO token que ya usa la app de campo
 * (auth.loginMobile → Bearer). No hay nada nuevo que construir del lado del
 * servidor: el token de acceso dura 30 días y el de refresco 365, así que un
 * kiosco inicia sesión al empezar el ciclo y no vuelve a ver la pantalla de
 * login en toda la cosecha.
 *
 * Cada báscula tiene su propia cuenta, así que el usuario del token dice a la
 * vez qué báscula y qué operador hizo cada cosa. El encabezado X-Dispositivo
 * es opcional y sirve solo para notar si dos aparatos están usando la misma
 * cuenta.
 *
 * En esta fase están los endpoints de etiquetas. El pesaje entra en la fase 3.
 */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { getUserFromToken } from "../auth";
import { ApiError, responder, responderError, entero, texto, ZONA } from "../api/util";
import {
  ErrorEtiqueta,
  apartarFolios,
  cancelarLote,
  cicloDeHoy,
  ciclosParaImprimir,
  confirmarLote,
  etiquetasPendientes,
  expedienteEtiqueta,
  listarLotes,
  plantillaImpresion,
  reimprimirEtiqueta,
  resumenEtiquetas,
} from "../etiquetas";
import {
  CAJAS_POR_ENVIO,
  conflictosDePesaje,
  estadoDeCaja,
  guardarFotoCaja,
  recibirCajas,
  tiposDeCaja,
} from "../pesaje";
import type { User } from "../../drizzle/schema";

interface Peticion extends Request {
  usuario?: User;
  dispositivo?: string | null;
}

/**
 * De un rechazo del módulo de etiquetas al código HTTP que le toca.
 *
 * La diferencia importa: un 400 le dice al kiosco "corrige y vuelve a
 * mandar", y un 409 le dice "esto no depende de ti, avísale a alguien".
 * Reintentar un 409 en bucle no arregla nada y llena la base de intentos.
 */
const ESTADOS: Record<string, number> = {
  sin_base: 503,
  sin_ciclo_abierto: 409,
  lote_cancelado: 409,
  estado_no_permite: 409,
  folio_agotado: 409,
  etiqueta_desconocida: 404,
  lote_desconocido: 404,
  // Pesaje. Casi todo aquí es 400 —el kiosco corrige y vuelve a mandar—
  // incluido un ciclo que no existe, igual que en etiquetas. El único aparte
  // es la tanda demasiado grande: no hay nada que corregir en los datos, hay
  // que partirla, y 413 es lo que dice eso sin ambigüedad.
  envio_vacio: 400,
  envio_muy_grande: 413,
  // Foto de la caja: sin caja no hay dónde colgarla.
  caja_desconocida: 404,
};

/** Fotos de caja: llegan como multipart (campo "foto") a un temporal, y de ahí se comprimen. */
const subidaFoto = multer({ dest: "/tmp/uploads/", limits: { fileSize: 15 * 1024 * 1024 } });

/** Envuelve un manejador: traduce errores y da la misma forma a toda respuesta. */
function atender(fn: (req: Peticion, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      const datos = await fn(req as Peticion, res);
      if (res.headersSent) return;
      responder(res, datos, { dispositivo: (req as Peticion).dispositivo ?? null });
    } catch (e) {
      if (e instanceof ErrorEtiqueta) {
        return responderError(res, ESTADOS[e.codigo] ?? 400, {
          codigo: e.codigo,
          mensaje: e.message,
          ayuda: e.ayuda,
        });
      }
      if (e instanceof ApiError) {
        return responderError(res, e.estado, {
          codigo: e.codigo,
          mensaje: e.message,
          ayuda: e.ayuda,
        });
      }
      console.error("[Kiosco] Error no previsto:", e);
      return responderError(res, 500, {
        codigo: "error_interno",
        mensaje: "Algo falló en el servidor",
        ayuda: "Reintenta en un momento. Si sigue, avisa a quien opere el sistema.",
      });
    }
  };
}

/** Bearer o cookie, más las dos revisiones que protegen la operación. */
async function autenticar(req: Peticion, res: Response, siguiente: () => void) {
  let token: string | undefined = req.cookies?.auth_token;
  const cabecera = req.headers.authorization;
  if (!token && cabecera?.startsWith("Bearer ")) token = cabecera.slice(7);

  if (!token) {
    return responderError(res, 401, {
      codigo: "sin_sesion",
      mensaje: "Falta el token de la sesión",
      ayuda: "Manda el encabezado Authorization: Bearer <token>. El token sale de auth.loginMobile.",
    });
  }

  const usuario = await getUserFromToken(token);
  if (!usuario) {
    return responderError(res, 401, {
      codigo: "sesion_invalida",
      mensaje: "El token no es válido o ya caducó",
      ayuda: "Renueva la sesión con auth.refreshMobile, o vuelve a iniciar sesión.",
    });
  }

  // Es lo que permite apagar una báscula perdida sin borrar al usuario ni
  // arrastrar el rastro de todo lo que capturó.
  if (usuario.isActive === false) {
    return responderError(res, 403, {
      codigo: "cuenta_desactivada",
      mensaje: "Esta cuenta está desactivada",
      ayuda: "Pide que la reactiven en Configuración → Usuarios.",
    });
  }

  req.usuario = usuario;
  const dispositivo = req.headers["x-dispositivo"];
  req.dispositivo = typeof dispositivo === "string" ? dispositivo.slice(0, 64) : null;
  siguiente();
}

/** Imprimir reutiliza el permiso que ya existe para la pantalla de etiquetas. */
function exigirPermisoEtiquetas(req: Peticion, res: Response, siguiente: () => void) {
  const u = req.usuario!;
  if (u.role === "admin" || u.canViewLabels) return siguiente();
  return responderError(res, 403, {
    codigo: "sin_permiso",
    mensaje: "Esta cuenta no tiene permiso para imprimir etiquetas",
    ayuda: "Actívale “Etiquetas” en Configuración → Usuarios.",
  });
}

/**
 * Pesar tiene su propio permiso, y nace apagado.
 *
 * Imprimir de más cuesta papel. Pesar de más mete cajas en la cosecha, que es
 * el dato del que cuelga todo lo demás, así que no se hereda de "Etiquetas":
 * hay que encenderlo a propósito para la cuenta de cada báscula.
 */
function exigirPermisoPesaje(req: Peticion, res: Response, siguiente: () => void) {
  const u = req.usuario!;
  if (u.role === "admin" || u.canWeighBoxes) return siguiente();
  return responderError(res, 403, {
    codigo: "sin_permiso",
    mensaje: "Esta cuenta no tiene permiso para pesar cajas",
    ayuda: "Actívale “Pesar cajas” en Configuración → Usuarios.",
  });
}

// ─────────────────────── lectura del cuerpo ───────────────────────

function campoEntero(req: Peticion, nombre: string, min: number, max: number): number {
  const valor = (req.body ?? {})[nombre];
  const n = Number(valor);
  if (valor === undefined || valor === null || valor === "" || !Number.isInteger(n)) {
    throw new ApiError(400, `${nombre}_invalido`, `Falta "${nombre}" o no es un número entero`,
      `Manda "${nombre}" como número entre ${min} y ${max}.`);
  }
  if (n < min || n > max) {
    throw new ApiError(400, `${nombre}_fuera_de_rango`, `"${nombre}" vale ${n} y debe estar entre ${min} y ${max}`);
  }
  return n;
}

/** Un entero del cuerpo que puede no venir. Sin valor por omisión: quien no lo
 *  manda está diciendo "el ciclo de hoy", que no es lo mismo que "el ciclo 0". */
function campoEnteroOpcional(req: Peticion, nombre: string): number | undefined {
  const valor = (req.body ?? {})[nombre];
  if (valor === undefined || valor === null || valor === "") return undefined;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) {
    throw new ApiError(400, `${nombre}_invalido`, `"${nombre}" debe ser el id de un ciclo`,
      "Consulta GET /api/campo/v1/ciclos para ver los ids.");
  }
  return n;
}

function campoTexto(req: Peticion, nombre: string, maxLargo: number, obligatorio = false): string | undefined {
  const valor = (req.body ?? {})[nombre];
  if (valor === undefined || valor === null || valor === "") {
    if (obligatorio) {
      throw new ApiError(400, `${nombre}_requerido`, `Falta "${nombre}"`);
    }
    return undefined;
  }
  return String(valor).slice(0, maxLargo);
}

export function crearApiCampo(): Router {
  const api = Router();

  // La portada no pide sesión: es lo que se lee para saber cómo entrar.
  api.get("/", (_req, res) => {
    responder(res, {
      api: "Agra Tec-Ti · Kiosco de báscula",
      version: "v1",
      autenticacion: "Authorization: Bearer <token de auth.loginMobile>",
      dispositivo: "Encabezado opcional X-Dispositivo con el identificador del aparato",
      zonaHoraria: ZONA,
      enEstaFase: [
        "Etiquetas: apartar folios, confirmar, cancelar, reimprimir y consultar",
        "Pesaje: recibir cajas pesadas por tandas, con tara y sin perder nada por falta de señal",
        "Foto de la caja: POST /cosecha/cajas/foto (multipart, campo \"foto\" + clientUuid)",
      ],
      proximaFase: "Ninguna pendiente",
      nota: "El folio lo reparte el servidor y se reinicia en cada ciclo. Nunca mandes un folio: pide cuántos necesitas.",
      notaPesaje: "El peso viaja en gramos enteros y cada caja lleva su clientUuid. Reenviar la misma tanda no duplica nada.",
    });
  });

  api.use(autenticar as any);

  api.get("/ciclos/actual", atender(async () => {
    const ciclo = await cicloDeHoy();
    if (!ciclo) {
      return { abierto: false, aviso: "Hoy no cae dentro de ningún ciclo. No se pueden repartir folios." };
    }
    const resumen = await resumenEtiquetas(ciclo.id);
    return { abierto: true, ciclo, etiquetas: resumen };
  }));

  api.get("/ciclos", atender(async () => ({
    ciclos: await ciclosParaImprimir(),
    nota: "Por omisión se aparta para el ciclo marcado con esElDeHoy. Manda \"ciclo\" solo si de verdad quieres otro: la caja se busca por (ciclo, código), así que una etiqueta del ciclo equivocado no encuentra su caja.",
  })));

  api.get("/impresion/plantilla", atender(async () => plantillaImpresion()));

  // ── Etiquetas ────────────────────────────────────────────────
  //
  // El ORDEN de aquí abajo importa: las rutas fijas van antes que /:codigo.
  // Al revés, Express tomaría "pendientes" como si fuera un código de caja y
  // el endpoint de merma contestaría "no existe la etiqueta pendientes".

  api.post("/etiquetas/lotes", exigirPermisoEtiquetas as any, atender(async (req) => {
    const lote = await apartarFolios({
      cortadora: campoEntero(req, "cortadora", 1, 99),
      cantidad: campoEntero(req, "cantidad", 1, 5000),
      texto: campoTexto(req, "texto", 255, true)!,
      cicloId: campoEnteroOpcional(req, "ciclo"),
      usuarioId: req.usuario!.id,
      deviceId: req.dispositivo,
      clientUuid: campoTexto(req, "clientUuid", 64),
    });
    return {
      ...lote,
      siguientePaso: lote.yaExistia
        ? "Este lote ya se había apartado: es el mismo rango, no se pidió de más."
        : `Imprime y luego confirma con POST /api/campo/v1/etiquetas/lotes/${lote.loteId}/confirmar. Si la impresora falla, cancélalo.`,
    };
  }));

  api.post("/etiquetas/lotes/:id/confirmar", exigirPermisoEtiquetas as any, atender(async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new ApiError(400, "lote_invalido", "El lote debe ser un número");
    return await confirmarLote(id);
  }));

  api.post("/etiquetas/lotes/:id/cancelar", exigirPermisoEtiquetas as any, atender(async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new ApiError(400, "lote_invalido", "El lote debe ser un número");
    const resultado = await cancelarLote(id, campoTexto(req, "motivo", 255));
    return {
      ...resultado,
      nota: "Esos folios quedaron quemados. No se reutilizan: reutilizarlos es como salen dos etiquetas físicas iguales.",
    };
  }));

  api.post("/etiquetas/reimprimir", exigirPermisoEtiquetas as any, atender(async (req) => {
    return await reimprimirEtiqueta({
      codigo: campoTexto(req, "codigo", 64, true)!,
      motivo: campoTexto(req, "motivo", 255),
      cicloId: campoEnteroOpcional(req, "ciclo"),
      usuarioId: req.usuario!.id,
      deviceId: req.dispositivo,
      clientUuid: campoTexto(req, "clientUuid", 64),
    });
  }));

  api.get("/etiquetas/lotes", atender(async (req) => ({
    lotes: await listarLotes({
      cicloId: entero(req, "ciclo", { min: 1, max: 2_000_000_000 }),
      cortadora: entero(req, "cortadora", { min: 1, max: 99 }),
      desde: texto(req, "desde", 10),
      hasta: texto(req, "hasta", 10),
      limite: entero(req, "limite", { min: 1, max: 200 }) ?? 50,
    }),
  })));

  api.get("/etiquetas/pendientes", atender(async (req) => {
    const resultado = await etiquetasPendientes({
      cicloId: entero(req, "ciclo", { min: 1, max: 2_000_000_000 }),
      cortadora: entero(req, "cortadora", { min: 1, max: 99 }),
      limite: entero(req, "limite", { min: 1, max: 200 }),
    });
    return {
      ...resultado,
      significado: "Etiquetas impresas que todavía no regresan con una caja pesada.",
    };
  }));

  api.get("/etiquetas/resumen", atender(async (req) =>
    await resumenEtiquetas(entero(req, "ciclo", { min: 1, max: 2_000_000_000 }))
  ));

  // Esta va al final: cualquier cosa que no haya coincidido arriba se trata
  // como un código de caja.
  api.get("/etiquetas/:codigo", atender(async (req) =>
    await expedienteEtiqueta(req.params.codigo, entero(req, "ciclo", { min: 1, max: 2_000_000_000 }))
  ));

  // ── Pesaje ───────────────────────────────────────────────────
  //
  // El kiosco pesa sin señal y vacía su cola aquí cuando vuelve la red. Por eso
  // el envío es por tandas y cada caja lleva su clientUuid: reenviar la misma
  // tanda tiene que dar el mismo resultado, no cajas repetidas.
  //
  // Lo que llega con algo raro (peso alto, código repetido, sin etiqueta) SE
  // GUARDA y se contesta marcado. Un peso ya ocurrió: rechazarlo borra una
  // medición del mundo real y deja a la báscula reintentando para siempre.

  api.post("/cosecha/cajas", exigirPermisoPesaje as any, atender(async (req) => {
    const cuerpo = req.body ?? {};
    const cajas = Array.isArray(cuerpo.cajas) ? cuerpo.cajas : null;
    if (!cajas) {
      throw new ApiError(400, "cajas_requerido", 'Falta el arreglo "cajas"',
        `Manda {"cajas": [{...}]} con hasta ${CAJAS_POR_ENVIO} pesajes.`);
    }
    const resumen = await recibirCajas({
      cajas,
      usuarioId: req.usuario!.id,
      deviceId: req.dispositivo ?? null,
    });
    return {
      ...resumen,
      siguientePaso: resumen.rechazadas > 0
        ? "Las rechazadas NO se guardaron: consérvalas en la tableta. Cada una dice en su error qué corregir."
        : "Todo lo que se mandó quedó guardado. Las que traen avisos sí entraron, solo hay que revisarlas.",
      nota: "Reenviar la misma tanda es inofensivo: las que ya estaban contestan “duplicada” con el id de su caja.",
    };
  }));

  api.get("/cosecha/tipos-de-caja", atender(async () => tiposDeCaja()));

  api.get("/cosecha/conflictos", atender(async (req) => await conflictosDePesaje({
    cicloId: entero(req, "ciclo", { min: 1, max: 2_000_000_000 }),
    limite: entero(req, "limite", { min: 1, max: 200 }),
  })));

  // Al final del bloque, por lo mismo que en etiquetas: lo que no coincidió
  // arriba se trata como un código de caja.
  // La foto viaja aparte de la caja: multipart con el campo "foto" y el
  // clientUuid con el que se guardó el pesaje. Va antes de /:codigo por lo
  // mismo que en etiquetas: "foto" no es un código de caja.
  api.post(
    "/cosecha/cajas/foto",
    exigirPermisoPesaje as any,
    (req: Request, res: Response, siguiente: () => void) => {
      subidaFoto.single("foto")(req, res, (err: any) => {
        if (!err) return siguiente();
        responderError(res, 400, {
          codigo: "foto_invalida",
          mensaje: err.code === "LIMIT_FILE_SIZE" ? "La foto pesa más de 15 MB" : `No se pudo leer la foto: ${err.message}`,
          ayuda: "Manda un multipart/form-data con el archivo en el campo \"foto\" (JPEG) y el clientUuid de la caja.",
        });
      });
    },
    atender(async (req) => {
      const archivo = (req as any).file as { path: string } | undefined;
      if (!archivo) {
        throw new ApiError(400, "foto_requerida", "No se recibió ninguna foto",
          "El archivo va en el campo \"foto\" del multipart/form-data.");
      }
      const resultado = await guardarFotoCaja({
        clientUuid: (req.body ?? {}).clientUuid,
        archivoTemporal: archivo.path,
        usuarioId: req.usuario!.id,
      });
      return {
        ...resultado,
        nota: resultado.reemplazo
          ? "La caja ya tenía foto; se reemplazó con esta."
          : "Foto guardada. Ya se ve en la pantalla de cajas.",
      };
    }),
  );

  api.get("/cosecha/cajas/:codigo", atender(async (req) =>
    await estadoDeCaja(req.params.codigo, entero(req, "ciclo", { min: 1, max: 2_000_000_000 }))
  ));

  api.use((req, res) => {
    responderError(res, 404, {
      codigo: "ruta_desconocida",
      mensaje: `No existe ${req.method} ${req.path} en el kiosco`,
      ayuda: "Consulta GET /api/campo/v1/ para ver qué hay en esta fase.",
    });
  });

  return api;
}
