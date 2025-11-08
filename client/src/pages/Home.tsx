import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Package, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";
import { useEffect, useMemo } from "react";

export default function Home() {
  const { user, loading } = useAuth();
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
    const totalWeight = boxes.reduce((sum, box) => sum + box.weight, 0) / 1000; // en kg
    
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
          </div>
        ) : (
          <GlassCard className="p-12 text-center">
            <Package className="mx-auto mb-4 h-16 w-16 text-green-300" />
            <h3 className="mb-2 text-xl font-semibold text-green-900">No hay datos disponibles</h3>
            <p className="text-green-600">Sincroniza datos desde KoboToolbox para ver estadísticas</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
