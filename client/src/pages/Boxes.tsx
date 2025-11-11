import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { getProxiedImageUrl } from "@/lib/imageProxy";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Package, X, MapPin } from "lucide-react";
import { BoxLocationMap } from "@/components/BoxLocationMap";
import { useEffect, useState } from "react";

interface Box {
  id: number;
  boxCode: string;
  harvesterId: number;
  parcelCode: string;
  parcelName: string;
  weight: number;
  photoUrl: string | null;
  latitude: string | null;
  longitude: string | null;
  location?: string | null;
  submissionTime: Date;
}

export default function Boxes() {
  const { user, loading } = useAuth();
  const [selectedBox, setSelectedBox] = useState<Box | null>(null);
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

  const getQualityType = (harvesterId: number) => {
    if (harvesterId === 97) return { label: "Recolecta", color: "text-green-600" };
    if (harvesterId === 98) return { label: "2da Calidad", color: "text-yellow-600" };
    if (harvesterId === 99) return { label: "Desperdicio", color: "text-red-600" };
    return { label: "1ra Calidad", color: "text-green-600" };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <img src={APP_LOGO} alt="Agratec" className="h-16 w-16" />
          <div>
            <h1 className="text-4xl font-bold text-green-900">Cajas Registradas</h1>
            <p className="text-green-700">
              {boxes ? `${boxes.length} cajas en total` : "Cargando..."}
            </p>
          </div>
        </div>

        {isLoading ? (
          <GlassCard className="p-12 text-center">
            <p className="text-green-600">Cargando cajas...</p>
          </GlassCard>
        ) : boxes && boxes.length > 0 ? (
          <GlassCard className="overflow-hidden p-6" hover={false}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-green-200">
                    <th className="pb-3 pr-8 text-left text-sm font-semibold text-green-900">Código</th>
                    <th className="pb-3 pr-8 text-left text-sm font-semibold text-green-900">Cortadora</th>
                    <th className="pb-3 pr-8 text-left text-sm font-semibold text-green-900">Parcela</th>
                    <th className="pb-3 pr-8 text-right text-sm font-semibold text-green-900">Peso</th>
                    <th className="pb-3 pr-8 text-left text-sm font-semibold text-green-900">Fecha</th>
                    <th className="pb-3 text-center text-sm font-semibold text-green-900">Foto</th>
                  </tr>
                </thead>
                <tbody>
                  {boxes.map((box) => {
                    const quality = getQualityType(box.harvesterId);
                    return (
                      <tr
                        key={box.id}
                        className="cursor-pointer border-b border-green-100 transition-colors hover:bg-green-50/50"
                        onClick={() => setSelectedBox(box)}
                      >
                        <td className="py-3 pr-8 text-sm font-semibold text-green-900">{box.boxCode}</td>
                        <td className="py-3 pr-8 text-sm text-green-900">
                          <div>
                            <div className="font-semibold">#{box.harvesterId}</div>
                            <div className={`text-xs ${quality.color}`}>{quality.label}</div>
                          </div>
                        </td>
                        <td className="py-3 pr-8 text-sm text-green-900">
                          <div>
                            <div className="font-semibold">{box.parcelName}</div>
                            <div className="text-xs text-green-600">{box.parcelCode}</div>
                          </div>
                        </td>
                        <td className="py-3 pr-8 text-right text-sm text-green-900">
                          {(box.weight / 1000).toFixed(2)} kg
                        </td>
                        <td className="py-3 pr-8 text-sm text-green-900">
                          {new Date(box.submissionTime).toLocaleDateString()}
                        </td>
                        <td className="py-3 text-center text-sm text-green-900">
                          {box.photoUrl ? (
                            <span className="text-green-600">✓ Sí</span>
                          ) : (
                            <span className="text-red-600">✗ No</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>
        ) : (
          <GlassCard className="p-12 text-center">
            <Package className="mx-auto mb-4 h-16 w-16 text-green-300" />
            <h3 className="mb-2 text-xl font-semibold text-green-900">No hay cajas registradas</h3>
            <p className="text-green-600">Las cajas aparecerán aquí cuando se sincronicen datos</p>
          </GlassCard>
        )}
      </div>

      {/* Modal de detalle */}
      <Dialog open={!!selectedBox} onOpenChange={() => setSelectedBox(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-hidden p-0">
          {selectedBox && (
            <div className="flex flex-col lg:flex-row max-h-[90vh]">
              {/* Imagen - Lado izquierdo */}
              {selectedBox.photoUrl && (
                <div className="flex-1 bg-gray-100 flex items-center justify-center p-4 lg:p-6 min-h-[40vh] lg:min-h-[70vh]">
                  <img
                    src={getProxiedImageUrl(selectedBox.photoUrl)}
                    alt={`Caja ${selectedBox.boxCode}`}
                    className="w-full h-full object-contain max-h-[50vh] lg:max-h-[80vh]"
                  />
                </div>
              )}
              
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
                    <p className="text-xs text-gray-500">{selectedBox.weight} gramos</p>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-green-600 mb-1">Parcela</p>
                      <p className="text-lg font-semibold text-green-900">{selectedBox.parcelCode}</p>
                      <p className="text-sm text-gray-600">{selectedBox.parcelName}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-green-600 mb-1">Cortadora</p>
                      <p className="text-lg font-semibold text-green-900">#{selectedBox.harvesterId}</p>
                      <p className="text-sm text-gray-600">
                        {selectedBox.harvesterId === 97
                          ? "Recolecta (1ra Calidad)"
                          : selectedBox.harvesterId === 98
                          ? "Segunda Calidad"
                          : selectedBox.harvesterId === 99
                          ? "Desperdicio"
                          : "Cortadora"}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-green-600 mb-1">Ubicación GPS</p>
                      <BoxLocationMap 
                        latitude={selectedBox.latitude}
                        longitude={selectedBox.longitude}
                        boxCode={selectedBox.boxCode}
                      />
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
