import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { getLoginUrl } from "@/const";
import { useEffect } from "react";
import { useLocation } from "wouter";

interface ProtectedPageProps {
  children: React.ReactNode;
  permission?: keyof Pick<
    any,
    "canViewDashboard" | "canViewBoxes" | "canViewAnalytics" | "canViewDailyAnalysis" | "canViewParcels" | "canViewHarvesters" | "canViewErrors" | "canViewParcelAnalysis"
  >;
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
  if (permission && !user[permission]) {
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
