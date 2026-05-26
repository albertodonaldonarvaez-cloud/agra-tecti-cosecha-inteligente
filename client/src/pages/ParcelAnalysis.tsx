import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { ProtectedPage } from "@/components/ProtectedPage";
import { APP_LOGO } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  MapPin, TreePine, Ruler, Sprout, Package, TrendingUp, Calendar,
  ChevronDown, ChevronUp, Edit3, Save, X, Layers, Eye,
  Plane, Clock, ImageIcon, BarChart3, Leaf, ArrowUpDown, ArrowLeft, Activity,
  ClipboardList, Bug, Droplets, AlertTriangle, Construction, Fence,
  FlaskConical, Mountain, PawPrint, FileText, Camera, CameraOff, Filter,
  Maximize2, Minimize2, Send, ExternalLink, UserPlus, MessageSquare, Users2, ZoomIn,
  Satellite, Loader2, Info, Sparkles
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, ReferenceLine, ReferenceArea } from "recharts";

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
import Point from "ol/geom/Point";
import Overlay from "ol/Overlay";
import { fromLonLat, transformExtent, toLonLat } from "ol/proj";
import { Style, Fill, Stroke, Text as OlText, Circle as CircleStyle, Icon } from "ol/style";
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
  { key: "orthophoto", label: "Ortofoto", shortLabel: "Orto", color: "from-green-500 to-emerald-600", rgbOnly: false },
  { key: "vari", label: "VARI (RGB)", shortLabel: "VARI", color: "from-teal-500 to-cyan-600", rgbOnly: false },
  { key: "ndvi", label: "NDVI", shortLabel: "NDVI", color: "from-lime-500 to-green-600", rgbOnly: false },
  { key: "exg", label: "Exceso Verde", shortLabel: "EXG", color: "from-emerald-500 to-green-600", rgbOnly: false },
  { key: "gli", label: "Hoja Verde", shortLabel: "GLI", color: "from-green-400 to-lime-500", rgbOnly: false },
  { key: "endvi", label: "ENDVI", shortLabel: "ENDVI", color: "from-yellow-500 to-amber-600", rgbOnly: false },
  { key: "dsm", label: "DSM", shortLabel: "DSM", color: "from-blue-500 to-indigo-600", rgbOnly: false },
  { key: "dtm", label: "DTM", shortLabel: "DTM", color: "from-purple-500 to-violet-600", rgbOnly: false },
] as const;

type LayerType = typeof LAYER_TYPES[number]["key"];

// Análisis que REQUIEREN sensor multiespectral (no son fiables con RGB)
const MULTIESPECTRAL_ONLY_LAYERS: LayerType[] = ["ndvi", "endvi"];
// Análisis que funcionan con RGB (basados en bandas visibles)
const RGB_COMPATIBLE_LAYERS: LayerType[] = ["orthophoto", "vari", "exg", "gli", "dsm", "dtm"];

/** Detectar si una tarea de WebODM es RGB o Multiespectral por su nombre */
function isRGBTask(task: any): boolean | null {
  const name = (task?.name || "").toLowerCase();
  const rgbKeywords = ["rgb", "true", "color", "jpeg", "jpg", "visible", "ortofoto", "ortomosaico"];
  const multiKeywords = ["multi", "ms", "nir", "rededge", "spectral", "espectral", "infrarrojo"];
  if (rgbKeywords.some(k => name.includes(k))) return true;
  if (multiKeywords.some(k => name.includes(k))) return false;
  return null; // No se puede determinar
}

// ============ CATEGORÍAS DE NOTAS DE CAMPO (para pines) ============
const NOTE_CATEGORIES: Record<string, { label: string; emoji: string; color: string }> = {
  plaga_enfermedad: { label: "Plaga", emoji: "🐛", color: "#dc2626" },
  riego_drenaje: { label: "Riego", emoji: "💧", color: "#2563eb" },
  arboles_mal_plantados: { label: "Árboles", emoji: "🌳", color: "#16a34a" },
  dano_mecanico: { label: "Daño", emoji: "⚠️", color: "#ea580c" },
  maleza: { label: "Maleza", emoji: "🌿", color: "#65a30d" },
  fertilizacion: { label: "Fertilización", emoji: "🧪", color: "#7c3aed" },
  suelo: { label: "Suelo", emoji: "⛰️", color: "#92400e" },
  infraestructura: { label: "Infraestructura", emoji: "🏗️", color: "#475569" },
  fauna: { label: "Fauna", emoji: "🐾", color: "#0d9488" },
  otro: { label: "Otro", emoji: "📝", color: "#6b7280" },
};

