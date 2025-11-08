import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Package } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Boxes() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const { data: boxes, isLoading } = trpc.boxes.list.useQuery(undefined, {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold text-green-900">Cajas de Cosecha</h1>
          <p className="text-green-700">Gestión y visualización de todas las cajas registradas</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
          </div>
        ) : boxes && boxes.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {boxes.map((box) => (
              <GlassCard key={box.id} className="p-6">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-green-900">{box.boxCode}</h3>
                    <p className="text-sm text-green-600">{box.parcelName}</p>
                  </div>
                  <Package className="h-6 w-6 text-green-600" />
                </div>
                
                {box.photoSmallUrl && (
                  <div className="mb-4 overflow-hidden rounded-xl">
                    <img 
                      src={box.photoSmallUrl} 
                      alt={`Caja ${box.boxCode}`}
                      className="h-48 w-full object-cover"
                    />
                  </div>
                )}

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-green-600">Peso:</span>
                    <span className="font-medium text-green-900">{(box.weight / 1000).toFixed(2)} kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-600">Cortadora:</span>
                    <span className="font-medium text-green-900">#{box.harvesterId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-600">Fecha:</span>
                    <span className="font-medium text-green-900">
                      {new Date(box.submissionTime).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <GlassCard className="p-12 text-center">
            <Package className="mx-auto mb-4 h-16 w-16 text-green-300" />
            <h3 className="mb-2 text-xl font-semibold text-green-900">No hay cajas registradas</h3>
            <p className="text-green-600">Las cajas aparecerán aquí una vez sincronizadas desde KoboToolbox</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
