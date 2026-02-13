import { useAuth } from "@/_core/hooks/useAuth";
import { ProtectedPage } from "@/components/ProtectedPage";
import { GlassCard } from "@/components/GlassCard";
import { APP_LOGO } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  Leaf, Plus, Edit3, Trash2, Save, X, ChevronDown, ChevronUp, Sprout
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function CropsVarieties() {
  return (
    <ProtectedPage permission="canViewCrops">
      <CropsVarietiesContent />
    </ProtectedPage>
  );
}

function CropsVarietiesContent() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: crops, isLoading, refetch: refetchCrops } = trpc.crops.list.useQuery(undefined, {
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const [expandedCropId, setExpandedCropId] = useState<number | null>(null);
  const [showAddCrop, setShowAddCrop] = useState(false);
  const [newCropName, setNewCropName] = useState("");
  const [newCropDesc, setNewCropDesc] = useState("");
  const [editingCropId, setEditingCropId] = useState<number | null>(null);
  const [editCropName, setEditCropName] = useState("");
  const [editCropDesc, setEditCropDesc] = useState("");

  // Variedad
  const [showAddVariety, setShowAddVariety] = useState<number | null>(null);
  const [newVarietyName, setNewVarietyName] = useState("");
  const [newVarietyDesc, setNewVarietyDesc] = useState("");
  const [editingVarietyId, setEditingVarietyId] = useState<number | null>(null);
  const [editVarietyName, setEditVarietyName] = useState("");
  const [editVarietyDesc, setEditVarietyDesc] = useState("");

  // Mutations
  const createCrop = trpc.crops.create.useMutation({
    onSuccess: () => { toast.success("Cultivo creado"); refetchCrops(); setShowAddCrop(false); setNewCropName(""); setNewCropDesc(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateCrop = trpc.crops.update.useMutation({
    onSuccess: () => { toast.success("Cultivo actualizado"); refetchCrops(); setEditingCropId(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteCrop = trpc.crops.delete.useMutation({
    onSuccess: () => { toast.success("Cultivo eliminado"); refetchCrops(); },
    onError: (e: any) => toast.error(e.message),
  });

  const createVariety = trpc.crops.createVariety.useMutation({
    onSuccess: () => { toast.success("Variedad creada"); refetchCrops(); setShowAddVariety(null); setNewVarietyName(""); setNewVarietyDesc(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateVariety = trpc.crops.updateVariety.useMutation({
    onSuccess: () => { toast.success("Variedad actualizada"); refetchCrops(); setEditingVarietyId(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteVariety = trpc.crops.deleteVariety.useMutation({
    onSuccess: () => { toast.success("Variedad eliminada"); refetchCrops(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
      <div className="mx-auto max-w-4xl px-3 md:px-6 py-4 md:py-8 pb-24 space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <img src={APP_LOGO} alt="Agratec" className="h-12 w-12 md:h-16 md:w-16" />
            <div>
              <h1 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-green-800 to-emerald-600 bg-clip-text text-transparent">
                Cultivos y Variedades
              </h1>
              <p className="text-xs md:text-base text-green-600/80">
                Gestiona los cultivos y sus variedades
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowAddCrop(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-all shadow-md sm:ml-auto"
            >
              <Plus className="h-4 w-4" />
              Nuevo Cultivo
            </button>
          )}
        </div>

        {/* Formulario de nuevo cultivo */}
        {showAddCrop && (
          <GlassCard className="p-4" hover={false}>
            <h3 className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
              <Leaf className="h-4 w-4" />
              Nuevo Cultivo
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                value={newCropName}
                onChange={(e) => setNewCropName(e.target.value)}
                placeholder="Nombre del cultivo (ej: Limón, Higo, Elote)"
                className="w-full px-3 py-2 text-sm bg-white/60 border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              <input
                type="text"
                value={newCropDesc}
                onChange={(e) => setNewCropDesc(e.target.value)}
                placeholder="Descripción (opcional)"
                className="w-full px-3 py-2 text-sm bg-white/60 border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => createCrop.mutate({ name: newCropName, description: newCropDesc || null })}
                  disabled={!newCropName.trim() || createCrop.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-all disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {createCrop.isPending ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={() => { setShowAddCrop(false); setNewCropName(""); setNewCropDesc(""); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-all"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancelar
                </button>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-8 text-green-500 animate-pulse">Cargando cultivos...</div>
        )}

        {/* Lista de cultivos */}
        {!isLoading && (!crops || crops.length === 0) && (
          <GlassCard className="p-8 text-center" hover={false}>
            <Leaf className="h-12 w-12 mx-auto text-green-300 mb-4" />
            <h3 className="text-lg font-semibold text-green-800 mb-2">Sin cultivos registrados</h3>
            <p className="text-green-600 text-sm">Agrega tu primer cultivo para comenzar a asignarlos a las parcelas</p>
          </GlassCard>
        )}

        {crops && crops.map((crop: any) => {
          const isExpanded = expandedCropId === crop.id;
          const isEditing = editingCropId === crop.id;

          return (
            <GlassCard key={crop.id} className="overflow-hidden" hover={false}>
              {/* Header del cultivo */}
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-green-50/30 transition-all"
                onClick={() => setExpandedCropId(isExpanded ? null : crop.id)}
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 shadow">
                  <Leaf className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={editCropName}
                        onChange={(e) => setEditCropName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="px-2 py-1 text-sm bg-white border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                      <input
                        type="text"
                        value={editCropDesc}
                        onChange={(e) => setEditCropDesc(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Descripción"
                        className="px-2 py-1 text-xs bg-white border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); updateCrop.mutate({ id: crop.id, name: editCropName, description: editCropDesc || null }); }}
                          className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700"
                        >
                          Guardar
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingCropId(null); }}
                          className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-xs hover:bg-red-100"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h4 className="font-semibold text-green-900">{crop.name}</h4>
                      {crop.description && <p className="text-xs text-green-500">{crop.description}</p>}
                    </>
                  )}
                </div>
                <span className="text-xs text-green-500 bg-green-50 px-2 py-1 rounded-full">
                  {crop.varieties?.length || 0} variedades
                </span>
                {isAdmin && !isEditing && (
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingCropId(crop.id); setEditCropName(crop.name); setEditCropDesc(crop.description || ""); }}
                      className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100"
                      title="Editar"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`¿Eliminar el cultivo "${crop.name}" y todas sus variedades?`)) {
                          deleteCrop.mutate({ id: crop.id });
                        }
                      }}
                      className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex-shrink-0">
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-green-500" /> : <ChevronDown className="h-4 w-4 text-green-500" />}
                </div>
              </div>

              {/* Variedades (expandidas) */}
              {isExpanded && (
                <div className="border-t border-green-200/30 bg-white/20">
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="text-sm font-medium text-green-700 flex items-center gap-1.5">
                        <Sprout className="h-4 w-4" />
                        Variedades de {crop.name}
                      </h5>
                      {isAdmin && (
                        <button
                          onClick={() => setShowAddVariety(crop.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200 transition-all"
                        >
                          <Plus className="h-3 w-3" />
                          Agregar Variedad
                        </button>
                      )}
                    </div>

                    {/* Formulario nueva variedad */}
                    {showAddVariety === crop.id && (
                      <div className="bg-green-50/50 rounded-xl p-3 space-y-2 mb-3">
                        <input
                          type="text"
                          value={newVarietyName}
                          onChange={(e) => setNewVarietyName(e.target.value)}
                          placeholder="Nombre de la variedad"
                          className="w-full px-3 py-2 text-sm bg-white border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                        <input
                          type="text"
                          value={newVarietyDesc}
                          onChange={(e) => setNewVarietyDesc(e.target.value)}
                          placeholder="Descripción (opcional)"
                          className="w-full px-3 py-2 text-sm bg-white border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => createVariety.mutate({ cropId: crop.id, name: newVarietyName, description: newVarietyDesc || null })}
                            disabled={!newVarietyName.trim() || createVariety.isPending}
                            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                          >
                            {createVariety.isPending ? "Guardando..." : "Guardar"}
                          </button>
                          <button
                            onClick={() => { setShowAddVariety(null); setNewVarietyName(""); setNewVarietyDesc(""); }}
                            className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs hover:bg-red-100"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Lista de variedades */}
                    {(!crop.varieties || crop.varieties.length === 0) && (
                      <p className="text-xs text-green-400 italic py-2">Sin variedades registradas</p>
                    )}

                    {crop.varieties?.map((variety: any) => {
                      const isEditingV = editingVarietyId === variety.id;

                      return (
                        <div key={variety.id} className="flex items-center gap-3 bg-white/40 rounded-xl p-3 border border-green-100/30">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-green-100">
                            <Sprout className="h-4 w-4 text-green-600" />
                          </div>
                          {isEditingV ? (
                            <div className="flex-1 flex flex-col gap-2">
                              <input
                                type="text"
                                value={editVarietyName}
                                onChange={(e) => setEditVarietyName(e.target.value)}
                                className="px-2 py-1 text-sm bg-white border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
                              />
                              <input
                                type="text"
                                value={editVarietyDesc}
                                onChange={(e) => setEditVarietyDesc(e.target.value)}
                                placeholder="Descripción"
                                className="px-2 py-1 text-xs bg-white border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => updateVariety.mutate({ id: variety.id, name: editVarietyName, description: editVarietyDesc || null })}
                                  className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700"
                                >
                                  Guardar
                                </button>
                                <button
                                  onClick={() => setEditingVarietyId(null)}
                                  className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-xs hover:bg-red-100"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-green-900">{variety.name}</span>
                                {variety.description && <p className="text-xs text-green-500">{variety.description}</p>}
                              </div>
                              {isAdmin && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => { setEditingVarietyId(variety.id); setEditVarietyName(variety.name); setEditVarietyDesc(variety.description || ""); }}
                                    className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100"
                                  >
                                    <Edit3 className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm(`¿Eliminar la variedad "${variety.name}"?`)) {
                                        deleteVariety.mutate({ id: variety.id });
                                      }
                                    }}
                                    className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
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
