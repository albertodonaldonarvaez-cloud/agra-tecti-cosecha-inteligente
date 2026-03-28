import { useState, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  ClipboardList,
  Plus,
  MapPin,
  Camera,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  X,
  Send,
  Loader2,
  TreePine,
  Bug,
  Droplets,
  Wrench,
  Leaf,
  FlaskConical,
  Mountain,
  Building2,
  PawPrint,
  HelpCircle,
  Navigation,
  Trash2,
  MessageSquare,
} from "lucide-react";

// ============ CONSTANTES ============
const CATEGORIES = [
  { value: "arboles_mal_plantados", label: "Árboles mal plantados", icon: TreePine, color: "text-green-700 bg-green-100" },
  { value: "plaga_enfermedad", label: "Plaga / Enfermedad", icon: Bug, color: "text-red-700 bg-red-100" },
  { value: "riego_drenaje", label: "Riego / Drenaje", icon: Droplets, color: "text-blue-700 bg-blue-100" },
  { value: "dano_mecanico", label: "Daño mecánico", icon: Wrench, color: "text-orange-700 bg-orange-100" },
  { value: "maleza", label: "Maleza", icon: Leaf, color: "text-lime-700 bg-lime-100" },
  { value: "fertilizacion", label: "Fertilización", icon: FlaskConical, color: "text-purple-700 bg-purple-100" },
  { value: "suelo", label: "Suelo", icon: Mountain, color: "text-amber-700 bg-amber-100" },
  { value: "infraestructura", label: "Infraestructura", icon: Building2, color: "text-gray-700 bg-gray-100" },
  { value: "fauna", label: "Fauna", icon: PawPrint, color: "text-teal-700 bg-teal-100" },
  { value: "otro", label: "Otro", icon: HelpCircle, color: "text-slate-700 bg-slate-100" },
];

