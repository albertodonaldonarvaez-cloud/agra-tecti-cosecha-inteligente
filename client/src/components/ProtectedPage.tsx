import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { getLoginUrl } from "@/const";
import { useEffect } from "react";
import { useLocation } from "wouter";

// Todos los permisos canView* definidos en el schema de usuarios
type ViewPermission =
  | "canViewDashboard"
  | "canViewBoxes"
  | "canViewAnalytics"
  | "canViewDailyAnalysis"
  | "canViewClimate"
  | "canViewPerformance"
  | "canViewParcelAnalysis"
  | "canViewParcels"
  | "canViewHarvesters"
  | "canViewEditor"
  | "canViewErrors"
  | "canViewCrops"
  | "canViewFieldNotes"
  | "canViewFieldNotebook"
  | "canViewWarehouse"
  | "canViewCollaborators";

interface ProtectedPageProps {
  children: React.ReactNode;
  permission?: ViewPermission;
}

export function ProtectedPage({ children, permission }: ProtectedPageProps) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  if (loading || !user) {
    return null;
  }

  // Admins tienen acceso a todo
  if (user.role === "admin") {
    return <>{children}</>;
  }

  // Si se especifica un permiso, verificarlo
  if (permission && !(user as any)[permission]) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50">
        <GlassCard className="p-8 text-center max-w-md">
          <h2 className="mb-2 text-2xl font-bold text-green-900">Acceso Denegado</h2>
          <p className="text-green-600 mb-4">No tienes permiso para acceder a esta página</p>
          <button
            onClick={() => setLocation("/")}
            className="text-green-700 underline hover:text-green-900"
          >
            Volver al inicio
          </button>
        </GlassCard>
      </div>
    );
  }

  return <>{children}</>;
}
