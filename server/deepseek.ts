// ============================================================
// DeepSeek: el único lugar que le habla a la API
//
// Antes cada análisis armaba su propia llamada —el resumen semanal, el de la
// parcela, el reporte general y el de actividades— con el modelo escrito a
// mano en cuatro lados. Cuando DeepSeek cambió sus modelos, "deepseek-v4-flash"
// dejó de existir como tal (ahora la API lo redirige a "deepseek-flash") y no
// había un solo lugar donde corregirlo.
//
// Aquí vive todo lo que tienen en común:
//   · qué modelo se usa y cuál entra de respaldo si ese falla;
//   · la clave guardada en Ajustes y el porqué cuando no sirve;
//   · el presupuesto de tokens (el modelo razona antes de responder y eso
//     también se cobra del límite: con poco espacio devuelve texto vacío);
//   · los errores de la API en palabras que se puedan mostrar en pantalla;
//   · la limpieza del texto, para que todos los análisis lleguen con el
//     mismo formato (ver shared/textoIA.ts).
// ============================================================

import { limpiarTextoIA } from "../shared/textoIA";

/**
 * El modelo de los análisis.
 *
 * V4-Pro es el que razona mejor: cruza el NDVI con la libreta, el clima y la
 * cosecha en lugar de repetir los datos. Es más lento y más caro por token que
 * Flash, pero aquí se llama pocas veces al día y lo que importa es que el
 * diagnóstico sea correcto.
 */
export const MODELO_IA = "deepseek-v4-pro";

/**
 * Si Pro falla —se cae, tarda demasiado, o DeepSeek lo vuelve a renombrar—
 * se intenta una vez con Flash antes de rendirse. Un análisis un poco menos
 * fino es mejor que una pantalla diciendo que no hubo análisis.
 */
export const MODELO_RESPALDO = "deepseek-flash";

const URL_DEEPSEEK = "https://api.deepseek.com/chat/completions";

/**
 * Presupuesto de tokens por respuesta.
 *
 * Con un prompt de unas líneas, Pro ya razona ~1,600 tokens antes de escribir;
 * con el detalle completo de un mes de libreta razona varias veces eso. Solo se
 * cobra lo que de verdad se usa, así que el tope alto no encarece nada: nada
 * más evita que la respuesta llegue vacía o cortada a media frase.
 */
const MAX_TOKENS_POR_DEFECTO = 16000;

/**
 * Tiempos de espera. El proxy de producción corta a los 300 s: Pro más el
 * respaldo tienen que caber holgados dentro de eso.
 */
const ESPERA_PRINCIPAL_MS = 150_000;
const ESPERA_RESPALDO_MS = 90_000;

/** Quién es el modelo en todos los análisis. Cada uno agrega su tarea. */
export const SISTEMA_AGRONOMO =
  "Eres un ingeniero agrónomo senior especializado en higo (Ficus carica) cultivado en México, " +
  "con experiencia en huertas comerciales, agricultura de precisión y teledetección satelital. " +
  "Trabajas SOLO con los datos que se te dan: cada cifra, fecha, parcela o producto que menciones " +
  "debe aparecer en ellos; si falta información para concluir algo, lo dices en lugar de suponer. " +
  "Razonas antes de concluir: relacionas causa y efecto entre clima, labores, vigor y cosecha, y " +
  "distingues lo que es normal para la etapa del cultivo de lo que de verdad es un problema. " +
  "Escribes en español de México, directo y profesional, sin saludos ni despedidas.";

/**
 * Las reglas de formato para los análisis en prosa.
 *
 * Son las mismas que entiende `limpiarTextoIA` y que dibujan la pantalla, el
 * reporte impreso y Telegram. Pedirlas explícitamente hace que el modelo no
 * invente su propio estilo cada vez; la limpieza queda como red de seguridad.
 */
export const FORMATO_TEXTO = `FORMATO DE LA RESPUESTA (obligatorio, se muestra tal cual en la aplicación):
- Organiza el texto en secciones cortas. Cada título va solo en su renglón y empieza con "### ".
- Para enumerar usa viñetas que empiecen con "- " (una idea por viñeta), o "1. " cuando el orden importa.
- Usa **negritas** con mucha moderación: como máximo 4 en toda la respuesta, solo para lo decisivo (la parcela o zona con problema, la cifra que más importa). Nunca para todas las cifras ni para frases completas.
- No uses tablas, emojis, bloques de código, líneas separadoras, HTML ni títulos con "#" o "##".
- Empieza directo con la primera sección: sin introducción, sin "Claro", sin despedida.
- Escribe las cifras con su unidad (kg, mm, °C, h, %) y las fechas como "21 de octubre".`;

