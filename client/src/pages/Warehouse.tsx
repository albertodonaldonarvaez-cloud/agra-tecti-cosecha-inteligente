import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../_core/trpc";
import { GlassCard } from "../components/GlassCard";
import {
  Package, Wrench, Plus, Search, Filter, Edit2, Trash2, X, Save,
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, Camera, ChevronDown, ChevronUp,
  Box, Droplets, Bug, Leaf, FlaskConical, Warehouse as WarehouseIcon,
  TrendingDown, TrendingUp, History, ImageIcon, RefreshCw
} from "lucide-react";

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

// ===== COMPONENTE PRINCIPAL =====

export default function Warehouse() {
  const [activeTab, setActiveTab] = useState<"products" | "tools">("products");

  const tabs = [
    { id: "products" as const, label: "Productos", icon: Package, color: "emerald" },
    { id: "tools" as const, label: "Herramientas y Equipos", icon: Wrench, color: "amber" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <WarehouseIcon className="w-7 h-7 text-indigo-400" />
            Almacenes
          </h1>
          <p className="text-white/60 text-sm mt-1">Gestión de productos, herramientas y equipos</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              activeTab === tab.id
                ? `bg-${tab.color}-500/20 text-${tab.color}-300 border border-${tab.color}-500/30 shadow-lg shadow-${tab.color}-500/10`
                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 border border-white/10"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "products" && <ProductsTab />}
      {activeTab === "tools" && <ToolsTab />}
    </div>
  );
}

// ===== PESTAÑA DE PRODUCTOS =====

function ProductsTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showLowStock, setShowLowStock] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showMovementForm, setShowMovementForm] = useState<number | null>(null);

  const { data: products = [], isLoading } = useQuery(trpc.warehouse.products.list.queryOptions());

  const createMut = useMutation(trpc.warehouse.products.create.mutationOptions({
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: trpc.warehouse.products.list.queryKey() }); setShowForm(false); resetForm(); },
  }));
  const updateMut = useMutation(trpc.warehouse.products.update.mutationOptions({
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: trpc.warehouse.products.list.queryKey() }); setEditingId(null); resetForm(); },
  }));
  const deleteMut = useMutation(trpc.warehouse.products.delete.mutationOptions({
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: trpc.warehouse.products.list.queryKey() }); },
  }));
  const addMovementMut = useMutation(trpc.warehouse.products.addMovement.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.products.list.queryKey() });
      setShowMovementForm(null);
      setMovementForm({ type: "entrada", quantity: "", reason: "", invoiceNumber: "", supplier: "", costPerUnit: "" });
    },
  }));

  // Form state
  const [form, setForm] = useState({
    name: "", brand: "", category: "otro", description: "", activeIngredient: "",
    concentration: "", presentation: "", unit: "kg", currentStock: "0", minimumStock: "0",
    costPerUnit: "", supplier: "", supplierContact: "", lotNumber: "", expirationDate: "",
    storageLocation: "", photoUrl: "",
  });

  const [movementForm, setMovementForm] = useState({
    type: "entrada", quantity: "", reason: "", invoiceNumber: "", supplier: "", costPerUnit: "",
  });

  const resetForm = useCallback(() => {
    setForm({
      name: "", brand: "", category: "otro", description: "", activeIngredient: "",
      concentration: "", presentation: "", unit: "kg", currentStock: "0", minimumStock: "0",
      costPerUnit: "", supplier: "", supplierContact: "", lotNumber: "", expirationDate: "",
      storageLocation: "", photoUrl: "",
    });
  }, []);

  const filtered = useMemo(() => {
    let list = products.filter((p: any) => p.isActive !== false);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((p: any) => p.name?.toLowerCase().includes(s) || p.brand?.toLowerCase().includes(s) || p.activeIngredient?.toLowerCase().includes(s));
    }
    if (categoryFilter) list = list.filter((p: any) => p.category === categoryFilter);
    if (showLowStock) list = list.filter((p: any) => Number(p.currentStock) <= Number(p.minimumStock || 0));
    return list;
  }, [products, search, categoryFilter, showLowStock]);

  const stats = useMemo(() => {
    const active = products.filter((p: any) => p.isActive !== false);
    const lowStock = active.filter((p: any) => Number(p.currentStock) <= Number(p.minimumStock || 0) && Number(p.minimumStock || 0) > 0);
    const totalValue = active.reduce((sum: number, p: any) => sum + (Number(p.currentStock) * Number(p.costPerUnit || 0)), 0);
    return { total: active.length, lowStock: lowStock.length, totalValue };
  }, [products]);

  const handleSave = () => {
    const data = {
      name: form.name, brand: form.brand || undefined, category: form.category,
      description: form.description || undefined, activeIngredient: form.activeIngredient || undefined,
      concentration: form.concentration || undefined, presentation: form.presentation || undefined,
      unit: form.unit, currentStock: form.currentStock, minimumStock: form.minimumStock || undefined,
      costPerUnit: form.costPerUnit || undefined, supplier: form.supplier || undefined,
      supplierContact: form.supplierContact || undefined, lotNumber: form.lotNumber || undefined,
      expirationDate: form.expirationDate || undefined, storageLocation: form.storageLocation || undefined,
      photoUrl: form.photoUrl || undefined,
    };
    if (editingId) {
      updateMut.mutate({ id: editingId, ...data });
    } else {
      createMut.mutate(data);
    }
  };

  const startEdit = (p: any) => {
    setForm({
      name: p.name || "", brand: p.brand || "", category: p.category || "otro",
      description: p.description || "", activeIngredient: p.activeIngredient || "",
      concentration: p.concentration || "", presentation: p.presentation || "",
      unit: p.unit || "kg", currentStock: String(p.currentStock || 0),
      minimumStock: String(p.minimumStock || 0), costPerUnit: String(p.costPerUnit || ""),
      supplier: p.supplier || "", supplierContact: p.supplierContact || "",
      lotNumber: p.lotNumber || "", expirationDate: p.expirationDate || "",
      storageLocation: p.storageLocation || "", photoUrl: p.photoUrl || "",
    });
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleAddMovement = (productId: number) => {
    if (!movementForm.quantity || Number(movementForm.quantity) <= 0) return;
    addMovementMut.mutate({
      productId,
      movementType: movementForm.type,
      quantity: movementForm.quantity,
      reason: movementForm.reason || undefined,
      invoiceNumber: movementForm.invoiceNumber || undefined,
      supplier: movementForm.supplier || undefined,
      costPerUnit: movementForm.costPerUnit || undefined,
    });
  };

  if (isLoading) return <div className="text-white/60 text-center py-12">Cargando productos...</div>;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <GlassCard hover={true} className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20"><Package className="w-5 h-5 text-emerald-400" /></div>
            <div><p className="text-white/50 text-xs">Total Productos</p><p className="text-xl font-bold text-white">{stats.total}</p></div>
          </div>
        </GlassCard>
        <GlassCard hover={true} className="p-4 cursor-pointer" onClick={() => setShowLowStock(!showLowStock)}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stats.lowStock > 0 ? "bg-red-500/20" : "bg-green-500/20"}`}>
              <AlertTriangle className={`w-5 h-5 ${stats.lowStock > 0 ? "text-red-400" : "text-green-400"}`} />
            </div>
            <div>
              <p className="text-white/50 text-xs">Stock Bajo</p>
              <p className={`text-xl font-bold ${stats.lowStock > 0 ? "text-red-400" : "text-green-400"}`}>{stats.lowStock}</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard hover={true} className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20"><TrendingUp className="w-5 h-5 text-blue-400" /></div>
            <div><p className="text-white/50 text-xs">Valor Inventario</p><p className="text-xl font-bold text-white">${stats.totalValue.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p></div>
          </div>
        </GlassCard>
      </div>

      {/* Filters & Add */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto, marca o ingrediente..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500/50" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none">
          <option value="">Todas las categorías</option>
          {Object.entries(PRODUCT_CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button onClick={() => { resetForm(); setEditingId(null); setShowForm(!showForm); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-sm font-medium hover:bg-emerald-500/30 transition-all">
          <Plus className="w-4 h-4" /> Nuevo Producto
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-white mb-4">{editingId ? "Editar Producto" : "Nuevo Producto"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-white/60 text-xs mb-1 block">Nombre *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Marca</label>
              <input type="text" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Categoría</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none">
                {Object.entries(PRODUCT_CATEGORIES).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
              </select>
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Ingrediente Activo</label>
              <input type="text" value={form.activeIngredient} onChange={(e) => setForm({ ...form, activeIngredient: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Concentración</label>
              <input type="text" value={form.concentration} onChange={(e) => setForm({ ...form, concentration: e.target.value })}
                placeholder="Ej: 46-0-0" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Presentación</label>
              <input type="text" value={form.presentation} onChange={(e) => setForm({ ...form, presentation: e.target.value })}
                placeholder="Ej: Saco 50kg" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Unidad</label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none">
                {UNITS.map((u) => (<option key={u} value={u}>{u}</option>))}
              </select>
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Stock Actual</label>
              <input type="number" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Stock Mínimo</label>
              <input type="number" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Costo por Unidad ($)</label>
              <input type="number" step="0.01" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Proveedor</label>
              <input type="text" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Contacto Proveedor</label>
              <input type="text" value={form.supplierContact} onChange={(e) => setForm({ ...form, supplierContact: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">No. Lote</label>
              <input type="text" value={form.lotNumber} onChange={(e) => setForm({ ...form, lotNumber: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Fecha Caducidad</label>
              <input type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Ubicación Almacén</label>
              <input type="text" value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">URL Foto</label>
              <input type="text" value={form.photoUrl} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })}
                placeholder="https://..." className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="text-white/60 text-xs mb-1 block">Descripción</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50 resize-none" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={!form.name || createMut.isPending || updateMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-all disabled:opacity-50">
              <Save className="w-4 h-4" /> {editingId ? "Actualizar" : "Guardar"}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); resetForm(); }}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 text-white/60 border border-white/10 rounded-lg text-sm hover:bg-white/10 transition-all">
              <X className="w-4 h-4" /> Cancelar
            </button>
          </div>
        </GlassCard>
      )}

      {/* Product List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <GlassCard className="p-8 text-center"><p className="text-white/40">No se encontraron productos</p></GlassCard>
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
                      <img src={p.photoUrl} alt={p.name} className="w-12 h-12 rounded-lg object-cover border border-white/10 flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                        <Package className="w-6 h-6 text-white/30" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-white font-medium truncate">{p.name}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-xs bg-${cat.color}-500/20 text-${cat.color}-300 border border-${cat.color}-500/20`}>
                          {cat.label}
                        </span>
                        {isLow && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-300 border border-red-500/20 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Stock Bajo
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-white/50">
                        {p.brand && <span>{p.brand}</span>}
                        {p.activeIngredient && <span>{p.activeIngredient}</span>}
                        {p.presentation && <span>{p.presentation}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <p className={`text-lg font-bold ${isLow ? "text-red-400" : "text-emerald-400"}`}>
                        {stock.toLocaleString("es-MX")} <span className="text-xs font-normal text-white/50">{p.unit}</span>
                      </p>
                      {minStock > 0 && <p className="text-xs text-white/40">Mín: {minStock}</p>}
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-white/40" /> : <ChevronDown className="w-5 h-5 text-white/40" />}
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="border-t border-white/10 p-4 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    {p.costPerUnit && <div><span className="text-white/40">Costo/Unidad:</span> <span className="text-white">${Number(p.costPerUnit).toFixed(2)}</span></div>}
                    {p.supplier && <div><span className="text-white/40">Proveedor:</span> <span className="text-white">{p.supplier}</span></div>}
                    {p.lotNumber && <div><span className="text-white/40">Lote:</span> <span className="text-white">{p.lotNumber}</span></div>}
                    {p.expirationDate && <div><span className="text-white/40">Caducidad:</span> <span className="text-white">{p.expirationDate}</span></div>}
                    {p.storageLocation && <div><span className="text-white/40">Ubicación:</span> <span className="text-white">{p.storageLocation}</span></div>}
                    {p.concentration && <div><span className="text-white/40">Concentración:</span> <span className="text-white">{p.concentration}</span></div>}
                  </div>
                  {p.description && <p className="text-sm text-white/60">{p.description}</p>}

                  {/* Movement Form */}
                  {showMovementForm === p.id ? (
                    <div className="bg-white/5 rounded-lg p-3 space-y-3">
                      <h5 className="text-sm font-medium text-white">Registrar Movimiento</h5>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <select value={movementForm.type} onChange={(e) => setMovementForm({ ...movementForm, type: e.target.value })}
                          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none">
                          <option value="entrada">Entrada</option>
                          <option value="salida">Salida</option>
                          <option value="ajuste">Ajuste</option>
                          <option value="devolucion">Devolución</option>
                        </select>
                        <input type="number" step="0.01" value={movementForm.quantity} onChange={(e) => setMovementForm({ ...movementForm, quantity: e.target.value })}
                          placeholder="Cantidad" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none" />
                        <input type="text" value={movementForm.reason} onChange={(e) => setMovementForm({ ...movementForm, reason: e.target.value })}
                          placeholder="Motivo" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none" />
                        <input type="text" value={movementForm.invoiceNumber} onChange={(e) => setMovementForm({ ...movementForm, invoiceNumber: e.target.value })}
                          placeholder="No. Factura" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none" />
                        <input type="text" value={movementForm.supplier} onChange={(e) => setMovementForm({ ...movementForm, supplier: e.target.value })}
                          placeholder="Proveedor" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none" />
                        <input type="number" step="0.01" value={movementForm.costPerUnit} onChange={(e) => setMovementForm({ ...movementForm, costPerUnit: e.target.value })}
                          placeholder="Costo/Unidad" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleAddMovement(p.id)} disabled={addMovementMut.isPending}
                          className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium hover:bg-emerald-500/30 transition-all disabled:opacity-50">
                          Registrar
                        </button>
                        <button onClick={() => setShowMovementForm(null)}
                          className="px-3 py-1.5 bg-white/5 text-white/60 border border-white/10 rounded-lg text-xs hover:bg-white/10 transition-all">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* Movements History */}
                  {p.movements && p.movements.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-white/70 mb-2 flex items-center gap-1"><History className="w-4 h-4" /> Últimos Movimientos</h5>
                      <div className="space-y-1">
                        {p.movements.slice(0, 5).map((m: any) => (
                          <div key={m.id} className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              {m.movementType === "entrada" || m.movementType === "devolucion" ? (
                                <ArrowDownCircle className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <ArrowUpCircle className="w-4 h-4 text-red-400" />
                              )}
                              <span className="text-white capitalize">{m.movementType}</span>
                              {m.reason && <span className="text-white/40">- {m.reason}</span>}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={m.movementType === "entrada" || m.movementType === "devolucion" ? "text-emerald-400" : "text-red-400"}>
                                {m.movementType === "entrada" || m.movementType === "devolucion" ? "+" : "-"}{Number(m.quantity).toLocaleString("es-MX")}
                              </span>
                              <span className="text-white/30">{new Date(m.createdAt).toLocaleDateString("es-MX")}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-white/10">
                    <button onClick={() => setShowMovementForm(showMovementForm === p.id ? null : p.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium hover:bg-blue-500/30 transition-all">
                      <RefreshCw className="w-3 h-3" /> Movimiento
                    </button>
                    <button onClick={() => startEdit(p)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium hover:bg-amber-500/30 transition-all">
                      <Edit2 className="w-3 h-3" /> Editar
                    </button>
                    <button onClick={() => { if (confirm("¿Desactivar este producto?")) deleteMut.mutate({ id: p.id }); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-500/20 text-red-300 border border-red-500/30 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-all">
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
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: tools = [], isLoading } = useQuery(trpc.warehouse.tools.list.queryOptions());

  const createMut = useMutation(trpc.warehouse.tools.create.mutationOptions({
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: trpc.warehouse.tools.list.queryKey() }); setShowForm(false); resetForm(); },
  }));
  const updateMut = useMutation(trpc.warehouse.tools.update.mutationOptions({
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: trpc.warehouse.tools.list.queryKey() }); setEditingId(null); resetForm(); },
  }));
  const deleteMut = useMutation(trpc.warehouse.tools.delete.mutationOptions({
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: trpc.warehouse.tools.list.queryKey() }); },
  }));

  const [form, setForm] = useState({
    name: "", category: "otro", brand: "", model: "", serialNumber: "",
    description: "", status: "disponible", conditionState: "bueno",
    acquisitionDate: "", acquisitionCost: "", currentValue: "",
    storageLocation: "", assignedTo: "", lastMaintenanceDate: "",
    nextMaintenanceDate: "", maintenanceNotes: "", photoUrl: "", quantity: "1",
  });

  const resetForm = useCallback(() => {
    setForm({
      name: "", category: "otro", brand: "", model: "", serialNumber: "",
      description: "", status: "disponible", conditionState: "bueno",
      acquisitionDate: "", acquisitionCost: "", currentValue: "",
      storageLocation: "", assignedTo: "", lastMaintenanceDate: "",
      nextMaintenanceDate: "", maintenanceNotes: "", photoUrl: "", quantity: "1",
    });
  }, []);

  const filtered = useMemo(() => {
    let list = tools.filter((t: any) => t.isActive !== false);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((t: any) => t.name?.toLowerCase().includes(s) || t.brand?.toLowerCase().includes(s) || t.serialNumber?.toLowerCase().includes(s));
    }
    if (categoryFilter) list = list.filter((t: any) => t.category === categoryFilter);
    if (statusFilter) list = list.filter((t: any) => t.status === statusFilter);
    return list;
  }, [tools, search, categoryFilter, statusFilter]);

  const stats = useMemo(() => {
    const active = tools.filter((t: any) => t.isActive !== false);
    const available = active.filter((t: any) => t.status === "disponible").length;
    const inMaintenance = active.filter((t: any) => t.status === "mantenimiento" || t.status === "dañado").length;
    const totalValue = active.reduce((sum: number, t: any) => sum + Number(t.currentValue || t.acquisitionCost || 0), 0);
    return { total: active.length, available, inMaintenance, totalValue };
  }, [tools]);

  const handleSave = () => {
    const data = {
      name: form.name, category: form.category, brand: form.brand || undefined,
      model: form.model || undefined, serialNumber: form.serialNumber || undefined,
      description: form.description || undefined, status: form.status,
      conditionState: form.conditionState, acquisitionDate: form.acquisitionDate || undefined,
      acquisitionCost: form.acquisitionCost || undefined, currentValue: form.currentValue || undefined,
      storageLocation: form.storageLocation || undefined, assignedTo: form.assignedTo || undefined,
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
      conditionState: t.conditionState || "bueno", acquisitionDate: t.acquisitionDate || "",
      acquisitionCost: String(t.acquisitionCost || ""), currentValue: String(t.currentValue || ""),
      storageLocation: t.storageLocation || "", assignedTo: t.assignedTo || "",
      lastMaintenanceDate: t.lastMaintenanceDate || "", nextMaintenanceDate: t.nextMaintenanceDate || "",
      maintenanceNotes: t.maintenanceNotes || "", photoUrl: t.photoUrl || "",
      quantity: String(t.quantity || 1),
    });
    setEditingId(t.id);
    setShowForm(true);
  };

  if (isLoading) return <div className="text-white/60 text-center py-12">Cargando herramientas...</div>;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <GlassCard hover={true} className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20"><Wrench className="w-5 h-5 text-amber-400" /></div>
            <div><p className="text-white/50 text-xs">Total Equipos</p><p className="text-xl font-bold text-white">{stats.total}</p></div>
          </div>
        </GlassCard>
        <GlassCard hover={true} className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20"><Box className="w-5 h-5 text-emerald-400" /></div>
            <div><p className="text-white/50 text-xs">Disponibles</p><p className="text-xl font-bold text-emerald-400">{stats.available}</p></div>
          </div>
        </GlassCard>
        <GlassCard hover={true} className="p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stats.inMaintenance > 0 ? "bg-yellow-500/20" : "bg-green-500/20"}`}>
              <AlertTriangle className={`w-5 h-5 ${stats.inMaintenance > 0 ? "text-yellow-400" : "text-green-400"}`} />
            </div>
            <div><p className="text-white/50 text-xs">Mantenimiento/Daño</p><p className="text-xl font-bold text-yellow-400">{stats.inMaintenance}</p></div>
          </div>
        </GlassCard>
        <GlassCard hover={true} className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20"><TrendingUp className="w-5 h-5 text-blue-400" /></div>
            <div><p className="text-white/50 text-xs">Valor Total</p><p className="text-xl font-bold text-white">${stats.totalValue.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p></div>
          </div>
        </GlassCard>
      </div>

      {/* Filters & Add */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar herramienta, marca o serie..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none">
          <option value="">Todas las categorías</option>
          {Object.entries(TOOL_CATEGORIES).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none">
          <option value="">Todos los estados</option>
          {Object.entries(TOOL_STATUS).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
        </select>
        <button onClick={() => { resetForm(); setEditingId(null); setShowForm(!showForm); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-sm font-medium hover:bg-amber-500/30 transition-all">
          <Plus className="w-4 h-4" /> Nueva Herramienta
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-white mb-4">{editingId ? "Editar Herramienta" : "Nueva Herramienta"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-white/60 text-xs mb-1 block">Nombre *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Categoría</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none">
                {Object.entries(TOOL_CATEGORIES).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
              </select>
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Marca</label>
              <input type="text" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Modelo</label>
              <input type="text" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">No. Serie</label>
              <input type="text" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Cantidad</label>
              <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Estado</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none">
                {Object.entries(TOOL_STATUS).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
              </select>
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Condición</label>
              <select value={form.conditionState} onChange={(e) => setForm({ ...form, conditionState: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none">
                {Object.entries(TOOL_CONDITION).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
              </select>
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Fecha Adquisición</label>
              <input type="date" value={form.acquisitionDate} onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Costo Adquisición ($)</label>
              <input type="number" step="0.01" value={form.acquisitionCost} onChange={(e) => setForm({ ...form, acquisitionCost: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Valor Actual ($)</label>
              <input type="number" step="0.01" value={form.currentValue} onChange={(e) => setForm({ ...form, currentValue: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Ubicación</label>
              <input type="text" value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Asignado a</label>
              <input type="text" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Último Mantenimiento</label>
              <input type="date" value={form.lastMaintenanceDate} onChange={(e) => setForm({ ...form, lastMaintenanceDate: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Próximo Mantenimiento</label>
              <input type="date" value={form.nextMaintenanceDate} onChange={(e) => setForm({ ...form, nextMaintenanceDate: e.target.value })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">URL Foto</label>
              <input type="text" value={form.photoUrl} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })}
                placeholder="https://..." className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="text-white/60 text-xs mb-1 block">Descripción</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50 resize-none" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="text-white/60 text-xs mb-1 block">Notas de Mantenimiento</label>
              <textarea value={form.maintenanceNotes} onChange={(e) => setForm({ ...form, maintenanceNotes: e.target.value })} rows={2}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50 resize-none" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={!form.name || createMut.isPending || updateMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-sm font-medium hover:bg-amber-500/30 transition-all disabled:opacity-50">
              <Save className="w-4 h-4" /> {editingId ? "Actualizar" : "Guardar"}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); resetForm(); }}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 text-white/60 border border-white/10 rounded-lg text-sm hover:bg-white/10 transition-all">
              <X className="w-4 h-4" /> Cancelar
            </button>
          </div>
        </GlassCard>
      )}

      {/* Tool List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <GlassCard className="p-8 text-center"><p className="text-white/40">No se encontraron herramientas</p></GlassCard>
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
                      <img src={t.photoUrl} alt={t.name} className="w-12 h-12 rounded-lg object-cover border border-white/10 flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                        <Wrench className="w-6 h-6 text-white/30" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-white font-medium truncate">{t.name}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-xs bg-${cat.color}-500/20 text-${cat.color}-300 border border-${cat.color}-500/20`}>
                          {cat.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs bg-${st.color}-500/20 text-${st.color}-300 border border-${st.color}-500/20`}>
                          {st.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs bg-${cond.color}-500/20 text-${cond.color}-300 border border-${cond.color}-500/20`}>
                          {cond.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-white/50">
                        {t.brand && <span>{t.brand}</span>}
                        {t.model && <span>{t.model}</span>}
                        {t.serialNumber && <span>S/N: {t.serialNumber}</span>}
                        {t.quantity > 1 && <span className="text-amber-300">x{t.quantity}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {t.assignedTo && (
                      <span className="text-xs text-white/40 bg-white/5 px-2 py-1 rounded-lg">{t.assignedTo}</span>
                    )}
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-white/40" /> : <ChevronDown className="w-5 h-5 text-white/40" />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-white/10 p-4 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    {t.acquisitionDate && <div><span className="text-white/40">Adquisición:</span> <span className="text-white">{t.acquisitionDate}</span></div>}
                    {t.acquisitionCost && <div><span className="text-white/40">Costo:</span> <span className="text-white">${Number(t.acquisitionCost).toLocaleString("es-MX")}</span></div>}
                    {t.currentValue && <div><span className="text-white/40">Valor Actual:</span> <span className="text-white">${Number(t.currentValue).toLocaleString("es-MX")}</span></div>}
                    {t.storageLocation && <div><span className="text-white/40">Ubicación:</span> <span className="text-white">{t.storageLocation}</span></div>}
                    {t.lastMaintenanceDate && <div><span className="text-white/40">Último Mtto:</span> <span className="text-white">{t.lastMaintenanceDate}</span></div>}
                    {t.nextMaintenanceDate && <div><span className="text-white/40">Próximo Mtto:</span> <span className="text-white">{t.nextMaintenanceDate}</span></div>}
                  </div>
                  {t.description && <p className="text-sm text-white/60">{t.description}</p>}
                  {t.maintenanceNotes && <p className="text-sm text-white/60 italic">Notas: {t.maintenanceNotes}</p>}

                  <div className="flex gap-2 pt-2 border-t border-white/10">
                    <button onClick={() => startEdit(t)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium hover:bg-amber-500/30 transition-all">
                      <Edit2 className="w-3 h-3" /> Editar
                    </button>
                    <button onClick={() => { if (confirm("¿Desactivar esta herramienta?")) deleteMut.mutate({ id: t.id }); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-500/20 text-red-300 border border-red-500/30 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-all">
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
