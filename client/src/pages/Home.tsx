import { Loading } from "@/components/Loading";
import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { ProtectedPage } from "@/components/ProtectedPage";
import { getProxiedImageUrl } from "@/lib/imageProxy";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Package, TrendingUp, CheckCircle, Cloud, Calendar as CalendarIcon, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

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
  
  // ====== OPTIMIZACIÓN: Usar endpoints agregados en lugar de descargar todas las cajas ======
  
  // 1. Estadísticas agregadas (SUM, COUNT en el servidor)
  const { data: stats, isLoading: statsLoading } = trpc.boxes.dashboardStats.useQuery(undefined, {
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
  });

  // 2. Datos diarios agregados para la gráfica (GROUP BY fecha en el servidor)
  const { data: dailyData, isLoading: chartLoading } = trpc.boxes.dailyChartData.useQuery(
    { month: selectedMonth },
    {
      enabled: !!user,
      staleTime: 2 * 60 * 1000,
      refetchInterval: 3 * 60 * 1000,
    }
  );

  // 3. Meses disponibles (DISTINCT en el servidor)
  const { data: availableMonths } = trpc.boxes.availableMonths.useQuery(undefined, {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container px-3 md:px-6">
        {/* Header */}
        <div className="mb-6 md:mb-8 flex items-center gap-3 md:gap-4">
          <img src={APP_LOGO} alt="Agratec" className="h-12 w-12 md:h-16 md:w-16" />
          <div>
            <h1 className="text-2xl md:text-4xl font-bold text-green-900">Dashboard de Cosecha</h1>
            <p className="text-sm md:text-base text-green-700">Bienvenido, {user.name}</p>
          </div>
        </div>

        {isLoadingData ? (
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
            <h3 className="mb-2 text-xl font-semibold text-green-900">No hay datos disponibles</h3>
            <p className="text-green-600">Sincroniza datos desde KoboToolbox para ver estadísticas</p>
          </GlassCard>
        )}
      </div>

      {/* Tabla de Temperatura y Cosecha - AHORA BASADA EN chartData (cosecha), NO en weatherData */}
      {chartData.length > 0 && (
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
    </div>
  );
}
