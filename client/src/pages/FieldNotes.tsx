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
} from "lucide-react";

// ===== CONSTANTES =====

const CATEGORIES = [
  { value: "arboles_mal_plantados", label: "Arboles mal plantados", icon: TreePine, color: "text-green-600 bg-green-50" },
  { value: "plaga_enfermedad", label: "Plaga / Enfermedad", icon: Bug, color: "text-red-600 bg-red-50" },
  { value: "riego_drenaje", label: "Riego / Drenaje", icon: Droplets, color: "text-blue-600 bg-blue-50" },
  { value: "dano_mecanico", label: "Dano mecanico", icon: Wrench, color: "text-orange-600 bg-orange-50" },
  { value: "maleza", label: "Maleza", icon: Leaf, color: "text-lime-600 bg-lime-50" },
  { value: "fertilizacion", label: "Fertilizacion", icon: FlaskConical, color: "text-amber-600 bg-amber-50" },
  { value: "suelo", label: "Suelo", icon: Mountain, color: "text-yellow-600 bg-yellow-50" },
  { value: "infraestructura", label: "Infraestructura", icon: Building2, color: "text-gray-600 bg-gray-50" },
  { value: "fauna", label: "Fauna", icon: PawPrint, color: "text-teal-600 bg-teal-50" },
  { value: "otro", label: "Otro", icon: HelpCircle, color: "text-slate-600 bg-slate-50" },
];

