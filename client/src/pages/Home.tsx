import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
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
    const totalWeight = boxes.reduce((sum, box) => sum + box.weight, 0);
    
    // Calcular calidades según los códigos especiales
    const firstQuality = boxes.filter(b => b.harvesterId !== 98 && b.harvesterId !== 99).length;
    const secondQuality = boxes.filter(b => b.harvesterId === 98).length;
    const waste = boxes.filter(b => b.harvesterId === 99).length;

    return {
      total,
      totalWeight,
      firstQuality,
      secondQuality,
      waste,
      firstQualityPercent: total > 0 ? (firstQuality / total * 100).toFixed(1) : 0,
      secondQualityPercent: total > 0 ? (secondQuality / total * 100).toFixed(1) : 0,
      wastePercent: total > 0 ? (waste / total * 100).toFixed(1) : 0,
    };
  }, [boxes]);

  // Preparar datos para la gráfica de líneas
  const chartData = useMemo(() => {
    if (!boxes || boxes.length === 0) return [];
    
    const dateMap = new Map<string, { date: string; primera: number; segunda: number; desperdicio: number }>();
    
    boxes.forEach(box => {
      const date = new Date(box.submissionTime).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
      
      if (!dateMap.has(date)) {
        dateMap.set(date, { date, primera: 0, segunda: 0, desperdicio: 0 });
      }
      
      const entry = dateMap.get(date)!;
      if (box.harvesterId === 99) entry.desperdicio++;
      else if (box.harvesterId === 98) entry.segunda++;
      else entry.primera++;
    });
    
    return Array.from(dateMap.values()).slice(-10); // Últimos 10 días
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
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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
                    <p className="text-3xl font-bold text-green-900">{stats.firstQuality}</p>
                    <p className="text-xs text-green-500">{stats.firstQualityPercent}%</p>
                  </div>
                  <CheckCircle className="h-12 w-12 text-green-400" />
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600">Desperdicio</p>
                    <p className="text-3xl font-bold text-green-900">{stats.waste}</p>
                    <p className="text-xs text-green-500">{stats.wastePercent}%</p>
                  </div>
                  <AlertCircle className="h-12 w-12 text-red-400" />
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

            {/* Galería de imágenes recientes */}
            {recentBoxesWithImages.length > 0 && (
              <GlassCard className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <ImageIcon className="h-6 w-6 text-green-600" />
                  <h2 className="text-2xl font-semibold text-green-900">Últimas Cajas Registradas</h2>
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                  {recentBoxesWithImages.map((box) => (
                    <div
                      key={box.id}
                      onClick={() => handleImageClick(box)}
                      className="group relative cursor-pointer overflow-hidden rounded-lg border-2 border-green-200 transition-all hover:scale-105 hover:border-green-400 hover:shadow-lg"
                    >
                      <img
                        src={box.photoSmallUrl || box.photoUrl || ""}
                        alt={box.boxCode}
                        className="aspect-square w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 transition-opacity group-hover:opacity-100">
                        <div className="absolute bottom-2 left-2 right-2 text-white">
                          <p className="text-sm font-semibold">{box.boxCode}</p>
                          <p className="text-xs">{box.weight.toFixed(2)} kg</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* Gráfica de evolución temporal */}
            {chartData.length > 0 && (
              <GlassCard className="p-6">
                <h2 className="mb-4 text-2xl font-semibold text-green-900">Evolución de Calidades</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" />
                    <XAxis dataKey="date" stroke="#059669" />
                    <YAxis stroke="#059669" />
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-green-900">
              Detalle de Caja: {selectedBox?.boxCode}
            </DialogTitle>
          </DialogHeader>
          {selectedBox && (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg">
                <img
                  src={selectedBox.photoLargeUrl || selectedBox.photoUrl || ""}
                  alt={selectedBox.boxCode}
                  className="w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-green-600">Código de Caja</p>
                  <p className="font-semibold text-green-900">{selectedBox.boxCode}</p>
                </div>
                <div>
                  <p className="text-sm text-green-600">Peso</p>
                  <p className="font-semibold text-green-900">{selectedBox.weight.toFixed(2)} kg</p>
                </div>
                <div>
                  <p className="text-sm text-green-600">Parcela</p>
                  <p className="font-semibold text-green-900">{selectedBox.parcelCode} - {selectedBox.parcelName}</p>
                </div>
                <div>
                  <p className="text-sm text-green-600">Calidad</p>
                  <p className="font-semibold text-green-900">{getQualityLabel(selectedBox.harvesterId)}</p>
                </div>
                <div>
                  <p className="text-sm text-green-600">Cortadora</p>
                  <p className="font-semibold text-green-900">#{selectedBox.harvesterId}</p>
                </div>
                <div>
                  <p className="text-sm text-green-600">Fecha de Registro</p>
                  <p className="font-semibold text-green-900">
                    {new Date(selectedBox.submissionTime).toLocaleString('es-MX')}
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
