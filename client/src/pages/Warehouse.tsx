import { useState, useMemo, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Package, Wrench, Plus, Search, Edit2, Trash2, X, Save,
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, ChevronDown, ChevronUp,
  Box, TrendingUp, History, RefreshCw, Warehouse as WarehouseIcon,
  Users, Phone, Mail, MapPin, Globe, Star, Building2, Copy, ExternalLink,
  Camera, Image as ImageIcon,
} from "lucide-react";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const r = reader.result as string; resolve(r.split(",")[1]); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== HELPERS =====

/** Convierte un Date o string a formato YYYY-MM-DD para inputs type="date" */
function toDateStr(val: any): string {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().split("T")[0];
  if (typeof val === "string") return val.split("T")[0];
  return "";
}

// ===== CONSTANTES =====

const PRODUCT_CATEGORIES: Record<string, { label: string; color: string }> = {
  fertilizante_granular: { label: "Fertilizante Granular", color: "emerald" },
  fertilizante_liquido: { label: "Fertilizante Líquido", color: "emerald" },
  fertilizante_foliar: { label: "Fertilizante Foliar", color: "emerald" },
  fertilizante_organico: { label: "Fertilizante Orgánico", color: "emerald" },
  herbicida_preemergente: { label: "Herbicida Preemergente", color: "yellow" },
  herbicida_postemergente: { label: "Herbicida Postemergente", color: "yellow" },
  herbicida_selectivo: { label: "Herbicida Selectivo", color: "yellow" },
  herbicida_no_selectivo: { label: "Herbicida No Selectivo", color: "yellow" },
  insecticida: { label: "Insecticida", color: "red" },
  fungicida: { label: "Fungicida", color: "purple" },
  acaricida: { label: "Acaricida", color: "orange" },
  nematicida: { label: "Nematicida", color: "orange" },
  regulador_crecimiento: { label: "Regulador de Crecimiento", color: "blue" },
  bioestimulante: { label: "Bioestimulante", color: "teal" },
  enmienda_suelo: { label: "Enmienda de Suelo", color: "amber" },
  nutriente_foliar: { label: "Nutriente Foliar", color: "lime" },
  semilla: { label: "Semilla", color: "green" },
  sustrato: { label: "Sustrato", color: "stone" },
  agua: { label: "Agua", color: "cyan" },
  otro: { label: "Otro", color: "gray" },
};

const TOOL_CATEGORIES: Record<string, { label: string; color: string }> = {
  tractor: { label: "Tractor", color: "amber" },
  aspersora_manual: { label: "Aspersora Manual", color: "blue" },
  aspersora_motorizada: { label: "Aspersora Motorizada", color: "blue" },
  bomba_riego: { label: "Bomba de Riego", color: "cyan" },
  sistema_goteo: { label: "Sistema de Goteo", color: "cyan" },
  motosierra: { label: "Motosierra", color: "red" },
  tijera_poda: { label: "Tijera de Poda", color: "green" },
  machete: { label: "Machete", color: "orange" },
  azadon: { label: "Azadón", color: "stone" },
  rastrillo: { label: "Rastrillo", color: "stone" },
  desbrozadora: { label: "Desbrozadora", color: "lime" },
  fumigadora: { label: "Fumigadora", color: "purple" },
  drone: { label: "Drone", color: "indigo" },
  vehiculo: { label: "Vehículo", color: "gray" },
  medicion: { label: "Medición", color: "teal" },
  proteccion: { label: "Protección", color: "yellow" },
  transporte: { label: "Transporte", color: "slate" },
  otro: { label: "Otro", color: "gray" },
};

const TOOL_STATUS: Record<string, { label: string; color: string }> = {
  disponible: { label: "Disponible", color: "emerald" },
  en_uso: { label: "En Uso", color: "blue" },
  mantenimiento: { label: "Mantenimiento", color: "yellow" },
  "dañado": { label: "Dañado", color: "red" },
  baja: { label: "Baja", color: "gray" },
};

const TOOL_CONDITION: Record<string, { label: string; color: string }> = {
  nuevo: { label: "Nuevo", color: "emerald" },
  bueno: { label: "Bueno", color: "blue" },
  regular: { label: "Regular", color: "yellow" },
  malo: { label: "Malo", color: "red" },
};

const UNITS = ["kg", "g", "lt", "ml", "ton", "bulto", "saco", "unidad", "otro"];

const SUPPLIER_CATEGORIES: Record<string, { label: string; color: string }> = {
  fertilizantes: { label: "Fertilizantes", color: "emerald" },
  agroquimicos: { label: "Agroquímicos", color: "purple" },
  semillas: { label: "Semillas", color: "green" },
  herramientas: { label: "Herramientas", color: "amber" },
  maquinaria: { label: "Maquinaria", color: "orange" },
  riego: { label: "Riego", color: "cyan" },
  empaques: { label: "Empaques", color: "stone" },
  servicios: { label: "Servicios", color: "blue" },
  combustible: { label: "Combustible", color: "red" },
  otro: { label: "Otro", color: "gray" },
};

// ===== COMPONENTE PRINCIPAL =====

export default function Warehouse() {
  return (
    <ProtectedPage permission="canViewWarehouse">
      <WarehouseContent />
    </ProtectedPage>
  );
}

