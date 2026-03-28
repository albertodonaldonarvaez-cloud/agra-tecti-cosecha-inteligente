import { useState, useCallback, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  ClipboardList, Plus, MapPin, AlertTriangle, CheckCircle2, Clock, Eye,
  Search, Filter, ChevronDown, ChevronUp, X, Save, Loader2,
  TreePine, Bug, Droplets, Wrench, Leaf, FlaskConical, Mountain,
  Building2, PawPrint, HelpCircle, Navigation, Trash2, MessageSquare,
  Edit3, Send,
} from "lucide-react";

// ===== CONSTANTES =====

const CATEGORIES = [
  { value: "arboles_mal_plantados", label: "Árboles mal plantados", icon: TreePine, color: "text-green-600 bg-green-50" },
  { value: "plaga_enfermedad", label: "Plaga / Enfermedad", icon: Bug, color: "text-red-600 bg-red-50" },
  { value: "riego_drenaje", label: "Riego / Drenaje", icon: Droplets, color: "text-blue-600 bg-blue-50" },
  { value: "dano_mecanico", label: "Daño mecánico", icon: Wrench, color: "text-orange-600 bg-orange-50" },
  { value: "maleza", label: "Maleza", icon: Leaf, color: "text-lime-600 bg-lime-50" },
  { value: "fertilizacion", label: "Fertilización", icon: FlaskConical, color: "text-amber-600 bg-amber-50" },
  { value: "suelo", label: "Suelo", icon: Mountain, color: "text-yellow-600 bg-yellow-50" },
  { value: "infraestructura", label: "Infraestructura", icon: Building2, color: "text-gray-600 bg-gray-50" },
  { value: "fauna", label: "Fauna", icon: PawPrint, color: "text-teal-600 bg-teal-50" },
  { value: "otro", label: "Otro", icon: HelpCircle, color: "text-slate-600 bg-slate-50" },
];

