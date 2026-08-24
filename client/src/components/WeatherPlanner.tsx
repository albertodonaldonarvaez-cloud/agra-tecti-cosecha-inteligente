import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import {
  Sun, Cloud, CloudRain, CloudLightning, Moon, Droplets, Wind,
  CalendarClock, CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  ClipboardList, Sprout, ChevronDown, ChevronUp, Users, MapPin,
} from "lucide-react";

// ===== PIEZAS COMPARTIDAS =====

function WeatherIcon({ condition, size = 20 }: { condition?: string; size?: number }) {
  const p = { size, className: "inline-block" };
  switch (condition) {
    case "sunny": return <Sun {...p} className="text-yellow-400" />;
    case "cloudy": return <Cloud {...p} className="text-gray-400" />;
    case "rainy": return <CloudRain {...p} className="text-blue-400" />;
    case "stormy": return <CloudLightning {...p} className="text-purple-400" />;
    case "clear": return <Moon {...p} className="text-blue-200" />;
    default: return <Sun {...p} className="text-yellow-300" />;
  }
}

/** Un solo lenguaje visual para los tres veredictos, en toda la pantalla */
const NIVELES = {
  bueno: { label: "Buen día", chip: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle2, dot: "bg-green-500" },
  cuidado: { label: "Con cuidado", chip: "bg-amber-100 text-amber-700 border-amber-200", icon: AlertTriangle, dot: "bg-amber-500" },
  malo: { label: "Mal día", chip: "bg-red-100 text-red-700 border-red-200", icon: XCircle, dot: "bg-red-500" },
} as const;