function WarehouseContent() {
  const [activeTab, setActiveTab] = useState<"products" | "tools" | "suppliers">("products");

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 p-4 md:p-6 pb-24">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-2">
              <WarehouseIcon className="w-7 h-7 text-green-600" />
              Almacenes
            </h1>
            <p className="text-sm text-gray-500 mt-1">Gestión de productos, herramientas y equipos</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("products")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              activeTab === "products"
                ? "bg-emerald-100 text-emerald-700 border border-emerald-300 shadow-md"
                : "bg-white/60 text-gray-500 hover:bg-white hover:text-gray-700 border border-gray-200"
            }`}
          >
            <Package className="w-4 h-4" />
            Productos
          </button>
          <button
            onClick={() => setActiveTab("tools")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              activeTab === "tools"
                ? "bg-amber-100 text-amber-700 border border-amber-300 shadow-md"
                : "bg-white/60 text-gray-500 hover:bg-white hover:text-gray-700 border border-gray-200"
            }`}
          >
            <Wrench className="w-4 h-4" />
            Herramientas y Equipos
          </button>
          <button
            onClick={() => setActiveTab("suppliers")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              activeTab === "suppliers"
                ? "bg-blue-100 text-blue-700 border border-blue-300 shadow-md"
                : "bg-white/60 text-gray-500 hover:bg-white hover:text-gray-700 border border-gray-200"
            }`}
          >
            <Users className="w-4 h-4" />
            Proveedores
          </button>
        </div>

        {activeTab === "products" && <ProductsTab />}
        {activeTab === "tools" && <ToolsTab />}
        {activeTab === "suppliers" && <SuppliersTab />}
      </div>
    </div>
  );
}

// ===== PESTAÑA DE PRODUCTOS =====

function ProductsTab() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showLowStock, setShowLowStock] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showMovementForm, setShowMovementForm] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: products = [], isLoading } = trpc.warehouse.listProducts.useQuery();

  const createMut = trpc.warehouse.createProduct.useMutation({
    onSuccess: () => { utils.warehouse.listProducts.invalidate(); setShowForm(false); resetForm(); toast.success("Producto creado"); },
    onError: (e: any) => toast.error(e.message || "Error al crear producto"),
  });
  const updateMut = trpc.warehouse.updateProduct.useMutation({
    onSuccess: () => { utils.warehouse.listProducts.invalidate(); setEditingId(null); setShowForm(false); resetForm(); toast.success("Producto actualizado"); },
    onError: (e: any) => toast.error(e.message || "Error al actualizar"),
  });
  const deleteMut = trpc.warehouse.deleteProduct.useMutation({
    onSuccess: () => { utils.warehouse.listProducts.invalidate(); toast.success("Producto eliminado"); },
    onError: (e: any) => toast.error(e.message || "Error al eliminar"),
  });
  const addMovementMut = trpc.warehouse.addMovement.useMutation({
    onSuccess: () => {
      utils.warehouse.listProducts.invalidate();
      setShowMovementForm(null);
      setMovementForm({ type: "entrada", quantity: "", reason: "" });
      toast.success("Movimiento registrado");
    },
    onError: (e: any) => toast.error(e.message || "Error al registrar movimiento"),
  });

  const [form, setForm] = useState({
    name: "", brand: "", category: "otro", description: "", activeIngredient: "",
    concentration: "", presentation: "", unit: "kg", currentStock: "0", minimumStock: "0",
    costPerUnit: "", supplierId: "", lotNumber: "", expirationDate: "",
    storageLocation: "", photoUrl: "",
  });
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [movementForm, setMovementForm] = useState({
    type: "entrada", quantity: "", reason: "",
  });

  const { data: suppliers = [] } = trpc.warehouse.listSuppliers.useQuery();

  const resetForm = useCallback(() => {
    setForm({
      name: "", brand: "", category: "otro", description: "", activeIngredient: "",
      concentration: "", presentation: "", unit: "kg", currentStock: "0", minimumStock: "0",
      costPerUnit: "", supplierId: "", lotNumber: "", expirationDate: "",
      storageLocation: "", photoUrl: "",
    });
    setPhotoBase64(null);
    setPhotoPreview(null);
  }, []);

  const filtered = useMemo(() => {
    let list = (products as any[]).filter((p: any) => p.isActive !== false);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((p: any) => p.name?.toLowerCase().includes(s) || p.brand?.toLowerCase().includes(s) || p.activeIngredient?.toLowerCase().includes(s));
    }
    if (categoryFilter) list = list.filter((p: any) => p.category === categoryFilter);
    if (showLowStock) list = list.filter((p: any) => Number(p.currentStock) <= Number(p.minimumStock || 0));
    return list;
  }, [products, search, categoryFilter, showLowStock]);

  const stats = useMemo(() => {
    const active = (products as any[]).filter((p: any) => p.isActive !== false);
    const lowStock = active.filter((p: any) => Number(p.currentStock) <= Number(p.minimumStock || 0) && Number(p.minimumStock || 0) > 0);
    const totalValue = active.reduce((sum: number, p: any) => sum + (Number(p.currentStock) * Number(p.costPerUnit || 0)), 0);
    return { total: active.length, lowStock: lowStock.length, totalValue };
  }, [products]);

  const handleSave = () => {
    if (editingId) {
      updateMut.mutate({
        id: editingId,
        name: form.name || undefined, brand: form.brand || undefined, category: form.category || undefined,
        description: form.description || undefined, activeIngredient: form.activeIngredient || undefined,
        unit: form.unit || undefined,
        minimumStock: form.minimumStock ? Number(form.minimumStock) : undefined,
        costPerUnit: form.costPerUnit ? Number(form.costPerUnit) : undefined,
        supplierId: form.supplierId ? Number(form.supplierId) : undefined,
        lotNumber: form.lotNumber || undefined, expirationDate: form.expirationDate || undefined,
        storageLocation: form.storageLocation || undefined,
        photoUrl: form.photoUrl || undefined,
        photoBase64: photoBase64 || undefined,
      });
    } else {
      createMut.mutate({
        name: form.name, category: form.category, unit: form.unit,
        brand: form.brand || undefined, description: form.description || undefined,
        activeIngredient: form.activeIngredient || undefined,
        concentration: form.concentration || undefined, presentation: form.presentation || undefined,
        currentStock: form.currentStock ? Number(form.currentStock) : undefined,
        minimumStock: form.minimumStock ? Number(form.minimumStock) : undefined,
        costPerUnit: form.costPerUnit ? Number(form.costPerUnit) : undefined,
        supplierId: form.supplierId ? Number(form.supplierId) : undefined,
        lotNumber: form.lotNumber || undefined, expirationDate: form.expirationDate || undefined,
        storageLocation: form.storageLocation || undefined,
        photoUrl: form.photoUrl || undefined,
        photoBase64: photoBase64 || undefined,
      });
    }
  };

  const startEdit = (p: any) => {
    setForm({
      name: p.name || "", brand: p.brand || "", category: p.category || "otro",
      description: p.description || "", activeIngredient: p.activeIngredient || "",
      concentration: p.concentration || "", presentation: p.presentation || "",
      unit: p.unit || "kg", currentStock: String(p.currentStock || 0),
      minimumStock: String(p.minimumStock || 0), costPerUnit: String(p.costPerUnit || ""),
      supplierId: String(p.supplierId || ""),
      lotNumber: p.lotNumber || "", expirationDate: toDateStr(p.expirationDate),
      storageLocation: p.storageLocation || "", photoUrl: p.photoUrl || "",
    });
    setPhotoBase64(null);
    setPhotoPreview(p.photoUrl || null);
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleAddMovement = (productId: number) => {
    if (!movementForm.quantity || Number(movementForm.quantity) <= 0) return;
    addMovementMut.mutate({
      productId,
      movementType: movementForm.type,
      quantity: Number(movementForm.quantity),
      reason: movementForm.reason || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
          <p className="text-green-600 text-sm">Cargando productos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <GlassCard hover={true} className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100"><Package className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-xs text-gray-500">Total Productos</p><p className="text-xl font-bold text-gray-800">{stats.total}</p></div>
          </div>
        </GlassCard>
        <GlassCard hover={true} className="p-4 cursor-pointer" onClick={() => setShowLowStock(!showLowStock)}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stats.lowStock > 0 ? "bg-red-100" : "bg-green-100"}`}>
              <AlertTriangle className={`w-5 h-5 ${stats.lowStock > 0 ? "text-red-600" : "text-green-600"}`} />
            </div>
            <div>
              <p className="text-xs text-gray-500">Stock Bajo</p>
              <p className={`text-xl font-bold ${stats.lowStock > 0 ? "text-red-600" : "text-green-600"}`}>{stats.lowStock}</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard hover={true} className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100"><TrendingUp className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-xs text-gray-500">Valor Inventario</p><p className="text-xl font-bold text-gray-800">${stats.totalValue.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p></div>
          </div>
        </GlassCard>
      </div>

      {/* Filters & Add */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto, marca o ingrediente..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-800 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 text-sm focus:outline-none focus:border-emerald-400">
          <option value="">Todas las categorías</option>
          {Object.entries(PRODUCT_CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button onClick={() => { resetForm(); setEditingId(null); setShowForm(!showForm); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all text-sm font-semibold">
          <Plus className="w-4 h-4" /> Nuevo Producto
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">{editingId ? "Editar Producto" : "Nuevo Producto"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Nombre *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Marca</label>
              <input type="text" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Categoría</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 text-sm focus:outline-none focus:border-emerald-400">
                {Object.entries(PRODUCT_CATEGORIES).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
              </select>
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Ingrediente Activo</label>
              <input type="text" value={form.activeIngredient} onChange={(e) => setForm({ ...form, activeIngredient: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Concentración</label>
              <input type="text" value={form.concentration} onChange={(e) => setForm({ ...form, concentration: e.target.value })}
                placeholder="Ej: 46-0-0" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Presentación</label>
              <input type="text" value={form.presentation} onChange={(e) => setForm({ ...form, presentation: e.target.value })}
                placeholder="Ej: Saco 50kg" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Unidad</label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 text-sm focus:outline-none focus:border-emerald-400">
                {UNITS.map((u) => (<option key={u} value={u}>{u}</option>))}
              </select>
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Stock Actual</label>
              <input type="number" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Stock Mínimo</label>
              <input type="number" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Costo por Unidad ($)</label>
              <input type="number" step="0.01" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-gray-600 text-xs mb-1 block font-medium">Proveedor (del cat\u00e1logo)</label>
              <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 text-sm focus:outline-none focus:border-emerald-400">
                <option value="">Sin proveedor asignado</option>
                {(suppliers as any[]).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.companyName}{s.contactName ? ` - ${s.contactName}` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">No. Lote</label>
              <input type="text" value={form.lotNumber} onChange={(e) => setForm({ ...form, lotNumber: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Fecha Caducidad</label>
              <input type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Ubicación Almacén</label>
              <input type="text" value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Foto del Producto</label>
              <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 10 * 1024 * 1024) { toast.error("La imagen no debe superar 10MB"); return; }
                  setPhotoPreview(URL.createObjectURL(file));
                  setPhotoBase64(await fileToBase64(file));
                }} />
              {photoPreview ? (
                <div className="relative">
                  <img src={photoPreview} alt="Preview" className="w-full h-24 object-cover rounded-lg border border-gray-200" />
                  <button type="button" onClick={() => { setPhotoPreview(null); setPhotoBase64(null); setForm({ ...form, photoUrl: "" }); if (photoInputRef.current) photoInputRef.current.value = ""; }}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full shadow hover:bg-red-600"><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => photoInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-lg border-2 border-dashed border-emerald-300 text-emerald-600 hover:bg-emerald-50 transition-all text-sm">
                  <Camera className="w-5 h-5" /> Subir foto
                </button>
              )}
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="text-gray-600 text-xs mb-1 block font-medium">Descripción</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 resize-none" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={!form.name || createMut.isPending || updateMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50">
              <Save className="w-4 h-4" /> {editingId ? "Actualizar" : "Guardar"}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); resetForm(); }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 border border-gray-200 rounded-lg text-sm hover:bg-gray-200 transition-all">
              <X className="w-4 h-4" /> Cancelar
            </button>
          </div>
        </GlassCard>
      )}

      {/* Product List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No se encontraron productos</p>
            <p className="text-gray-400 text-sm mt-1">Agrega tu primer producto con el botón de arriba</p>
          </GlassCard>
        ) : filtered.map((p: any) => {
          const cat = PRODUCT_CATEGORIES[p.category] || PRODUCT_CATEGORIES.otro;
          const stock = Number(p.currentStock || 0);
          const minStock = Number(p.minimumStock || 0);
          const isLow = minStock > 0 && stock <= minStock;
          const isExpanded = expandedId === p.id;

          return (
            <GlassCard key={p.id} hover={true} className="overflow-hidden">
              <div className="p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {p.photoUrl ? (
                      <img src={p.photoUrl} alt={p.name} className="w-12 h-12 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
                        <Package className="w-6 h-6 text-emerald-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-gray-800 font-semibold truncate">{p.name}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-xs bg-${cat.color}-100 text-${cat.color}-700 border border-${cat.color}-200`}>
                          {cat.label}
                        </span>
                        {isLow && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Stock Bajo
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        {p.brand && <span>{p.brand}</span>}
                        {p.activeIngredient && <span>{p.activeIngredient}</span>}
                        {p.presentation && <span>{p.presentation}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <p className={`text-lg font-bold ${isLow ? "text-red-600" : "text-emerald-600"}`}>
                        {stock.toLocaleString("es-MX")} <span className="text-xs font-normal text-gray-500">{p.unit}</span>
                      </p>
                      {minStock > 0 && <p className="text-xs text-gray-400">Mín: {minStock}</p>}
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-200/60 p-4 space-y-4 bg-gray-50/30">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    {p.costPerUnit && <div><span className="text-gray-400">Costo/Unidad:</span> <span className="text-gray-700 font-medium">${Number(p.costPerUnit).toFixed(2)}</span></div>}
                    {p.supplierId && <div><span className="text-gray-400">Proveedor:</span> <span className="text-gray-700">{(suppliers as any[]).find((s: any) => s.id === p.supplierId)?.companyName || p.supplier || "—"}</span></div>}
                    {!p.supplierId && p.supplier && <div><span className="text-gray-400">Proveedor:</span> <span className="text-gray-700">{p.supplier}</span></div>}
                    {p.lotNumber && <div><span className="text-gray-400">Lote:</span> <span className="text-gray-700">{p.lotNumber}</span></div>}
                    {p.expirationDate && <div><span className="text-gray-400">Caducidad:</span> <span className="text-gray-700">{p.expirationDate instanceof Date ? p.expirationDate.toLocaleDateString("es-MX") : p.expirationDate}</span></div>}
                    {p.storageLocation && <div><span className="text-gray-400">Ubicación:</span> <span className="text-gray-700">{p.storageLocation}</span></div>}
                    {p.concentration && <div><span className="text-gray-400">Concentración:</span> <span className="text-gray-700">{p.concentration}</span></div>}
                  </div>
                  {p.description && <p className="text-sm text-gray-500">{p.description}</p>}

                  {showMovementForm === p.id ? (
                    <div className="bg-white rounded-lg p-3 space-y-3 border border-gray-200">
                      <h5 className="text-sm font-semibold text-gray-700">Registrar Movimiento</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <select value={movementForm.type} onChange={(e) => setMovementForm({ ...movementForm, type: e.target.value })}
                          className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 text-sm focus:outline-none focus:border-emerald-400">
                          <option value="entrada">Entrada</option>
                          <option value="salida">Salida</option>
                          <option value="ajuste">Ajuste</option>
                          <option value="devolucion">Devolución</option>
                        </select>
                        <input type="number" step="0.01" value={movementForm.quantity} onChange={(e) => setMovementForm({ ...movementForm, quantity: e.target.value })}
                          placeholder="Cantidad" className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-emerald-400" />
                        <input type="text" value={movementForm.reason} onChange={(e) => setMovementForm({ ...movementForm, reason: e.target.value })}
                          placeholder="Motivo" className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-emerald-400" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleAddMovement(p.id)} disabled={addMovementMut.isPending}
                          className="px-3 py-1.5 bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-medium hover:bg-emerald-200 transition-all disabled:opacity-50">
                          Registrar
                        </button>
                        <button onClick={() => setShowMovementForm(null)}
                          className="px-3 py-1.5 bg-gray-100 text-gray-600 border border-gray-200 rounded-lg text-xs hover:bg-gray-200 transition-all">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {p.movements && p.movements.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-1"><History className="w-4 h-4" /> Últimos Movimientos</h5>
                      <div className="space-y-1">
                        {p.movements.slice(0, 5).map((m: any) => (
                          <div key={m.id} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border border-gray-100">
                            <div className="flex items-center gap-2">
                              {m.movementType === "entrada" || m.movementType === "devolucion" ? (
                                <ArrowDownCircle className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <ArrowUpCircle className="w-4 h-4 text-red-500" />
                              )}
                              <span className="text-gray-700 capitalize">{m.movementType}</span>
                              {m.reason && <span className="text-gray-400">- {m.reason}</span>}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={m.movementType === "entrada" || m.movementType === "devolucion" ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                                {m.movementType === "entrada" || m.movementType === "devolucion" ? "+" : "-"}{Number(m.quantity).toLocaleString("es-MX")}
                              </span>
                              <span className="text-gray-400">{m.createdAt instanceof Date ? m.createdAt.toLocaleDateString("es-MX") : new Date(m.createdAt).toLocaleDateString("es-MX")}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 border-t border-gray-200/60">
                    <button onClick={() => setShowMovementForm(showMovementForm === p.id ? null : p.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-100 transition-all">
                      <RefreshCw className="w-3 h-3" /> Movimiento
                    </button>
                    <button onClick={() => startEdit(p)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium hover:bg-amber-100 transition-all">
                      <Edit2 className="w-3 h-3" /> Editar
                    </button>
                    <button onClick={() => { if (confirm("¿Desactivar este producto?")) deleteMut.mutate({ id: p.id }); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 transition-all">
                      <Trash2 className="w-3 h-3" /> Desactivar
                    </button>
                  </div>
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}

// ===== PESTAÑA DE HERRAMIENTAS =====

function ToolsTab() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: tools = [], isLoading } = trpc.warehouse.listTools.useQuery();

  const createMut = trpc.warehouse.createTool.useMutation({
    onSuccess: () => { utils.warehouse.listTools.invalidate(); setShowForm(false); resetForm(); toast.success("Herramienta creada"); },
    onError: (e: any) => toast.error(e.message || "Error al crear herramienta"),
  });
  const updateMut = trpc.warehouse.updateTool.useMutation({
    onSuccess: () => { utils.warehouse.listTools.invalidate(); setEditingId(null); setShowForm(false); resetForm(); toast.success("Herramienta actualizada"); },
    onError: (e: any) => toast.error(e.message || "Error al actualizar"),
  });
  const deleteMut = trpc.warehouse.deleteTool.useMutation({
    onSuccess: () => { utils.warehouse.listTools.invalidate(); toast.success("Herramienta eliminada"); },
    onError: (e: any) => toast.error(e.message || "Error al eliminar"),
  });

  const [form, setForm] = useState({
    name: "", category: "otro", brand: "", model: "", serialNumber: "",
    description: "", status: "disponible", conditionState: "bueno",
    acquisitionDate: "", acquisitionCost: "", currentValue: "",
    storageLocation: "", lastMaintenanceDate: "",
    nextMaintenanceDate: "", maintenanceNotes: "", photoUrl: "", quantity: "1",
  });

  const resetForm = useCallback(() => {
    setForm({
      name: "", category: "otro", brand: "", model: "", serialNumber: "",
      description: "", status: "disponible", conditionState: "bueno",
      acquisitionDate: "", acquisitionCost: "", currentValue: "",
      storageLocation: "", lastMaintenanceDate: "",
      nextMaintenanceDate: "", maintenanceNotes: "", photoUrl: "", quantity: "1",
    });
  }, []);

  const filtered = useMemo(() => {
    let list = (tools as any[]).filter((t: any) => t.isActive !== false);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((t: any) => t.name?.toLowerCase().includes(s) || t.brand?.toLowerCase().includes(s) || t.serialNumber?.toLowerCase().includes(s));
    }
    if (categoryFilter) list = list.filter((t: any) => t.category === categoryFilter);
    if (statusFilter) list = list.filter((t: any) => t.status === statusFilter);
    return list;
  }, [tools, search, categoryFilter, statusFilter]);

  const stats = useMemo(() => {
    const active = (tools as any[]).filter((t: any) => t.isActive !== false);
    const available = active.filter((t: any) => t.status === "disponible").length;
    const inMaintenance = active.filter((t: any) => t.status === "mantenimiento" || t.status === "dañado").length;
    const totalValue = active.reduce((sum: number, t: any) => sum + Number(t.currentValue || t.acquisitionCost || 0), 0);
    return { total: active.length, available, inMaintenance, totalValue };
  }, [tools]);

  const handleSave = () => {
    const data: any = {
      name: form.name, category: form.category, brand: form.brand || undefined,
      model: form.model || undefined, serialNumber: form.serialNumber || undefined,
      description: form.description || undefined, status: form.status,
      conditionState: form.conditionState, acquisitionDate: form.acquisitionDate || undefined,
      acquisitionCost: form.acquisitionCost ? Number(form.acquisitionCost) : undefined,
      currentValue: form.currentValue ? Number(form.currentValue) : undefined,
      storageLocation: form.storageLocation || undefined,
      lastMaintenanceDate: form.lastMaintenanceDate || undefined,
      nextMaintenanceDate: form.nextMaintenanceDate || undefined,
      maintenanceNotes: form.maintenanceNotes || undefined,
      photoUrl: form.photoUrl || undefined, quantity: Number(form.quantity) || 1,
    };
    if (editingId) {
      updateMut.mutate({ id: editingId, ...data });
    } else {
      createMut.mutate(data);
    }
  };

  const startEdit = (t: any) => {
    setForm({
      name: t.name || "", category: t.category || "otro", brand: t.brand || "",
      model: t.model || "", serialNumber: t.serialNumber || "",
      description: t.description || "", status: t.status || "disponible",
      conditionState: t.conditionState || "bueno", acquisitionDate: toDateStr(t.acquisitionDate),
      acquisitionCost: String(t.acquisitionCost || ""), currentValue: String(t.currentValue || ""),
      storageLocation: t.storageLocation || "",
      lastMaintenanceDate: toDateStr(t.lastMaintenanceDate), nextMaintenanceDate: toDateStr(t.nextMaintenanceDate),
      maintenanceNotes: t.maintenanceNotes || "", photoUrl: t.photoUrl || "",
      quantity: String(t.quantity || 1),
    });
    setEditingId(t.id);
    setShowForm(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600" />
          <p className="text-amber-600 text-sm">Cargando herramientas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <GlassCard hover={true} className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100"><Wrench className="w-5 h-5 text-amber-600" /></div>
            <div><p className="text-xs text-gray-500">Total Equipos</p><p className="text-xl font-bold text-gray-800">{stats.total}</p></div>
          </div>
        </GlassCard>
        <GlassCard hover={true} className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100"><Box className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-xs text-gray-500">Disponibles</p><p className="text-xl font-bold text-emerald-600">{stats.available}</p></div>
          </div>
        </GlassCard>
        <GlassCard hover={true} className="p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stats.inMaintenance > 0 ? "bg-yellow-100" : "bg-green-100"}`}>
              <AlertTriangle className={`w-5 h-5 ${stats.inMaintenance > 0 ? "text-yellow-600" : "text-green-600"}`} />
            </div>
            <div><p className="text-xs text-gray-500">Mantenimiento/Daño</p><p className="text-xl font-bold text-yellow-600">{stats.inMaintenance}</p></div>
          </div>
        </GlassCard>
        <GlassCard hover={true} className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100"><TrendingUp className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-xs text-gray-500">Valor Total</p><p className="text-xl font-bold text-gray-800">${stats.totalValue.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p></div>
          </div>
        </GlassCard>
      </div>

      {/* Filters & Add */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar herramienta, marca o serie..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-800 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 text-sm focus:outline-none focus:border-amber-400">
          <option value="">Todas las categorías</option>
          {Object.entries(TOOL_CATEGORIES).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 text-sm focus:outline-none focus:border-amber-400">
          <option value="">Todos los estados</option>
          {Object.entries(TOOL_STATUS).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
        </select>
        <button onClick={() => { resetForm(); setEditingId(null); setShowForm(!showForm); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl shadow-lg hover:shadow-xl transition-all text-sm font-semibold">
          <Plus className="w-4 h-4" /> Nueva Herramienta
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">{editingId ? "Editar Herramienta" : "Nueva Herramienta"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Nombre *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Categoría</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 text-sm focus:outline-none focus:border-amber-400">
                {Object.entries(TOOL_CATEGORIES).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
              </select>
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Marca</label>
              <input type="text" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Modelo</label>
              <input type="text" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">No. Serie</label>
              <input type="text" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Cantidad</label>
              <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Estado</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 text-sm focus:outline-none focus:border-amber-400">
                {Object.entries(TOOL_STATUS).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
              </select>
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Condición</label>
              <select value={form.conditionState} onChange={(e) => setForm({ ...form, conditionState: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 text-sm focus:outline-none focus:border-amber-400">
                {Object.entries(TOOL_CONDITION).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
              </select>
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Fecha Adquisición</label>
              <input type="date" value={form.acquisitionDate} onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Costo Adquisición ($)</label>
              <input type="number" step="0.01" value={form.acquisitionCost} onChange={(e) => setForm({ ...form, acquisitionCost: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Valor Actual ($)</label>
              <input type="number" step="0.01" value={form.currentValue} onChange={(e) => setForm({ ...form, currentValue: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Ubicación</label>
              <input type="text" value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Último Mantenimiento</label>
              <input type="date" value={form.lastMaintenanceDate} onChange={(e) => setForm({ ...form, lastMaintenanceDate: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">Próximo Mantenimiento</label>
              <input type="date" value={form.nextMaintenanceDate} onChange={(e) => setForm({ ...form, nextMaintenanceDate: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </div>
            <div>
              <label className="text-gray-600 text-xs mb-1 block font-medium">URL Foto</label>
              <input type="text" value={form.photoUrl} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })}
                placeholder="https://..." className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="text-gray-600 text-xs mb-1 block font-medium">Descripción</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-none" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="text-gray-600 text-xs mb-1 block font-medium">Notas de Mantenimiento</label>
              <textarea value={form.maintenanceNotes} onChange={(e) => setForm({ ...form, maintenanceNotes: e.target.value })} rows={2}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-none" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={!form.name || createMut.isPending || updateMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50">
              <Save className="w-4 h-4" /> {editingId ? "Actualizar" : "Guardar"}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); resetForm(); }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 border border-gray-200 rounded-lg text-sm hover:bg-gray-200 transition-all">
              <X className="w-4 h-4" /> Cancelar
            </button>
          </div>
        </GlassCard>
      )}

      {/* Tool List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No se encontraron herramientas</p>
            <p className="text-gray-400 text-sm mt-1">Agrega tu primera herramienta con el botón de arriba</p>
          </GlassCard>
        ) : filtered.map((t: any) => {
          const cat = TOOL_CATEGORIES[t.category] || TOOL_CATEGORIES.otro;
          const st = TOOL_STATUS[t.status] || TOOL_STATUS.disponible;
          const cond = TOOL_CONDITION[t.conditionState] || TOOL_CONDITION.bueno;
          const isExpanded = expandedId === t.id;

          return (
            <GlassCard key={t.id} hover={true} className="overflow-hidden">
              <div className="p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : t.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {t.photoUrl ? (
                      <img src={t.photoUrl} alt={t.name} className="w-12 h-12 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                        <Wrench className="w-6 h-6 text-amber-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-gray-800 font-semibold truncate">{t.name}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-xs bg-${cat.color}-100 text-${cat.color}-700 border border-${cat.color}-200`}>
                          {cat.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs bg-${st.color}-100 text-${st.color}-700 border border-${st.color}-200`}>
                          {st.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs bg-${cond.color}-100 text-${cond.color}-700 border border-${cond.color}-200`}>
                          {cond.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        {t.brand && <span>{t.brand}</span>}
                        {t.model && <span>{t.model}</span>}
                        {t.serialNumber && <span>S/N: {t.serialNumber}</span>}
                        {t.quantity > 1 && <span className="text-amber-600 font-medium">x{t.quantity}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {t.assignedTo && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">{t.assignedTo}</span>
                    )}
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-200/60 p-4 space-y-4 bg-gray-50/30">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    {t.acquisitionDate && <div><span className="text-gray-400">Adquisición:</span> <span className="text-gray-700">{t.acquisitionDate instanceof Date ? t.acquisitionDate.toLocaleDateString("es-MX") : t.acquisitionDate}</span></div>}
                    {t.acquisitionCost && <div><span className="text-gray-400">Costo:</span> <span className="text-gray-700 font-medium">${Number(t.acquisitionCost).toLocaleString("es-MX")}</span></div>}
                    {t.currentValue && <div><span className="text-gray-400">Valor Actual:</span> <span className="text-gray-700 font-medium">${Number(t.currentValue).toLocaleString("es-MX")}</span></div>}
                    {t.storageLocation && <div><span className="text-gray-400">Ubicación:</span> <span className="text-gray-700">{t.storageLocation}</span></div>}
                    {t.lastMaintenanceDate && <div><span className="text-gray-400">Último Mtto:</span> <span className="text-gray-700">{t.lastMaintenanceDate instanceof Date ? t.lastMaintenanceDate.toLocaleDateString("es-MX") : t.lastMaintenanceDate}</span></div>}
                    {t.nextMaintenanceDate && <div><span className="text-gray-400">Próximo Mtto:</span> <span className="text-gray-700">{t.nextMaintenanceDate instanceof Date ? t.nextMaintenanceDate.toLocaleDateString("es-MX") : t.nextMaintenanceDate}</span></div>}
                  </div>
                  {t.description && <p className="text-sm text-gray-500">{t.description}</p>}
                  {t.maintenanceNotes && <p className="text-sm text-gray-500 italic">Notas: {t.maintenanceNotes}</p>}

                  <div className="flex gap-2 pt-2 border-t border-gray-200/60">
                    <button onClick={() => startEdit(t)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium hover:bg-amber-100 transition-all">
                      <Edit2 className="w-3 h-3" /> Editar
                    </button>
                    <button onClick={() => { if (confirm("¿Desactivar esta herramienta?")) deleteMut.mutate({ id: t.id }); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 transition-all">
                      <Trash2 className="w-3 h-3" /> Desactivar
                    </button>
                  </div>
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}

// ===== PESTAÑA DE PROVEEDORES =====

function SuppliersTab() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: suppliers = [], isLoading } = trpc.warehouse.listSuppliers.useQuery();

  const createMut = trpc.warehouse.createSupplier.useMutation({
    onSuccess: () => { utils.warehouse.listSuppliers.invalidate(); setShowForm(false); resetForm(); toast.success("Proveedor creado"); },
    onError: (e: any) => toast.error(e.message || "Error al crear proveedor"),
  });
  const updateMut = trpc.warehouse.updateSupplier.useMutation({
    onSuccess: () => { utils.warehouse.listSuppliers.invalidate(); setEditingId(null); setShowForm(false); resetForm(); toast.success("Proveedor actualizado"); },
    onError: (e: any) => toast.error(e.message || "Error al actualizar"),
  });
  const deleteMut = trpc.warehouse.deleteSupplier.useMutation({
    onSuccess: () => { utils.warehouse.listSuppliers.invalidate(); toast.success("Proveedor eliminado"); },
    onError: (e: any) => toast.error(e.message || "Error al eliminar"),
  });

  const [form, setForm] = useState({
    companyName: "", contactName: "", phone: "", phone2: "",
    email: "", website: "", rfc: "", address: "",
    city: "", state: "", postalCode: "", category: "otro",
    productsOffered: "", paymentTerms: "", bankAccount: "",
    notes: "", rating: "",
  });

  const resetForm = useCallback(() => {
    setForm({
      companyName: "", contactName: "", phone: "", phone2: "",
      email: "", website: "", rfc: "", address: "",
      city: "", state: "", postalCode: "", category: "otro",
      productsOffered: "", paymentTerms: "", bankAccount: "",
      notes: "", rating: "",
    });
  }, []);

  const filtered = useMemo(() => {
    let list = (suppliers as any[]);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((sup: any) =>
        sup.companyName?.toLowerCase().includes(s) ||
        sup.contactName?.toLowerCase().includes(s) ||
        sup.email?.toLowerCase().includes(s) ||
        sup.productsOffered?.toLowerCase().includes(s)
      );
    }
    if (categoryFilter) list = list.filter((sup: any) => sup.category === categoryFilter);
    return list;
  }, [suppliers, search, categoryFilter]);

  const handleSave = () => {
    const data: any = {
      companyName: form.companyName,
      contactName: form.contactName || undefined,
      phone: form.phone || undefined, phone2: form.phone2 || undefined,
      email: form.email || undefined, website: form.website || undefined,
      rfc: form.rfc || undefined, address: form.address || undefined,
      city: form.city || undefined, state: form.state || undefined,
      postalCode: form.postalCode || undefined, category: form.category || undefined,
      productsOffered: form.productsOffered || undefined,
      paymentTerms: form.paymentTerms || undefined,
      bankAccount: form.bankAccount || undefined,
      notes: form.notes || undefined,
      rating: form.rating ? Number(form.rating) : undefined,
    };
    if (editingId) {
      updateMut.mutate({ id: editingId, ...data });
    } else {
      createMut.mutate(data);
    }
  };

  const startEdit = (s: any) => {
    setForm({
      companyName: s.companyName || "", contactName: s.contactName || "",
      phone: s.phone || "", phone2: s.phone2 || "",
      email: s.email || "", website: s.website || "",
      rfc: s.rfc || "", address: s.address || "",
      city: s.city || "", state: s.state || "",
      postalCode: s.postalCode || "", category: s.category || "otro",
      productsOffered: s.productsOffered || "",
      paymentTerms: s.paymentTerms || "", bankAccount: s.bankAccount || "",
      notes: s.notes || "", rating: String(s.rating || ""),
    });
    setEditingId(s.id);
    setShowForm(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado al portapapeles");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-blue-600 text-sm">Cargando proveedores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <GlassCard hover={true} className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100"><Building2 className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-xs text-gray-500">Total Proveedores</p><p className="text-xl font-bold text-gray-800">{(suppliers as any[]).length}</p></div>
          </div>
        </GlassCard>
        <GlassCard hover={true} className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100"><Package className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-xs text-gray-500">Categorías Activas</p><p className="text-xl font-bold text-gray-800">{new Set((suppliers as any[]).map((s: any) => s.category)).size}</p></div>
          </div>
        </GlassCard>
        <GlassCard hover={true} className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100"><Star className="w-5 h-5 text-amber-600" /></div>
            <div><p className="text-xs text-gray-500">Mejor Calificados</p><p className="text-xl font-bold text-gray-800">{(suppliers as any[]).filter((s: any) => s.rating && s.rating >= 4).length}</p></div>
          </div>
        </GlassCard>
      </div>

      {/* Filters & Add */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar proveedor, contacto, email..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 text-sm focus:outline-none focus:border-blue-400">
          <option value="">Todas las categorías</option>
          {Object.entries(SUPPLIER_CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button onClick={() => { resetForm(); setEditingId(null); setShowForm(!showForm); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all text-sm font-semibold">
          <Plus className="w-4 h-4" /> Nuevo Proveedor
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            {editingId ? "Editar Proveedor" : "Nuevo Proveedor"}
          </h3>

          {/* Sección: Datos de la Empresa */}
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-1 border-b border-gray-200 pb-2">
              <Building2 className="w-4 h-4" /> Datos de la Empresa
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-gray-600 text-xs mb-1 block font-medium">Nombre de Empresa *</label>
                <input type="text" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  placeholder="Ej: Agroquímicos del Norte S.A."
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-gray-600 text-xs mb-1 block font-medium">RFC</label>
                <input type="text" value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
                  placeholder="Ej: AGN1234567A1" maxLength={13}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 uppercase" />
              </div>
              <div>
                <label className="text-gray-600 text-xs mb-1 block font-medium">Categoría</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 text-sm focus:outline-none focus:border-blue-400">
                  {Object.entries(SUPPLIER_CATEGORIES).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
                </select>
              </div>
              <div>
                <label className="text-gray-600 text-xs mb-1 block font-medium">Sitio Web</label>
                <input type="text" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder="https://www.ejemplo.com"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-gray-600 text-xs mb-1 block font-medium">Calificación (1-5)</label>
                <select value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 text-sm focus:outline-none focus:border-blue-400">
                  <option value="">Sin calificar</option>
                  <option value="1">1 - Malo</option>
                  <option value="2">2 - Regular</option>
                  <option value="3">3 - Bueno</option>
                  <option value="4">4 - Muy Bueno</option>
                  <option value="5">5 - Excelente</option>
                </select>
              </div>
            </div>
          </div>

          {/* Sección: Contacto */}
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-1 border-b border-gray-200 pb-2">
              <Phone className="w-4 h-4" /> Información de Contacto
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-gray-600 text-xs mb-1 block font-medium">Nombre de Contacto</label>
                <input type="text" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  placeholder="Ej: Juan Pérez"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-gray-600 text-xs mb-1 block font-medium">Teléfono Principal</label>
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Ej: 614-123-4567"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-gray-600 text-xs mb-1 block font-medium">Teléfono Secundario</label>
                <input type="tel" value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })}
                  placeholder="Ej: 614-765-4321"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-gray-600 text-xs mb-1 block font-medium">Correo Electrónico</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="ventas@ejemplo.com"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
          </div>

          {/* Sección: Dirección */}
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-1 border-b border-gray-200 pb-2">
              <MapPin className="w-4 h-4" /> Dirección
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <label className="text-gray-600 text-xs mb-1 block font-medium">Dirección</label>
                <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Calle, número, colonia"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-gray-600 text-xs mb-1 block font-medium">Ciudad</label>
                <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-gray-600 text-xs mb-1 block font-medium">Estado</label>
                <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-gray-600 text-xs mb-1 block font-medium">C.P.</label>
                <input type="text" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                  maxLength={5} placeholder="31000"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
          </div>

          {/* Sección: Comercial */}
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-1 border-b border-gray-200 pb-2">
              <TrendingUp className="w-4 h-4" /> Información Comercial
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="text-gray-600 text-xs mb-1 block font-medium">Productos que Maneja</label>
                <textarea value={form.productsOffered} onChange={(e) => setForm({ ...form, productsOffered: e.target.value })} rows={2}
                  placeholder="Ej: Fertilizantes granulados, herbicidas, insecticidas..."
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none" />
              </div>
              <div>
                <label className="text-gray-600 text-xs mb-1 block font-medium">Condiciones de Pago</label>
                <input type="text" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
                  placeholder="Ej: 30 días crédito, contado"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-gray-600 text-xs mb-1 block font-medium">Cuenta Bancaria / CLABE</label>
                <input type="text" value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
                  placeholder="CLABE interbancaria"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="text-gray-600 text-xs mb-1 block font-medium">Notas</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  placeholder="Observaciones, horarios de atención, etc."
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none" />
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={!form.companyName || createMut.isPending || updateMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50">
              <Save className="w-4 h-4" /> {editingId ? "Actualizar" : "Guardar"}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); resetForm(); }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 border border-gray-200 rounded-lg text-sm hover:bg-gray-200 transition-all">
              <X className="w-4 h-4" /> Cancelar
            </button>
          </div>
        </GlassCard>
      )}

      {/* Supplier List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No se encontraron proveedores</p>
            <p className="text-gray-400 text-sm mt-1">Agrega tu primer proveedor con el botón de arriba</p>
          </GlassCard>
        ) : filtered.map((s: any) => {
          const cat = SUPPLIER_CATEGORIES[s.category] || SUPPLIER_CATEGORIES.otro;
          const isExpanded = expandedId === s.id;

          return (
            <GlassCard key={s.id} hover={true} className="overflow-hidden">
              <div className="p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : s.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-6 h-6 text-blue-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-gray-800 font-semibold truncate">{s.companyName}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-xs bg-${cat.color}-100 text-${cat.color}-700 border border-${cat.color}-200`}>
                          {cat.label}
                        </span>
                        {s.rating && (
                          <span className="flex items-center gap-0.5 text-xs text-amber-600">
                            {[...Array(s.rating)].map((_, i) => (
                              <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
                            ))}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 flex-wrap">
                        {s.contactName && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{s.contactName}</span>}
                        {s.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>}
                        {s.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{s.email}</span>}
                        {s.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{s.city}{s.state ? `, ${s.state}` : ""}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-200/60 p-4 space-y-4 bg-gray-50/30">
                  {/* Datos de contacto con botones de copiar */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {s.phone && (
                      <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="w-4 h-4 text-blue-500" />
                          <div>
                            <p className="text-gray-400 text-xs">Teléfono</p>
                            <p className="text-gray-700 font-medium">{s.phone}</p>
                          </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); copyToClipboard(s.phone); }}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-all" title="Copiar">
                          <Copy className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                      </div>
                    )}
                    {s.phone2 && (
                      <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="w-4 h-4 text-blue-500" />
                          <div>
                            <p className="text-gray-400 text-xs">Tel. Secundario</p>
                            <p className="text-gray-700 font-medium">{s.phone2}</p>
                          </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); copyToClipboard(s.phone2); }}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-all" title="Copiar">
                          <Copy className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                      </div>
                    )}
                    {s.email && (
                      <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-4 h-4 text-emerald-500" />
                          <div>
                            <p className="text-gray-400 text-xs">Correo</p>
                            <p className="text-gray-700 font-medium truncate">{s.email}</p>
                          </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); copyToClipboard(s.email); }}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-all" title="Copiar">
                          <Copy className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                      </div>
                    )}
                    {s.website && (
                      <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                        <div className="flex items-center gap-2 text-sm">
                          <Globe className="w-4 h-4 text-purple-500" />
                          <div>
                            <p className="text-gray-400 text-xs">Sitio Web</p>
                            <a href={s.website.startsWith("http") ? s.website : `https://${s.website}`} target="_blank" rel="noopener noreferrer"
                              className="text-blue-600 hover:underline font-medium truncate block" onClick={(e) => e.stopPropagation()}>
                              {s.website}
                            </a>
                          </div>
                        </div>
                        <a href={s.website.startsWith("http") ? s.website : `https://${s.website}`} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-all" onClick={(e) => e.stopPropagation()}>
                          <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                        </a>
                      </div>
                    )}
                    {s.rfc && (
                      <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                        <div className="flex items-center gap-2 text-sm">
                          <Building2 className="w-4 h-4 text-gray-500" />
                          <div>
                            <p className="text-gray-400 text-xs">RFC</p>
                            <p className="text-gray-700 font-medium">{s.rfc}</p>
                          </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); copyToClipboard(s.rfc); }}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-all" title="Copiar">
                          <Copy className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                      </div>
                    )}
                    {s.bankAccount && (
                      <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                        <div className="flex items-center gap-2 text-sm">
                          <TrendingUp className="w-4 h-4 text-green-500" />
                          <div>
                            <p className="text-gray-400 text-xs">Cuenta Bancaria</p>
                            <p className="text-gray-700 font-medium">{s.bankAccount}</p>
                          </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); copyToClipboard(s.bankAccount); }}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-all" title="Copiar">
                          <Copy className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Dirección completa */}
                  {(s.address || s.city) && (
                    <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-gray-400 text-xs">Dirección</p>
                          <p className="text-gray-700">
                            {[s.address, s.city, s.state, s.postalCode ? `C.P. ${s.postalCode}` : ""].filter(Boolean).join(", ")}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Info comercial */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {s.productsOffered && (
                      <div className="bg-white rounded-lg px-3 py-2 border border-gray-100 sm:col-span-2">
                        <p className="text-gray-400 text-xs mb-1">Productos que Maneja</p>
                        <p className="text-gray-700">{s.productsOffered}</p>
                      </div>
                    )}
                    {s.paymentTerms && (
                      <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                        <p className="text-gray-400 text-xs mb-1">Condiciones de Pago</p>
                        <p className="text-gray-700">{s.paymentTerms}</p>
                      </div>
                    )}
                    {s.notes && (
                      <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                        <p className="text-gray-400 text-xs mb-1">Notas</p>
                        <p className="text-gray-700 italic">{s.notes}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-gray-200/60">
                    {s.phone && (
                      <a href={`tel:${s.phone}`}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-all"
                        onClick={(e) => e.stopPropagation()}>
                        <Phone className="w-3 h-3" /> Llamar
                      </a>
                    )}
                    {s.email && (
                      <a href={`mailto:${s.email}`}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-100 transition-all"
                        onClick={(e) => e.stopPropagation()}>
                        <Mail className="w-3 h-3" /> Email
                      </a>
                    )}
                    {s.phone && (
                      <a href={`https://wa.me/${s.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-all"
                        onClick={(e) => e.stopPropagation()}>
                        <ExternalLink className="w-3 h-3" /> WhatsApp
                      </a>
                    )}
                    <button onClick={() => startEdit(s)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium hover:bg-amber-100 transition-all">
                      <Edit2 className="w-3 h-3" /> Editar
                    </button>
                    <button onClick={() => { if (confirm("¿Eliminar este proveedor? Los productos vinculados quedarán sin proveedor.")) deleteMut.mutate({ id: s.id }); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 transition-all">
                      <Trash2 className="w-3 h-3" /> Eliminar
                    </button>
                  </div>
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
