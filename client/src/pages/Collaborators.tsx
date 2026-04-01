import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import { ProtectedPage } from "@/components/ProtectedPage";
import { toast } from "sonner";
import {
  Users, Plus, Search, Edit2, X, Save, Phone, UserCheck, UserX,
  Link2, Unlink, Copy, Clock, CheckCircle2, AlertCircle, ChevronDown,
  ChevronUp, ClipboardList, Send, Trash2, RefreshCw, MessageCircle,
} from "lucide-react";

// ===== CONSTANTES =====
const ROLES_SUGERIDOS = [
  "Jornalero", "Caporal", "Operador de maquinaria", "Regador",
  "Fumigador", "Podador", "Supervisor", "Chofer", "Otro",
];

const ACTIVITY_TYPES: Record<string, { label: string; emoji: string }> = {
  riego: { label: "Riego", emoji: "💧" },
  fertilizacion: { label: "Fertilización", emoji: "🧪" },
  nutricion: { label: "Nutrición", emoji: "🌱" },
  poda: { label: "Poda", emoji: "✂️" },
  control_maleza: { label: "Control de maleza", emoji: "🌿" },
  control_plagas: { label: "Control de plagas", emoji: "🐛" },
  aplicacion_fitosanitaria: { label: "Aplicación fitosanitaria", emoji: "🧴" },
  otro: { label: "Otro", emoji: "📋" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pendiente: { label: "Pendiente", color: "yellow" },
  en_progreso: { label: "En progreso", color: "blue" },
  completada: { label: "Completada", color: "green" },
  cancelada: { label: "Cancelada", color: "red" },
};

export default function Collaborators() {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showAssignModal, setShowAssignModal] = useState<number | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formRole, setFormRole] = useState("");

  // Queries
  const collabQuery = trpc.collaborators.list.useQuery();
  const activitiesQuery = trpc.fieldNotebook.list.useQuery({});

  // Mutations
  const createMut = trpc.collaborators.create.useMutation({
    onSuccess: () => { collabQuery.refetch(); toast.success("Colaborador agregado"); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.collaborators.update.useMutation({
    onSuccess: () => { collabQuery.refetch(); toast.success("Colaborador actualizado"); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.collaborators.delete.useMutation({
    onSuccess: () => { collabQuery.refetch(); toast.success("Colaborador desactivado"); },
    onError: (e) => toast.error(e.message),
  });
  const genCodeMut = trpc.collaborators.generateLinkCode.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const unlinkMut = trpc.collaborators.unlinkTelegram.useMutation({
    onSuccess: () => { collabQuery.refetch(); toast.success("Telegram desvinculado"); },
    onError: (e) => toast.error(e.message),
  });
  const assignMut = trpc.collaborators.assignTask.useMutation({
    onSuccess: () => { collabQuery.refetch(); toast.success("Tarea asignada"); setShowAssignModal(null); },
    onError: (e) => toast.error(e.message),
  });
  const unassignMut = trpc.collaborators.unassignTask.useMutation({
    onSuccess: () => { collabQuery.refetch(); toast.success("Asignación eliminada"); },
    onError: (e) => toast.error(e.message),
  });

  const collaborators = useMemo(() => {
    let list = collabQuery.data || [];
    if (!showInactive) list = list.filter((c: any) => c.isActive);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((c: any) =>
        c.name.toLowerCase().includes(s) ||
        (c.role || "").toLowerCase().includes(s) ||
        (c.phone || "").includes(s)
      );
    }
    return list;
  }, [collabQuery.data, showInactive, search]);

  const stats = useMemo(() => {
    const all = collabQuery.data || [];
    return {
      total: all.filter((c: any) => c.isActive).length,
      linked: all.filter((c: any) => c.isActive && c.telegramChatId).length,
      inactive: all.filter((c: any) => !c.isActive).length,
    };
  }, [collabQuery.data]);

  function resetForm() {
    setFormName(""); setFormPhone(""); setFormRole("");
    setShowForm(false); setEditingId(null);
  }

  function startEdit(collab: any) {
    setFormName(collab.name);
    setFormPhone(collab.phone || "");
    setFormRole(collab.role || "");
    setEditingId(collab.id);
    setShowForm(true);
  }

  function handleSubmit() {
    if (!formName.trim()) { toast.error("El nombre es requerido"); return; }
    if (editingId) {
      updateMut.mutate({ id: editingId, name: formName.trim(), phone: formPhone.trim(), role: formRole.trim() });
    } else {
      createMut.mutate({ name: formName.trim(), phone: formPhone.trim(), role: formRole.trim() });
    }
  }

  async function handleGenerateCode(collaboratorId: number) {
    const result = await genCodeMut.mutateAsync({ collaboratorId });
    if (result.code) {
      try { await navigator.clipboard.writeText(result.code); } catch {}
      toast.success(`Código: ${result.code} (copiado al portapapeles)`, { duration: 10000 });
    }
  }

  return (
    <ProtectedPage permission="canViewCollaborators">
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 p-4 md:p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-green-900 flex items-center gap-2">
                <Users className="w-7 h-7 text-green-600" />
                Colaboradores de Campo
              </h1>
              <p className="text-green-600 text-sm mt-1">
                Gestiona tu equipo de trabajo y asigna tareas
              </p>
            </div>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all hover:scale-105"
            >
              <Plus className="w-5 h-5" />
              Agregar Colaborador
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <GlassCard className="p-4 text-center" hover={false}>
            <div className="text-2xl font-bold text-green-800">{stats.total}</div>
            <div className="text-xs text-green-600 mt-1">Activos</div>
          </GlassCard>
          <GlassCard className="p-4 text-center" hover={false}>
            <div className="text-2xl font-bold text-blue-800">{stats.linked}</div>
            <div className="text-xs text-blue-600 mt-1">Con Telegram</div>
          </GlassCard>
          <GlassCard className="p-4 text-center" hover={false}>
            <div className="text-2xl font-bold text-gray-500">{stats.inactive}</div>
            <div className="text-xs text-gray-400 mt-1">Inactivos</div>
          </GlassCard>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, rol o teléfono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-green-200 bg-white/80 backdrop-blur focus:ring-2 focus:ring-green-400 focus:border-transparent text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-green-700 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-green-300 text-green-600 focus:ring-green-500"
            />
            Mostrar inactivos
          </label>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4" onClick={() => resetForm()}>
            <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-gradient-to-r from-green-600 to-emerald-600 text-white p-4 rounded-t-2xl flex items-center justify-between">
                <h2 className="text-lg font-bold">{editingId ? "Editar Colaborador" : "Nuevo Colaborador"}</h2>
                <button onClick={resetForm} className="p-1 hover:bg-white/20 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-green-800 mb-1">Nombre completo *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ej: Juan Pérez López"
                    className="w-full px-4 py-2.5 rounded-xl border border-green-200 focus:ring-2 focus:ring-green-400 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-green-800 mb-1">Teléfono</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                    <input
                      type="tel"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="Ej: 6121234567"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-green-200 focus:ring-2 focus:ring-green-400 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-green-800 mb-1">Rol / Puesto</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-green-200 focus:ring-2 focus:ring-green-400 focus:border-transparent bg-white"
                  >
                    <option value="">Seleccionar rol...</option>
                    {ROLES_SUGERIDOS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={resetForm}
                    className="flex-1 px-4 py-2.5 border border-green-200 text-green-700 rounded-xl hover:bg-green-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={createMut.isPending || updateMut.isPending}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {editingId ? "Guardar" : "Agregar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Assign Task Modal */}
        {showAssignModal !== null && (
          <AssignTaskModal
            collaboratorId={showAssignModal}
            activities={(activitiesQuery.data as any)?.activities || []}
            onAssign={(activityId) => assignMut.mutate({ activityId, collaboratorId: showAssignModal })}
            onClose={() => setShowAssignModal(null)}
            isPending={assignMut.isPending}
          />
        )}

        {/* Collaborators List */}
        {collabQuery.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-green-400 animate-spin" />
          </div>
        ) : collaborators.length === 0 ? (
          <GlassCard className="p-12 text-center" hover={false}>
            <Users className="w-16 h-16 text-green-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-green-800 mb-2">
              {search ? "Sin resultados" : "Sin colaboradores"}
            </h3>
            <p className="text-green-600 text-sm">
              {search ? "Intenta con otra búsqueda" : "Agrega tu primer colaborador para empezar"}
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {collaborators.map((collab: any) => (
              <CollaboratorCard
                key={collab.id}
                collab={collab}
                isExpanded={expandedId === collab.id}
                onToggle={() => setExpandedId(expandedId === collab.id ? null : collab.id)}
                onEdit={() => startEdit(collab)}
                onDelete={() => { if (confirm("¿Desactivar este colaborador?")) deleteMut.mutate({ id: collab.id }); }}
                onReactivate={() => updateMut.mutate({ id: collab.id, name: collab.name, isActive: true })}
                onGenerateCode={() => handleGenerateCode(collab.id)}
                onUnlink={() => { if (confirm("¿Desvincular Telegram?")) unlinkMut.mutate({ collaboratorId: collab.id }); }}
                onAssignTask={() => setShowAssignModal(collab.id)}
                onUnassign={(assignmentId: number) => { if (confirm("¿Eliminar esta asignación?")) unassignMut.mutate({ assignmentId }); }}
              />
            ))}
          </div>
        )}
      </div>
    </ProtectedPage>
  );
}

// ===== COLLABORATOR CARD =====
function CollaboratorCard({
  collab, isExpanded, onToggle, onEdit, onDelete, onReactivate,
  onGenerateCode, onUnlink, onAssignTask, onUnassign,
}: {
  collab: any; isExpanded: boolean; onToggle: () => void; onEdit: () => void;
  onDelete: () => void; onReactivate: () => void; onGenerateCode: () => void;
  onUnlink: () => void; onAssignTask: () => void; onUnassign: (id: number) => void;
}) {
  const assignQuery = trpc.collaborators.getAssignments.useQuery(
    { collaboratorId: collab.id },
    { enabled: isExpanded }
  );

  const isLinked = !!collab.telegramChatId;
  const activeAssignments = (assignQuery.data || []).filter((a: any) => a.status === "pendiente" || a.status === "en_progreso");

  return (
    <div className={`bg-white/80 backdrop-blur border rounded-2xl shadow-sm transition-all ${!collab.isActive ? "opacity-60" : "hover:shadow-md"} ${isExpanded ? "ring-2 ring-green-300" : "border-green-100"}`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={onToggle}>
        {/* Avatar */}
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ${isLinked ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white" : "bg-gradient-to-br from-green-100 to-emerald-100 text-green-700"}`}>
          {collab.name.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-green-900 truncate">{collab.name}</h3>
            {!collab.isActive && (
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Inactivo</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-green-600 mt-0.5">
            {collab.role && <span className="bg-green-50 px-2 py-0.5 rounded-full">{collab.role}</span>}
            {collab.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{collab.phone}</span>}
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2 shrink-0">
          {isLinked ? (
            <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full">
              <MessageCircle className="w-3 h-3" />
              <span className="hidden sm:inline">@{collab.telegramUsername}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-gray-50 text-gray-500 rounded-full">
              <Unlink className="w-3 h-3" />
              <span className="hidden sm:inline">Sin vincular</span>
            </span>
          )}
          {activeAssignments.length > 0 && (
            <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full">
              <ClipboardList className="w-3 h-3" />
              {activeAssignments.length}
            </span>
          )}
          {isExpanded ? <ChevronUp className="w-5 h-5 text-green-400" /> : <ChevronDown className="w-5 h-5 text-green-400" />}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-green-100 p-4 space-y-4">
          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors">
              <Edit2 className="w-3.5 h-3.5" /> Editar
            </button>
            {isLinked ? (
              <button onClick={onUnlink} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">
                <Unlink className="w-3.5 h-3.5" /> Desvincular Telegram
              </button>
            ) : (
              <button onClick={onGenerateCode} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">
                <Link2 className="w-3.5 h-3.5" /> Vincular Telegram
              </button>
            )}
            <button onClick={onAssignTask} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors">
              <ClipboardList className="w-3.5 h-3.5" /> Asignar Tarea
            </button>
            {collab.isActive ? (
              <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">
                <UserX className="w-3.5 h-3.5" /> Desactivar
              </button>
            ) : (
              <button onClick={onReactivate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors">
                <UserCheck className="w-3.5 h-3.5" /> Reactivar
              </button>
            )}
          </div>

          {/* Telegram info */}
          {isLinked && (
            <div className="bg-blue-50/50 rounded-xl p-3">
              <div className="text-xs font-medium text-blue-800 mb-1 flex items-center gap-1">
                <MessageCircle className="w-3.5 h-3.5" /> Telegram vinculado
              </div>
              <div className="text-xs text-blue-600">
                <span className="font-medium">@{collab.telegramUsername}</span>
                {collab.telegramLinkedAt && (
                  <span className="ml-2 text-blue-400">
                    desde {new Date(collab.telegramLinkedAt).toLocaleDateString("es-MX")}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Link instructions */}
          {!isLinked && (
            <div className="bg-amber-50/50 rounded-xl p-3">
              <div className="text-xs font-medium text-amber-800 mb-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> Para vincular Telegram:
              </div>
              <ol className="text-xs text-amber-700 space-y-1 ml-4 list-decimal">
                <li>Presiona "Vincular Telegram" para generar un código</li>
                <li>El colaborador abre el bot en Telegram</li>
                <li>Envía el código de 6 dígitos al bot</li>
              </ol>
            </div>
          )}

          {/* Assignments */}
          <div>
            <h4 className="text-sm font-bold text-green-800 mb-2 flex items-center gap-1">
              <ClipboardList className="w-4 h-4" /> Tareas asignadas
            </h4>
            {assignQuery.isLoading ? (
              <div className="text-xs text-green-500 py-2">Cargando...</div>
            ) : (assignQuery.data || []).length === 0 ? (
              <div className="text-xs text-green-400 py-2 text-center bg-green-50/50 rounded-lg">
                Sin tareas asignadas
              </div>
            ) : (
              <div className="space-y-2">
                {(assignQuery.data || []).map((a: any) => {
                  const typeInfo = a.activity ? (ACTIVITY_TYPES[a.activity.activityType] || { emoji: "📋", label: a.activity.activityType }) : { emoji: "📋", label: "—" };
                  const statusInfo = STATUS_LABELS[a.status] || { label: a.status, color: "gray" };
                  return (
                    <div key={a.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${a.status === "completada" ? "bg-green-50/50 border-green-100" : a.status === "cancelada" ? "bg-gray-50 border-gray-100 opacity-60" : "bg-white border-green-100"}`}>
                      <span className="text-lg">{typeInfo.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-green-900 truncate">
                          {typeInfo.label} — {a.activity?.activityDate || "—"}
                        </div>
                        <div className="text-xs text-green-500 truncate">
                          {a.parcelNames?.join(", ") || "Sin parcela"}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full bg-${statusInfo.color}-50 text-${statusInfo.color}-700`}>
                        {statusInfo.label}
                      </span>
                      {(a.status === "pendiente" || a.status === "en_progreso") && (
                        <button
                          onClick={() => onUnassign(a.id)}
                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar asignación"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== ASSIGN TASK MODAL =====
function AssignTaskModal({
  collaboratorId, activities, onAssign, onClose, isPending,
}: {
  collaboratorId: number; activities: any[]; onAssign: (activityId: number) => void;
  onClose: () => void; isPending: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");

  const filtered = useMemo(() => {
    let list = activities.filter((a: any) => a.status !== "completada" && a.status !== "cancelada");
    if (filterType) list = list.filter((a: any) => a.activityType === filterType);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((a: any) => a.description.toLowerCase().includes(s) || a.activityDate.includes(s));
    }
    return list.slice(0, 20);
  }, [activities, filterType, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white p-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ClipboardList className="w-5 h-5" /> Asignar Tarea
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar actividad..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setFilterType("")}
              className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${!filterType ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              Todas
            </button>
            {Object.entries(ACTIVITY_TYPES).map(([key, val]) => (
              <button
                key={key}
                onClick={() => setFilterType(key)}
                className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${filterType === key ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {val.emoji} {val.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No hay actividades disponibles
            </div>
          ) : (
            filtered.map((a: any) => {
              const typeInfo = ACTIVITY_TYPES[a.activityType] || { emoji: "📋", label: a.activityType };
              return (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-amber-200 hover:bg-amber-50/30 transition-colors">
                  <span className="text-xl">{typeInfo.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {typeInfo.label}
                    </div>
                    <div className="text-xs text-gray-500">
                      {a.activityDate} — {a.description.substring(0, 60)}{a.description.length > 60 ? "..." : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => onAssign(a.id)}
                    disabled={isPending}
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white text-xs rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
                  >
                    <Send className="w-3 h-3" /> Asignar
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
