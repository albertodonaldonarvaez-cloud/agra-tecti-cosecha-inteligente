import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import cookieParser from "cookie-parser";
import multer from "multer";
import path from "path";
import sharp from "sharp";
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
      // Evitar path traversal: estos valores forman rutas de archivo
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(fieldNoteFolio)) || !/^[A-Za-z0-9_-]{1,64}$/.test(String(localPhotoId))) {
        return res.status(400).json({ error: "fieldNoteFolio o localPhotoId con formato inválido" });
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
      
      const fileName = `mobile-${localPhotoId}.jpg`;
      const destPath = pathModule.join(dir, fileName);
      
      // Comprimir y redimensionar la foto antes de guardar (max 1920px, JPEG 80%)
      try {
        const compressed = await sharp(req.file.path)
          .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        fs.writeFileSync(destPath, compressed);
      } catch (sharpErr) {
        // Fallback: copiar sin comprimir si sharp falla
        console.warn("[SyncPhoto] Sharp falló, copiando sin comprimir:", sharpErr);
        fs.copyFileSync(req.file.path, destPath);
      }
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
    } catch (error: any) {
      console.error("[SyncPhoto] Error:", error);
      res.status(500).json({ error: error.message || "Error interno del servidor" });
    }
  });
  
  // Servir fotos estáticas desde /app/photos con cache de 7 días
  app.use("/app/photos", express.static("/app/photos", {
    maxAge: "7d",
    immutable: true,
    etag: true,
  }));

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

  // Helper: usuario autenticado desde cookie o Bearer (para endpoints REST).
  // Anti-CSRF: si la autenticación viene por COOKIE (navegador) y el request
  // trae un header Origin de otro sitio, se rechaza — un formulario malicioso
  // en otra página no debe poder usar la sesión del admin (la cookie viaja
  // con sameSite none). El Bearer de la app no es vulnerable a CSRF.
  const getAuthUser = async (req: any) => {
    const { getUserFromToken } = await import("../auth");
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const cookieToken = req.cookies?.auth_token ?? null;
    const token = bearerToken || cookieToken;
    if (!token) return null;

    if (!bearerToken && cookieToken) {
      const origin = req.headers.origin as string | undefined;
      if (origin) {
        try {
          const originHost = new URL(origin).host;
          const reqHost = String(req.headers["x-forwarded-host"] || req.headers.host || "");
          if (originHost !== reqHost) {
            console.warn(`[REST] Bloqueado por Origin cruzado: ${origin} != ${reqHost}`);
            return null;
          }
        } catch {
          return null;
        }
      }
    }
    return getUserFromToken(token);
  };

  // IDs locales de la app (nombres de archivo): solo caracteres seguros
  const isSafeLocalId = (value: unknown): value is string =>
    typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);

  // ============================================
  // SYNC ACTIVITY PHOTO — Fotos de actividades de la libreta desde la app
  // Acepta varias fotos por actividad (varios ángulos); idempotente por localPhotoId
  // ============================================
  app.post("/api/sync/activity-photo", upload.single("photo"), async (req, res) => {
    try {
      const user = await getAuthUser(req);
      if (!user) return res.status(401).json({ error: "No autenticado" });

      const { activityClientUuid, localPhotoId, photoType } = req.body;
      if (!activityClientUuid || !localPhotoId) {
        return res.status(400).json({ error: "activityClientUuid y localPhotoId son requeridos" });
      }
      // Evitar path traversal: estos valores forman rutas de archivo
      if (!isSafeLocalId(activityClientUuid) || !isSafeLocalId(localPhotoId)) {
        return res.status(400).json({ error: "activityClientUuid o localPhotoId con formato inválido" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "No se recibió ninguna foto" });
      }

      const { getDb } = await import("../db");
      const { fieldActivities, fieldActivityPhotos } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const drizzle = await getDb();
      if (!drizzle) return res.status(503).json({ error: "Base de datos no disponible" });

      const [activity] = await drizzle.select({ id: fieldActivities.id })
        .from(fieldActivities)
        .where(eq(fieldActivities.clientUuid, activityClientUuid))
        .limit(1);
      if (!activity) {
        return res.status(404).json({ error: `Actividad '${activityClientUuid}' no encontrada (sincroniza la actividad antes que sus fotos)` });
      }

      const fs = await import("fs");
      const pathModule = await import("path");
      const dir = `/app/photos/field-activities/${activityClientUuid}`;
      fs.mkdirSync(dir, { recursive: true });
      const fileName = `mobile-${localPhotoId}.jpg`;
      const destPath = pathModule.join(dir, fileName);

      try {
        const compressed = await sharp(req.file.path)
          .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        fs.writeFileSync(destPath, compressed);
      } catch (sharpErr) {
        console.warn("[SyncActivityPhoto] Sharp falló, copiando sin comprimir:", sharpErr);
        fs.copyFileSync(req.file.path, destPath);
      }
      fs.unlinkSync(req.file.path);

      const photoUrl = `/app/photos/field-activities/${activityClientUuid}/${fileName}`;

      // Idempotente: si ya existe esa foto (mismo localPhotoId), solo actualizar ruta
      const [existing] = await drizzle.select({ id: fieldActivityPhotos.id })
        .from(fieldActivityPhotos)
        .where(and(
          eq(fieldActivityPhotos.activityId, activity.id),
          eq(fieldActivityPhotos.localPhotoId, localPhotoId),
        ))
        .limit(1);
      if (existing) {
        await drizzle.update(fieldActivityPhotos)
          .set({ photoUrl })
          .where(eq(fieldActivityPhotos.id, existing.id));
      } else {
        await drizzle.insert(fieldActivityPhotos).values({
          activityId: activity.id,
          photoType: (["antes", "despues", "durante", "producto", "otro"].includes(photoType) ? photoType : "durante") as any,
          photoUrl,
          caption: "Foto desde app móvil",
          localPhotoId,
          uploadedByUserId: user.id,
        });
      }

      res.json({ success: true, photoUrl, activityClientUuid, localPhotoId });
    } catch (error: any) {
      console.error("[SyncActivityPhoto] Error:", error);
      res.status(500).json({ error: error.message || "Error interno del servidor" });
    }
  });

  // ============================================
  // APP RELEASES — Distribución del APK y auto-actualización
  // ============================================
  // Multer dedicado para el APK (límite mayor) con errores en JSON
  const uploadApk = multer({ dest: "/tmp/uploads/", limits: { fileSize: 300 * 1024 * 1024 } });

  // Subir un APK nuevo (solo admin, multipart)
  app.post("/api/admin/app-release", (req, res, next) => {
    uploadApk.single("apk")(req, res, (err: any) => {
      if (err) {
        const msg = err?.code === "LIMIT_FILE_SIZE" ? "El APK supera el límite de 300MB" : (err.message || "Error subiendo archivo");
        return res.status(400).json({ error: msg });
      }
      next();
    });
  }, async (req, res) => {
    try {
      const user = await getAuthUser(req);
      if (!user || user.role !== "admin") return res.status(401).json({ error: "Solo administradores" });

      const versionCode = parseInt(req.body.versionCode, 10);
      // El versionName forma el nombre del archivo: solo caracteres seguros
      const versionName = String(req.body.versionName || "").trim().replace(/[^A-Za-z0-9._-]/g, "").slice(0, 32);
      if (!req.file) return res.status(400).json({ error: "No se recibió el APK" });
      if (!versionCode || !versionName) {
        return res.status(400).json({ error: "versionCode y versionName son requeridos" });
      }

      const { getDb } = await import("../db");
      const { appReleases } = await import("../../drizzle/schema");
      const drizzle = await getDb();
      if (!drizzle) return res.status(503).json({ error: "Base de datos no disponible" });

      const fs = await import("fs");
      const pathModule = await import("path");
      const dir = "/app/photos/app-releases";
      fs.mkdirSync(dir, { recursive: true });
      const fileName = `agra-field-v${versionName}-${versionCode}.apk`;
      const destPath = pathModule.join(dir, fileName);
      fs.copyFileSync(req.file.path, destPath);
      fs.unlinkSync(req.file.path);
      const fileSize = fs.statSync(destPath).size;

      await drizzle.insert(appReleases).values({
        versionCode,
        versionName,
        fileName,
        filePath: destPath,
        fileSize,
        notes: req.body.notes || null,
        uploadedByUserId: user.id,
      });

      res.json({ success: true, versionCode, versionName, fileName, fileSize });
    } catch (error: any) {
      console.error("[AppRelease] Error:", error);
      res.status(500).json({ error: error.message || "Error interno del servidor" });
    }
  });

  // Versión más reciente disponible (público: la app lo consulta al arrancar)
  app.get("/api/mobile/app-version", async (_req, res) => {
    try {
      const { getDb } = await import("../db");
      const { appReleases } = await import("../../drizzle/schema");
      const { desc } = await import("drizzle-orm");
      const drizzle = await getDb();
      if (!drizzle) return res.status(503).json({ error: "Base de datos no disponible" });

      const [latest] = await drizzle.select().from(appReleases)
        .orderBy(desc(appReleases.versionCode), desc(appReleases.id))
        .limit(1);
      if (!latest) return res.json({ success: true, available: false });

      res.json({
        success: true,
        available: true,
        versionCode: latest.versionCode,
        versionName: latest.versionName,
        notes: latest.notes,
        fileSize: latest.fileSize,
        downloadUrl: "/api/mobile/app-download",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error interno del servidor" });
    }
  });

  // Descargar el APK más reciente
  app.get("/api/mobile/app-download", async (_req, res) => {
    try {
      const { getDb } = await import("../db");
      const { appReleases } = await import("../../drizzle/schema");
      const { desc } = await import("drizzle-orm");
      const drizzle = await getDb();
      if (!drizzle) return res.status(503).json({ error: "Base de datos no disponible" });

      const [latest] = await drizzle.select().from(appReleases)
        .orderBy(desc(appReleases.versionCode), desc(appReleases.id))
        .limit(1);
      if (!latest) return res.status(404).json({ error: "No hay APK publicado" });

      const fs = await import("fs");
      if (!fs.existsSync(latest.filePath)) {
        return res.status(404).json({ error: "Archivo APK no encontrado en el servidor" });
      }

      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", `attachment; filename="${latest.fileName.replace(/[^A-Za-z0-9._-]/g, "")}"`);
      fs.createReadStream(latest.filePath).pipe(res);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error interno del servidor" });
    }
  });

  // ============================================
  // NDVI MAP — Imagen del cache satelital como imagen real (no base64 inline)
  // Evita mandar megabytes de base64 en el payload del dashboard
  // ============================================
  app.get("/api/parcel-ndvi-map/:parcelId", async (req, res) => {
    try {
      const user = await getAuthUser(req);
      if (!user) return res.status(401).json({ error: "No autenticado" });

      const parcelId = parseInt(req.params.parcelId, 10);
      if (!parcelId) return res.status(400).json({ error: "parcelId inválido" });

      const { getDb } = await import("../db");
      const { sql } = await import("drizzle-orm");
      const drizzle = await getDb();
      if (!drizzle) return res.status(503).json({ error: "Base de datos no disponible" });

      const rows: any = await drizzle.execute(
        sql`SELECT data FROM parcelSatelliteCache WHERE parcelId = ${parcelId} AND dataType = 'map' AND indexType = 'NDVI' ORDER BY fetchedAt DESC LIMIT 1`
      );
      const row = (rows as any)?.[0]?.[0] ?? (rows as any)?.rows?.[0];
      if (!row?.data) return res.status(404).json({ error: "Sin mapa NDVI cacheado" });

      // El cache guarda un data-URI ("data:image/png;base64,....")
      const match = String(row.data).match(/^data:(image\/[a-z+]+);base64,([\s\S]+)$/);
      if (!match) return res.status(404).json({ error: "Formato de cache no reconocido" });

      res.setHeader("Content-Type", match[1]);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(Buffer.from(match[2], "base64"));
    } catch (error: any) {
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

    // Iniciar generador del resumen semanal con IA
    // Genera el panorama de la semana pasada cada lunes (o al detectar semana faltante)
    import("../weeklySummaryService").then(({ startWeeklySummaryScheduler }) => {
      startWeeklySummaryScheduler();
    }).catch((err) => {
      console.error("Error al iniciar WeeklySummary:", err);
    });

    // Iniciar bot de Telegram para Notas de Campo
    // Escucha mensajes privados para crear notas y enviar notificaciones
    import("../telegramFieldNotesBot").then(({ startFieldNotesBot }) => {
      startFieldNotesBot();
    }).catch((err) => {
      console.error("Error al iniciar TelegramFieldNotesBot:", err);
    });

    // Sincronizar datos satelitales al iniciar (30s después para que la BD esté lista)
    // Luego se puede programar semanalmente desde Settings
    setTimeout(async () => {
      try {
        console.log("[Satellite Sync] Ejecutando sync inicial al arrancar...");
        const { getDb } = await import("../db");
        const { parcels, boxes } = await import("../../drizzle/schema");
        const { eq, sql } = await import("drizzle-orm");
        const drizzle = await getDb();
        if (!drizzle) { console.log("[Satellite Sync] DB no disponible, saltando sync inicial"); return; }

        // Verificar si hay credenciales de Copernicus
        const [apiCfg] = await drizzle.execute(sql`SELECT copernicusClientId, copernicusClientSecret FROM apiConfig LIMIT 1`);
        const cfg = apiCfg as any;
        if (!cfg?.copernicusClientId || !cfg?.copernicusClientSecret) {
          console.log("[Satellite Sync] Sin credenciales Copernicus, saltando sync inicial");
          return;
        }

        // Verificar si ya hay cache reciente (< 24h) para no re-sincronizar en cada restart rápido
        const [recentCache] = await drizzle.execute(
          sql`SELECT COUNT(*) as cnt FROM parcelSatelliteCache WHERE fetchedAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)`
        );
        if ((recentCache as any)?.cnt > 0) {
          console.log(`[Satellite Sync] Cache reciente encontrado (${(recentCache as any).cnt} registros < 24h), saltando sync`);
          return;
        }

        // Ejecutar sync
        const allParcels = await drizzle.select({ id: parcels.id, name: parcels.name, code: parcels.code, polygon: parcels.polygon }).from(parcels);
        const withPolygon = allParcels.filter((p: any) => p.polygon);
        console.log(`[Satellite Sync] Sincronizando ${withPolygon.length} parcelas...`);

        let updated = 0, errorCount = 0;
        const errorDetails: string[] = [];
        const indices: ("NDVI" | "NDRE" | "NDMI")[] = ["NDVI", "NDRE", "NDMI"];
        const { getIndexHistory, getIndexMapImage } = await import("../copernicusService");

        for (const parcel of withPolygon) {
          const parcelLabel = parcel.name || parcel.code || `ID:${parcel.id}`;
          let geoPolygon: any;
          try {
            const polyData = typeof parcel.polygon === "string" ? JSON.parse(parcel.polygon as string) : parcel.polygon;
            if (Array.isArray(polyData)) {
              const ring = polyData.map((p: any) => [p.lng || p.longitude || p[1], p.lat || p.latitude || p[0]]);
              if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push([...ring[0]]);
              geoPolygon = { type: "Polygon", coordinates: [ring] };
            } else if (polyData.type === "Polygon") { geoPolygon = polyData; }
            else { errorCount++; errorDetails.push(`${parcelLabel}: formato no reconocido`); continue; }
          } catch { errorCount++; errorDetails.push(`${parcelLabel}: error parseando polígono`); continue; }

          const to = new Date().toISOString().split("T")[0];
          let from: string;
          try {
            const [firstBox] = await drizzle.select({ submissionTime: boxes.submissionTime }).from(boxes).where(eq(boxes.parcelCode, parcel.code || "")).orderBy(boxes.submissionTime).limit(1);
            from = firstBox?.submissionTime ? new Date(firstBox.submissionTime).toISOString().split("T")[0] : new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0];
          } catch { from = new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0]; }

          for (const idx of indices) {
            try {
              const data = await getIndexHistory(geoPolygon, from, to, idx);
              await drizzle.execute(
                sql`INSERT INTO parcelSatelliteCache (parcelId, dataType, indexType, mapDate, data, fromDate, toDate, fetchedAt) VALUES (${parcel.id}, 'stats', ${idx}, NULL, ${JSON.stringify(data)}, ${from}, ${to}, NOW()) ON DUPLICATE KEY UPDATE data = VALUES(data), fromDate = VALUES(fromDate), toDate = VALUES(toDate), fetchedAt = NOW()`
              );
              const buffer = await getIndexMapImage(geoPolygon, idx);
              if (buffer) {
                const imageB64 = `data:image/png;base64,${buffer.toString("base64")}`;
                await drizzle.execute(
                  sql`INSERT INTO parcelSatelliteCache (parcelId, dataType, indexType, mapDate, data, fetchedAt) VALUES (${parcel.id}, 'map', ${idx}, 'latest', ${imageB64}, NOW()) ON DUPLICATE KEY UPDATE data = VALUES(data), fetchedAt = NOW()`
                );
              }
            } catch (e: any) { errorCount++; errorDetails.push(`${parcelLabel} (${idx}): ${e?.message?.substring(0, 80) || "error"}`); }
          }
          updated++;
        }

        console.log(`[Satellite Sync] Sync inicial completada: ${updated} parcelas, ${errorCount} errores`);

        // Notificar por Telegram al grupo de reportes
        try {
          const { getGlobalSetting } = await import("../globalSettings");
          const botToken = await getGlobalSetting("telegramBotToken");
          const chatId = await getGlobalSetting("telegramChatId");
          if (botToken && chatId) {
            const now = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
            let msg = `🛰️ *SYNC SATELITAL (AUTO)*\n\n✅ ${updated} parcelas procesadas\n📊 NDVI · NDRE · NDMI\n⏰ ${now}\n🔄 Al iniciar sistema`;
            if (errorCount > 0) {
              const errorList = errorDetails.slice(0, 20).map(e => `  • ${e}`).join("\n");
              msg += `\n\n⚠️ *${errorCount} errores:*\n${errorList}`;
              if (errorDetails.length > 20) msg += `\n  ... y ${errorDetails.length - 20} más`;
            }
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "Markdown" }),
            });
          }
        } catch {}
      } catch (err) {
        console.error("[Satellite Sync] Error en sync inicial:", err);
      }
    }, 30000); // 30 segundos después del arranque
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