const SEVERITIES = [
  { value: "baja", label: "Baja", color: "text-blue-600 bg-blue-50 border-blue-200" },
  { value: "media", label: "Media", color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  { value: "alta", label: "Alta", color: "text-orange-600 bg-orange-50 border-orange-200" },
  { value: "critica", label: "Crítica", color: "text-red-600 bg-red-50 border-red-200" },
];

const STATUSES = [
  { value: "abierta", label: "Abierta", icon: AlertTriangle, color: "text-red-600 bg-red-50 border-red-200" },
  { value: "en_revision", label: "En revisión", icon: Eye, color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  { value: "en_progreso", label: "En progreso", icon: Clock, color: "text-blue-600 bg-blue-50 border-blue-200" },
  { value: "resuelta", label: "Resuelta", icon: CheckCircle2, color: "text-green-600 bg-green-50 border-green-200" },
  { value: "descartada", label: "Descartada", icon: X, color: "text-gray-600 bg-gray-50 border-gray-200" },
];

const getCategoryInfo = (v: string) => CATEGORIES.find(c => c.value === v) || CATEGORIES[9];
const getSeverityInfo = (v: string) => SEVERITIES.find(s => s.value === v) || SEVERITIES[1];
const getStatusInfo = (v: string) => STATUSES.find(s => s.value === v) || STATUSES[0];

function toDateStr(val: any): string {
  if (!val) return "—";
  const d = val instanceof Date ? val : new Date(val);
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ===== COMPONENTE PRINCIPAL =====

export default function FieldNotes() {
  return (
    <ProtectedPage permission="canViewFieldNotes">
      <FieldNotesContent />
    </ProtectedPage>
  );
}

function FieldNotesContent() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Estado de vista
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [statusChangeNote, setStatusChangeNote] = useState<number | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");

  // Formulario
  const [form, setForm] = useState({
    title: "", description: "", category: "arboles_mal_plantados",
    severity: "media", parcelId: undefined as number | undefined,
    latitude: undefined as number | undefined, longitude: undefined as number | undefined,
  });
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");

  // Queries
  const { data: notes, isLoading } = trpc.fieldNotes.list.useQuery({
    ...(filterStatus ? { status: filterStatus } : {}),
    ...(filterCategory ? { category: filterCategory } : {}),
    ...(filterSeverity ? { severity: filterSeverity } : {}),
  });
  const { data: summary } = trpc.fieldNotes.summary.useQuery();
  const { data: allParcels } = trpc.parcels.listActive.useQuery();

  const parcelsWithPolygon = useMemo(() => {
    if (!allParcels) return [];
    return (allParcels as any[]).filter((p: any) => p.polygon && p.polygon.length > 0);
  }, [allParcels]);

  // Mutations
  const createNote = trpc.fieldNotes.create.useMutation({
    onSuccess: () => {
      toast.success("Nota de campo creada exitosamente");
      utils.fieldNotes.list.invalidate();
      utils.fieldNotes.summary.invalidate();
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
      setExpandedId(null);
    },
    onError: (err) => toast.error("Error: " + err.message),
  });

  const resetForm = useCallback(() => {
    setForm({ title: "", description: "", category: "arboles_mal_plantados", severity: "media", parcelId: undefined, latitude: undefined, longitude: undefined });
    setGpsError("");
    setShowForm(false);
  }, []);

  // GPS
  const captureGPS = useCallback(() => {
    if (!navigator.geolocation) { setGpsError("Tu navegador no soporta geolocalización"); return; }
    setGpsLoading(true);
    setGpsError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setForm(prev => ({ ...prev, latitude: pos.coords.latitude, longitude: pos.coords.longitude })); setGpsLoading(false); toast.success("Ubicación capturada"); },
      (err) => { setGpsError(err.code === 1 ? "Permiso de ubicación denegado" : err.code === 2 ? "Ubicación no disponible" : "Tiempo de espera agotado"); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => { if (showForm && !form.latitude) captureGPS(); }, [showForm]); // eslint-disable-line

  const handleSubmit = useCallback(() => {
    if (!form.title.trim()) { toast.error("Escribe un título para la nota"); return; }
    createNote.mutate({
      title: form.title.trim(), description: form.description.trim() || undefined,
      category: form.category, severity: form.severity,
      parcelId: form.parcelId, latitude: form.latitude, longitude: form.longitude,
    });
  }, [form, createNote]);

  const handleStatusChange = useCallback((noteId: number, status: string) => {
    if (status === "resuelta" || status === "descartada") {
      setStatusChangeNote(noteId);
      setNewStatus(status);
    } else {
      updateStatus.mutate({ id: noteId, status });
    }
  }, [updateStatus]);

  const confirmStatusChange = useCallback(() => {
    if (!statusChangeNote || !newStatus) return;
    updateStatus.mutate({ id: statusChangeNote, status: newStatus, resolutionNotes: resolutionNotes.trim() || undefined });
  }, [statusChangeNote, newStatus, resolutionNotes, updateStatus]);

  // Filtrar
  const filteredNotes = useMemo(() => {
    if (!notes) return [];
    if (!searchTerm.trim()) return notes;
    const term = searchTerm.toLowerCase();
    return notes.filter((n: any) =>
      n.title?.toLowerCase().includes(term) || n.description?.toLowerCase().includes(term)
    );
  }, [notes, searchTerm]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 p-4 md:p-6 pb-24">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-2">
              <ClipboardList className="w-7 h-7 text-green-600" />
              Notas de Campo
            </h1>
            <p className="text-sm text-gray-500 mt-1">Reporta observaciones durante tus recorridos</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Nueva Nota
          </button>
        </div>

        {/* Estadísticas rápidas */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
                <div><p className="text-xs text-gray-500">Abiertas</p><p className="text-xl font-bold text-gray-800">{summary.open}</p></div>
              </div>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center"><Clock className="w-5 h-5 text-yellow-600" /></div>
                <div><p className="text-xs text-gray-500">En Proceso</p><p className="text-xl font-bold text-gray-800">{summary.inReview + summary.inProgress}</p></div>
              </div>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
                <div><p className="text-xs text-gray-500">Resueltas</p><p className="text-xl font-bold text-gray-800">{summary.resolved}</p></div>
              </div>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-red-700" /></div>
                <div><p className="text-xs text-gray-500">Críticas</p><p className="text-xl font-bold text-red-700">{summary.critical}</p></div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none">
              <option value="">Todos los estados</option>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none">
              <option value="">Todas las categorías</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none">
              <option value="">Todas las severidades</option>
              {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </GlassCard>

        {/* Formulario de nueva nota */}
        {showForm && (
          <GlassCard className="p-5" hover={false}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-green-500" />
                Nueva Observación
              </h2>
              <button onClick={resetForm} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="space-y-5">
              {/* Título */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Título *</label>
                <input type="text" value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Ej: Árboles torcidos en fila 3"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none" />
              </div>

              {/* Categoría */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Categoría</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    const selected = form.category === cat.value;
                    return (
                      <button key={cat.value}
                        onClick={() => setForm(prev => ({ ...prev, category: cat.value }))}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                          selected
                            ? `${cat.color} border-current shadow-md ring-2 ring-green-300`
                            : "bg-white/60 text-gray-500 border-gray-200 hover:bg-white hover:text-gray-700"
                        }`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Severidad */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Severidad</label>
                <div className="grid grid-cols-4 gap-2">
                  {SEVERITIES.map(sev => (
                    <button key={sev.value}
                      onClick={() => setForm(prev => ({ ...prev, severity: sev.value }))}
                      className={`py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        form.severity === sev.value
                          ? `${sev.color} shadow-md ring-2 ring-green-300`
                          : "bg-white/60 text-gray-500 border-gray-200 hover:bg-white hover:text-gray-700"
                      }`}
                    >
                      {sev.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Parcela y Descripción */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Parcela</label>
                  <select value={form.parcelId || ""} onChange={e => setForm(prev => ({ ...prev, parcelId: e.target.value ? Number(e.target.value) : undefined }))}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none">
                    <option value="">Sin parcela específica</option>
                    {parcelsWithPolygon.map((p: any) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ubicación GPS</label>
                  {form.latitude && form.longitude ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200">
                      <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-xs text-green-700 font-medium flex-1">{form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}</span>
                      <button onClick={captureGPS} className="text-xs text-green-600 underline hover:text-green-800">Actualizar</button>
                    </div>
                  ) : (
                    <button onClick={captureGPS} disabled={gpsLoading}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 hover:border-green-400 hover:text-green-600 transition-all">
                      {gpsLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Obteniendo...</> : <><Navigation className="w-4 h-4" /> Capturar ubicación</>}
                    </button>
                  )}
                  {gpsError && <p className="text-xs text-red-500 mt-1">{gpsError}</p>}
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Descripción</label>
                <textarea value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe lo que observaste con detalle..."
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none resize-none" />
              </div>

              {/* Botón guardar */}
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={resetForm} className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all">
                  Cancelar
                </button>
                <button onClick={handleSubmit} disabled={createNote.isPending || !form.title.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all text-sm font-semibold disabled:opacity-50">
                  {createNote.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><Save className="w-4 h-4" /> Guardar Nota</>}
                </button>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Lista de notas */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-green-500" />
            <span className="ml-3 text-gray-500">Cargando notas...</span>
          </div>
        ) : filteredNotes.length === 0 ? (
          <GlassCard className="p-8 text-center" hover={false}>
            <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
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
              const isExpanded = expandedId === note.id;
              const parcel = parcelsWithPolygon.find((p: any) => p.id === note.parcelId);

              return (
                <GlassCard key={note.id} className="p-4" onClick={() => setExpandedId(isExpanded ? null : note.id)}>
                  {/* Indicador de severidad */}
                  {(note.severity === "critica" || note.severity === "alta") && note.status !== "resuelta" && note.status !== "descartada" && (
                    <div className={`absolute top-0 left-0 w-1 h-full rounded-l-3xl ${note.severity === "critica" ? "bg-red-500" : "bg-orange-400"}`} />
                  )}

                  {/* Cabecera */}
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl ${cat.color} flex items-center justify-center flex-shrink-0`}>
                      <CatIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-800 text-sm">{note.title}</h3>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${stat.color}`}>
                          <StatIcon className="w-3 h-3" />
                          {stat.label}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium border ${sev.color}`}>
                          {sev.label}
                        </span>
                        {parcel && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <MapPin className="w-3 h-3" />
                            {parcel.code}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{toDateStr(note.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-gray-400">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100/50" onClick={e => e.stopPropagation()}>
                      {note.description && (
                        <p className="text-sm text-gray-600 mb-4 whitespace-pre-wrap leading-relaxed">{note.description}</p>
                      )}

                      {/* Info adicional */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                        {note.latitude && note.longitude && (
                          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/60 border border-gray-100">
                            <MapPin className="w-4 h-4 text-green-600" />
                            <a href={`https://www.google.com/maps?q=${note.latitude},${note.longitude}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline font-medium">
                              Ver en Google Maps
                            </a>
                          </div>
                        )}
                        {parcel && (
                          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/60 border border-gray-100">
                            <MapPin className="w-4 h-4 text-green-600" />
                            <span className="text-sm text-gray-600">{parcel.code} - {parcel.name}</span>
                          </div>
                        )}
                      </div>

                      {/* Notas de resolución */}
                      {note.resolutionNotes && (
                        <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 mb-1">
                            <MessageSquare className="w-3.5 h-3.5" />
                            Resolución
                          </div>
                          <p className="text-sm text-green-800">{note.resolutionNotes}</p>
                          {note.resolvedAt && <p className="text-xs text-green-600 mt-1">Resuelta: {toDateStr(note.resolvedAt)}</p>}
                        </div>
                      )}

                      {/* Acciones de estado */}
                      {note.status !== "resuelta" && note.status !== "descartada" && (
                        <div className="mb-3">
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Cambiar estado</label>
                          <div className="flex flex-wrap gap-2">
                            {STATUSES.filter(s => s.value !== note.status && s.value !== "abierta").map(s => {
                              const SIcon = s.icon;
                              return (
                                <button key={s.value} onClick={() => handleStatusChange(note.id, s.value)}
                                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border hover:shadow-md ${s.color}`}>
                                  <SIcon className="w-3.5 h-3.5" />
                                  {s.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Eliminar */}
                      {(user?.role === "admin" || note.reportedByUserId === user?.id) && (
                        <div className="flex justify-end pt-2">
                          <button onClick={() => { if (confirm("¿Eliminar esta nota de campo?")) deleteNote.mutate({ id: note.id }); }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de resolución */}
      {statusChangeNote !== null && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setStatusChangeNote(null)}>
          <div className="relative overflow-hidden rounded-3xl border border-green-200/30 bg-white/90 backdrop-blur-xl shadow-2xl max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              {newStatus === "resuelta" ? <><CheckCircle2 className="w-5 h-5 text-green-600" /> Marcar como resuelta</> : <><X className="w-5 h-5 text-gray-600" /> Descartar nota</>}
            </h3>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {newStatus === "resuelta" ? "Notas de resolución (opcional)" : "Motivo de descarte (opcional)"}
              </label>
              <textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)}
                placeholder={newStatus === "resuelta" ? "¿Cómo se resolvió?" : "¿Por qué se descarta?"}
                rows={3}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none resize-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setStatusChangeNote(null); setResolutionNotes(""); setNewStatus(""); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 text-sm transition-all">
                Cancelar
              </button>
              <button onClick={confirmStatusChange} disabled={updateStatus.isPending}
                className={`flex-1 py-2.5 rounded-xl text-white font-medium text-sm transition-all disabled:opacity-50 ${
                  newStatus === "resuelta" ? "bg-gradient-to-r from-green-500 to-emerald-600 shadow-lg" : "bg-gray-600 hover:bg-gray-700"
                }`}>
                {updateStatus.isPending ? "Guardando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
