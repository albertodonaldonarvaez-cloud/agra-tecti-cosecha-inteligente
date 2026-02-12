import { Loading } from "@/components/Loading";
import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Settings as SettingsIcon, Upload, RefreshCw, AlertTriangle, FileSpreadsheet, MapPin, Save, Clock, Timer, CheckCircle, XCircle, Zap, Send, MessageCircle, Eye, EyeOff } from "lucide-react";
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