function VerdictChip({ nivel, texto }: { nivel: keyof typeof NIVELES; texto?: string }) {
  const cfg = NIVELES[nivel] ?? NIVELES.cuidado;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.chip}`}>
      <Icon className="w-3 h-3" />
      {texto ?? cfg.label}
    </span>
  );
}

function fechaCorta(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

function diaRelativo(enDias: number) {
  if (enDias === 0) return "Hoy";
  if (enDias === 1) return "Mañana";
  if (enDias === -1) return "Ayer";
  return enDias > 0 ? `En ${enDias} días` : `Hace ${Math.abs(enDias)} días`;
}

// ===== BANNER DE MODO =====

function ModoBanner({ data }: { data: any }) {
  const cosecha = data.temporadaCosecha;
  return (
    <GlassCard className={`p-4 ${cosecha ? "border-2 border-green-300 bg-green-50/40" : "border-2 border-indigo-200 bg-indigo-50/30"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${cosecha ? "bg-green-100" : "bg-indigo-100"}`}>
          {cosecha ? <Sprout className="w-6 h-6 text-green-600" /> : <ClipboardList className="w-6 h-6 text-indigo-600" />}
        </div>
        <div className="flex-1 min-w-[220px]">
          <h2 className="text-base font-bold text-gray-800">
            {cosecha ? "Temporada de cosecha" : "Fuera de temporada de cosecha"}
          </h2>
          <p className="text-xs text-gray-600">
            {data.motivoTemporada}
            {cosecha
              ? " · la pantalla pone el corte al frente, sin perder de vista las labores."
              : " · la pantalla se enfoca en planear las labores."}
          </p>
        </div>
        {data.ciclo && (
          <div className="text-right">
            <p className="text-xs font-semibold text-gray-700">{data.ciclo.name}</p>
            <p className="text-[11px] text-gray-500">Día {data.ciclo.diaDelCiclo} del ciclo</p>
          </div>
        )}
        {cosecha && data.cosechaReciente.cajas > 0 && (
          <div className="text-right border-l pl-3">
            <p className="text-xs font-semibold text-green-700">
              {data.cosechaReciente.cajas} cajas · {data.cosechaReciente.kg} kg
            </p>
            <p className="text-[11px] text-gray-500">últimos {data.cosechaReciente.dias} días</p>
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// ===== AGENDA DE LOS PRÓXIMOS DÍAS =====

function Agenda({ data }: { data: any }) {
  const cosecha = data.temporadaCosecha;
  return (
    <GlassCard className="p-4 md:p-6">
      <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-1">
        <CalendarClock className="w-5 h-5 text-indigo-500" />
        Próximos días
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        El clima que viene y lo que ya está programado para cada día.
        {cosecha
          ? " El sello dice cómo se ve el día para cortar fruta."
          : " El sello dice cómo se ve el día para trabajar en campo (aspersión, que es lo más delicado)."}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {data.agenda.map((dia: any, i: number) => {
          // En temporada el día se juzga por el corte; fuera de temporada, por
          // la aspersión, que es la labor que más depende del clima
          const v = cosecha ? dia.cosecha : dia.aspersion;
          return (
            <div
              key={dia.date}
              className={`rounded-xl p-3 border transition ${
                i === 0 ? "bg-white/80 border-indigo-300 shadow-sm" : "bg-white/50 border-gray-200/70"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-xs font-bold text-gray-800">{diaRelativo(i)}</p>
                  <p className="text-[10px] text-gray-500">{fechaCorta(dia.date)}</p>
                </div>
                <WeatherIcon condition={dia.clima?.condition} size={26} />
              </div>

              {dia.clima ? (
                <>
                  <p className="text-sm font-bold text-gray-800">
                    {dia.clima.temperatureMax.toFixed(0)}° / {dia.clima.temperatureMin.toFixed(0)}°
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-2">
                    {(dia.clima.precipitationProbability > 0 || dia.clima.precipitation > 0) && (
                      <span className="text-blue-600 inline-flex items-center gap-0.5">
                        <Droplets className="w-3 h-3" />
                        {dia.clima.precipitation > 0
                          ? `${dia.clima.precipitation.toFixed(1)} mm`
                          : `${dia.clima.precipitationProbability}%`}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-0.5">
                      <Wind className="w-3 h-3" />{dia.clima.windSpeed.toFixed(0)} km/h
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-gray-400 mb-2">Sin pronóstico</p>
              )}

              {v && (
                <div className="mb-2">
                  <VerdictChip
                    nivel={v.nivel}
                    texto={v.nivel === "bueno" ? (cosecha ? "Buen día de corte" : "Buen día de campo") : undefined}
                  />
                  <p className="text-[10px] text-gray-500 mt-1 leading-snug">{v.motivos[0]}</p>
                </div>
              )}

              {dia.labores.length > 0 ? (
                <div className="space-y-1 border-t pt-2">
                  {dia.labores.slice(0, 3).map((l: any) => (
                    <div key={l.id} className="flex items-start gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${NIVELES[l.veredicto.nivel as keyof typeof NIVELES]?.dot ?? "bg-gray-400"}`} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-gray-700 truncate">{l.activityTypeLabel}</p>
                        {l.parcelas.length > 0 && (
                          <p className="text-[10px] text-gray-400 truncate">{l.parcelas.join(", ")}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {dia.labores.length > 3 && (
                    <p className="text-[10px] text-gray-400">y {dia.labores.length - 3} más</p>
                  )}
                </div>
              ) : (
                <div className="border-t pt-2">
                  <p className="text-[10px] text-gray-400">Sin labores programadas</p>
                  {dia.sugerencias.length > 0 && (
                    <p className="text-[10px] text-green-600 mt-0.5 leading-snug">
                      Buen día para: {dia.sugerencias.slice(0, 2).join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// ===== LABORES PLANEADAS =====

function Planeadas({ data }: { data: any }) {
  const labores = data.planeadas as any[];
  const conProblema = labores.filter((l) => l.veredicto.nivel !== "bueno");

  return (
    <GlassCard className="p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-indigo-500" />
          Labores planeadas
        </h2>
        {labores.length > 0 && (
          <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {labores.length}
          </span>
        )}
        {conProblema.length > 0 && (
          <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
            {conProblema.length} con el clima en contra
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Cómo se ve el clima el día para el que están programadas.
      </p>

      {labores.length === 0 ? (
        <div className="text-center py-8">
          <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No hay labores programadas</p>
          <p className="text-xs text-gray-400 mt-1">
            Prográmalas en la Libreta de Campo y aquí verás con qué clima les va a tocar.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {labores.map((l) => (
            <div key={l.id} className="rounded-xl border border-gray-200/70 bg-white/60 p-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-800">{l.activityTypeLabel}</p>
                    {l.activitySubtype && (
                      <span className="text-[11px] text-gray-500">{l.activitySubtype}</span>
                    )}
                    <VerdictChip nivel={l.veredicto.nivel} />
                    {l.enDias < 0 && (
                      <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                        atrasada
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{l.description}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-gray-500">
                    <span className="font-medium text-gray-700">
                      {fechaCorta(l.activityDate)} · {diaRelativo(l.enDias)}
                    </span>
                    {l.parcelas.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{l.parcelas.join(", ")}
                      </span>
                    )}
                    {l.personas > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" />{l.personas}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right min-w-[110px]">
                  {l.clima ? (
                    <>
                      <div className="flex items-center justify-end gap-1.5">
                        <WeatherIcon condition={l.clima.condition} size={20} />
                        <span className="text-sm font-bold text-gray-800">
                          {l.clima.temperatureMax.toFixed(0)}°/{l.clima.temperatureMin.toFixed(0)}°
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500">{l.clima.conditionText}</p>
                      <p className="text-[10px] text-blue-600">
                        {l.clima.precipitation > 0
                          ? `${l.clima.precipitation.toFixed(1)} mm`
                          : l.clima.precipitationProbability > 0
                            ? `${l.clima.precipitationProbability}% de lluvia`
                            : "sin lluvia"}
                        {" · "}{l.clima.windSpeed.toFixed(0)} km/h
                      </p>
                    </>
                  ) : (
                    <p className="text-[11px] text-gray-400">Fuera del pronóstico</p>
                  )}
                </div>
              </div>

              {l.veredicto.motivos.length > 0 && l.veredicto.nivel !== "bueno" && (
                <ul className="mt-2 pt-2 border-t border-gray-100 space-y-0.5">
                  {l.veredicto.motivos.map((m: string, i: number) => (
                    <li key={i} className="text-[11px] text-gray-600 flex items-start gap-1.5">
                      <span className={`w-1 h-1 rounded-full mt-1.5 flex-shrink-0 ${NIVELES[l.veredicto.nivel as keyof typeof NIVELES]?.dot}`} />
                      {m}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

// ===== LABORES YA HECHAS Y EL CLIMA QUE LES TOCÓ =====

function Pasadas({ data }: { data: any }) {
  const [abierto, setAbierto] = useState(false);
  const labores = data.pasadas as any[];
  const conProblema = useMemo(() => labores.filter((l) => l.veredicto.nivel !== "bueno"), [labores]);
  const visibles = abierto ? labores : labores.slice(0, 6);

  return (
    <GlassCard className="p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          Clima que hubo en cada labor
        </h2>
        {conProblema.length > 0 && (
          <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
            {conProblema.length} se hicieron con el clima en contra
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Sirve para explicar resultados: una aplicación que se lavó o una poda con humedad se ven aquí.
      </p>

      {labores.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">
          Todavía no hay labores terminadas en este periodo.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-[10px] text-gray-500 uppercase">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Labor</th>
                  <th className="py-2 pr-3">Parcelas</th>
                  <th className="py-2 pr-3 text-center">Clima</th>
                  <th className="py-2 pr-3 text-right">Temp.</th>
                  <th className="py-2 pr-3 text-right">Lluvia</th>
                  <th className="py-2 pr-3 text-right">Viento</th>
                  <th className="py-2">Lectura</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((l) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 pr-3 whitespace-nowrap text-gray-600">{fechaCorta(l.activityDate)}</td>
                    <td className="py-2 pr-3">
                      <p className="font-medium text-gray-800">{l.activityTypeLabel}</p>
                      {l.activitySubtype && <p className="text-[10px] text-gray-400">{l.activitySubtype}</p>}
                    </td>
                    <td className="py-2 pr-3 text-gray-500 max-w-[140px] truncate">
                      {l.parcelas.length > 0 ? l.parcelas.join(", ") : "—"}
                    </td>
                    <td className="py-2 pr-3 text-center"><WeatherIcon condition={l.clima?.condition} size={16} /></td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {l.clima ? (
                        <>
                          <span className="text-red-600">{l.clima.temperatureMax.toFixed(0)}°</span>
                          <span className="text-gray-300"> / </span>
                          <span className="text-blue-600">{l.clima.temperatureMin.toFixed(0)}°</span>
                        </>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {l.clima && l.clima.precipitation > 0
                        ? <span className="text-blue-600">{l.clima.precipitation.toFixed(1)} mm</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-500">
                      {l.clima ? `${l.clima.windSpeed.toFixed(0)}` : "—"}
                    </td>
                    <td className="py-2">
                      <VerdictChip nivel={l.veredicto.nivel} texto={l.veredicto.nivel === "bueno" ? "Sin problema" : undefined} />
                      {l.veredicto.nivel !== "bueno" && (
                        <p className="text-[10px] text-gray-500 mt-0.5 max-w-[240px]">{l.veredicto.motivos[0]}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {labores.length > 6 && (
            <button
              onClick={() => setAbierto(!abierto)}
              className="mt-3 w-full text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center justify-center gap-1"
            >
              {abierto ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {abierto ? "Ver menos" : `Ver las ${labores.length} labores`}
            </button>
          )}
        </>
      )}
    </GlassCard>
  );
}

// ===== BLOQUE COMPLETO =====

/**
 * Clima para planear labores.
 *
 * Se arma entero en el servidor (`weather.planner`): el criterio agronómico de
 * cuándo un día sirve para asperjar, regar o podar vive ahí, no aquí, para que
 * la web, la IA y los avisos digan exactamente lo mismo.
 */
export function WeatherPlanner({
  pastDays = 30,
  aheadDays = 7,
}: {
  pastDays?: number;
  aheadDays?: number;
}) {
  // Misma consulta que hace la pantalla para decidir el orden: tRPC la reusa,
  // así que sigue siendo UNA sola petición
  const { data, isLoading, isError, error, refetch } = trpc.weather.planner.useQuery(
    { pastDays, aheadDays },
    { staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false, retry: 2 },
  );

  if (isLoading) {
    return (
      <GlassCard className="p-8">
        <div className="flex items-center justify-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
          <p className="text-gray-500 text-sm">Cruzando el clima con las labores...</p>
        </div>
      </GlassCard>
    );
  }

  if (isError || !data) {
    return (
      <GlassCard className="p-6">
        <div className="flex flex-col items-center gap-2">
          <AlertTriangle className="w-9 h-9 text-amber-400" />
          <p className="text-sm text-gray-600 text-center">
            {error?.message?.includes("ubicación")
              ? "Configura la ubicación del huerto en Ajustes para poder cruzar el clima con las labores."
              : "No se pudo armar la planeación con el clima."}
          </p>
          <button onClick={() => refetch()} className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm">
            <RefreshCw className="w-3 h-3 inline mr-1" /> Reintentar
          </button>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      <ModoBanner data={data} />
      <Agenda data={data} />
      <Planeadas data={data} />
      <Pasadas data={data} />
    </div>
  );
}
