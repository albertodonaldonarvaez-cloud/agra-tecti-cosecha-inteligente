import { Loading } from "@/components/Loading";
import { useAuth } from "@/_core/hooks/useAuth";
import { ProtectedPage } from "@/components/ProtectedPage";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { BarChart3, Calendar, TrendingUp, Package } from "lucide-react";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  if (loading || !user) {
    return <Loading />;
  }

  const handleApplyFilter = () => {
    // Si solo hay fecha de inicio, usar la misma como fecha fin para permitir filtro de un día
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
    
    // Usar fecha local en lugar de UTC
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    
    setStartDate(startStr);
    setEndDate(endStr);
  };
  
  const handleLastMonth = () => {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 1);
    
    // Usar fecha local en lugar de UTC
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
      <div className="container">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <img src={APP_LOGO} alt="Agratec" className="h-16 w-16" />
          <div>
            <h1 className="text-4xl font-bold text-green-900">Análisis de Datos</h1>
            <p className="text-green-700">Visualiza estadísticas detalladas con filtros personalizados</p>
          </div>
        </div>

        {/* Filtros */}
        <GlassCard className="mb-6 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-green-600" />
            <h2 className="text-2xl font-semibold text-green-900">Filtros de Fecha</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="startDate">Fecha Inicio</Label>
              <div className="relative">
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                {availableDates && availableDates.length > 0 && (
                  <div className="mt-1 text-xs text-green-600">
                    {availableDates.length} días con datos disponibles
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="endDate">Fecha Fin</Label>
              <div className="relative">
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-end">
              <Button onClick={handleApplyFilter} className="w-full">
                Aplicar Filtro
              </Button>
            </div>

            <div className="flex items-end">
              <Button onClick={handleClearFilter} variant="outline" className="w-full">
                Limpiar
              </Button>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button onClick={handleLast15Days} variant="secondary" size="sm">
              Últimos 15 Días
            </Button>
            <Button onClick={handleLastMonth} variant="secondary" size="sm">
              Último Mes
            </Button>
          </div>
        </GlassCard>

        {isLoading ? (
          <GlassCard className="p-12 text-center">
            <p className="text-green-600">Cargando estadísticas...</p>
          </GlassCard>
        ) : stats ? (
          <div className="space-y-6">
            {/* Estadísticas Generales */}
            <div className="grid gap-6 md:grid-cols-3">
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
                    <p className="text-3xl font-bold text-green-900">{(stats as any).firstQualityWeight?.toFixed(2) || '0.00'}</p>
                    <p className="text-xs text-green-500">kilogramos ({stats.firstQualityPercent}%)</p>
                  </div>
                  <BarChart3 className="h-12 w-12 text-green-400" />
                </div>
              </GlassCard>
            </div>

            {/* Estadísticas por Parcela */}
            <GlassCard className="p-6">
              <h2 className="mb-4 text-2xl font-semibold text-green-900">Estadísticas por Parcela</h2>
              
              {stats.parcelStats && stats.parcelStats.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-green-200">
                        <th className="pb-2 text-left text-sm font-semibold text-green-900">Parcela</th>
                        <th className="pb-2 text-right text-sm font-semibold text-green-900">Total Cajas</th>
                        <th className="pb-2 text-right text-sm font-semibold text-green-900">Peso Total (kg)</th>
                        <th className="pb-2 text-right text-sm font-semibold text-green-900">1ra Calidad (kg)</th>
                        <th className="pb-2 text-right text-sm font-semibold text-green-900">2da Calidad (kg)</th>
                        <th className="pb-2 text-right text-sm font-semibold text-green-900">Desperdicio (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.parcelStats.map((parcel: any) => (
                        <tr key={parcel.parcelCode} className="border-b border-green-100">
                          <td className="py-3 text-sm text-green-900">
                            <div>
                              <div className="font-semibold">{parcel.parcelName}</div>
                              <div className="text-xs text-green-600">{parcel.parcelCode}</div>
                            </div>
                          </td>
                          <td className="py-3 text-right text-sm text-green-900">{parcel.total}</td>
                          <td className="py-3 text-right text-sm font-semibold text-green-900">{(parcel.weight / 1000).toFixed(2)}</td>
                          <td className="py-3 text-right text-sm text-green-900">
                            <span className="font-semibold">{(parcel.firstQualityWeight / 1000).toFixed(2)}</span>
                            <span className="ml-1 text-xs text-green-600">
                              ({((parcel.firstQuality / parcel.total) * 100).toFixed(1)}%)
                            </span>
                          </td>
                          <td className="py-3 text-right text-sm text-green-900">
                            <span className="font-semibold">{(parcel.secondQualityWeight / 1000).toFixed(2)}</span>
                            <span className="ml-1 text-xs text-yellow-600">
                              ({((parcel.secondQuality / parcel.total) * 100).toFixed(1)}%)
                            </span>
                          </td>
                          <td className="py-3 text-right text-sm text-green-900">
                            <span className="font-semibold">{(parcel.wasteWeight / 1000).toFixed(2)}</span>
                            <span className="ml-1 text-xs text-red-600">
                              ({((parcel.waste / parcel.total) * 100).toFixed(1)}%)
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center text-green-600">No hay datos de parcelas</p>
              )}
            </GlassCard>

            {/* Gráfica de Cajas por Hora */}
            <GlassCard className="p-6">
              <h2 className="mb-4 text-2xl font-semibold text-green-900">Cajas Entregadas por Hora</h2>
              <p className="mb-4 text-sm text-green-600">Análisis de productividad por hora del día</p>
              
              {stats.hourlyStats && stats.hourlyStats.length > 0 ? (
                <div className="space-y-3">
                  {stats.hourlyStats.map((hourData: any) => {
                    const maxBoxes = Math.max(...stats.hourlyStats.map((h: any) => h.totalBoxes));
                    const barWidth = maxBoxes > 0 ? (hourData.totalBoxes / maxBoxes) * 100 : 0;
                    const isLunchTime = hourData.hour >= 12 && hourData.hour <= 14;
                    const isMorning = hourData.hour >= 6 && hourData.hour < 12;
                    const isAfternoon = hourData.hour >= 14 && hourData.hour < 18;
                    
                    return (
                      <div key={hourData.hour} className="flex items-center gap-3">
                        <div className="w-16 text-right text-sm font-semibold text-green-900">
                          {hourData.hour.toString().padStart(2, '0')}:00
                        </div>
                        <div className="flex-1">
                          <div className="relative h-8 bg-green-50 rounded-lg overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 flex items-center px-3 ${
                                isLunchTime
                                  ? 'bg-orange-400'
                                  : isMorning
                                  ? 'bg-blue-400'
                                  : isAfternoon
                                  ? 'bg-green-400'
                                  : 'bg-purple-400'
                              }`}
                              style={{ width: `${barWidth}%` }}
                            >
                              <span className="text-xs font-semibold text-white">
                                {hourData.totalBoxes} cajas
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="w-24 text-right text-sm text-green-700">
                          {(hourData.totalWeight / 1000).toFixed(1)} kg
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Leyenda */}
                  <div className="mt-6 pt-4 border-t border-green-200 flex flex-wrap gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-blue-400 rounded"></div>
                      <span className="text-green-700">Mañana (6-12h)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-orange-400 rounded"></div>
                      <span className="text-green-700">Hora de comida (12-14h)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-green-400 rounded"></div>
                      <span className="text-green-700">Tarde (14-18h)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-purple-400 rounded"></div>
                      <span className="text-green-700">Otros horarios</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-center text-green-600">No hay datos por hora</p>
              )}
            </GlassCard>

            {/* Evolución de Calidad (Kilogramos) con Temperatura */}
            {stats.dailyStats && stats.dailyStats.length > 0 && (
              <GlassCard className="p-6 mb-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-2xl font-semibold text-green-900">Evolución de Calidad (Kilogramos)</h2>
                  {!locationConfig && (
                    <span className="text-xs text-orange-600">
                      ⚠️ Configure ubicación en Ajustes
                    </span>
                  )}
                </div>
                <p className="mb-4 text-sm text-green-700">
                  🌡️ Se recomienda usar estaciones meteorológicas locales para mejorar la precisión de los datos de temperatura
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-green-200">
                        <th className="pb-2 text-left text-sm font-semibold text-green-900">Fecha</th>
                        <th className="pb-2 text-right text-sm font-semibold text-green-900">Peso Total (kg)</th>
                        <th className="pb-2 text-right text-sm font-semibold text-green-900">1ra Calidad (kg)</th>
                        <th className="pb-2 text-right text-sm font-semibold text-green-900">Temp. Máx (°C)</th>
                        <th className="pb-2 text-right text-sm font-semibold text-green-900">Temp. Mín (°C)</th>
                        <th className="pb-2 text-right text-sm font-semibold text-green-900">Temp. Prom (°C)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.dailyStats.map((day: any) => {
                        const weather = weatherData?.find((w: any) => w.date === day.date);
                        return (
                          <tr key={day.date} className="border-b border-green-100">
                            <td className="py-3 text-green-900">{day.date}</td>
                            <td className="py-3 text-right font-semibold text-green-900">
                              {(day.totalWeight / 1000).toFixed(2)}
                            </td>
                            <td className="py-3 text-right text-green-900">
                              {(day.firstQualityWeight / 1000).toFixed(2)}
                            </td>
                            <td className="py-3 text-right text-green-700">
                              {weather ? `${weather.temperatureMax.toFixed(1)}` : weatherLoading ? '...' : '-'}
                            </td>
                            <td className="py-3 text-right text-blue-700">
                              {weather ? `${weather.temperatureMin.toFixed(1)}` : weatherLoading ? '...' : '-'}
                            </td>
                            <td className="py-3 text-right text-orange-700">
                              {weather ? `${weather.temperatureMean.toFixed(1)}` : weatherLoading ? '...' : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            )}

            {/* Estadísticas por Cortadora */}
            <GlassCard className="p-6">
              <h2 className="mb-4 text-2xl font-semibold text-green-900">Estadísticas por Cortadora</h2>
              
              {stats.harvesterStats && stats.harvesterStats.filter((h: any) => h.harvesterId !== 97 && h.harvesterId !== 98 && h.harvesterId !== 99).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-green-200">
                        <th className="pb-2 text-left text-sm font-semibold text-green-900">Cortadora</th>
                        <th className="pb-2 text-right text-sm font-semibold text-green-900">Total Cajas</th>
                        <th className="pb-2 text-right text-sm font-semibold text-green-900">Peso (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.harvesterStats
                        .filter((h: any) => h.harvesterId !== 97 && h.harvesterId !== 98 && h.harvesterId !== 99)
                        .sort((a: any, b: any) => a.harvesterId - b.harvesterId)
                        .map((harvester: any) => (
                        <tr key={harvester.harvesterId} className="border-b border-green-100">
                          <td className="py-3 text-left">
                            <span className="font-semibold text-green-900">#{harvester.harvesterId}</span>
                            {harvester.harvesterName && (
                              <span className="ml-2 text-sm text-green-600">({harvester.harvesterName})</span>
                            )}
                          </td>
                          <td className="py-3 text-right text-green-900">{harvester.total}</td>
                          <td className="py-3 text-right font-semibold text-green-900">
                            {(harvester.weight / 1000).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center text-green-600">No hay datos de cortadoras</p>
              )}
            </GlassCard>
          </div>
        ) : (
          <GlassCard className="p-12 text-center">
            <BarChart3 className="mx-auto mb-4 h-16 w-16 text-green-300" />
            <h3 className="mb-2 text-xl font-semibold text-green-900">No hay datos disponibles</h3>
            <p className="text-green-600">Sincroniza datos desde KoboToolbox para ver estadísticas</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
