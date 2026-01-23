import { useEffect, useState } from "react";

interface WeatherBackgroundProps {
  weatherCondition: "sunny" | "cloudy" | "rainy" | "stormy" | "clear";
  temperature?: number;
}

export function WeatherBackground({ weatherCondition, temperature }: WeatherBackgroundProps) {
  const [timeOfDay, setTimeOfDay] = useState<"morning" | "afternoon" | "evening" | "night">("morning");

  useEffect(() => {
    const updateTimeOfDay = () => {
      const hour = new Date().getHours();
      if (hour >= 6 && hour < 12) {
        setTimeOfDay("morning");
      } else if (hour >= 12 && hour < 17) {
        setTimeOfDay("afternoon");
      } else if (hour >= 17 && hour < 20) {
        setTimeOfDay("evening");
      } else {
        setTimeOfDay("night");
      }
    };

    updateTimeOfDay();
    const interval = setInterval(updateTimeOfDay, 60000); // Actualizar cada minuto
    return () => clearInterval(interval);
  }, []);

  // Gradientes según hora del día
  const getBackgroundGradient = () => {
    const gradients = {
      morning: "from-blue-300 via-blue-200 to-yellow-100",
      afternoon: "from-blue-400 via-blue-300 to-blue-200",
      evening: "from-orange-400 via-pink-400 to-purple-500",
      night: "from-indigo-900 via-purple-900 to-slate-900",
    };
    return gradients[timeOfDay];
  };

  // Generar gotas de lluvia
  const renderRaindrops = () => {
    if (weatherCondition !== "rainy" && weatherCondition !== "stormy") return null;
    
    const drops = [];
    const dropCount = weatherCondition === "stormy" ? 150 : 80;
    
    for (let i = 0; i < dropCount; i++) {
      const left = Math.random() * 100;
      const delay = Math.random() * 2;
      const duration = 0.5 + Math.random() * 0.5;
      const opacity = 0.3 + Math.random() * 0.4;
      
      drops.push(
        <div
          key={`drop-${i}`}
          className="absolute w-0.5 bg-blue-300 rounded-full animate-rain"
          style={{
            left: `${left}%`,
            top: "-20px",
            height: `${15 + Math.random() * 15}px`,
            animationDelay: `${delay}s`,
            animationDuration: `${duration}s`,
            opacity,
          }}
        />
      );
    }
    return drops;
  };

  // Generar nubes
  const renderClouds = () => {
    if (weatherCondition === "sunny" || weatherCondition === "clear") return null;
    
    const cloudCount = weatherCondition === "stormy" ? 8 : weatherCondition === "rainy" ? 6 : 4;
    const clouds = [];
    
    for (let i = 0; i < cloudCount; i++) {
      const top = 5 + Math.random() * 25;
      const scale = 0.8 + Math.random() * 0.8;
      const duration = 30 + Math.random() * 40;
      const delay = Math.random() * 20;
      const opacity = weatherCondition === "stormy" ? 0.9 : weatherCondition === "rainy" ? 0.7 : 0.5;
      
      clouds.push(
        <div
          key={`cloud-${i}`}
          className="absolute animate-cloud"
          style={{
            top: `${top}%`,
            left: "-200px",
            transform: `scale(${scale})`,
            animationDuration: `${duration}s`,
            animationDelay: `${delay}s`,
            opacity,
          }}
        >
          <div className={`relative ${weatherCondition === "stormy" ? "text-gray-600" : "text-white"}`}>
            <div className="absolute w-16 h-16 bg-current rounded-full blur-sm" style={{ left: 0, top: 10 }} />
            <div className="absolute w-20 h-20 bg-current rounded-full blur-sm" style={{ left: 15, top: 0 }} />
            <div className="absolute w-24 h-20 bg-current rounded-full blur-sm" style={{ left: 35, top: 5 }} />
            <div className="absolute w-16 h-16 bg-current rounded-full blur-sm" style={{ left: 55, top: 12 }} />
          </div>
        </div>
      );
    }
    return clouds;
  };

  // Renderizar sol
  const renderSun = () => {
    if (timeOfDay === "night" || weatherCondition === "rainy" || weatherCondition === "stormy") return null;
    
    const sunPosition = timeOfDay === "morning" ? "left-1/4" : timeOfDay === "afternoon" ? "left-1/2" : "left-3/4";
    const sunColor = timeOfDay === "evening" ? "bg-orange-400" : "bg-yellow-300";
    const glowColor = timeOfDay === "evening" ? "shadow-orange-400/50" : "shadow-yellow-300/50";
    
    return (
      <div className={`absolute ${sunPosition} top-16 transform -translate-x-1/2`}>
        <div className={`relative w-24 h-24 ${sunColor} rounded-full shadow-2xl ${glowColor} animate-pulse-slow`}>
          {/* Rayos del sol */}
          {[...Array(12)].map((_, i) => (
            <div
              key={`ray-${i}`}
              className={`absolute w-1 h-8 ${sunColor} rounded-full origin-bottom`}
              style={{
                left: "50%",
                top: "-32px",
                transform: `translateX(-50%) rotate(${i * 30}deg)`,
                transformOrigin: "bottom center",
              }}
            />
          ))}
        </div>
      </div>
    );
  };

  // Renderizar luna y estrellas
  const renderMoon = () => {
    if (timeOfDay !== "night") return null;
    
    return (
      <>
        {/* Estrellas */}
        {[...Array(50)].map((_, i) => (
          <div
            key={`star-${i}`}
            className="absolute w-1 h-1 bg-white rounded-full animate-twinkle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 60}%`,
              animationDelay: `${Math.random() * 3}s`,
              opacity: 0.5 + Math.random() * 0.5,
            }}
          />
        ))}
        {/* Luna */}
        <div className="absolute right-1/4 top-16">
          <div className="relative w-20 h-20 bg-yellow-100 rounded-full shadow-2xl shadow-yellow-100/30">
            {/* Cráteres de la luna */}
            <div className="absolute w-4 h-4 bg-yellow-200/50 rounded-full" style={{ left: "20%", top: "30%" }} />
            <div className="absolute w-3 h-3 bg-yellow-200/50 rounded-full" style={{ left: "50%", top: "20%" }} />
            <div className="absolute w-5 h-5 bg-yellow-200/50 rounded-full" style={{ left: "60%", top: "50%" }} />
          </div>
        </div>
      </>
    );
  };

  // Renderizar relámpagos
  const renderLightning = () => {
    if (weatherCondition !== "stormy") return null;
    
    return (
      <div className="absolute inset-0 pointer-events-none">
        <div className="animate-lightning opacity-0">
          <svg
            className="absolute w-16 h-32"
            style={{ left: "30%", top: "10%" }}
            viewBox="0 0 64 128"
            fill="none"
          >
            <path
              d="M32 0L16 48H28L12 128L52 56H36L56 0H32Z"
              fill="rgba(255, 255, 200, 0.9)"
              filter="url(#glow)"
            />
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className={`fixed inset-0 overflow-hidden bg-gradient-to-b ${getBackgroundGradient()} transition-all duration-1000`}>
      {/* Capa de oscurecimiento para nubes/tormenta */}
      {(weatherCondition === "cloudy" || weatherCondition === "rainy" || weatherCondition === "stormy") && (
        <div className={`absolute inset-0 ${weatherCondition === "stormy" ? "bg-gray-900/40" : "bg-gray-500/20"} transition-all duration-500`} />
      )}
      
      {/* Elementos del clima */}
      {renderSun()}
      {renderMoon()}
      {renderClouds()}
      {renderRaindrops()}
      {renderLightning()}
      
      {/* Estilos de animación */}
      <style>{`
        @keyframes rain {
          0% {
            transform: translateY(-20px);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          100% {
            transform: translateY(100vh);
            opacity: 0.3;
          }
        }
        
        @keyframes cloud {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(calc(100vw + 200px));
          }
        }
        
        @keyframes twinkle {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
        }
        
        @keyframes pulse-slow {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 60px currentColor;
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 0 80px currentColor;
          }
        }
        
        @keyframes lightning {
          0%, 90%, 100% {
            opacity: 0;
          }
          92%, 94%, 96% {
            opacity: 1;
          }
          93%, 95% {
            opacity: 0;
          }
        }
        
        .animate-rain {
          animation: rain linear infinite;
        }
        
        .animate-cloud {
          animation: cloud linear infinite;
        }
        
        .animate-twinkle {
          animation: twinkle 3s ease-in-out infinite;
        }
        
        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }
        
        .animate-lightning {
          animation: lightning 8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
