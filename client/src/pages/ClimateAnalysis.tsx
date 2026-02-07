import { useState, useMemo } from "react";
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

function formatDate(dateStr: string) {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

function formatDateShort(dateStr: string) {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export default function ClimateAnalysis() {
  const [historicalDays, setHistoricalDays] = useState(-1); // -1 = desde inicio de cosecha
  const [forecastDays, setForecastDays] = useState(7);
  const [tableDays, setTableDays] = useState(-1);
  const [tableSortField, setTableSortField] = useState<string>("date");
  const [tableSortOrder, setTableSortOrder] = useState<"asc" | "desc">("desc");

  // ===== QUERIES OPTIMIZADAS =====
  // Clima actual
  const { 
    data: currentWeather, 
    isLoading: loadingCurrent, 
    refetch: refetchCurrent,
    isError: isErrorCurrent,
    error: errorCurrent,
  } = trpc.weather.getCurrent.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: 2000,
    staleTime: 2 * 60 * 1000,
  });
  
  // Pronóstico
  const { 
    data: forecast, 
    isLoading: loadingForecast,
    refetch: refetchForecast,
    isError: isErrorForecast,
    error: errorForecast,
  } = trpc.weather.getExtendedForecast.useQuery(
    { days: forecastDays },
    {
      refetchInterval: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 3,
      retryDelay: 2000,
      staleTime: 5 * 60 * 1000,
    }
  );

  // OPTIMIZACIÓN: Usar endpoint agregado en lugar de descargar todas las cajas
  const { data: harvestByDay, isLoading: loadingHarvest } = trpc.boxes.harvestByDay.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    staleTime: 3 * 60 * 1000,
    retry: 3,
    retryDelay: 2000,
  });

  // Fecha de inicio de cosecha (query ligera)
  const { data: harvestStartDate } = trpc.boxes.harvestStartDate.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Calcular días desde inicio de cosecha
  const harvestDaysAgo = useMemo(() => {
    if (!harvestStartDate) return 365;
    const start = new Date(harvestStartDate + "T00:00:00");
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [harvestStartDate]);

  // Rango de fechas para clima histórico (carga una sola vez el máximo)
  const maxHistoricalDates = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() - 1);
    const start = new Date();
    const maxDays = Math.max(harvestDaysAgo, 90);
    start.setDate(start.getDate() - maxDays);
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }, [harvestDaysAgo]);

  // Clima histórico
  const { data: historicalWeather, isLoading: loadingHistorical } = trpc.weather.getHistoricalDetailed.useQuery(
    maxHistoricalDates,
    {
      refetchInterval: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
      staleTime: 10 * 60 * 1000,
      retry: 3,
      retryDelay: 2000,
    }
  );

  // ===== DATOS PROCESADOS (todo local, sin consultas extra) =====

  // Combinar clima + cosecha - SOLO DÍAS CON COSECHA
  const allCorrelationData = useMemo(() => {
    if (!historicalWeather || !harvestByDay || harvestByDay.length === 0) return [];

    // Crear mapa de cosecha por fecha
    const harvestMap: Record<string, { boxes: number; totalWeight: number; firstQuality: number }> = {};
    harvestByDay.forEach((day: any) => {
      harvestMap[day.date] = {
        boxes: day.boxes,
        totalWeight: day.totalWeight,
        firstQuality: day.firstQuality,
      };
    });

    // Solo incluir días con cosecha
    return historicalWeather
      .filter((weather: any) => harvestMap[weather.date] && harvestMap[weather.date].boxes > 0)
      .map((weather: any) => {
        const harvest = harvestMap[weather.date];
        return {
          date: weather.date,
          dateFormatted: formatDateShort(weather.date),
          tempMax: weather.temperatureMax,
          tempMin: weather.temperatureMin,
          tempMean: weather.temperatureMean,
          precipitation: weather.precipitation,
          cloudCover: weather.cloudCover,
          boxes: harvest.boxes,
          weight: harvest.totalWeight / 1000,
          firstQualityPercent: harvest.boxes > 0 ? (harvest.firstQuality / harvest.boxes) * 100 : 0,
          condition: weather.condition,
        };
      });
  }, [historicalWeather, harvestByDay]);

  // Filtrado local por rango de días (instantáneo)
  const correlationData = useMemo(() => {
    if (!allCorrelationData.length) return [];
    if (historicalDays === -1) return allCorrelationData;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - historicalDays);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];
    return allCorrelationData.filter(d => d.date >= cutoffStr);
  }, [allCorrelationData, historicalDays]);

  // Estadísticas de correlación
  const correlationStats = useMemo(() => {
    if (correlationData.length < 3) return null;
    const data = correlationData;
    const avgTemp = data.reduce((s, d) => s + d.tempMean, 0) / data.length;
    const avgBoxes = data.reduce((s, d) => s + d.boxes, 0) / data.length;
    const rainyDays = data.filter(d => d.precipitation > 1);
    const dryDays = data.filter(d => d.precipitation <= 1);
    const avgBoxesRainy = rainyDays.length > 0 ? rainyDays.reduce((s, d) => s + d.boxes, 0) / rainyDays.length : 0;
    const avgBoxesDry = dryDays.length > 0 ? dryDays.reduce((s, d) => s + d.boxes, 0) / dryDays.length : 0;
    return {
      avgTemp: avgTemp.toFixed(1),
      avgBoxes: avgBoxes.toFixed(0),
      avgBoxesRainy: avgBoxesRainy.toFixed(0),
      avgBoxesDry: avgBoxesDry.toFixed(0),
      totalDays: data.length,
      rainyDays: rainyDays.length,
      dryDays: dryDays.length,
    };
  }, [correlationData]);

  // Datos de tabla con filtro independiente
  const tableData = useMemo(() => {
    if (!allCorrelationData.length) return [];
    let filtered = allCorrelationData;
    if (tableDays > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - tableDays);
      const cutoffStr = cutoffDate.toISOString().split("T")[0];
      filtered = allCorrelationData.filter(d => d.date >= cutoffStr);
    }
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (tableSortField) {
        case "date": cmp = a.date.localeCompare(b.date); break;
        case "tempMax": cmp = a.tempMax - b.tempMax; break;
        case "tempMin": cmp = a.tempMin - b.tempMin; break;
        case "tempMean": cmp = a.tempMean - b.tempMean; break;
        case "precipitation": cmp = a.precipitation - b.precipitation; break;
        case "boxes": cmp = a.boxes - b.boxes; break;
        case "weight": cmp = a.weight - b.weight; break;
        default: cmp = 0;
      }
      return tableSortOrder === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [allCorrelationData, tableDays, tableSortField, tableSortOrder]);

  const handleTableSort = (field: string) => {
    if (tableSortField === field) {
      setTableSortOrder(tableSortOrder === "asc" ? "desc" : "asc");
    } else {
      setTableSortField(field);
      setTableSortOrder("desc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (tableSortField !== field) return null;
    return tableSortOrder === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  };

  const weatherCondition = currentWeather?.condition || "sunny";
  const dataLoading = loadingHistorical || loadingHarvest;

  return (
    <div className="relative min-h-screen">
      <WeatherBackground weatherCondition={weatherCondition} temperature={currentWeather?.temperature} />

      <div className="relative z-10 px-3 md:px-8 lg:px-16 py-4 md:py-10 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white drop-shadow-lg flex items-center gap-2">
              <BarChart3 className="w-6 h-6 md:w-8 md:h-8" />
              Análisis Clima y Cosecha
            </h1>
            <p className="text-white/70 text-sm mt-1 hidden md:block">Correlación entre condiciones climáticas y producción</p>
          </div>
          <button
            onClick={() => { refetchCurrent(); refetchForecast(); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loadingCurrent ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>

        {/* Clima Actual - Compacto en móvil */}
        <GlassCard className="p-4 md:p-8">
          {loadingCurrent ? (
            <div className="flex items-center justify-center py-6">
              <RefreshCw className="w-6 h-6 animate-spin text-yellow-500 mr-3" />
              <p className="text-gray-500">Cargando clima actual...</p>
            </div>
          ) : isErrorCurrent ? (
            <div className="flex flex-col items-center py-6">
              <Cloud className="w-10 h-10 text-gray-300 mb-2" />
              <p className="text-gray-600 text-sm mb-3">
                {errorCurrent?.message?.includes("ubicación") ? "Configure la ubicación en Ajustes" : "Error al cargar el clima"}
              </p>
              <button onClick={() => refetchCurrent()} className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm">
                <RefreshCw className="w-3 h-3 inline mr-1" /> Reintentar
              </button>
            </div>
          ) : currentWeather ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <WeatherIcon condition={currentWeather.condition} size={48} />
                  <p className="text-sm font-medium text-gray-700 mt-1">{currentWeather.conditionText}</p>
                </div>
                <div>
                  <div className="text-5xl md:text-6xl font-bold text-gray-800">{currentWeather.temperature.toFixed(0)}°</div>
                  <p className="text-gray-500 text-sm">Sensación: {currentWeather.apparentTemperature.toFixed(0)}°C</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <Droplets className="w-5 h-5 mx-auto text-blue-500" />
                  <p className="text-xl font-bold text-gray-800">{currentWeather.humidity}%</p>
                  <p className="text-xs text-gray-500">Humedad</p>
                </div>
                <div>
                  <Wind className="w-5 h-5 mx-auto text-gray-500" />
                  <p className="text-xl font-bold text-gray-800">{currentWeather.windSpeed.toFixed(0)}</p>
                  <p className="text-xs text-gray-500">km/h</p>
                </div>
                <div>
                  <Cloud className="w-5 h-5 mx-auto text-gray-400" />
                  <p className="text-xl font-bold text-gray-800">{currentWeather.cloudCover}%</p>
                  <p className="text-xs text-gray-500">Nubes</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-6">
              <RefreshCw className="w-6 h-6 animate-spin text-yellow-500 mr-3" />
              <p className="text-gray-500">Obteniendo clima...</p>
            </div>
          )}
        </GlassCard>

        {/* Pronóstico */}
        <GlassCard className="p-4 md:p-8">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg md:text-xl font-bold text-gray-800 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Pronóstico
            </h2>
            <select
              value={forecastDays}
              onChange={(e) => setForecastDays(Number(e.target.value))}
              className="px-2 py-1 border rounded-lg text-sm"
            >
              <option value={3}>3 días</option>
              <option value={7}>7 días</option>
              <option value={14}>14 días</option>
            </select>
          </div>
          {loadingForecast ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mr-3" />
              <p className="text-gray-500">Cargando pronóstico...</p>
            </div>
          ) : isErrorForecast ? (
            <div className="flex flex-col items-center py-6">
              <Calendar className="w-10 h-10 text-gray-300 mb-2" />
              <p className="text-gray-600 text-sm mb-3">
                {errorForecast?.message?.includes("ubicación") ? "Configure la ubicación en Ajustes" : "Error al cargar pronóstico"}
              </p>
              <button onClick={() => refetchForecast()} className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm">
                <RefreshCw className="w-3 h-3 inline mr-1" /> Reintentar
              </button>
            </div>
          ) : forecast && forecast.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2 md:gap-3">
              {forecast.map((day: any, i: number) => (
                <div
                  key={day.date}
                  className={`p-2 md:p-4 rounded-xl text-center transition-all ${
                    i === 0 ? "bg-green-100 border-2 border-green-400" : "bg-white/50"
                  }`}
                >
                  <p className="text-xs font-medium text-gray-600">{formatDate(day.date)}</p>
                  <div className="my-1">
                    <WeatherIcon condition={day.condition} size={28} />
                  </div>
                  <p className="text-sm font-bold text-gray-800">
                    {day.temperatureMax.toFixed(0)}° / {day.temperatureMin.toFixed(0)}°
                  </p>
                  <p className="text-xs text-gray-500 hidden sm:block">{day.conditionText}</p>
                  {day.precipitationProbability > 0 && (
                    <p className="text-xs text-blue-600 mt-0.5">
                      <Droplets className="w-3 h-3 inline" /> {day.precipitationProbability}%
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mr-3" />
              <p className="text-gray-500">Obteniendo pronóstico...</p>
            </div>
          )}
        </GlassCard>

        {/* Estadísticas de Correlación */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {dataLoading && !allCorrelationData.length ? (
            [1, 2, 3, 4].map((i) => (
              <GlassCard key={i} className="p-3 md:p-6 text-center">
                <div className="animate-pulse">
                  <div className="w-6 h-6 bg-gray-200 rounded-full mx-auto mb-2" />
                  <div className="h-6 bg-gray-200 rounded w-12 mx-auto mb-1" />
                  <div className="h-3 bg-gray-200 rounded w-20 mx-auto" />
                </div>
              </GlassCard>
            ))
          ) : correlationStats ? (
            <>
              <GlassCard className="p-3 md:p-6 text-center">
                <Thermometer className="w-6 h-6 mx-auto text-orange-500 mb-1" />
                <p className="text-2xl md:text-3xl font-bold text-gray-800">{correlationStats.avgTemp}°C</p>
                <p className="text-xs text-gray-500">Temp. Promedio</p>
              </GlassCard>
              <GlassCard className="p-3 md:p-6 text-center">
                <TrendingUp className="w-6 h-6 mx-auto text-green-500 mb-1" />
                <p className="text-2xl md:text-3xl font-bold text-gray-800">{correlationStats.avgBoxes}</p>
                <p className="text-xs text-gray-500">Cajas/Día</p>
              </GlassCard>
              <GlassCard className="p-3 md:p-6 text-center">
                <Sun className="w-6 h-6 mx-auto text-yellow-500 mb-1" />
                <p className="text-2xl md:text-3xl font-bold text-gray-800">{correlationStats.avgBoxesDry}</p>
                <p className="text-xs text-gray-500">Cajas Día Seco</p>
              </GlassCard>
              <GlassCard className="p-3 md:p-6 text-center">
                <CloudRain className="w-6 h-6 mx-auto text-blue-500 mb-1" />
                <p className="text-2xl md:text-3xl font-bold text-gray-800">{correlationStats.avgBoxesRainy}</p>
                <p className="text-xs text-gray-500">Cajas Día Lluvia</p>
              </GlassCard>
            </>
          ) : (
            [
              { icon: <Thermometer className="w-6 h-6 mx-auto text-gray-300 mb-1" />, label: "Temp. Promedio" },
              { icon: <TrendingUp className="w-6 h-6 mx-auto text-gray-300 mb-1" />, label: "Cajas/Día" },
              { icon: <Sun className="w-6 h-6 mx-auto text-gray-300 mb-1" />, label: "Cajas Día Seco" },
              { icon: <CloudRain className="w-6 h-6 mx-auto text-gray-300 mb-1" />, label: "Cajas Día Lluvia" },
            ].map((item, i) => (
              <GlassCard key={i} className="p-3 md:p-6 text-center">
                {item.icon}
                <p className="text-2xl font-bold text-gray-400">--</p>
                <p className="text-xs text-gray-500">{item.label}</p>
              </GlassCard>
            ))
          )}
        </div>

        {/* Gráfica Temperatura vs Cosecha */}
        <GlassCard className="p-4 md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg md:text-xl font-bold text-gray-800 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Temperatura vs Cosecha
              </h2>
              {correlationData.length > 0 && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  {correlationData.length} días
                </span>
              )}
            </div>
            <select
              value={historicalDays}
              onChange={(e) => setHistoricalDays(Number(e.target.value))}
              className="px-2 py-1.5 border rounded-lg text-sm bg-white shadow-sm"
            >
              <option value={-1}>Desde inicio cosecha</option>
              <option value={90}>90 días</option>
              <option value={60}>60 días</option>
              <option value={30}>30 días</option>
              <option value={14}>14 días</option>
              <option value={7}>7 días</option>
            </select>
          </div>
          <div className="h-64 md:h-80">
            {dataLoading && !allCorrelationData.length ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-green-500 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">Cargando datos...</p>
                </div>
              </div>
            ) : correlationData.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No hay datos de cosecha</p>
                  <p className="text-xs text-gray-400 mt-1">Los datos aparecerán cuando haya cajas registradas</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={correlationData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="dateFormatted" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis yAxisId="temp" orientation="left" domain={["auto", "auto"]} tick={{ fontSize: 10 }} width={35} />
                  <YAxis yAxisId="boxes" orientation="right" tick={{ fontSize: 10 }} width={35} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(255,255,255,0.95)", borderRadius: "8px", fontSize: "12px" }}
                    formatter={(value: number, name: string) => {
                      if (name.includes("Temp")) return [`${value.toFixed(1)}°C`, name];
                      return [value, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Area yAxisId="temp" type="monotone" dataKey="tempMax" name="Temp. Máx" fill="rgba(255,99,71,0.15)" stroke="#ff6347" strokeWidth={1.5} />
                  <Line yAxisId="temp" type="monotone" dataKey="tempMean" name="Temp. Prom" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  <Area yAxisId="temp" type="monotone" dataKey="tempMin" name="Temp. Mín" fill="rgba(70,130,180,0.15)" stroke="#4682b4" strokeWidth={1.5} />
                  <Bar yAxisId="boxes" dataKey="boxes" name="Cajas" fill="#22c55e" opacity={0.7} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </GlassCard>

        {/* Gráfica Precipitación vs Cosecha */}
        <GlassCard className="p-4 md:p-8">
          <h2 className="text-lg md:text-xl font-bold text-gray-800 flex items-center gap-2 mb-3">
            <Droplets className="w-5 h-5" />
            Precipitación vs Cosecha
          </h2>
          <div className="h-64 md:h-80">
            {dataLoading && !allCorrelationData.length ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">Cargando datos...</p>
                </div>
              </div>
            ) : correlationData.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Droplets className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No hay datos de cosecha</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={correlationData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="dateFormatted" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis yAxisId="precip" orientation="left" tick={{ fontSize: 10 }} width={35} />
                  <YAxis yAxisId="boxes" orientation="right" tick={{ fontSize: 10 }} width={35} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(255,255,255,0.95)", borderRadius: "8px", fontSize: "12px" }}
                    formatter={(value: number, name: string) => {
                      if (name === "Precipitación") return [`${value.toFixed(1)} mm`, name];
                      return [value, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Bar yAxisId="precip" dataKey="precipitation" name="Precipitación" fill="#3b82f6" opacity={0.7} />
                  <Line yAxisId="boxes" type="monotone" dataKey="boxes" name="Cajas" stroke="#22c55e" strokeWidth={2} dot={{ fill: "#22c55e", r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </GlassCard>

        {/* Tabla de Datos Históricos */}
        <GlassCard className="p-4 md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <h2 className="text-lg md:text-xl font-bold text-gray-800">Datos Históricos</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Mostrar:</span>
              <select
                value={tableDays}
                onChange={(e) => setTableDays(Number(e.target.value))}
                className="px-2 py-1.5 border rounded-lg text-sm bg-white shadow-sm"
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
          {dataLoading && !allCorrelationData.length ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-green-500 mr-3" />
              <p className="text-gray-500 text-sm">Cargando datos...</p>
            </div>
          ) : tableData.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No hay datos de cosecha</p>
              </div>
            </div>
          ) : (
            <>
              {/* Vista de tabla en desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-3 py-2 text-left cursor-pointer hover:bg-gray-200" onClick={() => handleTableSort("date")}>
                        Fecha <SortIcon field="date" />
                      </th>
                      <th className="px-3 py-2 text-center">Clima</th>
                      <th className="px-3 py-2 text-right cursor-pointer hover:bg-gray-200" onClick={() => handleTableSort("tempMax")}>
                        Máx <SortIcon field="tempMax" />
                      </th>
                      <th className="px-3 py-2 text-right cursor-pointer hover:bg-gray-200" onClick={() => handleTableSort("tempMin")}>
                        Mín <SortIcon field="tempMin" />
                      </th>
                      <th className="px-3 py-2 text-right cursor-pointer hover:bg-gray-200" onClick={() => handleTableSort("tempMean")}>
                        Prom <SortIcon field="tempMean" />
                      </th>
                      <th className="px-3 py-2 text-right cursor-pointer hover:bg-gray-200" onClick={() => handleTableSort("precipitation")}>
                        Lluvia <SortIcon field="precipitation" />
                      </th>
                      <th className="px-3 py-2 text-right cursor-pointer hover:bg-gray-200" onClick={() => handleTableSort("boxes")}>
                        Cajas <SortIcon field="boxes" />
                      </th>
                      <th className="px-3 py-2 text-right cursor-pointer hover:bg-gray-200" onClick={() => handleTableSort("weight")}>
                        Peso <SortIcon field="weight" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row) => (
                      <tr key={row.date} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm">{formatDate(row.date)}</td>
                        <td className="px-3 py-2 text-center"><WeatherIcon condition={row.condition} size={18} /></td>
                        <td className="px-3 py-2 text-right text-red-600">{row.tempMax.toFixed(1)}°</td>
                        <td className="px-3 py-2 text-right text-blue-600">{row.tempMin.toFixed(1)}°</td>
                        <td className="px-3 py-2 text-right text-orange-500 font-medium">{row.tempMean.toFixed(1)}°</td>
                        <td className="px-3 py-2 text-right">
                          {row.precipitation > 0 ? <span className="text-blue-600">{row.precipitation.toFixed(1)} mm</span> : <span className="text-gray-400">-</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-green-600">{row.boxes}</td>
                        <td className="px-3 py-2 text-right">{row.weight.toFixed(1)} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Vista de tarjetas en móvil */}
              <div className="md:hidden space-y-2">
                {tableData.map((row) => (
                  <div key={row.date} className="bg-white/60 rounded-lg p-3 border border-gray-100">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <WeatherIcon condition={row.condition} size={18} />
                        <span className="font-medium text-sm text-gray-800">{formatDate(row.date)}</span>
                      </div>
                      <span className="text-green-600 font-bold text-sm">{row.boxes} cajas</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs text-center">
                      <div>
                        <p className="text-gray-400">Máx</p>
                        <p className="text-red-600 font-medium">{row.tempMax.toFixed(1)}°</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Mín</p>
                        <p className="text-blue-600 font-medium">{row.tempMin.toFixed(1)}°</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Lluvia</p>
                        <p className="font-medium">{row.precipitation > 0 ? `${row.precipitation.toFixed(1)}mm` : "-"}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Peso</p>
                        <p className="font-medium">{row.weight.toFixed(1)}kg</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-gray-500 mt-3 text-right">
                {tableData.length} registros (solo días con cosecha)
              </div>
            </>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
