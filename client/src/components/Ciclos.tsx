/**
 * Cómo se ve un ciclo de producción en la pantalla.
 *
 * Vive aparte porque ya lo usan dos pantallas —el listado de cajas y el
 * análisis diario— y la separación por cosecha tiene que verse y funcionar
 * igual en las dos. Aquí solo está la parte visual: a qué ciclo pertenece una
 * fecha lo decide shared/ciclos.ts, que es el mismo criterio del servidor.
 */

export interface CicloParaFiltrar {
  id: number;
  name: string;
  desde: string;
  hasta: string;
  esElDeHoy: boolean;
  /** Cuántas cajas le tocan. Es el número que hace visible el reparto. */
  cajas: number;
}

/** Un día suelto "YYYY-MM-DD" en palabras, sin que la zona horaria lo recorra */
export const diaEnPalabras = (fecha: string, opts?: Intl.DateTimeFormatOptions) =>
  new Date(fecha + "T12:00:00").toLocaleDateString(
    "es-MX",
    opts ?? { day: "numeric", month: "short", year: "numeric" },
  );

/**
 * A qué cosecha pertenece un renglón.
 *
 * "Sin ciclo" no es un hueco que haya que rellenar con el ciclo actual: es una
 * fecha que no cae en ninguno de los ciclos capturados, casi siempre por un
 * error de captura. Marcarla en ámbar es la única forma de que se note.
 */
export function CicloChip({
  nombre,
  actual,
  className = "",
}: {
  nombre?: string | null;
  actual?: boolean;
  className?: string;
}) {
  if (!nombre) {
    return (
      <span
        title="La fecha de esta caja no cae dentro de ningún ciclo registrado"
        className={`inline-flex items-center gap-1 rounded-full bg-amber-100/80 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-300/60 ${className}`}
      >
        Sin ciclo
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        actual
          ? "bg-emerald-100/80 text-emerald-800 ring-emerald-300/60"
          : "bg-slate-100/80 text-slate-600 ring-slate-300/60"
      } ${className}`}
    >
      {actual && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
      {nombre}
    </span>
  );
}

/**
 * Un ciclo como botón: nombre arriba, cuántas cajas y qué rango de fechas
 * abajo. El rango va escrito porque es lo que de verdad define al ciclo — la
 * caja no dice a cuál pertenece, se sabe por su fecha.
 */
export function CicloBoton({
  activo,
  onClick,
  titulo,
  detalle,
  actual,
  aviso,
}: {
  activo: boolean;
  onClick: () => void;
  titulo: string;
  detalle: string;
  actual?: boolean;
  aviso?: boolean;
}) {
  const base = "rounded-2xl border px-4 py-2.5 text-left transition-all duration-200 backdrop-blur-sm";
  const estado = activo
    ? aviso
      ? "border-amber-400 bg-amber-50 shadow-md ring-1 ring-amber-300"
      : "border-green-500 bg-green-50 shadow-md ring-1 ring-green-400"
    : "border-green-200/70 bg-white/50 hover:border-green-400 hover:bg-white/80";

  return (
    <button type="button" onClick={onClick} className={`${base} ${estado}`}>
      <div className="flex items-center gap-2">
        {actual && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />}
        <span className={`text-sm font-semibold ${aviso ? "text-amber-900" : "text-green-900"}`}>{titulo}</span>
        {actual && <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-600">en curso</span>}
      </div>
      <div className={`mt-0.5 text-[11px] ${aviso ? "text-amber-700" : "text-green-600"}`}>{detalle}</div>
    </button>
  );
}

/**
 * La fila de ciclos entre los que se puede escoger.
 *
 * Van como botones y no como lista desplegable a propósito: así el reparto de
 * cajas entre cosechas se ve sin abrir nada, que es la pregunta que trae a
 * alguien a esta pantalla.
 *
 * `valor` es "all", "sin", o el id del ciclo como texto.
 */
export function SelectorDeCiclo({
  ciclos,
  sinCiclo,
  valor,
  onChange,
  detalleDeTodos,
  etiqueta = "Ciclo de producción",
}: {
  ciclos: CicloParaFiltrar[];
  sinCiclo: number;
  valor: string;
  onChange: (valor: string) => void;
  detalleDeTodos: string;
  etiqueta?: string;
}) {
  if (ciclos.length === 0) return null;

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-green-900">{etiqueta}</label>
      <div className="flex flex-wrap gap-2">
        <CicloBoton
          activo={valor === "all"}
          onClick={() => onChange("all")}
          titulo="Todos los ciclos"
          detalle={detalleDeTodos}
        />
        {ciclos.map((c) => (
          <CicloBoton
            key={c.id}
            activo={valor === String(c.id)}
            onClick={() => onChange(String(c.id))}
            titulo={c.name}
            detalle={`${c.cajas.toLocaleString()} cajas · ${diaEnPalabras(c.desde, { day: "numeric", month: "short" })} a ${diaEnPalabras(c.hasta)}`}
            actual={c.esElDeHoy}
          />
        ))}
        {sinCiclo > 0 && (
          <CicloBoton
            activo={valor === "sin"}
            onClick={() => onChange("sin")}
            titulo="Sin ciclo"
            detalle={`${sinCiclo.toLocaleString()} cajas con fecha fuera de todo ciclo`}
            aviso
          />
        )}
      </div>
    </div>
  );
}
