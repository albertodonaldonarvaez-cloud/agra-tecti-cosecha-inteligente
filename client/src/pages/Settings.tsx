import { Loading } from "@/components/Loading";
import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Settings as SettingsIcon, Upload, RefreshCw, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Settings() {
  const { user, loading } = useAuth();
  const [apiUrl, setApiUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [assetId, setAssetId] = useState("");
  const [jsonData, setJsonData] = useState("");
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [downloadPhotos, setDownloadPhotos] = useState(true);

  const { data: config } = trpc.apiConfig.get.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const saveConfig = trpc.apiConfig.save.useMutation({
    onSuccess: () => {
      toast.success("Configuración guardada correctamente");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const syncFromKobo = trpc.boxes.sync.useMutation({
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success(`¡Sincronización exitosa! ${data.processedCount} de ${data.totalCount} cajas procesadas`);
        if (data.errors && data.errors.length > 0) {
          console.warn("Errores durante la sincronización:", data.errors);
        }
      } else {
        toast.error(data.message || "Error en la sincronización");
      }
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const uploadExcel = trpc.boxes.uploadExcel.useMutation({
    onSuccess: (data: any) => {
      toast.success(`¡Carga exitosa! ${data.successRows} filas procesadas, ${data.errorRows} errores`);
      setExcelFile(null);
      if (data.errors && data.errors.length > 0) {
        toast.info(`Revisa la página de Errores para más detalles`);
      }
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const uploadJson = trpc.boxes.uploadJson.useMutation({
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success(`¡Carga exitosa! ${data.processedCount} de ${data.totalCount} cajas procesadas`);
        setJsonData("");
        if (data.errors && data.errors.length > 0) {
          console.warn("Errores durante la carga:", data.errors);
        }
      } else {
        toast.error(data.message || "Error en la carga");
      }
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const clearAllBoxes = trpc.boxes.clearAll.useMutation({
    onSuccess: () => {
      toast.success("Todas las cajas han sido eliminadas. Puedes volver a sincronizar.");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  useEffect(() => {
    if (config) {
      setApiUrl(config.apiUrl || "");
      setApiToken(config.apiToken || "");
      setAssetId(config.assetId || "");
    }
  }, [config]);

  if (loading || !user) {
    return <Loading />;
  }

  if (user.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50">
        <GlassCard className="p-8 text-center">
          <h2 className="mb-2 text-2xl font-bold text-green-900">Acceso Denegado</h2>
          <p className="text-green-600">Solo los administradores pueden acceder a esta página</p>
        </GlassCard>
      </div>
    );
  }

  const handleSaveConfig = () => {
    saveConfig.mutate({ apiUrl, apiToken, assetId });
  };

  const handleSync = () => {
    syncFromKobo.mutate();
  };

  const handleUploadExcel = async () => {
    if (!excelFile) {
      toast.error("Por favor selecciona un archivo Excel");
      return;
    }
    
    try {
      // Subir archivo al servidor
      const formData = new FormData();
      formData.append("file", excelFile);
      
      const response = await fetch("/api/upload-excel", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Error al subir el archivo");
      }
      
      const { filePath, fileName } = await response.json();
      
      // Procesar el archivo subido
      uploadExcel.mutate({ 
        filePath, 
        fileName,
        downloadPhotos 
      });
    } catch (error: any) {
      toast.error(error.message || "Error al subir el archivo");
    }
  };

  const handleUploadJson = () => {
    if (!jsonData.trim()) {
      toast.error("Por favor ingresa datos JSON válidos");
      return;
    }
    try {
      const parsed = JSON.parse(jsonData);
      uploadJson.mutate({ jsonData: parsed });
    } catch (e) {
      toast.error("JSON inválido");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container max-w-4xl">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold text-green-900">Configuración</h1>
          <p className="text-green-700">Gestiona la conexión con KoboToolbox y sincroniza datos</p>
        </div>

        <div className="space-y-6">
          {/* Configuración de API */}
          <GlassCard className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <SettingsIcon className="h-6 w-6 text-green-600" />
              <h2 className="text-2xl font-semibold text-green-900">API de KoboToolbox</h2>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="apiUrl">URL de la API</Label>
                <Input
                  id="apiUrl"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://kf.kobotoolbox.org"
                />
              </div>

              <div>
                <Label htmlFor="apiToken">Token de API</Label>
                <Input
                  id="apiToken"
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Tu token de API"
                />
              </div>

              <div>
                <Label htmlFor="assetId">Asset ID</Label>
                <Input
                  id="assetId"
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                  placeholder="ID del formulario"
                />
              </div>

              <Button 
                onClick={handleSaveConfig} 
                disabled={saveConfig.isPending}
                className="w-full"
              >
                {saveConfig.isPending ? "Guardando..." : "Guardar Configuración"}
              </Button>
            </div>
          </GlassCard>

          {/* Carga de Excel */}
          <GlassCard className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6 text-green-600" />
              <h2 className="text-2xl font-semibold text-green-900">Carga desde Excel</h2>
            </div>

            <p className="mb-4 text-sm text-green-600">
              Carga datos desde un archivo Excel con validación automática y descarga de fotos
            </p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="excelFile">Archivo Excel (.xlsx)</Label>
                <Input
                  id="excelFile"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="downloadPhotos"
                  checked={downloadPhotos}
                  onChange={(e) => setDownloadPhotos(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="downloadPhotos" className="text-sm">
                  Descargar fotos desde la API de KoboToolbox
                </Label>
              </div>

              <Button 
                onClick={handleUploadExcel} 
                disabled={uploadExcel.isPending || !excelFile}
                className="w-full"
              >
                {uploadExcel.isPending ? "Procesando..." : "Cargar Excel"}
              </Button>
            </div>
          </GlassCard>

          {/* Sincronización */}
          <GlassCard className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <RefreshCw className="h-6 w-6 text-green-600" />
              <h2 className="text-2xl font-semibold text-green-900">Sincronización</h2>
            </div>

            <p className="mb-4 text-sm text-green-600">
              Sincroniza los datos más recientes desde KoboToolbox
            </p>

            <Button 
              onClick={handleSync} 
              disabled={syncFromKobo.isPending}
              className="w-full"
            >
              {syncFromKobo.isPending ? "Sincronizando..." : "Sincronizar Datos"}
            </Button>
          </GlassCard>

          {/* Carga Manual */}
          <GlassCard className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <Upload className="h-6 w-6 text-green-600" />
              <h2 className="text-2xl font-semibold text-green-900">Carga Manual de JSON</h2>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="jsonData">Datos JSON</Label>
                <Textarea
                  id="jsonData"
                  value={jsonData}
                  onChange={(e) => setJsonData(e.target.value)}
                  placeholder='{"results": [...]}'
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>

              <Button 
                onClick={handleUploadJson} 
                disabled={uploadJson.isPending}
                className="w-full"
              >
                {uploadJson.isPending ? "Cargando..." : "Cargar JSON"}
              </Button>
            </div>
          </GlassCard>

          {/* Limpiar Base de Datos */}
          <GlassCard className="p-6 border-2 border-red-200">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              <h2 className="text-2xl font-semibold text-red-900">Zona de Peligro</h2>
            </div>

            <p className="mb-4 text-sm text-red-600">
              <strong>Atención:</strong> Esta acción eliminará todas las cajas de la base de datos. 
              Usa esto solo si necesitas volver a sincronizar desde cero.
            </p>

            <Button 
              onClick={() => {
                if (window.confirm("¿Estás seguro? Esta acción eliminará TODAS las cajas registradas.")) {
                  clearAllBoxes.mutate();
                }
              }} 
              disabled={clearAllBoxes.isPending}
              variant="destructive"
              className="w-full"
            >
              {clearAllBoxes.isPending ? "Eliminando..." : "Limpiar Todas las Cajas"}
            </Button>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
