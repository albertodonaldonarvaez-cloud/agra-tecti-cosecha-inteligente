/**
 * Piezas compartidas de la fachada REST /api/v1.
 *
 * Todo lo que devuelve esta API lo va a leer un programa, no una persona. Eso
 * cambia dos decisiones:
 *
 *  1. La respuesta siempre tiene la misma forma ({ok, datos, meta} o {ok, error}),
 *     para que un script pueda revisar el resultado sin conocer el endpoint.
 *  2. Los campos llevan la unidad en el nombre (pesoKg, pesoToneladas, horas).
 *     El peso de las cajas se guarda en gramos: un agente que lea "weight" y
 *     asuma kilos se equivoca por mil y el reporte miente con seguridad.
 */
import type { Request, Response } from "express";

export const ZONA = "America/Mexico_City";

export interface ErrorApi {
  codigo: string;
  mensaje: string;
  /** Qué hacer para que funcione. Un agente puede actuar sobre esto. */
  ayuda?: string;
}

/** Error que el manejador convierte en una respuesta con su código HTTP */
export class ApiError extends Error {
  constructor(
    public estado: number,
    public codigo: string,
    mensaje: string,
    public ayuda?: string,
  ) {
    super(mensaje);
    this.name = "ApiError";
  }
}

export function responder(res: Response, datos: unknown, meta: Record<string, unknown> = {}): void {
  res.json({
    ok: true,
    datos,
    meta: { generado: new Date().toISOString(), zonaHoraria: ZONA, ...meta },
  });
}

export function responderError(res: Response, estado: number, error: ErrorApi): void {
  res.status(estado).json({ ok: false, error });
}

// ───────────────────────── lectura de parámetros ─────────────────────────

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lee una fecha "YYYY-MM-DD". Rechaza cualquier otra cosa en vez de dejar que
 * MySQL la interprete a su manera: un agente que mande "01/09/2026" debe
 * enterarse, no recibir un rango vacío que parece "no hubo cosecha".
 */
export function fecha(req: Request, nombre: string, obligatoria = false): string | undefined {
  const valor = req.query[nombre];
  if (valor === undefined || valor === "") {
    if (obligatoria) {
      throw new ApiError(400, "falta_parametro", `Falta el parámetro "${nombre}"`,
        `Agrega ?${nombre}=YYYY-MM-DD a la petición`);
    }
    return undefined;
  }
  const texto = String(valor).trim();
  const invalida = () => new ApiError(400, "fecha_invalida",
    `"${nombre}" no es una fecha válida: ${texto}`,
    "Usa el formato YYYY-MM-DD, por ejemplo 2026-08-31");

  if (!FECHA.test(texto)) throw invalida();

  // Comprobar que la fecha existe de verdad. JavaScript no se queja de un
  // 31 de febrero: lo rueda al 3 de marzo. Sin esta vuelta, un agente que pida
  // "hasta=2026-02-31" recibiría datos de otro mes sin enterarse.
  const d = new Date(`${texto}T12:00:00`);
  if (Number.isNaN(d.getTime())) throw invalida();
  const normalizada = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (normalizada !== texto) throw invalida();

  return texto;
}

export function entero(
  req: Request,
  nombre: string,
  opciones: { min?: number; max?: number; porDefecto?: number } = {},
): number | undefined {
  const valor = req.query[nombre];
  if (valor === undefined || valor === "") return opciones.porDefecto;
  const n = Number(String(valor).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new ApiError(400, "numero_invalido", `"${nombre}" debe ser un número entero`, undefined);
  }
  if (opciones.min !== undefined && n < opciones.min) {
    throw new ApiError(400, "fuera_de_rango", `"${nombre}" no puede ser menor que ${opciones.min}`);
  }
  if (opciones.max !== undefined && n > opciones.max) {
    throw new ApiError(400, "fuera_de_rango", `"${nombre}" no puede ser mayor que ${opciones.max}`,
      `El tope es ${opciones.max}. Para bajar más datos usa /api/v1/exportar/cajas, que va por cursor.`);
  }
  return n;
}

export function texto(req: Request, nombre: string, maxLargo = 120): string | undefined {
  const valor = req.query[nombre];
  if (valor === undefined || valor === "") return undefined;
  return String(valor).trim().slice(0, maxLargo);
}

export function booleano(req: Request, nombre: string): boolean {
  const valor = req.query[nombre];
  if (valor === undefined) return false;
  const t = String(valor).trim().toLowerCase();
  return t === "true" || t === "1" || t === "si" || t === "sí";
}

/** Lee un valor de un catálogo cerrado y, si falla, dice cuáles son los válidos */
export function opcion<T extends string>(
  req: Request,
  nombre: string,
  validas: readonly T[],
  porDefecto?: T,
): T | undefined {
  const valor = req.query[nombre];
  if (valor === undefined || valor === "") return porDefecto;
  const t = String(valor).trim().toLowerCase() as T;
  if (!validas.includes(t)) {
    throw new ApiError(400, "opcion_invalida", `"${nombre}" no acepta el valor "${t}"`,
      `Valores válidos: ${validas.join(", ")}`);
  }
  return t;
}

/**
 * Rango de fechas con tope de amplitud.
 *
 * El tope no es capricho: sin él, un agente pide "desde 2020 hasta hoy" sobre la
 * tabla de cajas y deja el MySQL de producción ocupado varios segundos por
 * petición. Con tope, el agente recibe un error que le dice cómo partirlo.
 */
export function rango(req: Request, maxDias = 400): { desde?: string; hasta?: string } {
  const desde = fecha(req, "desde");
  const hasta = fecha(req, "hasta");
  if (desde && hasta) {
    if (desde > hasta) {
      throw new ApiError(400, "rango_invertido", `"desde" (${desde}) es posterior a "hasta" (${hasta})`,
        "Intercambia los dos valores");
    }
    const dias = Math.round(
      (Date.parse(`${hasta}T12:00:00`) - Date.parse(`${desde}T12:00:00`)) / 86400000,
    );
    if (dias > maxDias) {
      throw new ApiError(400, "rango_muy_amplio",
        `El rango pedido es de ${dias} días y el máximo es ${maxDias}`,
        `Parte la consulta en tramos de ${maxDias} días o menos`);
    }
  }
  return { desde, hasta };
}

// ───────────────────────── conversiones ─────────────────────────

/** Gramos a kilos, con dos decimales. Es la conversión que más se repite. */
export function aKg(gramos: number | string | null | undefined): number {
  return Number((Number(gramos ?? 0) / 1000).toFixed(2));
}

export function aToneladas(gramos: number | string | null | undefined): number {
  return Number((Number(gramos ?? 0) / 1000000).toFixed(3));
}

export function porcentaje(parte: number, total: number): number {
  if (!total) return 0;
  return Number(((parte / total) * 100).toFixed(1));
}

export function num(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/** "YYYY-MM-DD" a partir de lo que devuelva MySQL (Date o cadena) */
export function comoDia(valor: unknown): string {
  if (valor instanceof Date) {
    return `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, "0")}-${String(valor.getDate()).padStart(2, "0")}`;
  }
  return String(valor ?? "").slice(0, 10);
}

export function hoyMx(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
}

export function sumarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
