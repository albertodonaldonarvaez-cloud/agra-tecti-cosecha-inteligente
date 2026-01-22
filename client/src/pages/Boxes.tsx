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
import { Package, X, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { useEffect, useState } from "react";

interface Box {
  id: number;
  boxCode: string;
  harvesterId: number;
  parcelCode: string;
  parcelName: string;
  weight: number;
  photoUrl: string | null;
  submissionTime: Date;
}

export default function Boxes() {
  return (
    <ProtectedPage permission="canViewBoxes">
      <BoxesContent />
    </ProtectedPage>
  );
}

// Skeleton para tabla
function TableSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-3 border-b border-green-100">
            <div className="h-4 bg-green-200 rounded w-24"></div>
            <div className="h-4 bg-green-200 rounded w-20"></div>
            <div className="h-4 bg-green-200 rounded w-32"></div>
            <div className="h-4 bg-green-200 rounded w-16"></div>
            <div className="h-4 bg-green-200 rounded w-24"></div>
            <div className="h-4 bg-green-200 rounded w-8"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BoxesContent() {
  const { user, loading } = useAuth();
  const [selectedBox, setSelectedBox] = useState<Box | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [filterDate, setFilterDate] = useState<string>("all");
  const [filterParcel, setFilterParcel] = useState<string>("all");
  const [filterHarvester, setFilterHarvester] = useState<string>("all");
  
  // Obtener opciones de filtro (carga rápida)
  const { data: filterOptions } = trpc.boxes.filterOptions.useQuery(undefined, {
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
  });

  // Obtener datos paginados
  const { data: paginatedData, isLoading, isFetching } = trpc.boxes.listPaginated.useQuery(
    {
      page,
      pageSize,
      filterDate: filterDate !== "all" ? filterDate : undefined,
      filterParcel: filterParcel !== "all" ? filterParcel : undefined,
      filterHarvester: filterHarvester !== "all" ? parseInt(filterHarvester) : undefined,
    },
    {
      enabled: !!user,
      keepPreviousData: true, // Mantener datos anteriores mientras carga
    }
  );

  const { data: harvesters } = trpc.harvesters.list.useQuery(undefined, {
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // Cache por 10 minutos
  });

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  // Reset página cuando cambian los filtros
  useEffect(() => {
    setPage(1);
  }, [filterDate, filterParcel, filterHarvester]);

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

  const handleClearFilters = () => {
    setFilterDate("all");
    setFilterParcel("all");
    setFilterHarvester("all");
    setPage(1);
  };

  const boxes = paginatedData?.boxes || [];
  const total = paginatedData?.total || 0;
  const totalPages = paginatedData?.totalPages || 0;

  // Formatear fecha para mostrar
  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
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
              {total.toLocaleString()} cajas
              {isFetching && !isLoading && (
                <span className="ml-2 text-sm text-green-500">Actualizando...</span>
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
                  {filterOptions?.dates.map((date: string) => (
                    <SelectItem key={date} value={date}>
                      {formatDateDisplay(date)}
                    </SelectItem>
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
                  {filterOptions?.parcels.map((p: { code: string; name: string }) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.code} - {p.name}
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
                  {filterOptions?.harvesters.map((id: number) => (
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

        {/* Tabla con datos */}
        <GlassCard className="overflow-hidden p-6" hover={false}>
          {isLoading ? (
            <TableSkeleton />
          ) : boxes.length > 0 ? (
            <>
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
                          onClick={() => setSelectedBox(box as Box)}
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

              {/* Paginación */}
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-green-200 pt-4">
                <div className="text-sm text-green-700">
                  Mostrando {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, total)} de {total.toLocaleString()} cajas
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(1)}
                    disabled={page === 1 || isFetching}
                    className="border-green-300 hover:bg-green-50"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || isFetching}
                    className="border-green-300 hover:bg-green-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <div className="flex items-center gap-1 px-2">
                    <span className="text-sm font-medium text-green-900">
                      Página {page} de {totalPages}
                    </span>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || isFetching}
                    className="border-green-300 hover:bg-green-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(totalPages)}
                    disabled={page === totalPages || isFetching}
                    className="border-green-300 hover:bg-green-50"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center">
              <Package className="mx-auto mb-4 h-16 w-16 text-green-300" />
              <h3 className="mb-2 text-xl font-semibold text-green-900">No hay cajas que coincidan</h3>
              <p className="text-green-600">Intenta ajustar los filtros</p>
            </div>
          )}
        </GlassCard>
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
