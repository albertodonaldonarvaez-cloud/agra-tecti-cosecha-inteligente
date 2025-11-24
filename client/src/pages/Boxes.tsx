import { Loading } from "@/components/Loading";
import { useAuth } from "@/_core/hooks/useAuth";
import { ProtectedPage } from "@/components/ProtectedPage";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { getProxiedImageUrl } from "@/lib/imageProxy";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Package, X, MapPin, Filter } from "lucide-react";

import { useEffect, useState, useMemo } from "react";

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
  return (
    <ProtectedPage permission="canViewBoxes">
      <BoxesContent />
    </ProtectedPage>
  );
}

function BoxesContent() {
  const { user, loading } = useAuth();
  const [selectedBox, setSelectedBox] = useState<Box | null>(null);
  const [filterDate, setFilterDate] = useState<string>("all");
  const [filterParcel, setFilterParcel] = useState<string>("all");
  const [filterHarvester, setFilterHarvester] = useState<string>("all");
  
  const { data: boxes, isLoading } = trpc.boxes.list.useQuery(undefined, {
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

  if (loading || !user) {
    return <Loading />;
  }

  const getHarvesterName = (harvesterId: number) => {
    const harvester = harvesters?.find(h => h.number === harvesterId);
    if (harvester?.customName) return harvester.customName;
    
    if (harvesterId === 97) return "Recolecta (1ra Calidad)";
    if (harvesterId === 98) return "Segunda Calidad";
    if (harvesterId === 99) return "Desperdicio";
    return `Cortadora #${harvesterId}`;
  };

  const getQualityType = (harvesterId: number) => {
    if (harvesterId === 97) return { label: "Recolecta", color: "text-green-600" };
    if (harvesterId === 98) return { label: "2da Calidad", color: "text-yellow-600" };
    if (harvesterId === 99) return { label: "Desperdicio", color: "text-red-600" };
    return { label: "1ra Calidad", color: "text-green-600" };
  };

  // Obtener fechas únicas
  const uniqueDates = useMemo(() => {
    if (!boxes) return [];
    const dates = new Set<string>();
    boxes.forEach(box => {
      const date = new Date(box.submissionTime).toLocaleDateString('es-MX');
      dates.add(date);
    });
    return Array.from(dates).sort((a, b) => {
      const dateA = new Date(a.split('/').reverse().join('-'));
      const dateB = new Date(b.split('/').reverse().join('-'));
      return dateB.getTime() - dateA.getTime();
    });
  }, [boxes]);

  // Obtener parcelas únicas
  const uniqueParcels = useMemo(() => {
    if (!boxes) return [];
    const parcels = new Map<string, string>();
    boxes.forEach(box => {
      // Solo agregar si el código de parcela no está vacío
      if (box.parcelCode && box.parcelCode.trim() !== '') {
        parcels.set(box.parcelCode, box.parcelName);
      }
    });
    return Array.from(parcels.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [boxes]);

  // Obtener cortadoras únicas
  const uniqueHarvesters = useMemo(() => {
    if (!boxes) return [];
    const harvesterIds = new Set<number>();
    boxes.forEach(box => {
      harvesterIds.add(box.harvesterId);
    });
    return Array.from(harvesterIds).sort((a, b) => a - b);
  }, [boxes]);

  // Filtrar cajas
  const filteredBoxes = useMemo(() => {
    if (!boxes) return [];
    
    return boxes.filter(box => {
      // Filtro de fecha
      if (filterDate !== "all") {
        const boxDate = new Date(box.submissionTime).toLocaleDateString('es-MX');
        if (boxDate !== filterDate) return false;
      }
      
      // Filtro de parcela
      if (filterParcel !== "all" && box.parcelCode !== filterParcel) {
        return false;
      }
      
      // Filtro de cortadora
      if (filterHarvester !== "all" && box.harvesterId.toString() !== filterHarvester) {
        return false;
      }
      
      return true;
    });
  }, [boxes, filterDate, filterParcel, filterHarvester]);

  const handleClearFilters = () => {
    setFilterDate("all");
    setFilterParcel("all");
    setFilterHarvester("all");
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
              {filteredBoxes ? `${filteredBoxes.length} cajas` : "Cargando..."}
              {boxes && filteredBoxes && filteredBoxes.length !== boxes.length && (
                <span className="text-sm"> (de {boxes.length} totales)</span>
              )}
            </p>
          </div>
        </div>

        {/* Filtros */}
        <GlassCard className="mb-6 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Filter className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-green-900">Filtros</h2>
          </div>
          
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-green-900">Fecha</label>
              <Select value={filterDate} onValueChange={setFilterDate}>
                <SelectTrigger className="border-green-200">
                  <SelectValue placeholder="Todas las fechas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las fechas</SelectItem>
                  {uniqueDates.map(date => (
                    <SelectItem key={date} value={date}>{date}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-green-900">Parcela</label>
              <Select value={filterParcel} onValueChange={setFilterParcel}>
                <SelectTrigger className="border-green-200">
                  <SelectValue placeholder="Todas las parcelas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las parcelas</SelectItem>
                  {uniqueParcels.map(([code, name]) => (
                    <SelectItem key={code} value={code}>
                      {code} - {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-green-900">Cortadora</label>
              <Select value={filterHarvester} onValueChange={setFilterHarvester}>
                <SelectTrigger className="border-green-200">
                  <SelectValue placeholder="Todas las cortadoras" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las cortadoras</SelectItem>
                  {uniqueHarvesters.map(id => (
                    <SelectItem key={id} value={id.toString()}>
                      #{id} - {getHarvesterName(id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleClearFilters}
                variant="outline"
                className="w-full border-green-600 text-green-700 hover:bg-green-50"
              >
                Limpiar Filtros
              </Button>
            </div>
          </div>
        </GlassCard>

        {isLoading ? (
          <GlassCard className="p-12 text-center">
            <p className="text-green-600">Cargando cajas...</p>
          </GlassCard>
        ) : filteredBoxes && filteredBoxes.length > 0 ? (
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
                  {filteredBoxes.map((box) => {
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
                        <td className="py-3 pr-8 text-right text-sm font-semibold text-green-900">
                          {box.weight ? (box.weight / 1000).toFixed(2) : '0.00'} kg
                        </td>
                        <td className="py-3 pr-8 text-sm text-green-900">
                          {new Date(box.submissionTime).toLocaleDateString('es-MX')}
                        </td>
                        <td className="py-3 text-center">
                          {box.photoUrl ? (
                            <Package className="mx-auto h-5 w-5 text-green-600" />
                          ) : (
                            <X className="mx-auto h-5 w-5 text-gray-300" />
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
            <h3 className="mb-2 text-xl font-semibold text-green-900">No hay cajas que coincidan</h3>
            <p className="text-green-600">Intenta ajustar los filtros</p>
          </GlassCard>
        )}
      </div>

      {/* Modal de Detalles */}
      <Dialog open={!!selectedBox} onOpenChange={() => setSelectedBox(null)}>
        <DialogContent className="max-w-6xl p-0">
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
                    <p className="text-3xl font-bold text-green-900">{selectedBox.weight ? (selectedBox.weight / 1000).toFixed(2) : '0.00'} <span className="text-lg">kg</span></p>
                    <p className="text-xs text-gray-500">{selectedBox.weight || 0} gramos</p>
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
                        {getHarvesterName(selectedBox.harvesterId)}
                      </p>
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
