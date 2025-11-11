import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertCircle, CheckCircle, Trash2, Filter, FileText } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const errorTypeLabels: Record<string, string> = {
  duplicate_box: "Caja Duplicada",
  invalid_parcel: "Parcela Inválida",
  missing_data: "Datos Faltantes",
  invalid_format: "Formato Inválido",
  photo_download_failed: "Error Descarga Foto",
  other: "Otro",
};

const errorTypeColors: Record<string, string> = {
  duplicate_box: "bg-yellow-100 text-yellow-800",
  invalid_parcel: "bg-red-100 text-red-800",
  missing_data: "bg-orange-100 text-orange-800",
  invalid_format: "bg-purple-100 text-purple-800",
  photo_download_failed: "bg-blue-100 text-blue-800",
  other: "bg-gray-100 text-gray-800",
};

export default function UploadErrors() {
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"all" | "unresolved">("unresolved");

  const { data: batches } = trpc.uploadBatches.list.useQuery({ limit: 50 });
  const { data: unresolvedErrors, refetch: refetchUnresolved } = trpc.uploadErrors.listUnresolved.useQuery();
  const { data: batchErrors, refetch: refetchBatch } = trpc.uploadErrors.listByBatch.useQuery(
    { batchId: selectedBatch! },
    { enabled: !!selectedBatch }
  );
  const { data: batchStats } = trpc.uploadErrors.getStatsByBatch.useQuery(
    { batchId: selectedBatch! },
    { enabled: !!selectedBatch }
  );

  const markResolvedMutation = trpc.uploadErrors.markResolved.useMutation({
    onSuccess: () => {
      toast.success("Error marcado como resuelto");
      refetchUnresolved();
      if (selectedBatch) refetchBatch();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteErrorMutation = trpc.uploadErrors.delete.useMutation({
    onSuccess: () => {
      toast.success("Error eliminado");
      refetchUnresolved();
      if (selectedBatch) refetchBatch();
    },
    onError: (error) => toast.error(error.message),
  });

  const clearResolvedMutation = trpc.uploadErrors.clearResolved.useMutation({
    onSuccess: () => {
      toast.success("Errores resueltos eliminados");
      refetchUnresolved();
      if (selectedBatch) refetchBatch();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteBatchMutation = trpc.uploadBatches.delete.useMutation({
    onSuccess: () => {
      toast.success("Lote eliminado");
      setSelectedBatch(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const displayErrors = viewMode === "unresolved" ? unresolvedErrors : batchErrors;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-green-900">Errores de Validación</h1>
            <p className="text-green-600">Revisa y gestiona los errores de carga de datos</p>
          </div>
          <Button
            variant="outline"
            onClick={() => clearResolvedMutation.mutate()}
            disabled={clearResolvedMutation.isPending}
          >
            Limpiar Resueltos
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Errores Sin Resolver</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{unresolvedErrors?.length || 0}</div>
              <p className="text-xs text-muted-foreground">Requieren atención</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Lotes de Carga</CardTitle>
              <FileText className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{batches?.length || 0}</div>
              <p className="text-xs text-muted-foreground">Total procesados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Errores por Lote</CardTitle>
              <Filter className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{batchStats?.total || 0}</div>
              <p className="text-xs text-muted-foreground">
                {batchStats?.unresolved || 0} sin resolver
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
          <TabsList>
            <TabsTrigger value="unresolved">Sin Resolver</TabsTrigger>
            <TabsTrigger value="all">Por Lote</TabsTrigger>
          </TabsList>

          <TabsContent value="unresolved" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Errores Sin Resolver</CardTitle>
                <CardDescription>
                  {unresolvedErrors?.length || 0} errores pendientes de revisión
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ErrorsTable
                  errors={unresolvedErrors || []}
                  onMarkResolved={(id) => markResolvedMutation.mutate({ errorId: id })}
                  onDelete={(id) => deleteErrorMutation.mutate({ errorId: id })}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Seleccionar Lote</CardTitle>
                <CardDescription>Filtra errores por lote de carga</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <Select value={selectedBatch || ""} onValueChange={setSelectedBatch}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecciona un lote" />
                    </SelectTrigger>
                    <SelectContent>
                      {batches?.map((batch) => (
                        <SelectItem key={batch.batchId} value={batch.batchId}>
                          {batch.fileName} - {new Date(batch.createdAt).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedBatch && (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        if (confirm("¿Eliminar este lote y sus errores?")) {
                          deleteBatchMutation.mutate({ batchId: selectedBatch });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {selectedBatch && batchStats && (
              <Card>
                <CardHeader>
                  <CardTitle>Estadísticas del Lote</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {Object.entries(batchStats.byType).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between p-3 border rounded">
                        <span className="text-sm font-medium">{errorTypeLabels[type]}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedBatch && (
              <Card>
                <CardHeader>
                  <CardTitle>Errores del Lote</CardTitle>
                  <CardDescription>
                    {batchErrors?.length || 0} errores en este lote
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ErrorsTable
                    errors={batchErrors || []}
                    onMarkResolved={(id) => markResolvedMutation.mutate({ errorId: id })}
                    onDelete={(id) => deleteErrorMutation.mutate({ errorId: id })}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function ErrorsTable({
  errors,
  onMarkResolved,
  onDelete,
}: {
  errors: any[];
  onMarkResolved: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  if (errors.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
        <p>No hay errores para mostrar</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tipo</TableHead>
          <TableHead>Caja</TableHead>
          <TableHead>Parcela</TableHead>
          <TableHead>Mensaje</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {errors.map((error) => (
          <TableRow key={error.id}>
            <TableCell>
              <Badge className={errorTypeColors[error.errorType]}>
                {errorTypeLabels[error.errorType]}
              </Badge>
            </TableCell>
            <TableCell className="font-mono text-sm">{error.boxCode || "-"}</TableCell>
            <TableCell className="font-mono text-sm">{error.parcelCode || "-"}</TableCell>
            <TableCell className="max-w-md truncate">{error.errorMessage}</TableCell>
            <TableCell>
              {error.resolved ? (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Resuelto
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Pendiente
                </Badge>
              )}
            </TableCell>
            <TableCell>
              <div className="flex gap-2">
                {!error.resolved && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onMarkResolved(error.id)}
                  >
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(error.id)}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
