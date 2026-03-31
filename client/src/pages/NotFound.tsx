import { useLocation } from "wouter";
import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================
// Página 404 — "Parcela No Encontrada"
// Una experiencia inmersiva con campo agrícola animado,
// espantapájaros interactivo, clima dinámico y easter eggs.
// ============================================================

// Partículas flotantes (semillas, hojas, pétalos)
interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  angle: number;
  rotation: number;
  rotSpeed: number;
  type: "seed" | "leaf" | "petal" | "dandelion";
  opacity: number;
}

function useParticles(count: number) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const types: Particle["type"][] = ["seed", "leaf", "petal", "dandelion"];
    const initial: Particle[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 6 + Math.random() * 10,
      speed: 0.15 + Math.random() * 0.35,
      angle: Math.random() * 360,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 3,
      type: types[Math.floor(Math.random() * types.length)],
      opacity: 0.3 + Math.random() * 0.5,
    }));
    setParticles(initial);

    const interval = setInterval(() => {
      setParticles((prev) =>
        prev.map((p) => ({
          ...p,
          x: ((p.x + Math.sin(p.angle * (Math.PI / 180)) * 0.08 + 100) % 100),
          y: p.y - p.speed < -5 ? 105 : p.y - p.speed,
          angle: p.angle + 0.5,
          rotation: p.rotation + p.rotSpeed,
        }))
      );
    }, 50);

    return () => clearInterval(interval);
  }, [count]);

  return particles;
}

// Componente de partícula individual
function ParticleElement({ p }: { p: Particle }) {
  const emoji =
    p.type === "seed" ? "🌾" :
    p.type === "leaf" ? "🍃" :
    p.type === "petal" ? "🌸" : "🌼";

  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        left: `${p.x}%`,
        top: `${p.y}%`,
        fontSize: `${p.size}px`,
        opacity: p.opacity,
        transform: `rotate(${p.rotation}deg)`,
        transition: "left 0.05s linear, top 0.05s linear",
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))",
      }}
    >
      {emoji}
    </div>
  );
}

