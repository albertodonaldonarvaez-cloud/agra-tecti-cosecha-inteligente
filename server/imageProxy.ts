import { Request, Response } from "express";
import * as db from "./db";

/**
 * Proxy endpoint para imágenes de KoboToolbox
 * Agrega autenticación automática a las peticiones de imágenes
 */
export async function proxyKoboImage(req: Request, res: Response) {
  try {
    const { url } = req.query;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    // Obtener configuración de API
    const config = await db.getApiConfig();
    
    if (!config) {
      return res.status(500).json({ error: "API configuration not found" });
    }

    // Hacer petición a Kobo con autenticación
    const response = await fetch(url, {
      headers: {
        "Authorization": `Token ${config.apiToken}`,
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch image from Kobo: ${response.status} ${response.statusText}`);
      return res.status(response.status).json({ error: "Failed to fetch image from Kobo" });
    }

    // Obtener el tipo de contenido
    const contentType = response.headers.get("content-type") || "image/jpeg";
    
    // Obtener la imagen como buffer
    const imageBuffer = await response.arrayBuffer();
    
    // Enviar la imagen al cliente
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache por 24 horas
    res.send(Buffer.from(imageBuffer));
    
  } catch (error) {
    console.error("Error proxying Kobo image:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
