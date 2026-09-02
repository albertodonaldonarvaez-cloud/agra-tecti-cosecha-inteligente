/**
 * Llaves de API para agentes y scripts.
 *
 * La API pública (/api/v1) no la consume una persona frente a una pantalla: la
 * consumen scripts de Python y agentes de IA. Antes la única forma de entrar era
 * con el correo y la contraseña de un administrador, que trae permiso de borrar
 * cajas y usuarios, no caduca, y para quitársela a un bot había que cambiarle la
 * contraseña a la persona.
 *
 * Una llave arregla las tres cosas: nace acotada, se revoca sola y se audita
 * aparte. Y como la API sale a internet, cada llave trae sus propios topes: sin
 * ellos, un script con un bucle mal cerrado vacía la cuota de DeepSeek en una
 * tarde y la factura llega a fin de mes.
 *
 * La llave completa se muestra UNA sola vez, al crearla. Aquí solo vive su hash.
 */
import crypto from "crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "./db";
import { apiKeys, apiKeyUsage, users } from "../drizzle/schema";
import type { ApiKey, User } from "../drizzle/schema";

export const KEY_PREFIX = "agt_live_";

/** Fecha local de México "YYYY-MM-DD" (el negocio y las cuotas operan en ese día) */
export function todayMx(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

// ───────────────────────── formato de la llave ─────────────────────────

/**
 * Genera una llave nueva.
 * `plain` es lo único que sirve para autenticar y lo único que no se guarda.
 */
export function generateKey(): { plain: string; hash: string; prefix: string } {
  const secreto = crypto.randomBytes(24).toString("base64url"); // 32 caracteres
  const plain = `${KEY_PREFIX}${secreto}`;
  return { plain, hash: hashKey(plain), prefix: plain.slice(0, 17) };
}

export function hashKey(plain: string): string {
  return crypto.createHash("sha256").update(plain.trim(), "utf8").digest("hex");
}

/** Descarta lo que ni siquiera tiene forma de llave, antes de tocar la base */
export function looksLikeKey(value: unknown): value is string {
  return typeof value === "string"
    && value.startsWith(KEY_PREFIX)
    && value.trim().length >= KEY_PREFIX.length + 20;
}

/** Para mostrarla en pantalla sin revelarla: agt_live_a1b2c3d4…4f9e */
export function maskKey(prefix: string): string {
  return `${prefix}…`;
}

// ───────────────────────── límite de peticiones ─────────────────────────

/**
 * Cubeta de fichas, una por llave, en memoria del proceso.
 *
 * Se eligió cubeta y no "contador por minuto" porque el contador deja pasar el
 * doble del límite en el cambio de minuto: 60 peticiones en el segundo 59 y otras
 * 60 en el 61. La cubeta reparte las fichas de forma pareja y aun así deja pasar
 * una ráfaga corta, que es lo normal cuando un script arranca.
 */
export interface Cubeta {
  fichas: number;
  ultimo: number; // epoch ms
}

const cubetas = new Map<number, Cubeta>();

/**
 * Consume una ficha. Devuelve si se permite la petición y en cuántos segundos
 * habrá otra disponible (para el encabezado Retry-After).
 *
 * Es función pura sobre `cubeta`: recibe el reloj para poder probarse.
 */
export function consumirFicha(
  cubeta: Cubeta | undefined,
  porMinuto: number,
  ahora: number,
): { permitido: boolean; cubeta: Cubeta; esperaSegundos: number } {
  const capacidad = Math.max(1, porMinuto);
  const porSegundo = capacidad / 60;

  let estado: Cubeta = cubeta ?? { fichas: capacidad, ultimo: ahora };

  // Rellenar por el tiempo transcurrido, sin pasar de la capacidad
  const transcurrido = Math.max(0, ahora - estado.ultimo) / 1000;
  const fichas = Math.min(capacidad, estado.fichas + transcurrido * porSegundo);

  if (fichas >= 1) {
    return {
      permitido: true,
      cubeta: { fichas: fichas - 1, ultimo: ahora },
      esperaSegundos: 0,
    };
  }

  // Sin fichas: decir cuándo habrá una, en vez de solo negar
  const espera = Math.ceil((1 - fichas) / porSegundo);
  return {
    permitido: false,
    cubeta: { fichas, ultimo: ahora },
    esperaSegundos: Math.max(1, espera),
  };
}

export function checkRateLimit(keyId: number, porMinuto: number): { permitido: boolean; esperaSegundos: number } {
  const r = consumirFicha(cubetas.get(keyId), porMinuto, Date.now());
  cubetas.set(keyId, r.cubeta);
  return { permitido: r.permitido, esperaSegundos: r.esperaSegundos };
}

/** Solo para las pruebas: olvida el estado acumulado */
export function resetRateLimits(): void {
  cubetas.clear();
}

// ───────────────────────── verificación ─────────────────────────

export type MotivoRechazo =
  | "sin_llave"
  | "formato"
  | "desconocida"
  | "revocada"
  | "caducada"
  | "sin_usuario";

export interface LlaveVerificada {
  key: ApiKey;
  user: User;
}

export interface ResultadoVerificacion {
  ok: boolean;
  llave?: LlaveVerificada;
  motivo?: MotivoRechazo;
}

/**
 * Resuelve una llave en texto plano a la llave guardada y al usuario en cuyo
 * nombre actúa. Distingue el motivo del rechazo porque "tu llave caducó" y
 * "esa llave no existe" mandan al agente a lugares muy distintos.
 */
export async function verifyApiKey(plain: string | undefined): Promise<ResultadoVerificacion> {
  if (!plain) return { ok: false, motivo: "sin_llave" };
  if (!looksLikeKey(plain)) return { ok: false, motivo: "formato" };

  const db = await getDb();
  if (!db) return { ok: false, motivo: "desconocida" };

  const filas = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashKey(plain)))
    .limit(1);

  const key = filas[0];
  if (!key) return { ok: false, motivo: "desconocida" };
  if (key.revokedAt) return { ok: false, motivo: "revocada" };
  if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) {
    return { ok: false, motivo: "caducada" };
  }

  const usuarios = await db.select().from(users).where(eq(users.id, key.userId)).limit(1);
  const user = usuarios[0];
  if (!user) return { ok: false, motivo: "sin_usuario" };

  return { ok: true, llave: { key, user } };
}

