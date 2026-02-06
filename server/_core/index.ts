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
  
  // Servir fotos estáticas desde /app/photos
  app.use("/app/photos", express.static("/app/photos"));
  
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
    console.log(`Server running on http://localhost:${port}/`);
    
    // Iniciar sincronización automática de KoboToolbox
    // Se ejecuta 2 veces al día: 7:00 AM y 6:00 PM hora del servidor
    import("../autoSync").then(({ startAutoSync }) => {
      startAutoSync([7, 18]);
    }).catch((err) => {
      console.error("Error al iniciar AutoSync:", err);
    });
  });
}

startServer().catch(console.error);