// Espantapájaros SVG animado e interactivo
function Scarecrow({ onClick, wobble }: { onClick: () => void; wobble: boolean }) {
  return (
    <div
      className={`cursor-pointer select-none transition-transform duration-300 ${wobble ? "animate-bounce" : "hover:scale-105"}`}
      onClick={onClick}
      title="Haz clic en el espantapájaros"
      style={{ filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.2))" }}
    >
      <svg width="180" height="260" viewBox="0 0 180 260" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Palo vertical */}
        <rect x="85" y="80" width="10" height="180" rx="3" fill="#8B6914" />
        {/* Palo horizontal */}
        <rect x="30" y="100" width="120" height="8" rx="3" fill="#A0782C" />
        {/* Sombrero */}
        <ellipse cx="90" cy="52" rx="40" ry="8" fill="#5C3D0E" />
        <path d="M60 52 L65 15 L115 15 L120 52" fill="#8B5E14" />
        <rect x="65" y="15" width="50" height="5" rx="2" fill="#A0782C" />
        <rect x="70" y="30" width="10" height="3" rx="1" fill="#D4A843" />
        {/* Cabeza */}
        <circle cx="90" cy="68" r="20" fill="#F5DEB3" />
        {/* Ojos — botones cosidos */}
        <circle cx="82" cy="64" r="4" fill="none" stroke="#4A3000" strokeWidth="1.5" />
        <line x1="79" y1="61" x2="85" y2="67" stroke="#4A3000" strokeWidth="1" />
        <line x1="85" y1="61" x2="79" y2="67" stroke="#4A3000" strokeWidth="1" />
        <circle cx="98" cy="64" r="4" fill="none" stroke="#4A3000" strokeWidth="1.5" />
        <line x1="95" y1="61" x2="101" y2="67" stroke="#4A3000" strokeWidth="1" />
        <line x1="101" y1="61" x2="95" y2="67" stroke="#4A3000" strokeWidth="1" />
        {/* Boca cosida */}
        <path d="M82 76 Q86 72 90 76 Q94 72 98 76" fill="none" stroke="#4A3000" strokeWidth="1.5" strokeLinecap="round" />
        {/* Mejillas */}
        <circle cx="78" cy="72" r="3" fill="#E8A87C" opacity="0.5" />
        <circle cx="102" cy="72" r="3" fill="#E8A87C" opacity="0.5" />
        {/* Paja saliendo del sombrero */}
        <line x1="70" y1="52" x2="62" y2="42" stroke="#DAA520" strokeWidth="2" strokeLinecap="round" />
        <line x1="110" y1="52" x2="118" y2="42" stroke="#DAA520" strokeWidth="2" strokeLinecap="round" />
        <line x1="75" y1="52" x2="70" y2="38" stroke="#DAA520" strokeWidth="1.5" strokeLinecap="round" />
        {/* Camisa / cuerpo */}
        <path d="M70 88 L60 100 L30 104 L30 108 L65 108 L75 140 L105 140 L115 108 L150 108 L150 104 L120 100 L110 88 Z" fill="#C0392B" />
        <line x1="90" y1="88" x2="90" y2="140" stroke="#922B21" strokeWidth="1" />
        {/* Botones de la camisa */}
        <circle cx="90" cy="100" r="2.5" fill="#F1C40F" />
        <circle cx="90" cy="115" r="2.5" fill="#F1C40F" />
        <circle cx="90" cy="130" r="2.5" fill="#F1C40F" />
        {/* Parche en la camisa */}
        <rect x="95" y="108" width="12" height="14" rx="2" fill="#2ECC71" opacity="0.7" />
        <line x1="97" y1="110" x2="105" y2="110" stroke="#27AE60" strokeWidth="0.5" />
        <line x1="97" y1="113" x2="105" y2="113" stroke="#27AE60" strokeWidth="0.5" />
        <line x1="97" y1="116" x2="105" y2="116" stroke="#27AE60" strokeWidth="0.5" />
        {/* Paja saliendo de las mangas */}
        <line x1="30" y1="104" x2="22" y2="98" stroke="#DAA520" strokeWidth="2" strokeLinecap="round" />
        <line x1="30" y1="106" x2="20" y2="106" stroke="#DAA520" strokeWidth="2" strokeLinecap="round" />
        <line x1="30" y1="108" x2="24" y2="114" stroke="#DAA520" strokeWidth="2" strokeLinecap="round" />
        <line x1="150" y1="104" x2="158" y2="98" stroke="#DAA520" strokeWidth="2" strokeLinecap="round" />
        <line x1="150" y1="106" x2="160" y2="106" stroke="#DAA520" strokeWidth="2" strokeLinecap="round" />
        <line x1="150" y1="108" x2="156" y2="114" stroke="#DAA520" strokeWidth="2" strokeLinecap="round" />
        {/* Pájaro en el brazo */}
        <g transform="translate(148, 90)">
          <ellipse cx="0" cy="0" rx="7" ry="5" fill="#2C3E50" />
          <circle cx="5" cy="-2" r="3.5" fill="#34495E" />
          <circle cx="6.5" cy="-3" r="1" fill="white" />
          <circle cx="6.8" cy="-3" r="0.5" fill="black" />
          <polygon points="8,-2 12,-1 8,0" fill="#E67E22" />
          <line x1="-2" y1="5" x2="-2" y2="9" stroke="#2C3E50" strokeWidth="1" />
          <line x1="2" y1="5" x2="2" y2="9" stroke="#2C3E50" strokeWidth="1" />
        </g>
      </svg>
    </div>
  );
}

// Surcos del campo
function FieldRows() {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-[45%] overflow-hidden">
      {/* Tierra base */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#8B7355] via-[#6B4423] to-[#4A2F15]" />
      {/* Surcos */}
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="absolute left-0 right-0"
          style={{
            top: `${8 + i * 8}%`,
            height: "3px",
            background: `linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.2) 20%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.2) 80%, transparent 100%)`,
            transform: `perspective(500px) rotateX(${15 + i * 2}deg)`,
          }}
        />
      ))}
      {/* Plantas pequeñas en los surcos */}
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={`plant-${i}`}
          className="absolute text-green-600 select-none"
          style={{
            left: `${5 + Math.random() * 90}%`,
            top: `${15 + Math.random() * 70}%`,
            fontSize: `${8 + Math.random() * 12}px`,
            opacity: 0.4 + Math.random() * 0.4,
            transform: `rotate(${(Math.random() - 0.5) * 20}deg)`,
          }}
        >
          {["🌱", "🌿", "🍀", "🌾"][Math.floor(Math.random() * 4)]}
        </div>
      ))}
    </div>
  );
}

