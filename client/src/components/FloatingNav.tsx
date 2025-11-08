import { cn } from "@/lib/utils";
import { BarChart3, Box, Settings, Users, Scissors } from "lucide-react";
import { Link, useLocation } from "wouter";

interface NavItem {
  to: string;
  icon: typeof BarChart3;
  label: string;
  adminOnly?: boolean;
}

interface FloatingNavProps {
  isAdmin?: boolean;
}

export function FloatingNav({ isAdmin = false }: FloatingNavProps) {
  const [location] = useLocation();

  const navItems: NavItem[] = [
    { to: "/", icon: BarChart3, label: "Dashboard" },
    { to: "/boxes", icon: Box, label: "Cajas" },
    { to: "/harvesters", icon: Scissors, label: "Cortadoras", adminOnly: true },
    { to: "/users", icon: Users, label: "Usuarios", adminOnly: true },
    { to: "/settings", icon: Settings, label: "Configuración", adminOnly: true },
  ];

  const filteredItems = navItems.filter(item => !item.adminOnly || isAdmin);

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
        </div>
      </div>
    </nav>
  );
}
