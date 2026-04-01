import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import { ProtectedPage } from "@/components/ProtectedPage";
import { toast } from "sonner";
import {
  UsersRound, Plus, Search, Edit3, X, Save, Phone, UserCheck, UserX,
  Link2, Unlink, ChevronDown, ChevronUp, ClipboardList, Trash2, RefreshCw,
  MessageCircle, AlertCircle, CheckCircle2, Clock, Smartphone, Shield,
  Copy, User, Sparkles,
} from "lucide-react";

// ===== CONSTANTES =====
const ROLES_SUGERIDOS = [
  "Jornalero", "Caporal", "Operador de maquinaria", "Regador",
  "Fumigador", "Podador", "Supervisor", "Chofer", "Otro",
];

const STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  pendiente: { label: "Pendiente", color: "text-amber-600 bg-amber-50 border-amber-200", icon: Clock },
  en_progreso: { label: "En progreso", color: "text-blue-600 bg-blue-50 border-blue-200", icon: RefreshCw },
  completada: { label: "Completada", color: "text-green-600 bg-green-50 border-green-200", icon: CheckCircle2 },
  cancelada: { label: "Cancelada", color: "text-red-600 bg-red-50 border-red-200", icon: X },
};

export default function Collaborators() {
  return (
    <ProtectedPage permission="canViewCollaborators">
      <CollaboratorsContent />
    </ProtectedPage>
  );
}

