import { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  TrendingUp,
  CloudSun,
  Target,
  Leaf,
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
  Filter,
  Table2,
  Layers,
  TreePine,
  Ruler,
  Map,
  NotebookPen,
  Sprout,
} from "lucide-react";

interface TourStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string; // tailwind bg color
  features: string[];
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Dashboard Principal",
    description:
      "Ahora puedes filtrar por rango de fechas y la tabla de Temperatura y Cosecha muestra la correlación entre el clima y la producción diaria.",
    icon: <BarChart3 className="w-8 h-8" />,
    color: "from-emerald-500 to-green-600",
    features: [
      "Filtrado por rango de fechas personalizado",
      "Tabla de Temperatura y Cosecha completamente nueva",
      "Correlación visual entre clima y producción",
    ],
  },
  {
    title: "Análisis de Datos",
    description:
      "La tabla de Estadísticas por Parcela ahora incluye rendimiento por hectárea y por árbol. Haz clic en cualquier parcela para ir directamente a su análisis.",
    icon: <TrendingUp className="w-8 h-8" />,
    color: "from-blue-500 to-indigo-600",
    features: [
      "Columna Kg/Ha: rendimiento por hectárea productiva",
      "Columna Kg/Árbol: rendimiento por árbol productivo",
      "Clic en el nombre → Mapa y Vuelos de la parcela",
      "Clic en datos de cosecha → Cosecha de la parcela",
    ],
  },
  {
    title: "Análisis Clima y Cosecha",
    description:
      "Página completamente nueva que cruza datos meteorológicos con la producción. Visualiza cómo el clima afecta tu cosecha con gráficas interactivas.",
    icon: <CloudSun className="w-8 h-8" />,
    color: "from-sky-500 to-cyan-600",
    features: [
      "Gráficas de temperatura vs producción",
      "Fondo dinámico según el clima actual",
      "Pronóstico de los próximos días",
      "Datos actualizados automáticamente",
    ],
  },
  {
    title: "Rendimiento de Cortadoras",
    description:
      "Nueva página para evaluar la productividad de cada cortadora. Compara rendimiento, calidad y eficiencia entre tu equipo de trabajo.",
    icon: <Target className="w-8 h-8" />,
    color: "from-orange-500 to-amber-600",
    features: [
      "Ranking de cortadoras por productividad",
      "Métricas de calidad por cortadora",
      "Comparativa visual entre cortadoras",
      "Filtrado por rango de fechas",
    ],
  },
  {
    title: "Análisis de Parcela",
    description:
      "Gestiona cada parcela con ortomosaicos de drones, detalles de cultivo, notas colaborativas y métricas de cosecha detalladas.",
    icon: <Leaf className="w-8 h-8" />,
    color: "from-green-500 to-emerald-600",
    features: [
      "Ortomosaicos con capas VARI, NDVI, EXG y más",
      "Menú desplegable para cambiar entre parcelas",
      "Notas con autor y fecha por parcela",
      "Rendimiento porcentual, por hectárea y por árbol",
      "Cultivo y variedad asignables desde catálogo",
    ],
  },
];

const TOUR_VERSION = "v1.5";
const MAX_SHOW_COUNT = 2;

function getTourKey(userId: number | string): string {
  return `agratecti_tour_${TOUR_VERSION}_user_${userId}`;
}

interface WelcomeTourProps {
  userId: number | string;
  userName?: string;
}

