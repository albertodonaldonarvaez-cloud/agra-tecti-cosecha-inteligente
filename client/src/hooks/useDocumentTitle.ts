import { useEffect } from "react";
import { useLocation } from "wouter";
import { getPageName } from "@/config/pages";
import { APP_TITLE } from "@/const";

/**
 * Pone en la pestaña del navegador el nombre de la pantalla abierta.
 *
 * Antes la pestaña mostraba el texto crudo "%VITE_APP_TITLE%": ese marcador lo
 * sustituye Vite al construir, y la imagen de Docker nunca recibió esa
 * variable, así que el marcador llegaba tal cual al HTML. Ahora el título sale
 * del propio sistema, y además dice en qué pantalla está uno, que es lo útil
 * cuando se tienen varias pestañas abiertas.
 */
export function useDocumentTitle() {
  const [location] = useLocation();

  useEffect(() => {
    const pantalla = getPageName(location);
    // En rutas sin nombre propio (getPageName devuelve la ruta) no se inventa nada
    document.title = pantalla && !pantalla.startsWith("/")
      ? `${pantalla} · ${APP_TITLE}`
      : APP_TITLE;
  }, [location]);
}
