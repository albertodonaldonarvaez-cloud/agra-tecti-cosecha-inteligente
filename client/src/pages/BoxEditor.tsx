import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "../lib/trpc";
import { GlassCard } from "../components/GlassCard";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { 
  Pencil, Trash2, Save, X, Search, Image as ImageIcon, 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, 
  MapPin, AlertTriangle, Filter, ArrowUpDown, ArrowUp, ArrowDown,
  CheckSquare, Square, Edit3, Images, ZoomIn, ZoomOut
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { MapModal } from "../components/MapModal";
import { APP_LOGO } from "../const";
import { getProxiedImageUrl } from "../lib/imageProxy";
import { useDebouncedCallback } from "use-debounce";

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

type SortColumn = 'boxCode' | 'parcelCode' | 'parcelName' | 'harvesterId' | 'weight' | 'submissionTime';
type SortOrder = 'asc' | 'desc';

// Skeleton para tabla
function TableSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-3 border-b border-green-100">
            <div className="h-4 bg-green-200 rounded w-6"></div>
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

// Componente de encabezado ordenable
function SortableHeader({ 
  label, 
  column, 
  currentSort, 
  currentOrder, 
  onSort 
}: { 
  label: string; 
  column: SortColumn; 
  currentSort: SortColumn; 
  currentOrder: SortOrder;
  onSort: (column: SortColumn) => void;
}) {
  const isActive = currentSort === column;
  
  return (
    <th 
      className="pb-3 pr-4 text-left text-sm font-semibold text-green-900 cursor-pointer hover:bg-green-50 transition-colors select-none"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          currentOrder === 'asc' ? (
            <ArrowUp className="h-4 w-4 text-green-600" />
          ) : (
            <ArrowDown className="h-4 w-4 text-green-600" />
          )
        ) : (
          <ArrowUpDown className="h-4 w-4 text-gray-400" />
        )}
      </div>
    </th>
  );
}