export function WelcomeTour({ userId, userName }: WelcomeTourProps) {
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1); // -1 = welcome screen
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const key = getTourKey(userId);
    const raw = localStorage.getItem(key);
    const count = raw ? parseInt(raw, 10) : 0;

    if (count < MAX_SHOW_COUNT) {
      // Mostrar el tour después de un breve delay para que la UI cargue
      const timer = setTimeout(() => {
        setVisible(true);
        localStorage.setItem(key, String(count + 1));
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [userId]);

  const handleClose = useCallback(() => {
    setIsAnimating(true);
    setTimeout(() => setVisible(false), 300);
  }, []);

  const handleSkip = useCallback(() => {
    // Marcar como visto el máximo para no volver a mostrar
    const key = getTourKey(userId);
    localStorage.setItem(key, String(MAX_SHOW_COUNT));
    handleClose();
  }, [userId, handleClose]);

  const goNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleClose();
    }
  }, [currentStep, handleClose]);

  const goPrev = useCallback(() => {
    if (currentStep > -1) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  if (!visible) return null;

  const isWelcome = currentStep === -1;
  const step = !isWelcome ? TOUR_STEPS[currentStep] : null;
  const progress = !isWelcome
    ? ((currentStep + 1) / TOUR_STEPS.length) * 100
    : 0;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${
        isAnimating ? "opacity-0 scale-95" : "opacity-100 scale-100"
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-500">
        {/* Botón cerrar */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-20 p-1.5 rounded-full bg-white/80 hover:bg-white text-gray-500 hover:text-gray-700 transition-all shadow-sm"
          title="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>

        {isWelcome ? (
          /* ===== PANTALLA DE BIENVENIDA ===== */
          <div className="text-center">
            {/* Header con gradiente */}
            <div className="bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600 px-6 pt-10 pb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm mb-4">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
                Bienvenido a Agra-Tecti
              </h1>
              <div className="inline-block bg-white/20 backdrop-blur-sm rounded-full px-4 py-1 mt-2">
                <span className="text-white font-semibold text-sm">
                  Versión 1.5
                </span>
              </div>
            </div>

            {/* Contenido */}
            <div className="px-6 py-6">
              <p className="text-gray-600 mb-1 text-sm">
                {userName ? `Hola ${userName},` : "Hola,"} tenemos nuevas
                funciones para ti.
              </p>
              <p className="text-gray-500 text-sm mb-6">
                Descubre las mejoras que hemos preparado para optimizar tu
                gestión de cosecha.
              </p>

              {/* Preview de las secciones */}
              <div className="grid grid-cols-5 gap-2 mb-6">
                {TOUR_STEPS.map((s, i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-1.5 group"
                  >
                    <div
                      className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform`}
                    >
                      {s.icon}
                    </div>
                    <span className="text-[10px] text-gray-500 text-center leading-tight">
                      {s.title.split(" ").slice(0, 2).join(" ")}
                    </span>
                  </div>
                ))}
              </div>

              {/* Botones */}
              <div className="flex gap-3">
                <button
                  onClick={handleSkip}
                  className="flex-1 px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
                >
                  Omitir tour
                </button>
                <button
                  onClick={goNext}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 rounded-xl shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-1"
                >
                  Ver novedades
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ===== PASO DEL TOUR ===== */
          <div>
            {/* Header del paso */}
            <div
              className={`bg-gradient-to-br ${step!.color} px-6 pt-8 pb-6`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white">
                  {step!.icon}
                </div>
                <div>
                  <p className="text-white/70 text-xs font-medium">
                    {currentStep + 1} de {TOUR_STEPS.length}
                  </p>
                  <h2 className="text-xl font-bold text-white">
                    {step!.title}
                  </h2>
                </div>
              </div>
              <p className="text-white/90 text-sm leading-relaxed">
                {step!.description}
              </p>
            </div>

            {/* Barra de progreso */}
            <div className="h-1 bg-gray-100">
              <div
                className={`h-full bg-gradient-to-r ${step!.color} transition-all duration-500 ease-out`}
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Features */}
            <div className="px-6 py-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Novedades
              </p>
              <ul className="space-y-2.5">
                {step!.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-green-600 text-xs font-bold">
                        ✓
                      </span>
                    </div>
                    <span className="text-sm text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Navegación */}
            <div className="px-6 pb-5 flex items-center justify-between">
              <button
                onClick={goPrev}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                {currentStep === 0 ? "Inicio" : "Anterior"}
              </button>

              <button
                onClick={handleSkip}
                className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Omitir
              </button>

              <button
                onClick={goNext}
                className={`flex items-center gap-1 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r ${step!.color} rounded-xl shadow-lg transition-all hover:shadow-xl`}
              >
                {currentStep === TOUR_STEPS.length - 1
                  ? "¡Empezar!"
                  : "Siguiente"}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Dots de navegación */}
            <div className="flex justify-center gap-1.5 pb-4">
              {TOUR_STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentStep(i)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    i === currentStep
                      ? `w-6 bg-gradient-to-r ${step!.color}`
                      : i < currentStep
                      ? "bg-green-300"
                      : "bg-gray-200"
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
