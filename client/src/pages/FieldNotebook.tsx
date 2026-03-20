import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ProtectedPage } from "@/components/ProtectedPage";
import { GlassCard } from "@/components/GlassCard";
import { toast } from "sonner";
import {
  BookOpen, Plus, Search, Filter, Calendar, User, Clock, MapPin, Package, Wrench,
  Trash2, Edit3, ChevronDown, ChevronUp, Save, X, Droplets, FlaskConical, Scissors,
  Bug, Sprout, CloudSun, Thermometer, Camera, CheckCircle2, AlertCircle, Pause,
  Leaf, Shield, Warehouse, ArrowDown, Info,
} from "lucide-react";

// ===== CONSTANTES =====

const ACTIVITY_TYPES = [
  { value: "riego", label: "Riego", icon: Droplets, color: "text-blue-600 bg-blue-50" },
  { value: "fertilizacion", label: "Fertilización", icon: FlaskConical, color: "text-amber-600 bg-amber-50" },
  { value: "nutricion", label: "Nutrición", icon: Leaf, color: "text-green-600 bg-green-50" },
  { value: "poda", label: "Poda", icon: Scissors, color: "text-purple-600 bg-purple-50" },
  { value: "control_maleza", label: "Control Maleza", icon: Sprout, color: "text-lime-600 bg-lime-50" },
  { value: "control_plagas", label: "Control Plagas", icon: Bug, color: "text-red-600 bg-red-50" },
  { value: "aplicacion_fitosanitaria", label: "Fitosanitaria", icon: Shield, color: "text-teal-600 bg-teal-50" },
  { value: "otro", label: "Otro", icon: BookOpen, color: "text-gray-600 bg-gray-50" },
];

const ACTIVITY_SUBTYPES: Record<string, string[]> = {
  riego: ["Goteo", "Aspersión", "Gravedad", "Microaspersión", "Inundación", "Fertirriego"],
  fertilizacion: ["Granular al suelo", "Líquida", "Foliar", "Orgánica", "Fertirriego", "Enmienda", "Cal agrícola", "Yeso agrícola"],
  nutricion: ["Foliar", "Radicular", "Bioestimulante", "Ácidos húmicos", "Aminoácidos", "Microelementos"],
  poda: ["Formación", "Producción", "Sanitaria", "Rejuvenecimiento", "Despunte", "Aclareo", "Deshoje"],
  control_maleza: ["Herbicida preemergente", "Herbicida postemergente", "Herbicida selectivo", "Herbicida no selectivo", "Mecánico (desbrozadora)", "Mecánico (machete)", "Mecánico (azadón)", "Manual", "Cobertura vegetal"],
  control_plagas: ["Insecticida", "Fungicida", "Acaricida", "Nematicida", "Biológico", "Trampas", "Monitoreo"],
  aplicacion_fitosanitaria: ["Preventiva", "Curativa", "Erradicante", "Protectante"],
};

const PRODUCT_TYPES = [
  { value: "fertilizante", label: "Fertilizante" }, { value: "herbicida", label: "Herbicida" },
  { value: "insecticida", label: "Insecticida" }, { value: "fungicida", label: "Fungicida" },
  { value: "acaricida", label: "Acaricida" }, { value: "nematicida", label: "Nematicida" },
  { value: "bioestimulante", label: "Bioestimulante" }, { value: "regulador", label: "Regulador" },
  { value: "coadyuvante", label: "Coadyuvante" }, { value: "enmienda", label: "Enmienda" },
  { value: "sustrato", label: "Sustrato" }, { value: "semilla", label: "Semilla" },
  { value: "nutriente_foliar", label: "Nutriente Foliar" }, { value: "acido_humico", label: "Ácido Húmico" },
  { value: "aminoacido", label: "Aminoácido" }, { value: "microelemento", label: "Microelemento" },
  { value: "agua", label: "Agua" }, { value: "otro", label: "Otro" },
];

