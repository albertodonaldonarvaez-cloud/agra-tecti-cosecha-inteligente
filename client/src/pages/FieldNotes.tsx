import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
  Camera, Image as ImageIcon, Hash, Send, Link2, Unlink, Copy, Check,
  RotateCcw, SlidersHorizontal, User,
} from "lucide-react";

// ===== CONSTANTES =====

const CATEGORIES = [
  { value: "arboles_mal_plantados", label: "Arboles mal plantados", icon: TreePine, color: "text-green-600 bg-green-100/80", iconBg: "bg-green-200" },
  { value: "plaga_enfermedad", label: "Plaga / Enfermedad", icon: Bug, color: "text-red-600 bg-red-100/80", iconBg: "bg-red-200" },
  { value: "riego_drenaje", label: "Riego / Drenaje", icon: Droplets, color: "text-blue-600 bg-blue-100/80", iconBg: "bg-blue-200" },
  { value: "dano_mecanico", label: "Dano mecanico", icon: Wrench, color: "text-orange-600 bg-orange-100/80", iconBg: "bg-orange-200" },
  { value: "maleza", label: "Maleza", icon: Leaf, color: "text-lime-600 bg-lime-100/80", iconBg: "bg-lime-200" },
  { value: "fertilizacion", label: "Fertilizacion", icon: FlaskConical, color: "text-amber-600 bg-amber-100/80", iconBg: "bg-amber-200" },
  { value: "suelo", label: "Suelo", icon: Mountain, color: "text-yellow-600 bg-yellow-100/80", iconBg: "bg-yellow-200" },
  { value: "infraestructura", label: "Infraestructura", icon: Building2, color: "text-gray-600 bg-gray-100/80", iconBg: "bg-gray-200" },
  { value: "fauna", label: "Fauna", icon: PawPrint, color: "text-teal-600 bg-teal-100/80", iconBg: "bg-teal-200" },
  { value: "otro", label: "Otro", icon: HelpCircle, color: "text-slate-600 bg-slate-100/80", iconBg: "bg-slate-200" },
];

const PRIORITIES = [
  { value: "baja", label: "Baja", color: "text-blue-600 bg-blue-50 border-blue-200", dot: "bg-blue-500" },
  { value: "media", label: "Media", color: "text-yellow-600 bg-yellow-50 border-yellow-200", dot: "bg-yellow-500" },
  { value: "alta", label: "Alta", color: "text-orange-600 bg-orange-50 border-orange-200", dot: "bg-orange-500" },
  { value: "critica", label: "Critica", color: "text-red-600 bg-red-50 border-red-200", dot: "bg-red-500" },
];

const STATUSES = [
  { value: "abierta", label: "Abierta", icon: AlertTriangle, color: "text-red-600 bg-red-50 border-red-200", dot: "bg-red-500" },
  { value: "en_revision", label: "En revision", icon: Eye, color: "text-yellow-600 bg-yellow-50 border-yellow-200", dot: "bg-yellow-500" },
  { value: "en_progreso", label: "En progreso", icon: Clock, color: "text-blue-600 bg-blue-50 border-blue-200", dot: "bg-blue-500" },
  { value: "resuelta", label: "Resuelta", icon: CheckCircle2, color: "text-green-600 bg-green-50 border-green-200", dot: "bg-green-500" },
  { value: "descartada", label: "Descartada", icon: X, color: "text-gray-600 bg-gray-50 border-gray-200", dot: "bg-gray-400" },
];

const getCategoryInfo = (v: string) => CATEGORIES.find(c => c.value === v) || CATEGORIES[9];
const getPriorityInfo = (v: string) => PRIORITIES.find(s => s.value === v) || PRIORITIES[1];
const getStatusInfo = (v: string) => STATUSES.find(s => s.value === v) || STATUSES[0];

