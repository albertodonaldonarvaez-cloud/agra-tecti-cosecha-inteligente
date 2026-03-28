import { Loading } from "@/components/Loading";
import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Settings as SettingsIcon, Upload, RefreshCw, AlertTriangle, FileSpreadsheet, MapPin, Save, Clock, Timer, CheckCircle, XCircle, Zap, Send, MessageCircle, Eye, EyeOff, Plane, Link2, Unlink, Wheat, ClipboardList } from "lucide-react";
import LocationMapPicker from "@/components/LocationMapPicker";
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
  const [historicalFile, setHistoricalFile] = useState<File | null>(null);
  const [downloadHistoricalPhotos, setDownloadHistoricalPhotos] = useState(false);
  const [syncDate, setSyncDate] = useState("");
  const [locationName, setLocationName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [timezone, setTimezone] = useState("America/Mexico_City");

  const { data: config } = trpc.apiConfig.get.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const { data: locationConfig, refetch: refetchLocation } = trpc.locationConfig.get.useQuery(undefined, {
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

  const saveLocation = trpc.locationConfig.save.useMutation({
    onSuccess: () => {
      toast.success("Configuración de ubicación guardada");
      refetchLocation();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const syncFromKobo = trpc.boxes.sync.useMutation({
    onSuccess: (data: any) => {
      // Sincronización en segundo plano
      if (data.status === 'started') {
        toast.success('🔄 Sincronización iniciada en segundo plano. Los datos se actualizarán automáticamente.', {
          duration: 5000,
        });
        // Refrescar datos después de un tiempo
        setTimeout(() => {
          window.location.reload();
        }, 30000); // Recargar después de 30 segundos
      } else if (data.success) {
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

  const uploadHistorical = trpc.boxes.uploadHistorical.useMutation({
    onSuccess: (data: any) => {
      toast.success(`¡Datos históricos cargados! ${data.successRows} nuevos, ${data.skippedRows} omitidos, ${data.errorRows} errores`);
      setHistoricalFile(null);
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

  useEffect(() => {
    if (locationConfig) {
      setLocationName(locationConfig.locationName);
      setLatitude(locationConfig.latitude);
      setLongitude(locationConfig.longitude);
      setTimezone(locationConfig.timezone);
    }
  }, [locationConfig]);

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

  const handleLocationChange = (lat: string, lng: string) => {
    setLatitude(lat);
    setLongitude(lng);
  };

  const handleSaveLocation = () => {
    if (!locationName || !latitude || !longitude) {
      toast.error("Por favor completa todos los campos");
      return;
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    if (isNaN(lat) || lat < -90 || lat > 90) {
      toast.error("Latitud inválida (debe estar entre -90 y 90)");
      return;
    }
    
    if (isNaN(lng) || lng < -180 || lng > 180) {
      toast.error("Longitud inválida (debe estar entre -180 y 180)");
      return;
    }

    saveLocation.mutate({
      locationName,
      latitude,
      longitude,
      timezone,
    });
  };

  const handleSync = () => {
    if (syncDate) {
      // Sincronizar solo un día específico
      syncFromKobo.mutate({ date: syncDate });
    } else {
      // Sincronizar todo
      syncFromKobo.mutate();
    }
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

  const handleUploadHistorical = async () => {
    if (!historicalFile) {
      toast.error("Por favor selecciona un archivo Excel con datos históricos");
      return;
    }
    
    try {
      // Subir archivo al servidor
      const formData = new FormData();
      formData.append("file", historicalFile);
      
      const response = await fetch("/api/upload-historical", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Error al subir el archivo");
      }
      
      const { filePath, fileName } = await response.json();
      
      // Procesar el archivo subido
      uploadHistorical.mutate({ 
        filePath, 
        fileName,
        downloadPhotos: downloadHistoricalPhotos 
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
      <div className="container max-w-4xl px-3 md:px-6">
        <div className="mb-6 md:mb-8">
          <h1 className="mb-2 text-2xl md:text-4xl font-bold text-green-900">Configuración</h1>
          <p className="text-xs md:text-base text-green-700">Gestiona la conexión con KoboToolbox y sincroniza datos</p>
        </div>

        <div className="space-y-6">
          {/* Configuración de API */}
          <GlassCard className="p-4 md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <SettingsIcon className="h-5 w-5 md:h-6 md:w-6 text-green-600" />
              <h2 className="text-lg md:text-2xl font-semibold text-green-900">API de KoboToolbox</h2>
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
          <GlassCard className="p-4 md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 md:h-6 md:w-6 text-green-600" />
              <h2 className="text-lg md:text-2xl font-semibold text-green-900">Carga desde Excel</h2>
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

          {/* Carga de Datos Históricos */}
          <GlassCard className="p-4 md:p-6 border-2 border-amber-200 bg-amber-50/30">
            <div className="mb-4 flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6 text-amber-600" />
              <h2 className="text-lg md:text-2xl font-semibold text-amber-900">Datos Históricos</h2>
            </div>

            <p className="mb-4 text-sm text-amber-700">
              Importa datos anteriores al sistema. Usa la columna <strong>'start'</strong> del Excel para obtener la fecha y hora exacta de cada registro.
            </p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="historicalFile">Archivo Excel con datos históricos (.xlsx)</Label>
                <Input
                  id="historicalFile"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setHistoricalFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="downloadHistoricalPhotos"
                  checked={downloadHistoricalPhotos}
                  onChange={(e) => setDownloadHistoricalPhotos(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="downloadHistoricalPhotos" className="text-sm">
                  Descargar fotos (puede ser lento para muchos registros)
                </Label>
              </div>

              <div className="rounded-lg bg-amber-100 p-3 text-sm text-amber-800">
                <strong>⚠️ Importante:</strong> El archivo debe tener una columna <code className="bg-amber-200 px-1 rounded">start</code> con la fecha y hora en formato <code className="bg-amber-200 px-1 rounded">YYYY-MM-DD HH:MM:SS</code>
              </div>

              <Button 
                onClick={handleUploadHistorical} 
                disabled={uploadHistorical.isPending || !historicalFile}
                className="w-full bg-amber-600 hover:bg-amber-700"
              >
                {uploadHistorical.isPending ? "Procesando datos históricos..." : "Importar Datos Históricos"}
              </Button>
            </div>
          </GlassCard>

          {/* Sincronización */}
          <GlassCard className="p-4 md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <RefreshCw className="h-6 w-6 text-green-600" />
              <h2 className="text-lg md:text-2xl font-semibold text-green-900">Sincronización</h2>
            </div>

            <p className="mb-4 text-sm text-green-600">
              Sincroniza los datos más recientes desde KoboToolbox
            </p>

            <div className="mb-4">
              <Label htmlFor="syncDate">Fecha Específica (Opcional)</Label>
              <Input
                id="syncDate"
                type="date"
                value={syncDate}
                onChange={(e) => setSyncDate(e.target.value)}
                placeholder="Dejar vacío para sincronizar todo"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-gray-500">
                {syncDate 
                  ? `Sincronizará solo los datos del ${new Date(syncDate + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`
                  : "Dejar vacío para sincronizar todos los datos disponibles"}
              </p>
            </div>

            <Button 
              onClick={handleSync} 
              disabled={syncFromKobo.isPending}
              className="w-full"
            >
              {syncFromKobo.isPending ? "Sincronizando..." : syncDate ? "Sincronizar Día Específico" : "Sincronizar Todos los Datos"}
            </Button>
          </GlassCard>

          {/* Sincronización Automática */}
          <AutoSyncSection />

          {/* Notificaciones Telegram */}
          <TelegramSection />

          {/* Resumen de Cosecha por Telegram */}
          <HarvestTelegramSection />

          {/* Notificaciones de Notas de Campo */}
          <FieldNotesTelegramSection />

          {/* WebODM */}
          <WebODMSection />

          {/* Carga Manual */}
          <GlassCard className="p-4 md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Upload className="h-6 w-6 text-green-600" />
              <h2 className="text-lg md:text-2xl font-semibold text-green-900">Carga Manual de JSON</h2>
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

          {/* Configuración de Ubicación */}
          <GlassCard className="p-4 md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <MapPin className="h-6 w-6 text-green-600" />
              <h2 className="text-lg md:text-2xl font-semibold text-green-900">Ubicación para Datos Meteorológicos</h2>
            </div>

            <p className="mb-4 text-sm text-green-600">
              Configure la ubicación de su zona para obtener datos de temperatura en Analytics
            </p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="locationName">Nombre de la Ubicación</Label>
                <Input
                  id="locationName"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="Ej: Santa Rosa Treinta"
                />
              </div>

              <LocationMapPicker
                latitude={latitude}
                longitude={longitude}
                onLocationChange={handleLocationChange}
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="latitude">Latitud</Label>
                  <Input
                    id="latitude"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="Ej: 18.693"
                    type="number"
                    step="0.000001"
                  />
                </div>

                <div>
                  <Label htmlFor="longitude">Longitud</Label>
                  <Input
                    id="longitude"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="Ej: -99.182"
                    type="number"
                    step="0.000001"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="timezone">Zona Horaria</Label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="America/Mexico_City">América/Ciudad de México (UTC-6)</option>
                  <option value="America/Cancun">América/Cancún (UTC-5)</option>
                  <option value="America/Tijuana">América/Tijuana (UTC-8)</option>
                </select>
              </div>

              <div className="rounded-lg bg-green-50 p-4">
                <h3 className="mb-2 font-semibold text-green-900">🌡️ Fuente de Datos</h3>
                <p className="text-sm text-green-800">
                  Los datos de temperatura se obtienen de <strong>Open-Meteo</strong>, una API gratuita que proporciona datos meteorológicos históricos.
                </p>
                <p className="mt-2 text-xs text-green-700">
                  ⚠️ Se recomienda usar estaciones meteorológicas locales para mejorar la precisión.
                </p>
              </div>

              <Button
                onClick={handleSaveLocation}
                disabled={saveLocation.isPending}
                className="w-full"
              >
                <Save className="mr-2 h-4 w-4" />
                {saveLocation.isPending ? "Guardando..." : "Guardar Ubicación"}
              </Button>
            </div>
          </GlassCard>

          {/* Limpiar Base de Datos */}
          <GlassCard className="p-4 md:p-6 border-2 border-red-200">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              <h2 className="text-lg md:text-2xl font-semibold text-red-900">Zona de Peligro</h2>
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

// Componente de Sincronización Automática
function AutoSyncSection() {
  const TIMEZONE = "America/Mexico_City";

  const { data: syncStatus, refetch } = trpc.autoSync.status.useQuery(undefined, {
    refetchInterval: 30000, // Actualizar cada 30 segundos
  });

  const triggerSync = trpc.autoSync.trigger.useMutation({
    onSuccess: (data: any) => {
      if (data.status === "success") {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const updateHours = trpc.autoSync.updateHours.useMutation({
    onSuccess: () => {
      toast.success("Horarios actualizados correctamente");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const [hour1, setHour1] = useState(7);
  const [hour2, setHour2] = useState(15);

  useEffect(() => {
    if (syncStatus?.syncHours) {
      const hours = syncStatus.syncHours.map((h: string) => parseInt(h));
      if (hours.length >= 1) setHour1(hours[0]);
      if (hours.length >= 2) setHour2(hours[1]);
    }
  }, [syncStatus]);

  const handleUpdateHours = () => {
    const hours = [hour1, hour2].sort((a, b) => a - b);
    updateHours.mutate({ hours });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Nunca";
    const date = new Date(dateStr);
    return date.toLocaleString("es-MX", {
      timeZone: TIMEZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <GlassCard className="p-4 md:p-6 border-2 border-blue-200 bg-blue-50/30">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer className="h-6 w-6 text-blue-600" />
          <h2 className="text-lg md:text-2xl font-semibold text-blue-900">Sincronización Automática</h2>
        </div>
        {syncStatus?.isActive && (
          <span className="flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Activo
          </span>
        )}
      </div>

      <p className="mb-4 text-sm text-blue-700">
        La sincronización automática con KoboToolbox se ejecuta en los horarios configurados sin necesidad de intervención manual.
      </p>

      {/* Estado actual */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-white/60 p-3 text-center">
          <p className="text-xs text-gray-500">Estado</p>
          <p className="text-sm font-semibold text-green-700">
            {syncStatus?.isRunning ? "⏳ Sincronizando..." : syncStatus?.isActive ? "✅ Activo" : "⏸️ Inactivo"}
          </p>
        </div>
        <div className="rounded-lg bg-white/60 p-3 text-center">
          <p className="text-xs text-gray-500">Última ejecución</p>
          <p className="text-sm font-semibold text-gray-700">
            {formatDate(syncStatus?.lastRun || null)}
          </p>
        </div>
        <div className="rounded-lg bg-white/60 p-3 text-center">
          <p className="text-xs text-gray-500">Próxima ejecución</p>
          <p className="text-sm font-semibold text-blue-700">
            {formatDate(syncStatus?.nextRun || null)}
          </p>
        </div>
      </div>

      {/* Configuración de horarios */}
      <div className="mb-4 space-y-3">
        <Label className="text-blue-800 font-medium">Horarios de sincronización (hora de México)</Label>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Label htmlFor="hour1" className="text-xs text-gray-500">Mañana</Label>
            <select
              id="hour1"
              value={hour1}
              onChange={(e) => setHour1(parseInt(e.target.value))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {String(i).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <Label htmlFor="hour2" className="text-xs text-gray-500">Tarde</Label>
            <select
              id="hour2"
              value={hour2}
              onChange={(e) => setHour2(parseInt(e.target.value))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {String(i).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </div>
          <div className="pt-4">
            <Button
              onClick={handleUpdateHours}
              disabled={updateHours.isPending}
              size="sm"
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-100"
            >
              <Clock className="mr-1 h-4 w-4" />
              {updateHours.isPending ? "..." : "Guardar"}
            </Button>
          </div>
        </div>
        <p className="text-xs text-gray-400">Zona horaria: America/Mexico_City (CST/CDT)</p>
      </div>

      {/* Botón de sincronización manual */}
      <Button
        onClick={() => triggerSync.mutate()}
        disabled={triggerSync.isPending || syncStatus?.isRunning}
        className="w-full bg-blue-600 hover:bg-blue-700"
      >
        <Zap className="mr-2 h-4 w-4" />
        {triggerSync.isPending || syncStatus?.isRunning
          ? "Sincronizando..."
          : "Ejecutar Sincronización Ahora"}
      </Button>

      {/* Historial de sincronizaciones */}
      {syncStatus?.history && syncStatus.history.length > 0 && (
        <div className="mt-4">
          <Label className="text-blue-800 font-medium">Historial reciente</Label>
          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-blue-200 bg-white/60">
            {syncStatus.history.map((log: any, i: number) => (
              <div
                key={i}
                className={`flex items-start gap-2 border-b border-blue-100 px-3 py-2 text-xs last:border-0 ${
                  log.status === "success" ? "text-green-700" : "text-red-700"
                }`}
              >
                {log.status === "success" ? (
                  <CheckCircle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                ) : (
                  <XCircle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p>{log.message}</p>
                  <p className="text-gray-400">
                    {new Date(log.timestamp).toLocaleString("es-MX", {
                      timeZone: TIMEZONE,
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// Componente de Configuración de Telegram
function TelegramSection() {
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [showToken, setShowToken] = useState(false);

  const { data: telegramConfig, refetch } = trpc.telegram.getConfig.useQuery(undefined, {
    retry: false,
  });

  const saveTelegramConfig = trpc.telegram.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuración de Telegram guardada correctamente");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const testTelegram = trpc.telegram.test.useMutation({
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success("Mensaje de prueba enviado correctamente. Revisa tu chat de Telegram.");
      } else {
        toast.error(`Error: ${data.error}`);
      }
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (telegramConfig) {
      setBotToken(telegramConfig.botToken || "");
      setChatId(telegramConfig.chatId || "");
    }
  }, [telegramConfig]);

  const handleSave = () => {
    if (!botToken.trim() || !chatId.trim()) {
      toast.error("Por favor completa ambos campos");
      return;
    }
    saveTelegramConfig.mutate({ botToken: botToken.trim(), chatId: chatId.trim() });
  };

  const handleTest = () => {
    if (!botToken.trim() || !chatId.trim()) {
      toast.error("Por favor completa ambos campos antes de probar");
      return;
    }
    testTelegram.mutate({ botToken: botToken.trim(), chatId: chatId.trim() });
  };

  const isConfigured = !!(telegramConfig?.botToken && telegramConfig?.chatId);

  return (
    <GlassCard className="p-4 md:p-6 border-2 border-purple-200 bg-purple-50/30">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-purple-600" />
          <h2 className="text-lg md:text-2xl font-semibold text-purple-900">Notificaciones Telegram</h2>
        </div>
        {isConfigured && (
          <span className="flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Configurado
          </span>
        )}
      </div>

      <p className="mb-4 text-sm text-purple-700">
        Recibe notificaciones en un grupo o chat de Telegram después de cada sincronización con detalles de errores detectados: códigos duplicados, peso mayor a 15 kg, parcelas sin polígono, etc.
      </p>

      {/* Instrucciones */}
      <div className="mb-4 rounded-lg bg-purple-100/60 p-4 text-sm text-purple-800">
        <p className="font-semibold mb-2">Cómo configurar:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Busca <strong>@BotFather</strong> en Telegram y crea un bot con <code className="bg-purple-200 px-1 rounded">/newbot</code></li>
          <li>Copia el <strong>Token</strong> que te da BotFather</li>
          <li>Agrega el bot a tu grupo de Telegram</li>
          <li>Obtén el <strong>Chat ID</strong> del grupo (busca <strong>@getmyid_bot</strong> en Telegram)</li>
          <li>Pega ambos valores aquí y haz clic en "Probar Conexión"</li>
        </ol>
      </div>

      <div className="space-y-4">
        {/* Bot Token */}
        <div>
          <Label htmlFor="telegramToken" className="text-purple-800">Token del Bot</Label>
          <div className="relative">
            <Input
              id="telegramToken"
              type={showToken ? "text" : "password"}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Chat ID */}
        <div>
          <Label htmlFor="telegramChatId" className="text-purple-800">Chat ID del Grupo</Label>
          <Input
            id="telegramChatId"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="-1001234567890"
          />
          <p className="mt-1 text-xs text-purple-600">
            Para grupos, el Chat ID suele empezar con <code className="bg-purple-100 px-1 rounded">-100</code>
          </p>
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            disabled={saveTelegramConfig.isPending}
            className="flex-1 bg-purple-600 hover:bg-purple-700"
          >
            <Save className="mr-2 h-4 w-4" />
            {saveTelegramConfig.isPending ? "Guardando..." : "Guardar"}
          </Button>
          <Button
            onClick={handleTest}
            disabled={testTelegram.isPending || !botToken.trim() || !chatId.trim()}
            variant="outline"
            className="flex-1 border-purple-300 text-purple-700 hover:bg-purple-100"
          >
            <Send className="mr-2 h-4 w-4" />
            {testTelegram.isPending ? "Enviando..." : "Probar Conexión"}
          </Button>
        </div>

        {/* Info de notificaciones */}
        <div className="rounded-lg bg-white/60 p-4 text-sm">
          <p className="font-semibold text-purple-900 mb-2">Las notificaciones incluyen:</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-gray-700">
              <span className="text-red-500">🔴</span> Códigos de caja duplicados
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span className="text-yellow-500">🟡</span> Cajas con peso mayor a 15 kg
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span className="text-orange-500">🟠</span> Parcelas sin polígono definido
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span className="text-blue-500">📊</span> Resumen de sincronización
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}


// ============ SECCIÓN RESUMEN COSECHA TELEGRAM ============
function HarvestTelegramSection() {
  const [chatId, setChatId] = useState("");
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(0);
  const [enabled, setEnabled] = useState(false);

  const { data: harvestConfig, refetch } = trpc.telegram.getHarvestConfig.useQuery(undefined, { retry: false });
  const { data: telegramConfig } = trpc.telegram.getConfig.useQuery(undefined, { retry: false });

  const saveConfig = trpc.telegram.saveHarvestConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuración de resumen de cosecha guardada");
      refetch();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const testHarvest = trpc.telegram.testHarvest.useMutation({
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success("Mensaje de prueba enviado. Revisa tu chat de Telegram.");
      } else {
        toast.error(`Error: ${data.error}`);
      }
    },
    onError: (error: any) => toast.error(error.message),
  });

  useEffect(() => {
    if (harvestConfig) {
      setChatId(harvestConfig.chatId || "");
      setHour(harvestConfig.hour ?? 7);
      setMinute(harvestConfig.minute ?? 0);
      setEnabled(harvestConfig.enabled ?? false);
    }
  }, [harvestConfig]);

  const handleSave = () => {
    if (!chatId.trim()) {
      toast.error("Por favor ingresa el Chat ID");
      return;
    }
    saveConfig.mutate({ chatId: chatId.trim(), hour, minute, enabled });
  };

  const handleTest = () => {
    if (!telegramConfig?.botToken) {
      toast.error("Primero configura el Token del Bot en la sección de Telegram arriba");
      return;
    }
    if (!chatId.trim()) {
      toast.error("Por favor ingresa el Chat ID antes de probar");
      return;
    }
    testHarvest.mutate({ botToken: telegramConfig.botToken, chatId: chatId.trim() });
  };

  const botConfigured = !!telegramConfig?.botToken;

  return (
    <GlassCard className="p-4 md:p-6 border-2 border-amber-200 bg-amber-50/30">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wheat className="h-6 w-6 text-amber-600" />
          <h2 className="text-lg md:text-2xl font-semibold text-amber-900">Resumen Diario de Cosecha</h2>
        </div>
        {enabled && chatId && (
          <span className="flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Activo
          </span>
        )}
      </div>

      <p className="mb-4 text-sm text-amber-700">
        Envía automáticamente un resumen de la cosecha del día anterior a un chat de Telegram independiente.
        Incluye total de cajas, kilos por calidad y desglose por parcela. <strong>No se envía al arrancar el servidor.</strong>
      </p>

      {!botConfigured && (
        <div className="mb-4 rounded-lg bg-amber-100/80 p-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Primero configura el Token del Bot en la sección "Notificaciones Telegram" de arriba. Este resumen usa el mismo bot.
        </div>
      )}

      <div className="space-y-4">
        {/* Habilitado */}
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
          </label>
          <span className="text-sm font-medium text-amber-800">
            {enabled ? "Envío automático activado" : "Envío automático desactivado"}
          </span>
        </div>

        {/* Chat ID */}
        <div>
          <Label htmlFor="harvestChatId" className="text-amber-800">Chat ID para Resumen de Cosecha</Label>
          <Input
            id="harvestChatId"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="-1001234567890"
          />
          <p className="mt-1 text-xs text-amber-600">
            Puede ser diferente al Chat ID de sincronización. Ideal para un grupo de usuarios finales.
          </p>
        </div>

        {/* Hora y Minuto */}
        <div>
          <Label className="text-amber-800">Hora de envío (hora de México)</Label>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <select
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
                className="px-3 py-2 border border-amber-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                ))}
              </select>
              <span className="text-amber-700 font-bold">:</span>
              <select
                value={minute}
                onChange={(e) => setMinute(Number(e.target.value))}
                className="px-3 py-2 border border-amber-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {Array.from({ length: 60 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                ))}
              </select>
            </div>
            <span className="text-xs text-amber-600">hrs</span>
          </div>
          <p className="mt-1 text-xs text-amber-600">
            El resumen del día anterior se enviará a esta hora todos los días.
          </p>
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            disabled={saveConfig.isPending}
            className="flex-1 bg-amber-600 hover:bg-amber-700"
          >
            <Save className="mr-2 h-4 w-4" />
            {saveConfig.isPending ? "Guardando..." : "Guardar"}
          </Button>
          <Button
            onClick={handleTest}
            disabled={testHarvest.isPending || !chatId.trim() || !botConfigured}
            variant="outline"
            className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-100"
          >
            <Send className="mr-2 h-4 w-4" />
            {testHarvest.isPending ? "Enviando..." : "Probar Envío"}
          </Button>
        </div>

        {/* Info del mensaje */}
        <div className="rounded-lg bg-white/60 p-4 text-sm">
          <p className="font-semibold text-amber-900 mb-2">El resumen incluye:</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-gray-700">
              <span>📦</span> Total de cajas del día
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span>⚖️</span> Kilos totales cosechados
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span>🟢</span> 1ra Calidad (kg y %)
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span>🟡</span> 2da Calidad (kg y %)
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span>🔴</span> Desperdicio (kg y %)
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span>🗺️</span> Desglose por parcela
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

// ============ SECCIÓN NOTAS DE CAMPO TELEGRAM ============
function FieldNotesTelegramSection() {
  const [chatId, setChatId] = useState("");
  const [enabled, setEnabled] = useState(false);

  const { data: fieldNotesConfig, refetch } = trpc.telegram.getFieldNotesConfig.useQuery(undefined, { retry: false });
  const { data: telegramConfig } = trpc.telegram.getConfig.useQuery(undefined, { retry: false });

  const saveConfig = trpc.telegram.saveFieldNotesConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuraci\u00f3n de notas de campo guardada");
      refetch();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const testFieldNotes = trpc.telegram.testFieldNotes.useMutation({
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success("Mensaje de prueba enviado. Revisa tu grupo de Telegram.");
      } else {
        toast.error(`Error: ${data.error}`);
      }
    },
    onError: (error: any) => toast.error(error.message),
  });

  useEffect(() => {
    if (fieldNotesConfig) {
      setChatId(fieldNotesConfig.chatId || "");
      setEnabled(fieldNotesConfig.enabled || false);
    }
  }, [fieldNotesConfig]);

  const handleSave = () => {
    if (!chatId.trim()) {
      toast.error("Ingresa el Chat ID del grupo");
      return;
    }
    saveConfig.mutate({ chatId: chatId.trim(), enabled });
  };

  const handleTest = () => {
    if (!telegramConfig?.botToken) {
      toast.error("Primero configura el Token del Bot en la secci\u00f3n de Telegram arriba");
      return;
    }
    if (!chatId.trim()) {
      toast.error("Ingresa el Chat ID antes de probar");
      return;
    }
    testFieldNotes.mutate({ botToken: telegramConfig.botToken, chatId: chatId.trim() });
  };

  const botConfigured = !!telegramConfig?.botToken;

  return (
    <GlassCard className="p-4 md:p-6 border-2 border-green-200 bg-green-50/30">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-green-600" />
          <h2 className="text-lg md:text-2xl font-semibold text-green-900">Grupo de Notas de Campo</h2>
        </div>
        {enabled && chatId && (
          <span className="flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Activo
          </span>
        )}
      </div>

      <p className="mb-4 text-sm text-green-700">
        Env\u00eda notificaciones al grupo de Telegram cuando se crean nuevas notas de campo
        o cuando cambia el estado de una nota existente. Incluye fotos, ubicaci\u00f3n y detalles del reporte.
      </p>

      {!botConfigured && (
        <div className="mb-4 rounded-lg bg-green-100/80 p-3 text-sm text-green-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Primero configura el Token del Bot en la secci\u00f3n "Notificaciones Telegram" de arriba.
        </div>
      )}

      <div className="space-y-4">
        {/* Habilitado */}
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
          </label>
          <span className="text-sm font-medium text-green-800">
            {enabled ? "Notificaciones activadas" : "Notificaciones desactivadas"}
          </span>
        </div>

        {/* Chat ID */}
        <div>
          <Label htmlFor="fieldNotesChatId" className="text-green-800">Chat ID del Grupo</Label>
          <Input
            id="fieldNotesChatId"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="-1001234567890"
          />
          <p className="mt-1 text-xs text-green-600">
            Agrega el bot al grupo, luego usa @userinfobot para obtener el Chat ID del grupo.
            Los IDs de grupo empiezan con -100.
          </p>
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            disabled={saveConfig.isPending}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <Save className="mr-2 h-4 w-4" />
            {saveConfig.isPending ? "Guardando..." : "Guardar"}
          </Button>
          <Button
            onClick={handleTest}
            disabled={testFieldNotes.isPending || !chatId.trim() || !botConfigured}
            variant="outline"
            className="flex-1 border-green-300 text-green-700 hover:bg-green-100"
          >
            <Send className="mr-2 h-4 w-4" />
            {testFieldNotes.isPending ? "Enviando..." : "Probar Env\u00edo"}
          </Button>
        </div>

        {/* Info */}
        <div className="rounded-lg bg-white/60 p-4 text-sm">
          <p className="font-semibold text-green-900 mb-2">El grupo recibir\u00e1:</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-gray-700">
              <span>\ud83c\udd95</span> Nuevas notas de campo
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span>\ud83d\udcf8</span> Fotos del reporte
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span>\ud83d\udd14</span> Cambios de estado
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span>\u2705</span> Fotos de resoluci\u00f3n
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span>\ud83d\udccd</span> Ubicaci\u00f3n GPS
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span>\ud83d\udccb</span> Folio y detalles
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

// ============ SECCIÓN WebODM ============
function WebODMSection() {
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [mappingParcelId, setMappingParcelId] = useState<number | null>(null);
  const [mappingProjectId, setMappingProjectId] = useState<string>("");

  const utils = trpc.useUtils();

  // Cargar configuración existente
  const { data: config, isLoading: configLoading } = trpc.webodm.getConfig.useQuery();

  // Cargar parcelas y proyectos ODM
  const { data: parcels } = trpc.parcels.list.useQuery();
  const { data: odmProjects, refetch: refetchProjects } = trpc.webodm.getProjects.useQuery(undefined, {
    enabled: !!config?.serverUrl,
    staleTime: 5 * 60 * 1000,
  });
  const { data: odmMappings } = trpc.webodm.getMappings.useQuery();

  // Mutations
  const saveConfigMutation = trpc.webodm.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuración de WebODM guardada");
      utils.webodm.getConfig.invalidate();
      refetchProjects();
    },
    onError: (err) => toast.error(err.message),
  });

  const testMutation = trpc.webodm.testConnection.useMutation({
    onSuccess: (result) => {
      setTestResult(result);
      if (result.success) {
        toast.success(result.message);
        refetchProjects();
      } else {
        toast.error(result.message);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const saveMappingMutation = trpc.webodm.saveMapping.useMutation({
    onSuccess: () => {
      toast.success("Parcela vinculada exitosamente");
      utils.webodm.getMappings.invalidate();
      setMappingParcelId(null);
      setMappingProjectId("");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMappingMutation = trpc.webodm.deleteMapping.useMutation({
    onSuccess: () => {
      toast.success("Vínculo eliminado");
      utils.webodm.getMappings.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Cargar datos existentes
  useEffect(() => {
    if (config) {
      setServerUrl(config.serverUrl || "");
      setUsername(config.username || "");
    }
  }, [config]);

  const handleSaveConfig = () => {
    if (!serverUrl || !username || !password) {
      toast.error("Completa todos los campos");
      return;
    }
    saveConfigMutation.mutate({ serverUrl, username, password });
  };

  return (
    <GlassCard className="p-4 md:p-6 border-2 border-teal-200 bg-teal-50/30" hover={false}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plane className="h-6 w-6 text-teal-600" />
          <h2 className="text-lg md:text-2xl font-semibold text-teal-900">WebODM</h2>
        </div>
        {config?.hasToken && (
          <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
            <CheckCircle className="h-3 w-3" /> Conectado
          </span>
        )}
      </div>

      <p className="text-sm text-teal-700 mb-4">
        Conecta tu instancia de WebODM para visualizar ortomosaicos, modelos de superficie y análisis de vegetación directamente en el sistema.
      </p>

      {/* Configuración de conexión */}
      <div className="space-y-3 mb-6">
        <div>
          <Label className="text-teal-800 text-sm font-medium">URL del Servidor</Label>
          <Input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://odm.tudominio.com"
            className="mt-1 bg-white/60 border-teal-200"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-teal-800 text-sm font-medium">Usuario</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="mt-1 bg-white/60 border-teal-200"
            />
          </div>
          <div>
            <Label className="text-teal-800 text-sm font-medium">Contraseña</Label>
            <div className="relative mt-1">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={config?.hasPassword ? "••••••••" : "Contraseña"}
                className="bg-white/60 border-teal-200 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-teal-500 hover:text-teal-700"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleSaveConfig}
            disabled={saveConfigMutation.isPending}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Save className="h-4 w-4 mr-1" />
            {saveConfigMutation.isPending ? "Guardando..." : "Guardar Configuración"}
          </Button>
          <Button
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending || !config?.serverUrl}
            variant="outline"
            className="border-teal-300 text-teal-700 hover:bg-teal-50"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${testMutation.isPending ? "animate-spin" : ""}`} />
            {testMutation.isPending ? "Probando..." : "Probar Conexión"}
          </Button>
        </div>

        {testResult && (
          <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${
            testResult.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            {testResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {testResult.message}
          </div>
        )}
      </div>

      {/* Vinculación Parcela <-> Proyecto ODM */}
      {config?.serverUrl && (
        <div className="border-t border-teal-200/50 pt-4">
          <h3 className="text-base font-semibold text-teal-800 mb-3 flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular Parcelas con Proyectos ODM
          </h3>

          {/* Mappings existentes */}
          {odmMappings && odmMappings.length > 0 && (
            <div className="space-y-2 mb-4">
              {odmMappings.map((m: any) => {
                const parcel = parcels?.find((p: any) => p.id === m.parcelId);
                const project = odmProjects?.find((p: any) => p.id === m.odmProjectId);
                return (
                  <div key={m.id} className="flex items-center justify-between bg-white/50 rounded-xl p-3 border border-teal-100">
                    <div className="flex items-center gap-3 min-w-0">
                      <MapPin className="h-4 w-4 text-teal-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="font-medium text-teal-900 text-sm">{parcel?.name || parcel?.code || `Parcela #${m.parcelId}`}</span>
                        <span className="text-teal-400 mx-2">→</span>
                        <span className="text-teal-700 text-sm">{project?.name || m.odmProjectName || `Proyecto #${m.odmProjectId}`}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteMappingMutation.mutate({ parcelId: m.parcelId })}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all flex-shrink-0"
                      title="Desvincular"
                    >
                      <Unlink className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Formulario para nuevo vínculo */}
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={mappingParcelId || ""}
              onChange={(e) => setMappingParcelId(e.target.value ? parseInt(e.target.value) : null)}
              className="flex-1 px-3 py-2 bg-white/60 border border-teal-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              <option value="">Seleccionar parcela...</option>
              {parcels?.filter((p: any) => !odmMappings?.some((m: any) => m.parcelId === p.id)).map((p: any) => (
                <option key={p.id} value={p.id}>{p.name || p.code}</option>
              ))}
            </select>
            <select
              value={mappingProjectId}
              onChange={(e) => setMappingProjectId(e.target.value)}
              className="flex-1 px-3 py-2 bg-white/60 border border-teal-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              <option value="">Seleccionar proyecto ODM...</option>
              {odmProjects?.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
              ))}
            </select>
            <Button
              onClick={() => {
                if (!mappingParcelId || !mappingProjectId) {
                  toast.error("Selecciona parcela y proyecto");
                  return;
                }
                const project = odmProjects?.find((p: any) => p.id === parseInt(mappingProjectId));
                saveMappingMutation.mutate({
                  parcelId: mappingParcelId,
                  odmProjectId: parseInt(mappingProjectId),
                  odmProjectName: project?.name,
                });
              }}
              disabled={!mappingParcelId || !mappingProjectId || saveMappingMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white whitespace-nowrap"
            >
              <Link2 className="h-4 w-4 mr-1" />
              Vincular
            </Button>
          </div>

          {(!odmProjects || odmProjects.length === 0) && config?.serverUrl && (
            <p className="text-xs text-teal-500 mt-2">
              No se encontraron proyectos. Verifica la conexión con WebODM o crea un proyecto primero.
            </p>
          )}
        </div>
      )}
    </GlassCard>
  );
}
