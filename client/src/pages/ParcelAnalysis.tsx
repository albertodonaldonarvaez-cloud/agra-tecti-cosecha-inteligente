import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { ProtectedPage } from "@/components/ProtectedPage";
import { APP_LOGO } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  MapPin, TreePine, Ruler, Sprout, Package, TrendingUp, Calendar,
  ChevronDown, ChevronUp, Edit3, Save, X, Layers, Eye,
  Plane, Clock, ImageIcon, BarChart3, Leaf, ArrowUpDown, ArrowLeft, Activity
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

// OpenLayers imports
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import OSM from "ol/source/OSM";
import Feature from "ol/Feature";
import Polygon from "ol/geom/Polygon";
import { fromLonLat, transformExtent } from "ol/proj";
import { Style, Fill, Stroke, Text as OlText } from "ol/style";
import { boundingExtent } from "ol/extent";
import "ol/ol.css";

export default function ParcelAnalysis() {
  return (
    <ProtectedPage permission="canViewParcelAnalysis">
      <ParcelAnalysisContent />
    </ProtectedPage>
  );
}

// ============ STATUS HELPERS ============
const STATUS_MAP: Record<number, { label: string; color: string; bg: string }> = {
  10: { label: "En cola", color: "text-yellow-700", bg: "bg-yellow-100" },
  20: { label: "Procesando", color: "text-blue-700", bg: "bg-blue-100" },
  30: { label: "Fallido", color: "text-red-700", bg: "bg-red-100" },
  40: { label: "Completado", color: "text-green-700", bg: "bg-green-100" },
  50: { label: "Cancelado", color: "text-gray-700", bg: "bg-gray-100" },
};

const LAYER_TYPES = [
  { key: "orthophoto", label: "Ortofoto", shortLabel: "Orto", color: "from-green-500 to-emerald-600" },
  { key: "ndvi", label: "NDVI (Salud)", shortLabel: "NDVI", color: "from-lime-500 to-green-600" },
  { key: "vari", label: "VARI (RGB)", shortLabel: "VARI", color: "from-teal-500 to-cyan-600" },
  { key: "dsm", label: "DSM", shortLabel: "DSM", color: "from-blue-500 to-indigo-600" },
  { key: "dtm", label: "DTM", shortLabel: "DTM", color: "from-purple-500 to-violet-600" },
] as const;

type LayerType = typeof LAYER_TYPES[number]["key"];

function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Mexico_City" });
}

function formatDateTime(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });
}