const SEVERITY_COLORS: Record<string, string> = {
  baja: "#3b82f6",     // blue
  media: "#f59e0b",    // amber
  alta: "#f97316",     // orange
  critica: "#ef4444",  // red
};

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

  // Leer query params para navegación directa desde otras páginas
  const urlParams = new URLSearchParams(window.location.search);
  const initialParcelId = urlParams.get("parcelId") ? Number(urlParams.get("parcelId")) : null;
  const initialTab = (urlParams.get("tab") as "map" | "details" | "harvest" | "notes") || "map";

  const [selectedParcelId, setSelectedParcelId] = useState<number | null>(initialParcelId);
  const [activeTab, setActiveTab] = useState<"map" | "details" | "harvest" | "notes" | "satellite">(initialTab);

  // Cargar parcelas (solo activas)
  const { data: allParcels, isLoading: parcelsLoading } = trpc.parcels.listActive.useQuery(undefined, {
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
      <div className="mx-auto max-w-7xl px-3 md:px-6 py-4 md:py-8 pb-24 space-y-4 md:space-y-6">
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
            {/* Nombre de parcela con selector desplegable */}
            <GlassCard className="p-3 md:p-4" hover={false}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 shadow">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="relative">
                    <select
                      value={selectedParcelId}
                      onChange={(e) => handleSelectParcel(Number(e.target.value))}
                      className="w-full text-lg md:text-xl font-bold text-green-900 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer appearance-none pr-8 truncate"
                      style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
                    >
                      {parcels?.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name || p.code}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-5 text-green-400 pointer-events-none" />
                  </div>
                  <p className="text-xs text-green-500">Código: {selectedParcel.code}</p>
                </div>
                {selectedMapping && (
                  <span className="ml-auto text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full flex items-center gap-1 flex-shrink-0">
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
                { key: "notes" as const, icon: ClipboardList, label: "Notas de Campo", shortLabel: "Notas" },
                { key: "satellite" as const, icon: Satellite, label: "Telemetría Satelital", shortLabel: "Satélite" },
              ].map(({ key, icon: Icon, label, shortLabel }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-sm font-medium transition-all ${
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
              <MapAndFlightsTab key={`map-${selectedParcel?.id}`} parcel={selectedParcel} mapping={selectedMapping} isAdmin={isAdmin} />
            )}
            {activeTab === "details" && (
              <ParcelDetailsTab key={`details-${selectedParcel?.id}`} parcel={selectedParcel} details={selectedDetails} isAdmin={isAdmin} />
            )}
            {activeTab === "harvest" && (
              <HarvestTab key={`harvest-${selectedParcel?.id}`} parcel={selectedParcel} />
            )}
            {activeTab === "notes" && (
              <FieldNotesMapTab key={`notes-${selectedParcel?.id}`} parcel={selectedParcel} mapping={selectedMapping} odmMappings={odmMappings || []} allParcels={parcels} onSelectParcel={(id: number) => setSelectedParcelId(id)} />
            )}
            {activeTab === "satellite" && (
              <SatelliteTab key={`satellite-${selectedParcel?.id}`} parcel={selectedParcel} mapping={selectedMapping} />
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
                {detail?.totalTrees && detail?.totalHectares && parseFloat(detail.totalHectares) > 0 && (
                  <div className="bg-white/40 rounded-lg px-2 py-1.5">
                    <div className="text-[10px] text-blue-500">Densidad/ha</div>
                    <div className="text-sm font-bold text-blue-700">
                      {Math.round(detail.totalTrees / parseFloat(detail.totalHectares)).toLocaleString()}
                    </div>
                  </div>
                )}
                {detail?.totalTrees && detail?.productiveTrees && (
                  <div className="bg-white/40 rounded-lg px-2 py-1.5">
                    <div className="text-[10px] text-red-500">Faltantes</div>
                    <div className="text-sm font-bold text-red-600">
                      {(detail.totalTrees - detail.productiveTrees - (detail.newTrees || 0)).toLocaleString()}
                    </div>
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
  const orthoLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const indexLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const [selectedTaskUuid, setSelectedTaskUuid] = useState<string | null>(null);
  const [selectedLayerType, setSelectedLayerType] = useState<LayerType>("orthophoto");
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [tileStatus, setTileStatus] = useState<string>("");
  const [currentZoom, setCurrentZoom] = useState<number>(5);
  const [tileMinZoom, setTileMinZoom] = useState<number>(14);
  const [orthoLoaded, setOrthoLoaded] = useState(false);

  // Cargar tareas del proyecto ODM
  const { data: tasks, isLoading: tasksLoading } = trpc.webodm.getProjectTasks.useQuery(
    { projectId: mapping?.odmProjectId || 0 },
    { enabled: !!mapping?.odmProjectId, staleTime: 2 * 60 * 1000 }
  );

  // Obtener el identificador único de una tarea (uuid viene normalizado del backend)
  const getTaskId = useCallback((task: any): string => {
    return task.uuid || String(task.id) || "";
  }, []);

  // Auto-seleccionar el último vuelo completado cuando llegan las tareas
  // (al cambiar de parcela, el key={parcel.id} fuerza remount, así que selectedTaskUuid siempre empieza en null)
  useEffect(() => {
    if (!tasks || tasks.length === 0) return;
    if (selectedTaskUuid) return;
    const completed = tasks.filter((t: any) => t.status === 40);
    if (completed.length > 0) {
      const sorted = [...completed].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const taskId = getTaskId(sorted[0]);
      console.log("[ParcelAnalysis] Auto-selecting latest task:", taskId, sorted[0].name, "uuid:", sorted[0].uuid, "id:", sorted[0].id);
      if (taskId) setSelectedTaskUuid(taskId);
    }
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: crear un XYZ tile source con eventos de carga
  const createTileSource = useCallback((proxyUrl: string, maxZoom: number, onFirstLoad?: () => void, onError?: () => void) => {
    const tileSource = new XYZ({
      url: proxyUrl,
      minZoom: 0,
      maxZoom,
      tileSize: 256,
      crossOrigin: "anonymous",
    });
    let loadedCount = 0;
    let errorCount = 0;
    tileSource.on("tileloadend", () => {
      loadedCount++;
      if (loadedCount === 1) {
        console.log("[ParcelAnalysis] First tile loaded for:", proxyUrl.split("/").slice(-4, -3)[0]);
        onFirstLoad?.();
      }
    });
    tileSource.on("tileloaderror", (evt: any) => {
      errorCount++;
      if (errorCount <= 3) console.warn(`[ParcelAnalysis] Tile error #${errorCount}:`, evt.tile?.getTileCoord());
      if (errorCount === 1) onError?.();
    });
    return tileSource;
  }, []);

  // Función para cargar la ortofoto base (siempre se carga al seleccionar un vuelo)
  const loadOrthophoto = useCallback((taskUuid: string) => {
    if (!orthoLayerRef.current || !mapInstanceRef.current || !mapping?.odmProjectId) {
      console.warn("[ParcelAnalysis] loadOrthophoto: mapa no listo");
      return;
    }

    const proxyUrl = `/api/odm-tiles/${mapping.odmProjectId}/${taskUuid}/orthophoto/{z}/{x}/{y}.png`;
    console.log("[ParcelAnalysis] Loading orthophoto:", proxyUrl);
    setTileStatus("Cargando ortofoto...");
    setOrthoLoaded(false);

    fetch(`/api/odm-bounds/${mapping.odmProjectId}/${taskUuid}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        console.log("[ParcelAnalysis] Bounds data:", data);
        const serverMinZoom = data?.minzoom || 14;
        const serverMaxZoom = data?.maxzoom || 24;
        setTileMinZoom(serverMinZoom);

        const tileSource = createTileSource(
          proxyUrl,
          serverMaxZoom,
          () => { setTileStatus(""); setOrthoLoaded(true); },
          () => { setTileStatus("Error cargando ortofoto - verificar conexión con WebODM"); }
        );

        if (orthoLayerRef.current && mapInstanceRef.current) {
          orthoLayerRef.current.setSource(tileSource);
          orthoLayerRef.current.setVisible(true);
          mapInstanceRef.current.updateSize();
          mapInstanceRef.current.render();

          if (data?.bounds) {
            const [minLon, minLat, maxLon, maxLat] = data.bounds;
            const extent = transformExtent([minLon, minLat, maxLon, maxLat], "EPSG:4326", "EPSG:3857");
            mapInstanceRef.current.getView().fit(extent, {
              padding: [30, 30, 30, 30],
              maxZoom: 22,
              duration: 800,
            });
          }
        }
      })
      .catch(err => {
        console.warn("[ParcelAnalysis] Bounds error, loading orthophoto without zoom info:", err);
        const tileSource = createTileSource(
          proxyUrl, 24,
          () => { setTileStatus(""); setOrthoLoaded(true); },
          () => { setTileStatus("Error cargando ortofoto"); }
        );
        if (orthoLayerRef.current && mapInstanceRef.current) {
          orthoLayerRef.current.setSource(tileSource);
          orthoLayerRef.current.setVisible(true);
          mapInstanceRef.current.updateSize();
          mapInstanceRef.current.render();
        }
      });
  }, [mapping?.odmProjectId, createTileSource]);

  // Función para cargar una capa de índice de vegetación (NDVI, VARI, etc.)
  const loadIndexLayer = useCallback((taskUuid: string, layerType: string) => {
    if (!indexLayerRef.current || !mapInstanceRef.current || !mapping?.odmProjectId) return;
    if (layerType === "orthophoto") {
      // Si es ortofoto, ocultar capa de índice y mostrar ortofoto
      indexLayerRef.current.setVisible(false);
      if (orthoLayerRef.current) orthoLayerRef.current.setVisible(true);
      return;
    }

    // Ocultar ortofoto cuando se muestra un índice
    if (orthoLayerRef.current) orthoLayerRef.current.setVisible(false);

    const proxyUrl = `/api/odm-tiles/${mapping.odmProjectId}/${taskUuid}/${layerType}/{z}/{x}/{y}.png`;
    console.log("[ParcelAnalysis] Loading index layer:", layerType, proxyUrl);
    setTileStatus(`Cargando ${layerType.toUpperCase()}...`);

    fetch(`/api/odm-bounds/${mapping.odmProjectId}/${taskUuid}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const serverMaxZoom = data?.maxzoom || 24;
        const tileSource = createTileSource(
          proxyUrl,
          serverMaxZoom,
          () => { setTileStatus(""); },
          () => { setTileStatus(`Error cargando ${layerType.toUpperCase()} - verificar conexión con WebODM`); }
        );

        if (indexLayerRef.current && mapInstanceRef.current) {
          indexLayerRef.current.setSource(tileSource);
          indexLayerRef.current.setVisible(true);
          mapInstanceRef.current.updateSize();
          mapInstanceRef.current.render();
        }
      })
      .catch(() => {
        const tileSource = createTileSource(proxyUrl, 24, () => setTileStatus(""), () => setTileStatus(`Error cargando ${layerType.toUpperCase()}`));
        if (indexLayerRef.current && mapInstanceRef.current) {
          indexLayerRef.current.setSource(tileSource);
          indexLayerRef.current.setVisible(true);
          mapInstanceRef.current.updateSize();
          mapInstanceRef.current.render();
        }
      });
  }, [mapping?.odmProjectId, createTileSource]);

  // Función para ocultar todas las capas de tiles
  const hideTiles = useCallback(() => {
    if (orthoLayerRef.current) orthoLayerRef.current.setVisible(false);
    if (indexLayerRef.current) indexLayerRef.current.setVisible(false);
    setTileStatus("");
    setOrthoLoaded(false);
  }, []);

  // Handler para seleccionar tarea manualmente
  const handleSelectTask = useCallback((taskUuid: string) => {
    console.log("[ParcelAnalysis] Manual select task:", taskUuid);
    setSelectedTaskUuid(taskUuid);
    setSelectedLayerType("orthophoto"); // Siempre empezar con ortofoto
    // Cargar ortofoto inmediatamente
    if (mapInstanceRef.current && orthoLayerRef.current && mapping?.odmProjectId) {
      setTimeout(() => loadOrthophoto(taskUuid), 100);
    }
  }, [loadOrthophoto, mapping?.odmProjectId]);

  // Inicializar mapa OpenLayers
  useEffect(() => {
    if (!mapRef.current) return;

    // Limpiar mapa anterior
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setTarget(undefined);
      mapInstanceRef.current = null;
      orthoLayerRef.current = null;
      indexLayerRef.current = null;
    }

    let center = fromLonLat([-105.0, 23.0]);
    let zoom = 5;

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
      } catch (e) { console.warn("Error parsing polygon:", e); }
    }

    const baseLayer = new TileLayer({ source: new OSM() });
    const orthoTileLayer = new TileLayer({ visible: false, opacity: 0.9, zIndex: 10 });
    const indexTileLayer = new TileLayer({ visible: false, opacity: 0.9, zIndex: 15 });
    orthoLayerRef.current = orthoTileLayer;
    indexLayerRef.current = indexTileLayer;

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

    const vectorLayer = new VectorLayer({ source: new VectorSource({ features }), zIndex: 20 });

    const mapView = new View({ center, zoom, maxZoom: 24 });
    const map = new Map({
      target: mapRef.current,
      layers: [baseLayer, orthoTileLayer, indexTileLayer, vectorLayer],
      view: mapView,
    });

    // Rastrear zoom actual para mostrar indicador
    mapView.on("change:resolution", () => {
      const z = mapView.getZoom();
      if (z !== undefined) setCurrentZoom(Math.round(z));
    });

    mapInstanceRef.current = map;
    console.log("[ParcelAnalysis] Map initialized for parcel:", parcel?.id);

    // Si ya hay una tarea seleccionada, cargar ortofoto después de que el mapa esté listo
    if (selectedTaskUuid && mapping?.odmProjectId) {
      setTimeout(() => {
        console.log("[ParcelAnalysis] Map ready, loading orthophoto for pre-selected task:", selectedTaskUuid);
        loadOrthophoto(selectedTaskUuid);
        // Si había un índice seleccionado, cargarlo también
        if (selectedLayerType !== "orthophoto") {
          setTimeout(() => loadIndexLayer(selectedTaskUuid, selectedLayerType), 500);
        }
      }, 300);
    }

    return () => {
      map.setTarget(undefined);
      mapInstanceRef.current = null;
      orthoLayerRef.current = null;
      indexLayerRef.current = null;
    };
  }, [parcel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cuando cambia selectedTaskUuid, cargar ortofoto base
  useEffect(() => {
    if (!mapInstanceRef.current || !orthoLayerRef.current) return;
    if (selectedTaskUuid && mapping?.odmProjectId) {
      loadOrthophoto(selectedTaskUuid);
      // Si hay un índice seleccionado, cargarlo después de un breve delay
      if (selectedLayerType !== "orthophoto") {
        setTimeout(() => loadIndexLayer(selectedTaskUuid, selectedLayerType), 300);
      }
    } else {
      hideTiles();
    }
  }, [selectedTaskUuid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cuando cambia el tipo de capa, alternar entre ortofoto e índice
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedTaskUuid || !mapping?.odmProjectId) return;
    if (selectedLayerType === "orthophoto") {
      // Mostrar ortofoto, ocultar índice
      if (orthoLayerRef.current) orthoLayerRef.current.setVisible(true);
      if (indexLayerRef.current) indexLayerRef.current.setVisible(false);
      setTileStatus("");
    } else {
      // Ocultar ortofoto, cargar y mostrar índice
      loadIndexLayer(selectedTaskUuid, selectedLayerType);
    }
  }, [selectedLayerType]); // eslint-disable-line react-hooks/exhaustive-deps

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
                {selectedTaskUuid && (() => {
                  const currentTask = sortedTasks.find((t: any) => (t.uuid || String(t.id)) === selectedTaskUuid);
                  const taskType = isRGBTask(currentTask);
                  return (
                    <>
                      <span className="text-xs font-normal text-green-500 bg-green-50 px-2 py-0.5 rounded-full">
                        {currentTask?.name || "Tarea"}
                      </span>
                      {taskType !== null && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          taskType ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                        }`}>
                          {taskType ? "RGB" : "Multi"}
                        </span>
                      )}
                    </>
                  );
                })()}
              </h3>
            </div>
            {/* Selector de capas — filtrado por tipo de vuelo */}
            {selectedTaskUuid && (() => {
              const currentTask = sortedTasks.find((t: any) => (t.uuid || String(t.id)) === selectedTaskUuid);
              const taskType = isRGBTask(currentTask);
              // Si es RGB, ocultar capas que requieren multiespectral (NDVI, ENDVI)
              const visibleLayers = taskType === true
                ? LAYER_TYPES.filter(l => RGB_COMPATIBLE_LAYERS.includes(l.key))
                : LAYER_TYPES;
              return (
                <div className="flex flex-wrap gap-1.5">
                  {visibleLayers.map(({ key, label, shortLabel }) => (
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
                  {taskType === true && (
                    <span className="flex items-center text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                      NDVI/ENDVI ocultos (requieren multiespectral)
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
        <div className="relative">
          <div
            ref={mapRef}
            className="w-full h-[300px] sm:h-[400px] md:h-[500px] lg:h-[600px]"
            style={{ background: "#f0f9f0" }}
          />
          {/* Indicador de estado de tiles */}
          {tileStatus && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl shadow-lg border border-green-200/50 z-20">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                {tileStatus}
              </div>
            </div>
          )}
          {/* Indicador de zoom bajo - ortomosaico no visible (solo en modo ortofoto) */}
          {selectedTaskUuid && selectedLayerType === "orthophoto" && currentZoom < tileMinZoom && !tileStatus && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-amber-50/95 backdrop-blur-sm px-4 py-2.5 rounded-xl shadow-lg border border-amber-300/60 z-20 max-w-xs text-center">
              <div className="flex items-center gap-2 text-sm text-amber-700 font-medium">
                <Eye className="h-4 w-4 flex-shrink-0" />
                <span>Acerca el zoom para ver el ortomosaico</span>
              </div>
              <button
                onClick={() => {
                  if (mapInstanceRef.current && selectedTaskUuid && mapping?.odmProjectId) {
                    fetch(`/api/odm-bounds/${mapping.odmProjectId}/${selectedTaskUuid}`)
                      .then(r => r.ok ? r.json() : null)
                      .then(data => {
                        if (data?.bounds && mapInstanceRef.current) {
                          const [minLon, minLat, maxLon, maxLat] = data.bounds;
                          const ext = transformExtent([minLon, minLat, maxLon, maxLat], "EPSG:4326", "EPSG:3857");
                          mapInstanceRef.current.getView().fit(ext, { padding: [30,30,30,30], maxZoom: 22, duration: 600 });
                        }
                      });
                  }
                }}
                className="mt-1.5 px-3 py-1 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors"
              >
                Ir al ortomosaico
              </button>
            </div>
          )}
          {/* Indicador si no hay tarea seleccionada */}
          {!selectedTaskUuid && mapping && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/5 z-10">
              <div className="bg-white/90 backdrop-blur-sm px-6 py-4 rounded-2xl shadow-lg text-center">
                <Plane className="h-8 w-8 mx-auto text-green-400 mb-2" />
                <p className="text-sm text-green-700 font-medium">Selecciona un vuelo completado</p>
                <p className="text-xs text-green-500 mt-1">del timeline de abajo para ver el ortomosaico</p>
              </div>
            </div>
          )}
        </div>
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
              {selectedLayerType === "exg" && (
                <span><strong>EXG</strong> — Exceso de Verde. Resalta áreas con vegetación verde prominente.</span>
              )}
              {selectedLayerType === "gli" && (
                <span><strong>GLI</strong> — Índice de Hoja Verde. Detecta cobertura de hojas verdes en el cultivo.</span>
              )}
              {selectedLayerType === "endvi" && (
                <span><strong>ENDVI</strong> — NDVI Mejorado. Versión optimizada del NDVI para imágenes RGB.</span>
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
              const taskIdentifier = task.uuid || String(task.id);
              const isSelected = !!(selectedTaskUuid && taskIdentifier && taskIdentifier === selectedTaskUuid);
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
                      if (isCompleted) handleSelectTask(taskIdentifier);
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
                        {(() => {
                          const taskType = isRGBTask(task);
                          if (taskType === null) return null;
                          return (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold w-fit ${
                              taskType ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                            }`}>
                              {taskType ? "RGB" : "Multi"}
                            </span>
                          );
                        })()}
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
                          onClick={(e) => { e.stopPropagation(); handleSelectTask(taskIdentifier); }}
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
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    totalHectares: "",
    productiveHectares: "",
    totalTrees: "",
    productiveTrees: "",
    newTrees: "",
    cropId: "",
    varietyId: "",
    establishedAt: "",
  });
  const [newNoteText, setNewNoteText] = useState("");

  const utils = trpc.useUtils();
  const saveMutation = trpc.parcelAnalysis.saveDetails.useMutation({
    onSuccess: () => {
      utils.parcelAnalysis.getAllDetails.invalidate();
      setEditing(false);
    },
  });

  // Cargar cultivos y variedades
  const { data: crops } = trpc.crops.list.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  // Cargar notas de la parcela
  const { data: notes, refetch: refetchNotes } = trpc.parcelAnalysis.getNotes.useQuery(
    { parcelId: parcel.id },
    { enabled: !!parcel.id, staleTime: 1 * 60 * 1000 }
  );

  const addNoteMutation = trpc.parcelAnalysis.addNote.useMutation({
    onSuccess: () => {
      refetchNotes();
      setNewNoteText("");
    },
  });

  const deleteNoteMutation = trpc.parcelAnalysis.deleteNote.useMutation({
    onSuccess: () => refetchNotes(),
  });

  // Variedades filtradas por cultivo seleccionado
  const selectedCrop = crops?.find((c: any) => c.id === parseInt(form.cropId));
  const varieties = selectedCrop?.varieties || [];

  useEffect(() => {
    if (details) {
      setForm({
        totalHectares: details.totalHectares || "",
        productiveHectares: details.productiveHectares || "",
        totalTrees: details.totalTrees?.toString() || "",
        productiveTrees: details.productiveTrees?.toString() || "",
        newTrees: details.newTrees?.toString() || "",
        cropId: details.cropId?.toString() || "",
        varietyId: details.varietyId?.toString() || "",
        establishedAt: details.establishedAt || "",
      });
    } else {
      setForm({ totalHectares: "", productiveHectares: "", totalTrees: "", productiveTrees: "", newTrees: "", cropId: "", varietyId: "", establishedAt: "" });
    }
  }, [details, parcel?.id]);

  const handleSave = () => {
    saveMutation.mutate({
      parcelId: parcel.id,
      totalHectares: form.totalHectares || null,
      productiveHectares: form.productiveHectares || null,
      treeDensityPerHectare: autoDensity > 0 ? String(autoDensity) : null,
      totalTrees: form.totalTrees ? parseInt(form.totalTrees) : null,
      productiveTrees: form.productiveTrees ? parseInt(form.productiveTrees) : null,
      newTrees: form.newTrees ? parseInt(form.newTrees) : null,
      cropId: form.cropId ? parseInt(form.cropId) : null,
      varietyId: form.varietyId ? parseInt(form.varietyId) : null,
      establishedAt: form.establishedAt || null,
    });
  };

  // Calcular árboles faltantes
  const totalTrees = form.totalTrees ? parseInt(form.totalTrees) : 0;
  const productiveTrees = form.productiveTrees ? parseInt(form.productiveTrees) : 0;
  const newTrees = form.newTrees ? parseInt(form.newTrees) : 0;
  const missingTrees = totalTrees - productiveTrees - newTrees;

  // Nombres de cultivo y variedad para modo lectura
  const cropName = crops?.find((c: any) => c.id === parseInt(form.cropId))?.name || "";
  const varietyName = varieties?.find((v: any) => v.id === parseInt(form.varietyId))?.name || "";

  // Calcular densidad por hectárea automáticamente
  const hectares = form.totalHectares ? parseFloat(form.totalHectares) : 0;
  const autoDensity = hectares > 0 && totalTrees > 0 ? Math.round(totalTrees / hectares) : 0;

  const fields = [
    { key: "totalHectares", label: "Hectáreas Totales", icon: Ruler, suffix: "ha", type: "text" },
    { key: "productiveHectares", label: "Hectáreas Productivas", icon: Ruler, suffix: "ha", type: "text" },
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

      {/* Cultivo y Variedad */}
      <GlassCard className="p-3 md:p-4" hover={true}>
        <h4 className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
          <Leaf className="h-4 w-4" />
          Cultivo y Variedad
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-green-600 font-medium mb-1 block">Cultivo</label>
            {editing ? (
              <select
                value={form.cropId}
                onChange={(e) => setForm({ ...form, cropId: e.target.value, varietyId: "" })}
                className="w-full px-3 py-2 text-sm bg-white/60 border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="">Seleccionar cultivo...</option>
                {crops?.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            ) : (
              <div className="text-lg font-bold text-green-900">
                {cropName || <span className="text-green-300 text-base">Sin asignar</span>}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-green-600 font-medium mb-1 block">Variedad</label>
            {editing ? (
              <select
                value={form.varietyId}
                onChange={(e) => setForm({ ...form, varietyId: e.target.value })}
                disabled={!form.cropId}
                className="w-full px-3 py-2 text-sm bg-white/60 border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50"
              >
                <option value="">{form.cropId ? "Seleccionar variedad..." : "Primero selecciona un cultivo"}</option>
                {varieties.map((v: any) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            ) : (
              <div className="text-lg font-bold text-green-900">
                {varietyName || <span className="text-green-300 text-base">Sin asignar</span>}
              </div>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Fecha de Establecimiento */}
      <GlassCard className="p-3 md:p-4" hover={true}>
        <div className="flex items-center gap-2 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100">
            <Calendar className="h-4 w-4 text-amber-600" />
          </div>
          <span className="text-xs text-amber-600 font-medium">Fecha de Establecimiento</span>
        </div>
        {editing ? (
          <input
            type="date"
            value={form.establishedAt}
            onChange={(e) => setForm({ ...form, establishedAt: e.target.value })}
            className="w-full px-3 py-2 text-lg font-bold text-green-900 bg-white/60 border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        ) : (
          <div className="text-xl md:text-2xl font-bold text-green-900">
            {form.establishedAt ? (
              new Date(form.establishedAt + "T12:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })
            ) : (
              <span className="text-green-300 text-base">Sin fecha</span>
            )}
          </div>
        )}
      </GlassCard>

      {/* Campos numéricos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {fields.map(({ key, label, icon: Icon, suffix, type }) => (
          <GlassCard key={key} className="p-3 md:p-4" hover={true}>
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

        {/* Tarjeta de Densidad por Hectárea (calculada automáticamente) */}
        {autoDensity > 0 && (
          <GlassCard className="p-3 md:p-4" hover={true}>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100">
                <TreePine className="h-4 w-4 text-blue-600" />
              </div>
              <span className="text-xs text-blue-600 font-medium">Densidad por Hectárea</span>
            </div>
            <div className="text-xl md:text-2xl font-bold text-blue-700">
              {autoDensity.toLocaleString()}
              <span className="text-sm font-normal text-blue-400 ml-1">árboles/ha</span>
            </div>
            <p className="text-[10px] text-blue-400 mt-1">Total árboles ÷ Hectáreas totales</p>
          </GlassCard>
        )}

        {/* Tarjeta de Árboles Faltantes (calculada) */}
        {totalTrees > 0 && (
          <GlassCard className="p-3 md:p-4" hover={true}>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100">
                <TreePine className="h-4 w-4 text-red-600" />
              </div>
              <span className="text-xs text-red-600 font-medium">Árboles Faltantes</span>
            </div>
            <div className="text-xl md:text-2xl font-bold text-red-600">
              {missingTrees >= 0 ? missingTrees.toLocaleString() : 0}
            </div>
            <p className="text-[10px] text-red-400 mt-1">Total - Productivos - Nuevos</p>
          </GlassCard>
        )}
      </div>

      {/* Notas con autor y fecha */}
      <GlassCard className="p-3 md:p-4" hover={true}>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-green-800 flex items-center gap-2">
            <Edit3 className="h-4 w-4" />
            Notas
          </h4>
          <span className="text-xs text-green-500">{notes?.length || 0} notas</span>
        </div>

        {/* Formulario para agregar nota */}
        <div className="mb-3">
          <div className="flex gap-2">
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              className="flex-1 px-3 py-2 text-sm text-green-900 bg-white/60 border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 min-h-[60px] resize-y"
              placeholder="Escribe una nota..."
            />
          </div>
          {newNoteText.trim() && (
            <button
              onClick={() => addNoteMutation.mutate({ parcelId: parcel.id, content: newNoteText.trim() })}
              disabled={addNoteMutation.isPending}
              className="mt-2 flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-all disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {addNoteMutation.isPending ? "Guardando..." : "Agregar Nota"}
            </button>
          )}
        </div>

        {/* Lista de notas */}
        <div className="space-y-2">
          {(!notes || notes.length === 0) && (
            <p className="text-xs text-green-400 italic">Sin notas aún</p>
          )}
          {notes?.map((note: any) => (
            <div key={note.id} className="bg-white/40 rounded-xl p-3 border border-green-100/30">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-sm text-green-800 whitespace-pre-wrap">{note.content}</p>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-green-500">
                    <span className="font-medium">{note.authorName || "Usuario"}</span>
                    <span>&middot;</span>
                    <span>{formatDateTime(note.createdAt)}</span>
                  </div>
                </div>
                {(isAdmin || note.userId === user?.id) && (
                  <button
                    onClick={() => {
                      if (confirm("¿Eliminar esta nota?")) {
                        deleteNoteMutation.mutate({ noteId: note.id });
                      }
                    }}
                    className="flex-shrink-0 p-1 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Composición del Arbolado */}
      {(form.totalTrees || form.productiveTrees || form.newTrees) && (
        <GlassCard className="p-3 md:p-5" hover={true}>
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
            {totalTrees > 0 && missingTrees > 0 && (
              <div>
                <div className="flex justify-between text-xs text-red-600 mb-1">
                  <span>Faltantes</span>
                  <span>{Math.round((missingTrees / totalTrees) * 100)}%</span>
                </div>
                <div className="h-3 bg-red-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-400 to-rose-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (missingTrees / totalTrees) * 100)}%` }}
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
  const productiveTreesCount = parcelDetail?.productiveTrees || null;

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

  // Calcular rendimiento porcentual
  const totalWeight = harvestStats?.totalWeight || 0;
  const firstQPct = totalWeight > 0 ? ((harvestStats?.firstQualityWeight || 0) / totalWeight * 100).toFixed(1) : "0";
  const secondQPct = totalWeight > 0 ? ((harvestStats?.secondQualityWeight || 0) / totalWeight * 100).toFixed(1) : "0";
  const wastePct = totalWeight > 0 ? ((harvestStats?.wasteWeight || 0) / totalWeight * 100).toFixed(1) : "0";

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
      {/* Números totales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Cosechado", value: `${harvestStats.totalWeight} kg`, icon: Package, color: "from-green-400 to-emerald-500" },
          { label: "1ra Calidad", value: `${harvestStats.firstQualityWeight} kg`, icon: TrendingUp, color: "from-emerald-400 to-green-500" },
          { label: "2da Calidad", value: `${harvestStats.secondQualityWeight} kg`, icon: BarChart3, color: "from-yellow-400 to-orange-500" },
          { label: "Desperdicio", value: `${harvestStats.wasteWeight} kg`, icon: X, color: "from-red-400 to-rose-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <GlassCard key={label} className="p-3 md:p-4" hover={true}>
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

      {/* Datos de parcela: Árboles productivos y Hectáreas productivas */}
      {(productiveTreesCount || productiveHa) && (
        <div className="grid grid-cols-2 gap-3">
          {productiveTreesCount && (
            <GlassCard className="p-3 md:p-4" hover={true}>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-green-400 to-emerald-600 shadow-sm">
                  <TreePine className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-[10px] md:text-xs text-green-600">Árboles Productivos</span>
              </div>
              <div className="text-lg md:text-xl font-bold text-green-900">{productiveTreesCount.toLocaleString()}</div>
            </GlassCard>
          )}
          {productiveHa && (
            <GlassCard className="p-3 md:p-4" hover={true}>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-lime-400 to-green-500 shadow-sm">
                  <Ruler className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-[10px] md:text-xs text-green-600">Hectáreas Productivas</span>
              </div>
              <div className="text-lg md:text-xl font-bold text-green-900">{productiveHa} ha</div>
            </GlassCard>
          )}
        </div>
      )}

      {/* Rendimiento por Árbol */}
      {productiveTreesCount && productiveTreesCount > 0 && totalWeight > 0 && (
        <GlassCard className="p-3 md:p-4" hover={true}>
          <h4 className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
            <TreePine className="h-4 w-4" />
            Rendimiento por Árbol
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-green-600">Total / árbol</div>
              <div className="text-lg font-bold text-green-900">{(totalWeight / productiveTreesCount).toFixed(2)} kg</div>
            </div>
            <div>
              <div className="text-xs text-emerald-600">1ra Calidad / árbol</div>
              <div className="text-lg font-bold text-emerald-700">{((harvestStats?.firstQualityWeight || 0) / productiveTreesCount).toFixed(2)} kg</div>
            </div>
            <div>
              <div className="text-xs text-yellow-600">2da Calidad / árbol</div>
              <div className="text-lg font-bold text-yellow-700">{((harvestStats?.secondQualityWeight || 0) / productiveTreesCount).toFixed(2)} kg</div>
            </div>
            <div>
              <div className="text-xs text-red-600">Desperdicio / árbol</div>
              <div className="text-lg font-bold text-red-600">{((harvestStats?.wasteWeight || 0) / productiveTreesCount).toFixed(2)} kg</div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Rendimiento Porcentual (protagonismo) */}
      <GlassCard className="p-3 md:p-4" hover={true}>
        <h4 className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Rendimiento Porcentual
        </h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-xs text-emerald-600 mb-1">1ra Calidad</div>
            <div className="text-2xl md:text-3xl font-bold text-emerald-700">{firstQPct}%</div>
            <div className="mt-2 h-2 bg-emerald-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-green-500 rounded-full transition-all duration-500" style={{ width: `${firstQPct}%` }} />
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-yellow-600 mb-1">2da Calidad</div>
            <div className="text-2xl md:text-3xl font-bold text-yellow-700">{secondQPct}%</div>
            <div className="mt-2 h-2 bg-yellow-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full transition-all duration-500" style={{ width: `${secondQPct}%` }} />
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-red-600 mb-1">Desperdicio</div>
            <div className="text-2xl md:text-3xl font-bold text-red-600">{wastePct}%</div>
            <div className="mt-2 h-2 bg-red-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-red-400 to-rose-500 rounded-full transition-all duration-500" style={{ width: `${wastePct}%` }} />
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Rendimiento por Hectárea + Fecha inicio ciclo */}
      {productiveHa && productiveHa > 0 && (
        <GlassCard className="p-3 md:p-4" hover={true}>
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
              <div className="text-xs text-green-600">Días de cosecha</div>
              <div className="text-lg font-bold text-green-900">{harvestStats.harvestDays}</div>
            </div>
            <div>
              <div className="text-xs text-green-600">Inicio ciclo cosecha</div>
              <div className="text-lg font-bold text-green-900">{harvestStats.firstDate ? formatDate(harvestStats.firstDate) : "-"}</div>
            </div>
          </div>
        </GlassCard>
      )}

      {chartData.length > 0 && (
        <GlassCard className="p-3 md:p-5" hover={true}>
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
        <GlassCard className="p-3 md:p-5" hover={true}>
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

// ============ TAB 4: NOTAS DE CAMPO EN MAPA ============
function FieldNotesMapTab({ parcel, mapping, odmMappings, allParcels, onSelectParcel }: {
  parcel: any; mapping: any; odmMappings: any[]; allParcels: any[]; onSelectParcel: (id: number) => void;
}) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<Overlay | null>(null);
  const notesLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const orthoLayerRef = useRef<TileLayer<XYZ> | null>(null);

  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterNoPhoto, setFilterNoPhoto] = useState(false);
  const [hoveredNoteId, setHoveredNoteId] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [detailNote, setDetailNote] = useState<any>(null);
  const [photoViewerSrc, setPhotoViewerSrc] = useState<string | null>(null);

  const addCommentMut = trpc.fieldNotes.addComment.useMutation({
    onSuccess: () => { setCommentText(""); utils.fieldNotes.list.invalidate(); },
  });
  const updateMut = trpc.fieldNotes.update.useMutation({
    onSuccess: () => { utils.fieldNotes.list.invalidate(); },
  });
  const { data: collaborators } = trpc.collaborators.list.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  const { data: allNotes, isLoading: notesLoading } = trpc.fieldNotes.list.useQuery({}, { enabled: !!user, staleTime: 30 * 1000 });
  const { data: tasks } = trpc.webodm.getProjectTasks.useQuery({ projectId: mapping?.odmProjectId || 0 }, { enabled: !!mapping?.odmProjectId, staleTime: 2 * 60 * 1000 });

  const parcelBounds = useMemo(() => {
    if (!parcel?.polygon) return null;
    try {
      const poly = typeof parcel.polygon === "string" ? JSON.parse(parcel.polygon) : parcel.polygon;
      if (!poly.coordinates?.[0]?.length) return null;
      const coords = poly.coordinates[0];
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      for (const [lng, lat] of coords) { if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat; if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng; }
      const latPad = (maxLat - minLat) * 0.2 || 0.002, lngPad = (maxLng - minLng) * 0.2 || 0.002;
      return { minLat: minLat - latPad, maxLat: maxLat + latPad, minLng: minLng - lngPad, maxLng: maxLng + lngPad };
    } catch { return null; }
  }, [parcel?.polygon]);

  const notes = useMemo(() => {
    if (!allNotes) return [];
    return allNotes.filter((n: any) => {
      if (n.parcelId === parcel?.id) return true;
      if (!n.parcelId && n.latitude && n.longitude && parcelBounds) {
        const lat = parseFloat(n.latitude), lng = parseFloat(n.longitude);
        return lat >= parcelBounds.minLat && lat <= parcelBounds.maxLat && lng >= parcelBounds.minLng && lng <= parcelBounds.maxLng;
      }
      return false;
    });
  }, [allNotes, parcel?.id, parcelBounds]);

  const filteredNotes = useMemo(() => notes.filter((n: any) => {
    if (!n.latitude || !n.longitude) return false;
    if (filterCategory !== "all" && n.category !== filterCategory) return false;
    if (filterSeverity !== "all" && n.severity !== filterSeverity) return false;
    if (filterNoPhoto && n.photos && n.photos.length > 0) return false;
    return true;
  }), [notes, filterCategory, filterSeverity, filterNoPhoto]);

  const stats = useMemo(() => {
    if (!notes) return { total: 0, withGps: 0, withPhoto: 0, withoutPhoto: 0, critical: 0 };
    return { total: notes.length, withGps: notes.filter((n: any) => n.latitude && n.longitude).length,
      withPhoto: notes.filter((n: any) => n.photos?.length > 0).length, withoutPhoto: notes.filter((n: any) => !n.photos || n.photos.length === 0).length,
      critical: notes.filter((n: any) => n.severity === "critica" || n.severity === "alta").length };
  }, [notes]);

  const bestTaskUuid = useMemo(() => {
    if (!tasks) return null;
    const completed = tasks.filter((t: any) => t.status === 40);
    if (!completed.length) return null;
    const sorted = [...completed].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const rgbFlight = sorted.find((t: any) => isRGBTask(t) === true);
    if (rgbFlight) return rgbFlight.uuid || String(rgbFlight.id);
    const nonMulti = sorted.find((t: any) => isRGBTask(t) !== false);
    return nonMulti ? (nonMulti.uuid || String(nonMulti.id)) : (sorted[0].uuid || String(sorted[0].id));
  }, [tasks]);

  const createNoteStyle = useCallback((note: any, isHighlighted = false) => {
    const sevColor = SEVERITY_COLORS[note.severity] || "#6b7280";
    const cat = NOTE_CATEGORIES[note.category] || NOTE_CATEGORIES.otro;
    const hasPhoto = note.photos?.length > 0;
    const r = isHighlighted ? 18 : 14;
    return new Style({
      image: new CircleStyle({ radius: r, fill: new Fill({ color: sevColor }), stroke: new Stroke({ color: hasPhoto ? "#fff" : "#000", width: isHighlighted ? 3.5 : 2.5, lineDash: hasPhoto ? undefined : [4, 4] }) }),
      text: new OlText({ text: cat.emoji, font: `${r}px sans-serif`, fill: new Fill({ color: "#fff" }), stroke: new Stroke({ color: "rgba(0,0,0,0.5)", width: 1 }) }),
      zIndex: isHighlighted ? 100 : 1,
    });
  }, []);

  const flyToNote = useCallback((note: any) => {
    if (!mapInstanceRef.current) return;
    const lat = parseFloat(note.latitude), lng = parseFloat(note.longitude);
    if (isNaN(lat) || isNaN(lng)) return;
    const coords = fromLonLat([lng, lat]);
    mapInstanceRef.current.getView().animate({ center: coords, zoom: 20, duration: 600 });
    setSelectedNote(note); overlayRef.current?.setPosition(coords);
    notesLayerRef.current?.getSource()?.getFeatures().forEach(f => { const nd = f.get("noteData"); f.setStyle(createNoteStyle(nd, nd?.id === note.id)); });
  }, [createNoteStyle]);

  const goToFieldNotes = useCallback((note: any) => { window.location.href = `/field-notes?noteId=${note.id}`; }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const overlay = new Overlay({ element: popupRef.current || undefined, autoPan: { animation: { duration: 250 } } as any, positioning: "bottom-center" as any, offset: [0, -20] });
    overlayRef.current = overlay;
    let center = fromLonLat([-105.0, 23.0]), zoom = 5;
    if (parcel?.polygon) { try { const poly = typeof parcel.polygon === "string" ? JSON.parse(parcel.polygon) : parcel.polygon; if (poly.coordinates?.[0]?.length > 0) { const c = poly.coordinates[0]; center = fromLonLat([c.reduce((s: number, p: number[]) => s + p[0], 0) / c.length, c.reduce((s: number, p: number[]) => s + p[1], 0) / c.length]); zoom = 16; } } catch {} }
    const baseLayer = new TileLayer({ source: new OSM() });
    const orthoTileLayer = new TileLayer({ visible: false, opacity: 0.9, zIndex: 10 }); orthoLayerRef.current = orthoTileLayer;
    const polyFeatures: Feature[] = [];
    if (parcel?.polygon) { try { const poly = typeof parcel.polygon === "string" ? JSON.parse(parcel.polygon) : parcel.polygon; if (poly.coordinates?.[0]) { const f = new Feature({ geometry: new Polygon([poly.coordinates[0].map((c: number[]) => fromLonLat([c[0], c[1]]))]) }); f.setStyle(new Style({ fill: new Fill({ color: "rgba(16,185,129,0.06)" }), stroke: new Stroke({ color: "#10b981", width: 2, lineDash: [8, 4] }) })); polyFeatures.push(f); } } catch {} }
    const polygonLayer = new VectorLayer({ source: new VectorSource({ features: polyFeatures }), zIndex: 5 });
    const nvl = new VectorLayer({ source: new VectorSource(), zIndex: 25 }); notesLayerRef.current = nvl;
    const map = new Map({ target: mapRef.current, layers: [baseLayer, orthoTileLayer, polygonLayer, nvl], overlays: [overlay], view: new View({ center, zoom, maxZoom: 24 }) });
    map.on("click", (evt) => { const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f); if (feature?.get("noteData")) { const nd = feature.get("noteData"); setSelectedNote(nd); const g = feature.getGeometry(); if (g) overlay.setPosition((g as Point).getCoordinates()); nvl.getSource()?.getFeatures().forEach(f => { const d = f.get("noteData"); f.setStyle(createNoteStyle(d, d?.id === nd?.id)); }); } else { setSelectedNote(null); overlay.setPosition(undefined); nvl.getSource()?.getFeatures().forEach(f => f.setStyle(createNoteStyle(f.get("noteData"), false))); } });
    map.on("pointermove", (evt) => { const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => !!f.get("noteData")); const el = map.getTargetElement(); if (el) (el as HTMLElement).style.cursor = hit ? "pointer" : ""; });
    mapInstanceRef.current = map;
    return () => { map.setTarget(undefined); mapInstanceRef.current = null; };
  }, [parcel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapInstanceRef.current || !orthoLayerRef.current || !bestTaskUuid || !mapping?.odmProjectId) return;
    fetch(`/api/odm-bounds/${mapping.odmProjectId}/${bestTaskUuid}`).then(r => r.ok ? r.json() : null).then(data => {
      const ts = new XYZ({ url: `/api/odm-tiles/${mapping.odmProjectId}/${bestTaskUuid}/orthophoto/{z}/{x}/{y}.png`, minZoom: 0, maxZoom: data?.maxzoom || 24, tileSize: 256, crossOrigin: "anonymous" });
      if (orthoLayerRef.current && mapInstanceRef.current) { orthoLayerRef.current.setSource(ts); orthoLayerRef.current.setVisible(true); if (data?.bounds) { mapInstanceRef.current.getView().fit(transformExtent(data.bounds, "EPSG:4326", "EPSG:3857"), { padding: [50, 50, 50, 50], maxZoom: 19, duration: 800 }); } }
    }).catch(() => {});
  }, [bestTaskUuid, mapping?.odmProjectId]);

  useEffect(() => {
    if (!notesLayerRef.current) return; const source = notesLayerRef.current.getSource(); if (!source) return; source.clear();
    for (const note of filteredNotes) { const lat = parseFloat(note.latitude), lng = parseFloat(note.longitude); if (isNaN(lat) || isNaN(lng)) continue; const f = new Feature({ geometry: new Point(fromLonLat([lng, lat])), noteData: note }); f.setStyle(createNoteStyle(note, false)); source.addFeature(f); }
    if (filteredNotes.length > 0 && !bestTaskUuid && mapInstanceRef.current) mapInstanceRef.current.getView().fit(source.getExtent(), { padding: [60, 60, 60, 60], maxZoom: 18, duration: 500 });
  }, [filteredNotes, createNoteStyle, bestTaskUuid]);

  useEffect(() => { setTimeout(() => mapInstanceRef.current?.updateSize(), 300); }, [isFullscreen]);

  if (notesLoading) return <GlassCard className="p-8 text-center" hover={false}><div className="animate-pulse text-green-600">Cargando notas...</div></GlassCard>;

  const containerCls = isFullscreen ? "fixed inset-0 z-50 bg-gradient-to-br from-green-50 via-white to-emerald-50/30 overflow-y-auto p-4" : "space-y-4";

  return (
    <div className={containerCls}>
      {/* Photo Viewer */}
      {photoViewerSrc && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center cursor-zoom-out" onClick={() => setPhotoViewerSrc(null)}>
          <img src={photoViewerSrc} alt="" className="max-w-[95vw] max-h-[95vh] object-contain" />
          <button onClick={() => setPhotoViewerSrc(null)} className="absolute top-4 right-4 bg-white/20 text-white rounded-full p-2 hover:bg-white/40"><X className="h-6 w-6" /></button>
        </div>
      )}

      {/* Detail Modal */}
      {detailNote && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDetailNote(null)}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {detailNote.photos?.length > 0 ? (
              <div className="relative bg-gray-900 rounded-t-3xl">
                <div className={`flex ${detailNote.photos.length === 1 ? "justify-center" : "overflow-x-auto snap-x gap-1"} p-2`}>
                  {detailNote.photos.map((p: any, i: number) => (
                    <img key={p.id || i} src={p.photoPath} alt=""
                      className="max-h-72 min-h-[180px] w-auto object-contain snap-center cursor-zoom-in flex-shrink-0 rounded-xl"
                      onClick={() => setPhotoViewerSrc(p.photoPath)} />
                  ))}
                </div>
                <span className="absolute top-3 right-3 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">{detailNote.photos.length} {detailNote.photos.length === 1 ? "foto" : "fotos"}</span>
              </div>
            ) : (
              <div className="h-16 bg-amber-50 rounded-t-3xl flex items-center justify-center gap-2 text-amber-600"><CameraOff className="h-5 w-5" /><span className="font-medium">Sin fotos</span></div>
            )}
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-xl shadow" style={{ backgroundColor: SEVERITY_COLORS[detailNote.severity] || "#6b7280" }}>{NOTE_CATEGORIES[detailNote.category]?.emoji || "📝"}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-green-900">{NOTE_CATEGORIES[detailNote.category]?.label || detailNote.category}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white" style={{ backgroundColor: SEVERITY_COLORS[detailNote.severity] || "#6b7280" }}>{detailNote.severity}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${detailNote.status === "resuelta" ? "bg-green-100 text-green-700" : detailNote.status === "abierta" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{detailNote.status}</span>
                  </div>
                  <p className="text-sm text-green-700 mt-1">{detailNote.description}</p>
                  <div className="flex gap-3 mt-2 text-xs text-green-500"><span>{detailNote.reportedByName || "Usuario"}</span><span>{formatDate(detailNote.createdAt)}</span></div>
                </div>
              </div>
              {/* Assign */}
              <div className="bg-green-50/50 rounded-xl p-3">
                <label className="text-[10px] font-semibold text-green-700 flex items-center gap-1 mb-1.5"><UserPlus className="h-3 w-3" /> Asignar a equipo</label>
                <select value={detailNote.assignedToCollaboratorId || ""} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; updateMut.mutate({ id: detailNote.id, assignedToCollaboratorId: v }); setDetailNote({ ...detailNote, assignedToCollaboratorId: v }); }}
                  className="w-full text-xs bg-white border border-green-200 rounded-lg px-3 py-2 text-green-800 focus:outline-none focus:ring-2 focus:ring-green-400">
                  <option value="">Sin asignar</option>
                  {(collaborators || []).filter((c: any) => c.isActive).map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.role ? ` (${c.role})` : ""}</option>)}
                </select>
              </div>
              {/* Comments */}
              {detailNote.resolutionNotes && (
                <div className="bg-blue-50/50 rounded-xl p-3">
                  <h4 className="text-[10px] font-semibold text-blue-700 flex items-center gap-1 mb-1.5"><MessageSquare className="h-3 w-3" /> Comentarios</h4>
                  <div className="text-xs text-blue-800 whitespace-pre-wrap max-h-32 overflow-y-auto bg-white/60 rounded-lg p-2">{detailNote.resolutionNotes}</div>
                </div>
              )}
              <div className="flex gap-2">
                <input type="text" value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Agregar comentario..."
                  onKeyDown={e => { if (e.key === "Enter" && commentText.trim()) addCommentMut.mutate({ id: detailNote.id, comment: commentText.trim() }); }}
                  className="flex-1 text-xs bg-white border border-green-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400" />
                <button onClick={() => { if (commentText.trim()) addCommentMut.mutate({ id: detailNote.id, comment: commentText.trim() }); }}
                  disabled={!commentText.trim() || addCommentMut.isPending}
                  className="bg-green-600 text-white px-3 py-2 rounded-xl text-xs font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1">
                  <Send className="h-3 w-3" /> {addCommentMut.isPending ? "..." : "Enviar"}
                </button>
              </div>
              <div className="flex gap-2 pt-2 border-t border-green-100">
                <button onClick={() => goToFieldNotes(detailNote)} className="flex-1 bg-blue-50 text-blue-700 px-3 py-2 rounded-xl text-xs font-medium hover:bg-blue-100 flex items-center justify-center gap-1.5"><ExternalLink className="h-3.5 w-3.5" /> Abrir nota completa</button>
                <button onClick={() => { flyToNote(detailNote); setDetailNote(null); }} className="flex-1 bg-green-50 text-green-700 px-3 py-2 rounded-xl text-xs font-medium hover:bg-green-100 flex items-center justify-center gap-1.5"><ZoomIn className="h-3.5 w-3.5" /> Ver en mapa</button>
                <button onClick={() => setDetailNote(null)} className="px-3 py-2 rounded-xl text-xs text-green-500 hover:bg-green-50"><X className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <GlassCard className="p-3 md:p-4" hover={false}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 shadow"><ClipboardList className="h-4 w-4 text-white" /></div>
            <div><h3 className="text-sm font-semibold text-green-900">Notas en Mapa</h3><p className="text-[10px] text-green-500">{stats.withGps} de {stats.total} con GPS</p></div>
          </div>
          {isFullscreen && (
            <select value={parcel?.id || ""} onChange={e => onSelectParcel(Number(e.target.value))}
              className="text-xs bg-white/60 border border-green-200/50 rounded-xl px-3 py-1.5 text-green-700 focus:outline-none focus:ring-1 focus:ring-green-400 max-w-[200px]">
              {allParcels.map((p: any) => <option key={p.id} value={p.id}>{p.name || p.code}</option>)}
            </select>
          )}
          <div className="flex flex-wrap gap-2 ml-auto items-center">
            <span className="text-[10px] bg-green-50 text-green-700 px-2 py-1 rounded-full flex items-center gap-1"><Camera className="h-3 w-3" /> {stats.withPhoto}</span>
            <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded-full flex items-center gap-1"><CameraOff className="h-3 w-3" /> {stats.withoutPhoto}</span>
            {stats.critical > 0 && <span className="text-[10px] bg-red-50 text-red-700 px-2 py-1 rounded-full flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {stats.critical}</span>}
            <button onClick={() => setIsFullscreen(!isFullscreen)} className="bg-green-600 text-white p-2 rounded-xl hover:bg-green-700 transition-all shadow-sm" title={isFullscreen ? "Salir" : "Pantalla completa"}>
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mt-4">
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="text-xs bg-white/60 border border-green-200/50 rounded-xl px-3 py-1.5 text-green-700 focus:outline-none focus:ring-1 focus:ring-green-400">
          <option value="all">Todas categorías</option>{Object.entries(NOTE_CATEGORIES).map(([k, { label, emoji }]) => <option key={k} value={k}>{emoji} {label}</option>)}
        </select>
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} className="text-xs bg-white/60 border border-green-200/50 rounded-xl px-3 py-1.5 text-green-700 focus:outline-none focus:ring-1 focus:ring-green-400">
          <option value="all">Todas prioridades</option><option value="baja">🔵 Baja</option><option value="media">🟡 Media</option><option value="alta">🟠 Alta</option><option value="critica">🔴 Crítica</option>
        </select>
        <button onClick={() => setFilterNoPhoto(!filterNoPhoto)} className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1 ${filterNoPhoto ? "bg-amber-500 text-white shadow-sm" : "bg-white/60 text-green-700 border border-green-200/50 hover:bg-amber-50"}`}><CameraOff className="h-3 w-3" /> Solo sin foto</button>
      </div>

      {/* Map + List */}
      <div className={`flex flex-col lg:flex-row gap-4 mt-4 ${isFullscreen ? "flex-1 min-h-0" : ""}`}>
        <GlassCard className="overflow-hidden flex-1 lg:min-w-0" hover={false}>
          <div className="relative">
            <div ref={mapRef} className={`w-full ${isFullscreen ? "h-[calc(100vh-220px)]" : "h-[350px] sm:h-[450px] md:h-[500px] lg:h-[600px]"}`} style={{ background: "#f0f9f0" }} />
            <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-green-200/50 p-2.5 z-20 text-[10px] space-y-1 max-w-[150px]">
              <div className="font-semibold text-green-800 text-xs mb-1">Prioridad</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-sm" /> Baja <span className="w-3 h-3 rounded-full bg-amber-500 border-2 border-white shadow-sm ml-1" /> Media</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-500 border-2 border-white shadow-sm" /> Alta <span className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-sm ml-1" /> Crítica</div>
              <div className="border-t border-green-200/30 pt-1 mt-1"><div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-black" style={{ borderStyle: "dashed" }} /> Sin foto</div></div>
            </div>
            {filteredNotes.length === 0 && !notesLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/5 z-10"><div className="bg-white/90 backdrop-blur-sm px-6 py-4 rounded-2xl shadow-lg text-center">
                <ClipboardList className="h-8 w-8 mx-auto text-green-300 mb-2" /><p className="text-sm text-green-700 font-medium">{notes.length === 0 ? "Sin notas en esta parcela" : "Sin notas que coincidan"}</p>
              </div></div>
            )}
          </div>
        </GlassCard>

        <div className={`${isFullscreen ? "lg:w-[380px] xl:w-[420px]" : "lg:w-[320px] xl:w-[360px]"} flex-shrink-0`}>
          <GlassCard className="p-0 overflow-hidden" hover={false}>
            <div className="p-3 border-b border-green-200/30 bg-white/30">
              <h4 className="text-sm font-semibold text-green-800 flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Notas ({filteredNotes.length})</h4>
              <p className="text-[10px] text-green-500 mt-0.5">Click = mapa · Doble click = detalle</p>
            </div>
            <div className={`${isFullscreen ? "max-h-[calc(100vh-300px)]" : "max-h-[350px] sm:max-h-[400px] lg:max-h-[540px]"} overflow-y-auto divide-y divide-green-100/50`}>
              {filteredNotes.length === 0 && <div className="p-6 text-center text-green-400 text-xs">Sin notas</div>}
              {filteredNotes.map((note: any) => {
                const cat = NOTE_CATEGORIES[note.category] || NOTE_CATEGORIES.otro;
                const hasPhoto = note.photos?.length > 0;
                const isActive = selectedNote?.id === note.id;
                const assignedCollab = collaborators?.find((c: any) => c.id === note.assignedToCollaboratorId);
                return (
                  <div key={note.id} onClick={() => flyToNote(note)} onDoubleClick={() => setDetailNote(note)} onMouseEnter={() => setHoveredNoteId(note.id)} onMouseLeave={() => setHoveredNoteId(null)}
                    className={`flex items-start gap-2.5 p-3 cursor-pointer transition-all ${isActive ? "bg-green-50 border-l-4 border-l-green-500" : hoveredNoteId === note.id ? "bg-green-50/50" : "hover:bg-white/40"}`}>
                    <div className="flex-shrink-0 relative">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm shadow-sm" style={{ backgroundColor: SEVERITY_COLORS[note.severity] || "#6b7280" }}>{cat.emoji}</div>
                      {!hasPhoto && <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center"><CameraOff className="h-2.5 w-2.5 text-white" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-green-900 truncate">{cat.label}</span>
                        <span className="text-[9px] px-1 py-0.5 rounded-full font-bold text-white flex-shrink-0" style={{ backgroundColor: SEVERITY_COLORS[note.severity] || "#6b7280" }}>{note.severity}</span>
                        <span className={`text-[9px] px-1 py-0.5 rounded-full flex-shrink-0 ${note.status === "resuelta" ? "bg-green-100 text-green-700" : note.status === "abierta" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{note.status}</span>
                      </div>
                      <p className="text-[10px] text-green-600 mt-0.5 line-clamp-2">{note.description}</p>
                      <div className="flex items-center gap-2 mt-1 text-[9px] text-green-400 flex-wrap">
                        <span>{note.reportedByName || "Usuario"}</span><span>·</span><span>{formatDate(note.createdAt)}</span>
                        {hasPhoto && <><span>·</span><span className="flex items-center gap-0.5 text-green-500"><Camera className="h-2.5 w-2.5" /> {note.photos.length}</span></>}
                        {assignedCollab && <><span>·</span><span className="flex items-center gap-0.5 text-purple-500"><Users2 className="h-2.5 w-2.5" /> {assignedCollab.name}</span></>}
                      </div>
                      <div className="flex gap-1 mt-1.5">
                        <button onClick={e => { e.stopPropagation(); setDetailNote(note); }} className="text-[9px] bg-green-50 text-green-600 px-2 py-0.5 rounded-lg hover:bg-green-100 flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" /> Detalle</button>
                        <button onClick={e => { e.stopPropagation(); goToFieldNotes(note); }} className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg hover:bg-blue-100 flex items-center gap-0.5"><ExternalLink className="h-2.5 w-2.5" /> Abrir</button>
                      </div>
                    </div>
                    {hasPhoto && <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-green-200/50"><img src={note.photos[0].photoPath} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /></div>}
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Popup */}
      <div ref={popupRef} className="absolute z-[40]" style={{ display: selectedNote ? undefined : "none" }}>
        {selectedNote && (
          <div className="bg-white rounded-2xl shadow-2xl border border-green-200/60 w-[280px] sm:w-[320px] overflow-hidden">
            {selectedNote.photos?.length > 0 ? (
              <div className="h-40 overflow-hidden bg-gray-900 flex items-center justify-center cursor-zoom-in" onClick={() => setPhotoViewerSrc(selectedNote.photos[0].photoPath)}>
                <img src={selectedNote.photos[0].photoPath} alt="" className="max-w-full max-h-full object-contain" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            ) : (
              <div className="h-12 bg-amber-50 flex items-center justify-center gap-2 text-amber-600"><CameraOff className="h-4 w-4" /><span className="text-xs font-medium">Sin foto</span></div>
            )}
            <div className="p-3">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-lg">{NOTE_CATEGORIES[selectedNote.category]?.emoji || "📝"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-green-900">{NOTE_CATEGORIES[selectedNote.category]?.label || selectedNote.category}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold text-white" style={{ backgroundColor: SEVERITY_COLORS[selectedNote.severity] || "#6b7280" }}>{selectedNote.severity}</span>
                  </div>
                  <p className="text-[11px] text-green-700 mt-0.5 line-clamp-2">{selectedNote.description}</p>
                </div>
              </div>
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => setDetailNote(selectedNote)} className="flex-1 text-[10px] bg-green-50 text-green-700 px-2 py-1.5 rounded-lg hover:bg-green-100 flex items-center justify-center gap-1 font-medium"><Eye className="h-3 w-3" /> Detalle</button>
                <button onClick={() => goToFieldNotes(selectedNote)} className="flex-1 text-[10px] bg-blue-50 text-blue-700 px-2 py-1.5 rounded-lg hover:bg-blue-100 flex items-center justify-center gap-1 font-medium"><ExternalLink className="h-3 w-3" /> Abrir nota</button>
                <button onClick={() => { setSelectedNote(null); overlayRef.current?.setPosition(undefined); notesLayerRef.current?.getSource()?.getFeatures().forEach(f => f.setStyle(createNoteStyle(f.get("noteData"), false))); }} className="text-green-400 hover:text-green-600 p-1"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ SATELLITE TAB — Dashboard Comparativo Multiespectral ============

/** Configuracion UI por indice */
const INDEX_CONFIGS_UI = {
  NDVI: {
    label: "NDVI", fullLabel: "Vigor Vegetativo", emoji: "\u{1F33F}",
    formula: "(B08-B04)/(B08+B04)", bands: "NIR + Red - 10m",
    chartColor: "#16a34a", chartColorLight: "#86efac",
    gradient: "from-green-500 to-emerald-600",
    colorStops: [
      { color: "#004D00", label: "0.8-1.0", desc: "Muy densa" },
      { color: "#228B22", label: "0.6-0.8", desc: "Densa" },
      { color: "#7CFC00", label: "0.4-0.6", desc: "Moderada" },
      { color: "#FFD700", label: "0.2-0.4", desc: "Escasa" },
      { color: "#8B4513", label: "0.0-0.2", desc: "Suelo" },
      { color: "#040ED8", label: "< 0.0", desc: "Agua" },
    ],
    getStatus: (v: number) => {
      if (v >= 0.6) return { label: "Excelente", bg: "bg-green-100", color: "text-green-700", emoji: "\u{1F33F}" };
      if (v >= 0.4) return { label: "Bueno", bg: "bg-lime-100", color: "text-lime-700", emoji: "\u{1F331}" };
      if (v >= 0.2) return { label: "Moderado", bg: "bg-yellow-100", color: "text-yellow-700", emoji: "\u26A0\uFE0F" };
      return { label: "Bajo", bg: "bg-red-100", color: "text-red-700", emoji: "\u{1F534}" };
    },
    optimalLine: 0.6, stressLine: 0.3,
  },
  NDRE: {
    label: "NDRE", fullLabel: "Nitrogeno / Clorofila", emoji: "\u{1F9EA}",
    formula: "(B08-B05)/(B08+B05)", bands: "NIR + Red Edge - 20m",
    chartColor: "#7c3aed", chartColorLight: "#c4b5fd",
    gradient: "from-purple-500 to-violet-600",
    colorStops: [
      { color: "#155724", label: "0.8-1.0", desc: "Optimo N" },
      { color: "#28A745", label: "0.6-0.8", desc: "Alto N" },
      { color: "#82D656", label: "0.4-0.6", desc: "Bueno" },
      { color: "#F7DC6F", label: "0.2-0.4", desc: "Moderado" },
      { color: "#DB5C4C", label: "0.0-0.2", desc: "Deficiente" },
      { color: "#2C105A", label: "< 0.0", desc: "Sin clorofila" },
    ],
    getStatus: (v: number) => {
      if (v >= 0.5) return { label: "Optimo", bg: "bg-purple-100", color: "text-purple-700", emoji: "\u{1F9EA}" };
      if (v >= 0.3) return { label: "Bueno", bg: "bg-violet-100", color: "text-violet-700", emoji: "\u{1F331}" };
      if (v >= 0.15) return { label: "Moderado", bg: "bg-amber-100", color: "text-amber-700", emoji: "\u26A0\uFE0F" };
      return { label: "Deficiente", bg: "bg-red-100", color: "text-red-700", emoji: "\u{1F534}" };
    },
    optimalLine: 0.5, stressLine: 0.2,
  },
  NDMI: {
    label: "NDMI", fullLabel: "Estres Hidrico", emoji: "\u{1F4A7}",
    formula: "(B08-B11)/(B08+B11)", bands: "NIR + SWIR - 20m",
    chartColor: "#2563eb", chartColorLight: "#93c5fd",
    gradient: "from-blue-500 to-cyan-600",
    colorStops: [
      { color: "#00008B", label: "0.7-1.0", desc: "Saturado" },
      { color: "#4169E1", label: "0.4-0.7", desc: "Humedo" },
      { color: "#87CEEB", label: "0.2-0.4", desc: "Normal" },
      { color: "#FFD700", label: "0.0-0.2", desc: "Seco" },
      { color: "#FF6347", label: "-0.3-0.0", desc: "Estres" },
      { color: "#8B0000", label: "< -0.3", desc: "Severo" },
    ],
    getStatus: (v: number) => {
      if (v >= 0.4) return { label: "Humedo", bg: "bg-blue-100", color: "text-blue-700", emoji: "\u{1F4A7}" };
      if (v >= 0.2) return { label: "Normal", bg: "bg-cyan-100", color: "text-cyan-700", emoji: "\u{1F331}" };
      if (v >= 0.0) return { label: "Seco", bg: "bg-amber-100", color: "text-amber-700", emoji: "\u26A0\uFE0F" };
      return { label: "Estres", bg: "bg-red-100", color: "text-red-700", emoji: "\u{1F534}" };
    },
    optimalLine: 0.4, stressLine: 0.0,
  },
} as const;

type IdxKey = "NDVI" | "NDRE" | "NDMI";
const ALL_INDICES: IdxKey[] = ["NDVI", "NDRE", "NDMI"];
/** Subcomponente: tarjeta de mapa individual por indice con hover de valor */
function IndexMapCard({ parcelId, indexType, showLegend }: { parcelId: number; indexType: IdxKey; showLegend?: boolean }) {
  const cfg = INDEX_CONFIGS_UI[indexType];
  const { data, isLoading, error } = trpc.copernicus.getIndexMap.useQuery(
    { parcelId, indexType },
    { staleTime: 10 * 60 * 1000, retry: 1 }
  );
  const { data: statsData } = trpc.copernicus.getIndexStats.useQuery(
    { parcelId, indexType },
    { staleTime: 10 * 60 * 1000, retry: 1 }
  );
  const lastVal = useMemo(() => {
    if (!statsData?.data?.length) return null;
    return statsData.data[statsData.data.length - 1];
  }, [statsData]);
  const status = lastVal ? cfg.getStatus(lastVal.mean) : null;

  // Canvas para lectura de pixel
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgElRef = useRef<HTMLImageElement>(null);
  const [hoverVal, setHoverVal] = useState<{ x: number; y: number; value: string; desc: string; color: string; visible: boolean }>({ x: 0, y: 0, value: "", desc: "", color: "", visible: false });

  // Parsear hex a RGB
  const hexToRgb = useCallback((hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }, []);

  // Dibujar imagen en canvas cuando cargue
  const handleImgLoad = useCallback(() => {
    if (!imgElRef.current || !canvasRef.current) return;
    const img = imgElRef.current;
    const canvas = canvasRef.current;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(img, 0, 0);
  }, []);

  // Hover: leer pixel del canvas y mapear al color más cercano de la leyenda
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current || !imgElRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const pixel = ctx.getImageData(Math.floor(x * scaleX), Math.floor(y * scaleY), 1, 1).data;
    const pr = pixel[0], pg = pixel[1], pb = pixel[2], pa = pixel[3];
    if (pa < 10) { setHoverVal(p => ({ ...p, visible: false })); return; }

    // Encontrar el color más cercano de la leyenda
    let bestDist = Infinity;
    let bestStop = cfg.colorStops[0];
    for (const stop of cfg.colorStops) {
      const rgb = hexToRgb(stop.color);
      const dist = Math.sqrt((pr - rgb.r) ** 2 + (pg - rgb.g) ** 2 + (pb - rgb.b) ** 2);
      if (dist < bestDist) { bestDist = dist; bestStop = stop; }
    }
    setHoverVal({ x, y, value: bestStop.label, desc: bestStop.desc, color: bestStop.color, visible: true });
  }, [cfg, hexToRgb]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${cfg.gradient} shadow-sm`}>
          <span className="text-sm">{cfg.emoji}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-bold text-gray-800">{cfg.label}</h4>
          <p className="text-[9px] text-gray-400 truncate">{cfg.fullLabel}</p>
        </div>
        {status && (
          <div className={`${status.bg} px-2 py-0.5 rounded-lg`}>
            <p className={`text-[10px] font-bold ${status.color}`}>{lastVal!.mean.toFixed(3)}</p>
          </div>
        )}
      </div>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-xl min-h-[140px]">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center bg-red-50 rounded-xl min-h-[140px] p-2">
          <p className="text-[10px] text-red-500 text-center">
            {(error as any)?.message?.includes("Credenciales") ? "Sin credenciales" : "Error"}
          </p>
        </div>
      ) : data?.image ? (
        <div
          className="relative rounded-xl overflow-hidden border border-gray-200/50 shadow-sm cursor-crosshair aspect-[4/3] bg-gray-900"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverVal(p => ({ ...p, visible: false }))}
        >
          <canvas ref={canvasRef} className="hidden" />
          <img ref={imgElRef} src={data.image} alt={`Mapa ${indexType}`} className="absolute inset-0 w-full h-full object-contain" onLoad={handleImgLoad} crossOrigin="anonymous" />
          {hoverVal.visible && (
            <div
              className="absolute pointer-events-none bg-black/85 text-white text-[10px] px-2 py-1 rounded-lg shadow-xl z-10 whitespace-nowrap backdrop-blur-sm"
              style={{ left: Math.min(hoverVal.x + 10, 140), top: Math.max(hoverVal.y - 28, 4) }}
            >
              <span style={{ color: hoverVal.color }}>●</span> {indexType} {hoverVal.value} · {hoverVal.desc}
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-1.5">
            <p className="text-[9px] text-white/80">{cfg.formula}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-xl min-h-[140px]">
          <CameraOff className="w-5 h-5 text-gray-300" />
        </div>
      )}
      {showLegend && (
        <div className="mt-2 space-y-0.5">
          {cfg.colorStops.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <div className="w-3 h-2.5 rounded-sm border border-gray-200/50" style={{ backgroundColor: s.color }} />
              <span className="text-[9px] text-gray-500 font-medium">{s.label}</span>
              <span className="text-[9px] text-gray-400">{s.desc}</span>
            </div>
          ))}
        </div>
      )}
      {lastVal && (
        <div className="grid grid-cols-3 gap-1 mt-2">
          {[
            { label: "Prom", value: lastVal.mean, color: cfg.chartColor },
            { label: "Max", value: lastVal.max, color: "#059669" },
            { label: "Min", value: lastVal.min, color: "#d97706" },
          ].map((s) => (
            <div key={s.label} className="bg-gray-50 rounded-md p-1 text-center">
              <p className="text-[8px] text-gray-400 uppercase">{s.label}</p>
              <p className="text-[11px] font-bold" style={{ color: s.color }}>{s.value.toFixed(3)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Subcomponente: mapa historico thumbnail con hover */
function HistoricalMapThumb({ parcelId, indexType, date, dateLabel }: { parcelId: number; indexType: IdxKey; date: string; dateLabel: string }) {
  const cfg = INDEX_CONFIGS_UI[indexType];
  const { data, isLoading } = trpc.copernicus.getIndexMap.useQuery(
    { parcelId, indexType, date },
    { staleTime: 30 * 60 * 1000, retry: 1 }
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; value: string; desc: string; color: string; visible: boolean }>({ x: 0, y: 0, value: "", desc: "", color: "", visible: false });

  const hexToRgb = useCallback((hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }, []);

  const handleLoad = useCallback(() => {
    if (!imgRef.current || !canvasRef.current) return;
    const c = canvasRef.current;
    c.width = imgRef.current.naturalWidth;
    c.height = imgRef.current.naturalHeight;
    const ctx = c.getContext("2d");
    if (ctx) ctx.drawImage(imgRef.current, 0, 0);
  }, []);

  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current || !imgRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const sx = canvasRef.current.width / rect.width, sy = canvasRef.current.height / rect.height;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const px = ctx.getImageData(Math.floor(x * sx), Math.floor(y * sy), 1, 1).data;
    if (px[3] < 10) { setHover(p => ({ ...p, visible: false })); return; }
    let best = Infinity, stop = cfg.colorStops[0];
    for (const s of cfg.colorStops) {
      const c = hexToRgb(s.color);
      const d = Math.sqrt((px[0]-c.r)**2 + (px[1]-c.g)**2 + (px[2]-c.b)**2);
      if (d < best) { best = d; stop = s; }
    }
    setHover({ x, y, value: stop.label, desc: stop.desc, color: stop.color, visible: true });
  }, [cfg, hexToRgb]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative w-full aspect-square rounded-lg overflow-hidden border border-gray-200/50 shadow-sm bg-gray-50 cursor-crosshair"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(p => ({ ...p, visible: false }))}
      >
        <canvas ref={canvasRef} className="hidden" />
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
          </div>
        ) : data?.image ? (
          <>
            <img ref={imgRef} src={data.image} alt={`${indexType} ${dateLabel}`} className="w-full h-full object-cover" onLoad={handleLoad} crossOrigin="anonymous" />
            {hover.visible && (
              <div
                className="absolute pointer-events-none bg-black/85 text-white text-[9px] px-1.5 py-0.5 rounded shadow-lg z-10 whitespace-nowrap"
                style={{ left: Math.min(hover.x + 6, 80), top: Math.max(hover.y - 20, 2) }}
              >
                <span style={{ color: hover.color }}>●</span> {hover.value}
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <CameraOff className="w-3 h-3 text-gray-300" />
          </div>
        )}
      </div>
      <p className="text-[8px] text-gray-500 font-medium text-center leading-tight">{dateLabel}</p>
    </div>
  );
}

/** Subcomponente: Analisis IA automatico con cache */
function AIAnalysisCard({ parcelId, parcelName, ndviStats, ndreStats, ndmiStats }: {
  parcelId: number; parcelName: string;
  ndviStats?: any; ndreStats?: any; ndmiStats?: any;
}) {
  const hasData = ndviStats?.data?.length || ndreStats?.data?.length || ndmiStats?.data?.length;
  const fromDate = ndviStats?.fromDate || "";
  const toDate = ndviStats?.toDate || "";
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [triggered, setTriggered] = useState(false);

  const analyzeMut = trpc.copernicus.getAIAnalysis.useMutation({
    onSuccess: (data: any) => { setAiResult(data); setAiError(null); },
    onError: (err: any) => { setAiError(err.message || "Error"); },
  });

  // Auto-trigger cuando hay datos espectrales disponibles
  useEffect(() => {
    if (!hasData || !parcelId || triggered || analyzeMut.isPending) return;
    setTriggered(true);
    analyzeMut.mutate({ parcelId, parcelName, ndviData: ndviStats?.data, ndreData: ndreStats?.data, ndmiData: ndmiStats?.data, fromDate, toDate });
  }, [hasData, parcelId]);

  const handleRefresh = useCallback(() => {
    setAiResult(null);
    setAiError(null);
    analyzeMut.mutate({ parcelId, parcelName, ndviData: ndviStats?.data, ndreData: ndreStats?.data, ndmiData: ndmiStats?.data, fromDate, toDate, forceRefresh: true });
  }, [parcelId, parcelName, ndviStats, ndreStats, ndmiStats, fromDate, toDate, analyzeMut]);

  const analysis = aiResult?.analysis;
  const isCached = aiResult?.cached;
  const loading = analyzeMut.isPending;

  return (
    <GlassCard className="p-4 border border-purple-100/50 bg-gradient-to-br from-purple-50/20 to-indigo-50/10" hover={false}>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-md">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            Análisis Inteligente
            {isCached && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-600 font-medium">Cacheado</span>}
          </h3>
          <p className="text-[10px] text-gray-500">Resumen agronómico basado en datos espectrales · {fromDate} → {toDate}</p>
        </div>
        {analysis && (
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-purple-600 hover:bg-purple-50 transition"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Regenerar
          </button>
        )}
      </div>

      {loading && !analysis && (
        <div className="flex items-center gap-2 p-3 bg-purple-50/50 rounded-lg">
          <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
          <p className="text-xs text-purple-600">Generando análisis inteligente...</p>
        </div>
      )}

      {aiError && !analysis && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
          {aiError.includes("API Key") || aiError.includes("configurado") || aiError.includes("BAD_REQUEST")
            ? "⚙️ Configura la API Key de IA en la sección de Ajustes para activar el análisis inteligente."
            : `⚠️ ${aiError}`}
        </div>
      )}

      {analysis && (
        <div className="rounded-xl bg-white/80 border border-purple-100/50 p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
            <div className="text-[13px] text-gray-800 leading-relaxed whitespace-pre-line">{analysis}</div>
          </div>
        </div>
      )}

      {!analysis && !aiError && !loading && (
        <div className="rounded-lg bg-gray-50/50 p-3 text-center">
          <p className="text-[11px] text-gray-400">Esperando datos espectrales para generar análisis...</p>
        </div>
      )}
    </GlassCard>
  );
}

function SatelliteTab({ parcel, mapping }: { parcel: any; mapping?: any }) {
  const [showLegend, setShowLegend] = useState(true);
  const [timelineIndex, setTimelineIndex] = useState<IdxKey>("NDVI");

  const hasPolygon = useMemo(() => {
    if (!parcel?.polygon) return false;
    try {
      const poly = typeof parcel.polygon === "string" ? JSON.parse(parcel.polygon) : parcel.polygon;
      if (Array.isArray(poly)) return poly.length >= 3;
      return poly.coordinates?.[0]?.length >= 3;
    } catch { return false; }
  }, [parcel]);

  // Queries para los 3 indices simultaneamente
  const { data: ndviStats, isLoading: ndviLoading } = trpc.copernicus.getIndexStats.useQuery(
    { parcelId: parcel?.id, indexType: "NDVI" },
    { enabled: !!parcel?.id && hasPolygon, staleTime: 10 * 60 * 1000, retry: 1 }
  );
  const { data: ndreStats, isLoading: ndreLoading } = trpc.copernicus.getIndexStats.useQuery(
    { parcelId: parcel?.id, indexType: "NDRE" },
    { enabled: !!parcel?.id && hasPolygon, staleTime: 10 * 60 * 1000, retry: 1 }
  );
  const { data: ndmiStats, isLoading: ndmiLoading } = trpc.copernicus.getIndexStats.useQuery(
    { parcelId: parcel?.id, indexType: "NDMI" },
    { enabled: !!parcel?.id && hasPolygon, staleTime: 10 * 60 * 1000, retry: 1 }
  );

  // Obtener tareas del drone (WebODM) para la ortofoto
  const { data: odmTasks } = trpc.webodm.getProjectTasks.useQuery(
    { projectId: mapping?.odmProjectId || 0 },
    { enabled: !!mapping?.odmProjectId, staleTime: 5 * 60 * 1000 }
  );

  // Primera ortofoto completada y calculo de tiles que cubran toda la parcela
  const droneInfo = useMemo(() => {
    if (!odmTasks || !mapping?.odmProjectId) return null;
    const completed = odmTasks.filter((t: any) => t.status === 40);
    if (completed.length === 0) return null;
    // Usar la PRIMERA ortofoto (mas antigua, mejor calidad visual inicial)
    const sorted = [...completed].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const task = sorted[0];
    const taskUuid = task.uuid || String(task.id);

    // Calcular bounding box del poligono
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    try {
      const poly = typeof parcel.polygon === "string" ? JSON.parse(parcel.polygon) : parcel.polygon;
      const coords = Array.isArray(poly) ? poly : poly.coordinates?.[0];
      if (coords?.length) {
        for (const c of coords) {
          const lat = c.lat || c.latitude || c[1] || 0;
          const lng = c.lng || c.longitude || c[0] || 0;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        }
      }
    } catch {}

    if (!isFinite(minLat)) return null;

    const centerLat = (minLat + maxLat) / 2;
    const dLat = maxLat - minLat;
    const dLng = maxLng - minLng;

    // Zoom equilibrado: parcela completa visible con buen detalle
    const targetTilesAcross = 6;
    const maxSpan = Math.max(dLng, dLat * Math.cos(centerLat * Math.PI / 180));
    let zoom = 18;
    for (let z = 19; z >= 13; z--) {
      const tileDeg = 360 / Math.pow(2, z);
      if (maxSpan / tileDeg <= targetTilesAcross) { zoom = z; break; }
    }

    const n = Math.pow(2, zoom);

    // Tiles que cubren el bbox de la parcela
    const minTileX = Math.floor(((minLng + 180) / 360) * n);
    const maxTileX = Math.floor(((maxLng + 180) / 360) * n);
    const minTileY = Math.floor((1 - Math.log(Math.tan(maxLat * Math.PI / 180) + 1 / Math.cos(maxLat * Math.PI / 180)) / Math.PI) / 2 * n);
    const maxTileY = Math.floor((1 - Math.log(Math.tan(minLat * Math.PI / 180) + 1 / Math.cos(minLat * Math.PI / 180)) / Math.PI) / 2 * n);

    const cols = maxTileX - minTileX + 1;
    const rows = maxTileY - minTileY + 1;

    const tiles: string[] = [];
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        tiles.push(`/api/odm-tiles/${mapping.odmProjectId}/${taskUuid}/orthophoto/${zoom}/${tx}/${ty}.png`);
      }
    }

    const flightDate = task.created_at ? new Date(task.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "";
    return { taskUuid, tiles, cols, rows, zoom, flightDate, taskName: task.name || "Vuelo drone" };
  }, [odmTasks, mapping, parcel]);

  // Merge data para chart combinado
  const combinedChart = useMemo(() => {
    const dateMap: Record<string, any> = {};
    const addData = (data: any[] | undefined, prefix: string) => {
      if (!data) return;
      for (const d of data) {
        if (!dateMap[d.date]) {
          dateMap[d.date] = {
            date: d.date,
            dateLabel: new Date(d.date + "T12:00:00Z").toLocaleDateString("es-MX", { day: "2-digit", month: "short" }),
          };
        }
        dateMap[d.date][`${prefix}_mean`] = d.mean;
        dateMap[d.date][`${prefix}_min`] = d.min;
        dateMap[d.date][`${prefix}_max`] = d.max;
      }
    };
    addData(ndviStats?.data, "ndvi");
    addData(ndreStats?.data, "ndre");
    addData(ndmiStats?.data, "ndmi");
    return Object.values(dateMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [ndviStats, ndreStats, ndmiStats]);

  // Fechas historicas para timeline — desde primera cosecha hasta hoy
  const timelineDates = useMemo(() => {
    const dates: { date: string; label: string }[] = [];
    const now = new Date();
    // Usar la fecha de inicio real (primera cosecha) si está disponible
    const startStr = ndviStats?.fromDate;
    const start = startStr ? new Date(startStr + "T12:00:00Z") : new Date(now.getTime() - 90 * 86400000);
    const totalDays = Math.max(Math.floor((now.getTime() - start.getTime()) / 86400000), 30);
    // Generar hasta 8 snapshots distribuidos uniformemente
    const numSnapshots = Math.min(8, Math.max(4, Math.floor(totalDays / 15)));
    const stepDays = Math.floor(totalDays / (numSnapshots - 1));
    for (let i = 0; i < numSnapshots; i++) {
      const d = new Date(start.getTime() + i * stepDays * 86400000);
      if (d > now) break;
      dates.push({
        date: d.toISOString().split("T")[0],
        label: d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: totalDays > 365 ? "2-digit" : undefined }),
      });
    }
    return dates;
  }, [ndviStats]);

  const chartsLoading = ndviLoading || ndreLoading || ndmiLoading;

  if (!hasPolygon) {
    return (
      <GlassCard className="p-6 text-center">
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
          </div>
          <h3 className="text-lg font-bold text-amber-900">Poligono Requerido</h3>
          <p className="text-sm text-amber-700 max-w-md">
            Dibuja el poligono de esta parcela en el mapa para activar la telemetria satelital multiespectral.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <GlassCard className="p-4" hover={false}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow">
            <Satellite className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900">Dashboard Multiespectral</h2>
            <p className="text-[11px] text-gray-500">Sentinel-2 L2A · NDVI + NDRE + NDMI{ndviStats?.fromDate ? ` · Desde ${ndviStats.fromDate}` : " · Comparacion simultanea"}</p>
          </div>
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition"
          >
            {showLegend ? "Ocultar" : "Mostrar"} leyendas
          </button>
        </div>
      </GlassCard>

      {/* ORTOFOTO DRONE — Card prominente */}
      <GlassCard className="p-0 overflow-hidden" hover={false}>
        {droneInfo ? (
          <div className="relative" style={{ display: "grid", gridTemplateColumns: `repeat(${droneInfo.cols}, 1fr)`, gridTemplateRows: `repeat(${droneInfo.rows}, 1fr)` }}>
            {droneInfo.tiles.map((url: string, i: number) => (
              <img key={i} src={url} alt="" className="w-full h-full object-cover block" crossOrigin="anonymous" onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }} />
            ))}
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 via-black/20 to-transparent p-3 z-10">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
                  <Camera className="w-4 h-4 text-white" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white">Ortofoto Drone</span>
                  <p className="text-[10px] text-white/70">RGB · {droneInfo.flightDate}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center bg-gray-50/50 py-10 gap-2">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
              <CameraOff className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-xs text-gray-400">Sin vuelo de drone disponible</p>
          </div>
        )}
      </GlassCard>

      {/* FILA INDICES: 3 mapas espectrales con altura uniforme */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ALL_INDICES.map((idx) => (
          <GlassCard key={idx} className="p-3" hover={false}>
            <IndexMapCard parcelId={parcel.id} indexType={idx} showLegend={showLegend} />
          </GlassCard>
        ))}
      </div>

      {/* ANALISIS IA — DeepSeek */}
      <AIAnalysisCard parcelId={parcel.id} parcelName={parcel.name || parcel.code} ndviStats={ndviStats} ndreStats={ndreStats} ndmiStats={ndmiStats} />

      {/* FILA 2: Grafica combinada — 3 indices superpuestos */}
      <GlassCard className="p-4" hover={false}>
        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-500" />
          Evolucion Comparativa — 3 Indices Superpuestos
          {ndviStats && <span className="text-[10px] text-gray-400 font-normal ml-auto">{ndviStats.fromDate} → {ndviStats.toDate}</span>}
        </h3>
        {chartsLoading ? (
          <div className="flex items-center justify-center h-72 bg-gray-50 rounded-xl">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            <span className="ml-2 text-sm text-gray-500">Consultando 3 indices...</span>
          </div>
        ) : combinedChart.length > 0 ? (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={combinedChart} margin={{ top: 5, right: 15, left: -10, bottom: 5 }}>
                  <ReferenceArea y1={-0.2} y2={0.2} fill="#fecaca" fillOpacity={0.15} />
                  <ReferenceArea y1={0.2} y2={0.4} fill="#fef08a" fillOpacity={0.15} />
                  <ReferenceArea y1={0.4} y2={0.6} fill="#bbf7d0" fillOpacity={0.15} />
                  <ReferenceArea y1={0.6} y2={1.0} fill="#86efac" fillOpacity={0.15} />
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} />
                  <YAxis domain={[-0.2, 1]} tick={{ fontSize: 10 }} tickFormatter={(v: number) => v.toFixed(1)} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 11 }}
                    formatter={(value: any, name: string) => {
                      const val = Number(value).toFixed(3);
                      if (name.startsWith("ndvi")) return [val, "NDVI " + (name.includes("max") ? "Max" : name.includes("min") ? "Min" : "Prom")];
                      if (name.startsWith("ndre")) return [val, "NDRE " + (name.includes("max") ? "Max" : name.includes("min") ? "Min" : "Prom")];
                      return [val, "NDMI " + (name.includes("max") ? "Max" : name.includes("min") ? "Min" : "Prom")];
                    }}
                  />
                  <Line type="monotone" dataKey="ndvi_mean" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 2, fill: "#16a34a" }} name="ndvi_mean" />
                  <Line type="monotone" dataKey="ndvi_max" stroke="#86efac" strokeWidth={1} dot={false} strokeDasharray="3 3" name="ndvi_max" />
                  <Line type="monotone" dataKey="ndvi_min" stroke="#86efac" strokeWidth={1} dot={false} strokeDasharray="3 3" name="ndvi_min" />
                  <Line type="monotone" dataKey="ndre_mean" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 2, fill: "#7c3aed" }} name="ndre_mean" />
                  <Line type="monotone" dataKey="ndre_max" stroke="#c4b5fd" strokeWidth={1} dot={false} strokeDasharray="3 3" name="ndre_max" />
                  <Line type="monotone" dataKey="ndre_min" stroke="#c4b5fd" strokeWidth={1} dot={false} strokeDasharray="3 3" name="ndre_min" />
                  <Line type="monotone" dataKey="ndmi_mean" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 2, fill: "#2563eb" }} name="ndmi_mean" />
                  <Line type="monotone" dataKey="ndmi_max" stroke="#93c5fd" strokeWidth={1} dot={false} strokeDasharray="3 3" name="ndmi_max" />
                  <Line type="monotone" dataKey="ndmi_min" stroke="#93c5fd" strokeWidth={1} dot={false} strokeDasharray="3 3" name="ndmi_min" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-2 flex-wrap">
              {ALL_INDICES.map((idx) => {
                const c = INDEX_CONFIGS_UI[idx];
                return (
                  <div key={idx} className="flex items-center gap-1.5">
                    <div className="w-4 h-1 rounded-full" style={{ backgroundColor: c.chartColor }} />
                    <span className="text-[10px] text-gray-600 font-medium">{c.emoji} {c.label} ({c.fullLabel})</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-72 bg-gray-50 rounded-xl">
            <Activity className="w-6 h-6 text-gray-300 mb-2" />
            <p className="text-xs text-gray-500">Sin datos para este periodo</p>
          </div>
        )}
      </GlassCard>

      {/* FILA 3: Timeline de mapas historicos */}
      <GlassCard className="p-4" hover={false}>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-500" />
            Evolucion Temporal — Mapas Historicos
          </h3>
          <div className="ml-auto flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {ALL_INDICES.map((idx) => {
              const c = INDEX_CONFIGS_UI[idx];
              return (
                <button
                  key={idx}
                  onClick={() => setTimelineIndex(idx)}
                  className={`text-[10px] px-2.5 py-1 rounded-md font-medium transition-all ${
                    timelineIndex === idx
                      ? `bg-gradient-to-r ${c.gradient} text-white shadow-sm`
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {c.emoji} {c.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mb-3">
          Cada 15 dias · {INDEX_CONFIGS_UI[timelineIndex].fullLabel} · {INDEX_CONFIGS_UI[timelineIndex].formula}
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {timelineDates.map((td) => (
            <HistoricalMapThumb
              key={`${timelineIndex}-${td.date}`}
              parcelId={parcel.id}
              indexType={timelineIndex}
              date={td.date}
              dateLabel={td.label}
            />
          ))}
        </div>
        <div className="flex items-center gap-3 mt-3 justify-center flex-wrap">
          {INDEX_CONFIGS_UI[timelineIndex].colorStops.map((s) => (
            <div key={s.label} className="flex items-center gap-1">
              <div className="w-3 h-2.5 rounded-sm border border-gray-200/50" style={{ backgroundColor: s.color }} />
              <span className="text-[9px] text-gray-500">{s.label} {s.desc}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* FOOTER INFO */}
      <div className="flex items-start gap-2 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
        <Satellite className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
        <div className="text-[11px] text-indigo-700 space-y-0.5">
          <p><strong>Fuente:</strong> Sentinel-2 L2A via Copernicus CDSE + Ortofoto de Drone (WebODM)</p>
          <p><strong>Indices:</strong> NDVI (Vigor, 10m) · NDRE (Nitrogeno/Red Edge, 20m) · NDMI (Humedad/SWIR, 20m)</p>
          <p><strong>Ortofoto:</strong> Imagen RGB del drone para visualizacion de referencia · Datos desde primera cosecha</p>
        </div>
      </div>
    </div>
  );
}