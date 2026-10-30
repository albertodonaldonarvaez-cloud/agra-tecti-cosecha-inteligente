import { cn } from "@/lib/utils";
import { LogOut, ChevronLeft, ChevronRight, Users, Settings, User } from "lucide-react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRef, useState, useEffect } from "react";
import { getNavPages, ADMIN_ONLY_PAGES, hasPermission } from "@/config/pages";

interface FloatingNavProps {
  isAdmin?: boolean;
}

export function FloatingNav({ isAdmin = false }: FloatingNavProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast.success("Sesión cerrada correctamente");
      window.location.href = "/";
    },
  });

  // Obtener páginas de navegación desde la configuración centralizada
  const navPages = getNavPages();

  // Filtrar páginas según permisos del usuario
  const filteredItems = navPages.filter(page => {
    // Admins ven todo
    if (isAdmin) return true;
    
    // Filtrar por adminOnly
    if (page.adminOnly) return false;
    
    // Filtrar por permiso
    if (!hasPermission(user, page.permissionKey)) {
      return false;
    }
    
    return true;
  });

  // Lo que ve cualquiera con permiso va primero; lo que solo ve el admin se
  // junta al final, a la derecha, en su propio grupo. Antes iban intercalados
  // por `order` (Cortadoras, Parcelas y Editor en medio de Libreta y Notas) y
  // el admin no distinguía las pantallas de operación de las de administración.
  const generalPages = filteredItems.filter(page => !page.adminOnly);
  const adminPages = isAdmin
    ? [
        ...filteredItems.filter(page => page.adminOnly),
        ...ADMIN_ONLY_PAGES.filter(p => p.showInNav),
      ]
    : [];

  const handleLogout = () => {
    if (confirm("¿Estás seguro de que deseas cerrar sesión?")) {
      logout.mutate();
    }
  };

  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      const newScrollLeft = direction === 'left' 
        ? scrollContainerRef.current.scrollLeft - scrollAmount
        : scrollContainerRef.current.scrollLeft + scrollAmount;
      
      scrollContainerRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  useEffect(() => {
    checkScroll();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScroll);
      return () => container.removeEventListener('scroll', checkScroll);
    }
  }, [filteredItems]);

  return (
    <nav className="fixed bottom-4 left-0 right-0 z-50 px-4">
      <div className="mx-auto max-w-4xl">
        <div className="relative flex items-center justify-center rounded-full border border-green-300/30 bg-white/20 backdrop-blur-xl shadow-2xl">
          {/* Flecha izquierda - Solo en desktop */}
          {!isMobile && canScrollLeft && (
            <button
              onClick={() => scroll('left')}
              className="absolute left-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-green-700 shadow-md transition-all hover:bg-white hover:scale-110"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {/* Contenedor scrollable */}
          <div
            ref={scrollContainerRef}
            className="flex items-center gap-2 overflow-x-auto p-2 scrollbar-hide"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {/* Páginas con permisos */}
            {generalPages.map((page) => {
              const Icon = page.icon;
              const isActive = location === page.path;
              
              return (
                <Link
                  key={page.path}
                  href={page.path}
                  className={cn(
                    "flex items-center justify-center rounded-full p-3 transition-all duration-300 flex-shrink-0",
                    isActive
                      ? "bg-white/30 text-green-700 shadow-md backdrop-blur-sm border border-green-400/50"
                      : "text-green-600 hover:bg-white/20 hover:text-green-700"
                  )}
                  title={page.label}
                >
                  <Icon className="h-5 w-5" />
                </Link>
              );
            })}

            {/* Páginas solo de admin: separadas y agrupadas a la derecha */}
            {adminPages.length > 0 && (
              <>
                <div className="h-6 w-px bg-green-300/30 flex-shrink-0" />
                <div
                  className="flex items-center gap-1 rounded-full bg-green-900/5 p-0.5 ring-1 ring-inset ring-green-300/40 flex-shrink-0"
                  title="Solo administradores"
                >
                  {adminPages.map((page) => {
                    const Icon = page.icon;
                    const isActive = location === page.path;

                    return (
                      <Link
                        key={page.path}
                        href={page.path}
                        className={cn(
                          "flex items-center justify-center rounded-full p-3 transition-all duration-300 flex-shrink-0",
                          isActive
                            ? "bg-white/30 text-green-700 shadow-md backdrop-blur-sm border border-green-400/50"
                            : "text-green-600 hover:bg-white/20 hover:text-green-700"
                        )}
                        title={`${page.label} (solo admin)`}
                      >
                        <Icon className="h-5 w-5" />
                      </Link>
                    );
                  })}
                </div>
              </>
            )}

            {/* Separador */}
            <div className="h-6 w-px bg-green-300/30 flex-shrink-0" />

            {/* Botón de perfil */}
            <Link
              href="/profile"
              className={cn(
                "flex items-center justify-center rounded-full p-3 transition-all duration-300 flex-shrink-0",
                location === "/profile"
                  ? "bg-white/30 text-green-700 shadow-md backdrop-blur-sm border border-green-400/50"
                  : "text-green-600 hover:bg-white/20 hover:text-green-700"
              )}
              title="Mi Perfil"
            >
              <User className="h-5 w-5" />
            </Link>
            
            {/* Botón de cerrar sesión */}
            <button
              onClick={handleLogout}
              disabled={logout.isPending}
              className="flex items-center justify-center rounded-full p-3 text-red-600 transition-all duration-300 hover:bg-red-50/20 hover:text-red-700 disabled:opacity-50 flex-shrink-0"
              title="Cerrar Sesión"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>

          {/* Flecha derecha - Solo en desktop */}
          {!isMobile && canScrollRight && (
            <button
              onClick={() => scroll('right')}
              className="absolute right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-green-700 shadow-md transition-all hover:bg-white hover:scale-110"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </nav>
  );
}
