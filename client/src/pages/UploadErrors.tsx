import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Edit, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const errorTypeLabels: Record<string, { label: string; color: string }> = {
  duplicate_box: { label: "Caja Duplicada", color: "text-yellow-600" },
  invalid_parcel: { label: "Parcela Inválida", color: "text-red-600" },
  missing_data: { label: "Datos Faltantes", color: "text-orange-600" },
  invalid_format: { label: "Formato Inválido", color: "text-purple-600" },
  photo_download_failed: { label: "Error Descarga Foto", color: "text-blue-600" },
  other: { label: "Otro", color: "text-gray-600" },
};

interface EditFormData {
  boxCode: string;
  parcelCode: string;
  harvesterId: number;
  weightKg: number;
  photoUrl?: string;
  latitude?: number;
  longitude?: number;
  collectedAt?: string;
}

const ITEMS_PER_PAGE = 50;

export default function UploadErrors() {
  const { user, loading } = useAuth();
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [editingError, setEditingError] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState<EditFormData>({
    boxCode: "",
    parcelCode: "",
    harvesterId: 1,
    weightKg: 0,
  });

  const { data: batches } = trpc.uploadBatches.list.useQuery({ limit: 50 }, {
    enabled: !!user && user.role === "admin",
  });

  const { data: unresolvedErrors, refetch: refetchUnresolved } = trpc.uploadErrors.listUnresolved.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const { data: batchErrors, refetch: refetchBatch } = trpc.uploadErrors.listByBatch.useQuery(
    { batchId: selectedBatch! },
    { enabled: !!selectedBatch && !!user && user.role === "admin" }
  );

  const { data: batchStats } = trpc.uploadErrors.getStatsByBatch.useQuery(
    { batchId: selectedBatch! },
    { enabled: !!selectedBatch && !!user && user.role === "admin" }
  );

  const markResolved = trpc.uploadErrors.markResolved.useMutation({
    onSuccess: () => {
      toast.success("Error marcado como resuelto");
      refetchUnresolved();
      if (selectedBatch) refetchBatch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteError = trpc.uploadErrors.delete.useMutation({
    onSuccess: () => {
      toast.success("Error eliminado");
      refetchUnresolved();
      if (selectedBatch) refetchBatch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const correctAndSave = trpc.uploadErrors.correctAndSave.useMutation({
    onSuccess: () => {
      toast.success("Error corregido y caja guardada exitosamente");
      setEditingError(null);
      refetchUnresolved();
      if (selectedBatch) refetchBatch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const clearResolved = trpc.uploadErrors.clearResolved.useMutation({
    onSuccess: () => {
      toast.success("Errores resueltos eliminados");
      refetchUnresolved();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const clearAll = trpc.uploadErrors.clearAll.useMutation({
    onSuccess: () => {
      toast.success("Todos los errores han sido eliminados");
      refetchUnresolved();
      if (selectedBatch) refetchBatch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBatch]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Cargando...</div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Acceso denegado</div>
      </div>
    );
  }

  const displayErrors = selectedBatch ? batchErrors : unresolvedErrors;

  // Paginación
  const totalItems = displayErrors?.length || 0;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedErrors = displayErrors?.slice(startIndex, endIndex) || [];

  const handleEdit = (error: any) => {
    setEditingError(error);
    
    // Pre-llenar el formulario con los datos del error
    const boxCode = error.boxCode || error.rowData?.['Escanea la caja'] || "";
    const parcelString = error.parcelCode || error.rowData?.['Escanea la parcela'] || "";
    
    // Extraer código de parcela del formato "CODIGO - NOMBRE"
    let parcelCode = parcelString.split(/\s*-\s*/)[0]?.trim() || parcelString;
    // Si el código está vacío (ej. " -LOS ELOTES"), usar el nombre
    if (!parcelCode) {
      parcelCode = parcelString.split(/\s*-\s*/)[1]?.trim() || parcelString.trim();
    }
    
    // Extraer harvesterId del boxCode (formato XX-XXXXXX)
    const harvesterIdFromBox = boxCode ? parseInt(boxCode.split('-')[0]) : 1;
    
    const weightKg = error.rowData?.['Peso de la caja'] || 0;
    const photoUrl = error.rowData?.['foto de la caja de primera_URL'] || "";
    const latitude = error.rowData?.['_Pon tu ubicación_latitude'] || undefined;
    const longitude = error.rowData?.['_Pon tu ubicación_longitude'] || undefined;
    
    setFormData({
      boxCode,
      parcelCode,
      harvesterId: harvesterIdFromBox,
      weightKg,
      photoUrl,
      latitude,
      longitude,
    });
  };

  const handleSave = () => {
    if (!editingError) return;

    correctAndSave.mutate({
      errorId: editingError.id,
      ...formData,
    });
  };

  const handleClearAll = () => {
    if (confirm("¿Estás seguro de que deseas eliminar TODOS los errores? Esta acción no se puede deshacer.")) {
      clearAll.mutate();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={APP_LOGO} alt="Logo" className="h-16 w-16" />
            <div>
              <h1 className="text-3xl font-bold text-green-900">Errores de Validación</h1>
              <p className="text-gray-600">Gestiona y corrige errores de carga de datos</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => clearResolved.mutate()}
              variant="outline"
              className="border-orange-600 text-orange-700 hover:bg-orange-50"
            >
              Limpiar Resueltos
            </Button>
            <Button
              onClick={handleClearAll}
              variant="outline"
              className="border-red-600 text-red-700 hover:bg-red-50"
            >
              Limpiar Todo
            </Button>
          </div>
        </div>

        {/* Estadísticas por Tipo */}
        {batchStats && (
          <GlassCard className="mb-6">
            <h3 className="mb-4 text-lg font-semibold text-green-900">Estadísticas por Tipo de Error</h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              {Object.entries(batchStats).map(([type, count]) => {
                const typeInfo = errorTypeLabels[type] || { label: type, color: "text-gray-600" };
                return (
                  <div key={type} className="rounded-lg border-2 border-green-200 bg-white p-4 text-center">
                    <div className={`text-2xl font-bold ${typeInfo.color}`}>{count as number}</div>
                    <div className="text-sm text-gray-600">{typeInfo.label}</div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        {/* Filtro por Lote */}
        <GlassCard className="mb-6">
          <h3 className="mb-4 text-lg font-semibold text-green-900">Filtrar por Lote de Carga</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setSelectedBatch(null)}
              variant={selectedBatch === null ? "default" : "outline"}
              className={
                selectedBatch === null
                  ? "bg-green-600 hover:bg-green-700"
                  : "border-green-600 text-green-700 hover:bg-green-50"
              }
            >
              Todos los Errores
            </Button>
            {batches?.map((batch) => (
              <Button
                key={batch.batchId}
                onClick={() => setSelectedBatch(batch.batchId)}
                variant={selectedBatch === batch.batchId ? "default" : "outline"}
                className={
                  selectedBatch === batch.batchId
                    ? "bg-green-600 hover:bg-green-700"
                    : "border-green-600 text-green-700 hover:bg-green-50"
                }
              >
                {batch.fileName} ({batch.errorRows})
              </Button>
            ))}
          </div>
        </GlassCard>

        {/* Lista de Errores */}
        <GlassCard>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-green-900">
              {selectedBatch ? "Errores del Lote Seleccionado" : "Errores Sin Resolver"}
            </h3>
            {totalItems > 0 && (
              <div className="text-sm text-gray-600">
                Mostrando {startIndex + 1}-{Math.min(endIndex, totalItems)} de {totalItems} errores
              </div>
            )}
          </div>
          
          {!displayErrors || displayErrors.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-500" />
              <p className="text-lg">No hay errores para mostrar</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-6">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-green-600 text-left bg-green-50">
                      <th className="px-6 py-4 font-semibold text-green-900 w-36">Tipo</th>
                      <th className="px-6 py-4 font-semibold text-green-900 w-36">Caja</th>
                      <th className="px-6 py-4 font-semibold text-green-900 w-36">Parcela</th>
                      <th className="px-6 py-4 font-semibold text-green-900">Mensaje</th>
                      <th className="px-6 py-4 font-semibold text-green-900 w-32">Estado</th>
                      <th className="px-6 py-4 font-semibold text-green-900 w-44">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedErrors.map((error) => {
                      const typeInfo = errorTypeLabels[error.errorType] || {
                        label: error.errorType,
                        color: "text-gray-600",
                      };
                      return (
                        <tr
                          key={error.id}
                          className="border-b border-green-100"
                        >
                          <td className="px-6 py-4">
                            <span className={`font-medium text-sm ${typeInfo.color}`}>{typeInfo.label}</span>
                          </td>
                          <td className="px-6 py-4 font-mono text-sm">{error.boxCode || "-"}</td>
                          <td className="px-6 py-4 text-sm">{error.parcelCode || "-"}</td>
                          <td className="px-6 py-4 text-sm text-gray-700">{error.errorMessage}</td>
                          <td className="px-6 py-4">
                            {error.resolved ? (
                              <span className="flex items-center gap-1 text-green-600 text-sm">
                                <CheckCircle className="h-4 w-4" />
                                Resuelto
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-orange-600 text-sm">
                                <XCircle className="h-4 w-4" />
                                Pendiente
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              {!error.resolved && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => handleEdit(error)}
                                    className="bg-blue-600 hover:bg-blue-700 h-8 w-8 p-0"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => markResolved.mutate({ errorId: error.id })}
                                    variant="outline"
                                    className="border-green-600 text-green-700 hover:bg-green-50 h-8 w-8 p-0"
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              <Button
                                size="sm"
                                onClick={() => deleteError.mutate({ errorId: error.id })}
                                variant="outline"
                                className="border-red-600 text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between border-t border-green-200 pt-4">
                  <Button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    variant="outline"
                    className="border-green-600 text-green-700 hover:bg-green-50"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Anterior
                  </Button>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">
                      Página {currentPage} de {totalPages}
                    </span>
                  </div>

                  <Button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    variant="outline"
                    className="border-green-600 text-green-700 hover:bg-green-50"
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </GlassCard>
      </div>

      {/* Modal de Edición */}
      <Dialog open={!!editingError} onOpenChange={() => setEditingError(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Corregir Error y Guardar Caja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <strong>Error original:</strong> {editingError?.errorMessage}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="boxCode">Código de Caja</Label>
                <Input
                  id="boxCode"
                  value={formData.boxCode}
                  onChange={(e) => setFormData({ ...formData, boxCode: e.target.value })}
                  placeholder="01-123456"
                />
              </div>
              <div>
                <Label htmlFor="parcelCode">Código de Parcela</Label>
                <Input
                  id="parcelCode"
                  value={formData.parcelCode}
                  onChange={(e) => setFormData({ ...formData, parcelCode: e.target.value })}
                  placeholder="232"
                />
              </div>
              <div>
                <Label htmlFor="harvesterId">ID de Cortadora</Label>
                <Input
                  id="harvesterId"
                  type="number"
                  value={formData.harvesterId}
                  onChange={(e) => setFormData({ ...formData, harvesterId: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="weightKg">Peso (kg)</Label>
                <Input
                  id="weightKg"
                  type="number"
                  step="0.001"
                  value={formData.weightKg}
                  onChange={(e) => setFormData({ ...formData, weightKg: parseFloat(e.target.value) })}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="photoUrl">URL de Foto</Label>
                <Input
                  id="photoUrl"
                  value={formData.photoUrl || ""}
                  onChange={(e) => setFormData({ ...formData, photoUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label htmlFor="latitude">Latitud</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="0.0000001"
                  value={formData.latitude || ""}
                  onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="longitude">Longitud</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="0.0000001"
                  value={formData.longitude || ""}
                  onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setEditingError(null)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                className="bg-green-600 hover:bg-green-700"
                disabled={correctAndSave.isPending}
              >
                {correctAndSave.isPending ? "Guardando..." : "Guardar Caja"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
