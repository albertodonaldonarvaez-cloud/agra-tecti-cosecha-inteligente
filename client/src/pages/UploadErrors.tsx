import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle, Trash2, XCircle } from "lucide-react";
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

export default function UploadErrors() {
  const { user, loading } = useAuth();
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);

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
          <Button
            onClick={() => clearResolved.mutate()}
            disabled={clearResolved.isPending}
            variant="outline"
            className="border-green-300 text-green-700 hover:bg-green-50"
          >
            Limpiar Resueltos
          </Button>
        </div>

        {/* Estadísticas */}
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <GlassCard className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-sm text-green-700">Sin Resolver</p>
                <p className="text-2xl font-bold text-green-900">{totalUnresolved}</p>
              </div>
            </div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-yellow-600" />
              <div>
                <p className="text-sm text-green-700">Duplicados</p>
                <p className="text-2xl font-bold text-green-900">
                  {unresolvedErrors?.filter((e: any) => e.errorType === "duplicate_box").length || 0}
                </p>
              </div>
            </div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-sm text-green-700">Parcelas Inválidas</p>
                <p className="text-2xl font-bold text-green-900">
                  {unresolvedErrors?.filter((e: any) => e.errorType === "invalid_parcel").length || 0}
                </p>
              </div>
            </div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-sm text-green-700">Lotes Procesados</p>
                <p className="text-2xl font-bold text-green-900">{batches?.length || 0}</p>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Filtro por lote */}
        {batches && batches.length > 0 && (
          <GlassCard className="mb-6 p-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold text-green-900">Filtrar por lote:</span>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={selectedBatch === null ? "default" : "outline"}
                  onClick={() => setSelectedBatch(null)}
                  className={selectedBatch === null ? "bg-green-600 hover:bg-green-700" : ""}
                >
                  Todos los errores
                </Button>
                {batches.map((batch: any) => (
                  <Button
                    key={batch.batchId}
                    size="sm"
                    variant={selectedBatch === batch.batchId ? "default" : "outline"}
                    onClick={() => setSelectedBatch(batch.batchId)}
                    className={
                      selectedBatch === batch.batchId ? "bg-green-600 hover:bg-green-700" : ""
                    }
                  >
                    {batch.fileName} - {new Date(batch.createdAt).toLocaleDateString()}
                  </Button>
                ))}
              </div>
            </div>
          </GlassCard>
        )}

        {/* Estadísticas del lote seleccionado */}
        {selectedBatch && batchStats && (
          <GlassCard className="mb-6 p-6">
            <h3 className="mb-4 text-lg font-semibold text-green-900">Estadísticas del Lote</h3>
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              {Object.entries(batchStats.byType).map(([type, count]) => {
                const errorInfo = errorTypeLabels[type] || { label: type, color: "text-gray-600" };
                return (
                  <div key={type} className="rounded-lg border border-green-200 bg-white/50 p-3">
                    <p className={`text-xs font-medium ${errorInfo.color}`}>{errorInfo.label}</p>
                    <p className="text-2xl font-bold text-green-900">{count as number}</p>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        {/* Lista de errores */}
        {!displayErrors || displayErrors.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-300" />
            <h3 className="mb-2 text-lg font-semibold text-green-900">No hay errores</h3>
            <p className="text-green-700">
              {selectedBatch
                ? "Este lote no tiene errores registrados"
                : "No hay errores sin resolver"}
            </p>
          </GlassCard>
        ) : (
          <GlassCard className="overflow-hidden p-6" hover={false}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-green-200">
                    <th className="pb-3 pr-8 text-left text-sm font-semibold text-green-900">Tipo</th>
                    <th className="pb-3 pr-8 text-left text-sm font-semibold text-green-900">Caja</th>
                    <th className="pb-3 pr-8 text-left text-sm font-semibold text-green-900">Parcela</th>
                    <th className="pb-3 pr-8 text-left text-sm font-semibold text-green-900">Mensaje</th>
                    <th className="pb-3 pr-8 text-center text-sm font-semibold text-green-900">Estado</th>
                    <th className="pb-3 text-center text-sm font-semibold text-green-900">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {displayErrors.map((error: any) => {
                    const errorInfo = errorTypeLabels[error.errorType] || { label: error.errorType, color: "text-gray-600" };
                    return (
                      <tr
                        key={error.id}
                        className="border-b border-green-100 transition-colors hover:bg-green-50/50"
                      >
                        <td className="py-3 pr-8">
                          <span className={`text-sm font-semibold ${errorInfo.color}`}>
                            {errorInfo.label}
                          </span>
                        </td>
                        <td className="py-3 pr-8 font-mono text-sm text-green-900">
                          {error.boxCode || "-"}
                        </td>
                        <td className="py-3 pr-8 font-mono text-sm text-green-900">
                          {error.parcelCode || "-"}
                        </td>
                        <td className="py-3 pr-8 text-sm text-green-700">
                          {error.errorMessage}
                        </td>
                        <td className="py-3 pr-8 text-center">
                          {error.resolved ? (
                            <span className="inline-flex items-center gap-1 text-sm text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              Resuelto
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-sm text-red-600">
                              <AlertTriangle className="h-4 w-4" />
                              Pendiente
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-center">
                          <div className="flex justify-center gap-2">
                            {!error.resolved && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => markResolved.mutate({ errorId: error.id })}
                                className="border-green-300 text-green-700 hover:bg-green-50"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (confirm("¿Eliminar este error?")) {
                                  deleteError.mutate({ errorId: error.id });
                                }
                              }}
                              className="border-red-300 text-red-700 hover:bg-red-50"
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
          </GlassCard>
        )}
      </div>
    </div>
  );
}
