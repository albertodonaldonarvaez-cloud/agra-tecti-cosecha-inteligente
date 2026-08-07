import { Loading } from "@/components/Loading";
import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { ProtectedPage } from "@/components/ProtectedPage";
import { getProxiedImageUrl } from "@/lib/imageProxy";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Package, TrendingUp, CheckCircle, Cloud, Calendar as CalendarIcon, RefreshCw, ChevronDown, ChevronUp, Sparkles, X, Satellite, MapPin, WifiOff, ClipboardList, BookOpen, Users, Brain, Leaf, ArrowRight, ChevronLeft, ChevronRight, RefreshCcw, Scissors, Sun, Moon, Sprout, Flag, AlertTriangle, Scale } from "lucide-react";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { getActivityTypeInfo, getStatusInfo } from "@/config/fieldNotebook";

// Fecha local de México "YYYY-MM-DD"
function todayMx(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function formatShortDate(d?: string | null): string {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

// Fase del ciclo (misma lógica que la página Ciclos)
function cyclePhase(c: { endDate: string | null; harvestEndDate: string | null; stats: { total: number } | null }, today: string) {
  if (c.endDate && c.endDate < today) return { label: "Cerrado", color: "bg-gray-100 text-gray-600 border-gray-200", icon: Moon };
  if (c.harvestEndDate) return { label: "Post-cosecha", color: "bg-purple-50 text-purple-700 border-purple-200", icon: Scissors };
  if (c.stats && c.stats.total > 0) return { label: "Cosecha activa", color: "bg-green-50 text-green-700 border-green-200", icon: Sun };
  return { label: "En desarrollo", color: "bg-blue-50 text-blue-700 border-blue-200", icon: Sprout };
}

const UPDATE_VERSION = "2.0";

const TOUR_STEPS = [
  {
    title: "¡Bienvenido a AGRA v2.0!",
    subtitle: "Tu sistema de gestión agrícola ahora es más poderoso",
    features: [
      { icon: BookOpen, color: "from-green-400 to-emerald-500", bg: "bg-green-50", border: "border-green-100", title: "Libreta de Campo Digital", desc: "Registra actividades, productos y personal" },
      { icon: ClipboardList, color: "from-amber-400 to-orange-500", bg: "bg-amber-50", border: "border-amber-100", title: "Notas Georreferenciadas", desc: "Reporta con foto + GPS, asigna al equipo" },
      { icon: WifiOff, color: "from-blue-400 to-indigo-500", bg: "bg-blue-50", border: "border-blue-100", title: "App Offline", desc: "Trabaja sin internet, sincroniza después" },
      { icon: Satellite, color: "from-purple-400 to-violet-500", bg: "bg-purple-50", border: "border-purple-100", title: "Telemetría Satelital", desc: "NDVI · NDRE · NDMI con Sentinel-2" },
      { icon: Brain, color: "from-indigo-400 to-purple-600", bg: "bg-indigo-50", border: "border-indigo-100", title: "Análisis con IA", desc: "Resumen agronómico automático inteligente" },
      { icon: Users, color: "from-cyan-400 to-blue-500", bg: "bg-cyan-50", border: "border-cyan-100", title: "Equipo y Telegram", desc: "Notificaciones automáticas al personal" },
    ],
    action: null,
  },
  {
    title: "📋 Notas de Campo",
    subtitle: "Reporta observaciones georreferenciadas con foto y GPS",
    description: "Crea reportes de plagas, daños mecánicos, problemas de riego y más. Cada nota incluye foto obligatoria, ubicación GPS automática y se puede asignar a un colaborador para seguimiento. Las notas aparecen en el mapa de la parcela.",
    highlights: ["📍 GPS automático al crear nota", "📸 Foto obligatoria como evidencia", "👤 Asigna al personal de campo", "🔔 Notificación por Telegram", "🗺️ Visualización en mapa"],
    action: "/field-notes",
    actionLabel: "Ir a Notas de Campo",
  },
  {
    title: "📖 Libreta de Campo",
    subtitle: "Registro digital de todas las actividades agrícolas",
    description: "Documenta riegos, fertilizaciones, podas, aplicaciones fitosanitarias y cualquier actividad. Vincula productos del almacén, herramientas y asigna colaboradores responsables. Todo queda registrado con fecha, parcela y evidencia fotográfica.",
    highlights: ["🌿 Riego, fertilización, podas, control de plagas", "📦 Productos y herramientas del almacén", "👥 Asigna personal responsable", "📸 Fotos de evidencia", "📊 Historial completo por parcela"],
    action: "/field-notebook",
    actionLabel: "Ir a Libreta de Campo",
  },
  {
    title: "🛰️ Telemetría Satelital",
    subtitle: "Monitoreo multiespectral con imágenes Sentinel-2",
    description: "Analiza el estado de tus parcelas con 3 índices espectrales: NDVI (vigor vegetativo), NDRE (nitrógeno y clorofila) y NDMI (estrés hídrico). Incluye evolución temporal, ortofoto de drone y análisis inteligente con IA que correlaciona datos satelitales con producción real.",
    highlights: ["🌱 NDVI — Vigor vegetativo", "🧪 NDRE — Nitrógeno y clorofila", "💧 NDMI — Estrés hídrico", "📈 Evolución temporal interactiva", "🤖 Análisis IA con datos de cosecha"],
    action: "/parcel-analysis",
    actionLabel: "Ir a Análisis de Parcela",
  },
] as const;

export default function Home() {
  return (
    <ProtectedPage permission="canViewDashboard">
      <HomeContent />
    </ProtectedPage>
  );
}

function HomeContent() {
  const { user, loading } = useAuth();
  const [selectedBox, setSelectedBox] = useState<any>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [tableSortField, setTableSortField] = useState<string>("dateKey");
  const [tableSortOrder, setTableSortOrder] = useState<"asc" | "desc">("desc");
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [, navigate] = useLocation();

  // ====== CICLOS DE PRODUCCIÓN ======
  const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null);
  const [cycleInitDone, setCycleInitDone] = useState(false);
  const today = todayMx();

  const { data: cyclesOverview, isLoading: cyclesLoading } = trpc.cycles.overview.useQuery(undefined, {
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
  });

  const cycles = cyclesOverview?.cycles ?? [];
  const cyclesExist = cycles.length > 0;
  const activeCycle = cycles.find((c) => c.id === cyclesOverview?.activeCycleId) ?? null;
  const harvestActive = !!cyclesOverview?.harvestActive;

  // Al cargar: si la cosecha del ciclo actual está activa, es la que roba la atención
  useEffect(() => {
    if (!cyclesOverview || cycleInitDone) return;
    if (cyclesOverview.harvestActive && cyclesOverview.activeCycleId) {
      setSelectedCycleId(cyclesOverview.activeCycleId);
    }
    setCycleInitDone(true);
  }, [cyclesOverview, cycleInitDone]);

  const selectedCycle = cycles.find((c) => c.id === selectedCycleId) ?? null;

  // Rango de fechas del ciclo seleccionado para acotar las estadísticas de cosecha
  const cycleScope = useMemo(() => {
    if (!selectedCycle) return {} as { startDate?: string; endDate?: string };
    return {
      startDate: selectedCycle.startDate,
      endDate: selectedCycle.harvestEndDate ?? selectedCycle.endDate ?? undefined,
    };
  }, [selectedCycle]);

  const selectCycle = useCallback((id: number | null) => {
    setSelectedCycleId(id);
    setSelectedMonth('all');
  }, []);

  // Actividades de la libreta de campo (realizadas / por realizar)
  const { data: notebookData, isLoading: notebookLoading } = trpc.fieldNotebook.dashboard.useQuery(
    { startDate: activeCycle?.startDate ?? undefined },
    {
      enabled: !!user,
      staleTime: 60 * 1000,
      refetchInterval: 3 * 60 * 1000,
    }
  );

  // Resumen semanal generado con IA (se actualiza cada semana)
  const utils = trpc.useUtils();
  const { data: weeklySummary } = trpc.weeklySummary.latest.useQuery(undefined, {
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });
  const generateSummaryMutation = trpc.weeklySummary.generate.useMutation({
    onSuccess: () => utils.weeklySummary.latest.invalidate(),
  });

  // Parcelas con actividades recientes o planificadas (con mapa satelital cacheado)
  const { data: activityParcels } = trpc.fieldNotebook.parcelsWithActivity.useQuery(undefined, {
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Mostrar modal de novedades una vez por version
  useEffect(() => {
    if (!user) return;
    const key = `agra_update_seen_${UPDATE_VERSION}`;
    if (!localStorage.getItem(key)) {
      setTimeout(() => setShowUpdateModal(true), 800);
    }
  }, [user]);

  const dismissUpdateModal = useCallback(() => {
    localStorage.setItem(`agra_update_seen_${UPDATE_VERSION}`, "true");
    setShowUpdateModal(false);
    setTourStep(0);
  }, []);

  const handleTourNext = useCallback(() => {
    if (tourStep < TOUR_STEPS.length - 1) setTourStep(s => s + 1);
    else dismissUpdateModal();
  }, [tourStep, dismissUpdateModal]);

  const handleTourAction = useCallback(() => {
    const step = TOUR_STEPS[tourStep];
    if (step.action) {
      dismissUpdateModal();
      navigate(step.action);
    }
  }, [tourStep, dismissUpdateModal, navigate]);
  
  // ====== OPTIMIZACIÓN: Usar endpoints agregados en lugar de descargar todas las cajas ======
  
  // 1. Estadísticas agregadas (SUM, COUNT en el servidor), acotadas al ciclo seleccionado
  const { data: stats, isLoading: statsLoading } = trpc.boxes.dashboardStats.useQuery(cycleScope, {
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
  });

  // 2. Datos diarios agregados para la gráfica (GROUP BY fecha en el servidor)
  const { data: dailyData, isLoading: chartLoading } = trpc.boxes.dailyChartData.useQuery(
    { month: selectedMonth, ...cycleScope },
    {
      enabled: !!user,
      staleTime: 2 * 60 * 1000,
      refetchInterval: 3 * 60 * 1000,
    }
  );

  // 3. Meses disponibles (DISTINCT en el servidor), acotados al ciclo seleccionado
  const { data: availableMonths } = trpc.boxes.availableMonths.useQuery(cycleScope, {
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });

  // 4. Últimas cajas con fotos (LIMIT 5 en el servidor)
  const { data: recentPhotos } = trpc.boxes.recentWithPhotos.useQuery(
    { limit: 5 },
    {
      enabled: !!user,
      staleTime: 2 * 60 * 1000,
    }
  );

  // 5. Configuración de ubicación
  const { data: locationConfig } = trpc.locationConfig.get.useQuery(undefined, {
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });

  // 6. Datos meteorológicos (solo si hay ubicación y rango de fechas)
  const dateRange = useMemo(() => {
    if (!stats?.firstDate || !stats?.lastDate) return null;
    if (selectedMonth === 'all') {
      return { startDate: stats.firstDate, endDate: stats.lastDate };
    }
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    };
  }, [selectedMonth, stats]);

  const { data: weatherData, isLoading: weatherLoading } = trpc.weather.getForDateRange.useQuery(
    dateRange!,
    {
      enabled: !!user && !!locationConfig && !!dateRange,
      staleTime: 5 * 60 * 1000,
    }
  );

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  // Preparar datos para la gráfica combinando datos diarios + temperatura
  const chartData = useMemo(() => {
    if (!dailyData || dailyData.length === 0) return [];
    
    const weatherArray = Array.isArray(weatherData) ? weatherData : [];
    
    return dailyData.map(entry => {
      const displayDate = new Date(entry.date + 'T12:00:00').toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
      const weather = weatherArray.find((w: any) => w.date === entry.date);
      return {
        date: displayDate,
        dateKey: entry.date,
        primera: entry.primera,
        segunda: entry.segunda,
        desperdicio: entry.desperdicio,
        totalBoxes: entry.totalBoxes,
        totalWeight: entry.totalWeight,
        firstQualityWeight: entry.firstQualityWeight,
        tempMax: weather ? Number(weather.temperatureMax.toFixed(1)) : null,
        tempMin: weather ? Number(weather.temperatureMin.toFixed(1)) : null,
        tempProm: weather ? Number(weather.temperatureMean.toFixed(1)) : null,
      };
    });
  }, [dailyData, weatherData]);

  // Datos de tabla ordenados
  const sortedTableData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    return [...chartData].sort((a, b) => {
      const fa = a[tableSortField as keyof typeof a];
      const fb = b[tableSortField as keyof typeof b];
      let cmp = 0;
      if (typeof fa === "string" && typeof fb === "string") cmp = fa.localeCompare(fb);
      else if (typeof fa === "number" && typeof fb === "number") cmp = fa - fb;
      else if (fa === null && fb !== null) cmp = -1;
      else if (fa !== null && fb === null) cmp = 1;
      return tableSortOrder === "asc" ? cmp : -cmp;
    });
  }, [chartData, tableSortField, tableSortOrder]);

  const handleTableSort = useCallback((field: string) => {
    setTableSortField(prev => {
      if (prev === field) {
        setTableSortOrder(o => o === "asc" ? "desc" : "asc");
        return prev;
      }
      setTableSortOrder("desc");
      return field;
    });
  }, []);

  const SortIcon = useCallback(({ field }: { field: string }) => {
    if (tableSortField !== field) return null;
    return tableSortOrder === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  }, [tableSortField, tableSortOrder]);

  // Calcular dominio Y dinámico basado en los datos actuales
  const yDomain = useMemo(() => {
    if (!chartData || chartData.length === 0) return [0, 100];
    const maxVal = Math.max(...chartData.map(d => Math.max(d.primera, d.segunda, d.desperdicio)));
    const roundedMax = Math.ceil(maxVal / 10) * 10 + 10;
    return [0, roundedMax];
  }, [chartData]);

  // Generar ticks del eje Y
  const yTicks = useMemo(() => {
    const [, max] = yDomain;
    const step = max <= 50 ? 5 : max <= 100 ? 10 : max <= 200 ? 20 : max <= 500 ? 50 : 100;
    const ticks = [];
    for (let i = 0; i <= max; i += step) ticks.push(i);
    return ticks;
  }, [yDomain]);

  const handleImageClick = (box: any) => {
    setSelectedBox(box);
    setShowImageModal(true);
  };

  const getQualityLabel = (harvesterId: number) => {
    if (harvesterId === 97) return "Recolecta (1ra)";
    if (harvesterId === 98) return "Segunda";
    if (harvesterId === 99) return "Desperdicio";
    return "Primera";
  };

  if (loading || !user) {
    return <Loading />;
  }

  const isLoadingData = statsLoading;
  // Sin ciclos configurados el dashboard se comporta exactamente como antes;
  // con ciclos, el detalle de cosecha solo se muestra para el ciclo seleccionado
  const showHarvestDetail = !cyclesExist || !!selectedCycle;
  const activePhase = activeCycle ? cyclePhase(activeCycle, today) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container px-3 md:px-6">
        {/* Header */}
        <div className="mb-6 md:mb-8 flex items-center gap-3 md:gap-4">
          <img src={APP_LOGO} alt="Agratec" className="h-12 w-12 md:h-16 md:w-16" />
          <div>
            <h1 className="text-2xl md:text-4xl font-bold text-green-900">
              {cyclesExist ? "Dashboard" : "Dashboard de Cosecha"}
            </h1>
            <p className="text-sm md:text-base text-green-700">Bienvenido, {user.name}</p>
          </div>
        </div>

        {/* Banda del ciclo activo */}
        {activeCycle && activePhase && (
          <GlassCard className="mb-4 md:mb-6 p-4" hover={false}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <RefreshCcw className="h-5 w-5 text-green-600" />
                <span className="font-bold text-green-900">{activeCycle.name}</span>
                <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${activePhase.color}`}>
                  <activePhase.icon className="h-3.5 w-3.5" /> {activePhase.label}
                </span>
                <span className="text-xs md:text-sm text-green-600">
                  <Scissors className="mr-1 inline h-3.5 w-3.5" />
                  Inicio (poda): {formatShortDate(activeCycle.startDate)}
                </span>
                {activeCycle.harvestStartDetected && (
                  <span className="text-xs md:text-sm text-green-600">
                    <Sun className="mr-1 inline h-3.5 w-3.5" />
                    Cosecha: {formatShortDate(activeCycle.harvestStartDetected)}
                    {activeCycle.harvestEndDate ? ` – ${formatShortDate(activeCycle.harvestEndDate)}` : " (en curso)"}
                  </span>
                )}
              </div>
              <button
                onClick={() => navigate("/cycles")}
                className="flex items-center gap-1 text-sm font-medium text-green-700 hover:text-green-900"
              >
                Gestionar ciclos <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </GlassCard>
        )}

        {/* Panorama semanal generado con IA */}
        <WeeklySummaryCard
          summary={weeklySummary}
          isAdmin={user.role === "admin"}
          onGenerate={(force) => generateSummaryMutation.mutate({ force })}
          generating={generateSummaryMutation.isPending}
          generateError={generateSummaryMutation.error?.message}
        />

        {/* Invitación a configurar el primer ciclo (solo admin, no invasivo) */}
        {!cyclesLoading && !cyclesExist && user.role === "admin" && (
          <button
            onClick={() => navigate("/cycles")}
            className="mb-4 md:mb-6 flex w-full items-center gap-3 rounded-2xl border border-dashed border-green-300 bg-green-50/60 p-3 text-left text-sm text-green-700 transition hover:bg-green-100/60"
          >
            <RefreshCcw className="h-5 w-5 shrink-0 text-green-600" />
            <span>
              <strong>Nuevo:</strong> registra tus ciclos de producción (inician con la poda/dormancia) para agrupar
              la cosecha por temporada y poner la libreta de campo al frente. <span className="underline">Configurar ciclos →</span>
            </span>
          </button>
        )}

        {/* Libreta de campo en protagonismo cuando no hay cosecha activa */}
        {cyclesExist && !harvestActive && (
          <div className="mb-4 md:mb-6">
            <FieldNotebookPanel
              data={notebookData}
              loading={notebookLoading}
              spotlight
              today={today}
              onGo={() => navigate("/field-notebook")}
            />
          </div>
        )}

        {/* Parcelas con trabajo en curso (mapa satelital + resumen) */}
        {!harvestActive && (activityParcels?.length ?? 0) > 0 && (
          <div className="mb-4 md:mb-6">
            <ParcelsWithActivitySection parcels={activityParcels!} onGoAnalysis={() => navigate("/parcel-analysis")} />
          </div>
        )}

        {/* Cosecha agrupada por ciclos */}
        {cyclesExist && (
          <div className="mb-4 md:mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg md:text-2xl font-semibold text-green-900">
                {harvestActive ? "Cosecha por ciclo" : "Cosecha de ciclos anteriores"}
              </h2>
              <span className="text-xs md:text-sm text-green-600">Toca un ciclo para ver su detalle</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cycles.map((c) => {
                const phase = cyclePhase(c, today);
                const isSelected = c.id === selectedCycleId;
                const isCurrent = c.id === cyclesOverview?.activeCycleId;
                return (
                  <button
                    key={c.id}
                    onClick={() => selectCycle(isSelected ? null : c.id)}
                    className={`rounded-3xl border bg-white/40 p-4 text-left shadow-sm backdrop-blur-xl transition hover:shadow-md ${
                      isSelected ? "border-green-500 ring-2 ring-green-400/50" : "border-green-200/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-green-900">{c.name}</span>
                      {isCurrent ? (
                        <span className="rounded-full bg-green-600 px-2.5 py-0.5 text-[10px] font-bold text-white">ACTUAL</span>
                      ) : (
                        <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${phase.color}`}>
                          {phase.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-green-600">
                      {formatShortDate(c.startDate)} – {c.endDate ? formatShortDate(c.endDate) : "abierto"}
                    </p>
                    {c.stats && c.stats.total > 0 ? (
                      <div className="mt-3 flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1 text-green-900">
                          <Package className="h-4 w-4 text-green-500" />
                          <strong>{c.stats.total.toLocaleString()}</strong> cajas
                        </span>
                        <span className="flex items-center gap-1 text-green-900">
                          <Scale className="h-4 w-4 text-green-500" />
                          <strong>{c.stats.totalWeight.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong> kg
                        </span>
                        <span className="flex items-center gap-1 text-green-900">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <strong>{c.stats.firstQualityPercent}%</strong> 1ra
                        </span>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-green-500">Sin cosecha registrada</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Título del detalle del ciclo seleccionado */}
        {cyclesExist && selectedCycle && (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg md:text-2xl font-semibold text-green-900">
              Cosecha — {selectedCycle.name}
            </h2>
            <button onClick={() => selectCycle(null)} className="text-sm text-green-600 hover:text-green-900">
              Ocultar detalle ✕
            </button>
          </div>
        )}

        {!showHarvestDetail ? null : isLoadingData ? (
          <div className="space-y-6 animate-pulse">
            <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white/50 backdrop-blur-sm rounded-lg p-6 h-24"></div>
              ))}
            </div>
            <div className="bg-white/50 backdrop-blur-sm rounded-lg p-6 h-96"></div>
          </div>
        ) : stats ? (
          <div className="space-y-4 md:space-y-6">
            {/* Estadísticas principales */}
            <div className="grid gap-3 md:gap-6 grid-cols-1 sm:grid-cols-3">
              <GlassCard className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm text-green-600">Total de Cajas</p>
                    <p className="text-2xl md:text-3xl font-bold text-green-900">{stats.total}</p>
                  </div>
                  <Package className="h-8 w-8 md:h-12 md:w-12 text-green-400" />
                </div>
              </GlassCard>

              <GlassCard className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm text-green-600">Peso Total</p>
                    <p className="text-2xl md:text-3xl font-bold text-green-900">{stats.totalWeight ? stats.totalWeight.toFixed(2) : '0.00'}</p>
                    <p className="text-xs text-green-500">kilogramos</p>
                  </div>
                  <TrendingUp className="h-8 w-8 md:h-12 md:w-12 text-green-400" />
                </div>
              </GlassCard>

              <GlassCard className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm text-green-600">Primera Calidad</p>
                    <p className="text-2xl md:text-3xl font-bold text-green-900">{stats.firstQualityWeight ? stats.firstQualityWeight.toFixed(2) : '0.00'}</p>
                    <p className="text-xs text-green-500">kilogramos ({stats.firstQualityPercent}%)</p>
                  </div>
                  <CheckCircle className="h-8 w-8 md:h-12 md:w-12 text-green-400" />
                </div>
              </GlassCard>
            </div>

            {/* Distribución de calidad */}
            <GlassCard className="p-4 md:p-6">
              <h2 className="mb-3 md:mb-4 text-lg md:text-2xl font-semibold text-green-900">Distribución de Calidad</h2>
              <div className="space-y-3 md:space-y-4">
                <div>
                  <div className="mb-1 md:mb-2 flex justify-between text-xs md:text-sm">
                    <span className="text-green-700">Primera Calidad</span>
                    <span className="font-semibold text-green-900">{stats.firstQualityPercent}%</span>
                  </div>
                  <div className="h-3 md:h-4 overflow-hidden rounded-full bg-green-100">
                    <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${stats.firstQualityPercent}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-1 md:mb-2 flex justify-between text-xs md:text-sm">
                    <span className="text-green-700">Segunda Calidad</span>
                    <span className="font-semibold text-green-900">{stats.secondQualityPercent}%</span>
                  </div>
                  <div className="h-3 md:h-4 overflow-hidden rounded-full bg-yellow-100">
                    <div className="h-full bg-yellow-500 transition-all duration-500" style={{ width: `${stats.secondQualityPercent}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-1 md:mb-2 flex justify-between text-xs md:text-sm">
                    <span className="text-green-700">Desperdicio</span>
                    <span className="font-semibold text-green-900">{stats.wastePercent}%</span>
                  </div>
                  <div className="h-3 md:h-4 overflow-hidden rounded-full bg-red-100">
                    <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${stats.wastePercent}%` }} />
                  </div>
                </div>
              </div>
            </GlassCard>

            {/* Gráfica de evolución temporal */}
            <GlassCard className="p-4 md:p-6">
              <div className="mb-3 md:mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-base md:text-lg font-semibold text-green-900">
                  Evolución de Calidad (Kilogramos)
                  {chartData.length > 0 && (
                    <span className="ml-2 text-xs md:text-sm font-normal text-green-600">
                      {chartData.length} días
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 md:h-5 md:w-5 text-green-600" />
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="rounded-lg border border-green-200 bg-white px-3 py-1.5 text-sm text-green-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
                  >
                    <option value="all">Toda la temporada</option>
                    {(availableMonths || []).map(m => {
                      const [year, month] = m.split('-').map(Number);
                      const date = new Date(year, month - 1);
                      const label = date.toLocaleDateString('es-MX', { year: 'numeric', month: 'long' });
                      return <option key={m} value={m}>{label}</option>;
                    })}
                  </select>
                </div>
              </div>
              {chartLoading ? (
                <div className="flex items-center justify-center h-[280px] md:h-[320px]">
                  <RefreshCw className="h-8 w-8 text-green-500 animate-spin" />
                  <span className="ml-3 text-green-600">Cargando datos...</span>
                </div>
              ) : chartData.length > 0 ? (
                <>
                  {/* Leyenda arriba de la gráfica */}
                  <div className="flex flex-wrap justify-center gap-3 md:gap-5 mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 rounded-full bg-green-500" />
                      <span className="text-xs md:text-sm text-green-800">1ra Calidad</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 rounded-full bg-yellow-500" />
                      <span className="text-xs md:text-sm text-yellow-800">2da Calidad</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-xs md:text-sm text-red-800">Desperdicio</span>
                    </div>
                  </div>

                  {/* Gráfica con eje Y sticky */}
                  <div className="flex">
                    {/* Eje Y fijo (sticky) */}
                    <div className="flex-shrink-0" style={{ width: '48px' }}>
                      <div style={{ height: '280px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 25 }}>
                            <YAxis 
                              domain={yDomain as [number, number]}
                              ticks={yTicks}
                              stroke="#059669" 
                              tick={{ fontSize: 11, fontWeight: 500 }} 
                              width={46}
                              axisLine={false}
                              tickLine={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="text-center text-[10px] md:text-xs text-green-600 font-medium -mt-1">kg</div>
                    </div>

                    {/* Área scrollable con la gráfica */}
                    <div className="flex-1 overflow-x-auto">
                      <div style={{ minWidth: chartData.length > 7 ? `${Math.max(chartData.length * 55, 400)}px` : '100%', height: '280px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart 
                            key={`chart-${selectedMonth}-${yDomain[1]}`}
                            data={chartData}
                            margin={{ top: 5, right: 15, left: 0, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" />
                            <XAxis 
                              dataKey="date" 
                              stroke="#059669" 
                              tick={{ fontSize: 12, fontWeight: 500 }} 
                              interval={chartData.length > 15 ? Math.floor(chartData.length / 10) : 0}
                              angle={chartData.length > 10 ? -35 : 0}
                              textAnchor={chartData.length > 10 ? "end" : "middle"}
                              height={chartData.length > 10 ? 50 : 30}
                            />
                            <YAxis 
                              domain={yDomain as [number, number]}
                              ticks={yTicks}
                              hide={true}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                                border: '1px solid #10b981',
                                borderRadius: '8px',
                                fontSize: '13px',
                                padding: '8px 12px',
                              }}
                              formatter={(value: number) => [`${value.toFixed(2)} kg`]}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="primera" 
                              stroke="#10b981" 
                              strokeWidth={2.5}
                              name="1ra Calidad"
                              dot={{ fill: '#10b981', r: 3 }}
                              activeDot={{ r: 5, strokeWidth: 2 }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="segunda" 
                              stroke="#f59e0b" 
                              strokeWidth={2.5}
                              name="2da Calidad"
                              dot={{ fill: '#f59e0b', r: 3 }}
                              activeDot={{ r: 5, strokeWidth: 2 }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="desperdicio" 
                              stroke="#ef4444" 
                              strokeWidth={2.5}
                              name="Desperdicio"
                              dot={{ fill: '#ef4444', r: 3 }}
                              activeDot={{ r: 5, strokeWidth: 2 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-green-600">
                  <Package className="h-8 w-8 mr-2 opacity-50" />
                  No hay datos de cosecha para este mes
                </div>
              )}
            </GlassCard>
          </div>
        ) : (
          <GlassCard className="p-8 md:p-12 text-center">
            <Package className="mx-auto mb-4 h-16 w-16 text-green-300" />
            <h3 className="mb-2 text-xl font-semibold text-green-900">
              {selectedCycle ? "Sin cosecha en este ciclo" : "No hay datos disponibles"}
            </h3>
            <p className="text-green-600">
              {selectedCycle
                ? "Todavía no hay cajas registradas dentro de las fechas de este ciclo"
                : "Sincroniza datos desde KoboToolbox para ver estadísticas"}
            </p>
          </GlassCard>
        )}
      </div>

      {/* Tabla de Temperatura y Cosecha - AHORA BASADA EN chartData (cosecha), NO en weatherData */}
      {showHarvestDetail && chartData.length > 0 && (
        <div className="container px-3 md:px-6 mt-6 md:mt-8">
          <GlassCard className="p-4 md:p-6">
            <div className="mb-4 md:mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 md:gap-3">
                <Cloud className="h-6 w-6 md:h-8 md:w-8 text-green-600 flex-shrink-0" />
                <div>
                  <h2 className="text-lg md:text-2xl font-semibold text-green-900">Temperatura y Cosecha</h2>
                  <p className="text-xs md:text-sm text-green-600">
                    {locationConfig ? `${locationConfig.locationName} - ` : ''}Solo días con cosecha
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 md:h-5 md:w-5 text-green-600" />
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="rounded-lg border border-green-200 bg-white px-3 py-1.5 text-sm text-green-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
                >
                  <option value="all">Toda la temporada</option>
                  {(availableMonths || []).map(m => {
                    const [year, month] = m.split('-').map(Number);
                    const date = new Date(year, month - 1);
                    const label = date.toLocaleDateString('es-MX', { year: 'numeric', month: 'long' });
                    return <option key={m} value={m}>{label}</option>;
                  })}
                </select>
              </div>
            </div>

            {!locationConfig && (
              <p className="mb-3 text-xs md:text-sm text-orange-600 bg-orange-50 px-3 py-2 rounded-lg">
                Configure la ubicación en Ajustes para ver datos de temperatura
              </p>
            )}

            {weatherLoading && (
              <div className="flex items-center gap-2 mb-3 text-sm text-green-600">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Cargando datos meteorológicos...
              </div>
            )}

            {/* Vista desktop - tabla */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-green-200">
                    <th className="pb-2 text-left font-semibold text-green-900 cursor-pointer hover:bg-green-50 px-2 py-1 select-none" onClick={() => handleTableSort("dateKey")}>
                      Fecha <SortIcon field="dateKey" />
                    </th>
                    <th className="pb-2 text-right font-semibold text-green-900 cursor-pointer hover:bg-green-50 px-2 py-1 select-none" onClick={() => handleTableSort("totalBoxes")}>
                      Cajas <SortIcon field="totalBoxes" />
                    </th>
                    <th className="pb-2 text-right font-semibold text-green-900 cursor-pointer hover:bg-green-50 px-2 py-1 select-none" onClick={() => handleTableSort("totalWeight")}>
                      Peso Total (kg) <SortIcon field="totalWeight" />
                    </th>
                    <th className="pb-2 text-right font-semibold text-green-900 cursor-pointer hover:bg-green-50 px-2 py-1 select-none" onClick={() => handleTableSort("firstQualityWeight")}>
                      1ra Calidad (kg) <SortIcon field="firstQualityWeight" />
                    </th>
                    <th className="pb-2 text-right font-semibold text-green-900 cursor-pointer hover:bg-green-50 px-2 py-1 select-none" onClick={() => handleTableSort("tempMax")}>
                      Temp. Máx <SortIcon field="tempMax" />
                    </th>
                    <th className="pb-2 text-right font-semibold text-green-900 cursor-pointer hover:bg-green-50 px-2 py-1 select-none" onClick={() => handleTableSort("tempMin")}>
                      Temp. Mín <SortIcon field="tempMin" />
                    </th>
                    <th className="pb-2 text-right font-semibold text-green-900 cursor-pointer hover:bg-green-50 px-2 py-1 select-none" onClick={() => handleTableSort("tempProm")}>
                      Temp. Prom <SortIcon field="tempProm" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTableData.map((row) => (
                    <tr key={row.dateKey} className="border-b border-green-100 hover:bg-green-50/50">
                      <td className="py-2.5 px-2 text-green-900">
                        {new Date(row.dateKey + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </td>
                      <td className="py-2.5 px-2 text-right text-green-600">{row.totalBoxes}</td>
                      <td className="py-2.5 px-2 text-right font-semibold text-green-900">{row.totalWeight.toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-right text-green-900">{row.firstQualityWeight.toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-right text-red-600">{row.tempMax !== null ? `${row.tempMax}°` : <span className="text-gray-400">-</span>}</td>
                      <td className="py-2.5 px-2 text-right text-blue-600">{row.tempMin !== null ? `${row.tempMin}°` : <span className="text-gray-400">-</span>}</td>
                      <td className="py-2.5 px-2 text-right text-orange-600">{row.tempProm !== null ? `${row.tempProm}°` : <span className="text-gray-400">-</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Vista móvil - tarjetas */}
            <div className="md:hidden space-y-2 max-h-[60vh] overflow-y-auto">
              {sortedTableData.map((row) => (
                <div key={row.dateKey} className="bg-white/60 rounded-lg p-3 border border-green-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-sm text-green-900">
                      {new Date(row.dateKey + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-green-600 font-bold text-sm">{row.totalBoxes} cajas</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-center mb-2">
                    <div className="bg-green-50 rounded p-1.5">
                      <p className="text-gray-500">Peso Total</p>
                      <p className="font-semibold text-green-900">{row.totalWeight.toFixed(1)} kg</p>
                    </div>
                    <div className="bg-green-50 rounded p-1.5">
                      <p className="text-gray-500">1ra Calidad</p>
                      <p className="font-semibold text-green-900">{row.firstQualityWeight.toFixed(1)} kg</p>
                    </div>
                    <div className="bg-green-50 rounded p-1.5">
                      <p className="text-gray-500">2da + Desp.</p>
                      <p className="font-semibold text-green-900">{(row.totalWeight - row.firstQualityWeight).toFixed(1)} kg</p>
                    </div>
                  </div>
                  {(row.tempMax !== null || row.tempMin !== null) && (
                    <div className="grid grid-cols-3 gap-2 text-xs text-center">
                      <div>
                        <p className="text-gray-400">Máx</p>
                        <p className="text-red-600 font-medium">{row.tempMax !== null ? `${row.tempMax}°` : '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Mín</p>
                        <p className="text-blue-600 font-medium">{row.tempMin !== null ? `${row.tempMin}°` : '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Prom</p>
                        <p className="text-orange-600 font-medium">{row.tempProm !== null ? `${row.tempProm}°` : '-'}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="text-xs text-gray-500 mt-3 text-right">
              {sortedTableData.length} días con cosecha
            </div>
          </GlassCard>
        </div>
      )}

      {/* Libreta de campo (versión compacta) cuando la cosecha roba la atención */}
      {cyclesExist && harvestActive && (
        <div className="container px-3 md:px-6 mt-6 md:mt-8">
          <FieldNotebookPanel
            data={notebookData}
            loading={notebookLoading}
            today={today}
            onGo={() => navigate("/field-notebook")}
          />
        </div>
      )}

      {/* Parcelas con trabajo en curso (cuando la cosecha está al frente) */}
      {harvestActive && (activityParcels?.length ?? 0) > 0 && (
        <div className="container px-3 md:px-6 mt-6 md:mt-8">
          <ParcelsWithActivitySection parcels={activityParcels!} onGoAnalysis={() => navigate("/parcel-analysis")} />
        </div>
      )}

      {/* Modal de detalle de imagen */}
      <Dialog open={showImageModal} onOpenChange={setShowImageModal}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-hidden p-0">
          {selectedBox && (
            <div className="flex flex-col lg:flex-row max-h-[90vh]">
              {/* Imagen - Lado izquierdo */}
              <div className="flex-1 bg-gray-100 flex items-center justify-center p-4 lg:p-6 min-h-[40vh] lg:min-h-[70vh]">
                <img
                  src={getProxiedImageUrl(selectedBox.photoLargeUrl || selectedBox.photoUrl)}
                  alt={selectedBox.boxCode}
                  className="w-full h-full object-contain max-h-[50vh] lg:max-h-[80vh]"
                />
              </div>
              
              {/* Información - Lado derecho */}
              <div className="flex-1 bg-white p-4 md:p-6 overflow-y-auto">
                <DialogHeader className="mb-4 md:mb-6">
                  <DialogTitle className="text-xl md:text-2xl font-bold text-green-900">
                    {selectedBox.boxCode}
                  </DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4 md:space-y-6">
                  <div className="border-b border-green-100 pb-4">
                    <p className="text-sm text-green-600 mb-1">Peso</p>
                    <p className="text-2xl md:text-3xl font-bold text-green-900">{selectedBox.weight ? (selectedBox.weight / 1000).toFixed(2) : '0.00'} <span className="text-lg">kg</span></p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-green-600 mb-1">Parcela</p>
                      <p className="text-base md:text-lg font-semibold text-green-900">{selectedBox.parcelCode}</p>
                      <p className="text-xs md:text-sm text-gray-600">{selectedBox.parcelName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-green-600 mb-1">Calidad</p>
                      <p className="text-base md:text-lg font-semibold text-green-900">{getQualityLabel(selectedBox.harvesterId)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-green-600 mb-1">Cortadora</p>
                      <p className="text-base md:text-lg font-semibold text-green-900">#{selectedBox.harvesterId}</p>
                    </div>
                    <div>
                      <p className="text-sm text-green-600 mb-1">Fecha</p>
                      <p className="text-sm md:text-base font-semibold text-green-900">
                        {new Date(selectedBox.submissionTime).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-gray-600">
                        {new Date(selectedBox.submissionTime).toLocaleTimeString('es-MX')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== TOUR DE NOVEDADES ===== */}
      {showUpdateModal && (() => {
        const step = TOUR_STEPS[tourStep];
        const isOverview = tourStep === 0;
        const isLast = tourStep === TOUR_STEPS.length - 1;

        return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4" onClick={dismissUpdateModal}>
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header gradient */}
            <div className="relative bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600 px-6 py-6 text-white overflow-hidden">
              <div className="absolute inset-0 opacity-10">
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/20" />
                <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/15" />
              </div>
              <div className="relative">
                {isOverview && (
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-5 h-5 text-yellow-300" />
                    <span className="text-xs font-bold bg-white/20 px-2.5 py-0.5 rounded-full tracking-wider uppercase">Actualización v{UPDATE_VERSION}</span>
                  </div>
                )}
                <h2 className="text-xl sm:text-2xl font-bold mt-1">{step.title}</h2>
                <p className="text-sm text-white/80 mt-1">{step.subtitle}</p>
              </div>
              <button onClick={dismissUpdateModal} className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition">
                <X className="w-4 h-4 text-white" />
              </button>
              {/* Step indicators */}
              <div className="flex gap-1.5 mt-4 relative">
                {TOUR_STEPS.map((_, i) => (
                  <button key={i} onClick={() => setTourStep(i)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${i === tourStep ? "bg-white w-8" : "bg-white/30 w-4 hover:bg-white/50"}`} />
                ))}
                <span className="ml-auto text-[10px] text-white/60">{tourStep + 1} / {TOUR_STEPS.length}</span>
              </div>
            </div>

            {/* Content */}
            <div className="px-5 py-4 max-h-[55vh] overflow-y-auto">
              {isOverview ? (
                <div className="space-y-2.5">
                  {(step as any).features.map((f: any, i: number) => {
                    const FIcon = f.icon;
                    return (
                      <div key={i} className={`flex items-center gap-3 p-3 rounded-2xl ${f.bg}/70 border ${f.border}/80`}>
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                          <FIcon className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-gray-900">{f.title}</h4>
                          <p className="text-xs text-gray-500 leading-snug">{f.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {(step as any).description}
                  </p>
                  <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Características principales</p>
                    {(step as any).highlights?.map((h: string, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-sm leading-relaxed text-gray-700">{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 bg-gray-50/80 border-t border-gray-100 space-y-2">
              {/* Action button (go to page) */}
              {!isOverview && step.action && (
                <button onClick={handleTourAction}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-sm shadow-lg hover:shadow-xl transition-all active:scale-[0.98]">
                  <ArrowRight className="w-4 h-4" /> {(step as any).actionLabel}
                </button>
              )}
              {/* Navigation */}
              <div className="flex items-center gap-2">
                {tourStep > 0 ? (
                  <button onClick={() => setTourStep(s => s - 1)}
                    className="flex items-center gap-1 px-4 py-2.5 rounded-2xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-100 transition">
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                ) : (
                  <button onClick={dismissUpdateModal}
                    className="px-4 py-2.5 rounded-2xl text-gray-400 text-sm hover:text-gray-600 transition">
                    Omitir tour
                  </button>
                )}
                <button onClick={handleTourNext}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] ${
                    isOverview
                      ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg hover:shadow-xl"
                      : isLast
                        ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg hover:shadow-xl"
                        : "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                  }`}>
                  {isOverview ? (
                    <><Leaf className="w-4 h-4" /> Iniciar recorrido <ArrowRight className="w-4 h-4" /></>
                  ) : isLast ? (
                    <><Sparkles className="w-4 h-4" /> ¡Listo, explorar!</>
                  ) : (
                    <>Siguiente <ChevronRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

// ===== PANEL DE LIBRETA DE CAMPO =====
// spotlight=true: versión protagonista (sin cosecha activa) — más grande y al frente.
// spotlight=false: versión compacta debajo de la cosecha.
interface NotebookActivity {
  id: number;
  activityType: string;
  activitySubtype: string | null;
  description: string;
  performedBy: string;
  activityDate: string | Date;
  status: string;
  parcelNames: string[];
}

interface FieldNotebookPanelProps {
  data?: {
    pending: NotebookActivity[];
    recent: NotebookActivity[];
    counts: Record<string, number>;
  };
  loading: boolean;
  spotlight?: boolean;
  today: string;
  onGo: () => void;
}

function activityDateStr(d: string | Date): string {
  if (typeof d === "string") return d.slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}

function ActivityRow({ activity, today, done }: { activity: NotebookActivity; today: string; done?: boolean }) {
  const typeInfo = getActivityTypeInfo(activity.activityType);
  const statusInfo = getStatusInfo(activity.status);
  const TypeIcon = typeInfo.icon;
  const dateStr = activityDateStr(activity.activityDate);
  const isOverdue = !done && activity.status === "planificada" && dateStr < today;

  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-3 ${isOverdue ? "border-red-200 bg-red-50/60" : "border-green-100 bg-white/60"}`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${typeInfo.color}`}>
        <TypeIcon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-green-900">{typeInfo.label}</span>
          {activity.activitySubtype && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">{activity.activitySubtype}</span>
          )}
          {isOverdue ? (
            <span className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">
              <AlertTriangle className="h-3 w-3" /> Atrasada
            </span>
          ) : (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-600">{activity.description}</p>
        <p className="mt-0.5 text-[11px] text-green-600">
          {new Date(dateStr + "T12:00:00").toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}
          {activity.parcelNames.length > 0 && <> · {activity.parcelNames.join(", ")}</>}
          {activity.performedBy && <> · {activity.performedBy}</>}
        </p>
      </div>
    </div>
  );
}

// ===== PANORAMA SEMANAL (IA) =====
// Resumen de la SEMANA PASADA generado automáticamente cada semana con IA:
// actividades + clima + satelital + etapa del ciclo.
interface WeeklySummaryCardProps {
  summary?: {
    weekStart: string;
    weekEnd: string;
    content: string;
    cyclePhase: string | null;
    createdAt: string | Date;
  } | null;
  isAdmin: boolean;
  onGenerate: (force: boolean) => void;
  generating: boolean;
  generateError?: string;
}

function WeeklySummaryCard({ summary, isAdmin, onGenerate, generating, generateError }: WeeklySummaryCardProps) {
  const [expanded, setExpanded] = useState(false);
  if (!summary && !isAdmin) return null;

  const weekLabel = summary
    ? `${formatShortDate(summary.weekStart)} – ${formatShortDate(summary.weekEnd)}`
    : null;

  return (
    <GlassCard className="mb-4 md:mb-6 p-4 md:p-5" hover={false}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-600 shadow">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-semibold text-green-900 flex items-center gap-2">
              Panorama Semanal
              <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-bold text-indigo-600">IA Tecti</span>
            </h2>
            <p className="text-xs text-green-600">
              {weekLabel ? (
                <>Resumen de la <strong>semana pasada</strong> ({weekLabel}) · se actualiza cada noche</>
              ) : (
                "Se genera automáticamente cada noche con actividades, clima y datos satelitales"
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {summary?.cyclePhase && (
            <span className="rounded-full bg-green-50 border border-green-200 px-3 py-1 text-xs font-medium text-green-700">
              {summary.cyclePhase}
            </span>
          )}
          {isAdmin && (
            <button
              onClick={() => onGenerate(!!summary)}
              disabled={generating}
              className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100 disabled:opacity-50"
              title={summary ? "Regenerar el resumen de la semana pasada" : "Generar el primer resumen"}
            >
              {generating ? "Generando..." : summary ? "Regenerar" : "Generar ahora"}
            </button>
          )}
        </div>
      </div>

      {generateError && (
        <p className="mt-2 rounded-xl bg-red-50 border border-red-200 p-2 text-xs text-red-600">{generateError}</p>
      )}

      {summary ? (
        <>
          <div className={`mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-700 ${expanded ? "" : "max-h-40 overflow-hidden"}`}>
            {summary.content}
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-900"
          >
            {expanded ? <>Ver menos <ChevronUp className="h-3.5 w-3.5" /></> : <>Ver completo <ChevronDown className="h-3.5 w-3.5" /></>}
          </button>
        </>
      ) : (
        <p className="mt-3 text-sm text-gray-500">
          Aún no hay resumen semanal. {isAdmin ? "Genera el primero con el botón (requiere la API key de IA en Ajustes)." : ""}
        </p>
      )}
    </GlassCard>
  );
}

// ===== PARCELAS CON TRABAJO EN CURSO =====
// Parcelas con actividades recientes o planificadas: mapa satelital NDVI
// cacheado + resumen de lo que se está haciendo en cada una.
interface ActivityParcel {
  parcelId: number;
  code: string;
  name: string;
  polygon: string | null;
  hasNdviMap: boolean;
  ndviMapDate: string | null;
  pendingCount: number;
  doneCount: number;
  activities: {
    id: number;
    activityType: string;
    activitySubtype: string | null;
    description: string | null;
    activityDate: string;
    status: string;
    performedBy: string | null;
  }[];
}

/**
 * Mapa NDVI de una parcela.
 *
 * La imagen satelital cubre el RECTÁNGULO que encierra la parcela, así que se
 * muestra completa (sin recortar) respetando su proporción geográfica real, y
 * encima se dibuja el contorno del terreno: lo de afuera se oscurece para que
 * se distinga de un vistazo qué es la parcela y cómo está su vigor por zonas.
 */
function ParcelNdviMap({ parcel }: { parcel: ActivityParcel }) {
  // Contorno normalizado (0..1) dentro del rectángulo de la imagen
  const shape = useMemo(() => {
    if (!parcel.polygon) return null;
    try {
      const geo = typeof parcel.polygon === "string" ? JSON.parse(parcel.polygon) : parcel.polygon;
      const ring: [number, number][] =
        geo?.coordinates?.[0] ?? (Array.isArray(geo) ? geo : null);
      if (!ring || ring.length < 3) return null;

      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const point of ring) {
        // Acepta [lng, lat] o {lat, lng}
        const lng = Array.isArray(point) ? point[0] : (point as any).lng;
        const lat = Array.isArray(point) ? point[1] : (point as any).lat;
        if (typeof lng !== "number" || typeof lat !== "number") return null;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      const spanLng = maxLng - minLng;
      const spanLat = maxLat - minLat;
      if (spanLng <= 0 || spanLat <= 0) return null;

      // Puntos normalizados; Y invertida porque arriba de la imagen es el norte
      const xy = ring.map((point) => {
        const lng = Array.isArray(point) ? point[0] : (point as any).lng;
        const lat = Array.isArray(point) ? point[1] : (point as any).lat;
        return [
          Number(((lng - minLng) / spanLng).toFixed(4)),
          Number(((maxLat - lat) / spanLat).toFixed(4)),
        ] as [number, number];
      });

      const points = xy.map(([x, y]) => `${x},${y}`).join(" ");
      // Rectángulo completo + hueco con la forma de la parcela (fill-rule evenodd)
      const maskPath =
        "M0,0 H1 V1 H0 Z M" +
        xy.map(([x, y]) => `${x},${y}`).join(" L") +
        " Z";

      // Proporción geográfica real (los grados de longitud "miden" menos según la latitud)
      const metersLng = spanLng * 111320 * Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
      const metersLat = spanLat * 110540;
      const ratio = metersLat > 0 ? metersLng / metersLat : 1;
      return { points, maskPath, ratio: Math.min(Math.max(ratio, 0.45), 2.6) };
    } catch {
      return null;
    }
  }, [parcel.polygon]);

  return (
    <div className="relative flex h-44 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 to-emerald-50 p-2">
      {parcel.hasNdviMap ? (
        <div
          className="relative h-full overflow-hidden rounded-xl shadow-md ring-1 ring-black/10"
          style={{
            // Proporción real del terreno: se ve completo, sin recortes ni deformación
            aspectRatio: String(shape?.ratio ?? 1.4),
            maxWidth: "100%",
          }}
        >
          {/* La imagen cubre el rectángulo completo: se estira a él sin recortes */}
          <img
            src={`/api/parcel-ndvi-map/${parcel.parcelId}`}
            alt={`NDVI ${parcel.name}`}
            loading="lazy"
            className="absolute inset-0 h-full w-full"
            style={{ objectFit: "fill" }}
          />
          {/* Contorno de la parcela + oscurecido de lo que queda fuera */}
          {shape && (
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d={shape.maskPath} fill="rgba(15,23,42,0.45)" fillRule="evenodd" />
              {/* non-scaling-stroke: el grosor va en píxeles, así el contorno
                  no se deforma aunque el SVG se estire al rectángulo */}
              <polygon
                points={shape.points}
                fill="none"
                stroke="rgba(0,0,0,0.55)"
                strokeWidth={4}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                points={shape.points}
                fill="none"
                stroke="white"
                strokeWidth={2}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center text-green-500">
          <MapPin className="h-8 w-8" />
          <span className="mt-1 text-xs">Sin imagen satelital reciente</span>
        </div>
      )}

      <div className="absolute left-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-green-900 shadow">
        {parcel.name}
      </div>

      {parcel.hasNdviMap && (
        <>
          {/* Escala de vigor NDVI */}
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-white/90 px-2 py-1 shadow">
            <span className="text-[9px] font-medium text-gray-500">Vigor</span>
            <span
              className="h-1.5 w-12 rounded-full"
              style={{ background: "linear-gradient(90deg,#d73027,#fee08b,#66bd63,#1a9850)" }}
            />
            <span className="text-[9px] font-medium text-gray-500">alto</span>
          </div>
          {parcel.ndviMapDate && (
            <div className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
              {formatShortDate(parcel.ndviMapDate)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ParcelsWithActivitySection({ parcels, onGoAnalysis }: { parcels: ActivityParcel[]; onGoAnalysis: () => void }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg md:text-2xl font-semibold text-green-900">
          <Satellite className="h-5 w-5 md:h-6 md:w-6 text-green-600" />
          Parcelas con trabajo en curso
        </h2>
        <button onClick={onGoAnalysis} className="flex items-center gap-1 text-sm font-medium text-green-700 hover:text-green-900">
          Análisis completo <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {parcels.map((p) => (
          <GlassCard key={p.parcelId} className="overflow-hidden p-0" hover={false}>
            {/* Mapa satelital NDVI con el contorno real de la parcela */}
            <ParcelNdviMap parcel={p} />
            {/* Resumen de actividades */}
            <div className="p-3">
              <div className="mb-2 flex items-center gap-2 text-xs">
                {p.pendingCount > 0 && (
                  <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 font-bold text-blue-700">
                    {p.pendingCount} por realizar
                  </span>
                )}
                {p.doneCount > 0 && (
                  <span className="rounded-full bg-green-50 border border-green-200 px-2 py-0.5 font-bold text-green-700">
                    {p.doneCount} realizada{p.doneCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                {p.activities.slice(0, 3).map((a) => {
                  const typeInfo = getActivityTypeInfo(a.activityType);
                  const statusInfo = getStatusInfo(a.status);
                  const TypeIcon = typeInfo.icon;
                  return (
                    <div key={a.id} className="flex items-center gap-2 text-xs">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${typeInfo.color}`}>
                        <TypeIcon style={{ width: 13, height: 13 }} />
                      </span>
                      <span className="font-medium text-green-900">{typeInfo.label}</span>
                      <span className="truncate text-gray-500">{a.description}</span>
                      <span className={`ml-auto shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

function FieldNotebookPanel({ data, loading, spotlight, today, onGo }: FieldNotebookPanelProps) {
  const pending = data?.pending ?? [];
  const recent = data?.recent ?? [];
  const counts = data?.counts ?? { planificada: 0, en_progreso: 0, completada: 0, cancelada: 0 };
  const pendingCount = (counts.planificada ?? 0) + (counts.en_progreso ?? 0);
  const shownPending = spotlight ? pending : pending.slice(0, 5);
  const shownRecent = spotlight ? recent : recent.slice(0, 5);

  return (
    <GlassCard className={spotlight ? "p-4 md:p-6" : "p-4"} hover={false}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 shadow">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className={`font-semibold text-green-900 ${spotlight ? "text-lg md:text-2xl" : "text-base md:text-lg"}`}>
              Libreta de Campo
            </h2>
            <p className="text-xs md:text-sm text-green-600">
              {pendingCount > 0
                ? `${pendingCount} actividad${pendingCount === 1 ? "" : "es"} por realizar · ${counts.completada ?? 0} realizada${(counts.completada ?? 0) === 1 ? "" : "s"}`
                : `${counts.completada ?? 0} actividad${(counts.completada ?? 0) === 1 ? "" : "es"} realizada${(counts.completada ?? 0) === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <button
          onClick={onGo}
          className="flex items-center gap-1.5 rounded-full bg-green-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-green-700"
        >
          Ir a la libreta <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center text-green-600">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Cargando actividades...
        </div>
      ) : (
        <div className={`grid gap-4 ${spotlight ? "lg:grid-cols-2" : "md:grid-cols-2"}`}>
          {/* Por realizar */}
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-green-800">
              <CalendarIcon className="h-4 w-4" /> Por realizar
              {pendingCount > 0 && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">{pendingCount}</span>
              )}
            </h3>
            {shownPending.length > 0 ? (
              <div className={`space-y-2 ${spotlight ? "max-h-[380px]" : "max-h-[260px]"} overflow-y-auto pr-1`}>
                {shownPending.map((a) => (
                  <ActivityRow key={a.id} activity={a} today={today} />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-green-200 p-4 text-center text-sm text-green-500">
                No hay actividades pendientes 🎉
              </p>
            )}
          </div>

          {/* Realizadas */}
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-green-800">
              <CheckCircle className="h-4 w-4" /> Realizadas recientemente
            </h3>
            {shownRecent.length > 0 ? (
              <div className={`space-y-2 ${spotlight ? "max-h-[380px]" : "max-h-[260px]"} overflow-y-auto pr-1`}>
                {shownRecent.map((a) => (
                  <ActivityRow key={a.id} activity={a} today={today} done />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-green-200 p-4 text-center text-sm text-green-500">
                Aún no hay actividades completadas
              </p>
            )}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