// ───────────────────────── cuota diaria ─────────────────────────

export interface ResultadoCuota {
  permitido: boolean;
  motivo?: "cuota_diaria" | "cuota_ia";
  usadas: number;
  usadasIa: number;
}

/**
 * Suma una petición al consumo del día y dice si todavía cabe.
 *
 * El INSERT ... ON DUPLICATE KEY UPDATE deja la suma en la base, que es la única
 * forma de que el conteo sobreviva a un reinicio del contenedor; un contador en
 * memoria se reinicia con él y la cuota deja de existir justo cuando más falta hace.
 */
export async function consumirCuota(
  key: ApiKey,
  opciones: { esIa?: boolean; path?: string; error?: boolean } = {},
): Promise<ResultadoCuota> {
  const db = await getDb();
  if (!db) return { permitido: true, usadas: 0, usadasIa: 0 };

  const dia = todayMx();
  const ia = opciones.esIa ? 1 : 0;
  const err = opciones.error ? 1 : 0;
  const path = (opciones.path || "").slice(0, 255);

  await db.execute(sql`
    INSERT INTO apiKeyUsage (keyId, day, calls, aiCalls, errors, lastPath)
    VALUES (${key.id}, ${dia}, 1, ${ia}, ${err}, ${path})
    ON DUPLICATE KEY UPDATE
      calls = calls + 1,
      aiCalls = aiCalls + ${ia},
      errors = errors + ${err},
      lastPath = ${path}
  `);

  const filas = await db
    .select({ calls: apiKeyUsage.calls, aiCalls: apiKeyUsage.aiCalls })
    .from(apiKeyUsage)
    .where(and(eq(apiKeyUsage.keyId, key.id), eq(apiKeyUsage.day, dia)))
    .limit(1);

  const usadas = Number(filas[0]?.calls ?? 0);
  const usadasIa = Number(filas[0]?.aiCalls ?? 0);

  if (usadas > key.dailyQuota) {
    return { permitido: false, motivo: "cuota_diaria", usadas, usadasIa };
  }
  if (opciones.esIa && usadasIa > key.dailyAiQuota) {
    return { permitido: false, motivo: "cuota_ia", usadas, usadasIa };
  }
  return { permitido: true, usadas, usadasIa };
}

/** Marca cuándo y desde dónde se usó. En segundo plano: no debe frenar la respuesta. */
export function marcarUso(keyId: number, ip: string | undefined): void {
  void (async () => {
    try {
      const db = await getDb();
      if (!db) return;
      await db
        .update(apiKeys)
        .set({ lastUsedAt: new Date(), lastUsedIp: (ip || "").slice(0, 64) || null })
        .where(eq(apiKeys.id, keyId));
    } catch {
      // El sello de uso es información, no parte de la petición: si falla, se calla
    }
  })();
}

