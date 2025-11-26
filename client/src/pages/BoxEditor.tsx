import { useState, useMemo, useCallback } from "react";
import { trpc } from "../lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Pencil, Trash2, Save, X, Search, Image as ImageIcon, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { MapModal } from "../components/MapModal";

interface Box {
  id: number;
  boxCode: string;
  harvesterId: number;
  parcelCode: string;
  parcelName: string;
  weight: number;
  photoUrl: string | null;
  photoFilename: string | null;
  submissionTime: Date;
  latitude: string | null;
  longitude: string | null;
}

const ITEMS_PER_PAGE = 50;

export default function BoxEditor() {
  const { data: boxes, isLoading, refetch } = trpc.boxes.list.useQuery();
  const { data: harvesters } = trpc.harvesters.list.useQuery();
  
  const updateBox = trpc.boxes.update.useMutation({
    onSuccess: () => {
      toast.success("✅ Caja actualizada");
      refetch();
    },
    onError: (error) => {
      toast.error("❌ Error al actualizar", { description: error.message });
    },
  });

  const deleteBox = trpc.boxes.delete.useMutation({
    onSuccess: () => {
      toast.success("✅ Caja eliminada");
      refetch();
    },
    onError: (error) => {
      toast.error("❌ Error al eliminar", { description: error.message });
    },
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Box>>({});
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [photoZoom, setPhotoZoom] = useState(false);
  const [selectedMap, setSelectedMap] = useState<{ latitude: string | null; longitude: string | null; boxCode: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Filtros por columna
  const [filters, setFilters] = useState({
    boxCode: "",
    parcelCode: "",
    parcelName: "",
    harvesterId: "",
    weight: "",
    date: "",
  });

  // Datos filtrados (memoizado)
  const filteredBoxes = useMemo(() => {
    if (!boxes) return [];
    
    return boxes.filter((box) => {
      if (filters.boxCode && !box.boxCode.toLowerCase().includes(filters.boxCode.toLowerCase())) return false;
      if (filters.parcelCode && !box.parcelCode.toLowerCase().includes(filters.parcelCode.toLowerCase())) return false;
      if (filters.parcelName && !box.parcelName.toLowerCase().includes(filters.parcelName.toLowerCase())) return false;
      if (filters.harvesterId && box.harvesterId.toString() !== filters.harvesterId) return false;
      if (filters.weight && !(box.weight / 1000).toString().includes(filters.weight)) return false;
      if (filters.date && !format(new Date(box.submissionTime), "yyyy-MM-dd").includes(filters.date)) return false;
      return true;
    });
  }, [boxes, filters]);

  // Paginación (memoizado)
  const totalPages = Math.ceil(filteredBoxes.length / ITEMS_PER_PAGE);
  const paginatedBoxes = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredBoxes.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredBoxes, currentPage]);

  // Callbacks memoizados
  const updateFilters = useCallback((newFilters: typeof filters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  }, []);

  const startEdit = useCallback((box: Box) => {
    setEditingId(box.id);
    setEditForm({
      id: box.id,
      boxCode: box.boxCode,
      harvesterId: box.harvesterId,
      parcelCode: box.parcelCode,
      parcelName: box.parcelName,
      weight: box.weight,
      submissionTime: box.submissionTime,
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditForm({});
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editForm.id) return;
    
    await updateBox.mutateAsync({
      id: editForm.id,
      boxCode: editForm.boxCode!,
      harvesterId: editForm.harvesterId!,
      parcelCode: editForm.parcelCode!,
      parcelName: editForm.parcelName!,
      weight: editForm.weight!,
      submissionTime: new Date(editForm.submissionTime!).toISOString(),
    });
    
    cancelEdit();
  }, [editForm, updateBox, cancelEdit]);

  const handleDelete = useCallback(async (id: number, boxCode: string) => {
    if (confirm(`¿Eliminar caja ${boxCode}?`)) {
      await deleteBox.mutateAsync({ id });
    }
  }, [deleteBox]);

  const clearFilters = useCallback(() => {
    updateFilters({
      boxCode: "",
      parcelCode: "",
      parcelName: "",
      harvesterId: "",
      weight: "",
      date: "",
    });
  }, [updateFilters]);

  const getHarvesterName = useCallback((harvesterId: number) => {
    const harvester = harvesters?.find((h) => h.number === harvesterId);
    if (harvester?.customName) return harvester.customName;
    if (harvesterId === 97) return "Recolecta";
    if (harvesterId === 98) return "Segunda";
    if (harvesterId === 99) return "Desperdicio";
    return `Cortadora ${harvesterId}`;
  }, [harvesters]);

  const getPhotoUrl = useCallback((box: Box) => {
    if (box.photoUrl) return box.photoUrl;
    if (box.photoFilename) return `/app/photos/${box.photoFilename}`;
    return null;
  }, []);

  const openPhoto = useCallback((url: string) => {
    setSelectedPhoto(url);
    setPhotoError(false);
    setPhotoZoom(false);
  }, []);

  const closePhoto = useCallback(() => {
    setSelectedPhoto(null);
    setPhotoError(false);
    setPhotoZoom(false);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Editor de Cajas</span>
            <div className="text-sm font-normal text-muted-foreground">
              {filteredBoxes.length} de {boxes?.length || 0}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filtros */}
          <div className="mb-4 p-4 bg-muted/50 rounded-lg space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Search className="h-4 w-4" />
                Filtros
              </h3>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Limpiar
              </Button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Input
                placeholder="Código Caja"
                value={filters.boxCode}
                onChange={(e) => updateFilters({ ...filters, boxCode: e.target.value })}
                className="h-9"
              />
              <Input
                placeholder="Código Parcela"
                value={filters.parcelCode}
                onChange={(e) => updateFilters({ ...filters, parcelCode: e.target.value })}
                className="h-9"
              />
              <Input
                placeholder="Nombre Parcela"
                value={filters.parcelName}
                onChange={(e) => updateFilters({ ...filters, parcelName: e.target.value })}
                className="h-9"
              />
              <Input
                placeholder="Cortadora #"
                type="number"
                value={filters.harvesterId}
                onChange={(e) => updateFilters({ ...filters, harvesterId: e.target.value })}
                className="h-9"
              />
              <Input
                placeholder="Peso (kg)"
                value={filters.weight}
                onChange={(e) => updateFilters({ ...filters, weight: e.target.value })}
                className="h-9"
              />
              <Input
                placeholder="Fecha"
                value={filters.date}
                onChange={(e) => updateFilters({ ...filters, date: e.target.value })}
                className="h-9"
              />
            </div>
          </div>

          {/* Paginación superior */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-muted-foreground">
                Pág {currentPage} de {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => {
                    const page = parseInt(e.target.value);
                    if (page >= 1 && page <= totalPages) setCurrentPage(page);
                  }}
                  className="h-9 w-16 text-center"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-2 text-left text-xs font-semibold">Código</th>
                  <th className="p-2 text-left text-xs font-semibold">Parcela</th>
                  <th className="p-2 text-left text-xs font-semibold">Nombre</th>
                  <th className="p-2 text-left text-xs font-semibold">Cortadora</th>
                  <th className="p-2 text-left text-xs font-semibold">Peso</th>
                  <th className="p-2 text-left text-xs font-semibold">Fecha</th>
                  <th className="p-2 text-center text-xs font-semibold">Foto</th>
                  <th className="p-2 text-center text-xs font-semibold">Mapa</th>
                  <th className="p-2 text-center text-xs font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedBoxes.map((box) => {
                  const isEditing = editingId === box.id;
                  const photoUrl = getPhotoUrl(box);
                  
                  return (
                    <tr key={box.id} className="border-b hover:bg-muted/30">
                      <td className="p-2">
                        {isEditing ? (
                          <Input
                            value={editForm.boxCode}
                            onChange={(e) => setEditForm({ ...editForm, boxCode: e.target.value })}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <span className="font-mono text-sm">{box.boxCode}</span>
                        )}
                      </td>
                      
                      <td className="p-2">
                        {isEditing ? (
                          <Input
                            value={editForm.parcelCode}
                            onChange={(e) => setEditForm({ ...editForm, parcelCode: e.target.value })}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <span className="text-sm">{box.parcelCode}</span>
                        )}
                      </td>
                      
                      <td className="p-2">
                        {isEditing ? (
                          <Input
                            value={editForm.parcelName}
                            onChange={(e) => setEditForm({ ...editForm, parcelName: e.target.value })}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <span className="text-sm">{box.parcelName}</span>
                        )}
                      </td>
                      
                      <td className="p-2">
                        {isEditing ? (
                          <Input
                            type="number"
                            value={editForm.harvesterId}
                            onChange={(e) => setEditForm({ ...editForm, harvesterId: parseInt(e.target.value) })}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <span className="text-sm">{getHarvesterName(box.harvesterId)}</span>
                        )}
                      </td>
                      
                      <td className="p-2">
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={(editForm.weight! / 1000).toFixed(2)}
                            onChange={(e) => setEditForm({ ...editForm, weight: Math.round(parseFloat(e.target.value) * 1000) })}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <span className={`text-sm ${box.weight > 20000 ? "text-red-600 font-bold" : ""}`}>
                            {(box.weight / 1000).toFixed(2)}
                          </span>
                        )}
                      </td>
                      
                      <td className="p-2">
                        {isEditing ? (
                          <Input
                            type="datetime-local"
                            value={format(new Date(editForm.submissionTime!), "yyyy-MM-dd'T'HH:mm")}
                            onChange={(e) => setEditForm({ ...editForm, submissionTime: new Date(e.target.value) })}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <span className="text-xs">
                            {format(new Date(box.submissionTime), "dd/MM/yy HH:mm", { locale: es })}
                          </span>
                        )}
                      </td>
                      
                      <td className="p-2 text-center">
                        {photoUrl ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPhoto(photoUrl)}
                            className="h-8 w-8 p-0"
                          >
                            <ImageIcon className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      
                      <td className="p-2 text-center">
                        {box.latitude && box.longitude ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedMap({ latitude: box.latitude, longitude: box.longitude, boxCode: box.boxCode })}
                            className="h-8 w-8 p-0"
                          >
                            <MapPin className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      
                      <td className="p-2">
                        <div className="flex items-center justify-center gap-1">
                          {isEditing ? (
                            <>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={saveEdit}
                                disabled={updateBox.isPending}
                                className="h-8 w-8 p-0"
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={cancelEdit}
                                className="h-8 w-8 p-0"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => startEdit(box)}
                                className="h-8 w-8 p-0"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDelete(box.id, box.boxCode)}
                                disabled={deleteBox.isPending}
                                className="h-8 w-8 p-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredBoxes.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No se encontraron cajas
            </div>
          )}

          {/* Paginación inferior */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center mt-4 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredBoxes.length)} de {filteredBoxes.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de foto */}
      <Dialog open={!!selectedPhoto} onOpenChange={closePhoto}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Foto de la Caja</DialogTitle>
          </DialogHeader>
          <div className="relative overflow-auto max-h-[70vh]">
            {photoError ? (
              <div className="text-center py-8 text-muted-foreground">
                Error al cargar la imagen
              </div>
            ) : (
              selectedPhoto && (
                <img
                  src={selectedPhoto}
                  alt="Foto de caja"
                  className={`w-full h-auto rounded-lg cursor-pointer transition-transform ${photoZoom ? 'scale-200' : 'scale-100'}`}
                  style={{ transform: photoZoom ? 'scale(2)' : 'scale(1)' }}
                  onClick={() => setPhotoZoom(!photoZoom)}
                  onError={() => setPhotoError(true)}
                  loading="lazy"
                />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de mapa */}
      <MapModal
        open={!!selectedMap}
        onClose={() => setSelectedMap(null)}
        latitude={selectedMap?.latitude || null}
        longitude={selectedMap?.longitude || null}
        boxCode={selectedMap?.boxCode || ""}
      />
    </div>
  );
}
