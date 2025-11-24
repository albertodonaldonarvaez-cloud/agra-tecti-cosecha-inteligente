export function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50">
      <div className="flex flex-col items-center gap-4">
        {/* Logo con animación */}
        <div className="relative">
          <img
            src="/agra-tecti.png"
            alt="Agra-Tecti"
            className="h-32 w-32"
            style={{
              animation: 'pulseScale 2s ease-in-out infinite'
            }}
          />
          
          {/* Efecto de destello */}
          <div 
            className="absolute inset-0 overflow-hidden"
            style={{
              animation: 'shine 3s ease-in-out infinite'
            }}
          >
            <div 
              className="h-full w-full"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                transform: 'translateX(-100%) rotate(45deg)',
              }}
            />
          </div>
        </div>
        
        {/* Texto de carga */}
        <p className="animate-pulse text-center text-sm font-medium text-green-600">
          Cargando...
        </p>
      </div>
      
      <style>{`
        @keyframes pulseScale {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.85;
          }
        }
        
        @keyframes shine {
          0% {
            transform: translateX(-100%) rotate(45deg);
          }
          100% {
            transform: translateX(300%) rotate(45deg);
          }
        }
      `}</style>
    </div>
  );
}
