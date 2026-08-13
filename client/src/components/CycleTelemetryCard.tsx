import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceArea,
} from "recharts";
import { GitCompare, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

type IdxKey = "ndvi" | "ndre" | "ndmi";

const INDICES: { key: IdxKey; label: string; desc: string }[] = [
  { key: "ndvi", label: "NDVI", desc: "Vigor del follaje" },
  { key: "ndre", label: "NDRE", desc: "Nitrógeno / clorofila" },
  { key: "ndmi", label: "NDMI", desc: "Humedad de la planta" },
];

/** Un color por ciclo; el más reciente siempre es el verde fuerte */
const COLORES = ["#16a34a", "#6366f1", "#f59e0b", "#ec4899", "#64748b", "#0ea5e9"];

function fmt(n: number | null | undefined, dec = 3): string {
  return n == null ? "—" : n.toFixed(dec);
}

function fmtKg(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`;
  return `${Math.round(kg)} kg`;
}

/** Diferencia contra el ciclo de referencia, en puntos de índice */
function Delta({ actual, base }: { actual: number | null; base: number | null }) {
  if (actual == null || base == null) return null;
  const d = actual - base;
  if (Math.abs(d) < 0.005) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400">
        <Minus className="w-3 h-3" /> igual
      </span>
    );
  }
  const mejor = d > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${mejor ? "text-green-600" : "text-red-500"}`}>
      {mejor ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {d > 0 ? "+" : ""}{d.toFixed(3)}
    </span>
  );
}

/**
 * Comparativo de ciclos para una parcela.
 *
 * La gracia está en el eje X: NO son fechas del calendario, son DÍAS DESDE QUE
 * ARRANCÓ EL CICLO. Así el día 90 del ciclo pasado queda justo encima del día
 * 90 del actual y se puede ver cuál venía mejor en el mismo momento del
 * cultivo, aunque hayan empezado en fechas distintas.
 *
 * Todo sale de lo que el servidor ya tiene guardado: no se le pide nada al
 * satélite al abrir esta tarjeta.
 */
