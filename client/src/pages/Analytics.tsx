import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { BarChart3, Calendar, TrendingUp, Package } from "lucide-react";
import { useEffect, useState } from "react";

export default function Analytics() {
  const { user, loading } = useAuth();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterDates, setFilterDates] = useState<{ startDate?: string; endDate?: string }>({});

  const { data: stats, isLoading } = trpc.analytics.getStats.useQuery(filterDates, {
    enabled: !!user,
  });

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  if (loading || !user) {
    return null;
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
    
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    
    setStartDate(startStr);
    setEndDate(endStr);
    setFilterDates({ startDate: startStr, endDate: endStr });
  };

  const handleLastMonth = () => {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 1);
    
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    
    setStartDate(startStr);
    setEndDate(endStr);
    setFilterDates({ startDate: startStr, endDate: endStr });
  };

  const handleClearFilter = () => {
    setStartDate("");
    setEndDate("");
    setFilterDates({});
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold text-green-900">Análisis de Datos</h1>
          <p className="text-green-700">Visualiza estadísticas detalladas con filtros personalizados</p>
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
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="endDate">Fecha Fin</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
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
                    <p className="text-3xl font-bold text-green-900">{stats.totalWeight.toFixed(2)}</p>
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
                        <th className="pb-2 text-right text-sm font-semibold text-green-900">Peso (kg)</th>
                        <th className="pb-2 text-right text-sm font-semibold text-green-900">1ra Calidad</th>
                        <th className="pb-2 text-right text-sm font-semibold text-green-900">2da Calidad</th>
                        <th className="pb-2 text-right text-sm font-semibold text-green-900">Desperdicio</th>
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
                          <td className="py-3 text-right text-sm text-green-900">{(parcel.weight / 1000).toFixed(2)}</td>
                          <td className="py-3 text-right text-sm text-green-900">
                            {parcel.firstQuality}
                            <span className="ml-1 text-xs text-green-600">
                              ({((parcel.firstQuality / parcel.total) * 100).toFixed(1)}%)
                            </span>
                          </td>
                          <td className="py-3 text-right text-sm text-green-900">
                            {parcel.secondQuality}
                            <span className="ml-1 text-xs text-green-600">
                              ({((parcel.secondQuality / parcel.total) * 100).toFixed(1)}%)
                            </span>
                          </td>
                          <td className="py-3 text-right text-sm text-green-900">
                            {parcel.waste}
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