const UNITS = [
  { value: "kg", label: "Kilogramos (kg)" }, { value: "g", label: "Gramos (g)" },
  { value: "lt", label: "Litros (lt)" }, { value: "ml", label: "Mililitros (ml)" },
  { value: "ton", label: "Toneladas" }, { value: "bulto", label: "Bultos" },
  { value: "saco", label: "Sacos" }, { value: "unidad", label: "Unidades" },
  { value: "otro", label: "Otro" },
];

const STATUS_OPTIONS = [
  { value: "planificada", label: "Planificada", icon: Calendar, color: "text-blue-600 bg-blue-50 border-blue-200" },
  { value: "en_progreso", label: "En Progreso", icon: Pause, color: "text-amber-600 bg-amber-50 border-amber-200" },
  { value: "completada", label: "Completada", icon: CheckCircle2, color: "text-green-600 bg-green-50 border-green-200" },
  { value: "cancelada", label: "Cancelada", icon: AlertCircle, color: "text-red-600 bg-red-50 border-red-200" },
];

const TOOL_TYPES = [
  { value: "tractor", label: "Tractor" }, { value: "aspersora", label: "Aspersora" },
  { value: "bomba", label: "Bomba" }, { value: "desbrozadora", label: "Desbrozadora" },
  { value: "motosierra", label: "Motosierra" }, { value: "tijera_poda", label: "Tijera de Poda" },
  { value: "azadon", label: "Azadón" }, { value: "machete", label: "Machete" },
  { value: "pala", label: "Pala" }, { value: "carretilla", label: "Carretilla" },
  { value: "drone", label: "Drone" }, { value: "medidor", label: "Medidor/Sensor" },
  { value: "sistema_riego", label: "Sistema de Riego" }, { value: "vehiculo", label: "Vehículo" },
  { value: "otro", label: "Otro" },
];

interface ProductForm {
  warehouseProductId?: number;
  productName: string;
  productType: string;
  quantity: string;
  unit: string;
  dosisPerHectare: string;
  applicationMethod: string;
  notes: string;
}

interface ToolForm {
  warehouseToolId?: number;
  toolName: string;
  toolType: string;
  notes: string;
}

const emptyProduct: ProductForm = { productName: "", productType: "otro", quantity: "", unit: "kg", dosisPerHectare: "", applicationMethod: "", notes: "" };
const emptyTool: ToolForm = { toolName: "", toolType: "otro", notes: "" };

// ===== COMPONENTE PRINCIPAL =====

export default function FieldNotebook() {
  return (
    <ProtectedPage permission="canViewFieldNotebook">
      <FieldNotebookContent />
    </ProtectedPage>
  );
}

