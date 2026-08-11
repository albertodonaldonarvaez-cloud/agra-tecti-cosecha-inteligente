import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import { History, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface VigorEntry {
  captureDate: string;
  cycleId: number | null;
  cycleName: string | null;
  clearPct: number | null;
  ndviMean: number | null;
  ndviMin: number | null;
  ndviMax: number | null;
  distribution: { suelo: number; bajo: number; medio: number; alto: number } | null;
  zones: { name: string; meanNdvi: number; areaPct: number }[] | null;
}

/** Color de la barra según el nivel de vigor */
function ndviColor(v: number): string {
  if (v < 0.2) return "#8B4513";
  if (v < 0.4) return "#FF8C00";
  if (v < 0.6) return "#ADFF2F";
  return "#228B22";
}

function formatDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "2-digit" });
}

/**
 * Historial satelital de la parcela.
 *
 * El sistema revisa las parcelas cada 72 horas y guarda cada captura nueva, así
 * que aquí se ve la evolución real del vigor a lo largo del ciclo —y separada
 * por ciclo— en vez de solo la última foto.
 */
export function VigorHistoryCard({ parcelId }: { parcelId: number }) {
  const { data, isLoading } = trpc.copernicus.getVigorHistory.useQuery(
    { parcelId, limit: 30 },
    { staleTime: 300_000 }
  );

  const entries = (data ?? []) as VigorEntry[];

  // Agrupadas por ciclo, de la más reciente a la más antigua
  const byCycle = useMemo(() => {
    const groups: { cycleName: string; entries: VigorEntry[] }[] = [];
    for (const e of entries) {
      const nombre = e.cycleName ?? "Sin ciclo asignado";
      const last = groups[groups.length - 1];
      if (last && last.cycleName === nombre) last.entries.push(e);
      else groups.push({ cycleName: nombre, entries: [e] });
    }
    return groups;
  }, [entries]);

  // Tendencia: la captura más reciente contra la anterior
  const trend = useMemo(() => {
    if (entries.length < 2) return null;
    const a = entries[0]?.ndviMean;
    const b = entries[1]?.ndviMean;
    if (a == null || b == null) return null;
    return Math.round((a - b) * 100) / 100;
  }, [entries]);

  if (isLoading) return null;

  if (entries.length === 0) {
    return (
      <GlassCard className="p-4" hover={false}>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-800">
          <History className="h-4 w-4 text-indigo-500" />
          Historial de capturas
        </h3>
        <p className="text-[11px] text-gray-500">
          Todavía no hay capturas guardadas. El sistema revisa las parcelas cada 72 horas y va
          construyendo aquí el historial del ciclo.
        </p>
      </GlassCard>
    );
  }

  const maxNdvi = Math.max(0.8, ...entries.map((e) => e.ndviMean ?? 0));

  return (
    <GlassCard className="p-4" hover={false}>
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-bold text-gray-800">Historial de capturas</h3>
        {trend !== null && (
          <span
            className={`ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              trend > 0.02 ? "bg-green-50 text-green-700"
              : trend < -0.02 ? "bg-amber-50 text-amber-700"
              : "bg-gray-100 text-gray-600"
            }`}
          >
            {trend > 0.02 ? <TrendingUp className="h-3 w-3" />
              : trend < -0.02 ? <TrendingDown className="h-3 w-3" />
              : <Minus className="h-3 w-3" />}
            {trend > 0 ? "+" : ""}{trend} vs captura anterior
          </span>
        )}
      </div>

      <div className="space-y-4">
        {byCycle.map((group) => (
          <div key={group.cycleName}>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600">
              {group.cycleName}
            </p>
            <div className="space-y-1.5">
              {group.entries.map((e) => {
                const v = e.ndviMean ?? 0;
                const debil = e.zones && e.zones.length > 0
                  ? [...e.zones].sort((a, b) => a.meanNdvi - b.meanNdvi)[0]
                  : null;
                return (
                  <div key={e.captureDate} className="flex items-center gap-2 text-[11px]">
                    <span className="w-16 shrink-0 font-medium text-gray-700">
                      {formatDate(e.captureDate)}
                    </span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(2, (v / maxNdvi) * 100)}%`, backgroundColor: ndviColor(v) }}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-right font-bold text-gray-800">{v.toFixed(2)}</span>
                    {e.distribution && (
                      <span className="w-20 shrink-0 text-right text-gray-500" title="Porcentaje del terreno en suelo desnudo o planta seca">
                        {e.distribution.suelo}% seco
                      </span>
                    )}
                    {debil && (
                      <span className="hidden shrink-0 text-gray-500 sm:inline" title="Zona con menor vigor en esa captura">
                        · débil: {debil.name} ({debil.meanNdvi})
                      </span>
                    )}
                    {e.clearPct != null && (
                      <span className="hidden w-16 shrink-0 text-right text-gray-400 md:inline" title="Qué tan despejada se veía la parcela">
                        {e.clearPct}% claro
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[10px] text-gray-400">
        Las parcelas se revisan cada 72 horas y cada captura nueva queda guardada en el servidor.
        El color de la barra sigue la escala de vigor: café/naranja = suelo o estrés, verde = follaje sano.
      </p>
    </GlassCard>
  );
}
