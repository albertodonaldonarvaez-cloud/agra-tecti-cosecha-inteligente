import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { WeatherBackground } from "@/components/WeatherBackground";
import { GlassCard } from "@/components/GlassCard";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Bar,
  ComposedChart,
  Area,
  Line,
} from "recharts";
import {
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  Moon,
  Thermometer,
  Droplets,
  Wind,
  Calendar,
  TrendingUp,
  BarChart3,
  RefreshCw,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

// Icono según condición del clima
function WeatherIcon({ condition, size = 24 }: { condition: string; size?: number }) {
  const iconProps = { size, className: "inline-block" };
  switch (condition) {
    case "sunny":
      return <Sun {...iconProps} className="text-yellow-400" />;
    case "cloudy":
      return <Cloud {...iconProps} className="text-gray-400" />;
    case "rainy":
      return <CloudRain {...iconProps} className="text-blue-400" />;
    case "stormy":
      return <CloudLightning {...iconProps} className="text-purple-400" />;
    case "clear":
      return <Moon {...iconProps} className="text-blue-200" />;
    default:
      return <Sun {...iconProps} className="text-yellow-400" />;
  }
}

// Formatear fecha
function formatDate(dateStr: string) {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

// Formatear fecha corta
function formatDateShort(dateStr: string) {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export default function ClimateAnalysis() {
  const [historicalDays, setHistoricalDays] = useState(-1); // -1 = desde inicio de cosecha
  const [forecastDays, setForecastDays] = useState(7);
  const [tableDays, setTableDays] = useState(14); // Filtro para la tabla
  const [tableSortField, setTableSortField] = useState<string>("date");
  const [tableSortOrder, setTableSortOrder] = useState<"asc" | "desc">("desc");

  // Queries con refetch automático
  const { data: currentWeather, isLoading: loadingCurrent, refetch: refetchCurrent } = trpc.weather.getCurrent.useQuery(
    undefined,
    {
      refetchInterval: 5 * 60 * 1000, // Refetch cada 5 minutos
      refetchOnWindowFocus: true,
    }
  );
  const { data: forecast, isLoading: loadingForecast } = trpc.weather.getExtendedForecast.useQuery(
    { days: forecastDays },
    {
      refetchInterval: 10 * 60 * 1000, // Refetch cada 10 minutos
      refetchOnWindowFocus: true,
    }
  );
  
  // Datos de cajas por día (mover antes para calcular fecha de inicio)
  const { data: boxesByDay } = trpc.boxes.list.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // Calcular fecha de inicio de cosecha (primera caja registrada)
  const harvestStartInfo = useMemo(() => {
    if (!boxesByDay || boxesByDay.length === 0) return { date: null, daysAgo: 365 };
    
    // Encontrar la fecha más antigua
    let oldestDate: Date | null = null;
    boxesByDay.forEach((box: any) => {
      const boxDate = new Date(box.submissionTime);
      if (!oldestDate || boxDate < oldestDate) {
        oldestDate = boxDate;
      }
    });
    
    if (!oldestDate) return { date: null, daysAgo: 365 };
    
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - oldestDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
      date: oldestDate.toISOString().split("T")[0],
      daysAgo: diffDays + 1 // +1 para incluir el día de inicio
    };
  }, [boxesByDay]);

  // Calcular fechas para históricos
  const historicalDates = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() - 1); // Ayer
    const start = new Date();
    
    // Si historicalDays es -1, usar desde inicio de cosecha
    const daysToUse = historicalDays === -1 ? harvestStartInfo.daysAgo : historicalDays;
    start.setDate(start.getDate() - daysToUse);
    
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }, [historicalDays, harvestStartInfo.daysAgo]);

  const { data: historicalWeather, isLoading: loadingHistorical } = trpc.weather.getHistoricalDetailed.useQuery(
    historicalDates,
    {
      refetchInterval: 10 * 60 * 1000,
      refetchOnWindowFocus: true,
    }
  );
  
  // Datos de cosecha para el mismo período
  const { data: harvestData } = trpc.analytics.getStats.useQuery({
    startDate: historicalDates.startDate,
    endDate: historicalDates.endDate,
  });

  // Combinar datos de clima y cosecha para correlación
  const correlationData = useMemo(() => {
    if (!historicalWeather || !boxesByDay) return [];

    // Agrupar cajas por fecha
    const boxesByDate: Record<string, { count: number; weight: number; firstQuality: number }> = {};
    boxesByDay?.forEach((box: any) => {
      const date = new Date(box.submissionTime).toISOString().split("T")[0];
      if (!boxesByDate[date]) {
        boxesByDate[date] = { count: 0, weight: 0, firstQuality: 0 };
      }
      boxesByDate[date].count++;
      boxesByDate[date].weight += box.weight || 0;
      if (box.quality === "primera") {
        boxesByDate[date].firstQuality++;
      }
    });

    // Combinar con datos de clima
    return historicalWeather.map((weather) => {
      const harvest = boxesByDate[weather.date] || { count: 0, weight: 0, firstQuality: 0 };
      return {
        date: weather.date,
        dateFormatted: formatDateShort(weather.date),
        tempMax: weather.temperatureMax,
        tempMin: weather.temperatureMin,
        tempMean: weather.temperatureMean,
        precipitation: weather.precipitation,
        cloudCover: weather.cloudCover,
        boxes: harvest.count,
        weight: harvest.weight / 1000, // kg
        firstQualityPercent: harvest.count > 0 ? (harvest.firstQuality / harvest.count) * 100 : 0,
        condition: weather.condition,
      };
    });
  }, [historicalWeather, boxesByDay]);

  // Calcular correlaciones
  const correlationStats = useMemo(() => {
    if (correlationData.length < 5) return null;

    const dataWithHarvest = correlationData.filter((d) => d.boxes > 0);
    if (dataWithHarvest.length < 5) return null;

    // Calcular promedios
    const avgTemp = dataWithHarvest.reduce((sum, d) => sum + d.tempMean, 0) / dataWithHarvest.length;
    const avgBoxes = dataWithHarvest.reduce((sum, d) => sum + d.boxes, 0) / dataWithHarvest.length;
    const avgPrecip = dataWithHarvest.reduce((sum, d) => sum + d.precipitation, 0) / dataWithHarvest.length;

    // Días con mejor cosecha
    const sortedByBoxes = [...dataWithHarvest].sort((a, b) => b.boxes - a.boxes);
    const topDays = sortedByBoxes.slice(0, 5);
    const avgTempTopDays = topDays.reduce((sum, d) => sum + d.tempMean, 0) / topDays.length;

    // Días con lluvia vs sin lluvia
    const rainyDays = dataWithHarvest.filter((d) => d.precipitation > 1);
    const dryDays = dataWithHarvest.filter((d) => d.precipitation <= 1);
    const avgBoxesRainy = rainyDays.length > 0 ? rainyDays.reduce((sum, d) => sum + d.boxes, 0) / rainyDays.length : 0;
    const avgBoxesDry = dryDays.length > 0 ? dryDays.reduce((sum, d) => sum + d.boxes, 0) / dryDays.length : 0;

    return {
      avgTemp: avgTemp.toFixed(1),
      avgBoxes: avgBoxes.toFixed(0),
      avgPrecip: avgPrecip.toFixed(1),
      avgTempTopDays: avgTempTopDays.toFixed(1),
      avgBoxesRainy: avgBoxesRainy.toFixed(0),
      avgBoxesDry: avgBoxesDry.toFixed(0),
      totalDays: dataWithHarvest.length,
      rainyDays: rainyDays.length,
      dryDays: dryDays.length,
    };
  }, [correlationData]);

  // Datos filtrados y ordenados para la tabla
  const tableData = useMemo(() => {
    if (!correlationData.length) return [];
    
    // Filtrar por días seleccionados
    let filtered = correlationData;
    if (tableDays > 0) {
      filtered = correlationData.slice(-tableDays);
    }
    
    // Ordenar
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (tableSortField) {
        case "date":
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case "tempMax":
          comparison = a.tempMax - b.tempMax;
          break;
        case "tempMin":
          comparison = a.tempMin - b.tempMin;
          break;
        case "tempMean":
          comparison = a.tempMean - b.tempMean;
          break;
        case "precipitation":
          comparison = a.precipitation - b.precipitation;
          break;
        case "boxes":
          comparison = a.boxes - b.boxes;
          break;
        case "weight":
          comparison = a.weight - b.weight;
          break;
        default:
          comparison = 0;
      }
      return tableSortOrder === "asc" ? comparison : -comparison;
    });
    
    return sorted;
  }, [correlationData, tableDays, tableSortField, tableSortOrder]);

  // Función para cambiar ordenamiento de la tabla
  const handleTableSort = (field: string) => {
    if (tableSortField === field) {
      setTableSortOrder(tableSortOrder === "asc" ? "desc" : "asc");
    } else {
      setTableSortField(field);
      setTableSortOrder("desc");
    }
  };

  // Icono de ordenamiento
  const SortIcon = ({ field }: { field: string }) => {
    if (tableSortField !== field) return null;
    return tableSortOrder === "asc" ? (
      <ChevronUp className="w-4 h-4 inline ml-1" />
    ) : (
      <ChevronDown className="w-4 h-4 inline ml-1" />
    );
  };

  const weatherCondition = currentWeather?.condition || "sunny";
  const isLoading = loadingCurrent || loadingForecast || loadingHistorical;

  return (
    <div className="relative min-h-screen">
      {/* Fondo dinámico */}
      <WeatherBackground weatherCondition={weatherCondition} temperature={currentWeather?.temperature} />

      {/* Contenido */}
      <div className="relative z-10 px-4 md:px-8 lg:px-16 py-6 md:py-10 space-y-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white drop-shadow-lg flex items-center gap-3">
              <BarChart3 className="w-8 h-8" />
              Análisis Clima y Cosecha
            </h1>
            <p className="text-white/80 mt-1">Correlación entre condiciones climáticas y producción</p>
          </div>
          <button
            onClick={() => refetchCurrent()}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>

        {/* Clima Actual */}
        <GlassCard className="p-6 md:p-8">
          {loadingCurrent ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-yellow-500 mx-auto mb-2" />
                <p className="text-gray-500">Cargando clima actual...</p>
              </div>
            </div>
          ) : currentWeather ? (
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <WeatherIcon condition={currentWeather.condition} size={64} />
                  <p className="text-lg font-medium text-gray-700 mt-2">{currentWeather.conditionText}</p>
                </div>
                <div>
                  <div className="text-6xl font-bold text-gray-800">
                    {currentWeather.temperature.toFixed(0)}°
                  </div>
                  <p className="text-gray-500">Sensación: {currentWeather.apparentTemperature.toFixed(0)}°C</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-6 text-center">
                <div>
                  <Droplets className="w-6 h-6 mx-auto text-blue-500" />
                  <p className="text-2xl font-bold text-gray-800">{currentWeather.humidity}%</p>
                  <p className="text-sm text-gray-500">Humedad</p>
                </div>
                <div>
                  <Wind className="w-6 h-6 mx-auto text-gray-500" />
                  <p className="text-2xl font-bold text-gray-800">{currentWeather.windSpeed.toFixed(0)}</p>
                  <p className="text-sm text-gray-500">km/h Viento</p>
                </div>
                <div>
                  <Cloud className="w-6 h-6 mx-auto text-gray-400" />
                  <p className="text-2xl font-bold text-gray-800">{currentWeather.cloudCover}%</p>
                  <p className="text-sm text-gray-500">Nubosidad</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No hay datos de clima disponibles
            </div>
          )}
        </GlassCard>

        {/* Pronóstico Extendido */}
        <GlassCard className="p-6 md:p-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Pronóstico Próximos Días
            </h2>
            <select
              value={forecastDays}
              onChange={(e) => setForecastDays(Number(e.target.value))}
              className="px-3 py-1 border rounded-lg text-sm"
            >
              <option value={3}>3 días</option>
              <option value={7}>7 días</option>
              <option value={14}>14 días</option>
            </select>
          </div>
          {loadingForecast ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
                <p className="text-gray-500">Cargando pronóstico...</p>
              </div>
            </div>
          ) : forecast && forecast.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {forecast.map((day, i) => (
                <div
                  key={day.date}
                  className={`p-4 rounded-xl text-center transition-all ${
                    i === 0 ? "bg-green-100 border-2 border-green-400" : "bg-white/50 hover:bg-white/70"
                  }`}
                >
                  <p className="text-sm font-medium text-gray-600">{formatDate(day.date)}</p>
                  <div className="my-2">
                    <WeatherIcon condition={day.condition} size={36} />
                  </div>
                  <p className="text-lg font-bold text-gray-800">
                    {day.temperatureMax.toFixed(0)}° / {day.temperatureMin.toFixed(0)}°
                  </p>
                  <p className="text-xs text-gray-500">{day.conditionText}</p>
                  {day.precipitationProbability > 0 && (
                    <p className="text-xs text-blue-600 mt-1">
                      <Droplets className="w-3 h-3 inline" /> {day.precipitationProbability}%
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No hay datos de pronóstico disponibles
            </div>
          )}
        </GlassCard>

        {/* Estadísticas de Correlación */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {loadingHistorical ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <GlassCard key={i} className="p-4 md:p-6 text-center">
                  <div className="animate-pulse">
                    <div className="w-8 h-8 bg-gray-200 rounded-full mx-auto mb-2"></div>
                    <div className="h-8 bg-gray-200 rounded w-16 mx-auto mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-24 mx-auto"></div>
                  </div>
                </GlassCard>
              ))}
            </>
          ) : correlationStats ? (
            <>
              <GlassCard className="p-4 md:p-6 text-center">
                <Thermometer className="w-8 h-8 mx-auto text-orange-500 mb-2" />
                <p className="text-3xl font-bold text-gray-800">{correlationStats.avgTemp}°C</p>
                <p className="text-sm text-gray-500">Temp. Promedio</p>
              </GlassCard>
              <GlassCard className="p-4 md:p-6 text-center">
                <TrendingUp className="w-8 h-8 mx-auto text-green-500 mb-2" />
                <p className="text-3xl font-bold text-gray-800">{correlationStats.avgBoxes}</p>
                <p className="text-sm text-gray-500">Cajas/Día Promedio</p>
              </GlassCard>
              <GlassCard className="p-4 md:p-6 text-center">
                <Sun className="w-8 h-8 mx-auto text-yellow-500 mb-2" />
                <p className="text-3xl font-bold text-gray-800">{correlationStats.avgBoxesDry}</p>
                <p className="text-sm text-gray-500">Cajas/Día Seco</p>
              </GlassCard>
              <GlassCard className="p-4 md:p-6 text-center">
                <CloudRain className="w-8 h-8 mx-auto text-blue-500 mb-2" />
                <p className="text-3xl font-bold text-gray-800">{correlationStats.avgBoxesRainy}</p>
                <p className="text-sm text-gray-500">Cajas/Día Lluvioso</p>
              </GlassCard>
            </>
          ) : (
            <>
              <GlassCard className="p-4 md:p-6 text-center">
                <Thermometer className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                <p className="text-3xl font-bold text-gray-400">--</p>
                <p className="text-sm text-gray-500">Temp. Promedio</p>
              </GlassCard>
              <GlassCard className="p-4 md:p-6 text-center">
                <TrendingUp className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                <p className="text-3xl font-bold text-gray-400">--</p>
                <p className="text-sm text-gray-500">Cajas/Día Promedio</p>
              </GlassCard>
              <GlassCard className="p-4 md:p-6 text-center">
                <Sun className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                <p className="text-3xl font-bold text-gray-400">--</p>
                <p className="text-sm text-gray-500">Cajas/Día Seco</p>
              </GlassCard>
              <GlassCard className="p-4 md:p-6 text-center">
                <CloudRain className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                <p className="text-3xl font-bold text-gray-400">--</p>
                <p className="text-sm text-gray-500">Cajas/Día Lluvioso</p>
              </GlassCard>
            </>
          )}
        </div>

        {/* Gráfica de Correlación Temperatura vs Cosecha */}
        <GlassCard className="p-6 md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Temperatura vs Cosecha {historicalDays === -1 
                ? `(Desde inicio: ${harvestStartInfo.date ? formatDateShort(harvestStartInfo.date) : 'cargando...'})` 
                : `(Últimos ${historicalDays} días)`}
            </h2>
            <select
              value={historicalDays}
              onChange={(e) => setHistoricalDays(Number(e.target.value))}
              className="px-3 py-2 border rounded-lg text-sm bg-white shadow-sm"
            >
              <option value={-1}>Desde inicio cosecha</option>
              <option value={90}>90 días</option>
              <option value={60}>60 días</option>
              <option value={30}>30 días</option>
              <option value={14}>14 días</option>
              <option value={7}>7 días</option>
            </select>
          </div>
          <div className="h-80">
            {loadingHistorical ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <RefreshCw className="w-8 h-8 animate-spin text-green-500 mx-auto mb-2" />
                  <p className="text-gray-500">Cargando datos históricos...</p>
                </div>
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={correlationData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="dateFormatted" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="temp" orientation="left" domain={[10, 40]} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="boxes" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "rgba(255,255,255,0.95)", borderRadius: "8px" }}
                  formatter={(value: number, name: string) => {
                    if (name === "Temp. Máx" || name === "Temp. Mín" || name === "Temp. Promedio") return [`${value.toFixed(1)}°C`, name];
                    if (name === "Cajas") return [value, name];
                    return [value, name];
                  }}
                />
                <Legend />
                <Area
                  yAxisId="temp"
                  type="monotone"
                  dataKey="tempMax"
                  name="Temp. Máx"
                  fill="rgba(255, 99, 71, 0.2)"
                  stroke="#ff6347"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="tempMean"
                  name="Temp. Promedio"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                />
                <Area
                  yAxisId="temp"
                  type="monotone"
                  dataKey="tempMin"
                  name="Temp. Mín"
                  fill="rgba(70, 130, 180, 0.2)"
                  stroke="#4682b4"
                  strokeWidth={2}
                />
                <Bar yAxisId="boxes" dataKey="boxes" name="Cajas" fill="#22c55e" opacity={0.7} />
              </ComposedChart>
            </ResponsiveContainer>
            )}
          </div>
        </GlassCard>

        {/* Gráfica de Precipitación vs Cosecha */}
        <GlassCard className="p-6 md:p-8">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-4">
            <Droplets className="w-5 h-5" />
            Precipitación vs Cosecha
          </h2>
          <div className="h-80">
            {loadingHistorical ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
                  <p className="text-gray-500">Cargando datos...</p>
                </div>
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={correlationData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="dateFormatted" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="precip" orientation="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="boxes" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "rgba(255,255,255,0.95)", borderRadius: "8px" }}
                  formatter={(value: number, name: string) => {
                    if (name === "Precipitación") return [`${value.toFixed(1)} mm`, name];
                    if (name === "Cajas") return [value, name];
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar yAxisId="precip" dataKey="precipitation" name="Precipitación" fill="#3b82f6" opacity={0.7} />
                <Line
                  yAxisId="boxes"
                  type="monotone"
                  dataKey="boxes"
                  name="Cajas"
                  stroke="#22c55e"
                  strokeWidth={3}
                  dot={{ fill: "#22c55e", r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            )}
          </div>
        </GlassCard>

        {/* Tabla de Datos Históricos con Filtro */}
        <GlassCard className="p-6 md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <h2 className="text-xl font-bold text-gray-800">Datos Históricos Detallados</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Mostrar:</span>
              <select
                value={tableDays}
                onChange={(e) => setTableDays(Number(e.target.value))}
                className="px-3 py-2 border rounded-lg text-sm bg-white shadow-sm"
              >
                <option value={-1}>Todo el historial</option>
                <option value={90}>Últimos 90 días</option>
                <option value={60}>Últimos 60 días</option>
                <option value={30}>Últimos 30 días</option>
                <option value={14}>Últimas 2 semanas</option>
                <option value={7}>Última semana</option>
              </select>
            </div>
          </div>
          {loadingHistorical ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-green-500 mx-auto mb-2" />
                <p className="text-gray-500">Cargando datos históricos...</p>
              </div>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th 
                    className="px-4 py-2 text-left cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => handleTableSort("date")}
                  >
                    Fecha <SortIcon field="date" />
                  </th>
                  <th className="px-4 py-2 text-center">Clima</th>
                  <th 
                    className="px-4 py-2 text-right cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => handleTableSort("tempMax")}
                  >
                    Temp. Máx <SortIcon field="tempMax" />
                  </th>
                  <th 
                    className="px-4 py-2 text-right cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => handleTableSort("tempMin")}
                  >
                    Temp. Mín <SortIcon field="tempMin" />
                  </th>
                  <th 
                    className="px-4 py-2 text-right cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => handleTableSort("tempMean")}
                  >
                    Temp. Prom <SortIcon field="tempMean" />
                  </th>
                  <th 
                    className="px-4 py-2 text-right cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => handleTableSort("precipitation")}
                  >
                    Lluvia <SortIcon field="precipitation" />
                  </th>
                  <th 
                    className="px-4 py-2 text-right cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => handleTableSort("boxes")}
                  >
                    Cajas <SortIcon field="boxes" />
                  </th>
                  <th 
                    className="px-4 py-2 text-right cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => handleTableSort("weight")}
                  >
                    Peso (kg) <SortIcon field="weight" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((row) => (
                  <tr key={row.date} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">{formatDate(row.date)}</td>
                    <td className="px-4 py-2 text-center">
                      <WeatherIcon condition={row.condition} size={20} />
                    </td>
                    <td className="px-4 py-2 text-right text-red-600">{row.tempMax.toFixed(1)}°</td>
                    <td className="px-4 py-2 text-right text-blue-600">{row.tempMin.toFixed(1)}°</td>
                    <td className="px-4 py-2 text-right text-orange-500 font-medium">{row.tempMean.toFixed(1)}°</td>
                    <td className="px-4 py-2 text-right">
                      {row.precipitation > 0 ? (
                        <span className="text-blue-600">{row.precipitation.toFixed(1)} mm</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-green-600">{row.boxes}</td>
                    <td className="px-4 py-2 text-right">{row.weight.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tableData.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No hay datos para el período seleccionado
              </div>
            )}
            {tableData.length > 0 && (
              <div className="text-sm text-gray-500 mt-4 text-right">
                Mostrando {tableData.length} registros
              </div>
            )}
          </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