function FieldNotebookContent() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Estado de vista
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Filtros
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Formulario
  const [formData, setFormData] = useState({
    activityType: "riego" as string,
    activitySubtype: "",
    description: "",
    performedBy: "",
    activityDate: new Date().toISOString().split("T")[0],
    startTime: "",
    endTime: "",
    durationMinutes: undefined as number | undefined,
    weatherCondition: "",
    temperature: "",
    status: "completada",
    parcelIds: [] as number[],
  });
  const [formProducts, setFormProducts] = useState<ProductForm[]>([]);
  const [formTools, setFormTools] = useState<ToolForm[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Queries
  const { data: activities, isLoading, refetch } = trpc.fieldNotebook.list.useQuery(
    { activityType: filterType || undefined, status: filterStatus || undefined, startDate: filterStartDate || undefined, endDate: filterEndDate || undefined },
    { staleTime: 60_000 }
  );
  const { data: stats } = trpc.fieldNotebook.stats.useQuery(undefined, { staleTime: 120_000 });
  const { data: allParcels } = trpc.parcels.listActive.useQuery(undefined, { staleTime: 300_000 });
  const { data: warehouseProductsList } = trpc.warehouse.listProducts.useQuery({ }, { staleTime: 120_000 });
  const { data: warehouseToolsList } = trpc.warehouse.listTools.useQuery({ status: "disponible" }, { staleTime: 120_000 });
  const { data: currentWeather } = trpc.weather.getCurrent.useQuery(undefined, { staleTime: 300_000, retry: false });

  // Mutations
  const createMutation = trpc.fieldNotebook.create.useMutation({
    onSuccess: () => { toast.success("Actividad registrada"); refetch(); resetForm(); },
    onError: (e: any) => toast.error("Error: " + e.message),
  });
  const updateMutation = trpc.fieldNotebook.update.useMutation({
    onSuccess: () => { toast.success("Actividad actualizada"); refetch(); resetForm(); },
    onError: (e: any) => toast.error("Error: " + e.message),
  });
  const deleteMutation = trpc.fieldNotebook.delete.useMutation({
    onSuccess: () => { toast.success("Actividad eliminada"); refetch(); },
    onError: (e: any) => toast.error("Error: " + e.message),
  });
  const addMovementMutation = trpc.warehouse.addMovement.useMutation();

  // Auto-llenar clima cuando se abre el formulario
  useEffect(() => {
    if (showForm && !editingId && currentWeather && !formData.weatherCondition && !formData.temperature) {
      const today = new Date().toISOString().split("T")[0];
      if (formData.activityDate === today) {
        const w = currentWeather as any;
        const condition = w.description || w.weatherDescription || w.condition || "";
        const temp = w.temperature ?? w.temp ?? "";
        setFormData(prev => ({
          ...prev,
          weatherCondition: condition ? String(condition) : prev.weatherCondition,
          temperature: temp !== "" ? `${temp}°C` : prev.temperature,
        }));
      }
    }
  }, [showForm, editingId, currentWeather]);

  const resetForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      activityType: "riego", activitySubtype: "", description: "", performedBy: "",
      activityDate: new Date().toISOString().split("T")[0], startTime: "", endTime: "",
      durationMinutes: undefined, weatherCondition: "", temperature: "", status: "completada", parcelIds: [],
    });
    setFormProducts([]);
    setFormTools([]);
  }, []);

  const handleEdit = useCallback((activity: any) => {
    setFormData({
      activityType: activity.activityType, activitySubtype: activity.activitySubtype || "",
      description: activity.description || "", performedBy: activity.performedBy,
      activityDate: activity.activityDate, startTime: activity.startTime || "",
      endTime: activity.endTime || "", durationMinutes: activity.durationMinutes || undefined,
      weatherCondition: activity.weatherCondition || "", temperature: activity.temperature || "",
      status: activity.status, parcelIds: activity.parcels?.map((p: any) => p.id) || [],
    });
    setFormProducts(
      activity.products?.map((p: any) => ({
        warehouseProductId: undefined, productName: p.productName, productType: p.productType || "otro",
        quantity: p.quantity || "", unit: p.unit || "kg", dosisPerHectare: p.dosisPerHectare || "",
        applicationMethod: p.applicationMethod || "", notes: p.notes || "",
      })) || []
    );
    setFormTools(
      activity.tools?.map((t: any) => ({
        warehouseToolId: undefined, toolName: t.toolName, toolType: t.toolType || "otro", notes: t.notes || "",
      })) || []
    );
    setEditingId(activity.id);
    setShowForm(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formData.performedBy.trim()) { toast.error("Indica quién realizó la actividad"); return; }
    if (!formData.activityDate) { toast.error("Indica la fecha de la actividad"); return; }

    const payload = {
      ...formData,
      products: formProducts.filter(p => p.productName.trim()),
      tools: formTools.filter(t => t.toolName.trim()),
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          // Descontar stock de productos del almacén
          for (const p of formProducts) {
            if (p.warehouseProductId && p.quantity && Number(p.quantity) > 0) {
              addMovementMutation.mutate({
                productId: p.warehouseProductId, movementType: "salida",
                quantity: Number(p.quantity), reason: `Uso en actividad: ${formData.activityType}`,
                notes: `Libreta de campo - ${formData.activityDate}`,
              });
            }
          }
        },
      });
    }
  }, [formData, formProducts, formTools, editingId, createMutation, updateMutation, addMovementMutation]);

  // Seleccionar producto del almacén
  const selectWarehouseProduct = useCallback((idx: number, productId: number) => {
    const product = (warehouseProductsList as any[])?.find((p: any) => p.id === productId);
    if (!product) return;
    const updated = [...formProducts];
    updated[idx] = {
      ...updated[idx],
      warehouseProductId: product.id,
      productName: product.name + (product.brand ? ` (${product.brand})` : ""),
      productType: product.category || "otro",
      unit: product.unit || "kg",
    };
    setFormProducts(updated);
  }, [warehouseProductsList, formProducts]);

  // Seleccionar herramienta del almacén
  const selectWarehouseTool = useCallback((idx: number, toolId: number) => {
    const tool = (warehouseToolsList as any[])?.find((t: any) => t.id === toolId);
    if (!tool) return;
    const updated = [...formTools];
    updated[idx] = {
      ...updated[idx],
      warehouseToolId: tool.id,
      toolName: tool.name + (tool.brand ? ` (${tool.brand})` : ""),
      toolType: tool.category || "otro",
    };
    setFormTools(updated);
  }, [warehouseToolsList, formTools]);

  // Filtrar por búsqueda
  const filteredActivities = useMemo(() => {
    if (!activities) return [];
    if (!searchTerm.trim()) return activities;
    const term = searchTerm.toLowerCase();
    return activities.filter((a: any) =>
      a.performedBy?.toLowerCase().includes(term) ||
      a.description?.toLowerCase().includes(term) ||
      a.activitySubtype?.toLowerCase().includes(term) ||
      a.parcels?.some((p: any) => p.name.toLowerCase().includes(term)) ||
      a.products?.some((p: any) => p.productName.toLowerCase().includes(term))
    );
  }, [activities, searchTerm]);

  // Parcelas con polígono (filtrar las que tienen coordenadas)
  const parcelsWithPolygon = useMemo(() => {
    if (!allParcels) return [];
    return (allParcels as any[]).filter((p: any) => p.coordinates && p.coordinates.length > 0);
  }, [allParcels]);

  const getTypeInfo = (type: string) => ACTIVITY_TYPES.find(t => t.value === type) || ACTIVITY_TYPES[7];
  const getStatusInfo = (status: string) => STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[2];
  const formatDuration = (mins: number | null | undefined) => {
    if (!mins) return "—";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  // Productos activos del almacén
  const activeWarehouseProducts = useMemo(() => {
    return ((warehouseProductsList as any[]) || []).filter((p: any) => p.isActive !== false);
  }, [warehouseProductsList]);

  // Herramientas disponibles del almacén
  const activeWarehouseTools = useMemo(() => {
    return ((warehouseToolsList as any[]) || []);
  }, [warehouseToolsList]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 p-4 md:p-6 pb-24">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-2">
              <BookOpen className="w-7 h-7 text-green-600" />
              Libreta de Campo
            </h1>
            <p className="text-sm text-gray-500 mt-1">Registro de actividades agrícolas</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Nueva Actividad
          </button>
        </div>

        {/* Estadísticas rápidas */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center"><BookOpen className="w-5 h-5 text-green-600" /></div>
                <div><p className="text-xs text-gray-500">Total</p><p className="text-xl font-bold text-gray-800">{stats.total}</p></div>
              </div>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Calendar className="w-5 h-5 text-blue-600" /></div>
                <div><p className="text-xs text-gray-500">Este Mes</p><p className="text-xl font-bold text-gray-800">{stats.thisMonth}</p></div>
              </div>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><FlaskConical className="w-5 h-5 text-amber-600" /></div>
                <div><p className="text-xs text-gray-500">Fertilización</p><p className="text-xl font-bold text-gray-800">{stats.byType?.fertilizacion || 0}</p></div>
              </div>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><Scissors className="w-5 h-5 text-purple-600" /></div>
                <div><p className="text-xs text-gray-500">Podas</p><p className="text-xl font-bold text-gray-800">{stats.byType?.poda || 0}</p></div>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Filtros */}
        <GlassCard className="p-4" hover={false}>
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-600">Filtros</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none" />
            </div>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none">
              <option value="">Todos los tipos</option>
              {ACTIVITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none">
              <option value="">Todos los estados</option>
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none" />
            <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none" />
          </div>
        </GlassCard>

        {/* Formulario de nueva actividad / edición */}
        {showForm && (
          <GlassCard className="p-5" hover={false}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                {editingId ? <Edit3 className="w-5 h-5 text-amber-500" /> : <Plus className="w-5 h-5 text-green-500" />}
                {editingId ? "Editar Actividad" : "Nueva Actividad"}
              </h2>
              <button onClick={resetForm} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="space-y-5">
              {/* Tipo de actividad */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tipo de Actividad</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ACTIVITY_TYPES.map(type => {
                    const Icon = type.icon;
                    const selected = formData.activityType === type.value;
                    return (
                      <button key={type.value}
                        onClick={() => setFormData(prev => ({ ...prev, activityType: type.value, activitySubtype: "" }))}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                          selected ? `${type.color} border-current shadow-md scale-[1.02]` : "bg-white/50 border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}>
                        <Icon className="w-4 h-4" /><span className="truncate">{type.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subtipo */}
              {ACTIVITY_SUBTYPES[formData.activityType]?.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Subtipo</label>
                  <select value={formData.activitySubtype} onChange={(e) => setFormData(prev => ({ ...prev, activitySubtype: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none">
                    <option value="">Seleccionar subtipo...</option>
                    {ACTIVITY_SUBTYPES[formData.activityType].map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </div>
              )}

              {/* Datos principales */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Realizado por *</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={formData.performedBy} onChange={(e) => setFormData(prev => ({ ...prev, performedBy: e.target.value }))}
                      placeholder="Nombre de quien realizó la actividad"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Fecha *</label>
                  <input type="date" value={formData.activityDate} onChange={(e) => setFormData(prev => ({ ...prev, activityDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none" />
                </div>
              </div>

              {/* Tiempo de ejecución */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Hora Inicio</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="time" value={formData.startTime} onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Hora Fin</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="time" value={formData.endTime} onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Estado</label>
                  <select value={formData.status} onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none">
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Condiciones climáticas - Auto-llenado */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Condiciones Climáticas</label>
                  {currentWeather && (
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CloudSun className="w-3 h-3" /> Auto-llenado del sistema
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <CloudSun className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={formData.weatherCondition} onChange={(e) => setFormData(prev => ({ ...prev, weatherCondition: e.target.value }))}
                      placeholder="Ej: Soleado, Nublado, Lluvioso..."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none" />
                  </div>
                  <div className="relative">
                    <Thermometer className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={formData.temperature} onChange={(e) => setFormData(prev => ({ ...prev, temperature: e.target.value }))}
                      placeholder="Ej: 28°C"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none" />
                  </div>
                </div>
              </div>

              {/* Parcelas afectadas - Solo con polígono */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  <MapPin className="w-3.5 h-3.5 inline mr-1" />
                  Parcelas Afectadas
                  <span className="text-[10px] text-gray-400 font-normal ml-2">(Solo parcelas con polígono definido)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {parcelsWithPolygon.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No hay parcelas con polígono definido</p>
                  ) : (
                    parcelsWithPolygon.map((p: any) => {
                      const selected = formData.parcelIds.includes(p.id);
                      return (
                        <button key={p.id}
                          onClick={() => setFormData(prev => ({
                            ...prev,
                            parcelIds: selected ? prev.parcelIds.filter(id => id !== p.id) : [...prev.parcelIds, p.id],
                          }))}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            selected ? "bg-green-100 text-green-700 border-green-300 shadow-sm" : "bg-white/50 text-gray-500 border-gray-200 hover:border-gray-300"
                          }`}>
                          {p.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Productos - Integración con Almacén */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" /> Productos Utilizados
                  </label>
                  <button onClick={() => setFormProducts(prev => [...prev, { ...emptyProduct }])}
                    className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Agregar
                  </button>
                </div>
                {formProducts.map((product, idx) => (
                  <div key={idx} className="bg-white/40 rounded-xl p-3 mb-2 border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-500">Producto {idx + 1}</span>
                      <div className="flex items-center gap-2">
                        {product.warehouseProductId && (
                          <span className="text-[10px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Warehouse className="w-3 h-3" /> Del almacén
                          </span>
                        )}
                        <button onClick={() => setFormProducts(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Selector de almacén */}
                    {activeWarehouseProducts.length > 0 && (
                      <div className="mb-2">
                        <select
                          value={product.warehouseProductId || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) selectWarehouseProduct(idx, Number(val));
                          }}
                          className="w-full px-3 py-1.5 text-sm border border-blue-200 rounded-lg bg-blue-50/50 focus:ring-2 focus:ring-blue-300 outline-none">
                          <option value="">Seleccionar del almacén (opcional)...</option>
                          {activeWarehouseProducts.map((wp: any) => (
                            <option key={wp.id} value={wp.id}>
                              {wp.name}{wp.brand ? ` (${wp.brand})` : ""} — Stock: {wp.currentStock} {wp.unit}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      <input type="text" placeholder="Nombre del producto *" value={product.productName}
                        onChange={(e) => { const u = [...formProducts]; u[idx] = { ...u[idx], productName: e.target.value }; setFormProducts(u); }}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white/70 focus:ring-2 focus:ring-green-300 outline-none" />
                      <select value={product.productType}
                        onChange={(e) => { const u = [...formProducts]; u[idx] = { ...u[idx], productType: e.target.value }; setFormProducts(u); }}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white/70 focus:ring-2 focus:ring-green-300 outline-none">
                        {PRODUCT_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                      </select>
                      <div className="flex gap-2">
                        <input type="text" placeholder="Cantidad" value={product.quantity}
                          onChange={(e) => { const u = [...formProducts]; u[idx] = { ...u[idx], quantity: e.target.value }; setFormProducts(u); }}
                          className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white/70 focus:ring-2 focus:ring-green-300 outline-none" />
                        <select value={product.unit}
                          onChange={(e) => { const u = [...formProducts]; u[idx] = { ...u[idx], unit: e.target.value }; setFormProducts(u); }}
                          className="w-24 px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white/70 focus:ring-2 focus:ring-green-300 outline-none">
                          {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                      </div>
                      <input type="text" placeholder="Dosis/ha" value={product.dosisPerHectare}
                        onChange={(e) => { const u = [...formProducts]; u[idx] = { ...u[idx], dosisPerHectare: e.target.value }; setFormProducts(u); }}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white/70 focus:ring-2 focus:ring-green-300 outline-none" />
                      <input type="text" placeholder="Método de aplicación" value={product.applicationMethod}
                        onChange={(e) => { const u = [...formProducts]; u[idx] = { ...u[idx], applicationMethod: e.target.value }; setFormProducts(u); }}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white/70 focus:ring-2 focus:ring-green-300 outline-none" />
                      <input type="text" placeholder="Notas del producto" value={product.notes}
                        onChange={(e) => { const u = [...formProducts]; u[idx] = { ...u[idx], notes: e.target.value }; setFormProducts(u); }}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white/70 focus:ring-2 focus:ring-green-300 outline-none" />
                    </div>
                    {/* Indicador de stock */}
                    {product.warehouseProductId && product.quantity && (
                      <div className="mt-2 text-xs">
                        {(() => {
                          const wp = activeWarehouseProducts.find((p: any) => p.id === product.warehouseProductId);
                          if (!wp) return null;
                          const stock = Number((wp as any).currentStock) || 0;
                          const qty = Number(product.quantity) || 0;
                          const remaining = stock - qty;
                          return (
                            <span className={`flex items-center gap-1 ${remaining < 0 ? "text-red-500" : "text-green-600"}`}>
                              <ArrowDown className="w-3 h-3" />
                              Stock actual: {stock} → Después: {remaining < 0 ? <span className="font-bold">INSUFICIENTE ({remaining})</span> : remaining} {(wp as any).unit}
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Herramientas - Integración con Almacén */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                    <Wrench className="w-3.5 h-3.5" /> Herramientas / Equipos
                  </label>
                  <button onClick={() => setFormTools(prev => [...prev, { ...emptyTool }])}
                    className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Agregar
                  </button>
                </div>
                {formTools.map((tool, idx) => (
                  <div key={idx} className="bg-white/40 rounded-xl p-3 mb-2 border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-500">Herramienta {idx + 1}</span>
                      <div className="flex items-center gap-2">
                        {tool.warehouseToolId && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Warehouse className="w-3 h-3" /> Del almacén
                          </span>
                        )}
                        <button onClick={() => setFormTools(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Selector de almacén */}
                    {activeWarehouseTools.length > 0 && (
                      <div className="mb-2">
                        <select
                          value={tool.warehouseToolId || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) selectWarehouseTool(idx, Number(val));
                          }}
                          className="w-full px-3 py-1.5 text-sm border border-blue-200 rounded-lg bg-blue-50/50 focus:ring-2 focus:ring-blue-300 outline-none">
                          <option value="">Seleccionar del almacén (opcional)...</option>
                          {activeWarehouseTools.map((wt: any) => (
                            <option key={wt.id} value={wt.id}>
                              {wt.name}{wt.brand ? ` (${wt.brand})` : ""} — {wt.condition || "Buen estado"}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input type="text" placeholder="Nombre *" value={tool.toolName}
                        onChange={(e) => { const u = [...formTools]; u[idx] = { ...u[idx], toolName: e.target.value }; setFormTools(u); }}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white/70 focus:ring-2 focus:ring-green-300 outline-none" />
                      <select value={tool.toolType}
                        onChange={(e) => { const u = [...formTools]; u[idx] = { ...u[idx], toolType: e.target.value }; setFormTools(u); }}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white/70 focus:ring-2 focus:ring-green-300 outline-none">
                        {TOOL_TYPES.map(tt => <option key={tt.value} value={tt.value}>{tt.label}</option>)}
                      </select>
                      <input type="text" placeholder="Notas" value={tool.notes}
                        onChange={(e) => { const u = [...formTools]; u[idx] = { ...u[idx], notes: e.target.value }; setFormTools(u); }}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white/70 focus:ring-2 focus:ring-green-300 outline-none" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Descripción / observaciones */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Observaciones</label>
                <textarea value={formData.description} onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Notas adicionales sobre la actividad..." rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none resize-none" />
              </div>

              {/* Botones */}
              <div className="flex gap-3 justify-end">
                <button onClick={resetForm} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Cancelar</button>
                <button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all text-sm font-semibold disabled:opacity-50">
                  <Save className="w-4 h-4" />{editingId ? "Actualizar" : "Guardar"}
                </button>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Lista de actividades */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
          </div>
        ) : filteredActivities.length === 0 ? (
          <GlassCard className="p-8 text-center" hover={false}>
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No hay actividades registradas</p>
            <p className="text-gray-400 text-sm mt-1">Haz clic en "Nueva Actividad" para comenzar</p>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {filteredActivities.map((activity: any) => {
              const typeInfo = getTypeInfo(activity.activityType);
              const statusInfo = getStatusInfo(activity.status);
              const TypeIcon = typeInfo.icon;
              const StatusIcon = statusInfo.icon;
              const isExpanded = expandedId === activity.id;

              return (
                <GlassCard key={activity.id} className="overflow-hidden">
                  {/* Fila principal */}
                  <div className="p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : activity.id)}>
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${typeInfo.color}`}>
                        <TypeIcon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-800">{typeInfo.label}</span>
                          {activity.activitySubtype && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{activity.activitySubtype}</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${statusInfo.color}`}>
                            <StatusIcon className="w-3 h-3" />{statusInfo.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(activity.activityDate + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                          <span className="flex items-center gap-1"><User className="w-3 h-3" />{activity.performedBy}</span>
                          {activity.durationMinutes && (
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(activity.durationMinutes)}</span>
                          )}
                          {activity.parcels?.length > 0 && (
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{activity.parcels.map((p: any) => p.name).join(", ")}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {(isAdmin || (user?.id === activity.createdByUserId)) && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); handleEdit(activity); }}
                              className="p-1.5 hover:bg-amber-50 rounded-lg transition-colors" title="Editar">
                              <Edit3 className="w-4 h-4 text-amber-500" />
                            </button>
                            {isAdmin && (
                              <button onClick={(e) => { e.stopPropagation(); if (confirm("¿Eliminar esta actividad?")) deleteMutation.mutate({ id: activity.id }); }}
                                className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </button>
                            )}
                          </>
                        )}
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </div>
                  </div>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-white/30 p-4 space-y-4">
                      {activity.description && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Observaciones</p>
                          <p className="text-sm text-gray-700">{activity.description}</p>
                        </div>
                      )}

                      {/* Horario y clima */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {activity.startTime && (
                          <div className="bg-white/50 rounded-lg p-2.5">
                            <p className="text-[10px] text-gray-400 uppercase">Inicio</p>
                            <p className="text-sm font-semibold text-gray-700">{activity.startTime}</p>
                          </div>
                        )}
                        {activity.endTime && (
                          <div className="bg-white/50 rounded-lg p-2.5">
                            <p className="text-[10px] text-gray-400 uppercase">Fin</p>
                            <p className="text-sm font-semibold text-gray-700">{activity.endTime}</p>
                          </div>
                        )}
                        {activity.weatherCondition && (
                          <div className="bg-white/50 rounded-lg p-2.5">
                            <p className="text-[10px] text-gray-400 uppercase">Clima</p>
                            <p className="text-sm font-semibold text-gray-700">{activity.weatherCondition}</p>
                          </div>
                        )}
                        {activity.temperature && (
                          <div className="bg-white/50 rounded-lg p-2.5">
                            <p className="text-[10px] text-gray-400 uppercase">Temperatura</p>
                            <p className="text-sm font-semibold text-gray-700">{activity.temperature}</p>
                          </div>
                        )}
                      </div>

                      {/* Productos */}
                      {activity.products?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                            <Package className="w-3.5 h-3.5" /> Productos ({activity.products.length})
                          </p>
                          <div className="space-y-2">
                            {activity.products.map((p: any, i: number) => (
                              <div key={i} className="bg-white/50 rounded-lg p-3 flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                                  <Package className="w-4 h-4 text-amber-500" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-semibold text-gray-800">{p.productName}</p>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                      {PRODUCT_TYPES.find(pt => pt.value === p.productType)?.label || p.productType}
                                    </span>
                                    {p.quantity && (
                                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                                        {p.quantity} {UNITS.find(u => u.value === p.unit)?.label || p.unit}
                                      </span>
                                    )}
                                    {p.dosisPerHectare && (
                                      <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">Dosis: {p.dosisPerHectare}/ha</span>
                                    )}
                                    {p.applicationMethod && (
                                      <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{p.applicationMethod}</span>
                                    )}
                                  </div>
                                  {p.notes && <p className="text-xs text-gray-500 mt-1">{p.notes}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Herramientas */}
                      {activity.tools?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                            <Wrench className="w-3.5 h-3.5" /> Herramientas ({activity.tools.length})
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {activity.tools.map((t: any, i: number) => (
                              <div key={i} className="bg-white/50 rounded-lg px-3 py-2 flex items-center gap-2">
                                <Wrench className="w-3.5 h-3.5 text-gray-500" />
                                <span className="text-sm font-medium text-gray-700">{t.toolName}</span>
                                <span className="text-xs text-gray-400">({TOOL_TYPES.find(tt => tt.value === t.toolType)?.label || t.toolType})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Fotos */}
                      {activity.photos?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                            <Camera className="w-3.5 h-3.5" /> Fotos ({activity.photos.length})
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {activity.photos.map((photo: any, i: number) => (
                              <div key={i} className="relative group">
                                <img src={photo.photoUrl} alt={photo.caption || `Foto ${i + 1}`}
                                  className="w-full h-32 object-cover rounded-xl border border-gray-200" />
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent rounded-b-xl p-2">
                                  <span className="text-xs text-white capitalize">{photo.photoType}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                        Registrado el {new Date(activity.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  )}
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
