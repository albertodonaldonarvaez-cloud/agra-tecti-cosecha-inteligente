export function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50">
      <div className="relative">
        {/* Logo con animación de escala */}
        <img
          src="/agra-tecti.png"
          alt="Agra-Tecti"
          className="h-32 w-32 animate-pulse-scale"
        />
        
        {/* Efecto de destello */}
        <div className="absolute inset-0 animate-shine">
          <div className="h-full w-full bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        </div>
        
        {/* Texto de carga */}
        <p className="mt-4 text-center text-sm font-medium text-green-600 animate-pulse">
          Cargando...
        </p>
      </div>
      
      <style>{`
        @keyframes pulse-scale {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.8;
          }
        }
        
        @keyframes shine {
          0% {
            transform: translateX(-100%) rotate(45deg);
          }
          100% {
            transform: translateX(200%) rotate(45deg);
          }
        }
        
        .animate-pulse-scale {
          animation: pulse-scale 2s ease-in-out infinite;
        }
        
        .animate-shine {
          animation: shine 3s ease-in-out infinite;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
