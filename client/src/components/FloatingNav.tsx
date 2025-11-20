import { cn } from "@/lib/utils";
import { BarChart3, Box, Settings, Users, Scissors, LogOut, TrendingUp, Calendar, MapPin, AlertCircle } from "lucide-react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

interface NavItem {
  to: string;
  icon: typeof BarChart3;
  label: string;
  adminOnly?: boolean;
  permission?: string;
}

interface FloatingNavProps {
  isAdmin?: boolean;
}

export function FloatingNav({ isAdmin = false }: FloatingNavProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast.success("Sesión cerrada correctamente");
      window.location.href = "/";
    },
  });

  const navItems: NavItem[] = [
    { to: "/", icon: BarChart3, label: "Dashboard", permission: "canViewDashboard" },
    { to: "/boxes", icon: Box, label: "Cajas", permission: "canViewBoxes" },
    { to: "/analytics", icon: TrendingUp, label: "Análisis", permission: "canViewAnalytics" },
    { to: "/daily", icon: Calendar, label: "Diario", permission: "canViewDailyAnalysis" },
    { to: "/harvesters", icon: Scissors, label: "Cortadoras", adminOnly: true, permission: "canViewHarvesters" },
    { to: "/parcels", icon: MapPin, label: "Parcelas", adminOnly: true, permission: "canViewParcels" },
    { to: "/errors", icon: AlertCircle, label: "Errores", adminOnly: true, permission: "canViewErrors" },
    { to: "/users", icon: Users, label: "Usuarios", adminOnly: true },
    { to: "/settings", icon: Settings, label: "Configuración", adminOnly: true },
  ];

  const filteredItems = navItems.filter(item => {
    // Admins ven todo
    if (isAdmin) return true;
    
    // Filtrar por adminOnly
    if (item.adminOnly) return false;
    
    // Filtrar por permiso
    if (item.permission && user && !(user as any)[item.permission]) {
      return false;
    }
    
    return true;
  });

  const handleLogout = () => {
    if (confirm("¿Estás seguro de que deseas cerrar sesión?")) {
      logout.mutate();
    }
  };

  return (
    <nav className="fixed bottom-4 left-0 right-0 z-50 px-4">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-center gap-2 rounded-full border border-green-300/30 bg-white/20 p-2 backdrop-blur-xl shadow-2xl">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.to;
            
            return (
              <Link
                key={item.to}
                href={item.to}
                className={cn(
                  "flex items-center justify-center rounded-full p-3 transition-all duration-300",
                  isActive
                    ? "bg-white/30 text-green-700 shadow-md backdrop-blur-sm border border-green-400/50"
                    : "text-green-600 hover:bg-white/20 hover:text-green-700"
                )}
              >
                <Icon className="h-5 w-5" />
              </Link>
            );
          })}
          
          {/* Separador */}
          <div className="h-6 w-px bg-green-300/30" />
          
          {/* Botón de cerrar sesión */}
          <button
            onClick={handleLogout}
            disabled={logout.isPending}
            className="flex items-center justify-center rounded-full p-3 text-red-600 transition-all duration-300 hover:bg-red-50/20 hover:text-red-700 disabled:opacity-50"
            title="Cerrar Sesión"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </nav>
  );
}