function CollaboratorsContent() {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [linkCodeData, setLinkCodeData] = useState<{ collaboratorId: number; code: string; expiresAt: string } | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formRole, setFormRole] = useState("");

  // Queries
  const collabQuery = trpc.collaborators.list.useQuery();

  // Mutations
  const createMut = trpc.collaborators.create.useMutation({
    onSuccess: () => { collabQuery.refetch(); toast.success("Colaborador agregado exitosamente"); resetForm(); },
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
      setLinkCodeData({ collaboratorId, code: result.code, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
      try { await navigator.clipboard.writeText(result.code); } catch {}
      toast.success("Código generado y copiado al portapapeles");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 p-4 md:p-6 pb-24">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-2">
              <UsersRound className="w-7 h-7 text-green-600" />
              Equipo de Campo
            </h1>
            <p className="text-sm text-gray-500 mt-1">Gestiona tus colaboradores y su vinculación con Telegram</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Nuevo Colaborador
          </button>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-3 gap-3">
          <GlassCard className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center"><UserCheck className="w-5 h-5 text-green-600" /></div>
              <div><p className="text-xs text-gray-500">Activos</p><p className="text-xl font-bold text-gray-800">{stats.total}</p></div>
            </div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Smartphone className="w-5 h-5 text-blue-600" /></div>
              <div><p className="text-xs text-gray-500">Con Telegram</p><p className="text-xl font-bold text-gray-800">{stats.linked}</p></div>
            </div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center"><UserX className="w-5 h-5 text-gray-500" /></div>
              <div><p className="text-xs text-gray-500">Inactivos</p><p className="text-xl font-bold text-gray-800">{stats.inactive}</p></div>
            </div>
          </GlassCard>
        </div>

        {/* Búsqueda y filtros */}
        <GlassCard className="p-4" hover={false}>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, rol o teléfono..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white/70 focus:ring-2 focus:ring-green-300 focus:border-transparent text-sm outline-none"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer whitespace-nowrap px-3 py-2 rounded-xl hover:bg-white/50 transition-colors">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              Mostrar inactivos
            </label>
          </div>
        </GlassCard>

        {/* Formulario Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4" onClick={() => resetForm()}>
            <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-gradient-to-r from-green-600 to-emerald-600 text-white p-4 rounded-t-2xl flex items-center justify-between z-10">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <User className="w-5 h-5" />
                  {editingId ? "Editar Colaborador" : "Nuevo Colaborador"}
                </h2>
                <button onClick={resetForm} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Nombre completo *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ej: Juan Pérez López"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white/70 focus:ring-2 focus:ring-green-300 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Teléfono</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="Ej: 6121234567"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white/70 focus:ring-2 focus:ring-green-300 outline-none text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Rol / Puesto</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white/70 focus:ring-2 focus:ring-green-300 outline-none text-sm"
                  >
                    <option value="">Seleccionar rol...</option>
                    {ROLES_SUGERIDOS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={resetForm}
                    className="flex-1 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={createMut.isPending || updateMut.isPending}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all text-sm font-semibold disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {editingId ? "Guardar" : "Agregar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Link Code Modal */}
        {linkCodeData && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4" onClick={() => setLinkCodeData(null)}>
            <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-t-2xl flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Link2 className="w-5 h-5" /> Código de Vinculación
                </h2>
                <button onClick={() => setLinkCodeData(null)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 text-center space-y-4">
                <div className="bg-blue-50 rounded-2xl p-6">
                  <p className="text-xs text-blue-500 uppercase tracking-wider mb-2 font-semibold">Código de 6 dígitos</p>
                  <p className="text-4xl font-mono font-bold text-blue-800 tracking-[0.3em]">{linkCodeData.code}</p>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <p className="font-medium">Instrucciones para el colaborador:</p>
                  <ol className="text-left space-y-1.5 text-xs">
                    <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span> Abrir el bot de Telegram de la empresa</li>
                    <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span> Enviar el código <strong>{linkCodeData.code}</strong> al bot</li>
                    <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</span> El bot confirmará la vinculación</li>
                  </ol>
                </div>
                <div className="flex items-center justify-center gap-1 text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                  <Clock className="w-3.5 h-3.5" />
                  El código expira en 15 minutos
                </div>
                <button
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(linkCodeData.code); toast.success("Código copiado"); } catch { toast.error("No se pudo copiar"); }
                  }}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 transition-colors text-sm font-medium"
                >
                  <Copy className="w-4 h-4" /> Copiar código
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lista de colaboradores */}
        {collabQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
          </div>
        ) : collaborators.length === 0 ? (
          <GlassCard className="p-8 text-center" hover={false}>
            <UsersRound className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">{search ? "Sin resultados" : "Sin colaboradores"}</p>
            <p className="text-gray-400 text-sm mt-1">{search ? "Intenta con otra búsqueda" : "Agrega tu primer colaborador para empezar"}</p>
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
                onUnlink={() => { if (confirm("¿Desvincular Telegram de este colaborador?")) unlinkMut.mutate({ collaboratorId: collab.id }); }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== COLLABORATOR CARD =====
function CollaboratorCard({
  collab, isExpanded, onToggle, onEdit, onDelete, onReactivate,
  onGenerateCode, onUnlink,
}: {
  collab: any; isExpanded: boolean; onToggle: () => void; onEdit: () => void;
  onDelete: () => void; onReactivate: () => void; onGenerateCode: () => void;
  onUnlink: () => void;
}) {
  const assignQuery = trpc.collaborators.getAssignments.useQuery(
    { collaboratorId: collab.id },
    { enabled: isExpanded }
  );

  const isLinked = !!collab.telegramChatId;
  const assignments = assignQuery.data || [];
  const activeAssignments = assignments.filter((a: any) => a.status === "pendiente" || a.status === "en_progreso");
  const completedAssignments = assignments.filter((a: any) => a.status === "completada");

  return (
    <GlassCard className={`overflow-hidden ${!collab.isActive ? "opacity-60" : ""}`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={onToggle}>
        {/* Avatar */}
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0 ${
          isLinked
            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-200"
            : "bg-gradient-to-br from-green-100 to-emerald-100 text-green-700"
        }`}>
          {collab.name.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800">{collab.name}</span>
            {!collab.isActive && (
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full border border-gray-200">Inactivo</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
            {collab.role && (
              <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-100">{collab.role}</span>
            )}
            {collab.phone && (
              <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{collab.phone}</span>
            )}
            {isLinked && (
              <span className="flex items-center gap-1 text-blue-600">
                <MessageCircle className="w-3 h-3" />
                @{collab.telegramUsername}
              </span>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isLinked ? (
            <span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center" title="Telegram vinculado">
              <Smartphone className="w-4 h-4 text-blue-600" />
            </span>
          ) : (
            <span className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center" title="Sin vincular">
              <Unlink className="w-4 h-4 text-gray-400" />
            </span>
          )}
          {activeAssignments.length > 0 && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-200">
              <ClipboardList className="w-3 h-3" />
              {activeAssignments.length}
            </span>
          )}
          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-white/30 p-4 space-y-4">
          {/* Acciones */}
          <div className="flex flex-wrap gap-2">
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors border border-amber-200">
              <Edit3 className="w-3.5 h-3.5" /> Editar
            </button>
            {isLinked ? (
              <button onClick={(e) => { e.stopPropagation(); onUnlink(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors border border-red-200">
                <Unlink className="w-3.5 h-3.5" /> Desvincular Telegram
              </button>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); onGenerateCode(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200">
                <Link2 className="w-3.5 h-3.5" /> Vincular Telegram
              </button>
            )}
            {collab.isActive ? (
              <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors border border-red-200">
                <UserX className="w-3.5 h-3.5" /> Desactivar
              </button>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); onReactivate(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors border border-green-200">
                <UserCheck className="w-3.5 h-3.5" /> Reactivar
              </button>
            )}
          </div>

          {/* Telegram info */}
          {isLinked && (
            <div className="bg-blue-50/60 rounded-xl p-3 border border-blue-100">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-blue-800">Telegram vinculado</p>
                  <p className="text-blue-600">
                    @{collab.telegramUsername}
                    {collab.telegramLinkedAt && (
                      <span className="text-blue-400 ml-1">
                        — desde {new Date(collab.telegramLinkedAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Instrucciones de vinculación */}
          {!isLinked && (
            <div className="bg-amber-50/60 rounded-xl p-3 border border-amber-100">
              <div className="flex items-start gap-2 text-xs">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-800 mb-1">Para vincular Telegram:</p>
                  <ol className="text-amber-700 space-y-0.5 ml-3 list-decimal">
                    <li>Presiona "Vincular Telegram" para generar un código</li>
                    <li>El colaborador abre el bot en Telegram</li>
                    <li>Envía el código de 6 dígitos al bot</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* Tareas asignadas */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <ClipboardList className="w-3.5 h-3.5" /> Tareas asignadas
              {assignments.length > 0 && <span className="text-gray-400 font-normal">({assignments.length})</span>}
            </p>
            {assignQuery.isLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-200 border-t-green-600" />
              </div>
            ) : assignments.length === 0 ? (
              <div className="text-xs text-gray-400 py-3 text-center bg-white/40 rounded-xl border border-gray-100">
                Sin tareas asignadas — Las tareas se asignan desde la Libreta de Campo
              </div>
            ) : (
              <div className="space-y-2">
                {assignments.map((a: any) => {
                  const statusInfo = STATUS_LABELS[a.status] || { label: a.status, color: "text-gray-600 bg-gray-50 border-gray-200", icon: Clock };
                  const StatusIcon = statusInfo.icon;
                  return (
                    <div key={a.id} className={`flex items-center gap-3 p-2.5 rounded-xl border bg-white/50 ${a.status === "completada" || a.status === "cancelada" ? "opacity-60" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">
                          {a.activity?.activityType || "—"} — {a.activity?.activityDate || "—"}
                        </div>
                        <div className="text-[10px] text-gray-500 truncate mt-0.5">
                          {a.parcelNames?.join(", ") || "Sin parcela"}
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusInfo.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusInfo.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Resumen */}
          {assignments.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/50 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-gray-400 uppercase">Activas</p>
                <p className="text-sm font-bold text-amber-700">{activeAssignments.length}</p>
              </div>
              <div className="bg-white/50 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-gray-400 uppercase">Completadas</p>
                <p className="text-sm font-bold text-green-700">{completedAssignments.length}</p>
              </div>
            </div>
          )}

          {/* Fecha de registro */}
          <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
            Registrado el {new Date(collab.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
