import { Loading } from "@/components/Loading";
import { useAuth } from "@/_core/hooks/useAuth";
import { ProtectedPage } from "@/components/ProtectedPage";
import { GlassCard } from "@/components/GlassCard";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Calendar, TrendingUp, Package, BarChart3, CalendarRange, Layers } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { compararConCicloAnterior, type CicloComparable, type ComparativoDeMes } from "@shared/cycleMonths";

export default function DailyAnalysis() {
  return (
    <ProtectedPage permission="canViewDailyAnalysis">
      <DailyAnalysisContent />
    </ProtectedPage>
  );
}

// ── Tipos de los grupos (un día o un mes de cosecha) ──────────

interface Periodo {
  key: string;
  titulo: string;
  subtitulo: string;
  orden: number;
  totalBoxes: number;
  totalWeight: number;
  firstQuality: number;
  firstQualityWeight: number;
  secondQuality: number;
  secondQualityWeight: number;
  waste: number;
  wasteWeight: number;
  parcels: Set<string>;
  cutters: Set<number>;
  dias: Set<string>;
  /** Año y mes (0-11) del grupo; solo en la vista mensual */
  anio?: number;
  mes?: number;
}

function nuevoPeriodo(key: string, titulo: string, orden: number): Periodo {
  return {
    key, titulo, subtitulo: "", orden,
    totalBoxes: 0, totalWeight: 0,
    firstQuality: 0, firstQualityWeight: 0,
    secondQuality: 0, secondQualityWeight: 0,
    waste: 0, wasteWeight: 0,
    parcels: new Set(), cutters: new Set(), dias: new Set(),
  };
}

/** Suma una caja al grupo, con las mismas reglas de calidad de siempre */
function acumular(entry: Periodo, box: any, diaStr: string) {
  entry.totalBoxes++;
  entry.totalWeight += box.weight;
  entry.parcels.add(box.parcelCode);
  entry.dias.add(diaStr);

  // Las cortadoras 97/98/99 son categorías, no personas
  if (box.harvesterId !== 97 && box.harvesterId !== 98 && box.harvesterId !== 99) {
    entry.cutters.add(box.harvesterId);
  }

  if (box.harvesterId === 99) {
    entry.waste++;
    entry.wasteWeight += box.weight;
  } else if (box.harvesterId === 98) {
    entry.secondQuality++;
    entry.secondQualityWeight += box.weight;
  } else {
    entry.firstQuality++;
    entry.firstQualityWeight += box.weight;
  }
}

// ── Bloques compartidos por la vista diaria y la mensual ──────

function TarjetasDeCalidad({ p }: { p: Periodo }) {
  return (
    <div className="mb-4 md:mb-6 grid gap-2 md:gap-4 grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-green-600">Peso Total</p>
            <p className="text-lg md:text-2xl font-bold text-green-900">
              {(p.totalWeight / 1000).toFixed(2)}
            </p>
            <p className="text-xs text-green-500">kilogramos</p>
          </div>
          <Package className="h-8 w-8 md:h-10 md:w-10 text-green-400 hidden sm:block" />
        </div>
      </div>

      <div className="rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-green-600">Primera Calidad</p>
            <p className="text-lg md:text-2xl font-bold text-green-900">
              {(p.firstQualityWeight / 1000).toFixed(2)}
            </p>
            <p className="text-xs text-green-500">
              kg ({((p.firstQuality / p.totalBoxes) * 100).toFixed(1)}%)
            </p>
          </div>
          <TrendingUp className="h-8 w-8 md:h-10 md:w-10 text-green-400 hidden sm:block" />
        </div>
      </div>

      <div className="rounded-lg bg-gradient-to-br from-yellow-50 to-amber-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-yellow-600">Segunda Calidad</p>
            <p className="text-lg md:text-2xl font-bold text-yellow-900">
              {(p.secondQualityWeight / 1000).toFixed(2)}
            </p>
            <p className="text-xs text-yellow-500">
              kg ({((p.secondQuality / p.totalBoxes) * 100).toFixed(1)}%)
            </p>
          </div>
          <BarChart3 className="h-8 w-8 md:h-10 md:w-10 text-yellow-400 hidden sm:block" />
        </div>
      </div>

      <div className="rounded-lg bg-gradient-to-br from-red-50 to-rose-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-red-600">Desperdicio</p>
            <p className="text-lg md:text-2xl font-bold text-red-900">
              {(p.wasteWeight / 1000).toFixed(2)}
            </p>
            <p className="text-xs text-red-500">
              kg ({((p.waste / p.totalBoxes) * 100).toFixed(1)}%)
            </p>
          </div>
          <Package className="h-8 w-8 md:h-10 md:w-10 text-red-400 hidden sm:block" />
        </div>
      </div>
    </div>
  );
}

