import { Loading } from "@/components/Loading";
import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { ProtectedPage } from "@/components/ProtectedPage";
import { Button } from "@/components/ui/button";
import { getProxiedImageUrl } from "@/lib/imageProxy";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Package, TrendingUp, AlertCircle, CheckCircle, Image as ImageIcon, X, Cloud, Calendar as CalendarIcon } from "lucide-react";
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
  
  const { data: boxes } = trpc.boxes.list.useQuery(undefined, {
    enabled: !!user,
  });

  // Calcular rango de fechas de toda la temporada de cosecha
  const harvestDateRange = useMemo(() => {
    if (!boxes || boxes.length === 0) return null;
    const dates = boxes.map(b => new Date(b.submissionTime).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    return {
      startDate: minDate.toISOString().split('T')[0],
      endDate: maxDate.toISOString().split('T')[0],
    };
  }, [boxes]);

  // Calcular rango de fechas según selección (toda la temporada o mes específico)
  const dateRange = useMemo(() => {
    if (selectedMonth === 'all') {
      return harvestDateRange;
    }
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    };
  }, [selectedMonth, harvestDateRange]);

  // Obtener los días que tienen cosecha (para filtrar la tabla)
  const harvestDays = useMemo(() => {
    if (!boxes || boxes.length === 0) return new Set<string>();
    const days = new Set<string>();
    boxes.forEach(b => {
      const dateKey = new Date(b.submissionTime).toISOString().split('T')[0];
      days.add(dateKey);
    });
    return days;
  }, [boxes]);

  // Obtener meses disponibles con datos de cosecha
  const availableMonths = useMemo(() => {
    if (!boxes || boxes.length === 0) return [];
    const months = new Set<string>();
    boxes.forEach(b => {
      const d = new Date(b.submissionTime);
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    return Array.from(months).sort().reverse();
  }, [boxes]);

  // Obtener configuración de ubicación primero
  const { data: locationConfig } = trpc.locationConfig.get.useQuery(undefined, {
    enabled: !!user,
  });

  // Obtener datos meteorológicos del rango seleccionado (solo si hay ubicación y rango)
  const { data: weatherData, isLoading: weatherLoading } = trpc.weather.getForDateRange.useQuery(
    dateRange!,
    { enabled: !!user && !!locationConfig && !!dateRange }
  );


  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  const stats = useMemo(() => {
    if (!boxes) return <Loading />;

    const total = boxes.length;
    // El peso está en gramos, convertir a kilogramos
    const totalWeight = boxes.reduce((sum, box) => sum + box.weight, 0) / 1000;
    
    // Calcular calidades según los códigos especiales
    const firstQuality = boxes.filter(b => b.harvesterId !== 98 && b.harvesterId !== 99).length;
    const secondQuality = boxes.filter(b => b.harvesterId === 98).length;
    const waste = boxes.filter(b => b.harvesterId === 99).length;

    // Calcular peso por calidad
    const firstQualityWeight = boxes
      .filter(b => b.harvesterId !== 98 && b.harvesterId !== 99)
      .reduce((sum, box) => sum + box.weight, 0) / 1000;
    const secondQualityWeight = boxes
      .filter(b => b.harvesterId === 98)
      .reduce((sum, box) => sum + box.weight, 0) / 1000;
    const wasteWeight = boxes
      .filter(b => b.harvesterId === 99)
      .reduce((sum, box) => sum + box.weight, 0) / 1000;

    return {
      total,
      totalWeight,
      firstQuality,
      secondQuality,
      waste,
      firstQualityWeight,
      secondQualityWeight,
      wasteWeight,
      firstQualityPercent: total > 0 ? (firstQuality / total * 100).toFixed(1) : 0,
      secondQualityPercent: total > 0 ? (secondQuality / total * 100).toFixed(1) : 0,
      wastePercent: total > 0 ? (waste / total * 100).toFixed(1) : 0,
    };
  }, [boxes]);

  // Preparar datos para la gráfica de líneas (en kilogramos) con temperatura
  const chartData = useMemo(() => {
    if (!boxes || boxes.length === 0) return [];
    
    // Usar un Map con fecha completa como clave para ordenar correctamente
    const dateMap = new Map<string, { fullDate: Date; dateKey: string; date: string; primera: number; segunda: number; desperdicio: number }>();
    
    boxes.forEach(box => {
      const fullDate = new Date(box.submissionTime);
      const dateKey = fullDate.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Si se seleccionó un mes específico, filtrar
      if (selectedMonth !== 'all') {
        const [year, month] = selectedMonth.split('-').map(Number);
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0, 23, 59, 59);
        if (fullDate < monthStart || fullDate > monthEnd) return;
      }
      
      const displayDate = fullDate.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
      
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { fullDate, dateKey, date: displayDate, primera: 0, segunda: 0, desperdicio: 0 });
      }
      
      const entry = dateMap.get(dateKey)!;
      const weightKg = box.weight / 1000; // Convertir gramos a kilogramos
      if (box.harvesterId === 99) entry.desperdicio += weightKg;
      else if (box.harvesterId === 98) entry.segunda += weightKg;
      else entry.primera += weightKg;
    });
    
    // Ordenar por fecha
    const sortedEntries = Array.from(dateMap.values())
      .sort((a, b) => a.fullDate.getTime() - b.fullDate.getTime());
    
    // Agregar datos de temperatura si están disponibles
    const weatherArray = Array.isArray(weatherData) ? weatherData : [];
    
    return sortedEntries.map(entry => {
      const weather = weatherArray.find((w: any) => w.date === entry.dateKey);
      return {
        date: entry.date,
        primera: Number(entry.primera.toFixed(2)),
        segunda: Number(entry.segunda.toFixed(2)),
        desperdicio: Number(entry.desperdicio.toFixed(2)),
        tempMax: weather ? Number(weather.temperatureMax.toFixed(1)) : null,
        tempMin: weather ? Number(weather.temperatureMin.toFixed(1)) : null,
        tempProm: weather ? Number(weather.temperatureMean.toFixed(1)) : null,
      };
    });
  }, [boxes, weatherData, selectedMonth, weatherLoading]);

  // Obtener últimas 5 cajas con imágenes
  const recentBoxesWithImages = useMemo(() => {
    if (!boxes) return [];
    return boxes.filter(b => b.photoUrl).slice(-5).reverse();
  }, [boxes]);

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

  // Mostrar skeleton loader mientras cargan los datos
  const isLoadingData = !stats || !boxes;

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
            {/* Skeleton de estadísticas */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white/50 backdrop-blur-sm rounded-lg p-6 h-24"></div>
              ))}
            </div>
            {/* Skeleton de gráfica */}
            <div className="bg-white/50 backdrop-blur-sm rounded-lg p-6 h-96"></div>
            {/* Skeleton de tabla */}
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
            {chartData.length > 0 && (
               <GlassCard className="p-6">
                <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold text-green-900">
                    Evolución de Calidad (Kilogramos)
                    <span className="ml-2 text-sm font-normal text-green-600">
                      {chartData.length} días de cosecha
                    </span>
                  </h3>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5 text-green-600" />
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="rounded-lg border border-green-200 bg-white px-4 py-2 text-sm text-green-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
                    >
                      <option value="all">📅 Toda la temporada</option>
                      {availableMonths.map(m => {
                        const [year, month] = m.split('-').map(Number);
                        const date = new Date(year, month - 1);
                        const label = date.toLocaleDateString('es-MX', { year: 'numeric', month: 'long' });
                        return <option key={m} value={m}>{label}</option>;
                      })}
                    </select>
                  </div>
                </div>
                <div className="w-full overflow-x-auto">
                  <div style={{ minWidth: chartData.length > 7 ? `${chartData.length * 60}px` : '100%', height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                  <LineChart 
                    key={`chart-${selectedMonth}-${weatherData?.length || 0}-${chartData.length}`}
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
                      dot={{ fill: '#10b981', r: 4 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="segunda" 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      name="Segunda Calidad"
                      dot={{ fill: '#f59e0b', r: 4 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="desperdicio" 
                      stroke="#ef4444" 
                      strokeWidth={2}
                      name="Desperdicio"
                      dot={{ fill: '#ef4444', r: 4 }}
                    />
                    </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </GlassCard>
            )}
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
                  <p className="text-sm text-green-600">{locationConfig.locationName} • Solo días con cosecha</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-green-600" />
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="rounded-lg border border-green-200 bg-white px-4 py-2 text-green-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
                >
                  <option value="all">📅 Toda la temporada</option>
                  {availableMonths.map(m => {
                    const [year, month] = m.split('-').map(Number);
                    const date = new Date(year, month - 1);
                    const label = date.toLocaleDateString('es-MX', { year: 'numeric', month: 'long' });
                    return <option key={m} value={m}>{label}</option>;
                  })}
                </select>
              </div>
            </div>
            <p className="mb-4 text-sm text-green-700">
              🌡️ Se recomienda usar estaciones meteorológicas locales para mejorar la precisión de los datos de temperatura
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
                  {/* Datos históricos - Solo días con cosecha */}
                  {weatherData && weatherData
                    .filter((weather: any) => harvestDays.has(weather.date))
                    .map((weather: any) => {
                    const dayBoxes = boxes?.filter(b => {
                      const boxDate = new Date(b.submissionTime).toISOString().split('T')[0];
                      return boxDate === weather.date;
                    }) || [];
                    const totalWeight = dayBoxes.reduce((sum, b) => sum + b.weight, 0) / 1000;
                    const firstQualityWeight = dayBoxes
                      .filter(b => b.harvesterId !== 98 && b.harvesterId !== 99)
                      .reduce((sum, b) => sum + b.weight, 0) / 1000;
                    const totalBoxes = dayBoxes.length;
                    
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
                  })}

                  {weatherLoading && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-green-600">
                        Cargando datos meteorológicos...
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