// ───────────────────────── administración ─────────────────────────

export async function crearLlave(datos: {
  name: string;
  scope: "lectura" | "lectura_ia";
  userId: number;
  createdByUserId: number;
  rateLimitPerMin?: number;
  dailyQuota?: number;
  dailyAiQuota?: number;
  expiresAt?: Date | null;
}): Promise<{ id: number; plain: string; prefix: string }> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const { plain, hash, prefix } = generateKey();

  const resultado = await db.insert(apiKeys).values({
    name: datos.name.slice(0, 128),
    keyHash: hash,
    keyPrefix: prefix,
    scope: datos.scope,
    userId: datos.userId,
    createdByUserId: datos.createdByUserId,
    rateLimitPerMin: datos.rateLimitPerMin ?? 60,
    dailyQuota: datos.dailyQuota ?? 5000,
    dailyAiQuota: datos.dailyAiQuota ?? 20,
    expiresAt: datos.expiresAt ?? null,
  });

  const id = Number((resultado as any)?.[0]?.insertId ?? (resultado as any)?.insertId ?? 0);
  return { id, plain, prefix };
}

export async function revocarLlave(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
  cubetas.delete(id);
}

/** Listado para la pantalla de administración, con el consumo de los últimos 7 días */
export async function listarLlaves() {
  const db = await getDb();
  if (!db) return [];

  const llaves = await db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
  if (llaves.length === 0) return [];

  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

  const consumo = await db
    .select({
      keyId: apiKeyUsage.keyId,
      calls: sql<number>`SUM(${apiKeyUsage.calls})`,
      aiCalls: sql<number>`SUM(${apiKeyUsage.aiCalls})`,
      errors: sql<number>`SUM(${apiKeyUsage.errors})`,
    })
    .from(apiKeyUsage)
    .where(gte(apiKeyUsage.day, desde))
    .groupBy(apiKeyUsage.keyId);

  const porLlave = new Map(consumo.map((c) => [c.keyId, c]));
  const hoy = todayMx();

  // Quién es el dueño: sin esto, la pantalla muestra un userId suelto y no se
  // puede auditar qué alcanza cada llave
  const duenos = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users);
  const porUsuario = new Map(duenos.map((u) => [u.id, u]));

  const hoyFilas = await db
    .select({ keyId: apiKeyUsage.keyId, calls: apiKeyUsage.calls, aiCalls: apiKeyUsage.aiCalls })
    .from(apiKeyUsage)
    .where(eq(apiKeyUsage.day, hoy));
  const deHoy = new Map(hoyFilas.map((c) => [c.keyId, c]));

  return llaves.map((k) => {
    const c = porLlave.get(k.id);
    const h = deHoy.get(k.id);
    const caducada = !!k.expiresAt && new Date(k.expiresAt).getTime() < Date.now();
    return {
      id: k.id,
      name: k.name,
      prefijo: maskKey(k.keyPrefix),
      scope: k.scope,
      userId: k.userId,
      actuaComo: porUsuario.get(k.userId)
        ? {
            nombre: porUsuario.get(k.userId)!.name,
            correo: porUsuario.get(k.userId)!.email,
            esAdmin: porUsuario.get(k.userId)!.role === "admin",
          }
        : null,
      rateLimitPerMin: k.rateLimitPerMin,
      dailyQuota: k.dailyQuota,
      dailyAiQuota: k.dailyAiQuota,
      expiresAt: k.expiresAt,
      revokedAt: k.revokedAt,
      lastUsedAt: k.lastUsedAt,
      lastUsedIp: k.lastUsedIp,
      createdAt: k.createdAt,
      estado: k.revokedAt ? "revocada" : caducada ? "caducada" : "activa",
      semana: {
        llamadas: Number(c?.calls ?? 0),
        llamadasIa: Number(c?.aiCalls ?? 0),
        errores: Number(c?.errors ?? 0),
      },
      hoy: {
        llamadas: Number(h?.calls ?? 0),
        llamadasIa: Number(h?.aiCalls ?? 0),
      },
    };
  });
}

/** Consumo día por día de una llave, para la pantalla de detalle */
export async function consumoDeLlave(keyId: number, dias = 30) {
  const db = await getDb();
  if (!db) return [];
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  return db
    .select()
    .from(apiKeyUsage)
    .where(and(eq(apiKeyUsage.keyId, keyId), gte(apiKeyUsage.day, desde)))
    .orderBy(desc(apiKeyUsage.day));
}
