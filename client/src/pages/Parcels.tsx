import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, Plus, Edit, Trash2, MapPin, FileUp } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Switch } from "@/components/ui/switch";

export default function Parcels() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [editingParcel, setEditingParcel] = useState<any>(null);
  const [newParcel, setNewParcel] = useState({ code: "", name: "" });
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const { data: parcels, refetch } = trpc.parcels.list.useQuery();
  const createMutation = trpc.parcels.create.useMutation({
    onSuccess: () => {
      toast.success("Parcela creada exitosamente");
      setIsCreateOpen(false);
      setNewParcel({ code: "", name: "" });
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.parcels.update.useMutation({
    onSuccess: () => {
      toast.success("Parcela actualizada exitosamente");
      setEditingParcel(null);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const toggleActiveMutation = trpc.parcels.toggleActive.useMutation({
    onSuccess: () => {
      toast.success("Estado de parcela actualizado");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.parcels.delete.useMutation({
    onSuccess: () => {
      toast.success("Parcela eliminada");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const uploadKMLMutation = trpc.parcels.uploadKML.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.parcelsProcessed} parcelas procesadas desde KML/KMZ`);
      setIsUploadOpen(false);
      setUploadFile(null);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleCreateParcel = () => {
    if (!newParcel.code || !newParcel.name) {
      toast.error("Por favor completa todos los campos");
      return;
    }
    createMutation.mutate({ ...newParcel, isActive: true });
  };

  const handleUpdateParcel = () => {
    if (!editingParcel) return;
    updateMutation.mutate({
      code: editingParcel.code,
      name: editingParcel.name,
      isActive: editingParcel.isActive,
    });
  };

  const handleFileUpload = async () => {
    if (!uploadFile) {
      toast.error("Por favor selecciona un archivo");
      return;
    }

    const fileType = uploadFile.name.toLowerCase().endsWith('.kmz') ? 'kmz' : 'kml';
    
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result;
        if (!content) return;

        let fileContent: string;
        if (fileType === 'kmz') {
          // Para KMZ, convertir a base64
          fileContent = btoa(
            new Uint8Array(content as ArrayBuffer)
              .reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
        } else {
          // Para KML, usar como texto
          fileContent = content as string;
        }

        uploadKMLMutation.mutate({ fileContent, fileType });
      };

      if (fileType === 'kmz') {
        reader.readAsArrayBuffer(uploadFile);
      } else {
        reader.readAsText(uploadFile);
      }
    } catch (error) {
      toast.error("Error leyendo el archivo");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-green-900">Gestión de Parcelas</h1>
            <p className="text-green-600">Administra las parcelas y sus polígonos geográficos</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <FileUp className="h-4 w-4" />
                  Cargar KML/KMZ
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cargar Polígonos desde KML/KMZ</DialogTitle>
                  <DialogDescription>
                    Sube un archivo KML o KMZ con los polígonos de las parcelas
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="kml-file">Archivo KML/KMZ</Label>
                    <Input
                      id="kml-file"
                      type="file"
                      accept=".kml,.kmz"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    />
                  </div>
                  <Button 
                    onClick={handleFileUpload} 
                    disabled={!uploadFile || uploadKMLMutation.isPending}
                    className="w-full"
                  >
                    {uploadKMLMutation.isPending ? "Procesando..." : "Cargar Polígonos"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Nueva Parcela
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear Nueva Parcela</DialogTitle>
                  <DialogDescription>
                    Agrega una nueva parcela al sistema
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="code">Código de Parcela</Label>
                    <Input
                      id="code"
                      value={newParcel.code}
                      onChange={(e) => setNewParcel({ ...newParcel, code: e.target.value })}
                      placeholder="ej: 232"
                    />
                  </div>
                  <div>
                    <Label htmlFor="name">Nombre de Parcela</Label>
                    <Input
                      id="name"
                      value={newParcel.name}
                      onChange={(e) => setNewParcel({ ...newParcel, name: e.target.value })}
                      placeholder="ej: LOS ELOTES"
                    />
                  </div>
                  <Button 
                    onClick={handleCreateParcel} 
                    disabled={createMutation.isPending}
                    className="w-full"
                  >
                    {createMutation.isPending ? "Creando..." : "Crear Parcela"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Parcelas Registradas</CardTitle>
            <CardDescription>
              {parcels?.length || 0} parcelas en total
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Polígono</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parcels?.map((parcel) => (
                  <TableRow key={parcel.code}>
                    <TableCell className="font-mono font-semibold">{parcel.code}</TableCell>
                    <TableCell>{parcel.name}</TableCell>
                    <TableCell>
                      {parcel.polygon ? (
                        <Badge variant="outline" className="gap-1">
                          <MapPin className="h-3 w-3" />
                          Definido
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Sin polígono</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={parcel.isActive}
                          onCheckedChange={(checked) =>
                            toggleActiveMutation.mutate({ code: parcel.code, isActive: checked })
                          }
                        />
                        <span className="text-sm">
                          {parcel.isActive ? "Activa" : "Inactiva"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingParcel(parcel)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`¿Eliminar parcela ${parcel.code}?`)) {
                              deleteMutation.mutate({ code: parcel.code });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Dialog de edición */}
        <Dialog open={!!editingParcel} onOpenChange={() => setEditingParcel(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Parcela</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Código</Label>
                <Input value={editingParcel?.code || ""} disabled />
              </div>
              <div>
                <Label htmlFor="edit-name">Nombre</Label>
                <Input
                  id="edit-name"
                  value={editingParcel?.name || ""}
                  onChange={(e) =>
                    setEditingParcel({ ...editingParcel, name: e.target.value })
                  }
                />
              </div>
              <Button 
                onClick={handleUpdateParcel} 
                disabled={updateMutation.isPending}
                className="w-full"
              >
                {updateMutation.isPending ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
