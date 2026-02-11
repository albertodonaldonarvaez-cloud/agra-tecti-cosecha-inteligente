import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { PAGES_CONFIG, ADMIN_ONLY_PAGES } from "@/config/pages";

/**
 * Hook que registra automáticamente la actividad del usuario:
 * - page_view cuando entra a una página
 * - page_leave con duración cuando sale de una página
 * - login cuando inicia sesión
 */

function getPageName(path: string): string {
  const page = PAGES_CONFIG.find(p => p.path === path);
  if (page) return page.fullName;
  const adminPage = ADMIN_ONLY_PAGES.find(p => p.path === path);
  if (adminPage) return adminPage.fullName;
  if (path === "/profile") return "Mi Perfil";
  return path;
}

// Generar un sessionId único por sesión del navegador
function getSessionId(): string {
  let sessionId = sessionStorage.getItem("activity_session_id");
  if (!sessionId) {
    sessionId = `s_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    sessionStorage.setItem("activity_session_id", sessionId);
  }
  return sessionId;
}

export function useActivityTracker() {
  const { user } = useAuth();
  const [location] = useLocation();
  const logActivity = trpc.profile.logActivity.useMutation();
  const lastPageRef = useRef<string | null>(null);
  const enterTimeRef = useRef<number>(Date.now());
  const sessionId = useRef(getSessionId());

  useEffect(() => {
    if (!user) return;

    // Si hay una página anterior, registrar page_leave con duración
    if (lastPageRef.current && lastPageRef.current !== location) {
      const duration = Math.round((Date.now() - enterTimeRef.current) / 1000);
      if (duration > 0 && duration < 86400) { // Máximo 24h para evitar datos basura
        logActivity.mutate({
          action: "page_leave",
          page: lastPageRef.current,
          pageName: getPageName(lastPageRef.current),
          sessionId: sessionId.current,
          durationSeconds: duration,
        });
      }
    }

    // Registrar page_view de la nueva página
    logActivity.mutate({
      action: "page_view",
      page: location,
      pageName: getPageName(location),
      sessionId: sessionId.current,
    });

    lastPageRef.current = location;
    enterTimeRef.current = Date.now();
  }, [location, user]);

  // Registrar page_leave cuando el usuario cierra la pestaña
  useEffect(() => {
    if (!user) return;

    const handleBeforeUnload = () => {
      if (lastPageRef.current) {
        const duration = Math.round((Date.now() - enterTimeRef.current) / 1000);
        // Usar sendBeacon para enviar datos antes de cerrar
        const data = JSON.stringify({
          action: "page_leave",
          page: lastPageRef.current,
          pageName: getPageName(lastPageRef.current),
          sessionId: sessionId.current,
          durationSeconds: duration > 0 && duration < 86400 ? duration : 0,
        });
        // sendBeacon no funciona con tRPC, pero al menos intentamos el mutate
        logActivity.mutate({
          action: "page_leave",
          page: lastPageRef.current,
          pageName: getPageName(lastPageRef.current),
          sessionId: sessionId.current,
          durationSeconds: duration > 0 && duration < 86400 ? duration : 0,
        });
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [user]);
}
