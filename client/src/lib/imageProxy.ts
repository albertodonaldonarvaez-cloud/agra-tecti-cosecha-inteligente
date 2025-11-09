/**
 * Convierte una URL de imagen de KoboToolbox a una URL del proxy local
 * Esto permite cargar imágenes que requieren autenticación
 */
export function getProxiedImageUrl(koboUrl: string | null): string {
  if (!koboUrl) {
    return "/placeholder-image.png"; // Imagen por defecto si no hay URL
  }
  
  // Si la URL ya es local o no es de Kobo, devolverla tal cual
  if (!koboUrl.includes("kf.") && !koboUrl.includes("kobotoolbox")) {
    return koboUrl;
  }
  
  // Convertir a URL del proxy
  return `/api/image-proxy?url=${encodeURIComponent(koboUrl)}`;
}
