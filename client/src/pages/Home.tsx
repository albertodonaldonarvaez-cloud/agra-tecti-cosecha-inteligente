import { Loading } from "@/components/Loading";
import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { ProtectedPage } from "@/components/ProtectedPage";
import { getProxiedImageUrl } from "@/lib/imageProxy";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Package, TrendingUp, CheckCircle, Cloud, Calendar as CalendarIcon, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  
  // ====== OPTIMIZACIÓN: Usar endpoints agregados en lugar de descargar todas las cajas ======
  
  // 1. Estadísticas agregadas (SUM, COUNT en el servidor)
  const { data: stats, isLoading: statsLoading } = trpc.boxes.dashboardStats.useQuery(undefined, {
    enabled: !!user,
    staleTime: 2 * 60 * 1000, // 2 min
    refetchInterval: 3 * 60 * 1000, // 3 min
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

  // Crear set de días con cosecha para filtrar la tabla
  const harvestDays = useMemo(() => {
    if (!dailyData) return new Set<string>();
    return new Set(dailyData.map(d => d.date));
  }, [dailyData]);

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
      <div className="container">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <img src={APP_LOGO} alt="Agratec" className="h-16 w-16" />
          <div>
            <h1 className="text-4xl font-bold text-green-900">Dashboard de Cosecha</h1>
            <p className="text-green-700">Bienvenido, {user.name}</p>
          </div>
        </div>

        {isLoadingData ? (
          <div className="space-y-6 animate-pulse">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white/50 backdrop-blur-sm rounded-lg p-6 h-24"></div>
              ))}
            </div>
            <div className="bg-white/50 backdrop-blur-sm rounded-lg p-6 h-96"></div>
            <div className="bg-white/50 backdrop-blur-sm rounded-lg p-6 h-64"></div>
          </div>
        ) : stats ? (
          <div className="space-y-6">
            {/* Estadísticas principales */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <GlassCard className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600">Total de Cajas</p>
                    <p className="text-3xl font-bold text-green-900">{stats.total}</p>
                  </div>
                  <Package className="h-12 w-12 text-green-400" />
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600">Peso Total</p>
                    <p className="text-3xl font-bold text-green-900">{stats.totalWeight ? stats.totalWeight.toFixed(2) : '0.00'}</p>
                    <p className="text-xs text-green-500">kilogramos</p>
                  </div>
                  <TrendingUp className="h-12 w-12 text-green-400" />
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600">Primera Calidad</p>
                    <p className="text-3xl font-bold text-green-900">{stats.firstQualityWeight ? stats.firstQualityWeight.toFixed(2) : '0.00'}</p>
                    <p className="text-xs text-green-500">kilogramos ({stats.firstQualityPercent}%)</p>
                  </div>
                  <CheckCircle className="h-12 w-12 text-green-400" />
                </div>
              </GlassCard>
            </div>

            {/* Distribución de calidad */}
            <GlassCard className="p-6">
              <h2 className="mb-4 text-2xl font-semibold text-green-900">Distribución de Calidad</h2>
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-green-700">Primera Calidad</span>
                    <span className="font-semibold text-green-900">{stats.firstQualityPercent}%</span>
                  </div>
                  <div className="h-4 overflow-hidden rounded-full bg-green-100">
                    <div 
                      className="h-full bg-green-500 transition-all duration-500"
                      style={{ width: `${stats.firstQualityPercent}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-green-700">Segunda Calidad</span>
                    <span className="font-semibold text-green-900">{stats.secondQualityPercent}%</span>
                  </div>
                  <div className="h-4 overflow-hidden rounded-full bg-yellow-100">
                    <div 
                      className="h-full bg-yellow-500 transition-all duration-500"
                      style={{ width: `${stats.secondQualityPercent}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-green-700">Desperdicio</span>
                    <span className="font-semibold text-green-900">{stats.wastePercent}%</span>
                  </div>
                  <div className="h-4 overflow-hidden rounded-full bg-red-100">
                    <div 
                      className="h-full bg-red-500 transition-all duration-500"
                      style={{ width: `${stats.wastePercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </GlassCard>

            {/* Gráfica de evolución temporal */}
            <GlassCard className="p-6">
              <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-semibold text-green-900">
                  Evolución de Calidad (Kilogramos)
                  {chartData.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-green-600">
                      {chartData.length} días de cosecha
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-green-600" />
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="rounded-lg border border-green-200 bg-white px-4 py-2 text-sm text-green-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
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
                <div className="flex items-center justify-center h-[300px]">
                  <RefreshCw className="h-8 w-8 text-green-500 animate-spin" />
                  <span className="ml-3 text-green-600">Cargando datos...</span>
                </div>
              ) : chartData.length > 0 ? (
                <div className="w-full overflow-x-auto">
                  <div style={{ minWidth: chartData.length > 7 ? `${chartData.length * 60}px` : '100%', height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart 
                        key={`chart-${selectedMonth}`}
                        data={chartData}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" />
                        <XAxis dataKey="date" stroke="#059669" />
                        <YAxis label={{ value: 'Kilogramos', angle: -90, position: 'insideLeft' }} stroke="#059669" />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                            border: '1px solid #10b981',
                            borderRadius: '8px'
                          }} 
                        />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="primera" 
                          stroke="#10b981" 
                          strokeWidth={2}
                          name="Primera Calidad"
                          dot={{ fill: '#10b981', r: 3 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="segunda" 
                          stroke="#f59e0b" 
                          strokeWidth={2}
                          name="Segunda Calidad"
                          dot={{ fill: '#f59e0b', r: 3 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="desperdicio" 
                          stroke="#ef4444" 
                          strokeWidth={2}
                          name="Desperdicio"
                          dot={{ fill: '#ef4444', r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-green-600">
                  <Package className="h-8 w-8 mr-2 opacity-50" />
                  No hay datos de cosecha para mostrar
                </div>
              )}
            </GlassCard>
          </div>
        ) : (
          <GlassCard className="p-12 text-center">
            <Package className="mx-auto mb-4 h-16 w-16 text-green-300" />
            <h3 className="mb-2 text-xl font-semibold text-green-900">No hay datos disponibles</h3>
            <p className="text-green-600">Sincroniza datos desde KoboToolbox para ver estadísticas</p>
          </GlassCard>
        )}
      </div>

      {/* Tabla de Temperatura y Cosecha */}
      {locationConfig && (
        <div className="container mt-8">
          <GlassCard className="p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Cloud className="h-8 w-8 text-green-600" />
                <div>
                  <h2 className="text-2xl font-semibold text-green-900">Temperatura y Cosecha - Datos Históricos</h2>
                  <p className="text-sm text-green-600">{locationConfig.locationName} - Solo días con cosecha</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-green-600" />
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="rounded-lg border border-green-200 bg-white px-4 py-2 text-green-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
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
            <p className="mb-4 text-sm text-green-700">
              Se recomienda usar estaciones meteorológicas locales para mejorar la precisión de los datos de temperatura
            </p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-green-200">
                    <th className="pb-2 text-left text-sm font-semibold text-green-900">Fecha</th>
                    <th className="pb-2 text-right text-sm font-semibold text-green-900">Cajas</th>
                    <th className="pb-2 text-right text-sm font-semibold text-green-900">Peso Total (kg)</th>
                    <th className="pb-2 text-right text-sm font-semibold text-green-900">1ra Calidad (kg)</th>
                    <th className="pb-2 text-right text-sm font-semibold text-green-900">Temp. Máx (°C)</th>
                    <th className="pb-2 text-right text-sm font-semibold text-green-900">Temp. Mín (°C)</th>
                    <th className="pb-2 text-right text-sm font-semibold text-green-900">Temp. Prom (°C)</th>
                  </tr>
                </thead>
                <tbody>
                  {weatherLoading || chartLoading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="h-5 w-5 text-green-500 animate-spin" />
                          <span className="text-green-600">Cargando datos...</span>
                        </div>
                      </td>
                    </tr>
                  ) : weatherData && chartData.length > 0 ? (
                    weatherData
                      .filter((weather: any) => harvestDays.has(weather.date))
                      .map((weather: any) => {
                        // Buscar datos de cosecha del día desde chartData (ya agregados)
                        const dayData = chartData.find(d => d.dateKey === weather.date);
                        const totalWeight = dayData ? dayData.totalWeight : 0;
                        const firstQualityWeight = dayData ? dayData.firstQualityWeight : 0;
                        const totalBoxes = dayData ? dayData.totalBoxes : 0;
                        
                        return (
                          <tr key={weather.date} className="border-b border-green-100 hover:bg-green-50/50">
                            <td className="py-3 text-green-900">
                              {new Date(weather.date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </td>
                            <td className="py-3 text-right text-xs text-green-600">
                              {totalBoxes}
                            </td>
                            <td className="py-3 text-right font-semibold text-green-900">
                              {totalWeight.toFixed(2)}
                            </td>
                            <td className="py-3 text-right text-green-900">
                              {firstQualityWeight.toFixed(2)}
                            </td>
                            <td className="py-3 text-right text-red-600">
                              {weather.temperatureMax.toFixed(1)}
                            </td>
                            <td className="py-3 text-right text-blue-600">
                              {weather.temperatureMin.toFixed(1)}
                            </td>
                            <td className="py-3 text-right text-orange-600">
                              {weather.temperatureMean.toFixed(1)}
                            </td>
                          </tr>
                        );
                      })
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-green-600">
                        No hay datos disponibles
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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
              <div className="flex-1 bg-white p-6 overflow-y-auto">
                <DialogHeader className="mb-6">
                  <DialogTitle className="text-2xl font-bold text-green-900">
                    {selectedBox.boxCode}
                  </DialogTitle>
                </DialogHeader>
                
                <div className="space-y-6">
                  <div className="border-b border-green-100 pb-4">
                    <p className="text-sm text-green-600 mb-1">Peso</p>
                    <p className="text-3xl font-bold text-green-900">{selectedBox.weight ? (selectedBox.weight / 1000).toFixed(2) : '0.00'} <span className="text-lg">kg</span></p>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-green-600 mb-1">Parcela</p>
                      <p className="text-lg font-semibold text-green-900">{selectedBox.parcelCode}</p>
                      <p className="text-sm text-gray-600">{selectedBox.parcelName}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-green-600 mb-1">Calidad</p>
                      <p className="text-lg font-semibold text-green-900">{getQualityLabel(selectedBox.harvesterId)}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-green-600 mb-1">Cortadora</p>
                      <p className="text-lg font-semibold text-green-900">#{selectedBox.harvesterId}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-green-600 mb-1">Fecha de Registro</p>
                      <p className="text-lg font-semibold text-green-900">
                        {new Date(selectedBox.submissionTime).toLocaleDateString('es-MX', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                      <p className="text-sm text-gray-600">
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
