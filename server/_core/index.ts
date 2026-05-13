import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import cookieParser from "cookie-parser";
import multer from "multer";
import path from "path";
import { appRouter } from "../routers";
import { createContext } from "./authContext";
import { serveStatic, setupVite } from "./vite";

const APP_VERSION = process.env.APP_VERSION || "dev";
const startedAt = new Date();

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Cookie parser for authentication
  app.use(cookieParser());
  
  // Multer for file uploads
  const upload = multer({ 
    dest: "/tmp/uploads/",
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
  });

  // ============================================
  // HEALTH CHECK — Usado por Docker, Nginx, y CI/CD para verificar que el servidor está vivo
  // ============================================
  app.get("/api/health", async (_req, res) => {
    try {
      const { getDb } = await import("../db");
      const db = await getDb();
      const dbConnected = db !== null;

      res.json({
        status: "ok",
        version: APP_VERSION,
        uptime: Math.floor(process.uptime()),
        startedAt: startedAt.toISOString(),
        database: dbConnected ? "connected" : "disconnected",
        environment: process.env.NODE_ENV || "unknown",
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(503).json({
        status: "error",
        version: APP_VERSION,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });
  
  // File upload endpoint
  app.post("/api/upload-excel", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      res.json({ 
        success: true, 
        filePath: req.file.path,
        fileName: req.file.originalname
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // File upload endpoint for historical data (uses 'start' column for datetime)
  app.post("/api/upload-historical", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      res.json({ 
        success: true, 
        filePath: req.file.path,
        fileName: req.file.originalname,
        isHistorical: true
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Image proxy for Kobo images
  const { proxyKoboImage } = await import("../imageProxy");
  app.get("/api/image-proxy", proxyKoboImage);
  
  // WebODM tile proxy - orthofotos, DSM, DTM, NDVI, VARI
  const { proxyOdmTile, getOdmTaskBounds, getOdmAvailableLayers } = await import("../odmTileProxy");
  app.get("/api/odm-tiles/:projectId/:taskUuid/:type/:z/:x/:y", proxyOdmTile);
  app.get("/api/odm-bounds/:projectId/:taskUuid", getOdmTaskBounds);
  app.get("/api/odm-layers/:projectId/:taskUuid", getOdmAvailableLayers);
  
  // ============================================
  // SYNC PHOTO — Subida de fotos offline desde app móvil
  // Endpoint REST clásico porque tRPC no soporta multipart/form-data
  // ============================================
  app.post("/api/sync/photo", upload.single("photo"), async (req, res) => {
    try {
      // Verificar autenticación (Bearer token o cookie)
      const { getUserFromToken } = await import("../auth");
      let token = req.cookies?.auth_token;
      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
          token = authHeader.slice(7);
        }
      }
      if (!token) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const user = await getUserFromToken(token);
      if (!user) {
        return res.status(401).json({ error: "Token inválido o expirado" });
      }

      // Validar campos requeridos
      const { fieldNoteFolio, localPhotoId } = req.body;
      if (!fieldNoteFolio || !localPhotoId) {
        return res.status(400).json({ error: "fieldNoteFolio y localPhotoId son requeridos" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "No se recibió ninguna foto" });
      }

      // Verificar que la nota de campo existe
      const { getDb } = await import("../db");
      const { fieldNotes, fieldNotePhotos } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const drizzle = await getDb();
      if (!drizzle) {
        return res.status(503).json({ error: "Base de datos no disponible" });
      }
      
      const [note] = await drizzle.select({ id: fieldNotes.id })
        .from(fieldNotes)
        .where(eq(fieldNotes.folio, fieldNoteFolio))
        .limit(1);
      
      if (!note) {
        return res.status(404).json({ error: `Nota de campo con folio '${fieldNoteFolio}' no encontrada` });
      }

      // Guardar archivo en directorio permanente
      const fs = await import("fs");
      const pathModule = await import("path");
      const dir = `/app/photos/field-notes/${fieldNoteFolio}`;
      fs.mkdirSync(dir, { recursive: true });
      
      const ext = pathModule.extname(req.file.originalname) || ".jpg";
      const fileName = `mobile-${localPhotoId}${ext}`;
      const destPath = pathModule.join(dir, fileName);
      
      // Mover archivo de /tmp/uploads a destino final
      fs.copyFileSync(req.file.path, destPath);
      fs.unlinkSync(req.file.path); // Limpiar temporal
      
      const photoUrl = `/app/photos/field-notes/${fieldNoteFolio}/${fileName}`;
      
      // Upsert: si localPhotoId ya existe, actualizar ruta
      await drizzle.insert(fieldNotePhotos).values({
        fieldNoteId: note.id,
        localPhotoId: localPhotoId,
        photoPath: photoUrl,
        caption: "Foto desde app móvil",
        stage: "reporte" as any,
        uploadedByUserId: user.id,
      }).onDuplicateKeyUpdate({
        set: {
          photoPath: photoUrl,
          caption: "Foto desde app móvil",
        },
      });

      res.json({ success: true, photoUrl, fieldNoteFolio, localPhotoId });

      // Enviar foto al grupo de Telegram (fire-and-forget, no bloquea la respuesta)
      try {
        const { notifyGroupPhotoFromMobile } = await import("../telegramFieldNotesBot");
        await notifyGroupPhotoFromMobile(fieldNoteFolio, destPath);
      } catch (tgErr) {
        console.error("[SyncPhoto] Error notificando foto al grupo Telegram:", tgErr);
      }
    } catch (error: any) {
      console.error("[SyncPhoto] Error:", error);
      res.status(500).json({ error: error.message || "Error interno del servidor" });
    }
  });
  
  // Servir fotos estáticas desde /app/photos
  app.use("/app/photos", express.static("/app/photos"));

  // ============================================
  // MOBILE API — Parcelas activas para la app móvil
  // Endpoint REST porque la app usa Retrofit, no tRPC
  // ============================================
  app.get("/api/mobile/parcels", async (req, res) => {
    try {
      // Verificar autenticación (Bearer token o cookie)
      const { getUserFromToken } = await import("../auth");
      let token = req.cookies?.auth_token;
      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
          token = authHeader.slice(7);
        }
      }
      if (!token) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const user = await getUserFromToken(token);
      if (!user) {
        return res.status(401).json({ error: "Token inválido o expirado" });
      }

      const { getDb } = await import("../db");
      const { parcels } = await import("../../drizzle/schema");
      const { eq, and, isNotNull, ne } = await import("drizzle-orm");
      const drizzle = await getDb();
      if (!drizzle) {
        return res.status(503).json({ error: "Base de datos no disponible" });
      }

      // Solo parcelas activas CON polígono definido (no null, no vacío, no '[]')
      const result = await drizzle.select({
        id: parcels.id,
        code: parcels.code,
        name: parcels.name,
      })
        .from(parcels)
        .where(and(
          eq(parcels.isActive, true),
          isNotNull(parcels.polygon),
          ne(parcels.polygon, ""),
          ne(parcels.polygon, "[]"),
        ))
        .orderBy(parcels.name);

      res.json({ success: true, parcels: result });
    } catch (error: any) {
      console.error("[MobileAPI] Error fetching parcels:", error);
      res.status(500).json({ error: error.message || "Error interno del servidor" });
    }
  });
  
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`🚀 Server v${APP_VERSION} running on http://localhost:${port}/`);
    
    // Iniciar sincronización automática de KoboToolbox
    // Se ejecuta 2 veces al día: 7:00 AM y 6:00 PM hora del servidor
    import("../autoSync").then(({ startAutoSync }) => {
      startAutoSync([7, 18]);
    }).catch((err) => {
      console.error("Error al iniciar AutoSync:", err);
    });

    // Iniciar sincronización semanal de vuelos WebODM
    // Se ejecuta cada lunes a las 8:00 AM hora de México
    import("../odmAutoSync").then(({ startOdmAutoSync }) => {
      startOdmAutoSync();
    }).catch((err) => {
      console.error("Error al iniciar ODM AutoSync:", err);
    });

    // Iniciar notificador de resumen diario de cosecha
    // Envía resumen del día anterior a la hora configurada (NO al arrancar)
    import("../harvestNotifier").then(({ startHarvestNotifier }) => {
      startHarvestNotifier();
    }).catch((err) => {
      console.error("Error al iniciar HarvestNotifier:", err);
    });

    // Iniciar bot de Telegram para Notas de Campo
    // Escucha mensajes privados para crear notas y enviar notificaciones
    import("../telegramFieldNotesBot").then(({ startFieldNotesBot }) => {
      startFieldNotesBot();
    }).catch((err) => {
      console.error("Error al iniciar TelegramFieldNotesBot:", err);
    });
  });

  // ============================================
  // GRACEFUL SHUTDOWN — Permite a Docker cerrar el servidor limpiamente
  // durante rolling updates, sin cortar peticiones en vuelo
  // ============================================
  const shutdown = (signal: string) => {
    console.log(`\n🛑 ${signal} recibido. Cerrando servidor gracefully...`);
    
    // Dejar de aceptar nuevas conexiones
    server.close(() => {
      console.log("✅ Servidor HTTP cerrado limpiamente");
      process.exit(0);
    });

    // Si después de 15 segundos no cierra, forzar salida
    setTimeout(() => {
      console.error("⚠️ Forzando cierre después de 15s de timeout");
      process.exit(1);
    }, 15000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch(console.error);
