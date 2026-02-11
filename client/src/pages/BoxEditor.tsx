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
  CheckSquare, Square, Edit3, Images, ZoomIn, ZoomOut, Archive, RotateCcw,
  Wand2, PackageOpen
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

interface ArchivedBox {
  id: number;
  boxCode: string;
  harvesterId: number;
  parcelCode: string;
  parcelName: string;
  weight: number;
  photoUrl: string | null;
  submissionTime: Date;
  archivedAt: Date | null;
}

type SortColumn = 'boxCode' | 'parcelCode' | 'parcelName' | 'harvesterId' | 'weight' | 'submissionTime';
type SortOrder = 'asc' | 'desc';
type TabView = 'active' | 'archived';

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
  // Tab activo: cajas activas o archivadas
  const [activeTab, setActiveTab] = useState<TabView>('active');
  
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterError, setFilterError] = useState<'all' | 'duplicates' | 'no_polygon' | 'overweight'>('all');
  const [sortBy, setSortBy] = useState<SortColumn>('submissionTime');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  // Estado para cajas archivadas
  const [archivedPage, setArchivedPage] = useState(1);
  const [archivedSearch, setArchivedSearch] = useState("");
  const [archivedSearchQuery, setArchivedSearchQuery] = useState("");
  const [selectedArchivedIds, setSelectedArchivedIds] = useState<Set<number>>(new Set());
  
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
  const [dragState, setDragState] = useState<{ [key: number]: { x: number; y: number; isDragging: boolean; startX: number; startY: number } }>({
    0: { x: 0, y: 0, isDragging: false, startX: 0, startY: 0 },
    1: { x: 0, y: 0, isDragging: false, startX: 0, startY: 0 },
    2: { x: 0, y: 0, isDragging: false, startX: 0, startY: 0 },
  });
  
  // Estado para edición de código en modal
  const [editingCodeId, setEditingCodeId] = useState<number | null>(null);
  const [editingCodeValue, setEditingCodeValue] = useState("");
  
  // Estado para auto-resolución
  const [showAutoResolveResult, setShowAutoResolveResult] = useState(false);
  const [autoResolveResult, setAutoResolveResult] = useState<any>(null);

  // Debounce para búsqueda
  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearchQuery(value);
    setPage(1);
  }, 300);

  const debouncedArchivedSearch = useDebouncedCallback((value: string) => {
    setArchivedSearchQuery(value);
    setArchivedPage(1);
  }, 300);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchInput(value);
    debouncedSearch(value);
  };

  const handleArchivedSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setArchivedSearch(value);
    debouncedArchivedSearch(value);
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
      placeholderData: (prev: any) => prev,
      enabled: activeTab === 'active',
    }
  );

  // Query para cajas archivadas
  const { data: archivedData, isLoading: isLoadingArchived, isFetching: isFetchingArchived, refetch: refetchArchived } = trpc.boxes.listArchived.useQuery(
    {
      page: archivedPage,
      pageSize,
      search: archivedSearchQuery || undefined,
    },
    {
      placeholderData: (prev: any) => prev,
      enabled: activeTab === 'archived',
    }
  );

  // Query para parcelas con polígono (para el selector)
  const { data: parcelsWithPolygon } = trpc.boxes.parcelsWithPolygon.useQuery();
  
  const { data: harvesters } = trpc.harvesters.list.useQuery();

  const updateBox = trpc.boxes.update.useMutation({
    onSuccess: () => {
      toast.success("Caja actualizada");
      refetch();
    },
    onError: (error) => {
      toast.error("Error al actualizar", { description: error.message });
    },
  });

  const deleteBox = trpc.boxes.delete.useMutation({
    onSuccess: () => {
      toast.success("Caja eliminada");
      refetch();
    },
    onError: (error) => {
      toast.error("Error al eliminar", { description: error.message });
    },
  });

  const updateParcelBatch = trpc.boxes.updateParcelBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.updated} cajas actualizadas`);
      setSelectedIds(new Set());
      setShowBatchDialog(false);
      setBatchParcelCode("");
      setBatchParcelName("");
      refetch();
    },
    onError: (error) => {
      toast.error("Error al actualizar", { description: error.message });
    },
  });

  const deleteBatch = trpc.boxes.deleteBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.deleted} cajas eliminadas`);
      setSelectedIds(new Set());
      refetch();
    },
    onError: (error) => {
      toast.error("Error al eliminar", { description: error.message });
    },
  });

  const archiveBatch = trpc.boxes.archiveBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.archived} cajas archivadas`);
      setSelectedIds(new Set());
      setShowCompareDialog(false);
      refetch();
      refetchArchived();
    },
    onError: (error) => {
      toast.error("Error al archivar", { description: error.message });
    },
  });

  const archiveBoxMut = trpc.boxes.archive.useMutation({
    onSuccess: () => {
      toast.success("Caja archivada");
      setShowCompareDialog(false);
      setSelectedIds(new Set());
      refetch();
      refetchArchived();
    },
    onError: (error) => {
      toast.error("Error al archivar", { description: error.message });
    },
  });

  const restoreBox = trpc.boxes.restore.useMutation({
    onSuccess: () => {
      toast.success("Caja desarchivada");
      refetchArchived();
      refetch();
    },
    onError: (error) => {
      toast.error("Error al desarchivar", { description: error.message });
    },
  });

  const restoreBatch = trpc.boxes.restoreBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.restored} cajas desarchivadas`);
      setSelectedArchivedIds(new Set());
      refetchArchived();
      refetch();
    },
    onError: (error) => {
      toast.error("Error al desarchivar", { description: error.message });
    },
  });

  const updateBoxCode = trpc.boxes.updateCode.useMutation({
    onSuccess: () => {
      toast.success("Código actualizado");
      setEditingCodeId(null);
      setEditingCodeValue("");
      refetch();
    },
    onError: (error) => {
      toast.error("Error al actualizar", { description: error.message });
    },
  });

  const autoResolveDuplicates = trpc.boxes.autoResolveDuplicates.useMutation({
    onSuccess: (data) => {
      setAutoResolveResult(data);
      setShowAutoResolveResult(true);
      if (data.renamed.length === 0 && data.archived.length === 0) {
        toast.info("No se encontraron duplicados para resolver");
      } else {
        toast.success(`${data.renamed.length} renombradas, ${data.archived.length} archivadas`);
      }
      refetch();
      refetchArchived();
    },
    onError: (error) => {
      toast.error("Error en auto-resolución", { description: error.message });
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

  useEffect(() => {
    setSelectedArchivedIds(new Set());
  }, [archivedPage, archivedSearchQuery]);

  const boxes = editorData?.boxes || [];
  const total = editorData?.total || 0;
  const totalPages = editorData?.totalPages || 0;
  const duplicateCodes = editorData?.duplicateCodes || [];
  const parcelsWithoutPolygon = editorData?.parcelsWithoutPolygon || [];

  const archivedBoxes = archivedData?.boxes || [];
  const archivedTotal = archivedData?.total || 0;
  const archivedTotalPages = archivedData?.totalPages || 0;

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

  const toggleArchivedSelect = useCallback((id: number) => {
    setSelectedArchivedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const toggleArchivedSelectAll = useCallback(() => {
    if (selectedArchivedIds.size === archivedBoxes.length) {
      setSelectedArchivedIds(new Set());
    } else {
      setSelectedArchivedIds(new Set(archivedBoxes.map(b => b.id)));
    }
  }, [archivedBoxes, selectedArchivedIds.size]);

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
    const isOverweight = box.weight > 15000; // > 15 kg
    return { isDuplicate, hasNoPolygon, isOverweight, hasAnyError: isDuplicate || hasNoPolygon || isOverweight };
  }, [duplicateCodes, parcelsWithoutPolygon]);

  const allSelected = boxes.length > 0 && selectedIds.size === boxes.length;
  const someSelected = selectedIds.size > 0;
  const allArchivedSelected = archivedBoxes.length > 0 && selectedArchivedIds.size === archivedBoxes.length;
  const someArchivedSelected = selectedArchivedIds.size > 0;

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

  const selectedWithPhotos = selectedBoxesForCompare.filter(b => b.photoUrl).length;
  const totalSelected = selectedIds.size;
  const tooManySelected = totalSelected > 3;
  const canComparePhotos = selectedWithPhotos >= 2 && !tooManySelected;

  const handleOpenCompare = useCallback(() => {
    setCompareZoom([1, 1, 1]);
    setShowCompareDialog(true);
  }, []);

  const toggleCompareZoom = useCallback((index: number) => {
    setCompareZoom(prev => {
      const newZoom = [...prev];
      const wasZoomed = newZoom[index] > 1;
      newZoom[index] = wasZoomed ? 1 : 2.5;
      return newZoom;
    });
    // Resetear posición de drag al cambiar zoom
    setDragState(prev => ({
      ...prev,
      [index]: { x: 0, y: 0, isDragging: false, startX: 0, startY: 0 }
    }));
  }, []);

  // Handlers para drag de imágenes
  const handleDragStart = useCallback((index: number, clientX: number, clientY: number) => {
    if (compareZoom[index] <= 1) return;
    setDragState(prev => ({
      ...prev,
      [index]: {
        ...prev[index],
        isDragging: true,
        startX: clientX - prev[index].x,
        startY: clientY - prev[index].y,
      }
    }));
  }, [compareZoom]);

  const handleDragMove = useCallback((index: number, clientX: number, clientY: number) => {
    if (!dragState[index]?.isDragging) return;
    setDragState(prev => ({
      ...prev,
      [index]: {
        ...prev[index],
        x: clientX - prev[index].startX,
        y: clientY - prev[index].startY,
      }
    }));
  }, [dragState]);

  const handleDragEnd = useCallback((index: number) => {
    setDragState(prev => ({
      ...prev,
      [index]: {
        ...prev[index],
        isDragging: false,
      }
    }));
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
              {activeTab === 'active' ? `${total.toLocaleString()} cajas activas` : `${archivedTotal.toLocaleString()} cajas archivadas`}
              {(isFetching || isFetchingArchived) && (
                <span className="ml-2 text-sm text-green-500">Actualizando...</span>
              )}
            </p>
          </div>
        </div>

        {/* Tabs: Activas / Archivadas */}
        <div className="mb-6 flex items-center gap-2">
          <Button
            variant={activeTab === 'active' ? 'default' : 'outline'}
            onClick={() => { setActiveTab('active'); setSelectedArchivedIds(new Set()); }}
            className={activeTab === 'active' ? 'bg-green-600 hover:bg-green-700' : 'border-green-300 text-green-700 hover:bg-green-50'}
          >
            <Filter className="h-4 w-4 mr-2" />
            Cajas Activas ({total.toLocaleString()})
          </Button>
          <Button
            variant={activeTab === 'archived' ? 'default' : 'outline'}
            onClick={() => { setActiveTab('archived'); setSelectedIds(new Set()); }}
            className={activeTab === 'archived' ? 'bg-orange-600 hover:bg-orange-700' : 'border-orange-300 text-orange-700 hover:bg-orange-50'}
          >
            <Archive className="h-4 w-4 mr-2" />
            Archivadas ({archivedTotal.toLocaleString()})
          </Button>
          <div className="flex-1" />
          <Button
            onClick={() => autoResolveDuplicates.mutate()}
            disabled={autoResolveDuplicates.isPending}
            variant="outline"
            className="border-purple-300 text-purple-700 hover:bg-purple-50"
          >
            <Wand2 className="h-4 w-4 mr-2" />
            {autoResolveDuplicates.isPending ? "Resolviendo..." : "Auto-resolver Duplicados"}
          </Button>
        </div>

        {/* ===== VISTA DE CAJAS ACTIVAS ===== */}
        {activeTab === 'active' && (
          <>
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
                    <SelectItem value="overweight">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-purple-500" />
                        Solo peso &gt; 15 kg
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
                    {tooManySelected ? (
                      <span className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-md border border-amber-200">
                        <AlertTriangle className="h-4 w-4 inline mr-1" />
                        Máximo 3 cajas para comparar fotos
                      </span>
                    ) : canComparePhotos ? (
                      <Button
                        onClick={handleOpenCompare}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        <Images className="h-4 w-4 mr-2" />
                        Comparar Fotos ({selectedWithPhotos})
                      </Button>
                    ) : null}
                    <Button
                      onClick={() => setShowBatchDialog(true)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Edit3 className="h-4 w-4 mr-2" />
                      Cambiar Parcela
                    </Button>
                    <Button
                      onClick={() => {
                        const ids = Array.from(selectedIds);
                        if (confirm(`¿Archivar ${ids.length} cajas seleccionadas?`)) {
                          archiveBatch.mutate({ boxIds: ids });
                        }
                      }}
                      variant="outline"
                      disabled={archiveBatch.isPending}
                      className="border-orange-300 text-orange-700 hover:bg-orange-50"
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      Archivar
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
                                errors.hasNoPolygon ? 'bg-orange-50' :
                                errors.isOverweight ? 'bg-purple-50' : ''
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
                                    className="h-8 text-sm w-28"
                                  />
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <span className={`font-mono text-sm font-semibold ${errors.isDuplicate ? 'text-red-700' : 'text-green-900'}`}>
                                      {box.boxCode}
                                    </span>
                                    {errors.isDuplicate && (
                                      <span title="Código duplicado"><AlertTriangle className="h-4 w-4 text-red-500" /></span>
                                    )}
                                  </div>
                                )}
                              </td>
                              
                              <td className="py-3 pr-4">
                                {isEditing ? (
                                  <Select value={editForm.newParcelCode || editForm.parcelCode} onValueChange={handleParcelChange}>
                                    <SelectTrigger className="h-8 text-sm w-24">
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
                                  <span className={`text-sm ${errors.hasNoPolygon ? 'text-orange-700 font-semibold' : 'text-green-900'}`}>
                                    {box.parcelCode}
                                    {errors.hasNoPolygon && (
                                      <MapPin className="h-3 w-3 inline ml-1 text-orange-500" />
                                    )}
                                  </span>
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
                                  <div className="flex items-center justify-end gap-1">
                                    <span className={`text-sm font-semibold ${box.weight > 15000 ? "text-purple-700 bg-purple-100 px-2 py-0.5 rounded" : "text-green-900"}`}>
                                      {(box.weight / 1000).toFixed(2)} kg
                                    </span>
                                    {box.weight > 15000 && (
                                      <span title="Peso excesivo (>15 kg)"><AlertTriangle className="h-4 w-4 text-purple-600" /></span>
                                    )}
                                  </div>
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
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          if (confirm(`¿Archivar caja ${box.boxCode}?`)) {
                                            archiveBoxMut.mutate({ id: box.id });
                                          }
                                        }}
                                        disabled={archiveBoxMut.isPending}
                                        className="h-8 w-8 p-0 border-orange-300 hover:bg-orange-50"
                                        title="Archivar caja"
                                      >
                                        <Archive className="h-4 w-4 text-orange-600" />
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
          </>
        )}

        {/* ===== VISTA DE CAJAS ARCHIVADAS ===== */}
        {activeTab === 'archived' && (
          <>
            {/* Info de archivadas */}
            <GlassCard className="mb-6 p-4 bg-orange-50 border-orange-200">
              <div className="flex items-center gap-3">
                <PackageOpen className="h-6 w-6 text-orange-600" />
                <div>
                  <p className="font-medium text-orange-900">Cajas Archivadas</p>
                  <p className="text-sm text-orange-700">
                    Las cajas archivadas no cuentan en estadísticas ni se vuelven a sincronizar. 
                    Puedes desarchivarlas para que vuelvan a aparecer en el sistema.
                  </p>
                </div>
              </div>
            </GlassCard>

            {/* Buscador de archivadas */}
            <GlassCard className="mb-6 p-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-orange-500" />
                <Input
                  type="text"
                  placeholder="Buscar en cajas archivadas..."
                  value={archivedSearch}
                  onChange={handleArchivedSearchChange}
                  className="pl-10 border-orange-200 focus:border-orange-500 focus:ring-orange-500"
                />
              </div>
            </GlassCard>

            {/* Barra de acciones por lotes para archivadas */}
            {someArchivedSelected && (
              <GlassCard className="mb-4 p-4 bg-blue-50 border-blue-200">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-5 w-5 text-blue-600" />
                    <span className="font-medium text-blue-900">
                      {selectedArchivedIds.size} caja{selectedArchivedIds.size !== 1 ? 's' : ''} seleccionada{selectedArchivedIds.size !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => {
                        const ids = Array.from(selectedArchivedIds);
                        if (confirm(`¿Desarchivar ${ids.length} cajas seleccionadas?`)) {
                          restoreBatch.mutate({ boxIds: ids });
                        }
                      }}
                      disabled={restoreBatch.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {restoreBatch.isPending ? "Desarchivando..." : "Desarchivar Seleccionadas"}
                    </Button>
                    <Button
                      onClick={() => setSelectedArchivedIds(new Set())}
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

            {/* Tabla de archivadas */}
            <GlassCard className="overflow-hidden p-6" hover={false}>
              {isLoadingArchived ? (
                <TableSkeleton />
              ) : archivedBoxes.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b-2 border-orange-200">
                          <th className="pb-3 pr-2 text-center">
                            <Checkbox
                              checked={allArchivedSelected}
                              onCheckedChange={toggleArchivedSelectAll}
                              className="border-orange-400"
                            />
                          </th>
                          <th className="pb-3 pr-4 text-left text-sm font-semibold text-orange-900">Código</th>
                          <th className="pb-3 pr-4 text-left text-sm font-semibold text-orange-900">Parcela</th>
                          <th className="pb-3 pr-4 text-left text-sm font-semibold text-orange-900">Nombre</th>
                          <th className="pb-3 pr-4 text-left text-sm font-semibold text-orange-900">Cortadora</th>
                          <th className="pb-3 pr-4 text-right text-sm font-semibold text-orange-900">Peso</th>
                          <th className="pb-3 pr-4 text-left text-sm font-semibold text-orange-900">Fecha Registro</th>
                          <th className="pb-3 pr-4 text-left text-sm font-semibold text-orange-900">Archivada</th>
                          <th className="pb-3 text-center text-sm font-semibold text-orange-900">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {archivedBoxes.map((box) => {
                          const isSelected = selectedArchivedIds.has(box.id);
                          
                          return (
                            <tr 
                              key={box.id} 
                              className={`border-b border-orange-100 transition-colors hover:bg-orange-50/50 ${
                                isSelected ? 'bg-blue-50' : ''
                              }`}
                            >
                              <td className="py-3 pr-2 text-center">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleArchivedSelect(box.id)}
                                  className="border-orange-400"
                                />
                              </td>
                              
                              <td className="py-3 pr-4">
                                <span className="font-mono text-sm font-semibold text-gray-600">
                                  {box.boxCode}
                                </span>
                              </td>
                              
                              <td className="py-3 pr-4">
                                <span className="text-sm text-gray-600">{box.parcelCode}</span>
                              </td>
                              
                              <td className="py-3 pr-4">
                                <span className="text-sm text-gray-600">{box.parcelName}</span>
                              </td>
                              
                              <td className="py-3 pr-4">
                                <span className="text-sm text-gray-600">{getHarvesterName(box.harvesterId)}</span>
                              </td>
                              
                              <td className="py-3 pr-4 text-right">
                                <span className="text-sm font-semibold text-gray-600">
                                  {(box.weight / 1000).toFixed(2)} kg
                                </span>
                              </td>
                              
                              <td className="py-3 pr-4">
                                <span className="text-xs text-gray-600">
                                  {format(new Date(box.submissionTime), "dd/MM/yy HH:mm", { locale: es })}
                                </span>
                              </td>
                              
                              <td className="py-3 pr-4">
                                <span className="text-xs text-orange-600">
                                  {box.archivedAt ? format(new Date(box.archivedAt), "dd/MM/yy HH:mm", { locale: es }) : '-'}
                                </span>
                              </td>
                              
                              <td className="py-3 text-center">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    if (confirm(`¿Desarchivar caja ${box.boxCode}?`)) {
                                      restoreBox.mutate({ id: box.id });
                                    }
                                  }}
                                  disabled={restoreBox.isPending}
                                  className="h-8 border-green-300 hover:bg-green-50 text-green-700"
                                  title="Desarchivar caja"
                                >
                                  <RotateCcw className="h-4 w-4 mr-1" />
                                  Desarchivar
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginación de archivadas */}
                  <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-orange-200 pt-4">
                    <div className="text-sm text-orange-700">
                      Mostrando {((archivedPage - 1) * pageSize) + 1} - {Math.min(archivedPage * pageSize, archivedTotal)} de {archivedTotal.toLocaleString()} archivadas
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setArchivedPage(1)}
                        disabled={archivedPage === 1 || isFetchingArchived}
                        className="border-orange-300 hover:bg-orange-50"
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setArchivedPage(p => Math.max(1, p - 1))}
                        disabled={archivedPage === 1 || isFetchingArchived}
                        className="border-orange-300 hover:bg-orange-50"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      
                      <div className="flex items-center gap-1 px-2">
                        <span className="text-sm font-medium text-orange-900">
                          Página {archivedPage} de {archivedTotalPages}
                        </span>
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setArchivedPage(p => Math.min(archivedTotalPages, p + 1))}
                        disabled={archivedPage === archivedTotalPages || isFetchingArchived}
                        className="border-orange-300 hover:bg-orange-50"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setArchivedPage(archivedTotalPages)}
                        disabled={archivedPage === archivedTotalPages || isFetchingArchived}
                        className="border-orange-300 hover:bg-orange-50"
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center">
                  <PackageOpen className="mx-auto mb-4 h-16 w-16 text-orange-300" />
                  <h3 className="mb-2 text-xl font-semibold text-orange-900">No hay cajas archivadas</h3>
                  <p className="text-orange-600">Las cajas archivadas aparecerán aquí</p>
                </div>
              )}
            </GlassCard>
          </>
        )}
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

      {/* Modal de resultado de auto-resolución */}
      <Dialog open={showAutoResolveResult} onOpenChange={setShowAutoResolveResult}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-purple-600" />
              Resultado de Auto-resolución
            </DialogTitle>
          </DialogHeader>
          
          {autoResolveResult && (
            <div className="py-4 space-y-4">
              <p className="text-sm text-gray-700">{autoResolveResult.message}</p>
              
              {autoResolveResult.renamed.length > 0 && (
                <div>
                  <h4 className="font-semibold text-green-800 mb-2">
                    Cajas Renombradas ({autoResolveResult.renamed.length})
                  </h4>
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {autoResolveResult.renamed.map((r: any, i: number) => (
                      <div key={i} className="text-sm bg-green-50 p-2 rounded flex items-center gap-2">
                        <span className="font-mono text-red-600 line-through">{r.oldCode}</span>
                        <span className="text-gray-400">&rarr;</span>
                        <span className="font-mono text-green-700 font-semibold">{r.newCode}</span>
                        <span className="text-xs text-gray-500 ml-auto">{r.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {autoResolveResult.archived.length > 0 && (
                <div>
                  <h4 className="font-semibold text-orange-800 mb-2">
                    Cajas Archivadas ({autoResolveResult.archived.length})
                  </h4>
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {autoResolveResult.archived.map((a: any, i: number) => (
                      <div key={i} className="text-sm bg-orange-50 p-2 rounded">
                        <span className="font-mono font-semibold text-orange-700">{a.code}</span>
                        <span className="text-xs text-gray-500 ml-2">{a.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {autoResolveResult.renamed.length === 0 && autoResolveResult.archived.length === 0 && (
                <div className="text-center py-4">
                  <CheckSquare className="mx-auto mb-2 h-12 w-12 text-green-400" />
                  <p className="text-green-700 font-medium">No se encontraron duplicados para resolver</p>
                  <p className="text-sm text-gray-500">Todas las cajas tienen códigos únicos</p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => setShowAutoResolveResult(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de comparación de fotos - Pantalla completa */}
      <Dialog open={showCompareDialog} onOpenChange={setShowCompareDialog}>
        <DialogContent 
          showCloseButton={false}
          className="!w-[95vw] !max-w-[95vw] !h-[85vh] !max-h-[85vh] flex flex-col !p-0 !gap-0 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-purple-50 border-b flex-shrink-0">
            <div className="flex items-center gap-3">
              <Images className="h-5 w-5 text-purple-600" />
              <span className="font-semibold text-purple-900">
                Comparar Fotos ({selectedBoxesForCompare.length})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowCompareDialog(false)}
                className="border-purple-300 hover:bg-purple-100"
              >
                <X className="h-4 w-4 mr-1" />
                Cerrar
              </Button>
            </div>
          </div>
          
          {/* Grid responsivo */}
          <div className={`flex-1 min-h-0 grid gap-3 p-3 bg-gray-100 overflow-auto
            grid-cols-1
            ${selectedBoxesForCompare.length === 2 ? 'md:grid-cols-2' : ''}
            ${selectedBoxesForCompare.length === 3 ? 'md:grid-cols-3' : ''}
          `}>
            {selectedBoxesForCompare.map((box, slotIndex) => {
              const isEditingThis = editingCodeId === box?.id;
              
              return (
                <div 
                  key={box.id} 
                  className="flex flex-col bg-white rounded-lg shadow-md overflow-hidden"
                >
                  {/* Header de la caja con acciones */}
                  <div className="px-3 py-2 bg-gray-50 border-b flex-shrink-0">
                    {/* Código de caja - editable */}
                    <div className="flex items-center justify-between mb-2">
                      {isEditingThis ? (
                        <div className="flex items-center gap-2 flex-1 mr-2">
                          <Input
                            value={editingCodeValue}
                            onChange={(e) => setEditingCodeValue(e.target.value)}
                            className="font-mono font-bold text-lg h-8"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={() => {
                              if (editingCodeValue.trim()) {
                                updateBoxCode.mutate({ id: box.id, boxCode: editingCodeValue.trim() });
                              }
                            }}
                            disabled={updateBoxCode.isPending}
                            className="bg-green-600 hover:bg-green-700 h-8"
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingCodeId(null);
                              setEditingCodeValue("");
                            }}
                            className="h-8"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-lg text-gray-900">
                            {box.boxCode}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingCodeId(box.id);
                              setEditingCodeValue(box.boxCode);
                            }}
                            className="h-7 w-7 p-0"
                            title="Editar código"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCompareZoom(slotIndex);
                          }}
                          className="h-7 w-7 p-0"
                          title="Zoom"
                        >
                          {compareZoom[slotIndex] > 1 ? (
                            <ZoomOut className="h-4 w-4" />
                          ) : (
                            <ZoomIn className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`¿Archivar caja ${box.boxCode}?`)) {
                              archiveBoxMut.mutate({ id: box.id });
                            }
                          }}
                          className="h-7 w-7 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                          title="Archivar esta caja"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-600">
                      <p><strong>Parcela:</strong> {box.parcelCode} - {box.parcelName}</p>
                      <p><strong>Peso:</strong> {((box.weight || 0) / 1000).toFixed(2)} kg | <strong>Fecha:</strong> {format(new Date(box.submissionTime), "dd/MM/yy HH:mm", { locale: es })}</p>
                    </div>
                  </div>
                  
                  {/* Contenedor de foto con drag */}
                  <div 
                    className={`flex-1 overflow-hidden bg-gray-100 min-h-[250px] relative ${
                      compareZoom[slotIndex] > 1 ? 'cursor-grab' : 'cursor-zoom-in'
                    } ${dragState[slotIndex]?.isDragging ? 'cursor-grabbing' : ''}`}
                    onMouseDown={(e) => {
                      if (compareZoom[slotIndex] > 1) {
                        e.preventDefault();
                        handleDragStart(slotIndex, e.clientX, e.clientY);
                      }
                    }}
                    onMouseMove={(e) => handleDragMove(slotIndex, e.clientX, e.clientY)}
                    onMouseUp={() => handleDragEnd(slotIndex)}
                    onMouseLeave={() => handleDragEnd(slotIndex)}
                    onTouchStart={(e) => {
                      if (compareZoom[slotIndex] > 1 && e.touches.length === 1) {
                        handleDragStart(slotIndex, e.touches[0].clientX, e.touches[0].clientY);
                      }
                    }}
                    onTouchMove={(e) => {
                      if (e.touches.length === 1) {
                        handleDragMove(slotIndex, e.touches[0].clientX, e.touches[0].clientY);
                      }
                    }}
                    onTouchEnd={() => handleDragEnd(slotIndex)}
                    onDoubleClick={() => toggleCompareZoom(slotIndex)}
                  >
                    {box.photoUrl ? (
                      <img
                        src={box.photoUrl}
                        alt={`Foto de caja ${box.boxCode}`}
                        className="select-none"
                        draggable={false}
                        style={{ 
                          width: '100%',
                          height: '100%',
                          transform: `scale(${compareZoom[slotIndex]}) translate(${dragState[slotIndex]?.x / compareZoom[slotIndex] || 0}px, ${dragState[slotIndex]?.y / compareZoom[slotIndex] || 0}px)`,
                          transformOrigin: 'center center',
                          objectFit: 'contain',
                          transition: dragState[slotIndex]?.isDragging ? 'none' : 'transform 0.2s ease-out'
                        }}
                        loading="eager"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-400">
                        <div className="text-center">
                          <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>Sin foto</p>
                        </div>
                      </div>
                    )}
                    {/* Indicador de zoom */}
                    {compareZoom[slotIndex] > 1 && (
                      <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                        {compareZoom[slotIndex].toFixed(1)}x - Arrastra para mover
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Footer con acciones */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t flex-shrink-0">
            <span className="text-sm text-gray-500">
              Doble clic para zoom | Arrastra para mover | Lápiz para editar código
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const idsToArchive = selectedBoxesForCompare.map(b => b.id);
                  if (idsToArchive.length > 0 && confirm(`¿Archivar ${idsToArchive.length} cajas seleccionadas?`)) {
                    archiveBatch.mutate({ boxIds: idsToArchive });
                  }
                }}
                disabled={archiveBatch.isPending}
                className="border-orange-300 text-orange-700 hover:bg-orange-50"
              >
                <Archive className="h-4 w-4 mr-1" />
                Archivar Todas ({selectedBoxesForCompare.length})
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
