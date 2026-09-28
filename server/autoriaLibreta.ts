// ============================================================
// Quién registró cada actividad de la libreta de campo
//
// La columna `createdByUserId` siempre estuvo ahí — la llena tanto la web
// como el sync de la app con la cuenta que trae el token — pero nunca se
// mostraba. Esto la traduce a algo que se pueda leer en pantalla: nombre,
// correo y el avatar que la persona eligió en su perfil.
//
// El origen se deduce de `clientUuid`: ese UUID lo genera el teléfono como
// clave de idempotencia del sync offline, así que solo existe en lo que
// subió la app. Lo capturado desde la web lo deja en null.
// ============================================================

import { inArray } from "drizzle-orm";
import { users } from "../drizzle/schema";

export type OrigenDeActividad = "app" | "web";

export interface CuentaQueRegistra {
  id: number;
  nombre: string;
  correo: string;
  emoji: string;
  color: string;
  rol: string;
  activa: boolean;
}

/** La app de campo es la única que manda `clientUuid` */
export function origenDeActividad(clientUuid: unknown): OrigenDeActividad {
  return typeof clientUuid === "string" && clientUuid.trim() !== "" ? "app" : "web";
}

/**
 * Las cuentas de una lista de actividades, en una sola consulta.
 *
 * Se resuelve en lote a propósito: la lista de la libreta ya hace bastantes
 * viajes a la base por actividad, y meter un usuario más por fila lo
 * empeoraría justo en la pantalla que más filas dibuja.
 */
export async function cuentasPorId(
  drizzle: any,
  ids: Array<number | null | undefined>,
): Promise<Map<number, CuentaQueRegistra>> {
  const mapa = new Map<number, CuentaQueRegistra>();
  // El 0 es el relleno de las actividades viejas, de antes de que se guardara
  // la cuenta: no corresponde a ningún usuario y consultarlo sobra.
  const unicos = Array.from(new Set(ids.filter((v): v is number => typeof v === "number" && v > 0)));
  if (unicos.length === 0) return mapa;

  const filas = await drizzle
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      avatarColor: users.avatarColor,
      avatarEmoji: users.avatarEmoji,
    })
    .from(users)
    .where(inArray(users.id, unicos));

  for (const f of filas as any[]) {
    mapa.set(f.id, {
      id: f.id,
      nombre: String(f.name || "").trim() || f.email || `Cuenta ${f.id}`,
      correo: f.email || "",
      emoji: f.avatarEmoji || (f.role === "admin" ? "🛡️" : "👤"),
      color: f.avatarColor || "#16a34a",
      rol: f.role || "user",
      activa: Boolean(f.isActive),
    });
  }
  return mapa;
}

/**
 * Lo que se le agrega a cada actividad para la pantalla.
 *
 * `registradoPor` puede venir null: actividades anteriores a que se guardara
 * la cuenta, o de un usuario que después se borró. La pantalla lo dice tal
 * cual en vez de inventarse un nombre.
 */
export function autoriaDe(
  actividad: { clientUuid?: unknown; createdByUserId?: number | null },
  cuentas: Map<number, CuentaQueRegistra>,
): { origen: OrigenDeActividad; registradoPor: CuentaQueRegistra | null } {
  const id = actividad.createdByUserId;
  return {
    origen: origenDeActividad(actividad.clientUuid),
    registradoPor: typeof id === "number" && id > 0 ? cuentas.get(id) ?? null : null,
  };
}
