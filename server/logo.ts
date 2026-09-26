// ============================================================
// El logotipo, para el correo y el PDF
//
// Tiene copia propia en `server/assets/` y no usa la del navegador. No es
// duplicar por gusto: `client/public/agra-tecti.png` dice .png pero por
// dentro es un WebP, que al navegador le da igual y a un PDF y a Outlook no
// —pdfkit contesta "Unknown image format" y el correo enseña el hueco—. Esta
// copia es un PNG de verdad, de 256 px, que es todo lo que necesitan un
// membrete y una imagen de correo.
//
// Se lee una sola vez y se queda en memoria: el envío semanal arma varios
// documentos seguidos.
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Junto al módulo, no relativo al directorio de trabajo: el servidor se
// arranca desde sitios distintos en desarrollo y dentro del contenedor.
const AQUI = path.dirname(fileURLToPath(import.meta.url));

const CANDIDATOS = [
  path.resolve(AQUI, "assets/logo-reportes.png"),
  path.resolve(AQUI, "../server/assets/logo-reportes.png"),
  path.resolve(process.cwd(), "server/assets/logo-reportes.png"),
];

let cache: Buffer | null | undefined;

/** El PNG del logo, o `null` si no se encontró (el reporte sale igual) */
export function logoPng(): Buffer | null {
  if (cache !== undefined) return cache;

  for (const ruta of CANDIDATOS) {
    try {
      if (fs.existsSync(ruta)) {
        cache = fs.readFileSync(ruta);
        return cache;
      }
    } catch {
      // Siguiente candidato
    }
  }

  console.warn("[Logo] No se encontró server/assets/logo-reportes.png; los reportes saldrán sin logo");
  cache = null;
  return cache;
}

/** Identificador del logo dentro de un correo, para `<img src="cid:…">` */
export const LOGO_CID = "logoagratecti";

/** El adjunto en línea que hace que el logo se vea en el correo */
export function logoAdjunto() {
  const png = logoPng();
  if (!png) return [];
  return [{ filename: "agra-tecti.png", content: png, contentType: "image/png", cid: LOGO_CID }];
}