export function CycleTelemetryCard({ parcelId }: { parcelId: number }) {
  const [indice, setIndice] = useState<IdxKey>("ndvi");
  const { data, isLoading } = trpc.copernicus.getCycleTelemetry.useQuery(
    { parcelId },
    { enabled: !!parcelId, staleTime: 30 * 60 * 1000 },
  );

  const ciclos = useMemo(() => (data?.ciclos ?? []).filter((c: any) => c.serie.length > 0), [data]);

  // Serie unificada: una fila por día del ciclo, una columna por ciclo
  const chart = useMemo(() => {
    if (ciclos.length === 0) return [];
    const porDia = new Map<number, any>();
    for (const c of ciclos) {
      for (const p of c.serie) {
        const valor = p[indice];
        if (valor == null) continue;
        const fila = porDia.get(p.dia) ?? { dia: p.dia };
        fila[`c${c.cycleId}`] = valor;
        fila[`f${c.cycleId}`] = p.date;
        porDia.set(p.dia, fila);
      }
    }
    return Array.from(porDia.values()).sort((a, b) => a.dia - b.dia);
  }, [ciclos, indice]);

  if (isLoading) {
    return (
      <GlassCard className="p-4" hover={false}>
        <div className="flex items-center justify-center h-32 gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          <span className="text-sm text-gray-500">Comparando ciclos...</span>
        </div>
      </GlassCard>
    );
  }

  if (ciclos.length === 0) {
    return (
      <GlassCard className="p-4" hover={false}>
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-1">
          <GitCompare className="w-4 h-4 text-indigo-500" />
          Comparativo por ciclos
        </h3>
        <p className="text-xs text-gray-500">
          {data?.ciclos?.length
            ? "Los ciclos registrados todavía no tienen capturas satelitales dentro de sus fechas."
            : "Registra los ciclos de producción para poder comparar un ciclo contra otro."}
        </p>
      </GlassCard>
    );
  }

  // El ciclo en curso (o el más reciente) es la referencia de las diferencias
  const referencia = ciclos[0];
  const anteriores = ciclos.slice(1);

  return (
    <GlassCard className="p-4" hover={false}>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-indigo-500" />
          Comparativo por ciclos
        </h3>
        <div className="flex gap-1 ml-auto">
          {INDICES.map((i) => (
            <button
              key={i.key}
              onClick={() => setIndice(i.key)}
              className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold transition ${
                indice === i.key
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-gray-500 mb-3">
        {INDICES.find((i) => i.key === indice)!.desc} · alineado por <strong>día del ciclo</strong>,
        no por fecha: el día 90 de un ciclo queda encima del día 90 del otro.
      </p>

      {/* Gráfica superpuesta */}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart} margin={{ top: 5, right: 15, left: -10, bottom: 5 }}>
            {/* Franjas de referencia del vigor, iguales que en la evolución */}
            <ReferenceArea y1={-0.2} y2={0.2} fill="#fecaca" fillOpacity={0.15} />
            <ReferenceArea y1={0.2} y2={0.4} fill="#fef08a" fillOpacity={0.15} />
            <ReferenceArea y1={0.4} y2={0.6} fill="#bbf7d0" fillOpacity={0.15} />
            <ReferenceArea y1={0.6} y2={1.0} fill="#86efac" fillOpacity={0.15} />
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="dia"
              type="number"
              domain={[0, "dataMax"]}
              tick={{ fontSize: 10 }}
              label={{ value: "Días desde el inicio del ciclo", position: "insideBottom", offset: -3, fontSize: 10, fill: "#9ca3af" }}
            />
            <YAxis tick={{ fontSize: 10 }} domain={[-0.2, 1]} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 10 }}
              labelFormatter={(d: any) => `Día ${d} del ciclo`}
              formatter={(v: any, name: any, item: any) => {
                const ciclo = ciclos.find((c: any) => `c${c.cycleId}` === item.dataKey);
                const fecha = ciclo ? item.payload[`f${ciclo.cycleId}`] : null;
                return [`${Number(v).toFixed(3)}${fecha ? ` (${fecha})` : ""}`, name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {ciclos.map((c: any, i: number) => (
              <Line
                key={c.cycleId}
                type="monotone"
                dataKey={`c${c.cycleId}`}
                name={c.cycleName + (c.enCurso ? " (en curso)" : "")}
                stroke={COLORES[i % COLORES.length]}
                strokeWidth={i === 0 ? 2.5 : 1.8}
                strokeDasharray={i === 0 ? undefined : "5 3"}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla resumen */}
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-[10px] text-gray-500 uppercase">
              <th className="py-2 pr-3">Ciclo</th>
              <th className="py-2 pr-3">Días</th>
              <th className="py-2 pr-3 text-right">Promedio</th>
              <th className="py-2 pr-3 text-right">Máximo</th>
              <th className="py-2 pr-3">Pico</th>
              <th className="py-2 pr-3 text-right">Capturas</th>
              <th className="py-2 pr-3 text-right">Cosecha</th>
              <th className="py-2 text-right">Labores</th>
            </tr>
          </thead>
          <tbody>
            {ciclos.map((c: any, i: number) => {
              const r = c[indice];
              const base = referencia[indice];
              return (
                <tr key={c.cycleId} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES[i % COLORES.length] }} />
                      <div>
                        <p className="font-semibold text-gray-800">{c.cycleName}</p>
                        <p className="text-[10px] text-gray-400">
                          {c.startDate} → {c.endDate ?? "en curso"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-gray-600">{c.duracionDias}</td>
                  <td className="py-2 pr-3 text-right font-semibold text-gray-800">
                    {fmt(r.promedio)}
                    {i > 0 && <div><Delta actual={r.promedio} base={base.promedio} /></div>}
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-700">
                    {fmt(r.maximo)}
                    {i > 0 && <div><Delta actual={r.maximo} base={base.maximo} /></div>}
                  </td>
                  <td className="py-2 pr-3 text-gray-500 text-[11px]">
                    {r.diaMaximo != null ? `día ${r.diaMaximo}` : "—"}
                    {r.fechaMaximo && <div className="text-[10px] text-gray-400">{r.fechaMaximo}</div>}
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-600">{r.puntos}</td>
                  <td className="py-2 pr-3 text-right">
                    {c.cosecha.cajas > 0 ? (
                      <>
                        <span className="font-semibold text-gray-800">{fmtKg(c.cosecha.kg)}</span>
                        <div className="text-[10px] text-gray-400">{c.cosecha.cajas} cajas · {c.cosecha.dias} días</div>
                      </>
                    ) : (
                      <span className="text-gray-300">sin cosecha</span>
                    )}
                  </td>
                  <td className="py-2 text-right text-gray-600">{c.labores}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {anteriores.length > 0 && (
        <p className="text-[10px] text-gray-500 mt-2">
          Las diferencias son contra <strong>{referencia.cycleName}</strong>
          {referencia.enCurso ? " (el ciclo en curso)" : ""}. Verde = ese ciclo venía mejor.
        </p>
      )}
      {(data?.sinCiclo ?? 0) > 0 && (
        <p className="text-[10px] text-amber-600 mt-1">
          Hay {data!.sinCiclo} captura(s) anteriores al primer ciclo registrado; no entran en la comparación.
        </p>
      )}
    </GlassCard>
  );
}
