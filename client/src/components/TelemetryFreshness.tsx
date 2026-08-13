import { GlassCard } from "@/components/GlassCard";
import { RefreshCw, Satellite, Loader2 } from "lucide-react";

/**
 * Franja que dice de cuándo son los datos satelitales y de dónde salieron.
 *
 * Existe porque ahora la pantalla NO descarga nada: lee lo que el servidor
 * guardó en su revisión diaria. Si el usuario no ve eso explicado, una fecha
 * de hace tres días parece un error en vez de "así pasa el satélite".
 */
export function TelemetryFreshness({
  telemetry,
  isLoading,
  onRefresh,
  refreshing,
}: {
  telemetry?: any;
  isLoading?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  if (isLoading) return null;

  const ndvi = telemetry?.indices?.find((i: any) => i.indexType === "NDVI");
  const captura: string | null = ndvi?.captureDate ?? null;
  const ciclo: string | null = ndvi?.cycleName ?? null;
  const horas: number | null = telemetry?.ageHours ?? null;
  const sinDatos = !telemetry?.hasData;

  const diasDesdeCaptura = captura
    ? Math.max(0, Math.round((Date.now() - new Date(captura + "T12:00:00").getTime()) / 86400000))
    : null;

  const revisado =
    horas == null ? "sin registro"
      : horas < 1 ? "hace unos minutos"
      : horas < 24 ? `hace ${Math.round(horas)} h`
      : `hace ${Math.round(horas / 24)} d`;

  return (
    <GlassCard className="p-3" hover={false}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
            <Satellite className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-800">
              {sinDatos
                ? "Todavía sin datos satelitales"
                : captura
                  ? `Pasada del ${captura}`
                  : "Composición sin fecha única"}
            </p>
            <p className="text-[10px] text-gray-500">
              {sinDatos
                ? "La revisión diaria del servidor los descargará; también puedes buscarlos ahora."
                : <>
                    {diasDesdeCaptura != null && (
                      <>
                        {diasDesdeCaptura === 0 ? "De hoy" : `Hace ${diasDesdeCaptura} día${diasDesdeCaptura === 1 ? "" : "s"}`}
                        {" · "}
                      </>
                    )}
                    Guardado en el servidor, revisado {revisado}
                    {ciclo ? ` · ${ciclo}` : ""}
                  </>}
            </p>
          </div>
        </div>

        <p className="text-[10px] text-gray-400 flex-1 min-w-[200px]">
          El servidor busca capturas nuevas todos los días y solo descarga cuando el satélite
          pasó de nuevo. Sentinel-2 repite cada ~5 días, así que ver la misma fecha varios días
          seguidos es lo normal.
        </p>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {refreshing ? "Buscando..." : "Buscar ahora"}
          </button>
        )}
      </div>
    </GlassCard>
  );
}
