import { useAuth } from "@/_core/hooks/useAuth";
import { ProtectedPage } from "@/components/ProtectedPage";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { getProxiedImageUrl } from "@/lib/imageProxy";
import { BarChart3, TrendingUp, Package, Weight, Download, Calendar } from "lucide-react";
import { useEffect, useState, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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
  const chartRef = useRef<HTMLDivElement>(null);
  
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

  // Filtrar cajas por fecha
  const filteredBoxes = useMemo(() => {
    if (!boxes) return [];
    if (selectedDate === "all") return boxes;
    
    return boxes.filter(box => {
      const boxDate = new Date(box.submissionTime).toISOString().split('T')[0];
      return boxDate === selectedDate;
    });
  }, [boxes, selectedDate]);

  // Calcular estadísticas por cortadora
  const harvesterStats = useMemo((): HarvesterStats[] => {
    if (!filteredBoxes || filteredBoxes.length === 0) return [];
    
    // Filtrar solo cortadoras productivas (excluir 97, 98, 99)
    const productiveBoxes = filteredBoxes.filter(
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
  }, [filteredBoxes, harvesters]);

  // Datos para la gráfica de barras
  const chartData = useMemo(() => {
    return harvesterStats.map(stats => ({
      name: stats.harvesterName || `#${stats.harvesterId}`,
      cajas: stats.totalBoxes,
      kilos: Number((stats.totalWeight / 1000).toFixed(2)),
    }));
  }, [harvesterStats]);

  const exportToPDF = async () => {
    if (!chartRef.current) return;
    
    try {
      const canvas = await html2canvas(chartRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
      });
      
      // Formato oficio horizontal: 216mm x 330mm = 8.5" x 13"
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'legal', // Legal = Oficio
      });
      
      const imgWidth = 330; // Ancho en mm (oficio horizontal)
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, 10, imgWidth, imgHeight);
      
      const fileName = selectedDate === "all" 
        ? "rendimiento_cortadoras_temporada.pdf"
        : `rendimiento_cortadoras_${selectedDate}.pdf`;
      
      pdf.save(fileName);
    } catch (error) {
      console.error("Error al exportar PDF:", error);
    }
  };

  if (loading || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={APP_LOGO} alt="Agratec" className="h-16 w-16" />
            <div>
              <h1 className="text-4xl font-bold text-green-900">Rendimiento de Cortadoras</h1>
              <p className="text-green-700">Análisis detallado del desempeño del personal</p>
            </div>
          </div>
          <Button onClick={exportToPDF} className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Exportar PDF
          </Button>
        </div>

        {/* Filtros */}
        <GlassCard className="mb-6 p-6">
          <div className="flex items-center gap-4">
            <Calendar className="h-5 w-5 text-green-600" />
            <div className="flex-1">
              <Label htmlFor="dateFilter" className="mb-2 block text-sm font-medium text-green-900">
                Filtrar por Fecha
              </Label>
              <Select value={selectedDate} onValueChange={setSelectedDate}>
                <SelectTrigger id="dateFilter" className="w-64 border-green-200">
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

        {/* Área exportable */}
        <div ref={chartRef} className="space-y-6">
          {/* Gráfica Comparativa */}
          <GlassCard className="p-6">
            <h2 className="mb-6 text-2xl font-semibold text-green-900">
              Comparativa de Rendimiento
            </h2>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" />
                  <XAxis dataKey="name" stroke="#059669" />
                  <YAxis yAxisId="left" stroke="#059669" label={{ value: 'Cajas', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" label={{ value: 'Kilogramos', angle: 90, position: 'insideRight' }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="cajas" fill="#10b981" name="Total Cajas" />
                  <Bar yAxisId="right" dataKey="kilos" fill="#f59e0b" name="Total Kilos" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-gray-500">No hay datos para mostrar</p>
            )}
          </GlassCard>

          {/* Tarjetas de Cortadoras */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {harvesterStats.map(stats => (
              <GlassCard key={stats.harvesterId} className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-green-900">
                      #{stats.harvesterId}
                    </h3>
                    {stats.harvesterName && (
                      <p className="text-sm text-green-600">{stats.harvesterName}</p>
                    )}
                  </div>
                  <BarChart3 className="h-10 w-10 text-green-600" />
                </div>

                {/* Métricas */}
                <div className="mb-4 grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-green-50 p-4">
                    <div className="flex items-center gap-2 text-green-600">
                      <Package className="h-4 w-4" />
                      <span className="text-xs font-medium">Total Cajas</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold text-green-900">{stats.totalBoxes}</p>
                  </div>

                  <div className="rounded-lg bg-green-50 p-4">
                    <div className="flex items-center gap-2 text-green-600">
                      <Weight className="h-4 w-4" />
                      <span className="text-xs font-medium">Total Kilos</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold text-green-900">
                      {(stats.totalWeight / 1000).toFixed(2)}
                    </p>
                  </div>

                  <div className="rounded-lg bg-blue-50 p-4">
                    <div className="text-xs font-medium text-blue-600">Peso Promedio</div>
                    <p className="mt-1 text-xl font-bold text-blue-900">
                      {(stats.avgWeight / 1000).toFixed(2)} kg
                    </p>
                  </div>

                  <div className="rounded-lg bg-orange-50 p-4">
                    <div className="text-xs font-medium text-orange-600">Rango</div>
                    <p className="mt-1 text-sm font-bold text-orange-900">
                      {(stats.minWeight / 1000).toFixed(2)} - {(stats.maxWeight / 1000).toFixed(2)} kg
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
                        {(stats.maxWeight / 1000).toFixed(2)} kg
                      </span>
                    </div>
                    {stats.maxWeightBox?.photoUrl ? (
                      <img
                        src={getProxiedImageUrl(stats.maxWeightBox.photoUrl)}
                        alt="Caja más pesada"
                        className="h-32 w-full rounded object-cover"
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
                        {(stats.minWeight / 1000).toFixed(2)} kg
                      </span>
                    </div>
                    {stats.minWeightBox?.photoUrl ? (
                      <img
                        src={getProxiedImageUrl(stats.minWeightBox.photoUrl)}
                        alt="Caja más liviana"
                        className="h-32 w-full rounded object-cover"
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
    </div>
  );
}