function formatProcessingTime(ms: number) {
  if (!ms || ms < 0) return "-";
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

// ============ MAIN CONTENT ============
function ParcelAnalysisContent() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [selectedParcelId, setSelectedParcelId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"map" | "details" | "harvest">("map");

  // Cargar parcelas
  const { data: allParcels, isLoading: parcelsLoading } = trpc.parcels.list.useQuery(undefined, {
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Filtrar solo parcelas con polígono definido
  const parcels = useMemo(() => {
    if (!allParcels) return [];
    return allParcels.filter((p: any) => {
      if (!p.polygon) return false;
      try {
        const poly = typeof p.polygon === "string" ? JSON.parse(p.polygon) : p.polygon;
        return poly.coordinates && poly.coordinates[0] && poly.coordinates[0].length >= 3;
      } catch {
        return false;
      }
    });
  }, [allParcels]);

  // Cargar mapeos ODM
  const { data: odmMappings } = trpc.webodm.getMappings.useQuery(undefined, {
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Cargar todos los detalles de parcela
  const { data: allDetails } = trpc.parcelAnalysis.getAllDetails.useQuery(undefined, {
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const selectedParcel = parcels?.find((p: any) => p.id === selectedParcelId);
  const selectedMapping = odmMappings?.find((m: any) => m.parcelId === selectedParcelId);
  const selectedDetails = allDetails?.find((d: any) => d.parcelId === selectedParcelId);

  const handleSelectParcel = useCallback((id: number) => {
    setSelectedParcelId(id);
    setActiveTab("map");
  }, []);

  const handleBack = useCallback(() => {
    setSelectedParcelId(null);
  }, []);

  if (parcelsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50">
        <div className="animate-pulse text-green-600 text-lg">Cargando parcelas...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
      <div className="mx-auto max-w-7xl px-3 md:px-6 py-4 md:py-8 space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <img src={APP_LOGO} alt="Agratec" className="h-12 w-12 md:h-16 md:w-16" />
            <div>
              <h1 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-green-800 to-emerald-600 bg-clip-text text-transparent">
                Análisis de Parcela
              </h1>
              <p className="text-xs md:text-base text-green-600/80">
                Vuelos, ortomosaicos, salud vegetal y rendimiento
              </p>
            </div>
          </div>
          {selectedParcelId && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/60 text-green-700 rounded-xl text-sm font-medium hover:bg-green-100 transition-all border border-green-200/50 sm:ml-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Vista General</span>
              <span className="sm:hidden">Atrás</span>
            </button>
          )}
        </div>

        {/* Vista General (sin parcela seleccionada) */}
        {!selectedParcelId && (
          <OverviewView
            parcels={parcels || []}
            odmMappings={odmMappings || []}
            allDetails={allDetails || []}
            onSelectParcel={handleSelectParcel}
          />
        )}

        {/* Vista de Detalle (parcela seleccionada) */}
        {selectedParcelId && selectedParcel && (
          <>
            {/* Nombre de parcela */}
            <GlassCard className="p-3 md:p-4" hover={false}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 shadow">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-green-900">{selectedParcel.name || selectedParcel.code}</h2>
                  <p className="text-xs text-green-500">Código: {selectedParcel.code}</p>
                </div>
                {selectedMapping && (
                  <span className="ml-auto text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full flex items-center gap-1">
                    <Plane className="h-3 w-3" /> WebODM vinculado
                  </span>
                )}
              </div>
            </GlassCard>

            {/* Tabs */}
            <div className="flex gap-1 bg-white/40 backdrop-blur-sm rounded-2xl p-1 border border-green-200/30">
              {[
                { key: "map" as const, icon: Layers, label: "Mapa & Vuelos", shortLabel: "Mapa" },
                { key: "details" as const, icon: TreePine, label: "Detalles de Parcela", shortLabel: "Detalles" },
                { key: "harvest" as const, icon: Package, label: "Cosecha", shortLabel: "Cosecha" },
              ].map(({ key, icon: Icon, label, shortLabel }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    activeTab === key
                      ? "bg-green-600 text-white shadow-md"
                      : "text-green-700 hover:bg-green-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{shortLabel}</span>
                </button>
              ))}
            </div>

            {/* Content */}
            {activeTab === "map" && (
              <MapAndFlightsTab parcel={selectedParcel} mapping={selectedMapping} isAdmin={isAdmin} />
            )}
            {activeTab === "details" && (
              <ParcelDetailsTab parcel={selectedParcel} details={selectedDetails} isAdmin={isAdmin} />
            )}
            {activeTab === "harvest" && (
              <HarvestTab parcel={selectedParcel} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============ VISTA GENERAL ============
function OverviewView({ parcels, odmMappings, allDetails, onSelectParcel }: {
  parcels: any[];
  odmMappings: any[];
  allDetails: any[];
  onSelectParcel: (id: number) => void;
}) {
  const { user } = useAuth();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);

  // Cargar stats de cosecha para cada parcela
  const parcelCodes = useMemo(() => parcels.map((p: any) => p.code || p.name || ""), [parcels]);

  // Inicializar mapa con polígonos de todas las parcelas
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const baseLayer = new TileLayer({ source: new OSM() });

    // Crear features para cada parcela con polígono
    const features: Feature[] = [];
    const allCoords: number[][] = [];

    parcels.forEach((p: any) => {
      if (!p.polygon) return;
      try {
        const poly = typeof p.polygon === "string" ? JSON.parse(p.polygon) : p.polygon;
        if (!poly.coordinates || !poly.coordinates[0] || poly.coordinates[0].length < 3) return;

        const coords = poly.coordinates[0].map((c: number[]) => fromLonLat([c[0], c[1]]));
        allCoords.push(...poly.coordinates[0]);

        const feature = new Feature({
          geometry: new Polygon([coords]),
          name: p.name || p.code,
          id: p.id,
        });

        feature.setStyle(new Style({
          fill: new Fill({ color: "rgba(16, 185, 129, 0.2)" }),
          stroke: new Stroke({ color: "#10b981", width: 2.5 }),
          text: new OlText({
            text: p.name || p.code,
            font: "bold 13px sans-serif",
            fill: new Fill({ color: "#065f46" }),
            stroke: new Stroke({ color: "rgba(255,255,255,0.9)", width: 3 }),
            overflow: true,
          }),
        }));

        features.push(feature);
      } catch (e) {
        console.warn("Error parsing polygon for", p.code, e);
      }
    });

    const vectorSource = new VectorSource({ features });
    const vectorLayer = new VectorLayer({ source: vectorSource });

    // Centro por defecto (México)
    let center = fromLonLat([-105.0, 23.0]);
    let zoom = 5;

    const map = new Map({
      target: mapRef.current,
      layers: [baseLayer, vectorLayer],
      view: new View({ center, zoom, maxZoom: 22 }),
    });

    // Ajustar vista a los polígonos
    if (features.length > 0) {
      const extent = vectorSource.getExtent();
      map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 17, duration: 500 });
    }

    // Click en polígono para seleccionar parcela
    map.on("click", (evt) => {
      const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f);
      if (feature) {
        const id = feature.get("id");
        if (id) onSelectParcel(id);
      }
    });

    // Cursor pointer al hover
    map.on("pointermove", (evt) => {
      const hit = map.hasFeatureAtPixel(evt.pixel);
      const target = map.getTargetElement();
      if (target) (target as HTMLElement).style.cursor = hit ? "pointer" : "";
    });

    mapInstanceRef.current = map;

    return () => {
      map.setTarget(undefined);
      mapInstanceRef.current = null;
    };
  }, [parcels]);

  return (
    <div className="space-y-4">
      {/* Mapa general */}
      <GlassCard className="overflow-hidden" hover={false}>
        <div className="p-3 md:p-4 border-b border-green-200/30">
          <h3 className="text-base md:text-lg font-semibold text-green-800 flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Vista General de Parcelas
            <span className="text-xs font-normal text-green-500 bg-green-50 px-2 py-0.5 rounded-full">
              {parcels.length} parcelas con polígono
            </span>
          </h3>
          <p className="text-xs text-green-500 mt-1">Haz clic en una parcela del mapa o de la lista para ver su detalle</p>
        </div>
        <div
          ref={mapRef}
          className="w-full h-[250px] sm:h-[350px] md:h-[450px]"
          style={{ background: "#f0f9f0" }}
        />
      </GlassCard>

      {/* Lista de parcelas con resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {parcels.map((p: any) => {
          const hasOdm = odmMappings.some((m: any) => m.parcelId === p.id);
          const detail = allDetails.find((d: any) => d.parcelId === p.id);

          return (
            <GlassCard
              key={p.id}
              className="p-4 cursor-pointer hover:shadow-lg hover:border-green-300 transition-all duration-200 border border-transparent"
              hover={true}
              onClick={() => onSelectParcel(p.id)}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 shadow">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-green-900 truncate">{p.name || p.code}</h4>
                  <p className="text-xs text-green-500">Código: {p.code}</p>
                </div>
                {hasOdm && (
                  <span className="flex-shrink-0 text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <Plane className="h-2.5 w-2.5" /> ODM
                  </span>
                )}
              </div>

              {/* Stats rápidos */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {detail?.totalHectares && (
                  <div className="bg-white/40 rounded-lg px-2 py-1.5">
                    <div className="text-[10px] text-green-500">Hectáreas</div>
                    <div className="text-sm font-bold text-green-900">{detail.totalHectares} ha</div>
                  </div>
                )}
                {detail?.productiveHectares && (
                  <div className="bg-white/40 rounded-lg px-2 py-1.5">
                    <div className="text-[10px] text-green-500">Productivas</div>
                    <div className="text-sm font-bold text-emerald-700">{detail.productiveHectares} ha</div>
                  </div>
                )}
                {detail?.totalTrees && (
                  <div className="bg-white/40 rounded-lg px-2 py-1.5">
                    <div className="text-[10px] text-green-500">Árboles</div>
                    <div className="text-sm font-bold text-green-900">{detail.totalTrees.toLocaleString()}</div>
                  </div>
                )}
                {detail?.productiveTrees && (
                  <div className="bg-white/40 rounded-lg px-2 py-1.5">
                    <div className="text-[10px] text-green-500">Productivos</div>
                    <div className="text-sm font-bold text-emerald-700">{detail.productiveTrees.toLocaleString()}</div>
                  </div>
                )}
              </div>

              {!detail?.totalHectares && !detail?.totalTrees && (
                <p className="mt-3 text-xs text-green-400 italic">Sin datos de detalle configurados</p>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}

// ============ TAB 1: MAPA Y VUELOS ============
function MapAndFlightsTab({ parcel, mapping, isAdmin }: { parcel: any; mapping: any; isAdmin: boolean }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const tileLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const [selectedTaskUuid, setSelectedTaskUuid] = useState<string | null>(null);
  const [selectedLayerType, setSelectedLayerType] = useState<LayerType>("orthophoto");
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Cargar tareas del proyecto ODM
  const { data: tasks, isLoading: tasksLoading } = trpc.webodm.getProjectTasks.useQuery(
    { projectId: mapping?.odmProjectId || 0 },
    { enabled: !!mapping?.odmProjectId, staleTime: 2 * 60 * 1000 }
  );

  // Seleccionar la primera tarea completada automáticamente
  useEffect(() => {
    if (tasks && tasks.length > 0 && !selectedTaskUuid) {
      const completed = tasks.filter((t: any) => t.status === 40);
      if (completed.length > 0) {
        const sorted = [...completed].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setSelectedTaskUuid(sorted[0].uuid);
      }
    }
  }, [tasks, selectedTaskUuid]);

  // Reset al cambiar de parcela
  useEffect(() => {
    setSelectedTaskUuid(null);
    setSelectedLayerType("orthophoto");
    setExpandedTask(null);
    setMapReady(false);
  }, [parcel?.id]);

  // Inicializar mapa OpenLayers
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    let center = fromLonLat([-105.0, 23.0]);
    let zoom = 5;

    // Si la parcela tiene polígono, centrar en él
    if (parcel?.polygon) {
      try {
        const poly = typeof parcel.polygon === "string" ? JSON.parse(parcel.polygon) : parcel.polygon;
        if (poly.coordinates && poly.coordinates[0] && poly.coordinates[0].length > 0) {
          const coords = poly.coordinates[0];
          const avgLon = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length;
          const avgLat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length;
          center = fromLonLat([avgLon, avgLat]);
          zoom = 16;
        }
      } catch (e) {
        console.warn("Error parsing polygon:", e);
      }
    }

    const baseLayer = new TileLayer({ source: new OSM() });

    const odmTileLayer = new TileLayer({
      source: new XYZ({ url: "" }),
      visible: false,
      opacity: 0.9,
    });
    tileLayerRef.current = odmTileLayer;

    // Polígono de la parcela
    const features: Feature[] = [];
    if (parcel?.polygon) {
      try {
        const poly = typeof parcel.polygon === "string" ? JSON.parse(parcel.polygon) : parcel.polygon;
        if (poly.coordinates && poly.coordinates[0]) {
          const coords = poly.coordinates[0].map((c: number[]) => fromLonLat([c[0], c[1]]));
          const feature = new Feature({ geometry: new Polygon([coords]) });
          feature.setStyle(new Style({
            fill: new Fill({ color: "rgba(16, 185, 129, 0.08)" }),
            stroke: new Stroke({ color: "#10b981", width: 2, lineDash: [8, 4] }),
          }));
          features.push(feature);
        }
      } catch (e) { /* ignore */ }
    }

    const vectorLayer = new VectorLayer({
      source: new VectorSource({ features }),
    });

    const map = new Map({
      target: mapRef.current,
      layers: [baseLayer, odmTileLayer, vectorLayer],
      view: new View({ center, zoom, maxZoom: 24 }),
    });

    mapInstanceRef.current = map;
    setMapReady(true);

    return () => {
      map.setTarget(undefined);
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      setMapReady(false);
    };
  }, [parcel?.id]);

  // Actualizar capa de tiles cuando cambia la tarea o el tipo de capa
  useEffect(() => {
    if (!tileLayerRef.current || !mapReady) return;

    if (selectedTaskUuid && mapping?.odmProjectId) {
      // Usar el proxy del servidor en lugar de URL directa a WebODM
      const proxyUrl = `/api/odm-tiles/${mapping.odmProjectId}/${selectedTaskUuid}/${selectedLayerType}/{z}/{x}/{y}.png`;

      tileLayerRef.current.setSource(
        new XYZ({
          url: proxyUrl,
          maxZoom: 24,
          tileSize: 256,
        })
      );
      tileLayerRef.current.setVisible(true);

      // Obtener bounds para hacer zoom al área correcta
      fetch(`/api/odm-bounds/${mapping.odmProjectId}/${selectedTaskUuid}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.bounds && mapInstanceRef.current) {
            const [minLon, minLat, maxLon, maxLat] = data.bounds;
            const extent = transformExtent([minLon, minLat, maxLon, maxLat], "EPSG:4326", "EPSG:3857");
            mapInstanceRef.current.getView().fit(extent, {
              padding: [30, 30, 30, 30],
              maxZoom: 20,
              duration: 800,
            });
          }
        })
        .catch(err => console.warn("Error fetching bounds:", err));
    } else {
      tileLayerRef.current.setVisible(false);
    }
  }, [selectedTaskUuid, selectedLayerType, mapReady, mapping?.odmProjectId]);

  // Tareas ordenadas
  const sortedTasks = useMemo(() => {
    if (!tasks) return [];
    return [...tasks].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [tasks]);

  if (!mapping) {
    return (
      <GlassCard className="p-6 md:p-10 text-center" hover={false}>
        <Plane className="h-12 w-12 mx-auto text-green-300 mb-4" />
        <h3 className="text-lg font-semibold text-green-800 mb-2">Sin conexión a WebODM</h3>
        <p className="text-green-600 text-sm max-w-md mx-auto">
          Esta parcela no tiene un proyecto de WebODM vinculado.
          {isAdmin ? " Ve a Configuración → WebODM para vincular un proyecto." : " Contacta al administrador."}
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mapa */}
      <GlassCard className="overflow-hidden" hover={false}>
        <div className="p-3 md:p-4 border-b border-green-200/30">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base md:text-lg font-semibold text-green-800 flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Ortomosaico
                {selectedTaskUuid && (
                  <span className="text-xs font-normal text-green-500 bg-green-50 px-2 py-0.5 rounded-full">
                    {sortedTasks.find((t: any) => t.uuid === selectedTaskUuid)?.name || "Tarea"}
                  </span>
                )}
              </h3>
            </div>
            {/* Selector de capas */}
            {selectedTaskUuid && (
              <div className="flex flex-wrap gap-1.5">
                {LAYER_TYPES.map(({ key, label, shortLabel }) => (
                  <button
                    key={key}
                    onClick={() => setSelectedLayerType(key)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      selectedLayerType === key
                        ? "bg-green-600 text-white shadow-sm"
                        : "bg-white/60 text-green-700 hover:bg-green-100 border border-green-200/40"
                    }`}
                  >
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{shortLabel}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div
          ref={mapRef}
          className="w-full h-[300px] sm:h-[400px] md:h-[500px] lg:h-[600px]"
          style={{ background: "#f0f9f0" }}
        />
        {/* Leyenda de capa activa */}
        {selectedTaskUuid && selectedLayerType !== "orthophoto" && (
          <div className="p-2 md:p-3 border-t border-green-200/30 bg-white/30">
            <div className="flex items-center gap-2 text-xs text-green-600">
              <Activity className="h-3.5 w-3.5" />
              {selectedLayerType === "ndvi" && (
                <span><strong>NDVI</strong> — Índice de Vegetación de Diferencia Normalizada. Rojo = vegetación estresada, Verde = vegetación sana.</span>
              )}
              {selectedLayerType === "vari" && (
                <span><strong>VARI</strong> — Índice de Vegetación Visible (solo RGB). Útil para cámaras sin banda infrarroja.</span>
              )}
              {selectedLayerType === "dsm" && (
                <span><strong>DSM</strong> — Modelo Digital de Superficie. Incluye árboles, edificios y terreno.</span>
              )}
              {selectedLayerType === "dtm" && (
                <span><strong>DTM</strong> — Modelo Digital de Terreno. Solo la superficie del suelo.</span>
              )}
            </div>
          </div>
        )}
      </GlassCard>

      {/* Timeline de Vuelos */}
      <GlassCard className="p-3 md:p-5" hover={false}>
        <h3 className="text-base md:text-lg font-semibold text-green-800 mb-3 flex items-center gap-2">
          <Plane className="h-5 w-5" />
          Timeline de Vuelos
          <span className="text-xs font-normal text-green-500 bg-green-50 px-2 py-0.5 rounded-full">
            {sortedTasks.length} {sortedTasks.length === 1 ? "vuelo" : "vuelos"}
          </span>
        </h3>

        {tasksLoading ? (
          <div className="text-center py-8 text-green-500 animate-pulse">Cargando vuelos...</div>
        ) : sortedTasks.length === 0 ? (
          <div className="text-center py-8 text-green-400">
            <Plane className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay vuelos registrados para este proyecto</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedTasks.map((task: any, idx: number) => {
              const status = STATUS_MAP[task.status] || { label: "Desconocido", color: "text-gray-600", bg: "bg-gray-100" };
              const isSelected = task.uuid === selectedTaskUuid;
              const isExpanded = expandedTask === task.id;
              const isCompleted = task.status === 40;

              return (
                <div key={task.id} className="relative">
                  {idx < sortedTasks.length - 1 && (
                    <div className="absolute left-[19px] top-[40px] bottom-[-12px] w-0.5 bg-green-200/60 hidden sm:block" />
                  )}

                  <div
                    className={`flex items-start gap-3 p-3 rounded-2xl transition-all cursor-pointer border ${
                      isSelected
                        ? "bg-green-50 border-green-300 shadow-md"
                        : "bg-white/30 border-transparent hover:bg-white/50 hover:border-green-200/50"
                    }`}
                    onClick={() => {
                      if (isCompleted) setSelectedTaskUuid(task.uuid);
                      setExpandedTask(isExpanded ? null : task.id);
                    }}
                  >
                    <div className={`hidden sm:flex flex-shrink-0 w-[38px] h-[38px] rounded-full items-center justify-center ${
                      isSelected ? "bg-green-600 text-white" : isCompleted ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"
                    }`}>
                      <Plane className="h-4 w-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="font-medium text-green-900 text-sm truncate">{task.name || `Vuelo #${task.id}`}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.color} w-fit`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-green-600">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDateTime(task.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <ImageIcon className="h-3 w-3" />
                          {task.images_count} imágenes
                        </span>
                        {task.processing_time > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatProcessingTime(task.processing_time)}
                          </span>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="mt-2 pt-2 border-t border-green-100 text-xs text-green-600 space-y-1">
                          <div><strong>UUID:</strong> <span className="font-mono text-[10px]">{task.uuid}</span></div>
                          {task.available_assets && task.available_assets.length > 0 && (
                            <div><strong>Assets:</strong> {task.available_assets.join(", ")}</div>
                          )}
                          {task.last_error && (
                            <div className="text-red-600"><strong>Error:</strong> {task.last_error}</div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      {isCompleted && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedTaskUuid(task.uuid); }}
                          className={`p-1.5 rounded-lg transition-all ${
                            isSelected ? "bg-green-600 text-white" : "bg-green-50 text-green-600 hover:bg-green-100"
                          }`}
                          title="Ver en mapa"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedTask(isExpanded ? null : task.id); }}
                        className="p-1.5 rounded-lg bg-white/50 text-green-500 hover:bg-green-50"
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ============ TAB 2: DETALLES DE PARCELA ============
function ParcelDetailsTab({ parcel, details, isAdmin }: { parcel: any; details: any; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    totalHectares: "",
    productiveHectares: "",
    treeDensityPerHectare: "",
    totalTrees: "",
    productiveTrees: "",
    newTrees: "",
    notes: "",
  });

  const utils = trpc.useUtils();
  const saveMutation = trpc.parcelAnalysis.saveDetails.useMutation({
    onSuccess: () => {
      utils.parcelAnalysis.getAllDetails.invalidate();
      setEditing(false);
    },
  });

  useEffect(() => {
    if (details) {
      setForm({
        totalHectares: details.totalHectares || "",
        productiveHectares: details.productiveHectares || "",
        treeDensityPerHectare: details.treeDensityPerHectare || "",
        totalTrees: details.totalTrees?.toString() || "",
        productiveTrees: details.productiveTrees?.toString() || "",
        newTrees: details.newTrees?.toString() || "",
        notes: details.notes || "",
      });
    } else {
      setForm({ totalHectares: "", productiveHectares: "", treeDensityPerHectare: "", totalTrees: "", productiveTrees: "", newTrees: "", notes: "" });
    }
  }, [details, parcel?.id]);

  const handleSave = () => {
    saveMutation.mutate({
      parcelId: parcel.id,
      totalHectares: form.totalHectares || null,
      productiveHectares: form.productiveHectares || null,
      treeDensityPerHectare: form.treeDensityPerHectare || null,
      totalTrees: form.totalTrees ? parseInt(form.totalTrees) : null,
      productiveTrees: form.productiveTrees ? parseInt(form.productiveTrees) : null,
      newTrees: form.newTrees ? parseInt(form.newTrees) : null,
      notes: form.notes || null,
    });
  };

  const fields = [
    { key: "totalHectares", label: "Hectáreas Totales", icon: Ruler, suffix: "ha", type: "text" },
    { key: "productiveHectares", label: "Hectáreas Productivas", icon: Ruler, suffix: "ha", type: "text" },
    { key: "treeDensityPerHectare", label: "Densidad por Hectárea", icon: TreePine, suffix: "árboles/ha", type: "text" },
    { key: "totalTrees", label: "Total de Árboles", icon: TreePine, suffix: "", type: "number" },
    { key: "productiveTrees", label: "Árboles Productivos", icon: Sprout, suffix: "", type: "number" },
    { key: "newTrees", label: "Árboles Nuevos", icon: Sprout, suffix: "", type: "number" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base md:text-lg font-semibold text-green-800 flex items-center gap-2">
          <TreePine className="h-5 w-5" />
          Información de {parcel.name || parcel.code}
        </h3>
        {isAdmin && (
          <div className="flex gap-2">
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-all disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saveMutation.isPending ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-all"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancelar
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-xl text-sm font-medium hover:bg-green-100 transition-all border border-green-200/50"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Editar
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {fields.map(({ key, label, icon: Icon, suffix, type }) => (
          <GlassCard key={key} className="p-3 md:p-4" hover={false}>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-green-100">
                <Icon className="h-4 w-4 text-green-600" />
              </div>
              <span className="text-xs text-green-600 font-medium">{label}</span>
            </div>
            {editing ? (
              <div className="flex items-center gap-1">
                <input
                  type={type}
                  value={(form as any)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="w-full px-2 py-1.5 text-lg font-bold text-green-900 bg-white/60 border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400"
                  placeholder="0"
                />
                {suffix && <span className="text-xs text-green-500 whitespace-nowrap">{suffix}</span>}
              </div>
            ) : (
              <div className="text-xl md:text-2xl font-bold text-green-900">
                {(form as any)[key] || <span className="text-green-300 text-base">Sin datos</span>}
                {(form as any)[key] && suffix && <span className="text-sm font-normal text-green-500 ml-1">{suffix}</span>}
              </div>
            )}
          </GlassCard>
        ))}
      </div>

      <GlassCard className="p-3 md:p-4" hover={false}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-green-700 font-medium">Notas</span>
        </div>
        {editing ? (
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full px-3 py-2 text-sm text-green-900 bg-white/60 border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 min-h-[80px] resize-y"
            placeholder="Notas sobre la parcela..."
          />
        ) : (
          <p className="text-sm text-green-700">
            {form.notes || <span className="text-green-300 italic">Sin notas</span>}
          </p>
        )}
      </GlassCard>

      {(form.totalTrees || form.productiveTrees || form.newTrees) && (
        <GlassCard className="p-3 md:p-5" hover={false}>
          <h4 className="text-sm font-semibold text-green-800 mb-3">Composición del Arbolado</h4>
          <div className="space-y-2">
            {form.productiveTrees && form.totalTrees && (
              <div>
                <div className="flex justify-between text-xs text-green-600 mb-1">
                  <span>Productivos</span>
                  <span>{Math.round((parseInt(form.productiveTrees) / parseInt(form.totalTrees)) * 100)}%</span>
                </div>
                <div className="h-3 bg-green-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (parseInt(form.productiveTrees) / parseInt(form.totalTrees)) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {form.newTrees && form.totalTrees && (
              <div>
                <div className="flex justify-between text-xs text-green-600 mb-1">
                  <span>Nuevos</span>
                  <span>{Math.round((parseInt(form.newTrees) / parseInt(form.totalTrees)) * 100)}%</span>
                </div>
                <div className="h-3 bg-green-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-lime-400 to-green-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (parseInt(form.newTrees) / parseInt(form.totalTrees)) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

// ============ TAB 3: COSECHA ============
function HarvestTab({ parcel }: { parcel: any }) {
  const { user } = useAuth();
  const [sortField, setSortField] = useState<string>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const parcelCode = parcel.code || parcel.name || "";

  const { data: harvestStats, isLoading: statsLoading } = trpc.parcelAnalysis.getHarvestStats.useQuery(
    { parcelCode },
    { enabled: !!parcelCode && !!user, staleTime: 2 * 60 * 1000 }
  );

  const { data: dailyHarvest, isLoading: dailyLoading } = trpc.parcelAnalysis.getDailyHarvest.useQuery(
    { parcelCode },
    { enabled: !!parcelCode && !!user, staleTime: 2 * 60 * 1000 }
  );

  const { data: parcelDetail } = trpc.parcelAnalysis.getDetails.useQuery(
    { parcelId: parcel.id },
    { enabled: !!user, staleTime: 5 * 60 * 1000 }
  );

  const productiveHa = parcelDetail?.productiveHectares ? parseFloat(parcelDetail.productiveHectares) : null;

  const sortedDaily = useMemo(() => {
    if (!dailyHarvest) return [];
    return [...dailyHarvest].sort((a: any, b: any) => {
      let valA = a[sortField], valB = b[sortField];
      if (sortField === "date") {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }
      return sortOrder === "asc" ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
  }, [dailyHarvest, sortField, sortOrder]);

  const chartData = useMemo(() => {
    if (!dailyHarvest) return [];
    return [...dailyHarvest]
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((d: any) => ({
        ...d,
        dateLabel: new Date(d.date + "T12:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short" }),
      }));
  }, [dailyHarvest]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  if (statsLoading) {
    return <div className="text-center py-8 text-green-500 animate-pulse">Cargando datos de cosecha...</div>;
  }

  if (!harvestStats) {
    return (
      <GlassCard className="p-6 md:p-10 text-center" hover={false}>
        <Package className="h-12 w-12 mx-auto text-green-300 mb-4" />
        <h3 className="text-lg font-semibold text-green-800 mb-2">Sin datos de cosecha</h3>
        <p className="text-green-600 text-sm">No se encontraron cajas registradas para la parcela "{parcelCode}"</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Cosechado", value: `${harvestStats.totalWeight} kg`, icon: Package, color: "from-green-400 to-emerald-500" },
          { label: "1ra Calidad", value: `${harvestStats.firstQualityWeight} kg`, icon: TrendingUp, color: "from-emerald-400 to-green-500" },
          { label: "2da Calidad", value: `${harvestStats.secondQualityWeight} kg`, icon: BarChart3, color: "from-yellow-400 to-orange-500" },
          { label: "Desperdicio", value: `${harvestStats.wasteWeight} kg`, icon: X, color: "from-red-400 to-rose-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <GlassCard key={label} className="p-3 md:p-4" hover={false}>
            <div className="flex items-center gap-2 mb-1">
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${color} shadow-sm`}>
                <Icon className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-[10px] md:text-xs text-green-600">{label}</span>
            </div>
            <div className="text-lg md:text-xl font-bold text-green-900">{value}</div>
          </GlassCard>
        ))}
      </div>

      {productiveHa && productiveHa > 0 && (
        <GlassCard className="p-3 md:p-4" hover={false}>
          <h4 className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
            <Ruler className="h-4 w-4" />
            Rendimiento por Hectárea
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-green-600">Total / ha</div>
              <div className="text-lg font-bold text-green-900">{(harvestStats.totalWeight / productiveHa).toFixed(1)} kg</div>
            </div>
            <div>
              <div className="text-xs text-green-600">1ra Calidad / ha</div>
              <div className="text-lg font-bold text-emerald-700">{(harvestStats.firstQualityWeight / productiveHa).toFixed(1)} kg</div>
            </div>
            <div>
              <div className="text-xs text-green-600">Cajas / ha</div>
              <div className="text-lg font-bold text-green-900">{(harvestStats.totalBoxes / productiveHa).toFixed(1)}</div>
            </div>
            <div>
              <div className="text-xs text-green-600">Días de cosecha</div>
              <div className="text-lg font-bold text-green-900">{harvestStats.harvestDays}</div>
            </div>
          </div>
        </GlassCard>
      )}

      {chartData.length > 0 && (
        <GlassCard className="p-3 md:p-5" hover={false}>
          <h4 className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Cosecha Diaria (kg)
          </h4>
          <div className="h-[250px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d1fae5" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", border: "1px solid #d1fae5", background: "rgba(255,255,255,0.95)" }}
                  formatter={(value: number) => [`${value.toFixed(1)} kg`]}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="firstQualityWeight" name="1ra Calidad" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="secondQualityWeight" name="2da Calidad" fill="#f59e0b" radius={[0, 0, 0, 0]} stackId="a" />
                <Bar dataKey="wasteWeight" name="Desperdicio" fill="#ef4444" radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      )}

      {sortedDaily.length > 0 && (
        <GlassCard className="p-3 md:p-5" hover={false}>
          <h4 className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Detalle por Día
          </h4>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-green-200/50">
                  {[
                    { key: "date", label: "Fecha" },
                    { key: "totalBoxes", label: "Cajas" },
                    { key: "totalWeight", label: "Total (kg)" },
                    { key: "firstQualityWeight", label: "1ra Cal. (kg)" },
                    { key: "secondQualityWeight", label: "2da Cal. (kg)" },
                    { key: "wasteWeight", label: "Desperdicio (kg)" },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="text-left py-2 px-2 text-green-700 font-medium cursor-pointer hover:text-green-900 select-none"
                    >
                      <span className="flex items-center gap-1">
                        {label}
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedDaily.map((row: any) => (
                  <tr key={row.date} className="border-b border-green-100/30 hover:bg-green-50/30">
                    <td className="py-2 px-2 font-medium text-green-900">{formatDate(row.date)}</td>
                    <td className="py-2 px-2 text-green-700">{row.totalBoxes}</td>
                    <td className="py-2 px-2 font-semibold text-green-900">{row.totalWeight}</td>
                    <td className="py-2 px-2 text-emerald-700">{row.firstQualityWeight}</td>
                    <td className="py-2 px-2 text-yellow-700">{row.secondQualityWeight}</td>
                    <td className="py-2 px-2 text-red-600">{row.wasteWeight}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {sortedDaily.map((row: any) => (
              <div key={row.date} className="bg-white/40 rounded-xl p-3 border border-green-100/30">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-green-900 text-sm">{formatDate(row.date)}</span>
                  <span className="text-xs text-green-500">{row.totalBoxes} cajas</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] text-emerald-600">1ra Cal.</div>
                    <div className="text-sm font-bold text-emerald-700">{row.firstQualityWeight}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-yellow-600">2da Cal.</div>
                    <div className="text-sm font-bold text-yellow-700">{row.secondQualityWeight}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-red-500">Desp.</div>
                    <div className="text-sm font-bold text-red-600">{row.wasteWeight}</div>
                  </div>
                </div>
                <div className="mt-1 text-center">
                  <span className="text-xs text-green-600">Total: </span>
                  <span className="text-sm font-bold text-green-900">{row.totalWeight} kg</span>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