// Nubes animadas
function Clouds() {
  return (
    <>
      <div className="absolute top-[8%] left-[5%] text-white/30 text-6xl select-none animate-cloud-slow">
        ☁
      </div>
      <div className="absolute top-[15%] right-[10%] text-white/20 text-5xl select-none animate-cloud-medium">
        ☁
      </div>
      <div className="absolute top-[5%] left-[40%] text-white/25 text-7xl select-none animate-cloud-fast">
        ☁
      </div>
      <div className="absolute top-[20%] left-[70%] text-white/15 text-4xl select-none animate-cloud-slow" style={{ animationDelay: "-15s" }}>
        ☁
      </div>
    </>
  );
}

// Sol animado
function Sun() {
  return (
    <div className="absolute top-[5%] right-[8%] select-none">
      <div className="relative">
        <div className="absolute inset-0 w-20 h-20 bg-yellow-300/30 rounded-full animate-pulse blur-xl" />
        <div className="relative text-7xl animate-spin-very-slow">
          ☀
        </div>
      </div>
    </div>
  );
}

// Tractor animado que cruza la pantalla
function Tractor({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="absolute bottom-[42%] animate-tractor-cross select-none" style={{ fontSize: "40px" }}>
      🚜
      <span className="absolute -right-4 top-1 text-sm opacity-60">💨</span>
    </div>
  );
}

