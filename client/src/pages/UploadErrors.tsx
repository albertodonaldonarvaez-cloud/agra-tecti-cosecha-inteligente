import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle, Edit, Trash2, XCircle } from "lucide-react";
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

export default function UploadErrors() {
  const { user, loading } = useAuth();
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [editingError, setEditingError] = useState<any | null>(null);
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

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  if (loading || !user || user.role !== "admin") {
    return null;
  }

  const displayErrors = selectedBatch ? batchErrors : unresolvedErrors;
  const totalUnresolved = unresolvedErrors?.length || 0;

  const handleEdit = (error: any) => {
    setEditingError(error);
    
    // Parsear rowData si existe
    let rowData: any = {};
    try {
      rowData = error.rowData ? JSON.parse(error.rowData) : {};
    } catch (e) {
      console.error("Error parsing rowData:", e);
    }

    // Pre-llenar el formulario con los datos del error
    const boxCode = error.boxCode || rowData['Escanea la caja'] || "";
    const parcelString = error.parcelCode || rowData['Escanea la parcela'] || "";
    
    // Extraer código de parcela del formato "CODIGO - NOMBRE"
    const parcelCode = parcelString.split(/\s*-\s*/)[0]?.trim() || parcelString;
    
    // Extraer harvesterId del boxCode (formato XX-XXXXXX)
    const harvesterIdFromBox = boxCode ? parseInt(boxCode.split('-')[0]) : 1;

    setFormData({
      boxCode,
      parcelCode,
      harvesterId: isNaN(harvesterIdFromBox) ? 1 : harvesterIdFromBox,
      weightKg: parseFloat(rowData['Peso de la caja']) || 0,
      photoUrl: rowData['foto de la caja de primera_URL'] || "",
      latitude: rowData['_Pon tu ubicación_latitude'] || undefined,
      longitude: rowData['_Pon tu ubicación_longitude'] || undefined,
      collectedAt: rowData['_submission_time'] || undefined,
    });
  };

  const handleSaveCorrection = () => {
    if (!editingError) return;

    correctAndSave.mutate({
      errorId: editingError.id,
      ...formData,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={APP_LOGO} alt="Agratec" className="h-16 w-16" />
            <div>
              <h1 className="text-4xl font-bold text-green-900">Errores de Validación</h1>
              <p className="text-green-700">
                {totalUnresolved > 0
                  ? `${totalUnresolved} errores sin resolver`
                  : "No hay errores pendientes"}
              </p>
            </div>
          </div>
          {totalUnresolved > 0 && (
            <Button
              onClick={() => clearResolved.mutate()}
              variant="outline"
              className="border-green-600 text-green-700 hover:bg-green-50"
            >
              Limpiar Resueltos
            </Button>
          )}
        </div>

        {/* Estadísticas por Lote */}
        {selectedBatch && batchStats && (
          <GlassCard className="mb-6">
            <h3 className="mb-4 text-lg font-semibold text-green-900">Estadísticas del Lote</h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {Object.entries(batchStats).map(([type, count]) => {
                const typeInfo = errorTypeLabels[type] || { label: type, color: "text-gray-600" };
                return (
                  <div key={type} className="rounded-lg border border-green-200 bg-white/50 p-3">
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
          <h3 className="mb-4 text-lg font-semibold text-green-900">
            {selectedBatch ? "Errores del Lote Seleccionado" : "Errores Sin Resolver"}
          </h3>
          {!displayErrors || displayErrors.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-500" />
              <p className="text-lg">No hay errores para mostrar</p>
            </div>
          ) : (
            <div className="overflow-x-auto relative">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-green-600 text-left">
                    <th className="p-3 font-semibold text-green-900">Tipo</th>
                    <th className="p-3 font-semibold text-green-900">Caja</th>
                    <th className="p-3 font-semibold text-green-900">Parcela</th>
                    <th className="p-3 font-semibold text-green-900">Mensaje</th>
                    <th className="p-3 font-semibold text-green-900">Estado</th>
                    <th className="p-3 font-semibold text-green-900">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {displayErrors.map((error) => {
                    const typeInfo = errorTypeLabels[error.errorType] || {
                      label: error.errorType,
                      color: "text-gray-600",
                    };
                    return (
                      <tr
                        key={error.id}
                        className="border-b border-green-200"
                      >
                        <td className="p-3">
                          <span className={`font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
                        </td>
                        <td className="p-3 font-mono text-sm">{error.boxCode || "-"}</td>
                        <td className="p-3">{error.parcelCode || "-"}</td>
                        <td className="p-3 text-sm text-gray-700">{error.errorMessage}</td>
                        <td className="p-3">
                          {error.resolved ? (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              Resuelto
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-orange-600">
                              <XCircle className="h-4 w-4" />
                              Pendiente
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            {!error.resolved && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleEdit(error)}
                                  className="bg-blue-600 hover:bg-blue-700"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => markResolved.mutate({ errorId: error.id })}
                                  variant="outline"
                                  className="border-green-600 text-green-700 hover:bg-green-50"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              onClick={() => deleteError.mutate({ errorId: error.id })}
                              variant="outline"
                              className="border-red-600 text-red-700 hover:bg-red-50"
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
                <Label htmlFor="boxCode">Código de Caja *</Label>
                <Input
                  id="boxCode"
                  value={formData.boxCode}
                  onChange={(e) => setFormData({ ...formData, boxCode: e.target.value })}
                  placeholder="XX-XXXXXX"
                />
              </div>
              <div>
                <Label htmlFor="parcelCode">Código de Parcela *</Label>
                <Input
                  id="parcelCode"
                  value={formData.parcelCode}
                  onChange={(e) => setFormData({ ...formData, parcelCode: e.target.value })}
                  placeholder="232"
                />
              </div>
              <div>
                <Label htmlFor="harvesterId">ID de Cortadora *</Label>
                <Input
                  id="harvesterId"
                  type="number"
                  value={formData.harvesterId}
                  onChange={(e) => setFormData({ ...formData, harvesterId: parseInt(e.target.value) })}
                  min={1}
                  max={99}
                />
              </div>
              <div>
                <Label htmlFor="weightKg">Peso (kg) *</Label>
                <Input
                  id="weightKg"
                  type="number"
                  step="0.01"
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
                  step="0.000001"
                  value={formData.latitude || ""}
                  onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || undefined })}
                />
              </div>
              <div>
                <Label htmlFor="longitude">Longitud</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="0.000001"
                  value={formData.longitude || ""}
                  onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || undefined })}
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
                onClick={handleSaveCorrection}
                disabled={correctAndSave.isPending}
                className="bg-green-600 hover:bg-green-700"
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