const SEVERITIES = [
  { value: "baja", label: "Baja", color: "bg-blue-100 text-blue-800 border-blue-300" },
  { value: "media", label: "Media", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  { value: "alta", label: "Alta", color: "bg-orange-100 text-orange-800 border-orange-300" },
  { value: "critica", label: "Crítica", color: "bg-red-100 text-red-800 border-red-300" },
];

const STATUSES = [
  { value: "abierta", label: "Abierta", color: "bg-red-100 text-red-700", icon: AlertTriangle },
  { value: "en_revision", label: "En revisión", color: "bg-yellow-100 text-yellow-700", icon: Eye },
  { value: "en_progreso", label: "En progreso", color: "bg-blue-100 text-blue-700", icon: Clock },
  { value: "resuelta", label: "Resuelta", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  { value: "descartada", label: "Descartada", color: "bg-gray-100 text-gray-700", icon: X },
];

function getCategoryInfo(value: string) {
  return CATEGORIES.find(c => c.value === value) || CATEGORIES[CATEGORIES.length - 1];
}
function getSeverityInfo(value: string) {
  return SEVERITIES.find(s => s.value === value) || SEVERITIES[1];
}
function getStatusInfo(value: string) {
  return STATUSES.find(s => s.value === value) || STATUSES[0];
}

function toDateStr(val: any): string {
  if (!val) return "";
  if (val instanceof Date) return val.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return new Date(val).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ============ COMPONENTE PRINCIPAL ============
function FieldNotesContent() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Estado de vista
  const [showForm, setShowForm] = useState(false);
  const [expandedNote, setExpandedNote] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterSeverity, setFilterSeverity] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [statusChangeNote, setStatusChangeNote] = useState<number | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");

  // Estado del formulario
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "arboles_mal_plantados",
    severity: "media",
    parcelId: undefined as number | undefined,
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
  });
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");

  // Queries
  const { data: notes, isLoading } = trpc.fieldNotes.list.useQuery(
    {
      ...(filterStatus ? { status: filterStatus } : {}),
      ...(filterCategory ? { category: filterCategory } : {}),
      ...(filterSeverity ? { severity: filterSeverity } : {}),
    }
  );
  const { data: summary } = trpc.fieldNotes.summary.useQuery();
  const { data: allParcels } = trpc.parcels.listActive.useQuery();

  // Solo parcelas con polígono
  const parcelsWithPolygon = (allParcels as any[] || []).filter((p: any) => p.polygon && p.polygon.length > 0);

  // Mutations
  const createNote = trpc.fieldNotes.create.useMutation({
    onSuccess: () => {
      toast.success("Nota de campo creada exitosamente");
      utils.fieldNotes.list.invalidate();
      utils.fieldNotes.summary.invalidate();
      setShowForm(false);
      resetForm();
    },
    onError: (err) => toast.error("Error al crear nota: " + err.message),
  });

  const updateStatus = trpc.fieldNotes.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Estado actualizado");
      utils.fieldNotes.list.invalidate();
      utils.fieldNotes.summary.invalidate();
      setStatusChangeNote(null);
      setResolutionNotes("");
      setNewStatus("");
    },
    onError: (err) => toast.error("Error: " + err.message),
  });

  const deleteNote = trpc.fieldNotes.delete.useMutation({
    onSuccess: () => {
      toast.success("Nota eliminada");
      utils.fieldNotes.list.invalidate();
      utils.fieldNotes.summary.invalidate();
      setExpandedNote(null);
    },
    onError: (err) => toast.error("Error: " + err.message),
  });

  const resetForm = () => {
    setForm({ title: "", description: "", category: "arboles_mal_plantados", severity: "media", parcelId: undefined, latitude: undefined, longitude: undefined });
    setGpsError("");
  };

  // Capturar GPS
  const captureGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("Tu navegador no soporta geolocalización");
      return;
    }
    setGpsLoading(true);
    setGpsError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(prev => ({ ...prev, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
        setGpsLoading(false);
        toast.success("Ubicación capturada");
      },
      (err) => {
        setGpsError(err.code === 1 ? "Permiso de ubicación denegado" : err.code === 2 ? "Ubicación no disponible" : "Tiempo de espera agotado");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  // Auto-capturar GPS al abrir formulario
  useEffect(() => {
    if (showForm && !form.latitude) {
      captureGPS();
    }
  }, [showForm]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = () => {
    if (!form.title.trim()) { toast.error("Escribe un título"); return; }
    createNote.mutate({
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      category: form.category,
      severity: form.severity,
      parcelId: form.parcelId,
      latitude: form.latitude,
      longitude: form.longitude,
    });
  };

  const handleStatusChange = (noteId: number, status: string) => {
    if (status === "resuelta" || status === "descartada") {
      setStatusChangeNote(noteId);
      setNewStatus(status);
    } else {
      updateStatus.mutate({ id: noteId, status });
    }
  };

  const confirmStatusChange = () => {
    if (!statusChangeNote || !newStatus) return;
    updateStatus.mutate({
      id: statusChangeNote,
      status: newStatus,
      resolutionNotes: resolutionNotes.trim() || undefined,
    });
  };

  // Filtrar notas por búsqueda
  const filteredNotes = (notes || []).filter((n: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return n.title?.toLowerCase().includes(q) || n.description?.toLowerCase().includes(q);
  });

  const activeFilters = [filterStatus, filterCategory, filterSeverity].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-28">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Notas de Campo</h1>
              <p className="text-sm text-gray-500">Reporta observaciones durante tus recorridos</p>
            </div>
          </div>
        </div>

        {/* Resumen rápido */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <GlassCard className="p-3 text-center hover:scale-105 transition-transform">
              <div className="text-2xl font-bold text-red-600">{summary.open}</div>
              <div className="text-xs text-gray-500">Abiertas</div>
            </GlassCard>
            <GlassCard className="p-3 text-center hover:scale-105 transition-transform">
              <div className="text-2xl font-bold text-yellow-600">{summary.inReview + summary.inProgress}</div>
              <div className="text-xs text-gray-500">En proceso</div>
            </GlassCard>
            <GlassCard className="p-3 text-center hover:scale-105 transition-transform">
              <div className="text-2xl font-bold text-green-600">{summary.resolved}</div>
              <div className="text-xs text-gray-500">Resueltas</div>
            </GlassCard>
            <GlassCard className="p-3 text-center hover:scale-105 transition-transform">
              <div className="text-2xl font-bold text-red-700">{summary.critical}</div>
              <div className="text-xs text-gray-500">Críticas</div>
            </GlassCard>
          </div>
        )}

        {/* Botón crear nueva nota */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full mb-6 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-3"
          >
            <Plus className="h-6 w-6" />
            Nueva Nota de Campo
          </button>
        )}

        {/* Formulario de nueva nota */}
        {showForm && (
          <GlassCard className="p-5 mb-6 border-2 border-amber-300/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Plus className="h-5 w-5 text-amber-600" />
                Nueva Observación
              </h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Título */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Ej: Árboles torcidos en fila 3"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-800 focus:ring-2 focus:ring-amber-400 focus:border-transparent text-base"
              />
            </div>

            {/* Categoría - Grid de iconos */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Categoría *</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {CATEGORIES.map(cat => {
                  const Icon = cat.icon;
                  const isSelected = form.category === cat.value;
                  return (
                    <button
                      key={cat.value}
                      onClick={() => setForm(prev => ({ ...prev, category: cat.value }))}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-xs font-medium ${
                        isSelected ? "border-amber-500 bg-amber-50 shadow-md scale-105" : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${isSelected ? "text-amber-600" : "text-gray-400"}`} />
                      <span className={isSelected ? "text-amber-700" : "text-gray-600"}>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Severidad */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Severidad</label>
              <div className="flex gap-2">
                {SEVERITIES.map(sev => (
                  <button
                    key={sev.value}
                    onClick={() => setForm(prev => ({ ...prev, severity: sev.value }))}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                      form.severity === sev.value
                        ? sev.color + " border-current shadow-md scale-105"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {sev.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Parcela */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Parcela</label>
              <select
                value={form.parcelId || ""}
                onChange={e => setForm(prev => ({ ...prev, parcelId: e.target.value ? Number(e.target.value) : undefined }))}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-800 focus:ring-2 focus:ring-amber-400"
              >
                <option value="">Sin parcela específica</option>
                {parcelsWithPolygon.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                ))}
              </select>
            </div>

            {/* Descripción */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe lo que observaste con detalle..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-800 focus:ring-2 focus:ring-amber-400 resize-none text-base"
              />
            </div>

            {/* GPS */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Ubicación GPS</label>
              {form.latitude && form.longitude ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200">
                  <MapPin className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm text-green-700 font-medium">Ubicación capturada</span>
                    <span className="text-xs text-green-600 block">{form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}</span>
                  </div>
                  <button onClick={captureGPS} className="text-xs text-green-600 underline hover:text-green-800">Actualizar</button>
                </div>
              ) : (
                <button
                  onClick={captureGPS}
                  disabled={gpsLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-amber-400 hover:text-amber-600 transition-all"
                >
                  {gpsLoading ? (
                    <><Loader2 className="h-5 w-5 animate-spin" /> Obteniendo ubicación...</>
                  ) : (
                    <><Navigation className="h-5 w-5" /> Capturar mi ubicación</>
                  )}
                </button>
              )}
              {gpsError && <p className="text-xs text-red-500 mt-1">{gpsError}</p>}
            </div>

            {/* Botón enviar */}
            <button
              onClick={handleSubmit}
              disabled={createNote.isPending || !form.title.trim()}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {createNote.isPending ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Guardando...</>
              ) : (
                <><Send className="h-5 w-5" /> Enviar Reporte</>
              )}
            </button>
          </GlassCard>
        )}

        {/* Barra de búsqueda y filtros */}
        <div className="mb-4 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar notas..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-800 text-sm focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2.5 rounded-xl border flex items-center gap-1.5 text-sm font-medium transition-all ${
                activeFilters > 0 ? "border-amber-400 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              <Filter className="h-4 w-4" />
              {activeFilters > 0 && <span className="bg-amber-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">{activeFilters}</span>}
            </button>
          </div>

          {showFilters && (
            <GlassCard className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800">
                    <option value="">Todos</option>
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Categoría</label>
                  <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800">
                    <option value="">Todas</option>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Severidad</label>
                  <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800">
                    <option value="">Todas</option>
                    {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              {activeFilters > 0 && (
                <button
                  onClick={() => { setFilterStatus(""); setFilterCategory(""); setFilterSeverity(""); }}
                  className="mt-3 text-xs text-amber-600 hover:text-amber-800 underline"
                >
                  Limpiar filtros
                </button>
              )}
            </GlassCard>
          )}
        </div>

        {/* Lista de notas */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            <span className="ml-3 text-gray-500">Cargando notas...</span>
          </div>
        ) : filteredNotes.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No hay notas de campo</p>
            <p className="text-sm text-gray-400 mt-1">Crea una nueva nota para reportar observaciones</p>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {filteredNotes.map((note: any) => {
              const cat = getCategoryInfo(note.category);
              const sev = getSeverityInfo(note.severity);
              const stat = getStatusInfo(note.status);
              const CatIcon = cat.icon;
              const StatIcon = stat.icon;
              const isExpanded = expandedNote === note.id;
              const parcel = parcelsWithPolygon.find((p: any) => p.id === note.parcelId);

              return (
                <GlassCard
                  key={note.id}
                  className={`p-4 transition-all hover:shadow-lg cursor-pointer ${
                    note.severity === "critica" && note.status !== "resuelta" && note.status !== "descartada"
                      ? "border-l-4 border-l-red-500"
                      : note.severity === "alta" && note.status !== "resuelta" && note.status !== "descartada"
                      ? "border-l-4 border-l-orange-400"
                      : ""
                  }`}
                  onClick={() => setExpandedNote(isExpanded ? null : note.id)}
                >
                  {/* Cabecera de la nota */}
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${cat.color} flex-shrink-0`}>
                      <CatIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-800 text-sm truncate">{note.title}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${sev.color}`}>{sev.label}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${stat.color}`}>
                          <StatIcon className="h-3 w-3" />
                          {stat.label}
                        </span>
                        {parcel && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {parcel.code}
                          </span>
                        )}
                        <span>{toDateStr(note.createdAt)}</span>
                      </div>
                    </div>
                    <button className="p-1 text-gray-400 flex-shrink-0">
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                      {note.description && (
                        <p className="text-sm text-gray-600 mb-3 whitespace-pre-wrap">{note.description}</p>
                      )}

                      {/* Info adicional */}
                      <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                        {note.latitude && note.longitude && (
                          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-gray-50">
                            <MapPin className="h-3.5 w-3.5 text-gray-400" />
                            <a
                              href={`https://www.google.com/maps?q=${note.latitude},${note.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              Ver en mapa
                            </a>
                          </div>
                        )}
                        {parcel && (
                          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-gray-50">
                            <MapPin className="h-3.5 w-3.5 text-gray-400" />
                            <span className="text-gray-600">{parcel.code} - {parcel.name}</span>
                          </div>
                        )}
                      </div>

                      {/* Notas de resolución */}
                      {note.resolutionNotes && (
                        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 mb-1">
                            <MessageSquare className="h-3.5 w-3.5" />
                            Resolución
                          </div>
                          <p className="text-sm text-green-800">{note.resolutionNotes}</p>
                          {note.resolvedAt && <p className="text-xs text-green-600 mt-1">Resuelta: {toDateStr(note.resolvedAt)}</p>}
                        </div>
                      )}

                      {/* Acciones de estado */}
                      {note.status !== "resuelta" && note.status !== "descartada" && (
                        <div className="mb-3">
                          <label className="block text-xs font-medium text-gray-500 mb-2">Cambiar estado:</label>
                          <div className="flex flex-wrap gap-2">
                            {STATUSES.filter(s => s.value !== note.status && s.value !== "abierta").map(s => {
                              const SIcon = s.icon;
                              return (
                                <button
                                  key={s.value}
                                  onClick={() => handleStatusChange(note.id, s.value)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 ${s.color}`}
                                >
                                  <SIcon className="h-3.5 w-3.5" />
                                  {s.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Botón eliminar */}
                      {(user?.role === "admin" || note.reportedByUserId === user?.id) && (
                        <button
                          onClick={() => {
                            if (confirm("¿Eliminar esta nota de campo?")) {
                              deleteNote.mutate({ id: note.id });
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar
                        </button>
                      )}
                    </div>
                  )}
                </GlassCard>
              );
            })}
          </div>
        )}

        {/* Modal de resolución */}
        {statusChangeNote !== null && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setStatusChangeNote(null)}>
            <GlassCard className="p-6 max-w-md w-full" onClick={(e: any) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-800 mb-3">
                {newStatus === "resuelta" ? "Marcar como resuelta" : "Descartar nota"}
              </h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {newStatus === "resuelta" ? "Notas de resolución (opcional)" : "Motivo de descarte (opcional)"}
                </label>
                <textarea
                  value={resolutionNotes}
                  onChange={e => setResolutionNotes(e.target.value)}
                  placeholder={newStatus === "resuelta" ? "¿Cómo se resolvió?" : "¿Por qué se descarta?"}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-800 focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setStatusChangeNote(null); setResolutionNotes(""); setNewStatus(""); }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmStatusChange}
                  disabled={updateStatus.isPending}
                  className={`flex-1 py-2.5 rounded-xl text-white font-medium ${
                    newStatus === "resuelta" ? "bg-green-600 hover:bg-green-700" : "bg-gray-600 hover:bg-gray-700"
                  } disabled:opacity-50`}
                >
                  {updateStatus.isPending ? "Guardando..." : "Confirmar"}
                </button>
              </div>
            </GlassCard>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FieldNotes() {
  return (
    <ProtectedPage permission="canViewFieldNotes">
      <FieldNotesContent />
    </ProtectedPage>
  );
}
