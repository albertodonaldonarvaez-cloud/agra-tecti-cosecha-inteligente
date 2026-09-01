import { Request, Response } from "express";
import path from "path";
import * as db from "./db";
import { PHOTOS_PUBLIC_PREFIX, ensureLocalCopy, findLocalCopy, toFsPath } from "./koboPhotoStore";

/**
 * Decide si una URL puede pedirse con el token de Kobo.
 *
 * El endpoint es público, así que sin esta comprobación cualquiera podría
 * pedirle al servidor que mandara el token a un host suyo. Se permite el host
 * configurado en Ajustes, sus hermanos del mismo dominio (kf./kc./ee.) y los
 * servidores públicos de KoboToolbox.
 */
function isAllowedKoboHost(target: URL, apiUrl?: string | null): boolean {
  const host = target.hostname.toLowerCase();

  if (host === "kobotoolbox.org" || host.endsWith(".kobotoolbox.org")) return true;

  if (apiUrl) {
    try {
      // La URL de Ajustes puede venir sin protocolo ("kf.ejemplo.com")
      const normalizada = /^https?:\/\//i.test(apiUrl) ? apiUrl : `https://${apiUrl}`;
      const configured = new URL(normalizada).hostname.toLowerCase();
      if (host === configured) return true;
      // Mismo dominio, otro subdominio: kf.x.com y kc.x.com son el mismo Kobo
      const parent = configured.split(".").slice(1).join(".");
      if (parent.includes(".") && (host === parent || host.endsWith(`.${parent}`))) return true;
    } catch {
      // apiUrl mal formada: se ignora y decide el resto de la comprobación
    }
  }

  return false;
}

function sendLocalFile(res: Response, fsPath: string, contentType: string | null) {
  res.setHeader("Content-Type", contentType || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=604800, immutable"); // 7 días
  res.setHeader("X-Photo-Source", "local");
  res.sendFile(path.resolve(fsPath), (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: "No se pudo leer la foto del servidor" });
    }
  });
}

/**
 * Proxy de imágenes de KoboToolbox.
 *
 * Antes salía a Kobo en cada visita. Ahora sirve la copia guardada en el
 * servidor y solo va a Kobo la primera vez —dejando ya la copia hecha—, de modo
 * que el histórico de fotos deja de depender de que Kobo esté disponible.
 */
export async function proxyKoboImage(req: Request, res: Response) {
  try {
    const { url } = req.query;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    // Fotos que ya viven en el servidor (cargas por Excel, app de campo…)
    if (url.startsWith(PHOTOS_PUBLIC_PREFIX + "/") || url.startsWith("/photos/")) {
      return sendLocalFile(res, toFsPath(url), null);
    }

    // 1) ¿Ya está descargada? Se sirve del disco sin tocar la red
    const cached = await findLocalCopy(url);
    if (cached) {
      return sendLocalFile(res, cached.fsPath, cached.contentType);
    }

    const config = await db.getApiConfig();
    if (!config) {
      return res.status(500).json({ error: "API configuration not found" });
    }

    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return res.status(400).json({ error: "URL inválida" });
    }

    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return res.status(400).json({ error: "Protocolo no permitido" });
    }

    if (!isAllowedKoboHost(target, config.apiUrl)) {
      console.warn(`[ImageProxy] Host no permitido: ${target.hostname}`);
      return res.status(403).json({ error: "Host no permitido" });
    }

    // 2) Primera vez: se descarga, se guarda en /app/photos/kobo y se sirve
    try {
      const copy = await ensureLocalCopy(url, config.apiToken);
      return sendLocalFile(res, copy.fsPath, copy.contentType);
    } catch (downloadError: any) {
      // 3) Si no se pudo guardar (disco lleno, permisos…), no dejamos al
      //    usuario sin foto: se sirve directo de Kobo como se hacía antes.
      console.error("[ImageProxy] No se pudo guardar la copia local:", downloadError?.message || downloadError);

      const response = await fetch(url, {
        headers: { Authorization: `Token ${config.apiToken}` },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        console.error(`Failed to fetch image from Kobo: ${response.status} ${response.statusText}`);
        return res.status(response.status).json({ error: "Failed to fetch image from Kobo" });
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      const imageBuffer = await response.arrayBuffer();

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("X-Photo-Source", "kobo");
      res.send(Buffer.from(imageBuffer));
    }
  } catch (error) {
    console.error("Error proxying Kobo image:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