export interface ClaveIA {
  key: string | null;
  /** Por qué no hay clave utilizable, en palabras que se pueden mostrar */
  motivo?: string;
}

/**
 * Clave de DeepSeek guardada en Ajustes.
 *
 * Devuelve también el motivo cuando no se puede usar. Antes cualquier tropiezo
 * terminaba en "null" y la pantalla decía que faltaba configurar la clave,
 * aunque la clave estuviera guardada y el problema fuera otro: por ejemplo que
 * se cifró con un JWT_SECRET distinto al actual y ya no se puede descifrar.
 */
export async function claveDeDeepSeek(): Promise<ClaveIA> {
  let guardada: string | null = null;
  try {
    const { getGlobalSetting } = await import("./globalSettings");
    guardada = await getGlobalSetting("deepseekApiKey");
  } catch (error: any) {
    return { key: null, motivo: `No se pudo leer la configuración: ${error?.message || error}` };
  }

  if (!guardada || guardada.trim() === "") {
    return { key: null, motivo: "No hay clave de DeepSeek guardada en Ajustes → IA" };
  }

  try {
    const { decryptSecret, isEncrypted } = await import("./encryption");
    // Si esto truena, mandar el texto cifrado como clave solo produce un 401
    // incomprensible: es mejor decirlo aquí
    return { key: isEncrypted(guardada) ? decryptSecret(guardada) : guardada.trim() };
  } catch {
    return {
      key: null,
      motivo: "La clave guardada no se pudo descifrar (¿cambió JWT_SECRET?). Vuelve a guardarla en Ajustes → IA.",
    };
  }
}

export interface PeticionIA {
  /** Prefijo de los mensajes en el log, p. ej. "[IA Parcela]" */
  etiqueta: string;
  /** Instrucciones de sistema; por defecto SISTEMA_AGRONOMO */
  sistema?: string;
  prompt: string;
  /** Pide un objeto JSON (y no limpia el texto como prosa) */
  json?: boolean;
  maxTokens?: number;
  temperatura?: number;
}

export type RespuestaIA =
  | { ok: true; texto: string; modelo: string }
  | { ok: false; sinClave: boolean; detalle: string };

type Intento =
  | { ok: true; texto: string; modelo: string }
  | { ok: false; detalle: string; reintentable: boolean };

/** Lo de afuera que se puede cambiar en las pruebas */
export interface DependenciasIA {
  fetch: typeof fetch;
  clave: () => Promise<ClaveIA>;
}

const DEPENDENCIAS: DependenciasIA = {
  fetch: (...args) => fetch(...args),
  clave: claveDeDeepSeek,
};

/** El error de la API en palabras, y si vale la pena probar con el respaldo */
export function explicarError(status: number, cuerpo: string): { detalle: string; reintentable: boolean } {
  let mensaje = "";
  try { mensaje = JSON.parse(cuerpo)?.error?.message ?? ""; } catch { /* cuerpo que no es JSON */ }
  const corto = (mensaje || cuerpo).replace(/\s+/g, " ").replace(/\(request_id:[^)]*\)/i, "").trim().slice(0, 180);

  if (status === 401) {
    return { detalle: "DeepSeek rechazó la clave (401). Vuelve a guardarla en Ajustes → IA.", reintentable: false };
  }
  if (status === 402) {
    return { detalle: "La cuenta de DeepSeek se quedó sin saldo (402). Recárgala en platform.deepseek.com.", reintentable: false };
  }
  if (status === 429) {
    return { detalle: "DeepSeek está limitando las peticiones (429). Intenta de nuevo en unos minutos.", reintentable: true };
  }
  if (status >= 500) {
    return { detalle: `DeepSeek tuvo una falla de su lado (${status}).`, reintentable: true };
  }
  // Un 400 por el modelo es justo el caso de un modelo renombrado o retirado
  if (status === 400 && /model/i.test(corto)) {
    return { detalle: `DeepSeek no reconoce el modelo: ${corto}`, reintentable: true };
  }
  return { detalle: `DeepSeek respondió ${status}${corto ? `: ${corto}` : ""}`, reintentable: false };
}

