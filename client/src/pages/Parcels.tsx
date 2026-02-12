import { Loading } from "@/components/Loading";
import { useAuth } from "@/_core/hooks/useAuth";
import { ProtectedPage } from "@/components/ProtectedPage";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { MapPin, Upload, Plus, Edit, Trash2, CheckCircle, XCircle, Map as MapIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ParcelMap } from "@/components/ParcelMap";

interface Parcel {
  id: number;
  code: string;
  name: string;
  polygon: any;
  isActive: boolean;
  createdAt: Date;
}

export default function Parcels() {
  return (
    <ProtectedPage permission="canViewParcels">
      <ParcelsContent />
    </ProtectedPage>
  );
}

function ParcelsContent() {
  const { user, loading } = useAuth();
  const [showDialog, setShowDialog] = useState(false);
  const [editingParcel, setEditingParcel] = useState<Parcel | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [kmlFile, setKmlFile] = useState<File | null>(null);
  const [showMap, setShowMap] = useState(false);

  const { data: parcels, isLoading, refetch } = trpc.parcels.list.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const createParcel = trpc.parcels.create.useMutation({
    onSuccess: () => {
      toast.success("Parcela creada correctamente");
      refetch();
      closeDialog();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateParcel = trpc.parcels.update.useMutation({
    onSuccess: () => {
      toast.success("Parcela actualizada correctamente");
      refetch();
      closeDialog();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteParcel = trpc.parcels.delete.useMutation({
    onSuccess: () => {
      toast.success("Parcela eliminada correctamente");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const uploadKml = trpc.parcels.uploadKML.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.parcelsProcessed} parcelas cargadas desde KML/KMZ`);
      refetch();
      setKmlFile(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  if (loading || !user || user.role !== "admin") {
    return <Loading />;
  }

  const closeDialog = () => {
    setShowDialog(false);
    setEditingParcel(null);
    setCode("");
    setName("");
  };

  const openCreateDialog = () => {
    setEditingParcel(null);
    setCode("");
    setName("");
    setShowDialog(true);
  };

  const openEditDialog = (parcel: Parcel) => {
    setEditingParcel(parcel);
    setCode(parcel.code);
    setName(parcel.name);
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!code || !name) {
      toast.error("Por favor completa todos los campos");
      return;
    }

    if (editingParcel) {
      updateParcel.mutate({ code, name, isActive: editingParcel.isActive });
    } else {
      createParcel.mutate({ code, name, isActive: true });
    }
  };

  const handleDelete = (parcelCode: string) => {
    if (confirm("¿Estás seguro de eliminar esta parcela?")) {
      deleteParcel.mutate({ code: parcelCode });
    }
  };

  const handleKmlUpload = async () => {
    if (!kmlFile) {
      toast.error("Por favor selecciona un archivo KML/KMZ");
      return;
    }

    const fileType = kmlFile.name.toLowerCase().endsWith('.kmz') ? 'kmz' : 'kml';
    
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result;
        if (!content) return;

        let fileContent: string;
        if (fileType === 'kmz') {
          fileContent = btoa(
            new Uint8Array(content as ArrayBuffer)
              .reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
        } else {
          fileContent = content as string;
        }

        uploadKml.mutate({ fileContent, fileType });
      };

      if (fileType === 'kmz') {
        reader.readAsArrayBuffer(kmlFile);
      } else {
        reader.readAsText(kmlFile);
      }
    } catch (error) {
      toast.error("Error leyendo el archivo");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container px-3 md:px-6">
        {/* Header */}
        <div className="mb-6 md:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 md:gap-4">
            <img src={APP_LOGO} alt="Agratec" className="h-12 w-12 md:h-16 md:w-16" />
            <div>
              <h1 className="text-2xl md:text-4xl font-bold text-green-900">Gestión de Parcelas</h1>
              <p className="text-xs md:text-base text-green-700">
                {parcels ? `${parcels.length} parcelas registradas` : "Cargando..."}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowMap(!showMap)} variant="outline" className="border-green-600 text-green-700 hover:bg-green-50 text-xs md:text-sm" size="sm">
              <MapIcon className="mr-1 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4" />
              {showMap ? "Ocultar Mapa" : "Ver Mapa"}
            </Button>
            <Button onClick={openCreateDialog} className="bg-green-600 hover:bg-green-700 text-xs md:text-sm" size="sm">
              <Plus className="mr-1 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4" />
              Nueva Parcela
            </Button>
          </div>
        </div>

        {/* Sección de carga KML/KMZ */}
        <GlassCard className="mb-4 md:mb-6 p-4 md:p-6">
          <div className="flex items-center gap-3 md:gap-4">
            <MapPin className="h-6 w-6 md:h-8 md:w-8 text-green-600" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-green-900">Cargar desde KML/KMZ</h3>
              <p className="text-sm text-green-700">
                Importa múltiples parcelas con sus polígonos desde un archivo KML o KMZ
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept=".kml,.kmz"
                onChange={(e) => setKmlFile(e.target.files?.[0] || null)}
                className="w-64"
              />
              <Button
                onClick={handleKmlUpload}
                disabled={!kmlFile || uploadKml.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploadKml.isPending ? "Cargando..." : "Cargar"}
              </Button>
            </div>
          </div>
        </GlassCard>

        {/* Mapa de parcelas */}
        {showMap && parcels && parcels.length > 0 && (
          <GlassCard className="mb-6 p-6">
            <h3 className="text-lg font-semibold text-green-900 mb-4">Mapa de Parcelas</h3>
            <ParcelMap
              parcels={parcels
                .filter(p => p.polygon)
                .map(p => {
                  try {
                    const polygon = typeof p.polygon === 'string' ? JSON.parse(p.polygon) : p.polygon;
                    return {
                      code: p.code,
                      name: p.name,
                      coordinates: polygon.coordinates || polygon,
                    };
                  } catch (e) {
                    console.error(`Error parsing polygon for ${p.code}:`, e);
                    return null;
                  }
                })
                .filter(p => p !== null) as Array<{code: string; name: string; coordinates: number[][][]}>}
              height="600px"
            />
          </GlassCard>
        )}

        {/* Lista de parcelas */}
        {isLoading ? (
          <GlassCard className="p-12 text-center">
            <p className="text-green-600">Cargando parcelas...</p>
          </GlassCard>
        ) : parcels && parcels.length > 0 ? (
          <GlassCard className="overflow-hidden p-6" hover={false}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-green-200">
                    <th className="pb-3 pr-8 text-left text-sm font-semibold text-green-900">Código</th>
                    <th className="pb-3 pr-8 text-left text-sm font-semibold text-green-900">Nombre</th>
                    <th className="pb-3 pr-8 text-center text-sm font-semibold text-green-900">Estado</th>
                    <th className="pb-3 pr-8 text-center text-sm font-semibold text-green-900">Polígono</th>
                    <th className="pb-3 text-center text-sm font-semibold text-green-900">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {parcels.map((parcel) => (
                    <tr
                      key={parcel.id}
                      className="border-b border-green-100 transition-colors hover:bg-green-50/50"
                    >
                      <td className="py-3 pr-8 text-sm font-semibold text-green-900">{parcel.code}</td>
                      <td className="py-3 pr-8 text-sm text-green-900">{parcel.name}</td>
                      <td className="py-3 pr-8 text-center">
                        {parcel.isActive ? (
                          <span className="inline-flex items-center gap-1 text-sm text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            Activa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-sm text-gray-500">
                            <XCircle className="h-4 w-4" />
                            Inactiva
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-8 text-center text-sm text-green-700">
                        {parcel.polygon ? "✓ Definido" : "✗ Sin definir"}
                      </td>
                      <td className="py-3 text-center">
                        <div className="flex justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(parcel)}
                            className="border-green-300 text-green-700 hover:bg-green-50"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(parcel.code)}
                            className="border-red-300 text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        ) : (
          <GlassCard className="p-12 text-center">
            <MapPin className="mx-auto mb-4 h-16 w-16 text-green-300" />
            <h3 className="mb-2 text-lg font-semibold text-green-900">No hay parcelas registradas</h3>
            <p className="mb-4 text-green-700">
              Crea una parcela manualmente o carga desde un archivo KML/KMZ
            </p>
            <Button onClick={openCreateDialog} className="bg-green-600 hover:bg-green-700">
              <Plus className="mr-2 h-4 w-4" />
              Crear Primera Parcela
            </Button>
          </GlassCard>
        )}

        {/* Dialog para crear/editar parcela */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="bg-white">
            <DialogHeader>
              <DialogTitle className="text-green-900">
                {editingParcel ? "Editar Parcela" : "Nueva Parcela"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="code">Código de Parcela</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Ej: 232"
                  disabled={!!editingParcel}
                />
              </div>
              <div>
                <Label htmlFor="name">Nombre de Parcela</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: LOS ELOTES"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeDialog}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={createParcel.isPending || updateParcel.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {createParcel.isPending || updateParcel.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
