import { useState, useMemo } from "react";
import { trpc } from "../lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Pencil, Trash2, Save, X, Search, Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

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

interface EditingBox extends Box {
  isEditing: boolean;
}

export default function BoxEditor() {
  const { data: boxes, isLoading, refetch } = trpc.boxes.list.useQuery();
  const { data: harvesters } = trpc.harvesters.list.useQuery();
  const { data: parcels } = trpc.parcels.list.useQuery();
  
  const updateBox = trpc.boxes.update.useMutation({
    onSuccess: () => {
      toast.success("✅ Caja actualizada correctamente");
      refetch();
    },
    onError: (error) => {
      toast.error("❌ Error al actualizar", { description: error.message });
    },
  });

  const deleteBox = trpc.boxes.delete.useMutation({
    onSuccess: () => {
      toast.success("✅ Caja eliminada correctamente");
      refetch();
    },
    onError: (error) => {
      toast.error("❌ Error al eliminar", { description: error.message });
    },
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Box>>({});
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  
  // Filtros por columna
  const [filters, setFilters] = useState({
    boxCode: "",
    parcelCode: "",
    parcelName: "",
    harvesterId: "",
    weight: "",
    date: "",
  });

  // Datos filtrados
  const filteredBoxes = useMemo(() => {
    if (!boxes) return [];
    
    return boxes.filter((box) => {
      const matchBoxCode = box.boxCode.toLowerCase().includes(filters.boxCode.toLowerCase());
      const matchParcelCode = box.parcelCode.toLowerCase().includes(filters.parcelCode.toLowerCase());
      const matchParcelName = box.parcelName.toLowerCase().includes(filters.parcelName.toLowerCase());
      const matchHarvester = filters.harvesterId === "" || box.harvesterId.toString() === filters.harvesterId;
      const matchWeight = filters.weight === "" || (box.weight / 1000).toString().includes(filters.weight);
      const matchDate = filters.date === "" || format(new Date(box.submissionTime), "yyyy-MM-dd").includes(filters.date);
      
      return matchBoxCode && matchParcelCode && matchParcelName && matchHarvester && matchWeight && matchDate;
    });
  }, [boxes, filters]);

  const startEdit = (box: Box) => {
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
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async () => {
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
  };

  const handleDelete = async (id: number, boxCode: string) => {
    if (confirm(`¿Estás seguro de eliminar la caja ${boxCode}?`)) {
      await deleteBox.mutateAsync({ id });
    }
  };

  const clearFilters = () => {
    setFilters({
      boxCode: "",
      parcelCode: "",
      parcelName: "",
      harvesterId: "",
      weight: "",
      date: "",
    });
  };

  const getHarvesterName = (harvesterId: number) => {
    const harvester = harvesters?.find((h) => h.number === harvesterId);
    if (harvester?.customName) return harvester.customName;
    if (harvesterId === 97) return "Recolecta";
    if (harvesterId === 98) return "Segunda";
    if (harvesterId === 99) return "Desperdicio";
    return `Cortadora ${harvesterId}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Cargando cajas...</div>
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
              {filteredBoxes.length} de {boxes?.length || 0} cajas
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filtros */}
          <div className="mb-6 p-4 bg-muted/50 rounded-lg space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Search className="h-4 w-4" />
                Filtros por Columna
              </h3>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Limpiar Filtros
              </Button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Código Caja</label>
                <Input
                  placeholder="Ej: 01-123456"
                  value={filters.boxCode}
                  onChange={(e) => setFilters({ ...filters, boxCode: e.target.value })}
                  className="h-9"
                />
              </div>
              
              <div>
                <label className="text-xs font-medium mb-1 block">Código Parcela</label>
                <Input
                  placeholder="Ej: A1"
                  value={filters.parcelCode}
                  onChange={(e) => setFilters({ ...filters, parcelCode: e.target.value })}
                  className="h-9"
                />
              </div>
              
              <div>
                <label className="text-xs font-medium mb-1 block">Nombre Parcela</label>
                <Input
                  placeholder="Buscar..."
                  value={filters.parcelName}
                  onChange={(e) => setFilters({ ...filters, parcelName: e.target.value })}
                  className="h-9"
                />
              </div>
              
              <div>
                <label className="text-xs font-medium mb-1 block">Cortadora</label>
                <Input
                  placeholder="Número"
                  type="number"
                  value={filters.harvesterId}
                  onChange={(e) => setFilters({ ...filters, harvesterId: e.target.value })}
                  className="h-9"
                />
              </div>
              
              <div>
                <label className="text-xs font-medium mb-1 block">Peso (kg)</label>
                <Input
                  placeholder="Ej: 15"
                  value={filters.weight}
                  onChange={(e) => setFilters({ ...filters, weight: e.target.value })}
                  className="h-9"
                />
              </div>
              
              <div>
                <label className="text-xs font-medium mb-1 block">Fecha</label>
                <Input
                  placeholder="YYYY-MM-DD"
                  value={filters.date}
                  onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left text-sm font-semibold">Código Caja</th>
                  <th className="p-3 text-left text-sm font-semibold">Parcela</th>
                  <th className="p-3 text-left text-sm font-semibold">Nombre Parcela</th>
                  <th className="p-3 text-left text-sm font-semibold">Cortadora</th>
                  <th className="p-3 text-left text-sm font-semibold">Peso (kg)</th>
                  <th className="p-3 text-left text-sm font-semibold">Fecha/Hora</th>
                  <th className="p-3 text-left text-sm font-semibold">Foto</th>
                  <th className="p-3 text-center text-sm font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredBoxes.map((box) => {
                  const isEditing = editingId === box.id;
                  
                  return (
                    <tr key={box.id} className="border-b hover:bg-muted/30">
                      <td className="p-3">
                        {isEditing ? (
                          <Input
                            value={editForm.boxCode}
                            onChange={(e) => setEditForm({ ...editForm, boxCode: e.target.value })}
                            className="h-8"
                          />
                        ) : (
                          <span className="font-mono">{box.boxCode}</span>
                        )}
                      </td>
                      
                      <td className="p-3">
                        {isEditing ? (
                          <Input
                            value={editForm.parcelCode}
                            onChange={(e) => setEditForm({ ...editForm, parcelCode: e.target.value })}
                            className="h-8"
                          />
                        ) : (
                          <span className="font-mono">{box.parcelCode}</span>
                        )}
                      </td>
                      
                      <td className="p-3">
                        {isEditing ? (
                          <Input
                            value={editForm.parcelName}
                            onChange={(e) => setEditForm({ ...editForm, parcelName: e.target.value })}
                            className="h-8"
                          />
                        ) : (
                          <span>{box.parcelName}</span>
                        )}
                      </td>
                      
                      <td className="p-3">
                        {isEditing ? (
                          <Input
                            type="number"
                            value={editForm.harvesterId}
                            onChange={(e) => setEditForm({ ...editForm, harvesterId: parseInt(e.target.value) })}
                            className="h-8"
                          />
                        ) : (
                          <span>{getHarvesterName(box.harvesterId)}</span>
                        )}
                      </td>
                      
                      <td className="p-3">
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={(editForm.weight! / 1000).toFixed(2)}
                            onChange={(e) => setEditForm({ ...editForm, weight: Math.round(parseFloat(e.target.value) * 1000) })}
                            className="h-8"
                          />
                        ) : (
                          <span className={box.weight > 20000 ? "text-red-600 font-bold" : ""}>
                            {(box.weight / 1000).toFixed(2)}
                          </span>
                        )}
                      </td>
                      
                      <td className="p-3">
                        {isEditing ? (
                          <Input
                            type="datetime-local"
                            value={format(new Date(editForm.submissionTime!), "yyyy-MM-dd'T'HH:mm")}
                            onChange={(e) => setEditForm({ ...editForm, submissionTime: new Date(e.target.value) })}
                            className="h-8"
                          />
                        ) : (
                          <span className="text-sm">
                            {format(new Date(box.submissionTime), "dd/MM/yyyy HH:mm", { locale: es })}
                          </span>
                        )}
                      </td>
                      
                      <td className="p-3 text-center">
                        {box.photoUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedPhoto(box.photoUrl)}
                          >
                            <ImageIcon className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                      
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-2">
                          {isEditing ? (
                            <>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={saveEdit}
                                disabled={updateBox.isPending}
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={cancelEdit}
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
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDelete(box.id, box.boxCode)}
                                disabled={deleteBox.isPending}
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
            <div className="text-center py-12 text-muted-foreground">
              No se encontraron cajas con los filtros aplicados
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de foto */}
      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Foto de la Caja</DialogTitle>
          </DialogHeader>
          <div className="relative">
            {selectedPhoto && (
              <img
                src={selectedPhoto}
                alt="Foto de caja"
                className="w-full h-auto rounded-lg cursor-zoom-in"
                onClick={(e) => {
                  const img = e.currentTarget;
                  if (img.style.transform === "scale(2)") {
                    img.style.transform = "scale(1)";
                    img.style.cursor = "zoom-in";
                  } else {
                    img.style.transform = "scale(2)";
                    img.style.cursor = "zoom-out";
                  }
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
