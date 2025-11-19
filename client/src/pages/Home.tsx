import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { getProxiedImageUrl } from "@/lib/imageProxy";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Package, TrendingUp, AlertCircle, CheckCircle, Image as ImageIcon, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function Home() {
  const { user, loading } = useAuth();
  const [selectedBox, setSelectedBox] = useState<any>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  
  const { data: boxes } = trpc.boxes.list.useQuery(undefined, {
    enabled: !!user,
  });

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  const stats = useMemo(() => {
    if (!boxes) return null;

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

  // Preparar datos para la gráfica de líneas (en kilogramos)
  const chartData = useMemo(() => {
    if (!boxes || boxes.length === 0) return [];
    
    // Usar un Map con fecha completa como clave para ordenar correctamente
    const dateMap = new Map<string, { fullDate: Date; date: string; primera: number; segunda: number; desperdicio: number }>();
    
    boxes.forEach(box => {
      const fullDate = new Date(box.submissionTime);
      const dateKey = fullDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const displayDate = fullDate.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
      
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { fullDate, date: displayDate, primera: 0, segunda: 0, desperdicio: 0 });
      }
      
      const entry = dateMap.get(dateKey)!;
      const weightKg = box.weight / 1000; // Convertir gramos a kilogramos
      if (box.harvesterId === 99) entry.desperdicio += weightKg;
      else if (box.harvesterId === 98) entry.segunda += weightKg;
      else entry.primera += weightKg;
    });
    
    // Ordenar por fecha (mostrar todos los días)
    const sortedEntries = Array.from(dateMap.values())
      .sort((a, b) => a.fullDate.getTime() - b.fullDate.getTime());
    
    // Redondear a 2 decimales y eliminar fullDate del resultado
    return sortedEntries.map(entry => ({
      date: entry.date,
      primera: Number(entry.primera.toFixed(2)),
      segunda: Number(entry.segunda.toFixed(2)),
      desperdicio: Number(entry.desperdicio.toFixed(2))
    }));
  }, [boxes]);

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
    return null;
  }

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

        {stats ? (
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
                    <p className="text-3xl font-bold text-green-900">{stats.firstQualityWeight.toFixed(2)}</p>
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
                <h3 className="mb-4 text-lg font-semibold text-green-900">Evolución de Calidad (Kilogramos)</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
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
                    <p className="text-3xl font-bold text-green-900">{(selectedBox.weight / 1000).toFixed(2)} <span className="text-lg">kg</span></p>
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
