import { Loading } from "@/components/Loading";
import { useAuth } from "@/_core/hooks/useAuth";
import { ProtectedPage } from "@/components/ProtectedPage";
import { GlassCard } from "@/components/GlassCard";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { getBoxPhotoUrl } from "@/lib/imageProxy";
import { BarChart3, TrendingUp, Package, Weight, Calendar, X } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function HarvesterPerformance() {
  return (
    <ProtectedPage permission="canViewAnalytics">
      <HarvesterPerformanceContent />
    </ProtectedPage>
  );
}

interface HarvesterStats {
  harvesterId: number;
  harvesterName: string | null;
  totalBoxes: number;
  totalWeight: number;
  avgWeight: number;
  maxWeight: number;
  minWeight: number;
  maxWeightBox: any | null;
  minWeightBox: any | null;
}

function HarvesterPerformanceContent() {
  const { user, loading } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; title: string; weight: number; code: string } | null>(null);
  
  const { data: boxes } = trpc.boxes.list.useQuery(undefined, {
    enabled: !!user,
  });
  
  const { data: harvesters } = trpc.harvesters.list.useQuery(undefined, {
    enabled: !!user,
  });

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  // Obtener fechas únicas
  const uniqueDates = useMemo(() => {
    if (!boxes) return [];
    const dates = new Set<string>();
    boxes.forEach(box => {
      const date = new Date(box.submissionTime).toISOString().split('T')[0];
      dates.add(date);
    });
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [boxes]);

  // Filtrar cajas por fecha (para gráfica principal)
  const filteredBoxes = useMemo(() => {
    if (!boxes) return [];
    if (selectedDate === "all") return boxes;
    
    return boxes.filter(box => {
      const boxDate = new Date(box.submissionTime).toISOString().split('T')[0];
      return boxDate === selectedDate;
    });
  }, [boxes, selectedDate]);

  // Filtrar cajas por rango de fechas (para gráfica personalizada)
  const rangeFilteredBoxes = useMemo(() => {
    if (!boxes || !startDate || !endDate) return [];
    
    return boxes.filter(box => {
      const boxDate = new Date(box.submissionTime).toISOString().split('T')[0];
      return boxDate >= startDate && boxDate <= endDate;
    });
  }, [boxes, startDate, endDate]);

  // Calcular estadísticas por cortadora
  const calculateStats = (boxList: any[]): HarvesterStats[] => {
    if (!boxList || boxList.length === 0) return [];
    
    // Filtrar solo cortadoras productivas (excluir 97, 98, 99)
    const productiveBoxes = boxList.filter(
      b => b.harvesterId !== 97 && b.harvesterId !== 98 && b.harvesterId !== 99
    );
    
    const statsMap = new Map<number, HarvesterStats>();
    
    productiveBoxes.forEach(box => {
      if (!statsMap.has(box.harvesterId)) {
        statsMap.set(box.harvesterId, {
          harvesterId: box.harvesterId,
          harvesterName: harvesters?.find(h => h.number === box.harvesterId)?.customName || null,
          totalBoxes: 0,
          totalWeight: 0,
          avgWeight: 0,
          maxWeight: 0,
          minWeight: Infinity,
          maxWeightBox: null,
          minWeightBox: null,
        });
      }
      
      const stats = statsMap.get(box.harvesterId)!;
      stats.totalBoxes++;
      stats.totalWeight += box.weight;
      
      if (box.weight > stats.maxWeight) {
        stats.maxWeight = box.weight;
        stats.maxWeightBox = box;
      }
      
      if (box.weight < stats.minWeight) {
        stats.minWeight = box.weight;
        stats.minWeightBox = box;
      }
    });
    
    // Calcular promedios
    statsMap.forEach(stats => {
      stats.avgWeight = stats.totalWeight / stats.totalBoxes;
    });
    
    return Array.from(statsMap.values()).sort((a, b) => b.totalWeight - a.totalWeight);
  };

  const harvesterStats = useMemo(() => calculateStats(filteredBoxes), [filteredBoxes, harvesters]);
  const rangeStats = useMemo(() => calculateStats(rangeFilteredBoxes), [rangeFilteredBoxes, harvesters]);

  // Datos para la gráfica principal (solo números)
  const chartData = useMemo(() => {
    return harvesterStats.map(stats => ({
      name: `#${stats.harvesterId}`,
      cajas: stats.totalBoxes,
      kilos: Number((stats.totalWeight / 1000).toFixed(2)),
    }));
  }, [harvesterStats]);

  // Datos para la gráfica de rango (solo números)
  const rangeChartData = useMemo(() => {
    return rangeStats.map(stats => ({
      name: `#${stats.harvesterId}`,
      cajas: stats.totalBoxes,
      kilos: Number((stats.totalWeight / 1000).toFixed(2)),
    }));
  }, [rangeStats]);

  const openPhotoModal = (photoUrl: string, title: string, weight: number, code: string) => {
    setSelectedPhoto({ url: photoUrl, title, weight, code });
    setShowPhotoModal(true);
  };



  if (loading || !user) {
    return <Loading />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container max-w-7xl px-3 md:px-6">
        {/* Header */}
        <div className="mb-6 md:mb-8 flex items-center gap-3 md:gap-4">
          <img src={APP_LOGO} alt="Agratec" className="h-12 w-12 md:h-16 md:w-16" />
          <div>
            <h1 className="text-2xl font-bold text-green-900 md:text-4xl">Rendimiento de Cortadoras</h1>
            <p className="text-xs md:text-base text-green-700">Análisis detallado del desempeño del personal</p>
          </div>
        </div>

        {/* Filtros */}
        <GlassCard className="mb-4 md:mb-6 p-4 md:p-6">
          <div className="flex items-center gap-3 md:gap-4">
            <Calendar className="h-5 w-5 text-green-600 hidden sm:block" />
            <div className="flex-1">
              <Label htmlFor="dateFilter" className="mb-2 block text-sm font-medium text-green-900">
                Filtrar por Fecha
              </Label>
              <Select value={selectedDate} onValueChange={setSelectedDate}>
                <SelectTrigger id="dateFilter" className="w-full md:w-64 border-green-200">
                  <SelectValue placeholder="Seleccionar fecha" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">📊 Toda la Temporada</SelectItem>
                  {uniqueDates.map(date => (
                    <SelectItem key={date} value={date}>
                      {new Date(date).toLocaleDateString('es-MX', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-gray-600">
              {harvesterStats.length} cortadoras activas
            </div>
          </div>
        </GlassCard>

        {/* Gráfica Principal */}
        <div className="mb-4 md:mb-6 rounded-2xl bg-white p-4 md:p-8 shadow-lg">
          <div className="mb-4 md:mb-6 text-center">
            <h2 className="mb-2 text-xl md:text-3xl font-bold text-green-900">
              🏆 Ranking de Rendimiento - Temporada 2024/2025
            </h2>
            <p className="text-lg text-green-700">
              {selectedDate === "all" 
                ? "Desempeño Total de la Temporada"
                : `Desempeño del ${new Date(selectedDate).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}`}
            </p>
          </div>
          {chartData.length > 0 ? (
            <div className="w-full overflow-x-auto">
              <div style={{ minWidth: chartData.length > 8 ? `${chartData.length * 70}px` : '100%', height: '450px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" />
                <XAxis 
                  dataKey="name" 
                  stroke="#059669" 
                  style={{ fontSize: '16px', fontWeight: 'bold' }}
                />
                <YAxis 
                  yAxisId="left" 
                  stroke="#059669" 
                  label={{ value: 'Cajas', angle: -90, position: 'insideLeft', style: { fontSize: '14px', fontWeight: 'bold' } }}
                  style={{ fontSize: '14px' }}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  stroke="#f59e0b" 
                  label={{ value: 'Kilogramos', angle: 90, position: 'insideRight', style: { fontSize: '14px', fontWeight: 'bold' } }}
                  style={{ fontSize: '14px' }}
                />
                <Tooltip 
                  contentStyle={{ fontSize: '14px', fontWeight: 'bold' }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '16px', fontWeight: 'bold' }}
                />
                <Bar yAxisId="left" dataKey="cajas" fill="#10b981" name="Total Cajas" radius={[8, 8, 0, 0]} />
                <Bar yAxisId="right" dataKey="kilos" fill="#f59e0b" name="Total Kilos" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <p className="py-12 text-center text-gray-500">No hay datos para mostrar</p>
          )}
          <div className="mt-6 text-center">
            <p className="text-sm font-semibold text-green-800">
              💪 ¡Sigue así! Cada caja cuenta para el éxito del equipo
            </p>
          </div>
        </div>

        {/* Gráfica con Rango de Fechas */}
        <GlassCard className="mb-4 md:mb-6 p-4 md:p-6">
          <h2 className="mb-3 md:mb-4 text-lg md:text-2xl font-semibold text-green-900">
            Análisis por Rango de Fechas
          </h2>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="startDate" className="mb-2 block text-sm font-medium text-green-900">
                Fecha Inicio
              </Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-green-200"
              />
            </div>
            <div>
              <Label htmlFor="endDate" className="mb-2 block text-sm font-medium text-green-900">
                Fecha Fin
              </Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border-green-200"
              />
            </div>
          </div>
          
          {startDate && endDate && rangeChartData.length > 0 ? (
            <>
              <div className="w-full overflow-x-auto">
                <div style={{ minWidth: rangeChartData.length > 8 ? `${rangeChartData.length * 70}px` : '100%', height: '400px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rangeChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" />
                      <XAxis dataKey="name" stroke="#059669" style={{ fontSize: '14px', fontWeight: 'bold' }} />
                      <YAxis yAxisId="left" stroke="#059669" label={{ value: 'Cajas', angle: -90, position: 'insideLeft' }} />
                      <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" label={{ value: 'Kilogramos', angle: 90, position: 'insideRight' }} />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="cajas" fill="#10b981" name="Total Cajas" radius={[8, 8, 0, 0]} />
                      <Bar yAxisId="right" dataKey="kilos" fill="#f59e0b" name="Total Kilos" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="mt-4 text-center text-sm text-gray-600">
                Mostrando {rangeStats.length} cortadoras del {new Date(startDate).toLocaleDateString('es-MX')} al {new Date(endDate).toLocaleDateString('es-MX')}
              </p>
            </>
          ) : (
            <p className="py-12 text-center text-gray-500">
              Selecciona un rango de fechas para ver el análisis
            </p>
          )}
        </GlassCard>

        {/* Tarjetas de Cortadoras */}
        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
          {harvesterStats.map(stats => (
            <GlassCard key={stats.harvesterId} className="p-4 md:p-6">
              <div className="mb-3 md:mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg md:text-2xl font-bold text-green-900">
                    {stats.harvesterName || `Cortadora #${stats.harvesterId}`}
                  </h3>
                  <p className="text-sm text-green-600">#{stats.harvesterId}</p>
                </div>
                <BarChart3 className="h-8 w-8 md:h-10 md:w-10 text-green-600 hidden sm:block" />
              </div>

              {/* Métricas */}
              <div className="mb-3 md:mb-4 grid grid-cols-2 gap-2 md:gap-4">
                <div className="rounded-lg bg-green-50 p-3 md:p-4">
                  <div className="flex items-center gap-2 text-green-600">
                    <Package className="h-4 w-4" />
                    <span className="text-xs font-medium">Total Cajas</span>
                  </div>
                  <p className="mt-1 text-lg md:text-2xl font-bold text-green-900">{stats.totalBoxes}</p>
                </div>

                <div className="rounded-lg bg-green-50 p-3 md:p-4">
                  <div className="flex items-center gap-2 text-green-600">
                    <Weight className="h-4 w-4" />
                    <span className="text-xs font-medium">Total Kilos</span>
                  </div>
                  <p className="mt-1 text-lg md:text-2xl font-bold text-green-900">
                    {stats.totalWeight ? (stats.totalWeight / 1000).toFixed(2) : '0.00'}
                  </p>
                </div>

                <div className="rounded-lg bg-blue-50 p-4">
                  <div className="text-xs font-medium text-blue-600">Peso Promedio</div>
                  <p className="mt-1 text-xl font-bold text-blue-900">
                    {stats.avgWeight ? (stats.avgWeight / 1000).toFixed(2) : '0.00'} kg
                  </p>
                </div>

                <div className="rounded-lg bg-orange-50 p-4">
                  <div className="text-xs font-medium text-orange-600">Rango</div>
                  <p className="mt-1 text-xl font-bold text-orange-900">
                    {stats.minWeight && stats.maxWeight ? `${(stats.minWeight / 1000).toFixed(2)} - ${(stats.maxWeight / 1000).toFixed(2)} kg` : '0.00 - 0.00 kg'}
                  </p>
                </div>
              </div>

              {/* Fotos de Cajas Extremas */}
              <div className="grid grid-cols-2 gap-4">
                {/* Caja Más Pesada */}
                <div className="rounded-lg border-2 border-green-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-green-900">🏆 Más Pesada</span>
                    <span className="text-xs font-bold text-green-600">
                      {stats.maxWeight ? (stats.maxWeight / 1000).toFixed(2) : '0.00'} kg
                    </span>
                  </div>
                  {stats.maxWeightBox?.photoUrl ? (
                    <img
                      src={getBoxPhotoUrl(stats.maxWeightBox) || ""}
                      alt="Caja más pesada"
                      className="h-32 w-full cursor-pointer rounded object-cover transition-transform hover:scale-105"
                      onClick={() => openPhotoModal(
                        getBoxPhotoUrl(stats.maxWeightBox) || "",
                        "Caja Más Pesada",
                        stats.maxWeight,
                        stats.maxWeightBox.boxCode
                      )}
                    />
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded bg-gray-100">
                      <Package className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-600">{stats.maxWeightBox?.boxCode}</p>
                </div>

                {/* Caja Más Liviana */}
                <div className="rounded-lg border-2 border-orange-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-orange-900">📦 Más Liviana</span>
                    <span className="text-xs font-bold text-orange-600">
                      {stats.minWeight ? (stats.minWeight / 1000).toFixed(2) : '0.00'} kg
                    </span>
                  </div>
                  {stats.minWeightBox?.photoUrl ? (
                    <img
                      src={getBoxPhotoUrl(stats.minWeightBox) || ""}
                      alt="Caja más liviana"
                      className="h-32 w-full cursor-pointer rounded object-cover transition-transform hover:scale-105"
                      onClick={() => openPhotoModal(
                        getBoxPhotoUrl(stats.minWeightBox) || "",
                        "Caja Más Liviana",
                        stats.minWeight,
                        stats.minWeightBox.boxCode
                      )}
                    />
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded bg-gray-100">
                      <Package className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-600">{stats.minWeightBox?.boxCode}</p>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        {harvesterStats.length === 0 && (
          <GlassCard className="p-12 text-center">
            <BarChart3 className="mx-auto mb-4 h-16 w-16 text-green-300" />
            <h3 className="mb-2 text-xl font-semibold text-green-900">No hay datos disponibles</h3>
            <p className="text-green-600">
              {selectedDate === "all" 
                ? "No hay registros de cortadoras en la temporada"
                : "No hay registros para la fecha seleccionada"}
            </p>
          </GlassCard>
        )}
      </div>

      {/* Modal de Foto */}
      <Dialog open={showPhotoModal} onOpenChange={setShowPhotoModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{selectedPhoto?.title}</span>
              <button
                onClick={() => setShowPhotoModal(false)}
                className="rounded-full p-1 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </DialogTitle>
          </DialogHeader>
          {selectedPhoto && (
            <div className="space-y-4">
              <img
                src={selectedPhoto.url}
                alt={selectedPhoto.title}
                className="w-full rounded-lg"
              />
              <div className="flex items-center justify-between rounded-lg bg-green-50 p-4">
                <div>
                  <p className="text-sm text-green-600">Código de Caja</p>
                  <p className="text-xl font-bold text-green-900">{selectedPhoto.code}</p>
                </div>
                <div>
                  <p className="text-sm text-green-600">Peso</p>
                  <p className="text-xl font-bold text-green-900">
                    {selectedPhoto.weight ? (selectedPhoto.weight / 1000).toFixed(2) : '0.00'} kg
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