function DesgloseDeCajas({ p }: { p: Periodo }) {
  const pct = (n: number) => ((n / p.totalBoxes) * 100).toFixed(1);
  const filas = [
    { label: "Primera Calidad", cajas: p.firstQuality, borde: "border-green-200", texto: "text-green-700", valor: "text-green-900", pista: "bg-green-100", barra: "bg-green-500" },
    { label: "Segunda Calidad", cajas: p.secondQuality, borde: "border-yellow-200", texto: "text-yellow-700", valor: "text-yellow-900", pista: "bg-yellow-100", barra: "bg-yellow-500" },
    { label: "Desperdicio", cajas: p.waste, borde: "border-red-200", texto: "text-red-700", valor: "text-red-900", pista: "bg-red-100", barra: "bg-red-500" },
  ];
  return (
    <div className="grid gap-2 md:gap-4 grid-cols-3">
      {filas.map((f) => (
        <div key={f.label} className={`rounded-lg border ${f.borde} bg-white/50 p-4`}>
          <p className={`mb-2 text-sm font-semibold ${f.texto}`}>{f.label}</p>
          <p className={`text-xl font-bold ${f.valor}`}>{f.cajas} cajas</p>
          <div className={`mt-2 h-2 w-full overflow-hidden rounded-full ${f.pista}`}>
            <div className={`h-full ${f.barra}`} style={{ width: `${pct(f.cajas)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Comparación contra el ciclo anterior ──────────────────────

function ComparativoDelMes({ dato }: { dato: ComparativoDeMes }) {
  return (
    <div className="mb-4 rounded-xl border border-green-200 bg-green-50/60 p-3 md:p-4">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 flex-shrink-0 text-green-600" />
        <p className="text-xs font-semibold uppercase tracking-wider text-green-700">
          Mes {dato.mesDeCosecha + 1} de cosecha · {dato.cicloActual}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="text-xs text-green-600">Este ciclo</p>
          <p className="text-xl md:text-2xl font-bold text-green-900">
            {dato.kgActual.toLocaleString("es-MX")} kg
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">{dato.cicloAnterior}, mismo mes</p>
          <p className="text-xl md:text-2xl font-bold text-gray-500">
            {dato.kgAnterior > 0 ? `${dato.kgAnterior.toLocaleString("es-MX")} kg` : "sin cosecha"}
          </p>
        </div>
        {dato.diffPct !== null && (
          <div
            className={`rounded-full px-3 py-1.5 text-sm font-bold text-white ${
              dato.diffPct >= 0 ? "bg-green-600" : "bg-amber-500"
            }`}
          >
            {dato.diffPct >= 0 ? "▲" : "▼"} {Math.abs(dato.diffPct).toFixed(1)}%
            <span className="ml-1 font-medium opacity-90">
              {dato.diffPct >= 0 ? "arriba del ciclo pasado" : "abajo del ciclo pasado"}
            </span>
          </div>
        )}
      </div>
      {dato.diffPct === null && (
        <p className="mt-2 text-xs text-green-600">
          El ciclo anterior no tenía cosecha en su mes {dato.mesDeCosecha + 1}, así que todavía no hay
          contra qué comparar.
        </p>
      )}
    </div>
  );
}

// ── Página ───────────────────────────────────────────────────

function DailyAnalysisContent() {
  const { user, loading } = useAuth();
  const [vista, setVista] = useState<"dia" | "mes">("dia");

  const { data: boxes } = trpc.boxes.list.useQuery(undefined, {
    enabled: !!user,
  });

  // Los ciclos solo hacen falta en la vista mensual
  const { data: cyclesData } = trpc.cycles.comparison.useQuery(
    { limit: 3 },
    { enabled: !!user && vista === "mes" }
  );
  const ciclos = (cyclesData?.cycles ?? []) as CicloComparable[];

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  /** Agrupa las cajas por día o por mes según la vista elegida */
  const periodos = useMemo<Periodo[]>(() => {
    if (!boxes || boxes.length === 0) return [];

    const mapa = new Map<string, Periodo>();

    boxes.forEach((box: any) => {
      // Fecha local, no UTC: en UTC la cosecha de la tarde se pasa al día siguiente
      const fecha = new Date(box.submissionTime);
      const anio = fecha.getFullYear();
      const mes = fecha.getMonth();
      const dia = String(fecha.getDate()).padStart(2, "0");
      const diaStr = `${anio}-${String(mes + 1).padStart(2, "0")}-${dia}`;

      const key = vista === "dia" ? diaStr : `${anio}-${String(mes + 1).padStart(2, "0")}`;

      if (!mapa.has(key)) {
        const titulo =
          vista === "dia"
            ? new Date(anio, mes, fecha.getDate()).toLocaleDateString("es-MX", {
                weekday: "short", year: "numeric", month: "short", day: "numeric",
              })
            : new Date(anio, mes, 1).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
        const p = nuevoPeriodo(key, titulo, vista === "dia" ? new Date(anio, mes, fecha.getDate()).getTime() : new Date(anio, mes, 1).getTime());
        if (vista === "mes") {
          p.anio = anio;
          p.mes = mes;
        }
        mapa.set(key, p);
      }

      acumular(mapa.get(key)!, box, diaStr);
    });

    const lista = Array.from(mapa.values()).sort((a, b) => b.orden - a.orden);
    for (const p of lista) {
      p.subtitulo =
        vista === "dia"
          ? `${p.parcels.size} parcelas · ${p.cutters.size} cortadoras`
          : `${p.dias.size} días de corte · ${p.parcels.size} parcelas · ${p.cutters.size} cortadoras`;
    }
    return lista;
  }, [boxes, vista]);

  if (loading || !user) {
    return <Loading />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container px-3 md:px-6">
        {/* Encabezado */}
        <div className="mb-4 md:mb-6 flex items-center gap-3 md:gap-4">
          <img src={APP_LOGO} alt="Agratec" className="h-12 w-12 md:h-16 md:w-16" />
          <div>
            <h1 className="text-2xl md:text-4xl font-bold text-green-900">
              {vista === "dia" ? "Análisis Diario" : "Análisis Mensual"}
            </h1>
            <p className="text-xs md:text-base text-green-700">
              {vista === "dia"
                ? "Datos exactos de cada día de cosecha"
                : "La temporada mes a mes, comparada contra el ciclo anterior"}
            </p>
          </div>
        </div>

        {/* Día / Mes: la misma pantalla, dos maneras de leer la cosecha */}
        <div className="mb-5 flex gap-2">
          {[
            { id: "dia" as const, label: "Por día", icon: Calendar },
            { id: "mes" as const, label: "Por mes", icon: CalendarRange },
          ].map((op) => (
            <button
              key={op.id}
              onClick={() => setVista(op.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all sm:flex-none sm:px-6 ${
                vista === op.id
                  ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/25"
                  : "border border-green-200 bg-white/60 text-green-700 hover:bg-green-50"
              }`}
            >
              <op.icon className="h-4 w-4" />
              {op.label}
            </button>
          ))}
        </div>

        {periodos.length > 0 ? (
          <div className="space-y-6">
            {periodos.map((p) => {
              const comparativo = vista === "mes" ? compararConCicloAnterior(p, ciclos) : null;

              return (
                <GlassCard key={p.key} className="p-4 md:p-6">
                  {/* Encabezado del periodo */}
                  <div className="mb-4 md:mb-6 flex items-center justify-between border-b border-green-200 pb-3 md:pb-4">
                    <div className="flex items-center gap-2 md:gap-3 min-w-0">
                      {vista === "dia" ? (
                        <Calendar className="h-6 w-6 md:h-8 md:w-8 text-green-600 flex-shrink-0" />
                      ) : (
                        <CalendarRange className="h-6 w-6 md:h-8 md:w-8 text-green-600 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <h2 className="text-base md:text-2xl font-bold text-green-900 truncate capitalize">
                          {p.titulo}
                        </h2>
                        <p className="text-xs md:text-sm text-green-600">{p.subtitulo}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-2xl md:text-3xl font-bold text-green-900">{p.totalBoxes}</p>
                      <p className="text-xs md:text-sm text-green-600">Cajas</p>
                    </div>
                  </div>

                  {comparativo && <ComparativoDelMes dato={comparativo} />}

                  <TarjetasDeCalidad p={p} />
                  <DesgloseDeCajas p={p} />
                </GlassCard>
              );
            })}
          </div>
        ) : (
          <GlassCard className="p-8 md:p-12 text-center">
            <Calendar className="mx-auto mb-4 h-12 w-12 md:h-16 md:w-16 text-green-300" />
            <p className="text-base md:text-xl text-green-600">No hay datos de cosecha disponibles</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
