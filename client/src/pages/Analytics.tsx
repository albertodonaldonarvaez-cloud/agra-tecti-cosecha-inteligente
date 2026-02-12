import { Loading } from "@/components/Loading";
import { useAuth } from "@/_core/hooks/useAuth";
import { ProtectedPage } from "@/components/ProtectedPage";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { BarChart3, Calendar, TrendingUp, Package, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState, useMemo, useCallback } from "react";

export default function Analytics() {
  return (
    <ProtectedPage permission="canViewAnalytics">
      <AnalyticsContent />
    </ProtectedPage>
  );
}

function AnalyticsContent() {
  const { user, loading } = useAuth();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterDates, setFilterDates] = useState<{ startDate?: string; endDate?: string }>({});

  const { data: stats, isLoading } = trpc.analytics.getStats.useQuery(filterDates, {
    enabled: !!user,
  });

  const { data: availableDates } = trpc.analytics.getAvailableDates.useQuery(undefined, {
    enabled: !!user,
  });

  // Obtener datos meteorológicos si hay filtro de fechas
  const { data: weatherData, isLoading: weatherLoading } = trpc.weather.getForDateRange.useQuery(
    {
      startDate: filterDates.startDate || "",
      endDate: filterDates.endDate || "",
    },
    {
      enabled: !!user && !!filterDates.startDate && !!filterDates.endDate,
    }
  );

  const { data: locationConfig } = trpc.locationConfig.get.useQuery(undefined, {
    enabled: !!user,
  });

  // Estado de ordenación para tabla de parcelas
  const [parcelSortField, setParcelSortField] = useState<string>("total");
  const [parcelSortOrder, setParcelSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  const handleParcelSort = useCallback((field: string) => {
    setParcelSortField(prev => {
      if (prev === field) {
        setParcelSortOrder(o => o === "asc" ? "desc" : "asc");
        return prev;
      }
      setParcelSortOrder("desc");
      return field;
    });
  }, []);

  const ParcelSortIcon = useCallback(({ field }: { field: string }) => {
    if (parcelSortField !== field) return null;
    return parcelSortOrder === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  }, [parcelSortField, parcelSortOrder]);

  const sortedParcelStats = useMemo(() => {
    if (!stats?.parcelStats) return [];
    return [...stats.parcelStats].sort((a: any, b: any) => {
      let fa: any, fb: any;
      switch (parcelSortField) {
        case "parcelName": fa = a.parcelName; fb = b.parcelName; break;
        case "total": fa = a.total; fb = b.total; break;
        case "weight": fa = a.weight; fb = b.weight; break;
        case "firstQualityWeight": fa = a.firstQualityWeight; fb = b.firstQualityWeight; break;
        case "secondQualityWeight": fa = a.secondQualityWeight; fb = b.secondQualityWeight; break;
        case "wasteWeight": fa = a.wasteWeight; fb = b.wasteWeight; break;
        default: fa = a.total; fb = b.total;
      }
      let cmp = 0;
      if (typeof fa === "string" && typeof fb === "string") cmp = fa.localeCompare(fb);
      else cmp = Number(fa) - Number(fb);
      return parcelSortOrder === "asc" ? cmp : -cmp;
    });
  }, [stats?.parcelStats, parcelSortField, parcelSortOrder]);

  if (loading || !user) {
    return <Loading />;
  }

  const handleApplyFilter = () => {
    const finalEndDate = endDate || startDate;
    setFilterDates({
      startDate: startDate || undefined,
      endDate: finalEndDate || undefined,
    });
  };

  const handleLast15Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 15);
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    setStartDate(startStr);
    setEndDate(endStr);
  };
  
  const handleLastMonth = () => {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 1);
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    setStartDate(startStr);
    setEndDate(endStr);
  };

  const handleClearFilter = () => {
    setStartDate("");
    setEndDate("");
    setFilterDates({});
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container px-3 md:px-6">
        {/* Header */}
        <div className="mb-6 md:mb-8 flex items-center gap-3 md:gap-4">
          <img src={APP_LOGO} alt="Agratec" className="h-12 w-12 md:h-16 md:w-16" />
          <div>
            <h1 className="text-2xl md:text-4xl font-bold text-green-900">Análisis de Datos</h1>
            <p className="text-xs md:text-base text-green-700">Estadísticas detalladas con filtros personalizados</p>
          </div>
        </div>

        {/* Filtros */}
        <GlassCard className="mb-4 md:mb-6 p-4 md:p-6">
          <div className="mb-3 md:mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 md:h-6 md:w-6 text-green-600" />
            <h2 className="text-lg md:text-2xl font-semibold text-green-900">Filtros de Fecha</h2>
          </div>

          <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="startDate" className="text-xs md:text-sm">Fecha Inicio</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-sm"
              />
              {availableDates && availableDates.length > 0 && (
                <div className="mt-1 text-xs text-green-600 hidden md:block">
                  {availableDates.length} días con datos
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="endDate" className="text-xs md:text-sm">Fecha Fin</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-sm"
              />
            </div>

            <div className="flex items-end">
              <Button onClick={handleApplyFilter} className="w-full text-sm">
                Aplicar
              </Button>
            </div>

            <div className="flex items-end">
              <Button onClick={handleClearFilter} variant="outline" className="w-full text-sm">
                Limpiar
              </Button>
            </div>
          </div>

          <div className="mt-3 md:mt-4 flex gap-2">
            <Button onClick={handleLast15Days} variant="secondary" size="sm" className="text-xs md:text-sm">
              15 Días
            </Button>
            <Button onClick={handleLastMonth} variant="secondary" size="sm" className="text-xs md:text-sm">
              Último Mes
            </Button>
          </div>
        </GlassCard>

        {isLoading ? (
          <GlassCard className="p-8 md:p-12 text-center">
            <RefreshCw className="h-8 w-8 text-green-500 animate-spin mx-auto mb-3" />
            <p className="text-green-600">Cargando estadísticas...</p>
          </GlassCard>
        ) : stats ? (
          <div className="space-y-4 md:space-y-6">
            {/* Estadísticas Generales */}
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
                    <p className="text-2xl md:text-3xl font-bold text-green-900">{(stats as any).firstQualityWeight?.toFixed(2) || '0.00'}</p>
                    <p className="text-xs text-green-500">kilogramos ({stats.firstQualityPercent}%)</p>
                  </div>
                  <BarChart3 className="h-8 w-8 md:h-12 md:w-12 text-green-400" />
                </div>
              </GlassCard>
            </div>

            {/* Estadísticas por Parcela */}
            <GlassCard className="p-4 md:p-6">
              <h2 className="mb-3 md:mb-4 text-lg md:text-2xl font-semibold text-green-900">Estadísticas por Parcela</h2>
              
              {sortedParcelStats.length > 0 ? (
                <>
                  {/* Vista desktop - tabla */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-green-200">
                          <th className="pb-2 text-left font-semibold text-green-900 cursor-pointer hover:bg-green-50 px-2 py-1 select-none" onClick={() => handleParcelSort("parcelName")}>
                            Parcela <ParcelSortIcon field="parcelName" />
                          </th>
                          <th className="pb-2 text-right font-semibold text-green-900 cursor-pointer hover:bg-green-50 px-2 py-1 select-none whitespace-nowrap" onClick={() => handleParcelSort("total")}>
                            Cajas <ParcelSortIcon field="total" />
                          </th>
                          <th className="pb-2 text-right font-semibold text-green-900 cursor-pointer hover:bg-green-50 px-2 py-1 select-none whitespace-nowrap" onClick={() => handleParcelSort("weight")}>
                            Peso (kg) <ParcelSortIcon field="weight" />
                          </th>
                          <th className="pb-2 text-right font-semibold text-green-900 cursor-pointer hover:bg-green-50 px-2 py-1 select-none whitespace-nowrap" onClick={() => handleParcelSort("firstQualityWeight")}>
                            1ra Cal. (kg) <ParcelSortIcon field="firstQualityWeight" />
                          </th>
                          <th className="pb-2 text-right font-semibold text-green-900 cursor-pointer hover:bg-green-50 px-2 py-1 select-none whitespace-nowrap" onClick={() => handleParcelSort("secondQualityWeight")}>
                            2da Cal. (kg) <ParcelSortIcon field="secondQualityWeight" />
                          </th>
                          <th className="pb-2 text-right font-semibold text-green-900 cursor-pointer hover:bg-green-50 px-2 py-1 select-none whitespace-nowrap" onClick={() => handleParcelSort("wasteWeight")}>
                            Desp. (kg) <ParcelSortIcon field="wasteWeight" />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedParcelStats.map((parcel: any) => (
                          <tr key={parcel.parcelCode} className="border-b border-green-100 hover:bg-green-50/50">
                            <td className="py-2.5 px-2 text-green-900">
                              <div className="font-semibold text-sm">{parcel.parcelName}</div>
                              <div className="text-xs text-green-600">{parcel.parcelCode}</div>
                            </td>
                            <td className="py-2.5 px-2 text-right text-green-900">{parcel.total}</td>
                            <td className="py-2.5 px-2 text-right font-semibold text-green-900">{(parcel.weight / 1000).toFixed(2)}</td>
                            <td className="py-2.5 px-2 text-right text-green-900">
                              <span className="font-semibold">{(parcel.firstQualityWeight / 1000).toFixed(2)}</span>
                              <span className="ml-1 text-xs text-green-600">({((parcel.firstQuality / parcel.total) * 100).toFixed(0)}%)</span>
                            </td>
                            <td className="py-2.5 px-2 text-right text-green-900">
                              <span className="font-semibold">{(parcel.secondQualityWeight / 1000).toFixed(2)}</span>
                              <span className="ml-1 text-xs text-yellow-600">({((parcel.secondQuality / parcel.total) * 100).toFixed(0)}%)</span>
                            </td>
                            <td className="py-2.5 px-2 text-right text-green-900">
                              <span className="font-semibold">{(parcel.wasteWeight / 1000).toFixed(2)}</span>
                              <span className="ml-1 text-xs text-red-600">({((parcel.waste / parcel.total) * 100).toFixed(0)}%)</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Vista móvil - tarjetas */}
                  <div className="md:hidden space-y-3">
                    {sortedParcelStats.map((parcel: any) => (
                      <div key={parcel.parcelCode} className="bg-white/60 rounded-lg p-3 border border-green-100">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-semibold text-sm text-green-900">{parcel.parcelName}</p>
                            <p className="text-xs text-green-600">{parcel.parcelCode}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-sm text-green-900">{parcel.total} cajas</p>
                            <p className="text-xs text-green-600">{(parcel.weight / 1000).toFixed(1)} kg</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-green-50 rounded p-2 text-center">
                            <p className="text-gray-500 mb-0.5">1ra Calidad</p>
                            <p className="font-bold text-green-700">{(parcel.firstQualityWeight / 1000).toFixed(1)} kg</p>
                            <p className="text-green-600">{((parcel.firstQuality / parcel.total) * 100).toFixed(0)}%</p>
                          </div>
                          <div className="bg-yellow-50 rounded p-2 text-center">
                            <p className="text-gray-500 mb-0.5">2da Calidad</p>
                            <p className="font-bold text-yellow-700">{(parcel.secondQualityWeight / 1000).toFixed(1)} kg</p>
                            <p className="text-yellow-600">{((parcel.secondQuality / parcel.total) * 100).toFixed(0)}%</p>
                          </div>
                          <div className="bg-red-50 rounded p-2 text-center">
                            <p className="text-gray-500 mb-0.5">Desperdicio</p>
                            <p className="font-bold text-red-700">{(parcel.wasteWeight / 1000).toFixed(1)} kg</p>
                            <p className="text-red-600">{((parcel.waste / parcel.total) * 100).toFixed(0)}%</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-center text-green-600 py-4">No hay datos de parcelas</p>
              )}
            </GlassCard>

            {/* Gráfica de Cajas por Hora */}
            <GlassCard className="p-4 md:p-6">
              <h2 className="mb-3 md:mb-4 text-lg md:text-2xl font-semibold text-green-900">Cajas Entregadas por Hora</h2>
              <p className="mb-3 md:mb-4 text-xs md:text-sm text-green-600">Análisis de productividad por hora del día</p>
              
              {stats.hourlyStats && stats.hourlyStats.length > 0 ? (
                <div className="space-y-2 md:space-y-3">
                  {stats.hourlyStats.map((hourData: any) => {
                    const maxBoxes = Math.max(...stats.hourlyStats.map((h: any) => h.totalBoxes));
                    const barWidth = maxBoxes > 0 ? (hourData.totalBoxes / maxBoxes) * 100 : 0;
                    const isLunchTime = hourData.hour >= 12 && hourData.hour <= 14;
                    const isMorning = hourData.hour >= 6 && hourData.hour < 12;
                    const isAfternoon = hourData.hour >= 14 && hourData.hour < 18;
                    
                    return (
                      <div key={hourData.hour} className="flex items-center gap-2 md:gap-3">
                        <div className="w-12 md:w-16 text-right text-xs md:text-sm font-semibold text-green-900 flex-shrink-0">
                          {hourData.hour.toString().padStart(2, '0')}:00
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="relative h-6 md:h-8 bg-green-50 rounded-lg overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 flex items-center px-2 md:px-3 ${
                                isLunchTime ? 'bg-orange-400' : isMorning ? 'bg-blue-400' : isAfternoon ? 'bg-green-400' : 'bg-purple-400'
                              }`}
                              style={{ width: `${barWidth}%`, minWidth: hourData.totalBoxes > 0 ? '40px' : '0' }}
                            >
                              <span className="text-[10px] md:text-xs font-semibold text-white whitespace-nowrap">
                                {hourData.totalBoxes}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="w-16 md:w-24 text-right text-xs md:text-sm text-green-700 flex-shrink-0">
                          {(hourData.totalWeight / 1000).toFixed(1)} kg
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Leyenda */}
                  <div className="mt-4 md:mt-6 pt-3 md:pt-4 border-t border-green-200 flex flex-wrap gap-3 md:gap-4 text-[10px] md:text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 md:w-4 md:h-4 bg-blue-400 rounded"></div>
                      <span className="text-green-700">Mañana</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 md:w-4 md:h-4 bg-orange-400 rounded"></div>
                      <span className="text-green-700">Comida</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 md:w-4 md:h-4 bg-green-400 rounded"></div>
                      <span className="text-green-700">Tarde</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 md:w-4 md:h-4 bg-purple-400 rounded"></div>
                      <span className="text-green-700">Otros</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-center text-green-600 py-4">No hay datos por hora</p>
              )}
            </GlassCard>

            {/* Evolución de Calidad (Kilogramos) con Temperatura */}
            {stats.dailyStats && stats.dailyStats.length > 0 && (
              <GlassCard className="p-4 md:p-6">
                <div className="mb-3 md:mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <h2 className="text-lg md:text-2xl font-semibold text-green-900">Evolución de Calidad (kg)</h2>
                  {!locationConfig && (
                    <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                      Configure ubicación en Ajustes
                    </span>
                  )}
                </div>

                {weatherLoading && (
                  <div className="flex items-center gap-2 mb-3 text-xs text-green-600">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Cargando temperaturas...
                  </div>
                )}

                {/* Vista desktop */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-green-200">
                        <th className="pb-2 text-left font-semibold text-green-900 px-2">Fecha</th>
                        <th className="pb-2 text-right font-semibold text-green-900 px-2">Peso Total (kg)</th>
                        <th className="pb-2 text-right font-semibold text-green-900 px-2">1ra Calidad (kg)</th>
                        <th className="pb-2 text-right font-semibold text-green-900 px-2">Temp. Máx</th>
                        <th className="pb-2 text-right font-semibold text-green-900 px-2">Temp. Mín</th>
                        <th className="pb-2 text-right font-semibold text-green-900 px-2">Temp. Prom</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.dailyStats.map((day: any) => {
                        const weather = weatherData?.find((w: any) => w.date === day.date);
                        return (
                          <tr key={day.date} className="border-b border-green-100 hover:bg-green-50/50">
                            <td className="py-2.5 px-2 text-green-900 text-sm">
                              {new Date(day.date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </td>
                            <td className="py-2.5 px-2 text-right font-semibold text-green-900">{(day.totalWeight / 1000).toFixed(2)}</td>
                            <td className="py-2.5 px-2 text-right text-green-900">{(day.firstQualityWeight / 1000).toFixed(2)}</td>
                            <td className="py-2.5 px-2 text-right text-red-600">
                              {weather ? `${weather.temperatureMax.toFixed(1)}°` : weatherLoading ? '...' : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="py-2.5 px-2 text-right text-blue-600">
                              {weather ? `${weather.temperatureMin.toFixed(1)}°` : weatherLoading ? '...' : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="py-2.5 px-2 text-right text-orange-600">
                              {weather ? `${weather.temperatureMean.toFixed(1)}°` : weatherLoading ? '...' : <span className="text-gray-400">-</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Vista móvil - tarjetas */}
                <div className="md:hidden space-y-2 max-h-[50vh] overflow-y-auto">
                  {stats.dailyStats.map((day: any) => {
                    const weather = weatherData?.find((w: any) => w.date === day.date);
                    return (
                      <div key={day.date} className="bg-white/60 rounded-lg p-3 border border-green-100">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium text-sm text-green-900">
                            {new Date(day.date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                          <span className="text-green-700 font-bold text-sm">{(day.totalWeight / 1000).toFixed(1)} kg</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-green-50 rounded p-1.5 text-center">
                            <p className="text-gray-500">1ra Calidad</p>
                            <p className="font-semibold text-green-700">{(day.firstQualityWeight / 1000).toFixed(1)} kg</p>
                          </div>
                          {weather ? (
                            <div className="bg-blue-50 rounded p-1.5 text-center">
                              <p className="text-gray-500">Temperatura</p>
                              <p className="font-semibold">
                                <span className="text-red-600">{weather.temperatureMax.toFixed(0)}°</span>
                                {' / '}
                                <span className="text-blue-600">{weather.temperatureMin.toFixed(0)}°</span>
                              </p>
                            </div>
                          ) : (
                            <div className="bg-gray-50 rounded p-1.5 text-center">
                              <p className="text-gray-500">Temperatura</p>
                              <p className="text-gray-400 font-medium">{weatherLoading ? '...' : '-'}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            )}

            {/* Estadísticas por Cortadora */}
            <GlassCard className="p-4 md:p-6">
              <h2 className="mb-3 md:mb-4 text-lg md:text-2xl font-semibold text-green-900">Estadísticas por Cortadora</h2>
              
              {stats.harvesterStats && stats.harvesterStats.filter((h: any) => h.harvesterId !== 97 && h.harvesterId !== 98 && h.harvesterId !== 99).length > 0 ? (
                <>
                  {/* Vista desktop */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-green-200">
                          <th className="pb-2 text-left font-semibold text-green-900 px-2">Cortadora</th>
                          <th className="pb-2 text-right font-semibold text-green-900 px-2">Total Cajas</th>
                          <th className="pb-2 text-right font-semibold text-green-900 px-2">Peso (kg)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.harvesterStats
                          .filter((h: any) => h.harvesterId !== 97 && h.harvesterId !== 98 && h.harvesterId !== 99)
                          .sort((a: any, b: any) => a.harvesterId - b.harvesterId)
                          .map((harvester: any) => (
                          <tr key={harvester.harvesterId} className="border-b border-green-100 hover:bg-green-50/50">
                            <td className="py-2.5 px-2 text-left">
                              <span className="font-semibold text-green-900">#{harvester.harvesterId}</span>
                              {harvester.harvesterName && (
                                <span className="ml-2 text-sm text-green-600">({harvester.harvesterName})</span>
                              )}
                            </td>
                            <td className="py-2.5 px-2 text-right text-green-900">{harvester.total}</td>
                            <td className="py-2.5 px-2 text-right font-semibold text-green-900">{(harvester.weight / 1000).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Vista móvil */}
                  <div className="md:hidden space-y-2">
                    {stats.harvesterStats
                      .filter((h: any) => h.harvesterId !== 97 && h.harvesterId !== 98 && h.harvesterId !== 99)
                      .sort((a: any, b: any) => a.harvesterId - b.harvesterId)
                      .map((harvester: any) => (
                      <div key={harvester.harvesterId} className="flex items-center justify-between bg-white/60 rounded-lg p-3 border border-green-100">
                        <div>
                          <span className="font-semibold text-sm text-green-900">#{harvester.harvesterId}</span>
                          {harvester.harvesterName && (
                            <span className="ml-1.5 text-xs text-green-600">({harvester.harvesterName})</span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm text-green-900">{harvester.total} cajas</p>
                          <p className="text-xs text-green-600">{(harvester.weight / 1000).toFixed(1)} kg</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-center text-green-600 py-4">No hay datos de cortadoras</p>
              )}
            </GlassCard>
          </div>
        ) : (
          <GlassCard className="p-8 md:p-12 text-center">
            <BarChart3 className="mx-auto mb-4 h-16 w-16 text-green-300" />
            <h3 className="mb-2 text-xl font-semibold text-green-900">No hay datos disponibles</h3>
            <p className="text-green-600">Sincroniza datos desde KoboToolbox para ver estadísticas</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
