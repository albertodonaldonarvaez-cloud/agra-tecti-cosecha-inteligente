import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Calendar, TrendingUp, Package, BarChart3 } from "lucide-react";
import { useEffect, useMemo } from "react";

export default function DailyAnalysis() {
  const { user, loading } = useAuth();
  
  const { data: boxes } = trpc.boxes.list.useQuery(undefined, {
    enabled: !!user,
  });

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  // Agrupar datos por día
  const dailyData = useMemo(() => {
    if (!boxes || boxes.length === 0) return [];
    
    const dateMap = new Map<string, {
      date: string;
      dateObj: Date;
      totalBoxes: number;
      totalWeight: number;
      firstQuality: number;
      firstQualityWeight: number;
      secondQuality: number;
      secondQualityWeight: number;
      waste: number;
      wasteWeight: number;
      parcels: Set<string>;
      cutters: Set<number>;
    }>();
    
    boxes.forEach(box => {
      const dateStr = new Date(box.submissionTime).toISOString().split('T')[0];
      
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, {
          date: dateStr,
          dateObj: new Date(box.submissionTime),
          totalBoxes: 0,
          totalWeight: 0,
          firstQuality: 0,
          firstQualityWeight: 0,
          secondQuality: 0,
          secondQualityWeight: 0,
          waste: 0,
          wasteWeight: 0,
          parcels: new Set(),
          cutters: new Set(),
        });
      }
      
      const entry = dateMap.get(dateStr)!;
      entry.totalBoxes++;
      entry.totalWeight += box.weight;
      entry.parcels.add(box.parcelCode);
      
      // No contar cortadoras especiales (97, 98, 99) en el contador de cortadoras
      if (box.harvesterId !== 97 && box.harvesterId !== 98 && box.harvesterId !== 99) {
        entry.cutters.add(box.harvesterId);
      }
      
      if (box.harvesterId === 99) {
        entry.waste++;
        entry.wasteWeight += box.weight;
      } else if (box.harvesterId === 98) {
        entry.secondQuality++;
        entry.secondQualityWeight += box.weight;
      } else {
        entry.firstQuality++;
        entry.firstQualityWeight += box.weight;
      }
    });
    
    // Convertir a array y ordenar por fecha descendente (más reciente primero)
    return Array.from(dateMap.values()).sort((a, b) => 
      b.dateObj.getTime() - a.dateObj.getTime()
    );
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
            <h1 className="text-4xl font-bold text-green-900">Análisis Diario</h1>
            <p className="text-green-700">Datos exactos de cada día de cosecha</p>
          </div>
        </div>

        {dailyData.length > 0 ? (
          <div className="space-y-6">
            {dailyData.map((day) => {
              const firstQualityPercent = ((day.firstQuality / day.totalBoxes) * 100).toFixed(1);
              const secondQualityPercent = ((day.secondQuality / day.totalBoxes) * 100).toFixed(1);
              const wastePercent = ((day.waste / day.totalBoxes) * 100).toFixed(1);
              
              return (
                <GlassCard key={day.date} className="p-6">
                  {/* Encabezado del día */}
                  <div className="mb-6 flex items-center justify-between border-b border-green-200 pb-4">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-8 w-8 text-green-600" />
                      <div>
                        <h2 className="text-2xl font-bold text-green-900">
                          {new Date(day.dateObj).toLocaleDateString('es-MX', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </h2>
                        <p className="text-sm text-green-600">
                          {day.parcels.size} parcelas · {day.cutters.size} cortadoras activas
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-green-900">{day.totalBoxes}</p>
                      <p className="text-sm text-green-600">Cajas totales</p>
                    </div>
                  </div>

                  {/* Estadísticas principales */}
                  <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-green-600">Peso Total</p>
                          <p className="text-2xl font-bold text-green-900">
                            {(day.totalWeight / 1000).toFixed(2)}
                          </p>
                          <p className="text-xs text-green-500">kilogramos</p>
                        </div>
                        <Package className="h-10 w-10 text-green-400" />
                      </div>
                    </div>

                    <div className="rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-green-600">Primera Calidad</p>
                          <p className="text-2xl font-bold text-green-900">
                            {(day.firstQualityWeight / 1000).toFixed(2)}
                          </p>
                          <p className="text-xs text-green-500">kg ({firstQualityPercent}%)</p>
                        </div>
                        <TrendingUp className="h-10 w-10 text-green-400" />
                      </div>
                    </div>

                    <div className="rounded-lg bg-gradient-to-br from-yellow-50 to-amber-50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-yellow-600">Segunda Calidad</p>
                          <p className="text-2xl font-bold text-yellow-900">
                            {(day.secondQualityWeight / 1000).toFixed(2)}
                          </p>
                          <p className="text-xs text-yellow-500">kg ({secondQualityPercent}%)</p>
                        </div>
                        <BarChart3 className="h-10 w-10 text-yellow-400" />
                      </div>
                    </div>

                    <div className="rounded-lg bg-gradient-to-br from-red-50 to-rose-50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-red-600">Desperdicio</p>
                          <p className="text-2xl font-bold text-red-900">
                            {(day.wasteWeight / 1000).toFixed(2)}
                          </p>
                          <p className="text-xs text-red-500">kg ({wastePercent}%)</p>
                        </div>
                        <Package className="h-10 w-10 text-red-400" />
                      </div>
                    </div>
                  </div>

                  {/* Desglose por cantidad de cajas */}
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg border border-green-200 bg-white/50 p-4">
                      <p className="mb-2 text-sm font-semibold text-green-700">Primera Calidad</p>
                      <p className="text-xl font-bold text-green-900">{day.firstQuality} cajas</p>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-green-100">
                        <div 
                          className="h-full bg-green-500" 
                          style={{ width: `${firstQualityPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border border-yellow-200 bg-white/50 p-4">
                      <p className="mb-2 text-sm font-semibold text-yellow-700">Segunda Calidad</p>
                      <p className="text-xl font-bold text-yellow-900">{day.secondQuality} cajas</p>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-yellow-100">
                        <div 
                          className="h-full bg-yellow-500" 
                          style={{ width: `${secondQualityPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border border-red-200 bg-white/50 p-4">
                      <p className="mb-2 text-sm font-semibold text-red-700">Desperdicio</p>
                      <p className="text-xl font-bold text-red-900">{day.waste} cajas</p>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-red-100">
                        <div 
                          className="h-full bg-red-500" 
                          style={{ width: `${wastePercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        ) : (
          <GlassCard className="p-12 text-center">
            <Calendar className="mx-auto mb-4 h-16 w-16 text-green-300" />
            <p className="text-xl text-green-600">No hay datos de cosecha disponibles</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
