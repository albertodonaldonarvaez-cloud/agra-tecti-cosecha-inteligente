import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Layers, ChevronDown, ChevronUp } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const CYCLE_COLORS = ["#16a34a", "#f59e0b", "#3b82f6", "#a855f7", "#ef4444"];

const ACTIVITY_LABELS: Record<string, string> = {
  riego: "Riego", fertilizacion: "Fertilización", nutricion: "Nutrición", poda: "Poda",
  control_maleza: "Control de maleza", control_plagas: "Control de plagas",
  aplicacion_fitosanitaria: "Fitosanitaria", otro: "Otras",
};

interface CycleStats {
  id: number;
  name: string;
  startDate: string;
  harvestStart: string | null;
  harvestEndDate: string | null;
  endDate: string | null;
  isActive: boolean;
  daysToHarvest: number | null;
  harvestWeeks: number;
  totalBoxes: number;
  totalKg: number;
  firstQualityPercent: number;
  avgKgPerBox: number;
  curve: { week: number; kg: number; boxes: number; firstQualityKg: number }[];
  byParcel: { parcelCode: string; boxes: number; kg: number }[];
  activities: Record<string, number>;
}

/** Acumulado de kilos hasta la semana indicada (inclusive) */
function accumulatedThrough(cycle: CycleStats, week: number): number {
  return cycle.curve.filter((p) => p.week <= week).reduce((s, p) => s + p.kg, 0);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value + "T12:00:00").toLocaleDateString("es-MX", {
    day: "numeric", month: "short", year: "numeric",
  });
}

/**
 * Comparativo entre ciclos de producción.
 *
 * La comparación útil se hace por SEMANA DESDE EL INICIO DE COSECHA, no por
 * fecha de calendario: cada ciclo poda en un momento distinto, así que
 * alinearlos por su propio arranque es lo único que permite decir "voy adelante
 * o atrás del ciclo pasado a estas alturas".
 */