// Letrero de madera con el "404"
function WoodenSign() {
  return (
    <div className="relative flex flex-col items-center select-none">
      {/* Cartel */}
      <div className="relative">
        {/* Sombra del cartel */}
        <div className="absolute inset-0 translate-y-2 translate-x-1 bg-black/10 rounded-xl blur-sm" />
        {/* Tabla de madera */}
        <div
          className="relative px-10 py-5 rounded-xl border-4 border-[#6B3A1F]"
          style={{
            background: "linear-gradient(135deg, #DEB887 0%, #C4A265 30%, #B8860B 60%, #A0782C 100%)",
            boxShadow: "inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          {/* Vetas de la madera */}
          <div className="absolute inset-0 rounded-xl opacity-20" style={{
            backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(139,69,19,0.3) 8px, rgba(139,69,19,0.3) 9px)",
          }} />
          {/* Clavos */}
          <div className="absolute top-2 left-3 w-3 h-3 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 shadow-inner" />
          <div className="absolute top-2 right-3 w-3 h-3 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 shadow-inner" />
          <div className="absolute bottom-2 left-3 w-3 h-3 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 shadow-inner" />
          <div className="absolute bottom-2 right-3 w-3 h-3 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 shadow-inner" />
          {/* Texto 404 */}
          <div className="relative">
            <span
              className="text-7xl sm:text-8xl font-black tracking-wider"
              style={{
                color: "#3E1F0D",
                textShadow: "2px 2px 0 rgba(255,255,255,0.2), -1px -1px 0 rgba(0,0,0,0.3)",
                fontFamily: "'Georgia', serif",
              }}
            >
              4
              <span className="inline-block animate-spin-very-slow">
                🌻
              </span>
              4
            </span>
          </div>
        </div>
      </div>
      {/* Postes del cartel */}
      <div className="flex gap-24 -mt-1">
        <div className="w-3 h-14 bg-gradient-to-b from-[#8B6914] to-[#5C3D0E] rounded-b-sm shadow-md" />
        <div className="w-3 h-14 bg-gradient-to-b from-[#8B6914] to-[#5C3D0E] rounded-b-sm shadow-md" />
      </div>
    </div>
  );
}

// Mensajes del espantapájaros
const SCARECROW_MESSAGES = [
  "¡Uy! Esta parcela no existe en el mapa... 🗺️",
  "Aquí no hay nada sembrado, amigo. 🌾",
  "¿Buscas algo? Porque yo solo espanto pájaros... 🐦",
  "Error 404: Cosecha no encontrada. 🚫🌽",
  "Ni las raíces llegan tan profundo como esta URL... 🌱",
  "¡Hasta el tractor se perdió por aquí! 🚜💨",
  "Esta tierra está más vacía que campo en invierno... ❄️",
  "¿Seguro que no te equivocaste de surco? 🤔",
  "Ni con GPS encuentras esta página... 📡",
  "¡Alerta! Zona sin cultivo detectada. 🔴",
];

export default function NotFound() {
  const [, setLocation] = useLocation();
  const [scarecrowMsg, setScarecrowMsg] = useState(0);
  const [wobble, setWobble] = useState(false);
  const [showTractor, setShowTractor] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const particles = useParticles(15);
  const tractorTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Tractor aparece periódicamente
  useEffect(() => {
    const launchTractor = () => {
      setShowTractor(true);
      setTimeout(() => setShowTractor(false), 6000);
      tractorTimerRef.current = setTimeout(launchTractor, 12000 + Math.random() * 8000);
    };
    tractorTimerRef.current = setTimeout(launchTractor, 3000);
    return () => {
      if (tractorTimerRef.current) clearTimeout(tractorTimerRef.current);
    };
  }, []);

  const handleScarecrowClick = useCallback(() => {
    setWobble(true);
    setScarecrowMsg((prev) => (prev + 1) % SCARECROW_MESSAGES.length);
    setClickCount((prev) => prev + 1);
    setTimeout(() => setWobble(false), 600);

    // Easter egg: después de 7 clics
    if (clickCount >= 6) {
      setShowEasterEgg(true);
      setTimeout(() => setShowEasterEgg(false), 4000);
      setClickCount(0);
    }
  }, [clickCount]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden select-none" style={{ background: "linear-gradient(180deg, #87CEEB 0%, #B0E0E6 35%, #98D8C8 55%, #8B7355 55.5%, #6B4423 75%, #4A2F15 100%)" }}>
      {/* Estilos de animación */}
      <style>{`
        @keyframes cloud-slow {
          0% { transform: translateX(-10vw); }
          100% { transform: translateX(110vw); }
        }
        @keyframes cloud-medium {
          0% { transform: translateX(110vw); }
          100% { transform: translateX(-10vw); }
        }
        @keyframes cloud-fast {
          0% { transform: translateX(-15vw); }
          100% { transform: translateX(115vw); }
        }
        @keyframes spin-very-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes tractor-cross {
          0% { left: -80px; }
          100% { left: calc(100% + 80px); }
        }
        @keyframes sway {
          0%, 100% { transform: rotate(-2deg); }
          50% { transform: rotate(2deg); }
        }
        @keyframes fade-up {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes confetti-fall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .animate-cloud-slow { animation: cloud-slow 45s linear infinite; }
        .animate-cloud-medium { animation: cloud-medium 35s linear infinite; }
        .animate-cloud-fast { animation: cloud-fast 55s linear infinite; }
        .animate-spin-very-slow { animation: spin-very-slow 20s linear infinite; }
        .animate-tractor-cross { animation: tractor-cross 6s linear forwards; }
        .animate-sway { animation: sway 3s ease-in-out infinite; }
        .animate-fade-up { animation: fade-up 0.5s ease-out forwards; }
        .animate-confetti { animation: confetti-fall 3s ease-in forwards; }
      `}</style>

      {/* Cielo con nubes y sol */}
      <Clouds />
      <Sun />

      {/* Montañas lejanas */}
      <div className="absolute bottom-[45%] left-0 right-0 h-[15%]">
        <svg viewBox="0 0 1200 200" className="w-full h-full" preserveAspectRatio="none">
          <path d="M0 200 L0 120 Q100 40 200 100 Q300 30 400 80 Q500 10 600 70 Q700 20 800 90 Q900 40 1000 60 Q1100 30 1200 100 L1200 200 Z" fill="#6B8E5A" opacity="0.4" />
          <path d="M0 200 L0 140 Q150 70 300 120 Q450 50 600 110 Q750 60 900 100 Q1050 70 1200 130 L1200 200 Z" fill="#7BA05B" opacity="0.3" />
        </svg>
      </div>

      {/* Campo con surcos */}
      <FieldRows />

      {/* Cerca de madera al fondo */}
      <div className="absolute bottom-[43%] left-0 right-0 flex items-end justify-center gap-[3%] px-4">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className="w-1.5 sm:w-2 h-8 sm:h-12 bg-gradient-to-b from-[#A0782C] to-[#6B4423] rounded-t-sm" />
          </div>
        ))}
      </div>
      <div className="absolute bottom-[46%] left-[2%] right-[2%] h-1.5 bg-[#8B6914] rounded-full opacity-70" />
      <div className="absolute bottom-[48%] left-[2%] right-[2%] h-1.5 bg-[#A0782C] rounded-full opacity-50" />

      {/* Tractor */}
      <Tractor visible={showTractor} />

      {/* Partículas flotantes */}
      {particles.map((p) => (
        <ParticleElement key={p.id} p={p} />
      ))}

      {/* Contenido principal */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 pb-20 pt-10">
        {/* Letrero de madera 404 */}
        <div className="mb-4 sm:mb-6">
          <WoodenSign />
        </div>

        {/* Espantapájaros */}
        <div className="mb-4 sm:mb-6 animate-sway" style={{ transformOrigin: "bottom center" }}>
          <Scarecrow onClick={handleScarecrowClick} wobble={wobble} />
        </div>

        {/* Burbuja de diálogo del espantapájaros */}
        <div className="animate-fade-up mb-6 max-w-sm mx-auto" key={scarecrowMsg}>
          <div className="relative bg-white/90 backdrop-blur-sm rounded-2xl px-5 py-3 shadow-lg border border-green-200">
            {/* Flecha de la burbuja */}
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white/90 border-l border-t border-green-200 rotate-45" />
            <p className="relative text-center text-sm sm:text-base text-gray-700 font-medium leading-relaxed">
              {SCARECROW_MESSAGES[scarecrowMsg]}
            </p>
          </div>
        </div>

        {/* Subtítulo */}
        <h2 className="text-lg sm:text-xl font-bold text-white/90 mb-2 text-center drop-shadow-lg">
          Parcela No Encontrada
        </h2>
        <p className="text-sm sm:text-base text-white/70 mb-6 text-center max-w-md drop-shadow-md">
          Parece que te desviaste del camino. Esta ruta no lleva a ninguna parcela registrada.
        </p>

        {/* Botones */}
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <button
            onClick={() => setLocation("/")}
            className="group relative px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:from-green-500 hover:to-green-600 transition-all duration-300 transform hover:scale-105 active:scale-95"
          >
            <span className="flex items-center gap-2">
              <span className="text-xl group-hover:animate-bounce">🏠</span>
              Volver al Rancho
            </span>
            {/* Brillo */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </button>

          <button
            onClick={() => window.history.back()}
            className="group px-6 py-3 bg-white/20 backdrop-blur-sm text-white font-semibold rounded-xl border-2 border-white/30 hover:bg-white/30 hover:border-white/50 transition-all duration-300 transform hover:scale-105 active:scale-95"
          >
            <span className="flex items-center gap-2">
              <span className="text-lg">↩️</span>
              Regresar
            </span>
          </button>
        </div>

        {/* Pista del easter egg */}
        <p className="mt-6 text-xs text-white/30 italic">
          Pista: haz clic varias veces en el espantapájaros...
        </p>
      </div>

      {/* Easter Egg: lluvia de emojis agrícolas */}
      {showEasterEgg && (
        <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
          {Array.from({ length: 40 }).map((_, i) => {
            const emojis = ["🌽", "🍅", "🥕", "🌶️", "🥬", "🍊", "🍋", "🫑", "🥒", "🍇", "🍓", "🥭", "🌾", "🚜", "🐔", "🐄"];
            return (
              <div
                key={i}
                className="absolute animate-confetti text-2xl sm:text-3xl"
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 1.5}s`,
                  animationDuration: `${2 + Math.random() * 2}s`,
                }}
              >
                {emojis[Math.floor(Math.random() * emojis.length)]}
              </div>
            );
          })}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/60 backdrop-blur-sm text-white text-xl sm:text-2xl font-bold px-8 py-4 rounded-2xl animate-fade-up">
              🎉 ¡Cosecha sorpresa desbloqueada! 🎉
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