async function intentar(
  modelo: string,
  p: PeticionIA,
  clave: string,
  esperaMs: number,
  deps: DependenciasIA,
): Promise<Intento> {
  const inicio = Date.now();
  let respuesta: Response;
  try {
    respuesta = await deps.fetch(URL_DEEPSEEK, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` },
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: "system", content: p.sistema ?? SISTEMA_AGRONOMO },
          { role: "user", content: p.prompt },
        ],
        max_tokens: p.maxTokens ?? MAX_TOKENS_POR_DEFECTO,
        temperature: p.temperatura ?? 0.3,
        ...(p.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(esperaMs),
    });
  } catch (error: any) {
    const tiempo = error?.name === "TimeoutError" || error?.name === "AbortError";
    return {
      ok: false,
      detalle: tiempo
        ? `DeepSeek tardó más de ${Math.round(esperaMs / 1000)} s en responder.`
        : `No se pudo contactar a DeepSeek (${String(error?.message || error).slice(0, 120)}).`,
      reintentable: true,
    };
  }

  if (!respuesta.ok) {
    const cuerpo = await respuesta.text().catch(() => "");
    console.error(`${p.etiqueta} ${modelo} HTTP ${respuesta.status}: ${cuerpo.slice(0, 300)}`);
    return { ok: false, ...explicarError(respuesta.status, cuerpo) };
  }

  let datos: any;
  try {
    datos = await respuesta.json();
  } catch {
    return { ok: false, detalle: "DeepSeek mandó una respuesta ilegible.", reintentable: true };
  }

  const eleccion = datos?.choices?.[0];
  const crudo: string = typeof eleccion?.message?.content === "string" ? eleccion.message.content : "";
  const texto = p.json ? crudo.trim() : limpiarTextoIA(crudo);
  const uso = datos?.usage;
  const razonando = uso?.completion_tokens_details?.reasoning_tokens;
  console.log(
    `${p.etiqueta} ${datos?.model || modelo}: ${uso?.completion_tokens ?? "?"} tokens` +
    `${razonando ? ` (${razonando} razonando)` : ""} en ${Math.round((Date.now() - inicio) / 1000)} s`,
  );

  if (!texto) {
    // Sin texto casi siempre es que el razonamiento se comió el presupuesto
    const porLimite = eleccion?.finish_reason === "length";
    return {
      ok: false,
      detalle: porLimite
        ? "La IA se quedó sin espacio para responder (el razonamiento agotó el presupuesto)."
        : `La IA devolvió una respuesta vacía (${eleccion?.finish_reason || "sin motivo"}).`,
      reintentable: true,
    };
  }

  return { ok: true, texto, modelo: datos?.model || modelo };
}

/**
 * Le pide algo a DeepSeek con el modelo principal y, si falla de una forma que
 * otro modelo podría resolver, una vez con el de respaldo.
 *
 * Nunca lanza: devuelve el texto o el motivo del fallo, para que cada pantalla
 * pueda decir qué pasó en vez de un error genérico.
 */
export async function pedirADeepSeek(p: PeticionIA, deps: DependenciasIA = DEPENDENCIAS): Promise<RespuestaIA> {
  const { key, motivo } = await deps.clave();
  if (!key) {
    console.log(`${p.etiqueta} Sin análisis de IA: ${motivo}`);
    return { ok: false, sinClave: true, detalle: motivo || "No hay clave de DeepSeek configurada" };
  }

  const principal = await intentar(MODELO_IA, p, key, ESPERA_PRINCIPAL_MS, deps);
  if (principal.ok) return principal;

  if (!principal.reintentable) {
    return { ok: false, sinClave: false, detalle: principal.detalle };
  }

  console.warn(`${p.etiqueta} ${MODELO_IA} falló (${principal.detalle}); se intenta con ${MODELO_RESPALDO}`);
  const respaldo = await intentar(MODELO_RESPALDO, p, key, ESPERA_RESPALDO_MS, deps);
  if (respaldo.ok) return respaldo;

  return {
    ok: false,
    sinClave: false,
    detalle: `${principal.detalle} El modelo de respaldo tampoco respondió: ${respaldo.detalle}`,
  };
}
