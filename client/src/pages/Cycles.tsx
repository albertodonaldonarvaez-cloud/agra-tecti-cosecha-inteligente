import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ProtectedPage } from "@/components/ProtectedPage";
import { GlassCard } from "@/components/GlassCard";
import { APP_LOGO } from "@/const";
import { toast } from "sonner";
import {
  RefreshCcw, Plus, Scissors, Package, Scale, CheckCircle2, Calendar,
  Edit3, Trash2, X, Save, Sprout, Sun, Moon, Flag, Info,
} from "lucide-react";

// Fecha local de México "YYYY-MM-DD"
function todayMx(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function formatDate(d?: string | null): string {
  if (!d) return "—";
  const date = new Date(d + "T12:00:00");
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

// Fase del ciclo para mostrar en el badge
function cyclePhase(c: { endDate: string | null; harvestEndDate: string | null; stats: { total: number } | null }, today: string) {
  if (c.endDate && c.endDate < today) {
    return { label: "Cerrado", color: "bg-gray-100 text-gray-600 border-gray-200", icon: Moon };
  }
  if (c.harvestEndDate) {
    return { label: "Post-cosecha", color: "bg-purple-50 text-purple-700 border-purple-200", icon: Scissors };
  }
  if (c.stats && c.stats.total > 0) {
    return { label: "Cosecha activa", color: "bg-green-50 text-green-700 border-green-200", icon: Sun };
  }
  return { label: "Desarrollo (poda → brotación)", color: "bg-blue-50 text-blue-700 border-blue-200", icon: Sprout };
}

interface EditForm {
  id: number;
  name: string;
  startDate: string;
  harvestStartDate: string;
  harvestEndDate: string;
  endDate: string;
  notes: string;
}

export default function Cycles() {
  return (
    <ProtectedPage permission="canViewCycles">
      <CyclesContent />
    </ProtectedPage>
  );
}

function CyclesContent() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const today = todayMx();

  const { data: overview, isLoading } = trpc.cycles.overview.useQuery(undefined, { staleTime: 60_000 });

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createStart, setCreateStart] = useState(today);
  const [createNotes, setCreateNotes] = useState("");
  const [editForm, setEditForm] = useState<EditForm | null>(null);

  const invalidate = () => {
    utils.cycles.overview.invalidate();
    // El Home usa estas queries acotadas por ciclo
    utils.boxes.dashboardStats.invalidate();
    utils.boxes.dailyChartData.invalidate();
    utils.boxes.availableMonths.invalidate();
  };

  const createMutation = trpc.cycles.create.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.closedPrevious > 0
          ? `Ciclo creado (se cerró ${data.closedPrevious} ciclo anterior)`
          : "Ciclo creado"
      );
      setShowCreate(false);
      setCreateName("");
      setCreateNotes("");
      invalidate();
    },
    onError: (e) => toast.error(`Error al crear ciclo: ${e.message}`),
  });

  const updateMutation = trpc.cycles.update.useMutation({
    onSuccess: () => {
      toast.success("Ciclo actualizado");
      setEditForm(null);
      invalidate();
    },
    onError: (e) => toast.error(`Error al actualizar: ${e.message}`),
  });

  const deleteMutation = trpc.cycles.delete.useMutation({
    onSuccess: () => {
      toast.success("Ciclo eliminado");
      invalidate();
    },
    onError: (e) => toast.error(`Error al eliminar: ${e.message}`),
  });

  const suggestName = () => {
    const y = Number(createStart.slice(0, 4));
    return `Ciclo ${y}-${y + 1}`;
  };

  const openCreate = () => {
    // Sugerir inicio con la última poda registrada en la libreta (si es reciente)
    const lastPoda = overview?.lastPodaDate ? String(overview.lastPodaDate).slice(0, 10) : null;
    setCreateStart(lastPoda && lastPoda <= today ? lastPoda : today);
    setShowCreate(true);
  };

  const openEdit = (c: NonNullable<typeof overview>["cycles"][number]) => {
    setEditForm({
      id: c.id,
      name: c.name,
      startDate: c.startDate ?? "",
      harvestStartDate: c.harvestStartDate ?? "",
      harvestEndDate: c.harvestEndDate ?? "",
      endDate: c.endDate ?? "",
      notes: c.notes ?? "",
    });
  };

  const saveEdit = () => {
    if (!editForm) return;
    if (!editForm.name.trim()) { toast.error("El nombre no puede quedar vacío"); return; }
    if (!editForm.startDate) { toast.error("El inicio del ciclo es obligatorio"); return; }
    updateMutation.mutate({
      id: editForm.id,
      name: editForm.name || undefined,
      startDate: editForm.startDate || undefined,
      harvestStartDate: editForm.harvestStartDate || null,
      harvestEndDate: editForm.harvestEndDate || null,
      endDate: editForm.endDate || null,
      notes: editForm.notes || null,
    });
  };

  const cycles = overview?.cycles ?? [];
  const activeCycle = cycles.find((c) => c.id === overview?.activeCycleId) ?? null;
  const pastCycles = cycles.filter((c) => c.id !== overview?.activeCycleId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container px-3 md:px-6">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={APP_LOGO} alt="Agratec" className="h-10 w-auto" />
            <div>
              <h1 className="text-3xl font-bold text-green-900 flex items-center gap-2">
                <RefreshCcw className="h-7 w-7 text-green-600" />
                Ciclos de Producción
              </h1>
              <p className="text-green-600">Cada ciclo inicia con la poda / dormancia y cierra después de la cosecha</p>
            </div>
          </div>
          {isAdmin && !showCreate && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-full bg-green-600 px-5 py-2.5 font-medium text-white shadow-lg transition hover:bg-green-700"
            >
              <Plus className="h-5 w-5" /> Nuevo Ciclo
            </button>
          )}
        </div>

        {isLoading && (
          <GlassCard className="p-8 text-center text-green-600">Cargando ciclos...</GlassCard>
        )}

        {/* Formulario de nuevo ciclo */}
        {showCreate && (
          <GlassCard className="mb-6 p-6" hover={false}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-green-900 flex items-center gap-2">
                <Scissors className="h-5 w-5 text-purple-600" /> Nuevo ciclo (inicia con la poda)
              </h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            {overview?.lastPodaDate && (
              <div className="mb-4 flex items-start gap-2 rounded-xl bg-purple-50 border border-purple-200 p-3 text-sm text-purple-800">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Última poda registrada en la libreta:{" "}
                  <strong>{formatDate(String(overview.lastPodaDate).slice(0, 10))}</strong>
                  {overview.lastPodaSubtype ? ` (${overview.lastPodaSubtype})` : ""} — se sugiere como fecha de inicio.
                </span>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-green-800">Nombre del ciclo</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder={suggestName()}
                  className="w-full rounded-xl border border-green-200 bg-white/70 px-4 py-2.5 outline-none focus:border-green-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-green-800">Inicio del ciclo (poda / dormancia)</label>
                <input
                  type="date"
                  value={createStart}
                  onChange={(e) => setCreateStart(e.target.value)}
                  className="w-full rounded-xl border border-green-200 bg-white/70 px-4 py-2.5 outline-none focus:border-green-400"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-green-800">Notas (opcional)</label>
                <textarea
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-green-200 bg-white/70 px-4 py-2.5 outline-none focus:border-green-400"
                />
              </div>
            </div>
            {cycles.some((c) => c.isActive) && (
              <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                ⚠️ Al crear este ciclo, el ciclo abierto actual se cerrará automáticamente con fecha del día anterior al nuevo inicio.
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => {
                  if (!createStart) { toast.error("Indica la fecha de inicio"); return; }
                  createMutation.mutate({
                    name: createName.trim() || suggestName(),
                    startDate: createStart,
                    notes: createNotes.trim() || undefined,
                  });
                }}
                disabled={createMutation.isPending}
                className="flex items-center gap-2 rounded-full bg-green-600 px-5 py-2.5 font-medium text-white shadow transition hover:bg-green-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> Crear ciclo
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-full border border-gray-300 px-5 py-2.5 font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </GlassCard>
        )}

        {/* Sin ciclos: invitación a crear el primero */}
        {!isLoading && cycles.length === 0 && !showCreate && (
          <GlassCard className="p-10 text-center" hover={false}>
            <RefreshCcw className="mx-auto mb-4 h-12 w-12 text-green-300" />
            <h2 className="mb-2 text-xl font-bold text-green-900">Aún no hay ciclos registrados</h2>
            <p className="mx-auto mb-4 max-w-lg text-green-600">
              Registra tu primer ciclo de producción para agrupar la cosecha, la libreta de campo
              y los análisis por temporada. El ciclo inicia con la poda / dormancia del higo.
            </p>
            {isAdmin ? (
              <button
                onClick={openCreate}
                className="mx-auto flex items-center gap-2 rounded-full bg-green-600 px-6 py-3 font-medium text-white shadow-lg transition hover:bg-green-700"
              >
                <Plus className="h-5 w-5" /> Crear el primer ciclo
              </button>
            ) : (
              <p className="text-sm text-green-500">Pide a un administrador que registre el ciclo.</p>
            )}
          </GlassCard>
        )}

        {/* Ciclo activo */}
        {activeCycle && (
          <CycleCard
            cycle={activeCycle}
            today={today}
            isAdmin={isAdmin}
            highlight
            onEdit={() => openEdit(activeCycle)}
            onEndHarvest={() =>
              updateMutation.mutate({ id: activeCycle.id, harvestEndDate: today })
            }
            onCloseCycle={() =>
              updateMutation.mutate({
                id: activeCycle.id,
                endDate: today,
                harvestEndDate: activeCycle.harvestEndDate ?? today,
              })
            }
            onDelete={() => {
              if (confirm(`¿Eliminar el ciclo "${activeCycle.name}"? Las cajas y actividades NO se borran.`)) {
                deleteMutation.mutate({ id: activeCycle.id });
              }
            }}
          />
        )}

        {/* Ciclos anteriores */}
        {pastCycles.length > 0 && (
          <>
            <h2 className="mb-3 mt-8 text-lg font-bold text-green-900">Ciclos anteriores</h2>
            <div className="space-y-4">
              {pastCycles.map((c) => (
                <CycleCard
                  key={c.id}
                  cycle={c}
                  today={today}
                  isAdmin={isAdmin}
                  onEdit={() => openEdit(c)}
                  onDelete={() => {
                    if (confirm(`¿Eliminar el ciclo "${c.name}"? Las cajas y actividades NO se borran.`)) {
                      deleteMutation.mutate({ id: c.id });
                    }
                  }}
                />
              ))}
            </div>
          </>
        )}

        {/* Modal de edición */}
        {editForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditForm(null)}>
            <div
              className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-green-900">Editar ciclo</h3>
                <button onClick={() => setEditForm(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-green-800">Nombre</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full rounded-xl border border-green-200 px-4 py-2.5 outline-none focus:border-green-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-green-800">Inicio (poda/dormancia)</label>
                    <input
                      type="date"
                      value={editForm.startDate}
                      onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                      className="w-full rounded-xl border border-green-200 px-3 py-2.5 outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-green-800">Inicio de cosecha</label>
                    <input
                      type="date"
                      value={editForm.harvestStartDate}
                      onChange={(e) => setEditForm({ ...editForm, harvestStartDate: e.target.value })}
                      className="w-full rounded-xl border border-green-200 px-3 py-2.5 outline-none focus:border-green-400"
                    />
                    <p className="mt-0.5 text-xs text-gray-400">Vacío = se detecta con la primera caja</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-green-800">Fin de cosecha</label>
                    <input
                      type="date"
                      value={editForm.harvestEndDate}
                      onChange={(e) => setEditForm({ ...editForm, harvestEndDate: e.target.value })}
                      className="w-full rounded-xl border border-green-200 px-3 py-2.5 outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-green-800">Fin del ciclo</label>
                    <input
                      type="date"
                      value={editForm.endDate}
                      onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                      className="w-full rounded-xl border border-green-200 px-3 py-2.5 outline-none focus:border-green-400"
                    />
                    <p className="mt-0.5 text-xs text-gray-400">Vacío = ciclo abierto</p>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-green-800">Notas</label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    rows={2}
                    className="w-full rounded-xl border border-green-200 px-4 py-2.5 outline-none focus:border-green-400"
                  />
                </div>
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={saveEdit}
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-2 rounded-full bg-green-600 px-5 py-2.5 font-medium text-white shadow transition hover:bg-green-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" /> Guardar
                </button>
                <button
                  onClick={() => setEditForm(null)}
                  className="rounded-full border border-gray-300 px-5 py-2.5 font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Tarjeta de ciclo =====
interface CycleCardProps {
  cycle: {
    id: number;
    name: string;
    startDate: string;
    harvestStartDate: string | null;
    harvestEndDate: string | null;
    endDate: string | null;
    notes: string | null;
    harvestStartDetected: string | null;
    isActive: boolean;
    stats: {
      total: number;
      totalWeight: number;
      firstQualityWeight: number;
      firstQualityPercent: number;
      secondQualityPercent: number;
      wastePercent: number;
      firstDate: string | null;
      lastDate: string | null;
    } | null;
  };
  today: string;
  isAdmin: boolean;
  highlight?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onEndHarvest?: () => void;
  onCloseCycle?: () => void;
}

function CycleCard({ cycle, today, isAdmin, highlight, onEdit, onDelete, onEndHarvest, onCloseCycle }: CycleCardProps) {
  const phase = cyclePhase(cycle, today);
  const PhaseIcon = phase.icon;
  const harvestOngoing = cycle.isActive && !cycle.harvestEndDate && (cycle.stats?.total ?? 0) > 0;

  return (
    <GlassCard className={`p-6 ${highlight ? "ring-2 ring-green-400/60" : ""}`} hover={false}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold text-green-900">{cycle.name}</h3>
            <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${phase.color}`}>
              <PhaseIcon className="h-3.5 w-3.5" /> {phase.label}
            </span>
            {highlight && (
              <span className="rounded-full bg-green-600 px-3 py-1 text-xs font-bold text-white">CICLO ACTUAL</span>
            )}
          </div>
          {cycle.notes && <p className="mt-1 text-sm text-green-600">{cycle.notes}</p>}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {cycle.isActive && !cycle.harvestEndDate && (cycle.stats?.total ?? 0) > 0 && onEndHarvest && (
              <button
                onClick={onEndHarvest}
                className="flex items-center gap-1.5 rounded-full border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition hover:bg-purple-100"
                title="Marcar la finalización de cosecha con fecha de hoy"
              >
                <Flag className="h-4 w-4" /> Finalizar cosecha
              </button>
            )}
            {cycle.isActive && onCloseCycle && (
              <button
                onClick={onCloseCycle}
                className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
                title="Cerrar el ciclo con fecha de hoy"
              >
                <Moon className="h-4 w-4" /> Cerrar ciclo
              </button>
            )}
            <button onClick={onEdit} className="rounded-full p-2 text-green-600 transition hover:bg-green-50" title="Editar">
              <Edit3 className="h-4 w-4" />
            </button>
            <button onClick={onDelete} className="rounded-full p-2 text-red-500 transition hover:bg-red-50" title="Eliminar">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Fechas del ciclo */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-purple-50/60 border border-purple-100 p-3">
          <p className="text-xs font-medium text-purple-500 flex items-center gap-1"><Scissors className="h-3 w-3" /> Inicio (poda)</p>
          <p className="mt-0.5 font-bold text-purple-900">{formatDate(cycle.startDate)}</p>
        </div>
        <div className="rounded-2xl bg-green-50/60 border border-green-100 p-3">
          <p className="text-xs font-medium text-green-500 flex items-center gap-1"><Sun className="h-3 w-3" /> Inicio cosecha</p>
          <p className="mt-0.5 font-bold text-green-900">
            {formatDate(cycle.harvestStartDetected)}
            {!cycle.harvestStartDate && cycle.harvestStartDetected && (
              <span className="ml-1 text-xs font-normal text-green-500">(detectado)</span>
            )}
          </p>
        </div>
        <div className="rounded-2xl bg-amber-50/60 border border-amber-100 p-3">
          <p className="text-xs font-medium text-amber-500 flex items-center gap-1"><Flag className="h-3 w-3" /> Fin cosecha</p>
          <p className="mt-0.5 font-bold text-amber-900">
            {harvestOngoing ? <span className="text-green-600">En curso</span> : formatDate(cycle.harvestEndDate)}
          </p>
        </div>
        <div className="rounded-2xl bg-gray-50/60 border border-gray-200 p-3">
          <p className="text-xs font-medium text-gray-500 flex items-center gap-1"><Moon className="h-3 w-3" /> Fin del ciclo</p>
          <p className="mt-0.5 font-bold text-gray-900">{cycle.endDate ? formatDate(cycle.endDate) : "Abierto"}</p>
        </div>
      </div>

      {/* Cosecha del ciclo */}
      {cycle.stats && cycle.stats.total > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-lg font-bold text-green-900">{cycle.stats.total.toLocaleString()}</p>
              <p className="text-xs text-green-500">cajas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-lg font-bold text-green-900">{cycle.stats.totalWeight.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg</p>
              <p className="text-xs text-green-500">peso total</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-lg font-bold text-green-900">{cycle.stats.firstQualityPercent}%</p>
              <p className="text-xs text-green-500">primera calidad</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-lg font-bold text-green-900">
                {formatDate(cycle.stats.firstDate)} – {formatDate(cycle.stats.lastDate)}
              </p>
              <p className="text-xs text-green-500">días con cosecha</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-green-500">Sin cosecha registrada en este ciclo todavía.</p>
      )}
    </GlassCard>
  );
}
