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

/**
 * Foto de una caja, prefiriendo la copia que ya vive en el servidor.
 *
 * Cuando la foto está descargada (photoLocalPath) se pide directo al archivo
 * estático: no pasa por el proxy, no toca a KoboToolbox y el navegador la
 * cachea. Si todavía no se ha descargado, se cae al proxy de siempre —que de
 * paso guarda la copia para la próxima vez.
 */
export function getBoxPhotoUrl(
  box: { photoLocalPath?: string | null; photoLargeUrl?: string | null; photoUrl?: string | null } | null | undefined
): string | null {
  if (!box) return null;
  if (box.photoLocalPath) return box.photoLocalPath;
  const remote = box.photoLargeUrl || box.photoUrl;
  return remote ? getProxiedImageUrl(remote) : null;
}