export default function BoxEditor() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterError, setFilterError] = useState<'all' | 'duplicates' | 'no_polygon'>('all');
  const [sortBy, setSortBy] = useState<SortColumn>('submissionTime');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  // Estado para selección múltiple
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchParcelCode, setBatchParcelCode] = useState("");
  const [batchParcelName, setBatchParcelName] = useState("");
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Box & { newParcelCode?: string; newParcelName?: string }>>({});
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [photoZoom, setPhotoZoom] = useState(false);
  const [selectedMap, setSelectedMap] = useState<{ latitude: string | null; longitude: string | null; boxCode: string } | null>(null);
  
  // Estado para comparación de fotos
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [compareZoom, setCompareZoom] = useState<number[]>([1, 1, 1]);

  // Debounce para búsqueda
  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearchQuery(value);
    setPage(1);
  }, 300);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchInput(value);
    debouncedSearch(value);
  };

  // Query para datos paginados con errores
  const { data: editorData, isLoading, isFetching, refetch } = trpc.boxes.listForEditor.useQuery(
    {
      page,
      pageSize,
      search: searchQuery || undefined,
      filterError: filterError !== 'all' ? filterError : undefined,
      sortBy,
      sortOrder,
    },
    {
      keepPreviousData: true,
    }
  );

  // Query para parcelas con polígono (para el selector)
  const { data: parcelsWithPolygon } = trpc.boxes.parcelsWithPolygon.useQuery();
  
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

  const updateParcelBatch = trpc.boxes.updateParcelBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`✅ ${data.updated} cajas actualizadas`);
      setSelectedIds(new Set());
      setShowBatchDialog(false);
      setBatchParcelCode("");
      setBatchParcelName("");
      refetch();
    },
    onError: (error) => {
      toast.error("❌ Error al actualizar", { description: error.message });
    },
  });

  const deleteBatch = trpc.boxes.deleteBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`✅ ${data.deleted} cajas eliminadas`);
      setSelectedIds(new Set());
      refetch();
    },
    onError: (error) => {
      toast.error("❌ Error al eliminar", { description: error.message });
    },
  });

  // Reset página cuando cambia el filtro de error o el ordenamiento
  useEffect(() => {
    setPage(1);
  }, [filterError, sortBy, sortOrder]);

  // Limpiar selección cuando cambian los datos
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, searchQuery, filterError]);

  const boxes = editorData?.boxes || [];
  const total = editorData?.total || 0;
  const totalPages = editorData?.totalPages || 0;
  const duplicateCodes = editorData?.duplicateCodes || [];
  const parcelsWithoutPolygon = editorData?.parcelsWithoutPolygon || [];

  // Manejar ordenamiento
  const handleSort = useCallback((column: SortColumn) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  }, [sortBy]);

  // Manejar selección
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === boxes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(boxes.map(b => b.id)));
    }
  }, [boxes, selectedIds.size]);

  const handleBatchParcelChange = useCallback((parcelCode: string) => {
    const parcel = parcelsWithPolygon?.find(p => p.code === parcelCode);
    if (parcel) {
      setBatchParcelCode(parcel.code);
      setBatchParcelName(parcel.name);
    }
  }, [parcelsWithPolygon]);

  const handleBatchUpdate = useCallback(() => {
    if (selectedIds.size === 0 || !batchParcelCode) return;
    
    updateParcelBatch.mutate({
      boxIds: Array.from(selectedIds),
      parcelCode: batchParcelCode,
      parcelName: batchParcelName,
    });
  }, [selectedIds, batchParcelCode, batchParcelName, updateParcelBatch]);

  const handleBatchDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    
    if (confirm(`¿Eliminar ${selectedIds.size} cajas seleccionadas?`)) {
      deleteBatch.mutate({
        boxIds: Array.from(selectedIds),
      });
    }
  }, [selectedIds, deleteBatch]);

  const getHarvesterName = useCallback((harvesterId: number) => {
    const harvester = harvesters?.find((h) => h.number === harvesterId);
    if (harvester?.customName) return harvester.customName;
    if (harvesterId === 97) return "Recolecta";
    if (harvesterId === 98) return "Segunda";
    if (harvesterId === 99) return "Desperdicio";
    return `Cortadora ${harvesterId}`;
  }, [harvesters]);

  const getPhotoUrl = useCallback((box: Box) => {
    if (box.photoUrl) return getProxiedImageUrl(box.photoUrl);
    if (box.photoFilename) return `/app/photos/${box.photoFilename}`;
    return null;
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
      newParcelCode: box.parcelCode,
      newParcelName: box.parcelName,
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
      parcelCode: editForm.newParcelCode || editForm.parcelCode!,
      parcelName: editForm.newParcelName || editForm.parcelName!,
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

  const handleClearFilters = useCallback(() => {
    setSearchInput("");
    setSearchQuery("");
    setFilterError('all');
    setSortBy('submissionTime');
    setSortOrder('desc');
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  const handleParcelChange = useCallback((parcelCode: string) => {
    const parcel = parcelsWithPolygon?.find(p => p.code === parcelCode);
    if (parcel) {
      setEditForm(prev => ({
        ...prev,
        newParcelCode: parcel.code,
        newParcelName: parcel.name,
      }));
    }
  }, [parcelsWithPolygon]);

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

  // Verificar si una caja tiene errores
  const hasError = useCallback((box: Box) => {
    const isDuplicate = duplicateCodes.includes(box.boxCode);
    const hasNoPolygon = parcelsWithoutPolygon.includes(box.parcelCode);
    return { isDuplicate, hasNoPolygon, hasAnyError: isDuplicate || hasNoPolygon };
  }, [duplicateCodes, parcelsWithoutPolygon]);

  const allSelected = boxes.length > 0 && selectedIds.size === boxes.length;
  const someSelected = selectedIds.size > 0;

  // Obtener cajas seleccionadas con fotos para comparar (máximo 3)
  const selectedBoxesForCompare = useMemo(() => {
    return boxes
      .filter(box => selectedIds.has(box.id))
      .slice(0, 3)
      .map(box => ({
        ...box,
        photoUrl: getPhotoUrl(box as Box)
      }));
  }, [boxes, selectedIds, getPhotoUrl]);

  const canComparePhotos = selectedBoxesForCompare.filter(b => b.photoUrl).length >= 2;

  const handleOpenCompare = useCallback(() => {
    setCompareZoom([1, 1, 1]);
    setShowCompareDialog(true);
  }, []);

  const toggleCompareZoom = useCallback((index: number) => {
    setCompareZoom(prev => {
      const newZoom = [...prev];
      newZoom[index] = newZoom[index] === 1 ? 2 : 1;
      return newZoom;
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <img src={APP_LOGO} alt="Agratec" className="h-16 w-16" />
          <div>
            <h1 className="text-4xl font-bold text-green-900">Editor de Cajas</h1>
            <p className="text-green-700">
              {total.toLocaleString()} cajas
              {isFetching && !isLoading && (
                <span className="ml-2 text-sm text-green-500">Actualizando...</span>
              )}
            </p>
          </div>
        </div>

        {/* Resumen de errores */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <GlassCard className="p-4 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setFilterError('all')}>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Filter className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-green-600">Total Cajas</p>
                <p className="text-2xl font-bold text-green-900">{total.toLocaleString()}</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard 
            className={`p-4 cursor-pointer hover:shadow-lg transition-shadow ${filterError === 'duplicates' ? 'ring-2 ring-red-500' : ''}`}
            onClick={() => setFilterError('duplicates')}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-red-600">Códigos Duplicados</p>
                <p className="text-2xl font-bold text-red-900">{duplicateCodes.length}</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard 
            className={`p-4 cursor-pointer hover:shadow-lg transition-shadow ${filterError === 'no_polygon' ? 'ring-2 ring-orange-500' : ''}`}
            onClick={() => setFilterError('no_polygon')}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <MapPin className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-orange-600">Sin Polígono</p>
                <p className="text-2xl font-bold text-orange-900">{parcelsWithoutPolygon.length} parcelas</p>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Buscador y Filtros */}
        <GlassCard className="mb-6 p-6">
          {/* Buscador */}
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-green-900">Buscar por código de caja</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-green-500" />
              <Input
                type="text"
                placeholder="Ej: 01-123456"
                value={searchInput}
                onChange={handleSearchChange}
                className="pl-10 border-green-200 focus:border-green-500 focus:ring-green-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-green-600" />
              <h2 className="text-lg font-semibold text-green-900">Filtro de Errores</h2>
            </div>
            <Button
              onClick={handleClearFilters}
              variant="outline"
              className="border-green-600 text-green-700 hover:bg-green-50"
            >
              Limpiar Filtros
            </Button>
          </div>
          
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select value={filterError} onValueChange={(v) => setFilterError(v as any)}>
              <SelectTrigger className="border-green-200">
                <SelectValue placeholder="Filtrar por error" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las cajas</SelectItem>
                <SelectItem value="duplicates">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Solo códigos duplicados
                  </span>
                </SelectItem>
                <SelectItem value="no_polygon">
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-orange-500" />
                    Solo sin polígono
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </GlassCard>

        {/* Barra de acciones por lotes */}
        {someSelected && (
          <GlassCard className="mb-4 p-4 bg-blue-50 border-blue-200">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-blue-900">
                  {selectedIds.size} caja{selectedIds.size !== 1 ? 's' : ''} seleccionada{selectedIds.size !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {canComparePhotos && (
                  <Button
                    onClick={handleOpenCompare}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Images className="h-4 w-4 mr-2" />
                    Comparar Fotos ({Math.min(selectedBoxesForCompare.filter(b => b.photoUrl).length, 3)})
                  </Button>
                )}
                <Button
                  onClick={() => setShowBatchDialog(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Edit3 className="h-4 w-4 mr-2" />
                  Cambiar Parcela
                </Button>
                <Button
                  onClick={handleBatchDelete}
                  variant="destructive"
                  disabled={deleteBatch.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </Button>
                <Button
                  onClick={() => setSelectedIds(new Set())}
                  variant="outline"
                  className="border-blue-300"
                >
                  <X className="h-4 w-4 mr-2" />
                  Deseleccionar
                </Button>
              </div>
            </div>
          </GlassCard>
        )}

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
                      <th className="pb-3 pr-2 text-center">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={toggleSelectAll}
                          className="border-green-400"
                        />
                      </th>
                      <SortableHeader label="Código" column="boxCode" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                      <SortableHeader label="Parcela" column="parcelCode" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                      <SortableHeader label="Nombre" column="parcelName" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                      <SortableHeader label="Cortadora" column="harvesterId" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                      <th className="pb-3 pr-4 text-right text-sm font-semibold text-green-900 cursor-pointer hover:bg-green-50" onClick={() => handleSort('weight')}>
                        <div className="flex items-center justify-end gap-1">
                          Peso
                          {sortBy === 'weight' ? (
                            sortOrder === 'asc' ? <ArrowUp className="h-4 w-4 text-green-600" /> : <ArrowDown className="h-4 w-4 text-green-600" />
                          ) : (
                            <ArrowUpDown className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      </th>
                      <SortableHeader label="Fecha" column="submissionTime" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                      <th className="pb-3 text-center text-sm font-semibold text-green-900">Foto</th>
                      <th className="pb-3 text-center text-sm font-semibold text-green-900">Mapa</th>
                      <th className="pb-3 text-center text-sm font-semibold text-green-900">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxes.map((box) => {
                      const isEditing = editingId === box.id;
                      const photoUrl = getPhotoUrl(box as Box);
                      const errors = hasError(box as Box);
                      const isSelected = selectedIds.has(box.id);
                      
                      return (
                        <tr 
                          key={box.id} 
                          className={`border-b border-green-100 transition-colors hover:bg-green-50/50 ${
                            isSelected ? 'bg-blue-50' :
                            errors.isDuplicate ? 'bg-red-50' : 
                            errors.hasNoPolygon ? 'bg-orange-50' : ''
                          }`}
                        >
                          <td className="py-3 pr-2 text-center">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(box.id)}
                              className="border-green-400"
                            />
                          </td>
                          
                          <td className="py-3 pr-4">
                            {isEditing ? (
                              <Input
                                value={editForm.boxCode}
                                onChange={(e) => setEditForm({ ...editForm, boxCode: e.target.value })}
                                className="h-8 text-sm"
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className={`font-mono text-sm ${errors.isDuplicate ? 'text-red-700 font-bold' : 'text-green-900'}`}>
                                  {box.boxCode}
                                </span>
                                {errors.isDuplicate && (
                                  <AlertTriangle className="h-4 w-4 text-red-500" title="Código duplicado" />
                                )}
                              </div>
                            )}
                          </td>
                          
                          <td className="py-3 pr-4">
                            {isEditing ? (
                              <Select 
                                value={editForm.newParcelCode || editForm.parcelCode} 
                                onValueChange={handleParcelChange}
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {parcelsWithPolygon?.map(p => (
                                    <SelectItem key={p.code} value={p.code}>
                                      {p.code} - {p.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className={`text-sm ${errors.hasNoPolygon ? 'text-orange-700 font-bold' : 'text-green-900'}`}>
                                  {box.parcelCode}
                                </span>
                                {errors.hasNoPolygon && (
                                  <MapPin className="h-4 w-4 text-orange-500" title="Sin polígono" />
                                )}
                              </div>
                            )}
                          </td>
                          
                          <td className="py-3 pr-4">
                            {isEditing ? (
                              <span className="text-sm text-gray-500">{editForm.newParcelName || editForm.parcelName}</span>
                            ) : (
                              <span className={`text-sm ${errors.hasNoPolygon ? 'text-orange-700' : 'text-green-900'}`}>
                                {box.parcelName}
                              </span>
                            )}
                          </td>
                          
                          <td className="py-3 pr-4">
                            {isEditing ? (
                              <Input
                                type="number"
                                value={editForm.harvesterId}
                                onChange={(e) => setEditForm({ ...editForm, harvesterId: parseInt(e.target.value) })}
                                className="h-8 text-sm w-20"
                              />
                            ) : (
                              <span className="text-sm text-green-900">{getHarvesterName(box.harvesterId)}</span>
                            )}
                          </td>
                          
                          <td className="py-3 pr-4 text-right">
                            {isEditing ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={(editForm.weight! / 1000).toFixed(2)}
                                onChange={(e) => setEditForm({ ...editForm, weight: Math.round(parseFloat(e.target.value) * 1000) })}
                                className="h-8 text-sm w-24"
                              />
                            ) : (
                              <span className={`text-sm font-semibold ${box.weight > 20000 ? "text-red-600" : "text-green-900"}`}>
                                {(box.weight / 1000).toFixed(2)} kg
                              </span>
                            )}
                          </td>
                          
                          <td className="py-3 pr-4">
                            {isEditing ? (
                              <Input
                                type="datetime-local"
                                value={format(new Date(editForm.submissionTime!), "yyyy-MM-dd'T'HH:mm")}
                                onChange={(e) => setEditForm({ ...editForm, submissionTime: new Date(e.target.value) })}
                                className="h-8 text-sm"
                              />
                            ) : (
                              <span className="text-xs text-green-900">
                                {format(new Date(box.submissionTime), "dd/MM/yy HH:mm", { locale: es })}
                              </span>
                            )}
                          </td>
                          
                          <td className="py-3 text-center">
                            {photoUrl ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openPhoto(photoUrl)}
                                className="h-8 w-8 p-0 hover:bg-green-100"
                              >
                                <ImageIcon className="h-4 w-4 text-green-600" />
                              </Button>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          
                          <td className="py-3 text-center">
                            {box.latitude && box.longitude ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedMap({ latitude: box.latitude, longitude: box.longitude, boxCode: box.boxCode })}
                                className="h-8 w-8 p-0 hover:bg-green-100"
                              >
                                <MapPin className="h-4 w-4 text-green-600" />
                              </Button>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          
                          <td className="py-3">
                            <div className="flex items-center justify-center gap-1">
                              {isEditing ? (
                                <>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={saveEdit}
                                    disabled={updateBox.isPending}
                                    className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700"
                                  >
                                    <Save className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={cancelEdit}
                                    className="h-8 w-8 p-0 border-green-300"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => startEdit(box as Box)}
                                    className="h-8 w-8 p-0 border-green-300 hover:bg-green-50"
                                  >
                                    <Pencil className="h-4 w-4 text-green-600" />
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
              <AlertTriangle className="mx-auto mb-4 h-16 w-16 text-green-300" />
              <h3 className="mb-2 text-xl font-semibold text-green-900">No hay cajas que coincidan</h3>
              <p className="text-green-600">Intenta ajustar los filtros o la búsqueda</p>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Modal de edición por lotes */}
      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-blue-600" />
              Cambiar Parcela ({selectedIds.size} cajas)
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            <label className="mb-2 block text-sm font-medium">Seleccionar nueva parcela</label>
            <Select value={batchParcelCode} onValueChange={handleBatchParcelChange}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar parcela..." />
              </SelectTrigger>
              <SelectContent>
                {parcelsWithPolygon?.map(p => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.code} - {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {batchParcelCode && (
              <p className="mt-2 text-sm text-gray-600">
                Nueva parcela: <strong>{batchParcelCode}</strong> - {batchParcelName}
              </p>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleBatchUpdate}
              disabled={!batchParcelCode || updateParcelBatch.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateParcelBatch.isPending ? "Actualizando..." : "Actualizar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de foto */}
      <Dialog open={!!selectedPhoto} onOpenChange={closePhoto}>
        <DialogContent className="max-w-4xl p-0">
          <DialogHeader className="p-4 border-b">
            <DialogTitle>Foto de la Caja</DialogTitle>
          </DialogHeader>
          <div className="relative overflow-auto max-h-[70vh] p-4">
            {photoError ? (
              <div className="text-center py-8 text-gray-500">
                Error al cargar la imagen
              </div>
            ) : (
              selectedPhoto && (
                <img
                  src={selectedPhoto}
                  alt="Foto de caja"
                  className={`w-full h-auto rounded-lg cursor-pointer transition-transform ${photoZoom ? 'scale-150' : 'scale-100'}`}
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

      {/* Modal de comparación de fotos */}
      <Dialog open={showCompareDialog} onOpenChange={setShowCompareDialog}>
        <DialogContent className="max-w-7xl max-h-[95vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Images className="h-5 w-5 text-purple-600" />
              Comparar Fotos ({selectedBoxesForCompare.filter(b => b.photoUrl).length} cajas)
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto max-h-[75vh] p-2">
            {selectedBoxesForCompare.map((box, index) => (
              <div key={box.id} className="flex flex-col border rounded-lg overflow-hidden bg-white shadow-sm">
                {/* Info de la caja */}
                <div className="p-3 bg-gray-50 border-b">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-lg text-gray-900">{box.boxCode}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCompareZoom(index)}
                      className="h-8 w-8 p-0"
                    >
                      {compareZoom[index] > 1 ? (
                        <ZoomOut className="h-4 w-4" />
                      ) : (
                        <ZoomIn className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="mt-1 text-sm text-gray-600 space-y-1">
                    <p><strong>Parcela:</strong> {box.parcelCode} - {box.parcelName}</p>
                    <p><strong>Peso:</strong> {((box.weight || 0) / 1000).toFixed(2)} kg</p>
                    <p><strong>Fecha:</strong> {format(new Date(box.submissionTime), "dd/MM/yyyy HH:mm", { locale: es })}</p>
                  </div>
                </div>
                
                {/* Foto */}
                <div className="relative overflow-auto flex-1" style={{ minHeight: '300px', maxHeight: '400px' }}>
                  {box.photoUrl ? (
                    <img
                      src={box.photoUrl}
                      alt={`Foto de caja ${box.boxCode}`}
                      className="w-full h-auto cursor-pointer transition-transform duration-200"
                      style={{ transform: `scale(${compareZoom[index]})`, transformOrigin: 'top left' }}
                      onClick={() => toggleCompareZoom(index)}
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full bg-gray-100 text-gray-400">
                      <div className="text-center">
                        <ImageIcon className="h-12 w-12 mx-auto mb-2" />
                        <p>Sin foto</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <DialogFooter className="border-t pt-4">
            <div className="flex items-center justify-between w-full">
              <p className="text-sm text-gray-500">
                Haz clic en las fotos o en <ZoomIn className="h-4 w-4 inline" /> para hacer zoom
              </p>
              <Button variant="outline" onClick={() => setShowCompareDialog(false)}>
                Cerrar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