function toDateStr(val: any): string {
  if (!val) return "";
  const d = val instanceof Date ? val : new Date(val);
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function toShortDate(val: any): string {
  if (!val) return "";
  const d = val instanceof Date ? val : new Date(val);
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const [filterPriority, setFilterPriority] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Modal de cambio de estado
  const [statusModal, setStatusModal] = useState<{ noteId: number; status: string } | null>(null);
  const [modalResolutionNotes, setModalResolutionNotes] = useState("");
  const [modalPhotoPreview, setModalPhotoPreview] = useState<string | null>(null);
  const [modalPhotoBase64, setModalPhotoBase64] = useState<string | null>(null);
  const [modalGps, setModalGps] = useState<{ lat: number; lng: number } | null>(null);
  const [modalGpsLoading, setModalGpsLoading] = useState(false);
  const modalFileRef = useRef<HTMLInputElement>(null);

  // Formulario de creacion
  const [form, setForm] = useState({
    description: "", category: "arboles_mal_plantados",
    severity: "media", parcelId: undefined as number | undefined,
    latitude: undefined as number | undefined, longitude: undefined as number | undefined,
  });
  const [formPhotoPreview, setFormPhotoPreview] = useState<string | null>(null);
  const [formPhotoBase64, setFormPhotoBase64] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const formFileRef = useRef<HTMLInputElement>(null);

  // Telegram linking
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const { data: telegramStatus } = trpc.telegramLink.getStatus.useQuery();
  const generateCode = trpc.telegramLink.generateCode.useMutation({
    onSuccess: (data) => { setLinkCode(data.code); setCodeCopied(false); },
    onError: (err) => toast.error("Error: " + err.message),
  });
  const unlinkTelegram = trpc.telegramLink.unlink.useMutation({
    onSuccess: () => { toast.success("Telegram desvinculado"); utils.telegramLink.getStatus.invalidate(); setShowTelegramModal(false); },
    onError: (err) => toast.error("Error: " + err.message),
  });

  // Queries
  const { data: notes, isLoading } = trpc.fieldNotes.list.useQuery({
    ...(filterStatus ? { status: filterStatus } : {}),
    ...(filterCategory ? { category: filterCategory } : {}),
    ...(filterPriority ? { severity: filterPriority } : {}),
  });
  const { data: summary } = trpc.fieldNotes.summary.useQuery();
  const { data: allParcels } = trpc.parcels.listActive.useQuery();

  const parcelsWithPolygon = useMemo(() => {
    if (!allParcels) return [];
    return (allParcels as any[]).filter((p: any) => p.polygon && p.polygon.length > 0);
  }, [allParcels]);

  // Mutations
  const createNote = trpc.fieldNotes.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Nota ${data.folio} creada exitosamente`);
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
      closeStatusModal();
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
    setForm({ description: "", category: "arboles_mal_plantados", severity: "media", parcelId: undefined, latitude: undefined, longitude: undefined });
    setFormPhotoPreview(null);
    setFormPhotoBase64(null);
    setGpsError("");
    setShowForm(false);
  }, []);

  const closeStatusModal = useCallback(() => {
    setStatusModal(null);
    setModalResolutionNotes("");
    setModalPhotoPreview(null);
    setModalPhotoBase64(null);
    setModalGps(null);
  }, []);

  const hasActiveFilters = filterStatus || filterCategory || filterPriority || searchTerm;
  const clearFilters = useCallback(() => {
    setFilterStatus("");
    setFilterCategory("");
    setFilterPriority("");
    setSearchTerm("");
  }, []);

  // GPS helpers
  const captureGPS = useCallback((target: "form" | "modal") => {
    if (!navigator.geolocation) {
      if (target === "form") setGpsError("Tu navegador no soporta geolocalizacion");
      else toast.error("Tu navegador no soporta geolocalizacion");
      return;
    }
    if (target === "form") { setGpsLoading(true); setGpsError(""); }
    else setModalGpsLoading(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (target === "form") {
          setForm(prev => ({ ...prev, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
          setGpsLoading(false);
        } else {
          setModalGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setModalGpsLoading(false);
        }
        toast.success("Ubicacion capturada");
      },
      (err) => {
        const msg = err.code === 1 ? "Permiso de ubicacion denegado" : err.code === 2 ? "Ubicacion no disponible" : "Tiempo de espera agotado";
        if (target === "form") { setGpsError(msg); setGpsLoading(false); }
        else { toast.error(msg); setModalGpsLoading(false); }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => { if (showForm && !form.latitude) captureGPS("form"); }, [showForm]); // eslint-disable-line

  // Photo helpers
  const handlePhotoSelect = useCallback(async (file: File, target: "form" | "modal") => {
    if (!file.type.startsWith("image/")) { toast.error("Solo se permiten imagenes"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("La imagen no debe superar 10MB"); return; }
    const preview = URL.createObjectURL(file);
    const base64 = await fileToBase64(file);
    if (target === "form") { setFormPhotoPreview(preview); setFormPhotoBase64(base64); }
    else { setModalPhotoPreview(preview); setModalPhotoBase64(base64); }
  }, []);

  // Submit new note
  const handleSubmit = useCallback(() => {
    if (!form.description.trim()) { toast.error("Escribe una descripcion"); return; }
    if (!formPhotoBase64) { toast.error("Toma una foto de la observacion"); return; }
    createNote.mutate({
      description: form.description.trim(),
      category: form.category, severity: form.severity,
      parcelId: form.parcelId, latitude: form.latitude, longitude: form.longitude,
      photoBase64: formPhotoBase64,
    });
  }, [form, formPhotoBase64, createNote]);

  // Status change
  const handleStatusChange = useCallback((noteId: number, status: string) => {
    setStatusModal({ noteId, status });
    setModalResolutionNotes("");
    setModalPhotoPreview(null);
    setModalPhotoBase64(null);
    setModalGps(null);
    if (status === "resuelta" || status === "descartada") {
      setTimeout(() => captureGPS("modal"), 300);
    }
  }, [captureGPS]);

  const confirmStatusChange = useCallback(() => {
    if (!statusModal) return;
    const { noteId, status } = statusModal;
    const needsPhoto = status === "en_revision" || status === "resuelta" || status === "descartada";
    if (needsPhoto && !modalPhotoBase64) { toast.error("Se requiere una foto para este cambio de estado"); return; }
    if ((status === "resuelta" || status === "descartada") && !modalGps) { toast.error("Se requiere ubicacion GPS para cerrar/resolver"); return; }

    updateStatus.mutate({
      id: noteId, status,
      resolutionNotes: modalResolutionNotes.trim() || undefined,
      photoBase64: modalPhotoBase64 || undefined,
      latitude: modalGps?.lat, longitude: modalGps?.lng,
    });
  }, [statusModal, modalPhotoBase64, modalGps, modalResolutionNotes, updateStatus]);

  // Filter
  const filteredNotes = useMemo(() => {
    if (!notes) return [];
    if (!searchTerm.trim()) return notes;
    const term = searchTerm.toLowerCase();
    return notes.filter((n: any) =>
      n.folio?.toLowerCase().includes(term) || n.description?.toLowerCase().includes(term)
    );
  }, [notes, searchTerm]);

  const needsPhotoForStatus = (status: string) => status === "en_revision" || status === "resuelta" || status === "descartada";
  const needsGpsForStatus = (status: string) => status === "resuelta" || status === "descartada";

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 p-3 sm:p-4 md:p-6 pb-24">
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5">

        {/* ===== HEADER ===== */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-2">
              <ClipboardList className="w-6 h-6 sm:w-7 sm:h-7 text-green-600 flex-shrink-0" />
              <span className="truncate">Notas de Campo</span>
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5 ml-8 sm:ml-9">Reporta observaciones durante tus recorridos</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setShowTelegramModal(true)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl shadow-md hover:shadow-lg transition-all text-xs sm:text-sm font-semibold ${
                (telegramStatus as any)?.linked
                  ? "bg-gradient-to-r from-blue-400 to-blue-500 text-white"
                  : "bg-white/70 text-gray-600 border border-gray-200 hover:border-blue-300"
              }`}>
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">{(telegramStatus as any)?.linked ? "Telegram" : "Vincular"}</span>
            </button>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all text-xs sm:text-sm font-semibold">
              <Plus className="w-4 h-4" />
              <span className="hidden xs:inline">Nueva Nota</span>
            </button>
          </div>
        </div>

        {/* ===== ESTADISTICAS ===== */}
        {summary && (
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {[
              { label: "Abiertas", value: summary.open, icon: AlertTriangle, iconColor: "text-red-500", bgColor: "bg-red-100", borderColor: "border-red-200/50" },
              { label: "En Proceso", value: (summary.inReview || 0) + (summary.inProgress || 0), icon: Clock, iconColor: "text-amber-500", bgColor: "bg-amber-100", borderColor: "border-amber-200/50" },
              { label: "Resueltas", value: summary.resolved, icon: CheckCircle2, iconColor: "text-green-500", bgColor: "bg-green-100", borderColor: "border-green-200/50" },
              { label: "Criticas", value: summary.critical, icon: AlertTriangle, iconColor: "text-red-700", bgColor: "bg-red-100", borderColor: "border-red-300/50" },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label}
                  className={`relative overflow-hidden rounded-2xl border ${stat.borderColor} bg-white/50 backdrop-blur-sm p-2.5 sm:p-3.5 shadow-sm`}>
                  <div className="flex flex-col items-center sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl ${stat.bgColor} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.iconColor}`} />
                    </div>
                    <div className="text-center sm:text-left">
                      <p className="text-[10px] sm:text-xs text-gray-500 leading-tight">{stat.label}</p>
                      <p className="text-lg sm:text-xl font-bold text-gray-800">{stat.value}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ===== BARRA DE BUSQUEDA Y FILTROS ===== */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar por folio o descripcion..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200/80 rounded-xl bg-white/60 backdrop-blur-sm focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none shadow-sm" />
            </div>
            <button onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all shadow-sm ${
                showFilters || hasActiveFilters
                  ? "bg-green-50 border-green-300 text-green-700"
                  : "bg-white/60 border-gray-200/80 text-gray-600 hover:bg-white/80"
              }`}>
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Filtros</span>
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </button>
            {hasActiveFilters && (
              <button onClick={clearFilters}
                className="flex items-center gap-1 px-2.5 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-all shadow-sm">
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Limpiar</span>
              </button>
            )}
          </div>

          {/* Filtros desplegables */}
          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-2xl bg-white/40 backdrop-blur-sm border border-gray-200/50 shadow-sm">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/80 focus:ring-2 focus:ring-green-300 outline-none">
                <option value="">Todos los estados</option>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/80 focus:ring-2 focus:ring-green-300 outline-none">
                <option value="">Todas las categorias</option>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/80 focus:ring-2 focus:ring-green-300 outline-none">
                <option value="">Todas las prioridades</option>
                {PRIORITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* ===== FORMULARIO DE NUEVA NOTA ===== */}
        {showForm && (
          <div className="relative overflow-hidden rounded-2xl border border-green-200/50 bg-white/60 backdrop-blur-xl shadow-lg">
            {/* Barra superior verde */}
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-5 py-3 flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5" /> Nueva Observacion
              </h2>
              <button onClick={resetForm} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-5">
              {/* Categoria */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Categoria</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    const selected = form.category === cat.value;
                    return (
                      <button key={cat.value} onClick={() => setForm(prev => ({ ...prev, category: cat.value }))}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-xs font-medium transition-all ${
                          selected
                            ? `${cat.color} border-current shadow-md ring-2 ring-green-300/50`
                            : "bg-white/60 text-gray-500 border-gray-200 hover:bg-white hover:text-gray-700 hover:border-gray-300"
                        }`}>
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate leading-tight">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Prioridad */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Prioridad</label>
                <div className="grid grid-cols-4 gap-2">
                  {PRIORITIES.map(sev => (
                    <button key={sev.value} onClick={() => setForm(prev => ({ ...prev, severity: sev.value }))}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        form.severity === sev.value
                          ? `${sev.color} shadow-md ring-2 ring-green-300/50`
                          : "bg-white/60 text-gray-500 border-gray-200 hover:bg-white hover:text-gray-700"
                      }`}>
                      <span className={`w-2 h-2 rounded-full ${sev.dot}`} />
                      {sev.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descripcion */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Descripcion *</label>
                <textarea value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe lo que observaste con detalle..."
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none resize-none" />
              </div>

              {/* Parcela y GPS en una fila */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Parcela</label>
                  <select value={form.parcelId || ""} onChange={e => setForm(prev => ({ ...prev, parcelId: e.target.value ? Number(e.target.value) : undefined }))}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none">
                    <option value="">Sin parcela especifica</option>
                    {parcelsWithPolygon.map((p: any) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ubicacion GPS</label>
                  {form.latitude && form.longitude ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200">
                      <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-xs text-green-700 font-medium flex-1 truncate">{form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}</span>
                      <button onClick={() => captureGPS("form")} className="text-xs text-green-600 underline hover:text-green-800 flex-shrink-0">Actualizar</button>
                    </div>
                  ) : (
                    <button onClick={() => captureGPS("form")} disabled={gpsLoading}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 hover:border-green-400 hover:text-green-600 transition-all">
                      {gpsLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Obteniendo...</> : <><Navigation className="w-4 h-4" /> Capturar ubicacion</>}
                    </button>
                  )}
                  {gpsError && <p className="text-xs text-red-500 mt-1">{gpsError}</p>}
                </div>
              </div>

              {/* Foto obligatoria */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Foto de la observacion *</label>
                <input ref={formFileRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handlePhotoSelect(e.target.files[0], "form"); }} />
                {formPhotoPreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-gray-200">
                    <img src={formPhotoPreview} alt="Preview" className="w-full max-h-48 object-cover" />
                    <button onClick={() => { setFormPhotoPreview(null); setFormPhotoBase64(null); if (formFileRef.current) formFileRef.current.value = ""; }}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => formFileRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-green-300 text-green-600 hover:bg-green-50/50 transition-all">
                    <Camera className="w-8 h-8" />
                    <span className="text-sm font-medium">Tomar foto o seleccionar imagen</span>
                    <span className="text-xs text-gray-400">Obligatoria para crear la nota</span>
                  </button>
                )}
              </div>

              {/* Boton guardar */}
              <div className="flex justify-end gap-3 pt-1 border-t border-gray-100">
                <button onClick={resetForm}
                  className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all">
                  Cancelar
                </button>
                <button onClick={handleSubmit} disabled={createNote.isPending || !form.description.trim() || !formPhotoBase64}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
                  {createNote.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><Save className="w-4 h-4" /> Guardar Nota</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== LISTA DE NOTAS ===== */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-green-500" />
            <span className="text-gray-500 text-sm">Cargando notas de campo...</span>
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
              <ClipboardList className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-gray-500 font-medium">No hay notas de campo</p>
            <p className="text-sm text-gray-400">Crea una nueva nota para reportar observaciones</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs text-gray-400 font-medium px-1">
              {filteredNotes.length} nota{filteredNotes.length !== 1 ? "s" : ""} encontrada{filteredNotes.length !== 1 ? "s" : ""}
            </p>
            {filteredNotes.map((note: any) => {
              const cat = getCategoryInfo(note.category);
              const sev = getPriorityInfo(note.severity);
              const stat = getStatusInfo(note.status);
              const CatIcon = cat.icon;
              const StatIcon = stat.icon;
              const isExpanded = expandedId === note.id;
              const parcel = parcelsWithPolygon.find((p: any) => p.id === note.parcelId);
              const photos = note.photos || [];
              const reportPhotos = photos.filter((p: any) => p.stage === "reporte");
              const reviewPhotos = photos.filter((p: any) => p.stage === "revision");
              const resolutionPhotos = photos.filter((p: any) => p.stage === "resolucion");
              const isClosed = note.status === "resuelta" || note.status === "descartada";

              return (
                <div key={note.id}
                  className={`relative overflow-hidden rounded-2xl border bg-white/50 backdrop-blur-sm shadow-sm transition-all duration-200 hover:shadow-md cursor-pointer ${
                    isClosed ? "border-gray-200/40 opacity-75 hover:opacity-100" : "border-gray-200/60"
                  }`}
                  onClick={() => setExpandedId(isExpanded ? null : note.id)}>

                  {/* Indicador lateral de prioridad */}
                  {(note.severity === "critica" || note.severity === "alta") && !isClosed && (
                    <div className={`absolute top-0 left-0 w-1 h-full ${note.severity === "critica" ? "bg-red-500" : "bg-orange-400"}`} />
                  )}

                  {/* Contenido de la tarjeta */}
                  <div className="p-3.5 sm:p-4">
                    {/* Cabecera */}
                    <div className="flex items-start gap-3">
                      {/* Icono de categoria */}
                      <div className={`w-10 h-10 rounded-xl ${cat.color} flex items-center justify-center flex-shrink-0`}>
                        <CatIcon className="w-5 h-5" />
                      </div>

                      {/* Info principal */}
                      <div className="flex-1 min-w-0">
                        {/* Badges en fila */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-gray-100 text-gray-600 border border-gray-200/80">
                            <Hash className="w-3 h-3" />{note.folio}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${stat.color}`}>
                            <StatIcon className="w-3 h-3" />{stat.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium border ${sev.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />{sev.label}
                          </span>
                        </div>

                        {/* Descripcion */}
                        <p className="text-sm text-gray-700 mt-1.5 line-clamp-2 leading-relaxed">{note.description}</p>

                        {/* Meta info */}
                        <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                          {parcel && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                              <MapPin className="w-3 h-3" />{parcel.code}
                            </span>
                          )}
                          {photos.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                              <ImageIcon className="w-3 h-3" />{photos.length}
                            </span>
                          )}
                          {note.reportedByName && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                              <User className="w-3 h-3" />{note.reportedByName}
                            </span>
                          )}
                          <span className="text-[11px] text-gray-400">{toShortDate(note.createdAt)}</span>
                        </div>
                      </div>

                      {/* Foto miniatura + chevron */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {reportPhotos.length > 0 && !isExpanded && (
                          <img src={reportPhotos[0].photoPath} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200/80 hidden sm:block" />
                        )}
                        <div className="text-gray-400">
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      </div>
                    </div>

                    {/* ===== DETALLE EXPANDIDO ===== */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                        {/* Descripcion completa */}
                        <p className="text-sm text-gray-600 mb-4 whitespace-pre-wrap leading-relaxed">{note.description}</p>

                        {/* Fotos por etapa */}
                        {reportPhotos.length > 0 && (
                          <div className="mb-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <Camera className="w-3.5 h-3.5" /> Fotos del reporte
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {reportPhotos.map((p: any) => (
                                <a key={p.id} href={p.photoPath} target="_blank" rel="noopener noreferrer"
                                  className="block rounded-xl overflow-hidden border border-gray-200 hover:border-gray-300 transition-colors">
                                  <img src={p.photoPath} alt="Reporte" className="w-full h-28 sm:h-32 object-cover hover:scale-105 transition-transform duration-300" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {reviewPhotos.length > 0 && (
                          <div className="mb-4">
                            <p className="text-xs font-semibold text-yellow-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <Eye className="w-3.5 h-3.5" /> Fotos de revision
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {reviewPhotos.map((p: any) => (
                                <a key={p.id} href={p.photoPath} target="_blank" rel="noopener noreferrer"
                                  className="block rounded-xl overflow-hidden border border-yellow-200 hover:border-yellow-300 transition-colors">
                                  <img src={p.photoPath} alt="Revision" className="w-full h-28 sm:h-32 object-cover hover:scale-105 transition-transform duration-300" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {resolutionPhotos.length > 0 && (
                          <div className="mb-4">
                            <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Fotos de resolucion
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {resolutionPhotos.map((p: any) => (
                                <a key={p.id} href={p.photoPath} target="_blank" rel="noopener noreferrer"
                                  className="block rounded-xl overflow-hidden border border-green-200 hover:border-green-300 transition-colors">
                                  <img src={p.photoPath} alt="Resolucion" className="w-full h-28 sm:h-32 object-cover hover:scale-105 transition-transform duration-300" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Info adicional: GPS y Parcela */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                          {note.latitude && note.longitude && (
                            <a href={`https://www.google.com/maps?q=${note.latitude},${note.longitude}`} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 p-2.5 rounded-xl bg-white/70 border border-gray-200/80 hover:border-blue-300 hover:bg-blue-50/30 transition-all group">
                              <MapPin className="w-4 h-4 text-blue-500 group-hover:text-blue-600" />
                              <span className="text-xs text-gray-600 group-hover:text-blue-600 font-medium">GPS Reporte</span>
                              <span className="text-[10px] text-gray-400 ml-auto">{Number(note.latitude).toFixed(4)}, {Number(note.longitude).toFixed(4)}</span>
                            </a>
                          )}
                          {note.resolvedLatitude && note.resolvedLongitude && (
                            <a href={`https://www.google.com/maps?q=${note.resolvedLatitude},${note.resolvedLongitude}`} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 p-2.5 rounded-xl bg-green-50/50 border border-green-200/80 hover:border-green-300 transition-all group">
                              <MapPin className="w-4 h-4 text-green-500 group-hover:text-green-600" />
                              <span className="text-xs text-gray-600 group-hover:text-green-600 font-medium">GPS Resolucion</span>
                              <span className="text-[10px] text-gray-400 ml-auto">{Number(note.resolvedLatitude).toFixed(4)}, {Number(note.resolvedLongitude).toFixed(4)}</span>
                            </a>
                          )}
                          {parcel && (
                            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/70 border border-gray-200/80">
                              <MapPin className="w-4 h-4 text-green-500" />
                              <span className="text-xs text-gray-600 font-medium">{parcel.code} - {parcel.name}</span>
                            </div>
                          )}
                          {note.createdAt && (
                            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/70 border border-gray-200/80">
                              <Clock className="w-4 h-4 text-gray-400" />
                              <span className="text-xs text-gray-600 font-medium">Creada: {toDateStr(note.createdAt)}</span>
                            </div>
                          )}
                        </div>

                        {/* Notas de resolucion */}
                        {note.resolutionNotes && (
                          <div className="mb-4 p-3 rounded-xl bg-green-50/70 border border-green-200/80">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 mb-1.5">
                              <MessageSquare className="w-3.5 h-3.5" /> Notas de resolucion
                            </div>
                            <p className="text-sm text-green-800 leading-relaxed">{note.resolutionNotes}</p>
                            {note.resolvedAt && <p className="text-[11px] text-green-600 mt-1.5">Resuelta: {toDateStr(note.resolvedAt)}</p>}
                          </div>
                        )}

                        {/* Acciones de estado */}
                        {!isClosed && (
                          <div className="mb-3">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Cambiar estado</label>
                            <div className="flex flex-wrap gap-2">
                              {STATUSES.filter(s => s.value !== note.status && s.value !== "abierta").map(s => {
                                const SIcon = s.icon;
                                return (
                                  <button key={s.value} onClick={() => handleStatusChange(note.id, s.value)}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border hover:shadow-md active:scale-95 ${s.color}`}>
                                    <SIcon className="w-3.5 h-3.5" />{s.label}
                                    {needsPhotoForStatus(s.value) && <Camera className="w-3 h-3 ml-0.5 opacity-60" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Eliminar */}
                        {(user?.role === "admin" || note.reportedByUserId === user?.id) && (
                          <div className="flex justify-end pt-2 border-t border-gray-100/50">
                            <button onClick={() => { if (confirm("Eliminar esta nota de campo?")) deleteNote.mutate({ id: note.id }); }}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all">
                              <Trash2 className="w-3.5 h-3.5" /> Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== MODAL DE CAMBIO DE ESTADO ===== */}
      {statusModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeStatusModal}>
          <div className="relative w-full sm:max-w-md bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            {/* Header del modal */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10 sm:rounded-t-2xl">
              <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                {(() => { const s = getStatusInfo(statusModal.status); const SIcon = s.icon; return <><SIcon className="w-5 h-5" /> Cambiar a: {s.label}</>; })()}
              </h3>
              <button onClick={closeStatusModal} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Foto requerida */}
              {needsPhotoForStatus(statusModal.status) && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Foto de evidencia *
                  </label>
                  <input ref={modalFileRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => { if (e.target.files?.[0]) handlePhotoSelect(e.target.files[0], "modal"); }} />
                  {modalPhotoPreview ? (
                    <div className="relative rounded-xl overflow-hidden border border-gray-200">
                      <img src={modalPhotoPreview} alt="Preview" className="w-full max-h-40 object-cover" />
                      <button onClick={() => { setModalPhotoPreview(null); setModalPhotoBase64(null); if (modalFileRef.current) modalFileRef.current.value = ""; }}
                        className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => modalFileRef.current?.click()}
                      className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-green-300 text-green-600 hover:bg-green-50/50 transition-all">
                      <Camera className="w-6 h-6" />
                      <span className="text-sm font-medium">Tomar foto</span>
                    </button>
                  )}
                </div>
              )}

              {/* GPS requerido para resolucion */}
              {needsGpsForStatus(statusModal.status) && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ubicacion GPS *</label>
                  {modalGps ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200">
                      <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-xs text-green-700 font-medium flex-1">{modalGps.lat.toFixed(6)}, {modalGps.lng.toFixed(6)}</span>
                      <button onClick={() => captureGPS("modal")} className="text-xs text-green-600 underline hover:text-green-800 flex-shrink-0">Actualizar</button>
                    </div>
                  ) : (
                    <button onClick={() => captureGPS("modal")} disabled={modalGpsLoading}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 hover:border-green-400 hover:text-green-600 transition-all">
                      {modalGpsLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Obteniendo...</> : <><Navigation className="w-4 h-4" /> Capturar ubicacion</>}
                    </button>
                  )}
                </div>
              )}

              {/* Notas */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  {statusModal.status === "resuelta" ? "Notas de resolucion" : statusModal.status === "descartada" ? "Motivo de descarte" : "Comentarios"} (opcional)
                </label>
                <textarea value={modalResolutionNotes} onChange={e => setModalResolutionNotes(e.target.value)}
                  placeholder={statusModal.status === "resuelta" ? "Como se resolvio?" : statusModal.status === "descartada" ? "Por que se descarta?" : "Comentarios adicionales..."}
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none resize-none" />
              </div>

              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button onClick={closeStatusModal}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 text-sm transition-all">
                  Cancelar
                </button>
                <button onClick={confirmStatusChange} disabled={updateStatus.isPending}
                  className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50 bg-gradient-to-r from-green-500 to-emerald-600 shadow-lg hover:shadow-xl active:scale-[0.98]">
                  {updateStatus.isPending ? "Guardando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL TELEGRAM ===== */}
      {showTelegramModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => { setShowTelegramModal(false); setLinkCode(null); }}>
          <div className="w-full sm:max-w-md bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-400 to-blue-500 px-5 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Send className="w-5 h-5" /> Telegram
              </h3>
              <button onClick={() => { setShowTelegramModal(false); setLinkCode(null); }}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              {(telegramStatus as any)?.linked ? (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Send className="w-6 h-6 text-blue-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800">Cuenta vinculada</p>
                        {(telegramStatus as any)?.username && (
                          <p className="text-sm text-blue-600 truncate">@{(telegramStatus as any).username}</p>
                        )}
                        <p className="text-[11px] text-gray-500 mt-0.5">Vinculado {toDateStr((telegramStatus as any)?.linkedAt)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <p className="text-sm text-green-800 font-medium mb-2">Puedes hacer desde Telegram:</p>
                    <ul className="text-sm text-green-700 space-y-1.5">
                      <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#8226;</span>Enviar /nota para crear una nota de campo</li>
                      <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#8226;</span>Enviar una foto directamente para reportar</li>
                      <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#8226;</span>Recibir notificaciones de actualizaciones</li>
                      <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#8226;</span>Ver tus notas con /misnotas</li>
                    </ul>
                  </div>
                  <button onClick={() => unlinkTelegram.mutate()}
                    disabled={unlinkTelegram.isPending}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 text-red-600 font-medium hover:bg-red-50 text-sm transition-all">
                    <Unlink className="w-4 h-4" /> Desvincular Telegram
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Vincula tu cuenta de Telegram para crear notas de campo directamente desde el chat y recibir notificaciones.
                  </p>

                  {!linkCode ? (
                    <button onClick={() => generateCode.mutate()}
                      disabled={generateCode.isPending}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-blue-400 to-blue-500 text-white font-semibold shadow-lg hover:shadow-xl transition-all text-sm active:scale-[0.98]">
                      {generateCode.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                      Generar codigo de vinculacion
                    </button>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                        <p className="text-xs text-gray-500 mb-2">Tu codigo de vinculacion (expira en 10 min):</p>
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-3xl font-mono font-bold tracking-widest text-blue-700">{linkCode}</span>
                          <button onClick={() => { navigator.clipboard.writeText(`/vincular ${linkCode}`); setCodeCopied(true); toast.success("Copiado"); }}
                            className="p-2 rounded-lg hover:bg-blue-100 text-blue-500 transition-all">
                            {codeCopied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                        <p className="text-sm font-medium text-gray-700 mb-2">Instrucciones:</p>
                        <ol className="text-sm text-gray-600 space-y-1.5">
                          <li>1. Abre Telegram y busca el bot de AGRA-TECTI</li>
                          <li>2. Envia <code className="bg-gray-200 px-1.5 py-0.5 rounded text-xs font-mono">/start</code></li>
                          <li>3. Envia <code className="bg-gray-200 px-1.5 py-0.5 rounded text-xs font-mono">/vincular {linkCode}</code></li>
                          <li>4. Listo! Ya puedes crear notas desde Telegram</li>
                        </ol>
                      </div>
                      <button onClick={() => { generateCode.mutate(); }}
                        className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium py-2">
                        Generar nuevo codigo
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