const SEVERITIES = [
  { value: "baja", label: "Baja", color: "text-blue-600 bg-blue-50 border-blue-200" },
  { value: "media", label: "Media", color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  { value: "alta", label: "Alta", color: "text-orange-600 bg-orange-50 border-orange-200" },
  { value: "critica", label: "Critica", color: "text-red-600 bg-red-50 border-red-200" },
];

const STATUSES = [
  { value: "abierta", label: "Abierta", icon: AlertTriangle, color: "text-red-600 bg-red-50 border-red-200" },
  { value: "en_revision", label: "En revision", icon: Eye, color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  { value: "en_progreso", label: "En progreso", icon: Clock, color: "text-blue-600 bg-blue-50 border-blue-200" },
  { value: "resuelta", label: "Resuelta", icon: CheckCircle2, color: "text-green-600 bg-green-50 border-green-200" },
  { value: "descartada", label: "Descartada", icon: X, color: "text-gray-600 bg-gray-50 border-gray-200" },
];

const getCategoryInfo = (v: string) => CATEGORIES.find(c => c.value === v) || CATEGORIES[9];
const getSeverityInfo = (v: string) => SEVERITIES.find(s => s.value === v) || SEVERITIES[1];
const getStatusInfo = (v: string) => STATUSES.find(s => s.value === v) || STATUSES[0];

function toDateStr(val: any): string {
  if (!val) return "";
  const d = val instanceof Date ? val : new Date(val);
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // Remove data:image/...;base64, prefix
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
  const [filterSeverity, setFilterSeverity] = useState("");

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
    // Auto-capture GPS for resolution
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
          <div className="flex items-center gap-2">
            <button onClick={() => setShowTelegramModal(true)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all text-sm font-semibold ${
                (telegramStatus as any)?.linked
                  ? "bg-gradient-to-r from-blue-400 to-blue-500 text-white"
                  : "bg-white/70 text-gray-600 border border-gray-200 hover:border-blue-300"
              }`}>
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">{(telegramStatus as any)?.linked ? "Telegram" : "Vincular Telegram"}</span>
            </button>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all text-sm font-semibold">
              <Plus className="w-4 h-4" /> Nueva Nota
            </button>
          </div>
        </div>

        {/* Estadisticas */}
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
                <div><p className="text-xs text-gray-500">Criticas</p><p className="text-xl font-bold text-red-700">{summary.critical}</p></div>
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
              <input type="text" placeholder="Buscar por folio o descripcion..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none">
              <option value="">Todos los estados</option>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 outline-none">
              <option value="">Todas las categorias</option>
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
                <Plus className="w-5 h-5 text-green-500" /> Nueva Observacion
              </h2>
              <button onClick={resetForm} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="space-y-5">
              {/* Categoria */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Categoria</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    const selected = form.category === cat.value;
                    return (
                      <button key={cat.value} onClick={() => setForm(prev => ({ ...prev, category: cat.value }))}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                          selected ? `${cat.color} border-current shadow-md ring-2 ring-green-300` : "bg-white/60 text-gray-500 border-gray-200 hover:bg-white hover:text-gray-700"
                        }`}>
                        <Icon className="w-4 h-4 flex-shrink-0" /><span className="truncate">{cat.label}</span>
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
                    <button key={sev.value} onClick={() => setForm(prev => ({ ...prev, severity: sev.value }))}
                      className={`py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        form.severity === sev.value ? `${sev.color} shadow-md ring-2 ring-green-300` : "bg-white/60 text-gray-500 border-gray-200 hover:bg-white hover:text-gray-700"
                      }`}>{sev.label}</button>
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

              {/* Parcela y GPS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      <span className="text-xs text-green-700 font-medium flex-1">{form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}</span>
                      <button onClick={() => captureGPS("form")} className="text-xs text-green-600 underline hover:text-green-800">Actualizar</button>
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
                  <div className="relative">
                    <img src={formPhotoPreview} alt="Preview" className="w-full max-h-48 object-cover rounded-xl border border-gray-200" />
                    <button onClick={() => { setFormPhotoPreview(null); setFormPhotoBase64(null); if (formFileRef.current) formFileRef.current.value = ""; }}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button onClick={() => formFileRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-green-300 text-green-600 hover:bg-green-50 transition-all">
                    <Camera className="w-8 h-8" />
                    <span className="text-sm font-medium">Tomar foto o seleccionar imagen</span>
                    <span className="text-xs text-gray-400">Obligatoria para crear la nota</span>
                  </button>
                )}
              </div>

              {/* Boton guardar */}
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={resetForm} className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all">Cancelar</button>
                <button onClick={handleSubmit} disabled={createNote.isPending || !form.description.trim() || !formPhotoBase64}
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
              const photos = note.photos || [];
              const reportPhotos = photos.filter((p: any) => p.stage === "reporte");
              const reviewPhotos = photos.filter((p: any) => p.stage === "revision");
              const resolutionPhotos = photos.filter((p: any) => p.stage === "resolucion");

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
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-700 border border-gray-200">
                          <Hash className="w-3 h-3" />{note.folio}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${stat.color}`}>
                          <StatIcon className="w-3 h-3" />{stat.label}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium border ${sev.color}`}>{sev.label}</span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1.5 line-clamp-2">{note.description}</p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {parcel && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500"><MapPin className="w-3 h-3" />{parcel.code}</span>
                        )}
                        {photos.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500"><ImageIcon className="w-3 h-3" />{photos.length} foto{photos.length > 1 ? "s" : ""}</span>
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
                      <p className="text-sm text-gray-600 mb-4 whitespace-pre-wrap leading-relaxed">{note.description}</p>

                      {/* Fotos por etapa */}
                      {reportPhotos.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Fotos del reporte</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {reportPhotos.map((p: any) => (
                              <a key={p.id} href={p.photoPath} target="_blank" rel="noopener noreferrer">
                                <img src={p.photoPath} alt="Reporte" className="w-full h-32 object-cover rounded-xl border border-gray-200 hover:opacity-80 transition-opacity" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {reviewPhotos.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs font-semibold text-yellow-600 uppercase tracking-wider mb-2">Fotos de revision</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {reviewPhotos.map((p: any) => (
                              <a key={p.id} href={p.photoPath} target="_blank" rel="noopener noreferrer">
                                <img src={p.photoPath} alt="Revision" className="w-full h-32 object-cover rounded-xl border border-yellow-200 hover:opacity-80 transition-opacity" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {resolutionPhotos.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">Fotos de resolucion</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {resolutionPhotos.map((p: any) => (
                              <a key={p.id} href={p.photoPath} target="_blank" rel="noopener noreferrer">
                                <img src={p.photoPath} alt="Resolucion" className="w-full h-32 object-cover rounded-xl border border-green-200 hover:opacity-80 transition-opacity" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Info adicional */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                        {note.latitude && note.longitude && (
                          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/60 border border-gray-100">
                            <MapPin className="w-4 h-4 text-green-600" />
                            <a href={`https://www.google.com/maps?q=${note.latitude},${note.longitude}`} target="_blank" rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline font-medium">GPS Reporte</a>
                          </div>
                        )}
                        {note.resolvedLatitude && note.resolvedLongitude && (
                          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-green-50 border border-green-200">
                            <MapPin className="w-4 h-4 text-green-600" />
                            <a href={`https://www.google.com/maps?q=${note.resolvedLatitude},${note.resolvedLongitude}`} target="_blank" rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline font-medium">GPS Resolucion</a>
                          </div>
                        )}
                        {parcel && (
                          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/60 border border-gray-100">
                            <MapPin className="w-4 h-4 text-green-600" />
                            <span className="text-sm text-gray-600">{parcel.code} - {parcel.name}</span>
                          </div>
                        )}
                      </div>

                      {/* Notas de resolucion */}
                      {note.resolutionNotes && (
                        <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 mb-1">
                            <MessageSquare className="w-3.5 h-3.5" /> Resolucion
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
                                  <SIcon className="w-3.5 h-3.5" />{s.label}
                                  {needsPhotoForStatus(s.value) && <Camera className="w-3 h-3 ml-1" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Eliminar */}
                      {(user?.role === "admin" || note.reportedByUserId === user?.id) && (
                        <div className="flex justify-end pt-2">
                          <button onClick={() => { if (confirm("Eliminar esta nota de campo?")) deleteNote.mutate({ id: note.id }); }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-all">
                            <Trash2 className="w-3.5 h-3.5" /> Eliminar
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

      {/* Modal de cambio de estado */}
      {statusModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeStatusModal}>
          <div className="relative overflow-hidden rounded-3xl border border-green-200/30 bg-white/95 backdrop-blur-xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              {(() => { const s = getStatusInfo(statusModal.status); const SIcon = s.icon; return <><SIcon className="w-5 h-5" /> {s.label}</>; })()}
            </h3>

            <div className="space-y-4">
              {/* Foto requerida */}
              {needsPhotoForStatus(statusModal.status) && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Foto de evidencia *
                  </label>
                  <input ref={modalFileRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => { if (e.target.files?.[0]) handlePhotoSelect(e.target.files[0], "modal"); }} />
                  {modalPhotoPreview ? (
                    <div className="relative">
                      <img src={modalPhotoPreview} alt="Preview" className="w-full max-h-40 object-cover rounded-xl border border-gray-200" />
                      <button onClick={() => { setModalPhotoPreview(null); setModalPhotoBase64(null); if (modalFileRef.current) modalFileRef.current.value = ""; }}
                        className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600"><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <button onClick={() => modalFileRef.current?.click()}
                      className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-green-300 text-green-600 hover:bg-green-50 transition-all">
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
                      <button onClick={() => captureGPS("modal")} className="text-xs text-green-600 underline hover:text-green-800">Actualizar</button>
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
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white/70 focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none resize-none" />
              </div>

              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button onClick={closeStatusModal}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 text-sm transition-all">Cancelar</button>
                <button onClick={confirmStatusChange} disabled={updateStatus.isPending}
                  className="flex-1 py-2.5 rounded-xl text-white font-medium text-sm transition-all disabled:opacity-50 bg-gradient-to-r from-green-500 to-emerald-600 shadow-lg">
                  {updateStatus.isPending ? "Guardando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Telegram */}
      {showTelegramModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Send className="w-5 h-5 text-blue-500" /> Telegram
                </h3>
                <button onClick={() => { setShowTelegramModal(false); setLinkCode(null); }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-5 h-5" /></button>
              </div>

              {(telegramStatus as any)?.linked ? (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <Send className="w-6 h-6 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">Cuenta vinculada</p>
                        {(telegramStatus as any)?.username && (
                          <p className="text-sm text-blue-600">@{(telegramStatus as any).username}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-0.5">Vinculado {toDateStr((telegramStatus as any)?.linkedAt)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <p className="text-sm text-green-800 font-medium mb-2">Puedes hacer desde Telegram:</p>
                    <ul className="text-sm text-green-700 space-y-1">
                      <li>\u2022 Enviar /nota para crear una nota de campo</li>
                      <li>\u2022 Enviar una foto directamente para reportar</li>
                      <li>\u2022 Recibir notificaciones cuando tus notas se actualicen</li>
                      <li>\u2022 Ver tus notas con /misnotas</li>
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
                  <p className="text-sm text-gray-600">
                    Vincula tu cuenta de Telegram para crear notas de campo directamente desde el chat y recibir notificaciones.
                  </p>

                  {!linkCode ? (
                    <button onClick={() => generateCode.mutate()}
                      disabled={generateCode.isPending}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-blue-400 to-blue-500 text-white font-semibold shadow-lg hover:shadow-xl transition-all text-sm">
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
                        className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium">
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