export function CycleComparison() {
  const { data, isLoading } = trpc.cycles.comparison.useQuery({ limit: 3 });
  const [expanded, setExpanded] = useState(true);

  const cycles = (data?.cycles ?? []) as CycleStats[];
  const current = cycles[0];
  const previous = cycles[1];

  // "A estas alturas": se compara hasta donde alcanza el ciclo más nuevo
  const comparableWeek = current && current.harvestWeeks > 0 ? current.harvestWeeks - 1 : null;
  const currentSoFar = current && comparableWeek !== null ? accumulatedThrough(current, comparableWeek) : 0;
  const previousSoFar = previous && comparableWeek !== null ? accumulatedThrough(previous, comparableWeek) : 0;
  const diffPct = previousSoFar > 0 ? ((currentSoFar - previousSoFar) / previousSoFar) * 100 : null;

  // Datos de la gráfica: una fila por semana, una serie por ciclo
  const chartData = useMemo(() => {
    const maxWeek = Math.max(0, ...cycles.map((c) => c.harvestWeeks));
    const rows: Record<string, number | string>[] = [];
    for (let w = 0; w < maxWeek; w++) {
      const row: Record<string, number | string> = { semana: `S${w + 1}` };
      for (const c of cycles) {
        const point = c.curve.find((p) => p.week === w);
        if (point) row[c.name] = point.kg;
      }
      rows.push(row);
    }
    return rows;
  }, [cycles]);

  if (isLoading) return null;

  if (cycles.length === 0) {
    return (
      <GlassCard className="mb-4 md:mb-6 p-4 md:p-6">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-green-600" />
          <h2 className="text-lg md:text-xl font-semibold text-green-900">Comparativo de Ciclos</h2>
        </div>
        <p className="mt-2 text-sm text-green-600">
          Todavía no hay ciclos de producción registrados. Créalos en la sección Ciclos para poder
          comparar la cosecha de un ciclo contra la del anterior.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="mb-4 md:mb-6 p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 md:h-6 md:w-6 text-green-600" />
          <div>
            <h2 className="text-lg md:text-2xl font-semibold text-green-900">Comparativo de Ciclos</h2>
            <p className="text-xs text-green-600">
              Alineado por semana desde el inicio de cosecha de cada ciclo
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {/* Ciclo actual vs anterior "a estas alturas" */}
      {current && previous && comparableWeek !== null && (
        <div className="mb-5 rounded-xl border border-green-200 bg-green-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-green-700">
            A estas alturas del ciclo (semana {comparableWeek + 1} de cosecha)
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="text-xs text-green-600">{current.name}</p>
              <p className="text-2xl font-bold text-green-900">{currentSoFar.toFixed(0)} kg</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{previous.name}</p>
              <p className="text-2xl font-bold text-gray-500">{previousSoFar.toFixed(0)} kg</p>
            </div>
            {diffPct !== null && (
              <div
                className={`rounded-full px-3 py-1.5 text-sm font-bold ${
                  diffPct >= 0 ? "bg-green-600 text-white" : "bg-amber-500 text-white"
                }`}
              >
                {diffPct >= 0 ? "▲" : "▼"} {Math.abs(diffPct).toFixed(1)}%
                <span className="ml-1 font-medium opacity-90">
                  {diffPct >= 0 ? "arriba del ciclo pasado" : "abajo del ciclo pasado"}
                </span>
              </div>
            )}
          </div>
          {previousSoFar === 0 && (
            <p className="mt-2 text-xs text-green-600">
              El ciclo anterior no tenía cosecha registrada a estas alturas; la comparación se vuelve
              más útil conforme avance el ciclo.
            </p>
          )}
        </div>
      )}

      {current && !previous && (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-800">
          Solo hay un ciclo registrado. En cuanto exista un segundo, aquí aparecerá la comparación
          contra el anterior a la misma altura de la cosecha.
        </div>
      )}

      {expanded && (
        <>
          {/* Tarjetas por ciclo */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
            {cycles.map((c, i) => (
              <div
                key={c.id}
                className="rounded-xl border bg-white/60 p-4"
                style={{ borderColor: CYCLE_COLORS[i % CYCLE_COLORS.length] + "55" }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: CYCLE_COLORS[i % CYCLE_COLORS.length] }}
                  />
                  <p className="font-semibold text-green-900">{c.name}</p>
                  {c.isActive && (
                    <span className="rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      EN CURSO
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Cajas</p>
                    <p className="font-bold text-green-900">{c.totalBoxes.toLocaleString("es-MX")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Kilos</p>
                    <p className="font-bold text-green-900">{c.totalKg.toLocaleString("es-MX")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Primera calidad</p>
                    <p className="font-bold text-green-900">{c.firstQualityPercent}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">kg por caja</p>
                    <p className="font-bold text-green-900">{c.avgKgPerBox}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-500">
                  <p>Poda: {formatDate(c.startDate)}</p>
                  <p>
                    Cosecha: {formatDate(c.harvestStart)}
                    {c.daysToHarvest !== null && (
                      <span className="ml-1 text-green-600">({c.daysToHarvest} días tras la poda)</span>
                    )}
                  </p>
                  {c.harvestWeeks > 0 && <p>{c.harvestWeeks} semana(s) de cosecha</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Curva de producción alineada */}
          {chartData.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold text-green-900">Kilos por semana de cosecha</p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={60} />
                    <Tooltip
                      formatter={(v: any, name: any) => [`${Number(v).toLocaleString("es-MX")} kg`, name]}
                      labelFormatter={(l) => `Semana ${String(l).replace("S", "")} de cosecha`}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {cycles.map((c, i) => (
                      <Line
                        key={c.id}
                        type="monotone"
                        dataKey={c.name}
                        stroke={CYCLE_COLORS[i % CYCLE_COLORS.length]}
                        strokeWidth={i === 0 ? 3 : 2}
                        strokeDasharray={i === 0 ? undefined : "5 4"}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Cada ciclo empieza en su propia semana 1 de cosecha: por eso se pueden comparar aunque
                hayan podado en fechas distintas.
              </p>
            </div>
          )}

          {/* Producción por parcela */}
          {cycles.some((c) => c.byParcel.length > 0) && (
            <div className="mt-5 overflow-x-auto">
              <p className="mb-2 text-sm font-semibold text-green-900">Kilos por parcela</p>
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="py-2">Parcela</th>
                    {cycles.map((c) => (
                      <th key={c.id} className="py-2 text-right">{c.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from(new Set(cycles.flatMap((c) => c.byParcel.map((p) => p.parcelCode))))
                    .sort()
                    .map((code) => (
                      <tr key={code} className="border-b border-gray-100">
                        <td className="py-2 font-medium text-green-900">{code}</td>
                        {cycles.map((c) => {
                          const p = c.byParcel.find((x) => x.parcelCode === code);
                          return (
                            <td key={c.id} className="py-2 text-right text-gray-700">
                              {p ? p.kg.toLocaleString("es-MX") : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Labores realizadas: dan contexto a las diferencias de producción */}
          {cycles.some((c) => Object.keys(c.activities).length > 0) && (
            <div className="mt-5 overflow-x-auto">
              <p className="mb-2 text-sm font-semibold text-green-900">Labores realizadas en cada ciclo</p>
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="py-2">Labor</th>
                    {cycles.map((c) => (
                      <th key={c.id} className="py-2 text-right">{c.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from(new Set(cycles.flatMap((c) => Object.keys(c.activities))))
                    .sort()
                    .map((type) => (
                      <tr key={type} className="border-b border-gray-100">
                        <td className="py-2 font-medium text-green-900">
                          {ACTIVITY_LABELS[type] || type}
                        </td>
                        {cycles.map((c) => (
                          <td key={c.id} className="py-2 text-right text-gray-700">
                            {c.activities[type] ?? "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}
