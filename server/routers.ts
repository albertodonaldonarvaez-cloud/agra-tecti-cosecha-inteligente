import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "./_core/trpcNew";
import { COOKIE_NAME } from "./_core/authContext";
import { loginUser, registerUser, hashPassword, comparePassword } from "./auth";
import * as db from "./db";
import * as dbExt from "./db_extended";
import * as webodm from "./webodmService";
import { getDb } from "./db";
import { users, boxes, harvesters, parcels, parcelDetails, parcelAiAnalysis, crops, cropVarieties, fieldActivities, fieldActivityParcels, fieldActivityProducts, fieldActivityTools, fieldActivityPhotos, warehouseSuppliers, warehouseProducts, warehouseTools, warehouseProductMovements, warehouseToolAssignments, fieldNotes, fieldNotePhotos, telegramLinkCodes, collaborators, collaboratorLinkCodes, fieldActivityAssignments, labelPrintHistory } from "../drizzle/schema";
import { eq, desc, and, gte, lte, inArray, sql } from "drizzle-orm";

export const appRouter = router({
  auth: router({
    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { user, token } = await loginUser(input.email, input.password);
        
        // Establecer cookie (30 días para sesiones móviles de larga duración)
        ctx.res.cookie(COOKIE_NAME, token, {
          httpOnly: true,
          secure: false, // Cambiar a true si usas HTTPS
          sameSite: "lax",
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
        });
        
        return { success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
      }),

    // Login para app móvil: retorna token en body (para Bearer auth)
    loginMobile: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string() }))
      .mutation(async ({ input }) => {
        const { user, token } = await loginUser(input.email, input.password);
        return {
          success: true,
          token,
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
        };
      }),
    
    me: publicProcedure.query(({ ctx }) => ctx.user),
    
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME);
      return { success: true };
    }),
  }),

  apiConfig: router({
    get: protectedProcedure.query(async () => {
      const config = await db.getApiConfig();
      return config || null;
    }),

    save: adminProcedure
      .input(
        z.object({
          apiUrl: z.string(),
          apiToken: z.string(),
          assetId: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        await db.upsertApiConfig(input);
        return { success: true };
      }),
  }),

  // ===== Copernicus CDSE (Telemetría Satelital) =====
  copernicus: router({
    getConfig: adminProcedure.query(async () => {
      const config = await db.getApiConfig();
      if (!config) return { clientId: "", hasSecret: false };
      return {
        clientId: (config as any).copernicusClientId || "",
        hasSecret: !!(config as any).copernicusClientSecret,
      };
    }),

    saveConfig: adminProcedure
      .input(z.object({
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });
        const { encryptSecret } = await import("./encryption");
        const encryptedSecret = encryptSecret(input.clientSecret);
        await drizzle.execute(
          sql`UPDATE apiConfig SET copernicusClientId = ${input.clientId}, copernicusClientSecret = ${encryptedSecret}`
        );
        return { success: true };
      }),

    testConnection: protectedProcedure.mutation(async () => {
      const { getAccessToken } = await import("./copernicusService");
      await getAccessToken();
      return { success: true, message: "Conexión exitosa con Copernicus CDSE" };
    }),

    // DeepSeek AI config
    getDeepSeekConfig: adminProcedure.query(async () => {
      const config = await db.getApiConfig();
      return { hasKey: !!(config as any)?.deepseekApiKey };
    }),

    saveDeepSeekConfig: adminProcedure
      .input(z.object({ apiKey: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { encryptSecret } = await import("./encryption");
        const encrypted = encryptSecret(input.apiKey);
        await drizzle.execute(sql`UPDATE apiConfig SET deepseekApiKey = ${encrypted}`);
        return { success: true };
      }),

    // Helper: parsear polígono de parcela a GeoJSON
    _parsePolygon: protectedProcedure
      .input(z.object({ parcelId: z.number() }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [parcel] = await drizzle.select({ polygon: parcels.polygon }).from(parcels).where(eq(parcels.id, input.parcelId));
        if (!parcel?.polygon) throw new TRPCError({ code: "BAD_REQUEST", message: "La parcela no tiene polígono definido" });
        const polyData = typeof parcel.polygon === "string" ? JSON.parse(parcel.polygon) : parcel.polygon;
        if (Array.isArray(polyData)) {
          const ring = polyData.map((p: any) => [p.lng || p.longitude || p[1], p.lat || p.latitude || p[0]]);
          if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push([...ring[0]]);
          return { type: "Polygon", coordinates: [ring] };
        } else if (polyData.type === "Polygon") {
          return polyData;
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: "Formato de polígono no reconocido" });
      }),

    /**
     * Histórico de índice espectral (NDVI, NDRE, NDMI).
     * Retorna serie de tiempo con mean/min/max/stDev.
     * Si no se especifica fromDate, usa la fecha de la primera cosecha de la parcela.
     */
    getIndexStats: protectedProcedure
      .input(z.object({
        parcelId: z.number(),
        indexType: z.enum(["NDVI", "NDRE", "NDMI"]).default("NDVI"),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // 1. Buscar en cache (< 7 días)
        try {
          const cached = await drizzle.execute(
            sql`SELECT data, fromDate, toDate, fetchedAt FROM parcelSatelliteCache WHERE parcelId = ${input.parcelId} AND dataType = 'stats' AND indexType = ${input.indexType} AND mapDate IS NULL ORDER BY fetchedAt DESC LIMIT 1`
          );
          const row = (cached as any)?.[0] || (cached as any)?.rows?.[0];
          if (row?.fetchedAt) {
            const age = Date.now() - new Date(row.fetchedAt).getTime();
            if (age < 7 * 24 * 60 * 60 * 1000) {
              console.log(`[Copernicus] Cache HIT stats ${input.indexType} parcela ${input.parcelId} (${Math.round(age / 3600000)}h)`);
              return { data: JSON.parse((cached as any).data), fromDate: (cached as any).fromDate, toDate: (cached as any).toDate, indexType: input.indexType, cached: true };
            }
          }
        } catch (e) { console.log("[Copernicus] Cache check error:", e); }

        // 2. No hay cache o es viejo -> llamar API
        const [parcel] = await drizzle.select({ polygon: parcels.polygon, code: parcels.code }).from(parcels).where(eq(parcels.id, input.parcelId));
        if (!parcel?.polygon) throw new TRPCError({ code: "BAD_REQUEST", message: "La parcela no tiene polígono definido" });

        let geoPolygon: any;
        try {
          const polyData = typeof parcel.polygon === "string" ? JSON.parse(parcel.polygon) : parcel.polygon;
          if (Array.isArray(polyData)) {
            const ring = polyData.map((p: any) => [p.lng || p.longitude || p[1], p.lat || p.latitude || p[0]]);
            if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push([...ring[0]]);
            geoPolygon = { type: "Polygon", coordinates: [ring] };
          } else if (polyData.type === "Polygon") {
            geoPolygon = polyData;
          } else {
            throw new Error("Formato no reconocido");
          }
        } catch (e) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Error al parsear el polígono" });
        }

        const to = input.toDate || new Date().toISOString().split("T")[0];

        let from = input.fromDate;
        if (!from && parcel.code) {
          try {
            const [firstBox] = await drizzle
              .select({ submissionTime: boxes.submissionTime })
              .from(boxes)
              .where(eq(boxes.parcelCode, parcel.code))
              .orderBy(boxes.submissionTime)
              .limit(1);
            if (firstBox?.submissionTime) {
              from = new Date(firstBox.submissionTime).toISOString().split("T")[0];
            }
          } catch (e) {
            console.log("[Copernicus] No se pudo obtener primera fecha de cosecha:", e);
          }
        }
        if (!from) {
          from = new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0];
        }

        const { getIndexHistory } = await import("./copernicusService");
        const data = await getIndexHistory(geoPolygon, from, to, input.indexType as any);

        // 3. Guardar en cache
        try {
          await drizzle.execute(
            sql`INSERT INTO parcelSatelliteCache (parcelId, dataType, indexType, mapDate, data, fromDate, toDate, fetchedAt) VALUES (${input.parcelId}, 'stats', ${input.indexType}, NULL, ${JSON.stringify(data)}, ${from}, ${to}, NOW()) ON DUPLICATE KEY UPDATE data = VALUES(data), fromDate = VALUES(fromDate), toDate = VALUES(toDate), fetchedAt = NOW()`
          );
          console.log(`[Copernicus] Cache SAVED stats ${input.indexType} parcela ${input.parcelId}`);
        } catch (e) { console.log("[Copernicus] Cache save error:", e); }

        return { data, fromDate: from, toDate: to, indexType: input.indexType, cached: false };
      }),

    // Backward compat: getNDVI → getIndexStats with NDVI
    getNDVI: protectedProcedure
      .input(z.object({
        parcelId: z.number(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [parcel] = await drizzle.select({ polygon: parcels.polygon }).from(parcels).where(eq(parcels.id, input.parcelId));
        if (!parcel?.polygon) throw new TRPCError({ code: "BAD_REQUEST", message: "La parcela no tiene polígono definido" });
        let geoPolygon: any;
        try {
          const polyData = typeof parcel.polygon === "string" ? JSON.parse(parcel.polygon) : parcel.polygon;
          if (Array.isArray(polyData)) {
            const ring = polyData.map((p: any) => [p.lng || p.longitude || p[1], p.lat || p.latitude || p[0]]);
            if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push([...ring[0]]);
            geoPolygon = { type: "Polygon", coordinates: [ring] };
          } else if (polyData.type === "Polygon") { geoPolygon = polyData; }
          else { throw new Error("Formato no reconocido"); }
        } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Error al parsear el polígono" }); }
        const to = input.toDate || new Date().toISOString().split("T")[0];
        const from = input.fromDate || new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0];
        const { getNDVIHistory } = await import("./copernicusService");
        const data = await getNDVIHistory(geoPolygon, from, to);
        return { data, fromDate: from, toDate: to };
      }),

    /**
     * Imagen True Color (RGB natural) de Sentinel-2.
     */
    getTrueColor: protectedProcedure
      .input(z.object({
        parcelId: z.number(),
        date: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [parcel] = await drizzle.select({ polygon: parcels.polygon }).from(parcels).where(eq(parcels.id, input.parcelId));
        if (!parcel?.polygon) throw new TRPCError({ code: "BAD_REQUEST", message: "La parcela no tiene polígono definido" });
        let geoPolygon: any;
        try {
          const polyData = typeof parcel.polygon === "string" ? JSON.parse(parcel.polygon) : parcel.polygon;
          if (Array.isArray(polyData)) {
            const ring = polyData.map((p: any) => [p.lng || p.longitude || p[1], p.lat || p.latitude || p[0]]);
            if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push([...ring[0]]);
            geoPolygon = { type: "Polygon", coordinates: [ring] };
          } else if (polyData.type === "Polygon") { geoPolygon = polyData; }
          else { throw new Error("Formato no reconocido"); }
        } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Error al parsear el polígono" }); }
        const { getTrueColorImage } = await import("./copernicusService");
        const buffer = await getTrueColorImage(geoPolygon, input.date);
        if (!buffer) return { image: null, message: "Sin imagen satelital disponible" };
        return { image: `data:image/png;base64,${buffer.toString("base64")}`, message: null };
      }),

    /**
     * Mapa coloreado de un índice espectral (NDVI/NDRE/NDMI).
     * PNG con ColorMapVisualizer, dataMask=0→transparente.
     */
    getIndexMap: protectedProcedure
      .input(z.object({
        parcelId: z.number(),
        indexType: z.enum(["NDVI", "NDRE", "NDMI"]).default("NDVI"),
        date: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const mapDateKey = input.date || "latest";

        // 1. Buscar en cache
        try {
          const [cached] = await drizzle.execute(
            sql`SELECT data, fetchedAt FROM parcelSatelliteCache WHERE parcelId = ${input.parcelId} AND dataType = 'map' AND indexType = ${input.indexType} AND mapDate = ${mapDateKey} ORDER BY fetchedAt DESC LIMIT 1`
          );
          if (cached && (cached as any).fetchedAt) {
            const age = Date.now() - new Date((cached as any).fetchedAt).getTime();
            if (age < 7 * 24 * 60 * 60 * 1000) {
              console.log(`[Copernicus] Cache HIT map ${input.indexType} parcela ${input.parcelId} (${Math.round(age / 3600000)}h)`);
              return { image: (cached as any).data, message: null, cached: true };
            }
          }
        } catch (e) { console.log("[Copernicus] Cache check error:", e); }

        // 2. No hay cache -> llamar API
        const [parcel] = await drizzle.select({ polygon: parcels.polygon }).from(parcels).where(eq(parcels.id, input.parcelId));
        if (!parcel?.polygon) throw new TRPCError({ code: "BAD_REQUEST", message: "La parcela no tiene polígono definido" });
        let geoPolygon: any;
        try {
          const polyData = typeof parcel.polygon === "string" ? JSON.parse(parcel.polygon) : parcel.polygon;
          if (Array.isArray(polyData)) {
            const ring = polyData.map((p: any) => [p.lng || p.longitude || p[1], p.lat || p.latitude || p[0]]);
            if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push([...ring[0]]);
            geoPolygon = { type: "Polygon", coordinates: [ring] };
          } else if (polyData.type === "Polygon") { geoPolygon = polyData; }
          else { throw new Error("Formato no reconocido"); }
        } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Error al parsear el polígono" }); }
        const { getIndexMapImage } = await import("./copernicusService");
        const buffer = await getIndexMapImage(geoPolygon, input.indexType as any, input.date);
        if (!buffer) return { image: null, message: `Sin mapa ${input.indexType} disponible` };
        const imageB64 = `data:image/png;base64,${buffer.toString("base64")}`;

        // 3. Guardar en cache
        try {
          await drizzle.execute(
            sql`INSERT INTO parcelSatelliteCache (parcelId, dataType, indexType, mapDate, data, fetchedAt) VALUES (${input.parcelId}, 'map', ${input.indexType}, ${mapDateKey}, ${imageB64}, NOW()) ON DUPLICATE KEY UPDATE data = VALUES(data), fetchedAt = NOW()`
          );
          console.log(`[Copernicus] Cache SAVED map ${input.indexType} parcela ${input.parcelId}`);
        } catch (e) { console.log("[Copernicus] Cache save error:", e); }

        return { image: imageB64, message: null, cached: false };
      }),

    // Backward compat: getNDVIMap
    getNDVIMap: protectedProcedure
      .input(z.object({ parcelId: z.number(), date: z.string().optional() }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [parcel] = await drizzle.select({ polygon: parcels.polygon }).from(parcels).where(eq(parcels.id, input.parcelId));
        if (!parcel?.polygon) throw new TRPCError({ code: "BAD_REQUEST", message: "La parcela no tiene polígono" });
        let geoPolygon: any;
        try {
          const polyData = typeof parcel.polygon === "string" ? JSON.parse(parcel.polygon) : parcel.polygon;
          if (Array.isArray(polyData)) {
            const ring = polyData.map((p: any) => [p.lng || p.longitude || p[1], p.lat || p.latitude || p[0]]);
            if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push([...ring[0]]);
            geoPolygon = { type: "Polygon", coordinates: [ring] };
          } else if (polyData.type === "Polygon") { geoPolygon = polyData; }
          else { throw new Error("Formato no reconocido"); }
        } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Error al parsear el polígono" }); }
        const { getNDVIMapImage } = await import("./copernicusService");
        const buffer = await getNDVIMapImage(geoPolygon, input.date);
        if (!buffer) return { image: null, message: "Sin mapa NDVI disponible" };
        return { image: `data:image/png;base64,${buffer.toString("base64")}`, message: null };
      }),

    // Analisis IA con cache en BD
    getAIAnalysis: protectedProcedure
      .input(z.object({
        parcelId: z.number(),
        parcelName: z.string(),
        ndviData: z.array(z.any()).optional(),
        ndreData: z.array(z.any()).optional(),
        ndmiData: z.array(z.any()).optional(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        forceRefresh: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const from = input.fromDate || "";
        const to = input.toDate || new Date().toISOString().split("T")[0];

        // Buscar analisis cacheado (menos de 7 dias de antiguedad)
        if (!input.forceRefresh) {
          const [cached] = await drizzle
            .select()
            .from(parcelAiAnalysis)
            .where(eq(parcelAiAnalysis.parcelId, input.parcelId))
            .orderBy(sql`createdAt DESC`)
            .limit(1);
          if (cached) {
            const ageMs = Date.now() - new Date(cached.createdAt).getTime();
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            if (ageMs < sevenDays && cached.fromDate === from && cached.toDate === to) {
              return { analysis: cached.analysis, model: cached.model, cached: true, cachedAt: cached.createdAt };
            }
          }
        }

        // Generar nuevo analisis
        const { getGlobalSetting } = await import("./globalSettings");
        let apiKey = await getGlobalSetting("deepseekApiKey");
        if (!apiKey) throw new TRPCError({ code: "BAD_REQUEST", message: "No se ha configurado la API Key de IA en Configuraciones" });

        try {
          const { decryptSecret, isEncrypted } = await import("./encryption");
          if (isEncrypted(apiKey)) apiKey = decryptSecret(apiKey);
        } catch (e) {
          console.error("[IA] Error desencriptando API key:", e);
        }

        const formatData = (data: any[] | undefined, label: string) => {
          if (!data?.length) return `${label}: Sin datos`;
          return `${label} (${data.length} muestras, ${data[0].date} a ${data[data.length-1].date}):\n` +
            data.map((d: any) => `  ${d.date}: media=${d.mean?.toFixed(3)}, min=${d.min?.toFixed(3)}, max=${d.max?.toFixed(3)}`).join("\n");
        };

        // Buscar datos de cosecha de la parcela
        let harvestInfo = "";
        try {
          const [parcelRow] = await drizzle.select({ code: parcels.code }).from(parcels).where(eq(parcels.id, input.parcelId));
          const parcelCode = parcelRow?.code || "";
          if (parcelCode) {
            const harvestData = await drizzle
              .select({ weight: boxes.weight, submissionTime: boxes.submissionTime })
              .from(boxes)
              .where(eq(boxes.parcelCode, parcelCode))
              .orderBy(boxes.submissionTime);
            if (harvestData.length > 0) {
              const weeklyMap: Record<string, { totalKg: number; count: number }> = {};
              for (const h of harvestData) {
                const d = new Date(h.submissionTime);
                const weekStart = new Date(d);
                weekStart.setDate(d.getDate() - d.getDay());
                const weekKey = weekStart.toISOString().split("T")[0];
                if (!weeklyMap[weekKey]) weeklyMap[weekKey] = { totalKg: 0, count: 0 };
                weeklyMap[weekKey].totalKg += (h.weight || 0) / 1000;
                weeklyMap[weekKey].count++;
              }
              const firstDate = new Date(harvestData[0].submissionTime).toLocaleDateString("es-MX");
              const lastDate = new Date(harvestData[harvestData.length - 1].submissionTime).toLocaleDateString("es-MX");
              const totalKg = harvestData.reduce((s, h) => s + (h.weight || 0), 0) / 1000;
              const totalBoxes = harvestData.length;
              const weeks = Object.entries(weeklyMap).sort(([a], [b]) => a.localeCompare(b));
              const weeklyStr = weeks.map(([w, d]) => `  Semana ${w}: ${d.totalKg.toFixed(1)} kg (${d.count} cajas)`).join("\n");
              harvestInfo = `\n\nDatos de cosecha (${firstDate} a ${lastDate}):\nTotal: ${totalKg.toFixed(1)} kg en ${totalBoxes} cajas\nDesglose semanal:\n${weeklyStr}`;
            }
          }
        } catch (e) {
          console.log("[IA] No se pudo obtener datos de cosecha:", e);
        }

        // Buscar info del cultivo y variedad de la parcela
        let cropInfo = "";
        try {
          const [details] = await drizzle.select().from(parcelDetails).where(eq(parcelDetails.parcelId, input.parcelId));
          if (details) {
            let cropName = "", varietyName = "";
            if (details.cropId) {
              const [crop] = await drizzle.select({ name: crops.name }).from(crops).where(eq(crops.id, details.cropId));
              cropName = crop?.name || "";
            }
            if (details.varietyId) {
              const [variety] = await drizzle.select({ name: cropVarieties.name }).from(cropVarieties).where(eq(cropVarieties.id, details.varietyId));
              varietyName = variety?.name || "";
            }
            const parts = [];
            if (cropName) parts.push(`Cultivo: ${cropName}`);
            if (varietyName) parts.push(`Variedad: ${varietyName}`);
            if (details.totalHectares) parts.push(`Superficie: ${details.totalHectares} ha`);
            if (details.totalTrees) parts.push(`Arboles: ${details.totalTrees}`);
            if (details.productiveTrees) parts.push(`Productivos: ${details.productiveTrees}`);
            if (details.establishedAt) parts.push(`Establecida: ${details.establishedAt}`);
            if (parts.length) cropInfo = `\nInformacion de la parcela: ${parts.join(" | ")}`;
          }
        } catch (e) {
          console.log("[IA] No se pudo obtener info del cultivo:", e);
        }

        const prompt = `Eres un ingeniero agronomo experto en agricultura de precision y teledeteccion con 20 anos de experiencia. Analiza los siguientes datos de la parcela "${input.parcelName}" y genera un resumen ejecutivo de 6-7 lineas maximo. Tu analisis debe correlacionar los indices espectrales con los datos reales de produccion (cosecha) para dar una perspectiva REALISTA de como se fue desarrollando la parcela durante la temporada.${cropInfo}${harvestInfo}

Datos espectrales (periodo: ${from || "N/A"} a ${to || "N/A"}):

${formatData(input.ndviData, "NDVI (Vigor Vegetativo)")}

${formatData(input.ndreData, "NDRE (Nitrogeno/Clorofila)")}

${formatData(input.ndmiData, "NDMI (Estres Hidrico)")}

IMPORTANTE:
- Correlaciona indices espectrales con produccion real: cuando subio/bajo el NDVI que paso con la cosecha?
- Considera el tipo de cultivo y variedad para contextualizar rangos optimos
- Resume tendencias principales y su impacto directo en kg producidos
- Identifica alertas criticas: caidas de NDVI + baja produccion = problema real
- Da 1-2 recomendaciones practicas para la proxima temporada
- MAXIMO 6-7 renglones, tono profesional de ingeniero agronomo
- Responde en espanol`;

        try {
          const response = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: "deepseek-v4-flash",
              messages: [{ role: "system", content: "Eres un ingeniero agronomo senior especializado en agricultura de precision, teledeteccion satelital y manejo integrado de cultivos. Respondes de forma concisa y profesional." }, { role: "user", content: prompt }],
              max_tokens: 800,
              temperature: 0.4,
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            console.error("[IA] Error:", response.status, errText);
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Error de API IA: ${response.status}` });
          }

          const result = await response.json();
          const analysis = result.choices?.[0]?.message?.content || "Sin respuesta del modelo";
          const model = result.model || "deepseek-v4-flash";

          // Guardar en cache
          await drizzle.insert(parcelAiAnalysis).values({
            parcelId: input.parcelId,
            analysis,
            fromDate: from,
            toDate: to,
            model,
          });
          return { analysis, model, cached: false };
        } catch (err: any) {
          if (err.code === "BAD_REQUEST" || err.code === "INTERNAL_SERVER_ERROR") throw err;
          console.error("[IA] Fetch error:", err);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error conectando con API de IA" });
        }
      }),

    // Sincronización semanal de datos satelitales para todas las parcelas
    syncAllParcels: adminProcedure.mutation(async () => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const allParcels = await drizzle.select({ id: parcels.id, name: parcels.name, code: parcels.code, polygon: parcels.polygon }).from(parcels);
      const withPolygon = allParcels.filter((p: any) => p.polygon);
      console.log(`[Satellite Sync] Iniciando sync de ${withPolygon.length} parcelas...`);

      let updated = 0;
      let errorCount = 0;
      const errorDetails: string[] = [];
      const indices: ("NDVI" | "NDRE" | "NDMI")[] = ["NDVI", "NDRE", "NDMI"];

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
          else { errorCount++; errorDetails.push(`${parcelLabel}: polígono formato no reconocido`); continue; }
        } catch (e: any) { errorCount++; errorDetails.push(`${parcelLabel}: error parseando polígono`); continue; }

        const to = new Date().toISOString().split("T")[0];
        let from: string;
        try {
          const [firstBox] = await drizzle.select({ submissionTime: boxes.submissionTime }).from(boxes).where(eq(boxes.parcelCode, parcel.code || "")).orderBy(boxes.submissionTime).limit(1);
          from = firstBox?.submissionTime ? new Date(firstBox.submissionTime).toISOString().split("T")[0] : new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0];
        } catch { from = new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0]; }

        const { getIndexHistory, getIndexMapImage } = await import("./copernicusService");

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
            console.log(`[Satellite Sync] ✓ ${parcelLabel} - ${idx}`);
          } catch (e: any) {
            const reason = e?.message?.substring(0, 80) || "error desconocido";
            console.error(`[Satellite Sync] ✗ ${parcelLabel} - ${idx}:`, reason);
            errorCount++;
            errorDetails.push(`${parcelLabel} (${idx}): ${reason}`);
          }
        }
        updated++;
      }

      // Notificar por Telegram al grupo de reportes (telegramChatId)
      try {
        const { getGlobalSetting } = await import("./globalSettings");
        const botToken = await getGlobalSetting("telegramBotToken");
        const chatId = await getGlobalSetting("telegramChatId");
        if (botToken && chatId) {
          const now = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
          const nextSync = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", year: "numeric" });
          let msg = `🛰️ *SINCRONIZACIÓN SATELITAL*\n\n✅ ${updated} parcelas procesadas\n📊 NDVI · NDRE · NDMI\n⏰ ${now}\n📅 Próxima sync: ${nextSync}`;
          if (errorCount > 0) {
            const errorList = errorDetails.slice(0, 20).map(e => `  • ${e}`).join("\n");
            msg += `\n\n⚠️ *${errorCount} errores:*\n${errorList}`;
            if (errorDetails.length > 20) msg += `\n  ... y ${errorDetails.length - 20} más`;
          }
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "Markdown" }),
          });
          console.log(`[Satellite Sync] Telegram notificado`);
        }
      } catch (e) { console.error("[Satellite Sync] Error Telegram:", e); }

      console.log(`[Satellite Sync] Completado: ${updated} parcelas, ${errorCount} errores`);
      return { updated, errors: errorCount, errorDetails, total: withPolygon.length };
    }),
  }),

  // Sincronización automática
  autoSync: router({
    status: adminProcedure.query(async () => {
      const { getAutoSyncStatus } = await import("./autoSync");
      return getAutoSyncStatus();
    }),

    trigger: adminProcedure.mutation(async () => {
      const { triggerManualSync } = await import("./autoSync");
      return await triggerManualSync();
    }),

    updateHours: adminProcedure
      .input(z.object({ hours: z.array(z.number().min(0).max(23)) }))
      .mutation(async ({ input }) => {
        const { updateSyncHours, startAutoSync } = await import("./autoSync");
        updateSyncHours(input.hours);
        // Reiniciar el scheduler con los nuevos horarios
        startAutoSync(input.hours);
        return { success: true, hours: input.hours };
      }),
  }),

  // Telegram
  telegram: router({
    getConfig: adminProcedure.query(async () => {
      const config = await db.getApiConfig();
      if (!config) return { botToken: "", chatId: "" };
      return {
        botToken: (config as any).telegramBotToken || "",
        chatId: (config as any).telegramChatId || "",
      };
    }),

    saveConfig: adminProcedure
      .input(z.object({ botToken: z.string(), chatId: z.string() }))
      .mutation(async ({ input }) => {
        const { sql } = await import("drizzle-orm");
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        await database.execute(
          sql`UPDATE apiConfig SET telegramBotToken = ${input.botToken}, telegramChatId = ${input.chatId}`
        );
        return { success: true };
      }),

    test: adminProcedure
      .input(z.object({ botToken: z.string(), chatId: z.string() }))
      .mutation(async ({ input }) => {
        const { sendTestMessage } = await import("./telegramBot");
        return await sendTestMessage(input.botToken, input.chatId);
      }),

    // Configuración del resumen diario de cosecha
    getHarvestConfig: adminProcedure.query(async () => {
      const config = await db.getApiConfig();
      if (!config) return { chatId: "", hour: 7, minute: 0, enabled: false };
      return {
        chatId: (config as any).telegramHarvestChatId || "",
        hour: (config as any).telegramHarvestHour ?? 7,
        minute: (config as any).telegramHarvestMinute ?? 0,
        enabled: Boolean((config as any).telegramHarvestEnabled),
      };
    }),

    saveHarvestConfig: adminProcedure
      .input(z.object({
        chatId: z.string(),
        hour: z.number().min(0).max(23),
        minute: z.number().min(0).max(59),
        enabled: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        const { sql } = await import("drizzle-orm");
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        await database.execute(
          sql`UPDATE apiConfig SET telegramHarvestChatId = ${input.chatId}, telegramHarvestHour = ${input.hour}, telegramHarvestMinute = ${input.minute}, telegramHarvestEnabled = ${input.enabled ? 1 : 0}`
        );
        return { success: true };
      }),

    testHarvest: adminProcedure
      .input(z.object({ botToken: z.string(), chatId: z.string() }))
      .mutation(async ({ input }) => {
        const { sendHarvestTestMessage } = await import("./harvestNotifier");
        return await sendHarvestTestMessage(input.botToken, input.chatId);
      }),

    // Configuración del grupo de notificaciones de notas de campo
    getFieldNotesConfig: adminProcedure.query(async () => {
      const config = await db.getApiConfig();
      if (!config) return { chatId: "", enabled: false };
      return {
        chatId: config.telegramFieldNotesChatId || "",
        enabled: Boolean(config.telegramFieldNotesEnabled),
      };
    }),

    saveFieldNotesConfig: adminProcedure
      .input(z.object({
        chatId: z.string(),
        enabled: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        const { sql } = await import("drizzle-orm");
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        await database.execute(
          sql`UPDATE apiConfig SET telegramFieldNotesChatId = ${input.chatId}, telegramFieldNotesEnabled = ${input.enabled ? 1 : 0}`
        );
        return { success: true };
      }),

    testFieldNotes: adminProcedure
      .input(z.object({ botToken: z.string(), chatId: z.string() }))
      .mutation(async ({ input }) => {
        try {
          const response = await fetch(`https://api.telegram.org/bot${input.botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: input.chatId,
              text: "\u2705 <b>Prueba de Notas de Campo</b>\n\nEste grupo recibirá notificaciones de nuevas notas de campo y actualizaciones de estado.",
              parse_mode: "HTML",
            }),
          });
          const data = await response.json();
          if (data.ok) return { success: true };
          return { success: false, error: data.description || "Error desconocido" };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      }),
  }),

  boxes: router({
    list: protectedProcedure.query(async () => {
      return await db.getAllBoxes();
    }),

    // Estadísticas agregadas para Dashboard (no descarga todas las cajas)
    dashboardStats: protectedProcedure.query(async () => {
      return await db.getDashboardStats();
    }),

    // Datos diarios agregados para gráfica de evolución
    dailyChartData: protectedProcedure
      .input(z.object({ month: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return await db.getDailyChartData(input?.month);
      }),

    // Meses disponibles con datos de cosecha
    availableMonths: protectedProcedure.query(async () => {
      return await db.getAvailableMonths();
    }),

    // Datos de cosecha agrupados por día (para correlación clima-cosecha)
    harvestByDay: protectedProcedure.query(async () => {
      return await db.getHarvestByDay();
    }),

    // Fecha de inicio de cosecha
    harvestStartDate: protectedProcedure.query(async () => {
      return await db.getHarvestStartDate();
    }),

    // Últimas cajas con fotos (para carrusel)
    recentWithPhotos: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(20).default(5) }).optional())
      .query(async ({ input }) => {
        return await db.getRecentBoxesWithPhotos(input?.limit);
      }),

    // Endpoint paginado para carga rápida
    listPaginated: protectedProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(10).max(100).default(50),
        filterDate: z.string().optional(),
        filterParcel: z.string().optional(),
        filterHarvester: z.number().optional(),
        search: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getBoxesPaginated(input);
      }),

    // Opciones de filtro (carga rápida)
    filterOptions: protectedProcedure.query(async () => {
      return await db.getBoxFilterOptions();
    }),

    // Obtener códigos de caja duplicados
    duplicateCodes: protectedProcedure.query(async () => {
      return await db.getDuplicateBoxCodes();
    }),

    // Obtener parcelas sin polígono
    parcelsWithoutPolygon: protectedProcedure.query(async () => {
      return await db.getParcelsWithoutPolygon();
    }),

    // Obtener parcelas con polígono (para selector)
    parcelsWithPolygon: protectedProcedure.query(async () => {
      return await db.getParcelsWithPolygon();
    }),

    // Endpoint para editor de cajas con filtros de errores
    listForEditor: adminProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(10).max(100).default(50),
        search: z.string().optional(),
        filterError: z.enum(['all', 'duplicates', 'no_polygon', 'overweight']).optional(),
        sortBy: z.enum(['boxCode', 'parcelCode', 'parcelName', 'harvesterId', 'weight', 'submissionTime']).optional(),
        sortOrder: z.enum(['asc', 'desc']).optional(),
      }))
      .query(async ({ input }) => {
        // Obtener listas de errores
        const duplicateCodes = await db.getDuplicateBoxCodes();
        const parcelsWithoutPolygon = await db.getParcelsWithoutPolygon();
        
        const result = await db.getBoxesForEditor({
          ...input,
          duplicateCodes,
          parcelsWithoutPolygon,
        });
        
        return {
          ...result,
          duplicateCodes,
          parcelsWithoutPolygon,
        };
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getBoxById(input.id);
      }),

    sync: adminProcedure
      .input(z.object({ date: z.string().optional() }).optional())
      .mutation(async ({ input }) => {
        const { syncFromKoboAPI } = await import("./koboSync");
        const config = await db.getApiConfig();
        
        if (!config || !config.apiUrl || !config.apiToken || !config.assetId) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "Configuración de API incompleta. Por favor configura la API primero." 
          });
        }

        // Ejecutar sincronización en segundo plano (no esperar)
        setImmediate(async () => {
          try {
            console.log('🔄 Iniciando sincronización en segundo plano...');
            const result = await syncFromKoboAPI(
              config.apiUrl, 
              config.apiToken, 
              config.assetId,
              input?.date
            );
            await db.updateLastSync();
            console.log('✅ Sincronización completada:', result);
            
            // Enviar notificación por Telegram
            try {
              const { sendSyncNotification } = await import("./telegramBot");
              await sendSyncNotification({
                trigger: "manual",
                processedCount: result.processedCount,
                totalCount: result.totalCount,
                errors: result.errors || [],
                autoResolveResult: result.autoResolveResult || null,
              });
            } catch (telegramError) {
              console.error("Error al enviar notificación Telegram:", telegramError);
            }
          } catch (error) {
            console.error('❌ Error en sincronización:', error);
            
            // Notificar error por Telegram
            try {
              const { sendSyncNotification } = await import("./telegramBot");
              await sendSyncNotification({
                trigger: "manual",
                processedCount: 0,
                totalCount: 0,
                errors: [`Error de sincronización: ${(error as any).message || error}`],
              });
            } catch (telegramError) {
              console.error("Error al enviar notificación Telegram:", telegramError);
            }
          }
        });
        
        // Devolver inmediatamente
        return { 
          message: "Sincronización iniciada en segundo plano",
          status: "started"
        };
      }),

    uploadExcel: adminProcedure
      .input(z.object({ 
        filePath: z.string(),
        fileName: z.string(),
        downloadPhotos: z.boolean().optional().default(true)
      }))
      .mutation(async ({ input, ctx }) => {
        const { processExcelFile } = await import("./excelProcessor");
        const config = await db.getApiConfig();
        
        if (!config || !config.apiUrl || !config.apiToken || !config.assetId) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "Configuración de API incompleta. Por favor configura la API primero." 
          });
        }

        const result = await processExcelFile(
          input.filePath,
          input.fileName,
          ctx.user.id,
          config,
          input.downloadPhotos
        );
        
        return result;
      }),

    // Endpoint para importar datos históricos con hora exacta desde columna 'start'
    uploadHistorical: adminProcedure
      .input(z.object({ 
        filePath: z.string(),
        fileName: z.string(),
        downloadPhotos: z.boolean().optional().default(false)
      }))
      .mutation(async ({ input, ctx }) => {
        const { processHistoricalExcelFile } = await import("./historicalDataSync");
        const config = await db.getApiConfig();
        
        const result = await processHistoricalExcelFile(
          input.filePath,
          input.fileName,
          ctx.user.id,
          config || { apiUrl: '', apiToken: '', assetId: '' },
          input.downloadPhotos
        );
        
        return result;
      }),

    uploadJson: adminProcedure
      .input(z.object({ jsonData: z.any() }))
      .mutation(async ({ input }) => {
        const { processKoboData } = await import("./koboSync");
        const result = await processKoboData(input.jsonData);
        await db.updateLastSync();
        return result;
      }),

    clearAll: adminProcedure
      .mutation(async () => {
        await db.clearAllBoxes();
        return { success: true, message: "Todas las cajas han sido eliminadas" };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        boxCode: z.string(),
        harvesterId: z.number(),
        parcelCode: z.string(),
        parcelName: z.string(),
        weight: z.number(),
        submissionTime: z.string(),
      }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        // Obtener la caja actual para guardar el código original si aún no se ha editado
        const currentBox = await database.select().from(boxes).where(eq(boxes.id, input.id)).limit(1);
        const originalCode = currentBox[0]?.originalBoxCode || currentBox[0]?.boxCode || null;
        
        await database.update(boxes)
          .set({
            boxCode: input.boxCode,
            harvesterId: input.harvesterId,
            parcelCode: input.parcelCode,
            parcelName: input.parcelName,
            weight: input.weight,
            submissionTime: new Date(input.submissionTime),
            manuallyEdited: true,
            editedAt: new Date(),
            originalBoxCode: originalCode,
            updatedAt: new Date(),
          })
          .where(eq(boxes.id, input.id));
        
        return { success: true };
      }),

    // Actualizar parcela en lote
    updateParcelBatch: adminProcedure
      .input(z.object({
        boxIds: z.array(z.number()),
        parcelCode: z.string(),
        parcelName: z.string(),
      }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        const { inArray } = await import("drizzle-orm");
        
        await database.update(boxes)
          .set({
            parcelCode: input.parcelCode,
            parcelName: input.parcelName,
            manuallyEdited: true,
            editedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(inArray(boxes.id, input.boxIds));
        
        return { success: true, updated: input.boxIds.length };
      }),

    // Actualizar cortadora en lote
    updateHarvesterBatch: adminProcedure
      .input(z.object({
        boxIds: z.array(z.number()),
        harvesterId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        const { inArray } = await import("drizzle-orm");
        
        await database.update(boxes)
          .set({
            harvesterId: input.harvesterId,
            manuallyEdited: true,
            editedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(inArray(boxes.id, input.boxIds));
        
        return { success: true, updated: input.boxIds.length };
      }),

    // Eliminar cajas en lote
    deleteBatch: adminProcedure
      .input(z.object({
        boxIds: z.array(z.number()),
      }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        const { inArray } = await import("drizzle-orm");
        
        await database.delete(boxes).where(inArray(boxes.id, input.boxIds));
        
        return { success: true, deleted: input.boxIds.length };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        await database.delete(boxes).where(eq(boxes.id, input.id));
        return { success: true };
      }),

    // Archivar una caja (en lugar de eliminar)
    archive: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.archiveBox(input.id);
        return { success: true };
      }),

    // Archivar múltiples cajas
    archiveBatch: adminProcedure
      .input(z.object({
        boxIds: z.array(z.number()),
      }))
      .mutation(async ({ input }) => {
        const result = await db.archiveBoxesBatch(input.boxIds);
        return { success: true, archived: result.archived };
      }),

    // Restaurar una caja archivada
    restore: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.restoreBox(input.id);
        return { success: true };
      }),

    // Obtener cajas archivadas
    listArchived: adminProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(10).max(100).default(50),
        search: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getArchivedBoxes(input);
      }),

    // Actualizar código de caja
    updateCode: adminProcedure
      .input(z.object({
        id: z.number(),
        boxCode: z.string(),
      }))
      .mutation(async ({ input }) => {
        await db.updateBoxCode(input.id, input.boxCode);
        return { success: true };
      }),

    // Auto-resolver duplicados
    autoResolveDuplicates: adminProcedure
      .mutation(async () => {
        const result = await db.autoResolveDuplicates();
        return result;
      }),

    // Restaurar múltiples cajas archivadas
    restoreBatch: adminProcedure
      .input(z.object({
        boxIds: z.array(z.number()),
      }))
      .mutation(async ({ input }) => {
        const database = await getDb();
        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        const { inArray } = await import("drizzle-orm");
        
        await database.update(boxes).set({
          archived: false,
          archivedAt: null,
          updatedAt: new Date(),
        }).where(inArray(boxes.id, input.boxIds));
        
        return { success: true, restored: input.boxIds.length };
      }),
  }),

  parcels: router({
    list: protectedProcedure.query(async () => {
      return await dbExt.getAllParcels();
    }),

    listActive: protectedProcedure.query(async () => {
      return await dbExt.getActiveParcels();
    }),

    getByCode: protectedProcedure
      .input(z.object({ code: z.string() }))
      .query(async ({ input }) => {
        return await dbExt.getParcelByCode(input.code);
      }),

    create: adminProcedure
      .input(z.object({
        code: z.string(),
        name: z.string(),
        polygon: z.string().optional(),
        isActive: z.boolean().optional().default(true),
      }))
      .mutation(async ({ input }) => {
        await dbExt.upsertParcel({
          code: input.code,
          name: input.name,
          polygon: input.polygon || null,
          isActive: input.isActive,
        });
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        code: z.string(),
        name: z.string(),
        polygon: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        await dbExt.upsertParcel({
          code: input.code,
          name: input.name,
          polygon: input.polygon || null,
          isActive: input.isActive ?? true,
        });
        return { success: true };
      }),

    toggleActive: adminProcedure
      .input(z.object({
        code: z.string(),
        isActive: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        await dbExt.toggleParcelActive(input.code, input.isActive);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ code: z.string() }))
      .mutation(async ({ input }) => {
        await dbExt.deleteParcel(input.code);
        return { success: true };
      }),

    deactivateWithoutPolygon: adminProcedure.mutation(async () => {
      const allParcels = await dbExt.getAllParcels();
      let count = 0;
      for (const p of allParcels) {
        let hasPolygon = false;
        if (p.polygon) {
          try {
            const poly = typeof p.polygon === 'string' ? JSON.parse(p.polygon) : p.polygon;
            hasPolygon = poly.coordinates && poly.coordinates[0] && poly.coordinates[0].length >= 3;
          } catch { hasPolygon = false; }
        }
        if (!hasPolygon && p.isActive) {
          await dbExt.toggleParcelActive(p.code, false);
          count++;
        }
      }
      return { success: true, deactivated: count };
    }),

    uploadKML: adminProcedure
      .input(z.object({
        fileContent: z.string(),
        fileType: z.enum(['kml', 'kmz']),
      }))
      .mutation(async ({ input }) => {
        const { parseKML, parseKMZ } = await import("./kmlParser");
        
        let polygons;
        if (input.fileType === 'kml') {
          polygons = await parseKML(input.fileContent);
        } else {
          const buffer = Buffer.from(input.fileContent, 'base64');
          polygons = await parseKMZ(buffer);
        }

        // Insertar o actualizar parcelas con polígonos en formato GeoJSON
        for (const poly of polygons) {
          await dbExt.upsertParcel({
            code: poly.code,
            name: poly.name,
            polygon: JSON.stringify({
              type: 'Polygon',
              coordinates: poly.coordinates
            }),
            isActive: true,
          });
        }

        return { 
          success: true, 
          parcelsProcessed: polygons.length,
          parcels: polygons.map(p => ({ code: p.code, name: p.name }))
        };
      }),
  }),

  uploadErrors: router({
    listByBatch: adminProcedure
      .input(z.object({ batchId: z.string() }))
      .query(async ({ input }) => {
        return await dbExt.getUploadErrorsByBatch(input.batchId);
      }),

    listAll: adminProcedure
      .input(z.object({ limit: z.number().optional().default(100) }))
      .query(async ({ input }) => {
        return await dbExt.getAllUploadErrors(input.limit);
      }),

    listUnresolved: adminProcedure.query(async () => {
      return await dbExt.getUnresolvedErrors();
    }),

    markResolved: adminProcedure
      .input(z.object({ errorId: z.number() }))
      .mutation(async ({ input }) => {
        await dbExt.markErrorAsResolved(input.errorId);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ errorId: z.number() }))
      .mutation(async ({ input }) => {
        await dbExt.deleteUploadError(input.errorId);
        return { success: true };
      }),

    correctAndSave: adminProcedure
      .input(z.object({
        errorId: z.number(),
        boxCode: z.string(),
        parcelCode: z.string(),
        harvesterId: z.number(),
        weightKg: z.number(),
        photoUrl: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        collectedAt: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        console.log('\u2699\ufe0f Corrigiendo error ID:', input.errorId);
        console.log('\ud83d\udce6 Datos de la caja:', input);
        
        const database = await getDb();
        if (!database) {
          console.error('\u274c Base de datos no disponible');
          throw new Error('Base de datos no disponible');
        }

        try {
          // Verificar que la caja no exista ya
          const existingBox = await database.select().from(boxes).where(eq(boxes.boxCode, input.boxCode)).limit(1);
          if (existingBox.length > 0) {
            console.error('\u26a0\ufe0f Caja duplicada:', input.boxCode);
            throw new Error(`La caja ${input.boxCode} ya existe en la base de datos`);
          }

          // Verificar o crear la parcela
          let parcel = await database.select().from(parcels).where(eq(parcels.code, input.parcelCode)).limit(1);
          if (parcel.length === 0) {
            console.log('\ud83c\udf3f Creando nueva parcela:', input.parcelCode);
            await database.insert(parcels).values({
              code: input.parcelCode,
              name: input.parcelCode,
              polygon: null,
              isActive: true,
            });
          } else {
            console.log('\u2713 Parcela ya existe:', input.parcelCode);
          }

          // Verificar o crear la cortadora
          let harvester = await database.select().from(harvesters).where(eq(harvesters.id, input.harvesterId)).limit(1);
          if (harvester.length === 0) {
            console.log('\ud83d\udc69\u200d\ud83c\udf3e Creando nueva cortadora:', input.harvesterId);
            await database.insert(harvesters).values({
              id: input.harvesterId,
              number: input.harvesterId,
              customName: `Cortadora ${input.harvesterId}`,
            });
          } else {
            console.log('\u2713 Cortadora ya existe:', input.harvesterId);
          }

          // Obtener el nombre de la parcela
          const parcelData = await database.select().from(parcels).where(eq(parcels.code, input.parcelCode)).limit(1);
          const parcelName = parcelData.length > 0 ? parcelData[0].name : input.parcelCode;

          // Insertar la caja corregida
          console.log('\ud83d\udce6 Insertando caja en la base de datos...');
          await database.insert(boxes).values({
            boxCode: input.boxCode,
            parcelCode: input.parcelCode,
            parcelName: parcelName,
            harvesterId: input.harvesterId,
            weight: input.weightKg,
            photoUrl: input.photoUrl || null,
            latitude: input.latitude || null,
            longitude: input.longitude || null,
            collectedAt: input.collectedAt ? new Date(input.collectedAt) : new Date(),
          });
          console.log('\u2705 Caja insertada exitosamente:', input.boxCode);

          // Marcar el error como resuelto
          console.log('\u2705 Marcando error como resuelto...');
          await dbExt.markErrorAsResolved(input.errorId);
          console.log('\u2705 Error resuelto exitosamente');

          return { success: true, boxCode: input.boxCode };
        } catch (error) {
          console.error('\u274c Error al corregir y guardar:', error);
          throw error;
        }
      }),

    clearResolved: adminProcedure.mutation(async () => {
      await dbExt.clearResolvedErrors();
      return { success: true };
    }),

    clearAll: adminProcedure.mutation(async () => {
      await dbExt.clearAllErrors();
      return { success: true };
    }),

    getStatsByBatch: adminProcedure
      .input(z.object({ batchId: z.string() }))
      .query(async ({ input }) => {
        return await dbExt.getErrorStatsByBatch(input.batchId);
      }),
  }),

  uploadBatches: router({
    list: adminProcedure
      .input(z.object({ limit: z.number().optional().default(50) }))
      .query(async ({ input }) => {
        return await dbExt.getAllUploadBatches(input.limit);
      }),

    getById: adminProcedure
      .input(z.object({ batchId: z.string() }))
      .query(async ({ input }) => {
        return await dbExt.getUploadBatchById(input.batchId);
      }),

    delete: adminProcedure
      .input(z.object({ batchId: z.string() }))
      .mutation(async ({ input }) => {
        await dbExt.deleteUploadBatch(input.batchId);
        return { success: true };
      }),
  }),

  harvesters: router({
    list: protectedProcedure.query(async () => {
      return await db.getAllHarvesters();
    }),

    updateName: adminProcedure
      .input(z.object({ harvesterId: z.number(), customName: z.string() }))
      .mutation(async ({ input }) => {
        await db.upsertHarvester({ number: input.harvesterId, customName: input.customName });
        return { success: true };
      }),
  }),

  usersAdmin: router({
    list: adminProcedure.query(async () => {
      return await db.getAllUsers();
    }),

    updateRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(["user", "admin"]) }))
      .mutation(async ({ input }) => {
        await db.updateUserRole(input.userId, input.role);
        return { success: true };
      }),

    updatePermissions: adminProcedure
      .input(z.object({
        userId: z.number(),
        // Permisos dinámicos - acepta cualquier campo canView*
        permissions: z.record(z.string(), z.boolean()),
      }))
      .mutation(async ({ input }) => {
        // Filtrar solo los campos de permisos válidos (canView*)
        const validPermissions: Record<string, boolean> = {};
        for (const [key, value] of Object.entries(input.permissions)) {
          if (key.startsWith('canView')) {
            validPermissions[key] = value;
          }
        }
        await db.updateUserPermissions(input.userId, validPermissions);
        return { success: true };
      }),

    create: adminProcedure
      .input(
        z.object({
          name: z.string(),
          email: z.string().email(),
          password: z.string().min(6),
          role: z.enum(["user", "admin"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const hashedPassword = await hashPassword(input.password);
        await db.createManualUser({
          name: input.name,
          email: input.email,
          password: hashedPassword,
          role: input.role,
        });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // No permitir que el admin se elimine a sí mismo
        if (ctx.user && ctx.user.id === input.userId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No puedes eliminarte a ti mismo" });
        }
        await db.deleteUser(input.userId);
        return { success: true };
      }),

    changePassword: adminProcedure
      .input(z.object({
        userId: z.number(),
        newPassword: z.string().min(6),
      }))
      .mutation(async ({ input }) => {
        const hashedPassword = await hashPassword(input.newPassword);
        await db.changeUserPassword(input.userId, hashedPassword);
        return { success: true };
      }),

    // Logs de actividad
    activityLogs: adminProcedure
      .input(z.object({ userId: z.number().optional(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        if (input.userId) {
          return await db.getUserActivityLogs(input.userId, input.limit || 100);
        }
        return await db.getAllActivityLogs(input.limit || 200);
      }),

    activitySummary: adminProcedure.query(async () => {
      return await db.getUserActivitySummary();
    }),

    userTopPages: adminProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return await db.getUserTopPages(input.userId);
      }),
  }),

  // Perfil de usuario (accesible por el propio usuario)
  profile: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const user = await db.getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        bio: user.bio || "",
        phone: user.phone || "",
        avatarColor: user.avatarColor || "#16a34a",
        avatarEmoji: user.avatarEmoji || "🌿",
        createdAt: user.createdAt,
        lastSignedIn: user.lastSignedIn,
      };
    }),

    update: protectedProcedure
      .input(z.object({
        name: z.string().min(1).optional(),
        bio: z.string().max(255).optional(),
        phone: z.string().max(32).optional(),
        avatarColor: z.string().optional(),
        avatarEmoji: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await db.updateUserProfile(ctx.user.id, input);
        return { success: true };
      }),

    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(6),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        
        const isValid = await comparePassword(input.currentPassword, user.password);
        if (!isValid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "La contrase\u00f1a actual es incorrecta" });
        }
        
        const hashedPassword = await hashPassword(input.newPassword);
        await db.changeUserPassword(ctx.user.id, hashedPassword);
        return { success: true };
      }),

    // Log de actividad (el usuario registra su propia actividad)
    logActivity: protectedProcedure
      .input(z.object({
        action: z.enum(["login", "logout", "page_view", "page_leave"]),
        page: z.string().optional(),
        pageName: z.string().optional(),
        sessionId: z.string().optional(),
        durationSeconds: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) return { success: false };
        await db.logUserActivity({
          userId: ctx.user.id,
          action: input.action,
          page: input.page,
          pageName: input.pageName,
          sessionId: input.sessionId,
          durationSeconds: input.durationSeconds,
        });
        return { success: true };
      }),

    myActivity: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) return [];
        return await db.getUserActivityLogs(ctx.user.id, input.limit || 50);
      }),
  }),

  locationConfig: router({
    get: protectedProcedure.query(async () => {
      return await dbExt.getLocationConfig();
    }),

    save: adminProcedure
      .input(z.object({
        locationName: z.string(),
        latitude: z.string(),
        longitude: z.string(),
        timezone: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await dbExt.upsertLocationConfig(input);
        return { success: true };
      }),
  }),

  weather: router({
    // Obtener clima para una fecha específica (histórico, actual o pronóstico)
    getForDate: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input }) => {
        const { getWeatherForDate, getCurrentWeather } = await import("./weatherService");
        const locationConfig = await dbExt.getLocationConfig();
        if (!locationConfig) throw new Error("Configuración de ubicación no encontrada.");
        
        const today = new Date().toISOString().split("T")[0];
        
        // Si es hoy, usar getCurrentWeather para datos en tiempo real
        if (input.date === today) {
          const current = await getCurrentWeather(locationConfig.latitude, locationConfig.longitude, locationConfig.timezone);
          if (current) {
            return {
              date: today,
              conditionText: current.conditionText,
              temperature: Math.round(current.temperature),
              humidity: current.humidity,
              windSpeed: current.windSpeed,
              precipitation: current.precipitation,
              isRealtime: true,
            };
          }
        }
        
        // Para otras fechas, usar getWeatherForDate (histórico o pronóstico)
        const weather = await getWeatherForDate(locationConfig.latitude, locationConfig.longitude, input.date, locationConfig.timezone);
        if (weather) {
          return {
            date: weather.date,
            conditionText: `Temp: ${weather.temperatureMin.toFixed(0)}°C - ${weather.temperatureMax.toFixed(0)}°C`,
            temperature: Math.round(weather.temperatureMean),
            temperatureMax: weather.temperatureMax,
            temperatureMin: weather.temperatureMin,
            isRealtime: false,
          };
        }
        return null;
      }),

    getForDateRange: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ input }) => {
        const { getWeatherData } = await import("./weatherService");
        const locationConfig = await dbExt.getLocationConfig();
        
        if (!locationConfig) {
          throw new Error("Configuración de ubicación no encontrada. Configure la ubicación en Ajustes.");
        }
        
        const weatherData = await getWeatherData(
          locationConfig.latitude,
          locationConfig.longitude,
          input.startDate,
          input.endDate,
          locationConfig.timezone
        );
        
        return weatherData;
      }),
    
    getForecast: protectedProcedure
      .query(async () => {
        const { getWeatherForecast } = await import("./weatherService");
        const locationConfig = await dbExt.getLocationConfig();
        
        if (!locationConfig) {
          throw new Error("Configuración de ubicación no encontrada. Configure la ubicación en Ajustes.");
        }
        
        const forecastData = await getWeatherForecast(
          locationConfig.latitude,
          locationConfig.longitude,
          2, // próximos 2 días
          locationConfig.timezone
        );
        
        return forecastData;
      }),
    
    getCurrent: protectedProcedure
      .query(async () => {
        const { getCurrentWeather } = await import("./weatherService");
        const locationConfig = await dbExt.getLocationConfig();
        
        if (!locationConfig) {
          throw new Error("Configuración de ubicación no encontrada. Configure la ubicación en Ajustes.");
        }
        
        const currentWeather = await getCurrentWeather(
          locationConfig.latitude,
          locationConfig.longitude,
          locationConfig.timezone
        );
        
        return currentWeather;
      }),
    
    getExtendedForecast: protectedProcedure
      .input(z.object({
        days: z.number().min(1).max(16).default(7),
      }).optional())
      .query(async ({ input }) => {
        const { getExtendedForecast } = await import("./weatherService");
        const locationConfig = await dbExt.getLocationConfig();
        
        if (!locationConfig) {
          throw new Error("Configuración de ubicación no encontrada. Configure la ubicación en Ajustes.");
        }
        
        const forecast = await getExtendedForecast(
          locationConfig.latitude,
          locationConfig.longitude,
          input?.days || 7,
          locationConfig.timezone
        );
        
        return forecast;
      }),
    
    getHistoricalDetailed: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ input }) => {
        const { getHistoricalWeatherDetailed } = await import("./weatherService");
        const locationConfig = await dbExt.getLocationConfig();
        
        if (!locationConfig) {
          throw new Error("Configuración de ubicación no encontrada. Configure la ubicación en Ajustes.");
        }
        
        const historical = await getHistoricalWeatherDetailed(
          locationConfig.latitude,
          locationConfig.longitude,
          input.startDate,
          input.endDate,
          locationConfig.timezone
        );
        
        return historical;
      }),
  }),

  analytics: router({
    getAvailableDates: protectedProcedure
      .query(async () => {
        const dates = await db.getAvailableDates();
        return dates;
      }),
    
    getStats: protectedProcedure
      .input(
        z
          .object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        const boxes = await db.getBoxesWithFilters(input?.startDate, input?.endDate);
        
        if (boxes.length === 0) {
          return null;
        }

        const total = boxes.length;
        // Convertir peso de gramos a kilogramos
        const totalWeight = boxes.reduce((sum, box) => sum + box.weight, 0) / 1000;
        
        const firstQuality = boxes.filter(b => b.harvesterId !== 98 && b.harvesterId !== 99).length;
        const secondQuality = boxes.filter(b => b.harvesterId === 98).length;
        const waste = boxes.filter(b => b.harvesterId === 99).length;
        
        // Calcular peso de primera calidad en kg
        const firstQualityWeight = boxes
          .filter(b => b.harvesterId !== 98 && b.harvesterId !== 99)
          .reduce((sum, box) => sum + box.weight, 0) / 1000;
        
        const firstQualityPercent = ((firstQuality / total) * 100).toFixed(1);
        const secondQualityPercent = ((secondQuality / total) * 100).toFixed(1);
        const wastePercent = ((waste / total) * 100).toFixed(1);

        // Estadísticas por parcela
        const parcelMap = new Map();
        boxes.forEach(box => {
          if (!parcelMap.has(box.parcelCode)) {
            parcelMap.set(box.parcelCode, {
              parcelCode: box.parcelCode,
              parcelName: box.parcelName,
              parcelId: null as number | null,
              total: 0,
              weight: 0,
              firstQuality: 0,
              secondQuality: 0,
              waste: 0,
              firstQualityWeight: 0,
              secondQualityWeight: 0,
              wasteWeight: 0,
              productiveHectares: null as number | null,
              productiveTrees: null as number | null,
            });
          }
          const parcel = parcelMap.get(box.parcelCode);
          parcel.total++;
          parcel.weight += box.weight;
          if (box.harvesterId === 98) {
            parcel.secondQuality++;
            parcel.secondQualityWeight += box.weight;
          } else if (box.harvesterId === 99) {
            parcel.waste++;
            parcel.wasteWeight += box.weight;
          } else {
            parcel.firstQuality++;
            parcel.firstQualityWeight += box.weight;
          }
        });

        // Enriquecer con datos de parcela (id, hectáreas, árboles)
        const database = await db.getDb();
        if (database) {
          const allParcels = await database.select().from(parcels);
          const allDetails = await database.select().from(parcelDetails);
          for (const [code, stats] of parcelMap) {
            const p = allParcels.find((pp: any) => pp.code === code);
            if (p) {
              stats.parcelId = p.id;
              const det = allDetails.find((d: any) => d.parcelId === p.id);
              if (det) {
                stats.productiveHectares = det.productiveHectares ? parseFloat(det.productiveHectares) : null;
                stats.productiveTrees = det.productiveTrees ?? null;
              }
            }
          }
        }

        // Estadísticas por cortadora
        const harvesterMap = new Map();
        boxes.forEach(box => {
          if (!harvesterMap.has(box.harvesterId)) {
            harvesterMap.set(box.harvesterId, {
              harvesterId: box.harvesterId,
              total: 0,
              weight: 0,
            });
          }
          const harvester = harvesterMap.get(box.harvesterId);
          harvester.total++;
          harvester.weight += box.weight;
        });
        
        // Obtener nombres personalizados de cortadoras
        const allHarvesters = await db.getAllHarvesters();
        const harvesterStats = Array.from(harvesterMap.values()).map(stat => {
          const harvesterInfo = allHarvesters.find(h => h.number === stat.harvesterId);
          return {
            ...stat,
            harvesterName: harvesterInfo?.customName || null,
          };
        });

        // Estadísticas por hora del día (zona horaria de México UTC-6)
        const hourlyMap = new Map();
        boxes.forEach(box => {
          // Convertir a zona horaria de México (America/Mexico_City)
          const date = new Date(box.submissionTime);
          const mexicoTime = new Date(date.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
          const hour = mexicoTime.getHours();
          
          if (!hourlyMap.has(hour)) {
            hourlyMap.set(hour, {
              hour,
              totalBoxes: 0,
              totalWeight: 0,
            });
          }
          const hourData = hourlyMap.get(hour);
          hourData.totalBoxes++;
          hourData.totalWeight += box.weight;
        });
        
        // Ordenar por hora y convertir a array
        const hourlyStats = Array.from(hourlyMap.values()).sort((a, b) => a.hour - b.hour);

        return {
          total,
          totalWeight,
          firstQuality,
          firstQualityWeight,
          secondQuality,
          waste,
          firstQualityPercent,
          secondQualityPercent,
          wastePercent,
          parcelStats: Array.from(parcelMap.values()),
          harvesterStats,
          hourlyStats,
        };
      }),
  }),

  system: router({
    notifyOwner: protectedProcedure
      .input(z.object({ title: z.string(), content: z.string() }))
      .mutation(async () => {
        // Placeholder para notificaciones
        return { success: true };
      }),
  }),

  // ============ WebODM ============
  webodm: router({
    getConfig: adminProcedure.query(async () => {
      const config = await webodm.getWebodmConfig();
      if (!config) return null;
      return { id: config.id, serverUrl: config.serverUrl, username: config.username, hasPassword: !!config.password, hasToken: !!config.token };
    }),

    saveConfig: adminProcedure
      .input(z.object({ serverUrl: z.string().url(), username: z.string().min(1), password: z.string().min(1) }))
      .mutation(async ({ input }) => {
        await webodm.saveWebodmConfig(input);
        return { success: true };
      }),

    testConnection: adminProcedure.mutation(async () => {
      return webodm.testWebodmConnection();
    }),

    getProjects: protectedProcedure.query(async () => {
      return webodm.getOdmProjects();
    }),

    getProjectTasks: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        return webodm.getOdmProjectTasks(input.projectId);
      }),

    getTaskTileUrls: protectedProcedure
      .input(z.object({ projectId: z.number(), taskUuid: z.string(), availableAssets: z.array(z.string()) }))
      .query(async ({ input }) => {
        return webodm.getOdmTaskTileUrls(input.projectId, input.taskUuid, input.availableAssets);
      }),

    getTileUrl: protectedProcedure
      .input(z.object({ projectId: z.number(), taskUuid: z.string(), type: z.enum(["orthophoto", "dsm", "dtm"]).default("orthophoto") }))
      .query(async ({ input }) => {
        const url = await webodm.getOdmTileUrl(input.projectId, input.taskUuid, input.type);
        return { url };
      }),

    // Mapeo parcela <-> proyecto ODM
    getMappings: protectedProcedure.query(async () => {
      return webodm.getParcelOdmMappings();
    }),

    getMapping: protectedProcedure
      .input(z.object({ parcelId: z.number() }))
      .query(async ({ input }) => {
        return webodm.getParcelOdmMapping(input.parcelId);
      }),

    saveMapping: adminProcedure
      .input(z.object({ parcelId: z.number(), odmProjectId: z.number(), odmProjectName: z.string().optional() }))
      .mutation(async ({ input }) => {
        await webodm.saveParcelOdmMapping(input.parcelId, input.odmProjectId, input.odmProjectName);
        return { success: true };
      }),

    deleteMapping: adminProcedure
      .input(z.object({ parcelId: z.number() }))
      .mutation(async ({ input }) => {
        await webodm.deleteParcelOdmMapping(input.parcelId);
        return { success: true };
      }),
  }),

  // ============ Detalles de Parcela & Análisis ============
  parcelAnalysis: router({
    getDetails: protectedProcedure
      .input(z.object({ parcelId: z.number() }))
      .query(async ({ input }) => {
        return webodm.getParcelDetails(input.parcelId);
      }),

    getAllDetails: protectedProcedure.query(async () => {
      return webodm.getAllParcelDetails();
    }),

    saveDetails: adminProcedure
      .input(z.object({
        parcelId: z.number(),
        totalHectares: z.string().nullable().optional(),
        productiveHectares: z.string().nullable().optional(),
        treeDensityPerHectare: z.string().nullable().optional(),
        totalTrees: z.number().nullable().optional(),
        productiveTrees: z.number().nullable().optional(),
        newTrees: z.number().nullable().optional(),
        cropId: z.number().nullable().optional(),
        varietyId: z.number().nullable().optional(),
        establishedAt: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { parcelId, ...data } = input;
        await webodm.saveParcelDetails(parcelId, data);
        return { success: true };
      }),

    // Notas de parcela
    getNotes: protectedProcedure
      .input(z.object({ parcelId: z.number() }))
      .query(async ({ input }) => {
        return webodm.getParcelNotes(input.parcelId);
      }),

    addNote: protectedProcedure
      .input(z.object({ parcelId: z.number(), content: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        return webodm.addParcelNote(input.parcelId, ctx.user.id, input.content);
      }),

    deleteNote: protectedProcedure
      .input(z.object({ noteId: z.number() }))
      .mutation(async ({ input }) => {
        return webodm.deleteParcelNote(input.noteId);
      }),

    getHarvestStats: protectedProcedure
      .input(z.object({ parcelCode: z.string() }))
      .query(async ({ input }) => {
        return webodm.getParcelHarvestStats(input.parcelCode);
      }),

    getDailyHarvest: protectedProcedure
      .input(z.object({ parcelCode: z.string() }))
      .query(async ({ input }) => {
        return webodm.getParcelDailyHarvest(input.parcelCode);
      }),
  }),

  // CRUD de Cultivos y Variedades
  crops: router({
    list: protectedProcedure.query(async () => {
      return webodm.getAllCrops();
    }),

    create: adminProcedure
      .input(z.object({ name: z.string().min(1), description: z.string().nullable().optional() }))
      .mutation(async ({ input }) => {
        return webodm.createCrop(input);
      }),

    update: adminProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).optional(), description: z.string().nullable().optional(), isActive: z.boolean().optional() }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return webodm.updateCrop(id, data);
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return webodm.deleteCrop(input.id);
      }),

    createVariety: adminProcedure
      .input(z.object({ cropId: z.number(), name: z.string().min(1), description: z.string().nullable().optional() }))
      .mutation(async ({ input }) => {
        return webodm.createVariety(input);
      }),

    updateVariety: adminProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).optional(), description: z.string().nullable().optional(), isActive: z.boolean().optional() }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return webodm.updateVariety(id, data);
      }),

    deleteVariety: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return webodm.deleteVariety(input.id);
      }),
  }),

  // Sincronización semanal de vuelos ODM
  odmSync: router({
    status: protectedProcedure.query(async () => {
      const { getOdmSyncStatus } = await import("./odmAutoSync");
      return getOdmSyncStatus();
    }),
    triggerManual: adminProcedure.mutation(async () => {
      const { triggerManualOdmSync } = await import("./odmAutoSync");
      const result = await triggerManualOdmSync();
      return result || { totalProjects: 0, totalTasks: 0, newTasks: [], completedTasks: [], processingTasks: [], failedTasks: [], parcelSummary: [] };
    }),
   }),

  // ===== LIBRETA DE CAMPO =====
  fieldNotebook: router({
    // Listar actividades con filtros
    list: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        activityType: z.string().optional(),
        parcelId: z.number().optional(),
        status: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const drizzle = await getDb();
        const filters: any[] = [];
        if (input?.activityType) filters.push(eq(fieldActivities.activityType, input.activityType as any));
        if (input?.status) filters.push(eq(fieldActivities.status, input.status as any));
        if (input?.startDate) filters.push(gte(fieldActivities.activityDate, input.startDate));
        if (input?.endDate) filters.push(lte(fieldActivities.activityDate, input.endDate));

        let query = drizzle.select().from(fieldActivities).orderBy(desc(fieldActivities.activityDate), desc(fieldActivities.id));
        if (filters.length > 0) {
          query = query.where(and(...filters)) as any;
        }
        const activities = await query;

        // Enriquecer con parcelas, productos, herramientas, fotos y asignaciones
        const enriched = await Promise.all(activities.map(async (act) => {
          const [actParcels, actProducts, actTools, actPhotos, actAssignments] = await Promise.all([
            drizzle.select().from(fieldActivityParcels).where(eq(fieldActivityParcels.activityId, act.id)),
            drizzle.select().from(fieldActivityProducts).where(eq(fieldActivityProducts.activityId, act.id)),
            drizzle.select().from(fieldActivityTools).where(eq(fieldActivityTools.activityId, act.id)),
            drizzle.select().from(fieldActivityPhotos).where(eq(fieldActivityPhotos.activityId, act.id)),
            drizzle.select().from(fieldActivityAssignments).where(eq(fieldActivityAssignments.activityId, act.id)),
          ]);

          // Obtener nombres de parcelas
          let parcelNames: { id: number; name: string }[] = [];
          if (actParcels.length > 0) {
            const parcelIds = actParcels.map(p => p.parcelId);
            const parcelRows = await drizzle.select({ id: parcels.id, name: parcels.name }).from(parcels).where(inArray(parcels.id, parcelIds));
            parcelNames = parcelRows;
          }

          // Obtener nombres de colaboradores asignados
          let assignedCollaborators: { id: number; name: string; status: string }[] = [];
          if (actAssignments.length > 0) {
            const collabIds = actAssignments.map(a => a.collaboratorId);
            const collabRows = await drizzle.select({ id: collaborators.id, name: collaborators.name }).from(collaborators).where(inArray(collaborators.id, collabIds));
            assignedCollaborators = actAssignments.map(a => {
              const c = collabRows.find(cr => cr.id === a.collaboratorId);
              return { id: a.collaboratorId, name: c?.name || "Desconocido", status: a.status };
            });
          }

          return {
            ...act,
            parcels: parcelNames,
            products: actProducts,
            tools: actTools,
            photos: actPhotos,
            assignments: assignedCollaborators,
          };
        }));

        // Filtrar por parcelId si se especificó
        if (input?.parcelId) {
          return enriched.filter(a => a.parcels.some(p => p.id === input.parcelId));
        }
        return enriched;
      }),

    // Obtener una actividad por ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        const [activity] = await drizzle.select().from(fieldActivities).where(eq(fieldActivities.id, input.id));
        if (!activity) throw new TRPCError({ code: "NOT_FOUND", message: "Actividad no encontrada" });

        const [actParcels, actProducts, actTools, actPhotos] = await Promise.all([
          drizzle.select().from(fieldActivityParcels).where(eq(fieldActivityParcels.activityId, activity.id)),
          drizzle.select().from(fieldActivityProducts).where(eq(fieldActivityProducts.activityId, activity.id)),
          drizzle.select().from(fieldActivityTools).where(eq(fieldActivityTools.activityId, activity.id)),
          drizzle.select().from(fieldActivityPhotos).where(eq(fieldActivityPhotos.activityId, activity.id)),
        ]);

        let parcelNames: { id: number; name: string }[] = [];
        if (actParcels.length > 0) {
          const parcelIds = actParcels.map(p => p.parcelId);
          const parcelRows = await drizzle.select({ id: parcels.id, name: parcels.name }).from(parcels).where(inArray(parcels.id, parcelIds));
          parcelNames = parcelRows;
        }

        return { ...activity, parcels: parcelNames, products: actProducts, tools: actTools, photos: actPhotos };
      }),

    // Crear nueva actividad
    create: protectedProcedure
      .input(z.object({
        activityType: z.string(),
        activitySubtype: z.string().optional(),
        description: z.string().optional(),
        performedBy: z.string().optional(),
        activityDate: z.string(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        durationMinutes: z.number().optional(),
        weatherCondition: z.string().optional(),
        temperature: z.string().optional(),
        status: z.string().optional(),
        parcelIds: z.array(z.number()).optional(),
        products: z.array(z.object({
          productName: z.string(),
          productType: z.string().optional(),
          quantity: z.string().optional(),
          unit: z.string().optional(),
          dosisPerHectare: z.string().optional(),
          applicationMethod: z.string().optional(),
          notes: z.string().optional(),
        })).optional(),
        tools: z.array(z.object({
          toolName: z.string(),
          toolType: z.string().optional(),
          notes: z.string().optional(),
        })).optional(),
        collaboratorIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const drizzle = await getDb();
        const userId = (ctx as any).user?.id || 0;

        // Calcular duración si no se proporcionó
        let duration = input.durationMinutes;
        if (!duration && input.startTime && input.endTime) {
          const [sh, sm] = input.startTime.split(":").map(Number);
          const [eh, em] = input.endTime.split(":").map(Number);
          duration = (eh * 60 + em) - (sh * 60 + sm);
          if (duration < 0) duration += 24 * 60;
        }

        const [result] = await drizzle.insert(fieldActivities).values({
          activityType: input.activityType as any,
          activitySubtype: input.activitySubtype || null,
          description: input.description || null,
          performedBy: input.performedBy || "",
          activityDate: input.activityDate,
          startTime: input.startTime || null,
          endTime: input.endTime || null,
          durationMinutes: duration || null,
          weatherCondition: input.weatherCondition || null,
          temperature: input.temperature || null,
          status: (input.status as any) || "planificada",
          createdByUserId: userId,
        });

        const activityId = result.insertId;

        // Insertar parcelas
        if (input.parcelIds && input.parcelIds.length > 0) {
          await drizzle.insert(fieldActivityParcels).values(
            input.parcelIds.map(pid => ({ activityId, parcelId: pid }))
          );
        }

        // Insertar productos
        if (input.products && input.products.length > 0) {
          await drizzle.insert(fieldActivityProducts).values(
            input.products.map(p => ({
              activityId,
              productName: p.productName,
              productType: (p.productType as any) || "otro",
              quantity: p.quantity || null,
              unit: (p.unit as any) || "kg",
              dosisPerHectare: p.dosisPerHectare || null,
              applicationMethod: p.applicationMethod || null,
              notes: p.notes || null,
            }))
          );
        }

        // Insertar herramientas
        if (input.tools && input.tools.length > 0) {
          await drizzle.insert(fieldActivityTools).values(
            input.tools.map(t => ({
              activityId,
              toolName: t.toolName,
              toolType: (t.toolType as any) || "otro",
              notes: t.notes || null,
            }))
          );
        }

        // Insertar asignaciones de colaboradores
        if (input.collaboratorIds && input.collaboratorIds.length > 0) {
          await drizzle.insert(fieldActivityAssignments).values(
            input.collaboratorIds.map(cid => ({
              activityId,
              collaboratorId: cid,
              status: "pendiente" as const,
              assignedByUserId: userId,
            }))
          );
          // Notificar a cada colaborador por Telegram
          try {
            const { notifyCollaboratorNewTask } = await import("./telegramCollaboratorBot");
            for (const cid of input.collaboratorIds) {
              notifyCollaboratorNewTask(cid, activityId).catch(e => console.error("Error notificando colaborador:", e));
            }
          } catch (e) { console.error("Error importando telegramCollaboratorBot:", e); }
        }

        return { id: activityId, success: true };
      }),

    // Actualizar actividad
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        activityType: z.string().optional(),
        activitySubtype: z.string().optional(),
        description: z.string().optional(),
        performedBy: z.string().optional(),
        activityDate: z.string().optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        durationMinutes: z.number().optional(),
        weatherCondition: z.string().optional(),
        temperature: z.string().optional(),
        status: z.string().optional(),
        parcelIds: z.array(z.number()).optional(),
        products: z.array(z.object({
          productName: z.string(),
          productType: z.string().optional(),
          quantity: z.string().optional(),
          unit: z.string().optional(),
          dosisPerHectare: z.string().optional(),
          applicationMethod: z.string().optional(),
          notes: z.string().optional(),
        })).optional(),
        tools: z.array(z.object({
          toolName: z.string(),
          toolType: z.string().optional(),
          notes: z.string().optional(),
        })).optional(),
        collaboratorIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const drizzle = await getDb();
        const updateData: any = {};
        if (input.activityType) updateData.activityType = input.activityType;
        if (input.activitySubtype !== undefined) updateData.activitySubtype = input.activitySubtype || null;
        if (input.description !== undefined) updateData.description = input.description || null;
        if (input.performedBy) updateData.performedBy = input.performedBy;
        if (input.activityDate) updateData.activityDate = input.activityDate;
        if (input.startTime !== undefined) updateData.startTime = input.startTime || null;
        if (input.endTime !== undefined) updateData.endTime = input.endTime || null;
        if (input.durationMinutes !== undefined) updateData.durationMinutes = input.durationMinutes;
        if (input.weatherCondition !== undefined) updateData.weatherCondition = input.weatherCondition || null;
        if (input.temperature !== undefined) updateData.temperature = input.temperature || null;
        if (input.status) updateData.status = input.status;

        // Calcular duración
        if (input.startTime && input.endTime) {
          const [sh, sm] = input.startTime.split(":").map(Number);
          const [eh, em] = input.endTime.split(":").map(Number);
          let dur = (eh * 60 + em) - (sh * 60 + sm);
          if (dur < 0) dur += 24 * 60;
          updateData.durationMinutes = dur;
        }

        await drizzle.update(fieldActivities).set(updateData).where(eq(fieldActivities.id, input.id));

        // Reemplazar parcelas
        if (input.parcelIds !== undefined) {
          await drizzle.delete(fieldActivityParcels).where(eq(fieldActivityParcels.activityId, input.id));
          if (input.parcelIds.length > 0) {
            await drizzle.insert(fieldActivityParcels).values(
              input.parcelIds.map(pid => ({ activityId: input.id, parcelId: pid }))
            );
          }
        }

        // Reemplazar productos
        if (input.products !== undefined) {
          await drizzle.delete(fieldActivityProducts).where(eq(fieldActivityProducts.activityId, input.id));
          if (input.products.length > 0) {
            await drizzle.insert(fieldActivityProducts).values(
              input.products.map(p => ({
                activityId: input.id,
                productName: p.productName,
                productType: (p.productType as any) || "otro",
                quantity: p.quantity || null,
                unit: (p.unit as any) || "kg",
                dosisPerHectare: p.dosisPerHectare || null,
                applicationMethod: p.applicationMethod || null,
                notes: p.notes || null,
              }))
            );
          }
        }

        // Reemplazar herramientas
        if (input.tools !== undefined) {
          await drizzle.delete(fieldActivityTools).where(eq(fieldActivityTools.activityId, input.id));
          if (input.tools.length > 0) {
            await drizzle.insert(fieldActivityTools).values(
              input.tools.map(t => ({
                activityId: input.id,
                toolName: t.toolName,
                toolType: (t.toolType as any) || "otro",
                notes: t.notes || null,
              }))
            );
          }
        }

        // Reemplazar asignaciones de colaboradores
        if (input.collaboratorIds !== undefined) {
          // Obtener asignaciones existentes que no estén completadas
          const existingAssignments = await drizzle.select().from(fieldActivityAssignments).where(eq(fieldActivityAssignments.activityId, input.id));
          const existingCollabIds = existingAssignments.map(a => a.collaboratorId);
          const newCollabIds = input.collaboratorIds;
          // Eliminar asignaciones que ya no están (solo pendientes/en_progreso)
          const toRemove = existingAssignments.filter(a => !newCollabIds.includes(a.collaboratorId) && (a.status === "pendiente" || a.status === "en_progreso"));
          for (const a of toRemove) {
            await drizzle.delete(fieldActivityAssignments).where(eq(fieldActivityAssignments.id, a.id));
          }
          // Agregar nuevas asignaciones
          const toAdd = newCollabIds.filter(cid => !existingCollabIds.includes(cid));
          if (toAdd.length > 0) {
            const userId = (ctx as any).user?.id || 0;
            await drizzle.insert(fieldActivityAssignments).values(
              toAdd.map(cid => ({
                activityId: input.id,
                collaboratorId: cid,
                status: "pendiente" as const,
                assignedByUserId: userId,
              }))
            );
            // Notificar nuevos colaboradores
            try {
              const { notifyCollaboratorNewTask } = await import("./telegramCollaboratorBot");
              for (const cid of toAdd) {
                notifyCollaboratorNewTask(cid, input.id).catch(e => console.error("Error notificando colaborador:", e));
              }
            } catch (e) { console.error("Error importando telegramCollaboratorBot:", e); }
          }
        }

        return { success: true };
      }),

    // Eliminar actividad
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        // Eliminar relaciones primero
        await Promise.all([
          drizzle.delete(fieldActivityParcels).where(eq(fieldActivityParcels.activityId, input.id)),
          drizzle.delete(fieldActivityProducts).where(eq(fieldActivityProducts.activityId, input.id)),
          drizzle.delete(fieldActivityTools).where(eq(fieldActivityTools.activityId, input.id)),
          drizzle.delete(fieldActivityPhotos).where(eq(fieldActivityPhotos.activityId, input.id)),
          drizzle.delete(fieldActivityAssignments).where(eq(fieldActivityAssignments.activityId, input.id)),
        ]);
        await drizzle.delete(fieldActivities).where(eq(fieldActivities.id, input.id));
        return { success: true };
      }),

    // Agregar foto a una actividad
    addPhoto: protectedProcedure
      .input(z.object({
        activityId: z.number(),
        photoUrl: z.string(),
        photoType: z.string().optional(),
        caption: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const drizzle = await getDb();
        const userId = (ctx as any).user?.id || 0;
        await drizzle.insert(fieldActivityPhotos).values({
          activityId: input.activityId,
          photoUrl: input.photoUrl,
          photoType: (input.photoType as any) || "durante",
          caption: input.caption || null,
          uploadedByUserId: userId,
        });
        return { success: true };
      }),

    // Eliminar foto
    deletePhoto: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        await drizzle.delete(fieldActivityPhotos).where(eq(fieldActivityPhotos.id, input.id));
        return { success: true };
      }),

    // Estadísticas rápidas
    stats: protectedProcedure.query(async () => {
      const drizzle = await getDb();
      const [totalResult] = await drizzle.select({ count: sql<number>`COUNT(*)` }).from(fieldActivities);
      const [thisMonthResult] = await drizzle.select({ count: sql<number>`COUNT(*)` }).from(fieldActivities)
        .where(gte(fieldActivities.activityDate, sql`DATE_FORMAT(NOW(), '%Y-%m-01')`));

      // Contar por tipo
      const byType = await drizzle.select({
        type: fieldActivities.activityType,
        count: sql<number>`COUNT(*)`,
      }).from(fieldActivities).groupBy(fieldActivities.activityType);

      return {
        total: totalResult?.count || 0,
        thisMonth: thisMonthResult?.count || 0,
        byType: byType.reduce((acc, r) => { acc[r.type] = r.count; return acc; }, {} as Record<string, number>),
      };
    }),
  }),

  // ===== ALMACENES =====
  warehouse: router({
    // --- PRODUCTOS ---
    listProducts: protectedProcedure
      .input(z.object({ category: z.string().optional(), search: z.string().optional(), lowStock: z.boolean().optional() }).optional())
      .query(async ({ input }) => {
        const drizzle = await getDb();
        let query = drizzle.select().from(warehouseProducts).orderBy(desc(warehouseProducts.updatedAt));
        const results = await query;
        let filtered = results;
        if (input?.category) filtered = filtered.filter(p => p.category === input.category);
        if (input?.search) { const s = input.search.toLowerCase(); filtered = filtered.filter(p => p.name.toLowerCase().includes(s) || (p.brand || '').toLowerCase().includes(s)); }
        if (input?.lowStock) filtered = filtered.filter(p => p.currentStock !== null && p.minimumStock !== null && Number(p.currentStock) <= Number(p.minimumStock));
        return filtered;
      }),

    getProduct: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        const [product] = await drizzle.select().from(warehouseProducts).where(eq(warehouseProducts.id, input.id));
        if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: 'Producto no encontrado' });
        const movements = await drizzle.select().from(warehouseProductMovements).where(eq(warehouseProductMovements.productId, input.id)).orderBy(desc(warehouseProductMovements.createdAt)).limit(50);
        return { ...product, movements };
      }),

    createProduct: protectedProcedure
      .input(z.object({
        name: z.string(), category: z.string(), brand: z.string().optional(), activeIngredient: z.string().optional(),
        concentration: z.string().optional(), presentation: z.string().optional(),
        unit: z.string(), currentStock: z.number().optional(), minimumStock: z.number().optional(),
        costPerUnit: z.number().optional(), supplierId: z.number().optional(), supplier: z.string().optional(), supplierContact: z.string().optional(),
        lotNumber: z.string().optional(), photoUrl: z.string().optional(),
        photoBase64: z.string().optional(),
        storageLocation: z.string().optional(), expirationDate: z.string().optional(),
        safetyDataSheet: z.string().optional(), description: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        let finalPhotoUrl = input.photoUrl || null;
        // Si se envió foto en base64, guardarla localmente
        if (input.photoBase64) {
          const fs = await import("fs");
          const path = await import("path");
          const dir = `/app/photos/warehouse/products`;
          fs.mkdirSync(dir, { recursive: true });
          const fileName = `product-${Date.now()}.jpg`;
          const filePath = path.join(dir, fileName);
          const buffer = Buffer.from(input.photoBase64, "base64");
          fs.writeFileSync(filePath, buffer);
          finalPhotoUrl = `/app/photos/warehouse/products/${fileName}`;
        }
        const result = await drizzle.insert(warehouseProducts).values({
          name: input.name, category: input.category as any, brand: input.brand || null,
          activeIngredient: input.activeIngredient || null, concentration: input.concentration || null,
          presentation: input.presentation || null, unit: input.unit as any,
          currentStock: String(input.currentStock ?? 0), minimumStock: String(input.minimumStock ?? 0),
          costPerUnit: input.costPerUnit ? String(input.costPerUnit) : null,
          supplierId: input.supplierId ?? null,
          supplier: input.supplier || null, supplierContact: input.supplierContact || null,
          lotNumber: input.lotNumber || null, photoUrl: finalPhotoUrl,
          storageLocation: input.storageLocation || null, description: input.description || null,
          expirationDate: input.expirationDate || null,
          safetyDataSheet: input.safetyDataSheet || null, isActive: true,
          createdByUserId: 0,
        });
        return { id: result.insertId };
      }),

    updateProduct: protectedProcedure
      .input(z.object({
        id: z.number(), name: z.string().optional(), category: z.string().optional(),
        brand: z.string().optional(), activeIngredient: z.string().optional(),
        concentration: z.string().optional(), presentation: z.string().optional(),
        unit: z.string().optional(), minimumStock: z.number().optional(),
        costPerUnit: z.number().optional(), supplierId: z.number().optional(),
        supplier: z.string().optional(), supplierContact: z.string().optional(), lotNumber: z.string().optional(),
        photoUrl: z.string().optional(), photoBase64: z.string().optional(),
        description: z.string().optional(),
        storageLocation: z.string().optional(), expirationDate: z.string().optional(),
        safetyDataSheet: z.string().optional(), isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        const { id, photoBase64, ...data } = input;
        const updateData: any = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.category !== undefined) updateData.category = data.category;
        if (data.brand !== undefined) updateData.brand = data.brand || null;
        if (data.activeIngredient !== undefined) updateData.activeIngredient = data.activeIngredient || null;
        if (data.unit !== undefined) updateData.unit = data.unit;
        if (data.minimumStock !== undefined) updateData.minimumStock = String(data.minimumStock);
        if (data.costPerUnit !== undefined) updateData.costPerUnit = data.costPerUnit ? String(data.costPerUnit) : null;
        if (data.supplierId !== undefined) updateData.supplierId = data.supplierId ?? null;
        if (data.supplier !== undefined) updateData.supplier = data.supplier || null;
        if (data.supplierContact !== undefined) updateData.supplierContact = data.supplierContact || null;
        if (data.lotNumber !== undefined) updateData.lotNumber = data.lotNumber || null;
        if (photoBase64) {
          const fs = await import("fs");
          const path = await import("path");
          const dir = `/app/photos/warehouse/products`;
          fs.mkdirSync(dir, { recursive: true });
          const fileName = `product-${id}-${Date.now()}.jpg`;
          const filePath = path.join(dir, fileName);
          const buffer = Buffer.from(photoBase64, "base64");
          fs.writeFileSync(filePath, buffer);
          updateData.photoUrl = `/app/photos/warehouse/products/${fileName}`;
        } else if (data.photoUrl !== undefined) {
          updateData.photoUrl = data.photoUrl || null;
        }
        if (data.description !== undefined) updateData.description = data.description || null;
        if (data.storageLocation !== undefined) updateData.storageLocation = data.storageLocation || null;
        if (data.expirationDate !== undefined) updateData.expirationDate = data.expirationDate || null;
        if (data.safetyDataSheet !== undefined) updateData.safetyDataSheet = data.safetyDataSheet || null;
        if (data.isActive !== undefined) updateData.isActive = data.isActive;
        updateData.updatedAt = new Date();
        await drizzle.update(warehouseProducts).set(updateData).where(eq(warehouseProducts.id, id));
        return { success: true };
      }),

    deleteProduct: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        await drizzle.delete(warehouseProductMovements).where(eq(warehouseProductMovements.productId, input.id));
        await drizzle.delete(warehouseProducts).where(eq(warehouseProducts.id, input.id));
        return { success: true };
      }),

    // Movimiento de inventario (entrada/salida/ajuste)
    addMovement: protectedProcedure
      .input(z.object({
        productId: z.number(), movementType: z.string(), quantity: z.number(),
        reason: z.string().optional(), relatedActivityId: z.number().optional(),

      }))
      .mutation(async ({ input, ctx }) => {
        const drizzle = await getDb();
        const userId = (ctx as any).user?.id || 0;
        // Obtener stock actual
        const [product] = await drizzle.select().from(warehouseProducts).where(eq(warehouseProducts.id, input.productId));
        if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: 'Producto no encontrado' });
        const currentStock = Number(product.currentStock) || 0;
        let newStock = currentStock;
        if (input.movementType === 'entrada') newStock = currentStock + input.quantity;
        else if (input.movementType === 'salida') newStock = Math.max(0, currentStock - input.quantity);
        else if (input.movementType === 'ajuste') newStock = input.quantity;
        else if (input.movementType === 'devolucion') newStock = currentStock + input.quantity;
        // Registrar movimiento
        await drizzle.insert(warehouseProductMovements).values({
          productId: input.productId, movementType: input.movementType as any,
          quantity: String(input.quantity), previousStock: String(currentStock), newStock: String(newStock),
          reason: input.reason || null, relatedActivityId: input.relatedActivityId || null,
          performedByUserId: userId,
        });
        // Actualizar stock
        await drizzle.update(warehouseProducts).set({ currentStock: String(newStock), updatedAt: new Date() }).where(eq(warehouseProducts.id, input.productId));
        return { success: true, newStock };
      }),

    // --- HERRAMIENTAS ---
    listTools: protectedProcedure
      .input(z.object({ category: z.string().optional(), search: z.string().optional(), status: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const drizzle = await getDb();
        let results = await drizzle.select().from(warehouseTools).orderBy(desc(warehouseTools.updatedAt));
        if (input?.category) results = results.filter(t => t.category === input.category);
        if (input?.search) { const s = input.search.toLowerCase(); results = results.filter(t => t.name.toLowerCase().includes(s) || (t.brand || '').toLowerCase().includes(s)); }
        if (input?.status) results = results.filter(t => t.status === input.status);
        return results;
      }),

    createTool: protectedProcedure
      .input(z.object({
        name: z.string(), category: z.string(), brand: z.string().optional(), model: z.string().optional(),
        serialNumber: z.string().optional(), description: z.string().optional(),
        status: z.string().optional(), conditionState: z.string().optional(),
        acquisitionDate: z.string().optional(), acquisitionCost: z.number().optional(),
        currentValue: z.number().optional(), storageLocation: z.string().optional(),
        photoUrl: z.string().optional(), quantity: z.number().optional(),
        lastMaintenanceDate: z.string().optional(), nextMaintenanceDate: z.string().optional(),
        maintenanceNotes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        const result = await drizzle.insert(warehouseTools).values({
          name: input.name, category: input.category as any, brand: input.brand || null,
          model: input.model || null, serialNumber: input.serialNumber || null,
          description: input.description || null,
          status: (input.status as any) || 'disponible', conditionState: (input.conditionState as any) || 'bueno',
          acquisitionDate: input.acquisitionDate || null,
          acquisitionCost: input.acquisitionCost ? String(input.acquisitionCost) : null,
          currentValue: input.currentValue ? String(input.currentValue) : null,
          storageLocation: input.storageLocation || null, photoUrl: input.photoUrl || null,
          quantity: input.quantity ?? 1,
          lastMaintenanceDate: input.lastMaintenanceDate || null,
          nextMaintenanceDate: input.nextMaintenanceDate || null,
          maintenanceNotes: input.maintenanceNotes || null, isActive: true,
          createdByUserId: 0,
        });
        return { id: result.insertId };
      }),

    updateTool: protectedProcedure
      .input(z.object({
        id: z.number(), name: z.string().optional(), category: z.string().optional(),
        brand: z.string().optional(), model: z.string().optional(), serialNumber: z.string().optional(),
        description: z.string().optional(), status: z.string().optional(), conditionState: z.string().optional(),
        storageLocation: z.string().optional(), photoUrl: z.string().optional(),
        quantity: z.number().optional(), maintenanceNotes: z.string().optional(),
        lastMaintenanceDate: z.string().optional(), nextMaintenanceDate: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        const { id, ...data } = input;
        const updateData: any = { updatedAt: new Date() };
        Object.entries(data).forEach(([key, val]) => {
          if (val !== undefined) updateData[key] = val === '' ? null : val;
        });
        await drizzle.update(warehouseTools).set(updateData).where(eq(warehouseTools.id, id));
        return { success: true };
      }),

    deleteTool: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        await drizzle.delete(warehouseToolAssignments).where(eq(warehouseToolAssignments.toolId, input.id));
        await drizzle.delete(warehouseTools).where(eq(warehouseTools.id, input.id));
        return { success: true };
      }),

    // Asignar herramienta a actividad
    assignTool: protectedProcedure
      .input(z.object({
        toolId: z.number(), relatedActivityId: z.number().optional(),
        assignedTo: z.string().optional(), notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const drizzle = await getDb();
        const userId = (ctx as any).user?.id || 0;
        await drizzle.insert(warehouseToolAssignments).values({
          toolId: input.toolId, assignmentType: 'asignacion',
          relatedActivityId: input.relatedActivityId || null,
          assignedTo: input.assignedTo || null, performedByUserId: userId,
          notes: input.notes || null,
        });
        await drizzle.update(warehouseTools).set({ status: 'en_uso', assignedTo: input.assignedTo || null, updatedAt: new Date() }).where(eq(warehouseTools.id, input.toolId));
        return { success: true };
      }),

    returnTool: protectedProcedure
      .input(z.object({ toolId: z.number(), conditionState: z.string().optional(), notes: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const drizzle = await getDb();
        const userId = (ctx as any).user?.id || 0;
        // Registrar devolución
        await drizzle.insert(warehouseToolAssignments).values({
          toolId: input.toolId, assignmentType: 'devolucion',
          performedByUserId: userId, notes: input.notes || null,
        });
        const updateData: any = { status: 'disponible', assignedTo: null, updatedAt: new Date() };
        if (input.conditionState) updateData.conditionState = input.conditionState;
        await drizzle.update(warehouseTools).set(updateData).where(eq(warehouseTools.id, input.toolId));
        return { success: true };
      }),

    // --- PROVEEDORES ---
    listSuppliers: protectedProcedure
      .input(z.object({ category: z.string().optional(), search: z.string().optional(), activeOnly: z.boolean().optional() }).optional())
      .query(async ({ input }) => {
        const drizzle = await getDb();
        let results = await drizzle.select().from(warehouseSuppliers).orderBy(desc(warehouseSuppliers.updatedAt));
        if (input?.activeOnly !== false) results = results.filter(s => s.isActive);
        if (input?.category) results = results.filter(s => s.category === input.category);
        if (input?.search) {
          const s = input.search.toLowerCase();
          results = results.filter(sup => sup.companyName.toLowerCase().includes(s) || (sup.contactName || '').toLowerCase().includes(s) || (sup.productsOffered || '').toLowerCase().includes(s));
        }
        return results;
      }),

    getSupplier: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        const [supplier] = await drizzle.select().from(warehouseSuppliers).where(eq(warehouseSuppliers.id, input.id));
        if (!supplier) throw new TRPCError({ code: 'NOT_FOUND', message: 'Proveedor no encontrado' });
        // Obtener productos vinculados a este proveedor
        const products = await drizzle.select().from(warehouseProducts).where(eq(warehouseProducts.supplierId, input.id));
        return { ...supplier, products };
      }),

    createSupplier: protectedProcedure
      .input(z.object({
        companyName: z.string(), contactName: z.string().optional(),
        phone: z.string().optional(), phone2: z.string().optional(),
        email: z.string().optional(), website: z.string().optional(),
        rfc: z.string().optional(), address: z.string().optional(),
        city: z.string().optional(), state: z.string().optional(),
        postalCode: z.string().optional(), category: z.string().optional(),
        productsOffered: z.string().optional(), paymentTerms: z.string().optional(),
        bankAccount: z.string().optional(), notes: z.string().optional(),
        rating: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        const result = await drizzle.insert(warehouseSuppliers).values({
          companyName: input.companyName, contactName: input.contactName || null,
          phone: input.phone || null, phone2: input.phone2 || null,
          email: input.email || null, website: input.website || null,
          rfc: input.rfc || null, address: input.address || null,
          city: input.city || null, state: input.state || null,
          postalCode: input.postalCode || null,
          category: (input.category as any) || 'otro',
          productsOffered: input.productsOffered || null,
          paymentTerms: input.paymentTerms || null,
          bankAccount: input.bankAccount || null,
          notes: input.notes || null, rating: input.rating ?? null,
          isActive: true,
        });
        return { id: result.insertId };
      }),

    updateSupplier: protectedProcedure
      .input(z.object({
        id: z.number(), companyName: z.string().optional(), contactName: z.string().optional(),
        phone: z.string().optional(), phone2: z.string().optional(),
        email: z.string().optional(), website: z.string().optional(),
        rfc: z.string().optional(), address: z.string().optional(),
        city: z.string().optional(), state: z.string().optional(),
        postalCode: z.string().optional(), category: z.string().optional(),
        productsOffered: z.string().optional(), paymentTerms: z.string().optional(),
        bankAccount: z.string().optional(), notes: z.string().optional(),
        rating: z.number().optional(), isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        const { id, ...data } = input;
        const updateData: any = { updatedAt: new Date() };
        Object.entries(data).forEach(([key, val]) => {
          if (val !== undefined) updateData[key] = val === '' ? null : val;
        });
        await drizzle.update(warehouseSuppliers).set(updateData).where(eq(warehouseSuppliers.id, id));
        return { success: true };
      }),

    deleteSupplier: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        // Desvincula productos de este proveedor
        await drizzle.update(warehouseProducts).set({ supplierId: null }).where(eq(warehouseProducts.supplierId, input.id));
        await drizzle.delete(warehouseSuppliers).where(eq(warehouseSuppliers.id, input.id));
        return { success: true };
      }),

    // Resumen de inventario
    summary: protectedProcedure.query(async () => {
      const drizzle = await getDb();
      const products = await drizzle.select().from(warehouseProducts).where(eq(warehouseProducts.isActive, true));
      const tools = await drizzle.select().from(warehouseTools).where(eq(warehouseTools.isActive, true));
      const lowStockProducts = products.filter(p => p.currentStock !== null && p.minimumStock !== null && Number(p.currentStock) <= Number(p.minimumStock));
      const expiringProducts = products.filter(p => {
        if (!p.expirationDate) return false;
        const exp = new Date(p.expirationDate);
        const in30 = new Date(); in30.setDate(in30.getDate() + 30);
        return exp <= in30;
      });
      return {
        totalProducts: products.length, totalTools: tools.length,
        lowStockCount: lowStockProducts.length, lowStockProducts: lowStockProducts.map(p => ({ id: p.id, name: p.name, currentStock: p.currentStock, minimumStock: p.minimumStock, unit: p.unit })),
        expiringCount: expiringProducts.length, expiringProducts: expiringProducts.map(p => ({ id: p.id, name: p.name, expirationDate: p.expirationDate })),
        toolsByStatus: { disponible: tools.filter(t => t.status === 'disponible').length, en_uso: tools.filter(t => t.status === 'en_uso').length, mantenimiento: tools.filter(t => t.status === 'mantenimiento').length, dañado: tools.filter(t => t.status === 'dañado').length, baja: tools.filter(t => t.status === 'baja').length },
        totalInventoryValue: products.reduce((sum, p) => sum + (Number(p.costPerUnit) || 0) * (Number(p.currentStock) || 0), 0),
      };
    }),
  }),

  // ============ NOTAS DE CAMPO ============
  fieldNotes: router({
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        category: z.string().optional(),
        severity: z.string().optional(),
        parcelId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        const drizzle = await getDb();
        let conditions: any[] = [];
        if (input?.status) conditions.push(eq(fieldNotes.status, input.status as any));
        if (input?.category) conditions.push(eq(fieldNotes.category, input.category as any));
        if (input?.severity) conditions.push(eq(fieldNotes.severity, input.severity as any));
        if (input?.parcelId) conditions.push(eq(fieldNotes.parcelId, input.parcelId));

        // JOIN con users para obtener el nombre del reportero
        const baseQuery = drizzle
          .select({
            id: fieldNotes.id,
            folio: fieldNotes.folio,
            description: fieldNotes.description,
            category: fieldNotes.category,
            severity: fieldNotes.severity,
            status: fieldNotes.status,
            syncSource: fieldNotes.syncSource,
            parcelId: fieldNotes.parcelId,
            latitude: fieldNotes.latitude,
            longitude: fieldNotes.longitude,
            resolvedLatitude: fieldNotes.resolvedLatitude,
            resolvedLongitude: fieldNotes.resolvedLongitude,
            reportedByUserId: fieldNotes.reportedByUserId,
            reportedByName: users.name,
            resolutionNotes: fieldNotes.resolutionNotes,
            resolvedAt: fieldNotes.resolvedAt,
            createdAt: fieldNotes.createdAt,
            updatedAt: fieldNotes.updatedAt,
            assignedToCollaboratorId: fieldNotes.assignedToCollaboratorId,
          })
          .from(fieldNotes)
          .leftJoin(users, eq(fieldNotes.reportedByUserId, users.id))
          .orderBy(desc(fieldNotes.createdAt));

        const notes = conditions.length > 0
          ? await baseQuery.where(and(...conditions))
          : await baseQuery;

        // Cargar TODAS las fotos en una sola query (en vez de N+1)
        const noteIds = notes.map(n => n.id);
        let allPhotos: any[] = [];
        if (noteIds.length > 0) {
          allPhotos = await drizzle.select().from(fieldNotePhotos)
            .where(inArray(fieldNotePhotos.fieldNoteId, noteIds));
        }

        // Agrupar fotos por noteId
        const photosByNoteId = new Map<number, any[]>();
        for (const photo of allPhotos) {
          const list = photosByNoteId.get(photo.fieldNoteId) || [];
          list.push(photo);
          photosByNoteId.set(photo.fieldNoteId, list);
        }

        return notes.map(n => ({
          ...n,
          photos: photosByNoteId.get(n.id) || [],
        }));
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        const [note] = await drizzle.select().from(fieldNotes).where(eq(fieldNotes.id, input.id));
        if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Nota no encontrada" });
        const photos = await drizzle.select().from(fieldNotePhotos).where(eq(fieldNotePhotos.fieldNoteId, input.id));
        return { ...note, photos };
      }),

    create: protectedProcedure
      .input(z.object({
        description: z.string().min(1),
        category: z.string(),
        severity: z.string().optional(),
        parcelId: z.number().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        photoBase64: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const drizzle = await getDb();
        // Generar folio auto-incremental: NC-000001, NC-000002, etc.
        const [lastNote] = await drizzle.select({ folio: fieldNotes.folio }).from(fieldNotes).orderBy(desc(fieldNotes.id)).limit(1);
        let nextNum = 1;
        if (lastNote?.folio) {
          const match = lastNote.folio.match(/NC-(\d+)/);
          if (match) nextNum = parseInt(match[1], 10) + 1;
        }
        const folio = `NC-${String(nextNum).padStart(6, "0")}`;
        const userId = (ctx as any).user?.id || 0;

        const [result] = await drizzle.insert(fieldNotes).values({
          folio,
          description: input.description,
          category: input.category as any,
          severity: (input.severity || "media") as any,
          parcelId: input.parcelId || null,
          latitude: input.latitude ? String(input.latitude) : null,
          longitude: input.longitude ? String(input.longitude) : null,
          reportedByUserId: userId,
        });

        // Guardar foto del reporte si se proporcionó
        let savedPhotoPath: string | undefined;
        if (input.photoBase64) {
          const fs = await import("fs");
          const path = await import("path");
          const dir = `/app/photos/field-notes/${folio}`;
          fs.mkdirSync(dir, { recursive: true });
          const fileName = `reporte-${Date.now()}.jpg`;
          const filePath = path.join(dir, fileName);
          const buffer = Buffer.from(input.photoBase64, "base64");
          fs.writeFileSync(filePath, buffer);
          savedPhotoPath = filePath;
          const photoUrl = `/app/photos/field-notes/${folio}/${fileName}`;
          await drizzle.insert(fieldNotePhotos).values({
            fieldNoteId: result.insertId,
            photoPath: photoUrl,
            caption: "Foto del reporte",
            stage: "reporte" as any,
            uploadedByUserId: userId,
          });
        }

        // Notificar al grupo de Telegram
        try {
          const { notifyGroupNewNoteFromWeb } = await import("./telegramFieldNotesBot");
          let parcelName: string | undefined;
          if (input.parcelId) {
            const [parcel] = await drizzle.select({ name: parcels.name }).from(parcels).where(eq(parcels.id, input.parcelId));
            parcelName = parcel?.name || undefined;
          }
          const userName = (ctx as any).user?.name || "Usuario";
          await notifyGroupNewNoteFromWeb(
            result.insertId,
            folio,
            input.description,
            input.category,
            input.severity || "media",
            parcelName,
            userName,
            savedPhotoPath,
          );
        } catch (telegramError) {
          console.error("[FieldNotes] Error al notificar grupo Telegram:", telegramError);
        }

        return { id: result.insertId, folio };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        description: z.string().optional(),
        category: z.string().optional(),
        severity: z.string().optional(),
        parcelId: z.number().nullable().optional(),
        assignedToCollaboratorId: z.number().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const drizzle = await getDb();
        const { id, ...data } = input;
        await drizzle.update(fieldNotes).set(data as any).where(eq(fieldNotes.id, id));
        
        // Notificar por Telegram si se asignó a alguien
        if (input.assignedToCollaboratorId) {
          try {
            const [note] = await drizzle.select().from(fieldNotes).where(eq(fieldNotes.id, id));
            const [collab] = await drizzle.select().from(collaborators).where(eq(collaborators.id, input.assignedToCollaboratorId));
            if (note && collab) {
              let parcelName: string | undefined;
              if (note.parcelId) {
                const [parcel] = await drizzle.select({ name: parcels.name }).from(parcels).where(eq(parcels.id, note.parcelId));
                parcelName = parcel?.name || undefined;
              }
              const userName = (ctx as any).user?.name || "Usuario";
              const { notifyAssignment } = await import("./telegramFieldNotesBot");
              await notifyAssignment(id, note.folio, note.description, note.category, note.severity, collab.name, userName, parcelName);
            }
          } catch (err) {
            console.error("[FieldNotes] Error notificando asignación por Telegram:", err);
          }
        }
        return { success: true };
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.string(),
        resolutionNotes: z.string().optional(),
        photoBase64: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const drizzle = await getDb();
        const userId = (ctx as any).user?.id || 0;
        const updateData: any = { status: input.status };

        if (input.status === "resuelta" || input.status === "descartada") {
          updateData.resolvedByUserId = userId;
          updateData.resolvedAt = new Date();
          if (input.resolutionNotes) updateData.resolutionNotes = input.resolutionNotes;
          if (input.latitude) updateData.resolvedLatitude = String(input.latitude);
          if (input.longitude) updateData.resolvedLongitude = String(input.longitude);
        }

        await drizzle.update(fieldNotes).set(updateData).where(eq(fieldNotes.id, input.id));

        // Notificar cambio de estado por Telegram
        try {
          const [note] = await drizzle.select({ folio: fieldNotes.folio }).from(fieldNotes).where(eq(fieldNotes.id, input.id));
          const userName = (ctx as any).user?.name || "Usuario";
          const { notifyStatusChange } = await import("./telegramFieldNotesBot");
          await notifyStatusChange(input.id, note?.folio || `N-${input.id}`, input.status, userName, input.resolutionNotes);
        } catch (err) {
          console.error("[FieldNotes] Error notificando cambio de estado por Telegram:", err);
        }

        // Guardar foto de la etapa si se proporcionó
        if (input.photoBase64) {
          const fs = await import("fs");
          const path = await import("path");
          const [note] = await drizzle.select({ folio: fieldNotes.folio }).from(fieldNotes).where(eq(fieldNotes.id, input.id));
          const folioStr = note?.folio || `note-${input.id}`;
          const stage = (input.status === "resuelta" || input.status === "descartada") ? "resolucion" : "revision";
          const dir = `/app/photos/field-notes/${folioStr}`;
          fs.mkdirSync(dir, { recursive: true });
          const fileName = `${stage}-${Date.now()}.jpg`;
          const filePath = path.join(dir, fileName);
          const buffer = Buffer.from(input.photoBase64, "base64");
          fs.writeFileSync(filePath, buffer);
          const photoUrl = `/app/photos/field-notes/${folioStr}/${fileName}`;
          await drizzle.insert(fieldNotePhotos).values({
            fieldNoteId: input.id,
            photoPath: photoUrl,
            caption: stage === "resolucion" ? "Foto de resolución" : "Foto de revisión",
            stage: stage as any,
            uploadedByUserId: userId,
          });
        }

        // Enviar notificación por Telegram al usuario que reportó
        try {
          const { notifyNoteStatusChange } = await import("./telegramFieldNotesBot");
          const resolverName = (ctx as any).user?.name || "Sistema";
          await notifyNoteStatusChange(input.id, input.status, resolverName);
        } catch (telegramError) {
          console.error("[FieldNotes] Error al enviar notificación Telegram:", telegramError);
        }

        return { success: true };
      }),

    addComment: protectedProcedure
      .input(z.object({
        id: z.number(),
        comment: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const drizzle = await getDb();
        // Append comment to existing resolutionNotes with timestamp
        const [note] = await drizzle.select({ resolutionNotes: fieldNotes.resolutionNotes }).from(fieldNotes).where(eq(fieldNotes.id, input.id));
        const userName = (ctx as any).user?.name || "Usuario";
        const timestamp = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
        const newComment = `[${timestamp}] ${userName}: ${input.comment}`;
        const existingNotes = note?.resolutionNotes || "";
        const updatedNotes = existingNotes ? `${existingNotes}\n${newComment}` : newComment;
        await drizzle.update(fieldNotes).set({ resolutionNotes: updatedNotes }).where(eq(fieldNotes.id, input.id));
        return { success: true, comment: newComment };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        await drizzle.delete(fieldNotePhotos).where(eq(fieldNotePhotos.fieldNoteId, input.id));
        await drizzle.delete(fieldNotes).where(eq(fieldNotes.id, input.id));
        return { success: true };
      }),

    addPhoto: protectedProcedure
      .input(z.object({
        fieldNoteId: z.number(),
        photoBase64: z.string(),
        stage: z.enum(["reporte", "revision", "resolucion"]).optional(),
        caption: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const drizzle = await getDb();
        const userId = (ctx as any).user?.id || 0;
        const [note] = await drizzle.select({ folio: fieldNotes.folio }).from(fieldNotes).where(eq(fieldNotes.id, input.fieldNoteId));
        const folioStr = note?.folio || `note-${input.fieldNoteId}`;
        const stage = input.stage || "reporte";
        const fs = await import("fs");
        const pathMod = await import("path");
        const dir = `/app/photos/field-notes/${folioStr}`;
        fs.mkdirSync(dir, { recursive: true });
        const fileName = `${stage}-${Date.now()}.jpg`;
        const filePath = pathMod.join(dir, fileName);
        const buffer = Buffer.from(input.photoBase64, "base64");
        fs.writeFileSync(filePath, buffer);
        const photoUrl = `/app/photos/field-notes/${folioStr}/${fileName}`;
        const [result] = await drizzle.insert(fieldNotePhotos).values({
          fieldNoteId: input.fieldNoteId,
          photoPath: photoUrl,
          caption: input.caption || null,
          stage: stage as any,
          uploadedByUserId: userId,
        });
        return { id: result.insertId, url: photoUrl };
      }),

    deletePhoto: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        await drizzle.delete(fieldNotePhotos).where(eq(fieldNotePhotos.id, input.id));
        return { success: true };
      }),

    getPhotos: protectedProcedure
      .input(z.object({ fieldNoteId: z.number() }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        return drizzle.select().from(fieldNotePhotos).where(eq(fieldNotePhotos.fieldNoteId, input.fieldNoteId));
      }),

    summary: protectedProcedure.query(async () => {
      const drizzle = await getDb();
      const allNotes = await drizzle.select().from(fieldNotes);
      const open = allNotes.filter(n => n.status === "abierta").length;
      const inReview = allNotes.filter(n => n.status === "en_revision").length;
      const inProgress = allNotes.filter(n => n.status === "en_progreso").length;
      const resolved = allNotes.filter(n => n.status === "resuelta").length;
      const critical = allNotes.filter(n => n.severity === "critica" && n.status !== "resuelta" && n.status !== "descartada").length;
      return { total: allNotes.length, open, inReview, inProgress, resolved, critical };
    }),
  }),

  // ============================================================
  // Telegram Linking
  // ============================================================
  telegramLink: router({
    // Obtener estado de vinculación del usuario actual
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const drizzle = await getDb();
      const userId = (ctx as any).user?.id;
      if (!userId) return { linked: false };
      const [user] = await drizzle.select({
        telegramChatId: users.telegramChatId,
        telegramUsername: users.telegramUsername,
        telegramLinkedAt: users.telegramLinkedAt,
      }).from(users).where(eq(users.id, userId));
      if (!user?.telegramChatId) return { linked: false };
      return {
        linked: true,
        username: user.telegramUsername,
        linkedAt: user.telegramLinkedAt,
      };
    }),

    // Generar código de vinculación temporal
    // Si se pasa userId, genera código para ese usuario (admin)
    // Si no, genera para el usuario actual
    generateCode: protectedProcedure
      .input(z.object({ userId: z.number().optional() }).optional())
      .mutation(async ({ ctx, input }) => {
        const drizzle = await getDb();
        const currentUserId = (ctx as any).user?.id;
        if (!currentUserId) throw new Error("No autenticado");

        // Si se pasa userId, verificar que el usuario actual sea admin
        let targetUserId = currentUserId;
        if (input?.userId && input.userId !== currentUserId) {
          const [currentUser] = await drizzle.select({ role: users.role }).from(users).where(eq(users.id, currentUserId));
          if (currentUser?.role !== "admin") throw new Error("Solo administradores pueden vincular otros usuarios");
          targetUserId = input.userId;
        }

        // Generar código aleatorio de 6 caracteres
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code = "";
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        // Expira en 10 minutos
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        // Invalidar códigos anteriores del usuario
        await drizzle.update(telegramLinkCodes)
          .set({ used: true })
          .where(eq(telegramLinkCodes.userId, targetUserId));

        // Crear nuevo código
        await drizzle.insert(telegramLinkCodes).values({
          userId: targetUserId,
          code,
          expiresAt,
        });

        return { code, expiresAt: expiresAt.toISOString() };
      }),

    // Desvincular Telegram
    // Si se pasa userId, desvincula ese usuario (admin)
    unlink: protectedProcedure
      .input(z.object({ userId: z.number().optional() }).optional())
      .mutation(async ({ ctx, input }) => {
        const drizzle = await getDb();
        const currentUserId = (ctx as any).user?.id;
        if (!currentUserId) throw new Error("No autenticado");

        let targetUserId = currentUserId;
        if (input?.userId && input.userId !== currentUserId) {
          const [currentUser] = await drizzle.select({ role: users.role }).from(users).where(eq(users.id, currentUserId));
          if (currentUser?.role !== "admin") throw new Error("Solo administradores pueden desvincular otros usuarios");
          targetUserId = input.userId;
        }

        await drizzle.update(users).set({
          telegramChatId: null,
          telegramUsername: null,
          telegramLinkedAt: null,
        }).where(eq(users.id, targetUserId));
        return { success: true };
      }),
  }),

  // ============ COLABORADORES ============
  collaborators: router({
    // Listar todos los colaboradores
    list: protectedProcedure.query(async () => {
      const drizzle = await getDb();
      const result = await drizzle.select().from(collaborators).orderBy(desc(collaborators.createdAt));
      return result;
    }),

    // Crear colaborador
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        phone: z.string().optional(),
        role: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const drizzle = await getDb();
        const userId = (ctx as any).user?.id;
        if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
        const [result] = await drizzle.insert(collaborators).values({
          name: input.name,
          phone: input.phone || null,
          role: input.role || null,
          createdByUserId: userId,
        });
        return { success: true, id: result.insertId };
      }),

    // Actualizar colaborador
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1),
        phone: z.string().optional(),
        role: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        const updateData: any = { name: input.name };
        if (input.phone !== undefined) updateData.phone = input.phone || null;
        if (input.role !== undefined) updateData.role = input.role || null;
        if (input.isActive !== undefined) updateData.isActive = input.isActive;
        await drizzle.update(collaborators).set(updateData).where(eq(collaborators.id, input.id));
        return { success: true };
      }),

    // Eliminar (desactivar) colaborador
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        await drizzle.update(collaborators).set({ isActive: false }).where(eq(collaborators.id, input.id));
        return { success: true };
      }),

    // Generar código de vinculación de Telegram
    generateLinkCode: protectedProcedure
      .input(z.object({ collaboratorId: z.number() }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        // Generar código de 6 dígitos
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos
        // Invalidar códigos anteriores no usados
        await drizzle.update(collaboratorLinkCodes)
          .set({ used: true })
          .where(and(
            eq(collaboratorLinkCodes.collaboratorId, input.collaboratorId),
            eq(collaboratorLinkCodes.used, false),
          ));
        await drizzle.insert(collaboratorLinkCodes).values({
          collaboratorId: input.collaboratorId,
          code,
          expiresAt,
        });
        return { code, expiresAt: expiresAt.toISOString() };
      }),

    // Desvincular Telegram de un colaborador
    unlinkTelegram: protectedProcedure
      .input(z.object({ collaboratorId: z.number() }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        await drizzle.update(collaborators).set({
          telegramChatId: null,
          telegramUsername: null,
          telegramLinkedAt: null,
        }).where(eq(collaborators.id, input.collaboratorId));
        return { success: true };
      }),

    // Obtener asignaciones de un colaborador
    getAssignments: protectedProcedure
      .input(z.object({ collaboratorId: z.number() }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        const assignments = await drizzle.select()
          .from(fieldActivityAssignments)
          .where(eq(fieldActivityAssignments.collaboratorId, input.collaboratorId))
          .orderBy(desc(fieldActivityAssignments.createdAt));
        // Enriquecer con datos de la actividad
        const enriched = [];
        for (const a of assignments) {
          const [activity] = await drizzle.select().from(fieldActivities).where(eq(fieldActivities.id, a.activityId));
          const actParcels = await drizzle.select().from(fieldActivityParcels).where(eq(fieldActivityParcels.activityId, a.activityId));
          const parcelIds = actParcels.map(p => p.parcelId);
          let parcelNames: string[] = [];
          if (parcelIds.length > 0) {
            const parcelRows = await drizzle.select({ name: parcels.name }).from(parcels).where(inArray(parcels.id, parcelIds));
            parcelNames = parcelRows.map(p => p.name);
          }
          enriched.push({ ...a, activity: activity || null, parcelNames });
        }
        return enriched;
      }),

    // Asignar tarea a colaborador
    assignTask: protectedProcedure
      .input(z.object({
        activityId: z.number(),
        collaboratorId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const drizzle = await getDb();
        const userId = (ctx as any).user?.id;
        if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
        // Verificar que no exista ya la asignación
        const existing = await drizzle.select().from(fieldActivityAssignments)
          .where(and(
            eq(fieldActivityAssignments.activityId, input.activityId),
            eq(fieldActivityAssignments.collaboratorId, input.collaboratorId),
          ));
        if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Ya existe esta asignación" });
        const [result] = await drizzle.insert(fieldActivityAssignments).values({
          activityId: input.activityId,
          collaboratorId: input.collaboratorId,
          assignedByUserId: userId,
        });
        // Notificar al colaborador por Telegram si está vinculado
        try {
          const { notifyCollaboratorNewTask } = await import("./telegramCollaboratorBot");
          await notifyCollaboratorNewTask(input.collaboratorId, input.activityId);
        } catch (err) {
          console.error("[Collaborators] Error notificando por Telegram:", err);
        }
        return { success: true, id: result.insertId };
      }),

    // Desasignar tarea
    unassignTask: protectedProcedure
      .input(z.object({ assignmentId: z.number() }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        await drizzle.delete(fieldActivityAssignments).where(eq(fieldActivityAssignments.id, input.assignmentId));
        return { success: true };
      }),

    // Obtener asignaciones de una actividad
    getActivityAssignments: protectedProcedure
      .input(z.object({ activityId: z.number() }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        const assignments = await drizzle.select()
          .from(fieldActivityAssignments)
          .where(eq(fieldActivityAssignments.activityId, input.activityId));
        const enriched = [];
        for (const a of assignments) {
          const [collab] = await drizzle.select().from(collaborators).where(eq(collaborators.id, a.collaboratorId));
          enriched.push({ ...a, collaborator: collab || null });
        }
        return enriched;
      }),
  }),

  // ============ SINCRONIZACIÓN OFFLINE (App Móvil) ============
  offlineSync: router({
    // Sincronizar notas de campo desde la app móvil
    // IDEMPOTENTE: usa folio (UUID) como clave única
    syncFieldNotes: protectedProcedure
      .input(z.object({
        notes: z.array(z.object({
          folio: z.string().uuid(),
          description: z.string().min(1),
          category: z.enum([
            "arboles_mal_plantados", "plaga_enfermedad", "riego_drenaje",
            "dano_mecanico", "maleza", "fertilizacion", "suelo",
            "infraestructura", "fauna", "otro"
          ]),
          severity: z.enum(["baja", "media", "alta", "critica"]).optional(),
          parcelId: z.number().optional(),
          latitude: z.number().optional(),
          longitude: z.number().optional(),
          createdAtLocal: z.string().optional(), // ISO timestamp del dispositivo
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const drizzle = await getDb();
        const userId = (ctx as any).user?.id || 0;
        const results: { folio: string; status: "created" | "updated" | "error"; error?: string }[] = [];

        for (const note of input.notes) {
          try {
            // Verificar si la nota ya existe ANTES del upsert para saber si es nueva
            const [existingBefore] = await drizzle.select({ id: fieldNotes.id })
              .from(fieldNotes)
              .where(eq(fieldNotes.folio, note.folio))
              .limit(1);
            const isNew = !existingBefore;

            await drizzle.insert(fieldNotes).values({
              folio: note.folio,
              description: note.description,
              category: note.category as any,
              severity: (note.severity || "media") as any,
              syncSource: "mobile" as any,
              parcelId: note.parcelId || null,
              latitude: note.latitude ? String(note.latitude) : null,
              longitude: note.longitude ? String(note.longitude) : null,
              reportedByUserId: userId,
            }).onDuplicateKeyUpdate({
              set: {
                description: note.description,
                category: note.category as any,
                severity: (note.severity || "media") as any,
                parcelId: note.parcelId || null,
                latitude: note.latitude ? String(note.latitude) : null,
                longitude: note.longitude ? String(note.longitude) : null,
              },
            });

            results.push({ folio: note.folio, status: isNew ? "created" : "updated" });
          } catch (error: any) {
            console.error(`[OfflineSync] Error syncing folio ${note.folio}:`, error.message);
            results.push({ folio: note.folio, status: "error", error: error.message });
          }
        }

        // Notificar al grupo de Telegram sobre nuevas notas
        try {
          const { notifyGroupNewNoteFromWeb } = await import("./telegramFieldNotesBot");
          const userName = (ctx as any).user?.name || "App Móvil";
          for (const note of input.notes) {
            const result = results.find(r => r.folio === note.folio);
            if (result?.status === "created") {
              let parcelName: string | undefined;
              if (note.parcelId) {
                const [parcel] = await drizzle.select({ name: parcels.name })
                  .from(parcels).where(eq(parcels.id, note.parcelId));
                parcelName = parcel?.name || undefined;
              }
              const [dbNote] = await drizzle.select({ id: fieldNotes.id })
                .from(fieldNotes).where(eq(fieldNotes.folio, note.folio));
              if (dbNote) {
                await notifyGroupNewNoteFromWeb(
                  dbNote.id, note.folio, note.description,
                  note.category, note.severity || "media",
                  parcelName, userName, undefined,
                );
              }
            }
          }
        } catch (telegramError) {
          console.error("[OfflineSync] Error notificando Telegram:", telegramError);
        }

        return { success: true, results, syncedCount: results.filter(r => r.status !== "error").length };
      }),

    // Obtener notas actualizadas desde el servidor (sync bidireccional)
    getUpdatedNotes: protectedProcedure
      .input(z.object({
        since: z.string().optional(), // ISO timestamp
        limit: z.number().max(100).default(50),
      }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        let conditions: any[] = [];
        if (input.since) {
          conditions.push(gte(fieldNotes.updatedAt, new Date(input.since)));
        }
        const notes = conditions.length > 0
          ? await drizzle.select().from(fieldNotes).where(and(...conditions)).orderBy(desc(fieldNotes.updatedAt)).limit(input.limit)
          : await drizzle.select().from(fieldNotes).orderBy(desc(fieldNotes.updatedAt)).limit(input.limit);
        return notes;
      }),

    // Obtener parcelas (para selector offline)
    getParcels: protectedProcedure.query(async () => {
      const drizzle = await getDb();
      return drizzle.select({ id: parcels.id, code: parcels.code, name: parcels.name, polygon: parcels.polygon })
        .from(parcels)
        .where(eq(parcels.isActive, true))
        .orderBy(parcels.name);
    }),
  }),

  // ============================================
  // REPORTS — Datos agregados para reportes PDF
  // ============================================
  reports: router({
    getWeeklyData: protectedProcedure
      .input(z.object({
        parcelId: z.number(),
        parcelCode: z.string(),
        fromDate: z.string(),
        toDate: z.string(),
      }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });

        // 1. Datos de parcela
        const [parcel] = await drizzle.select().from(parcels).where(eq(parcels.id, input.parcelId));

        // 2. Cosecha - stats generales
        const harvestStats = await webodm.getParcelHarvestStats(input.parcelCode);

        // 3. Cosecha diaria (filtrar por rango)
        const allDaily = await webodm.getParcelDailyHarvest(input.parcelCode);
        const dailyHarvest = (allDaily || []).filter((d: any) => {
          return d.date >= input.fromDate && d.date <= input.toDate;
        });

        // 4. Datos satelitales del cache (solo stats, NO mapas - son muy pesados)
        const satelliteData: Record<string, any> = {};
        const indices = ["NDVI", "NDRE", "NDMI"];
        for (const idx of indices) {
          try {
            const rows = await drizzle.execute(
              sql`SELECT data, fetchedAt FROM parcelSatelliteCache WHERE parcelId = ${input.parcelId} AND dataType = 'stats' AND indexType = ${idx} AND mapDate IS NULL ORDER BY fetchedAt DESC LIMIT 1`
            );
            const statsRow = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0][0] : (rows as any)[0];
            if (statsRow) {
              const row = statsRow as any;
              const parsed = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
              satelliteData[idx] = { data: parsed, fetchedAt: row.fetchedAt };
            }
          } catch (e) { console.error(`[Reports] Error loading ${idx} stats:`, e); }
        }

        // 5. Notas de campo del período
        const notes = await drizzle.select({
          id: fieldNotes.id,
          folio: fieldNotes.folio,
          description: fieldNotes.description,
          category: fieldNotes.category,
          severity: fieldNotes.severity,
          status: fieldNotes.status,
          createdAt: fieldNotes.createdAt,
          updatedAt: fieldNotes.updatedAt,
          resolvedAt: fieldNotes.resolvedAt,
          resolutionNotes: fieldNotes.resolutionNotes,
        })
          .from(fieldNotes)
          .where(
            and(
              eq(fieldNotes.parcelId, input.parcelId),
              gte(fieldNotes.createdAt, new Date(input.fromDate + "T00:00:00")),
              lte(fieldNotes.createdAt, new Date(input.toDate + "T23:59:59")),
            )
          )
          .orderBy(desc(fieldNotes.createdAt));

        // 6. Clima del período
        let weatherData: any[] = [];
        try {
          const { getWeatherData } = await import("./weatherService");
          const locationConfig = await dbExt.getLocationConfig();
          if (locationConfig) {
            weatherData = await getWeatherData(
              locationConfig.latitude,
              locationConfig.longitude,
              input.fromDate,
              input.toDate,
              locationConfig.timezone
            );
          }
        } catch (e) { console.error("[Reports] Error loading weather:", e); }

        // 7. Análisis IA del cache
        let aiAnalysis: string | null = null;
        try {
          const [cached] = await drizzle.select()
            .from(parcelAiAnalysis)
            .where(eq(parcelAiAnalysis.parcelId, input.parcelId))
            .orderBy(desc(parcelAiAnalysis.createdAt))
            .limit(1);
          if (cached) {
            aiAnalysis = cached.analysis;
          }
        } catch (e) { console.error("[Reports] Error loading AI analysis:", e); }

        return {
          parcel: parcel ? {
            id: parcel.id,
            code: parcel.code,
            name: parcel.name,
            crop: (parcel as any).crop || null,
            variety: (parcel as any).variety || null,
            hectares: (parcel as any).hectares || (parcel as any).productiveHa || null,
          } : null,
          harvestStats,
          dailyHarvest,
          satelliteData,
          fieldNotes: notes,
          weatherData,
          aiAnalysis,
          period: { from: input.fromDate, to: input.toDate },
        };
      }),

    // Reporte general: todas las parcelas con polígono
    getGeneralData: protectedProcedure
      .input(z.object({
        fromDate: z.string(),
        toDate: z.string(),
      }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });

        // Solo parcelas activas con polígono
        const allParcels = await drizzle.select().from(parcels)
          .where(and(eq(parcels.isActive, true)));
        const parcelsWithPolygon = allParcels.filter(p => p.polygon && p.polygon.length > 10);

        const parcelSummaries: any[] = [];
        let totalHarvest = 0, totalFirstQ = 0, totalSecondQ = 0, totalWaste = 0, totalBoxes = 0;
        let totalNotes = 0, totalNotesResolved = 0, totalNotesOpen = 0;

        for (const p of parcelsWithPolygon) {
          const stats = await webodm.getParcelHarvestStats(p.code);
          const allDaily = await webodm.getParcelDailyHarvest(p.code);
          const daily = (allDaily || []).filter((d: any) => d.date >= input.fromDate && d.date <= input.toDate);
          const weekTotal = daily.reduce((s: number, d: any) => s + (d.totalWeight || 0), 0);
          const weekFirstQ = daily.reduce((s: number, d: any) => s + (d.firstQualityWeight || 0), 0);
          const weekSecondQ = daily.reduce((s: number, d: any) => s + (d.secondQualityWeight || 0), 0);
          const weekWaste = daily.reduce((s: number, d: any) => s + (d.wasteWeight || 0), 0);
          const weekBoxes = daily.reduce((s: number, d: any) => s + (d.totalBoxes || 0), 0);

          totalHarvest += weekTotal; totalFirstQ += weekFirstQ; totalSecondQ += weekSecondQ;
          totalWaste += weekWaste; totalBoxes += weekBoxes;

          // Notas
          const notes = await drizzle.select({
            id: fieldNotes.id, status: fieldNotes.status, category: fieldNotes.category,
            severity: fieldNotes.severity, createdAt: fieldNotes.createdAt, resolvedAt: fieldNotes.resolvedAt,
          })
            .from(fieldNotes)
            .where(and(
              eq(fieldNotes.parcelId, p.id),
              gte(fieldNotes.createdAt, new Date(input.fromDate + "T00:00:00")),
              lte(fieldNotes.createdAt, new Date(input.toDate + "T23:59:59")),
            ));
          const resolved = notes.filter(n => n.resolvedAt);
          const open = notes.filter(n => !n.resolvedAt);
          totalNotes += notes.length; totalNotesResolved += resolved.length; totalNotesOpen += open.length;

          // NDVI promedio y ultimo de la semana
          let ndviAvg: number | null = null;
          let ndviLast: number | null = null;
          try {
            let parsed: any[] | null = null;
            // 1. Try cache
            const rows = await drizzle.execute(
              sql`SELECT data FROM parcelSatelliteCache WHERE parcelId = ${p.id} AND dataType = 'stats' AND indexType = 'NDVI' AND mapDate IS NULL ORDER BY fetchedAt DESC LIMIT 1`
            );
            const statsRow = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0][0] : (rows as any)[0];
            if (statsRow) {
              parsed = typeof (statsRow as any).data === "string" ? JSON.parse((statsRow as any).data) : (statsRow as any).data;
            }
            // 2. Fallback: call copernicus API if no cache
            if (!parsed && p.polygon) {
              try {
                let geoPolygon: any = null;
                const polyData = typeof p.polygon === "string" ? JSON.parse(p.polygon as string) : p.polygon;
                if (Array.isArray(polyData)) {
                  const ring = polyData.map((pt: any) => [pt.lng || pt.longitude || pt[1], pt.lat || pt.latitude || pt[0]]);
                  if (ring.length > 0 && (ring[0][0] !== ring[ring.length-1][0] || ring[0][1] !== ring[ring.length-1][1])) ring.push([...ring[0]]);
                  geoPolygon = { type: "Polygon", coordinates: [ring] };
                } else if (polyData.type === "Polygon") { geoPolygon = polyData; }
                if (geoPolygon) {
                  const { getIndexHistory } = await import("./copernicusService");
                  const from90 = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
                  const toNow = new Date().toISOString().split("T")[0];
                  parsed = await getIndexHistory(geoPolygon, from90, toNow, "NDVI");
                }
              } catch (e2) { console.log(`[Reports] Copernicus fallback error for ${p.code}:`, e2); }
            }
            if (Array.isArray(parsed) && parsed.length > 0) {
              const means = parsed.filter((d: any) => d.mean != null).map((d: any) => d.mean);
              ndviAvg = means.length > 0 ? means.reduce((a: number, b: number) => a + b, 0) / means.length : null;
              // Last data point for weekly snapshot
              const lastPt = parsed.filter((d: any) => d.mean != null).pop();
              ndviLast = lastPt ? lastPt.mean : null;
            }
          } catch (e) { console.log(`[Reports] NDVI error for ${p.code}:`, e); }

          parcelSummaries.push({
            id: p.id, code: p.code, name: p.name || p.code || `Parcela ${p.id}`,
            crop: (p as any).crop || null,
            hectares: (p as any).hectares || (p as any).productiveHa || null,
            weekTotal: Math.round(weekTotal * 100) / 100,
            weekFirstQ: Math.round(weekFirstQ * 100) / 100,
            weekBoxes,
            activeDays: daily.length,
            ndviAvg: ndviAvg ? Math.round(ndviAvg * 10000) / 10000 : null,
            ndviLast: ndviLast ? Math.round(ndviLast * 10000) / 10000 : null,
            notesCount: notes.length,
            notesOpen: open.length,
            hasHarvest: weekTotal > 0,
          });
        }

        // Clima
        let weatherData: any[] = [];
        try {
          const { getWeatherData } = await import("./weatherService");
          const locationConfig = await dbExt.getLocationConfig();
          if (locationConfig) {
            weatherData = await getWeatherData(locationConfig.latitude, locationConfig.longitude, input.fromDate, input.toDate, locationConfig.timezone);
          }
        } catch (e) { /* ignore */ }

        // IA: Análisis semanal general
        let aiAnalysis: string | null = null;
        try {
          const { getGlobalSetting } = await import("./globalSettings");
          let apiKey = await getGlobalSetting("deepseekApiKey");
          if (apiKey) {
            // Decrypt if needed
            try {
              const { decryptSecret, isEncrypted } = await import("./encryption");
              if (isEncrypted(apiKey)) apiKey = decryptSecret(apiKey);
            } catch (e) { /* use as-is */ }
            const summaryLines = parcelSummaries.map((p: any) =>
              `${p.name}: ${p.weekTotal}kg cosechados, ${p.weekBoxes} cajas, NDVI prom ${p.ndviAvg || 'N/D'}, ${p.notesCount} notas (${p.notesOpen} abiertas)`
            ).join('\n');
            const weatherLine = weatherData.length > 0
              ? `Clima: Temp max prom ${(weatherData.reduce((s: any, d: any) => s + (d.temperatureMax || 0), 0) / weatherData.length).toFixed(1)}°C, min prom ${(weatherData.reduce((s: any, d: any) => s + (d.temperatureMin || 0), 0) / weatherData.length).toFixed(1)}°C, lluvia acum ${weatherData.reduce((s: any, d: any) => s + (d.precipitation || 0), 0).toFixed(1)}mm`
              : '';
            const prompt = `Analiza el estado semanal de esta operación agrícola (${input.fromDate} a ${input.toDate}):

Resumen por parcela:
${summaryLines}

Totales: ${totalHarvest.toFixed(1)}kg cosechados, ${totalBoxes} cajas, ${totalNotes} notas de campo (${totalNotesOpen} abiertas)
${weatherLine}

Da un análisis ejecutivo de 5-6 líneas máximo: estado general de la operación, parcelas que requieren atención (bajo NDVI o muchas notas abiertas), impacto del clima, y 1-2 recomendaciones. Tono profesional de ingeniero agrónomo. Responde en español.`;

            const response = await fetch("https://api.deepseek.com/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: "deepseek-v4-flash",
                messages: [{ role: "system", content: "Eres un ingeniero agrónomo senior. Respondes de forma concisa y profesional en español." }, { role: "user", content: prompt }],
                max_tokens: 600,
                temperature: 0.4,
              }),
            });
            if (response.ok) {
              const result = await response.json();
              aiAnalysis = result.choices?.[0]?.message?.content || null;
            }
          }
        } catch (e) { console.error("[Reports] Error generating AI analysis:", e); }

        return {
          aiAnalysis,
          parcels: parcelSummaries,
          totals: {
            harvest: Math.round(totalHarvest * 100) / 100,
            firstQ: Math.round(totalFirstQ * 100) / 100,
            secondQ: Math.round(totalSecondQ * 100) / 100,
            waste: Math.round(totalWaste * 100) / 100,
            boxes: totalBoxes,
            notes: totalNotes,
            notesResolved: totalNotesResolved,
            notesOpen: totalNotesOpen,
            parcelsCount: parcelsWithPolygon.length,
          },
          weatherData,
          period: { from: input.fromDate, to: input.toDate },
        };
      }),

    getSpatialAnalysis: protectedProcedure
      .input(z.object({ parcelId: z.number() }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        if (!drizzle) return { quadrants: [], summary: null };
        try {
          const [parcel] = await drizzle.select().from(parcels).where(eq(parcels.id, input.parcelId));
          if (!parcel || !parcel.polygon) return { quadrants: [], summary: null };
          
          const polyData = typeof parcel.polygon === "string" ? JSON.parse(parcel.polygon as string) : parcel.polygon;
          let coords: [number, number][];
          if (Array.isArray(polyData) && polyData.length > 0 && (polyData[0].lat !== undefined || polyData[0].latitude !== undefined)) {
            coords = polyData.map((pt: any) => [pt.lng || pt.longitude || pt[1], pt.lat || pt.latitude || pt[0]]);
          } else if (polyData.type === "Polygon") {
            coords = polyData.coordinates[0];
          } else return { quadrants: [], summary: null };
          
          // Get bounding box
          const lngs = coords.map(c => c[0]);
          const lats = coords.map(c => c[1]);
          const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
          const minLat = Math.min(...lats), maxLat = Math.max(...lats);
          const dLng = (maxLng - minLng) / 3;
          const dLat = (maxLat - minLat) / 3;
          
          const { getIndexHistory } = await import("./copernicusService");
          const toDate = new Date().toISOString().split("T")[0];
          const fromDate = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
          
          const labels = ["NO", "N", "NE", "O", "Centro", "E", "SO", "S", "SE"];
          const quadrants: any[] = [];
          
          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
              const qMinLng = minLng + col * dLng;
              const qMaxLng = minLng + (col + 1) * dLng;
              const qMinLat = maxLat - (row + 1) * dLat; // top-down
              const qMaxLat = maxLat - row * dLat;
              const qPoly = {
                type: "Polygon",
                coordinates: [[
                  [qMinLng, qMinLat], [qMaxLng, qMinLat],
                  [qMaxLng, qMaxLat], [qMinLng, qMaxLat],
                  [qMinLng, qMinLat]
                ]]
              };
              const label = labels[row * 3 + col];
              const result: any = { label, row, col, ndvi: null, ndre: null, ndmi: null };
              try {
                for (const idx of ["NDVI", "NDRE", "NDMI"] as const) {
                  const hist = await getIndexHistory(qPoly, fromDate, toDate, idx);
                  if (hist && hist.length > 0) {
                    const lastPt = hist.filter((d: any) => d.mean != null).pop();
                    result[idx.toLowerCase()] = lastPt ? {
                      mean: Math.round(lastPt.mean * 10000) / 10000,
                      min: lastPt.min != null ? Math.round(lastPt.min * 10000) / 10000 : null,
                      max: lastPt.max != null ? Math.round(lastPt.max * 10000) / 10000 : null,
                      stDev: lastPt.stDev != null ? Math.round(lastPt.stDev * 10000) / 10000 : null,
                    } : null;
                  }
                }
              } catch (e) { console.log(`[SpatialAnalysis] Error for quadrant ${label}:`, e); }
              quadrants.push(result);
            }
          }
          
          // Identify problem zones (low NDVI or high variability)
          const withNdvi = quadrants.filter(q => q.ndvi?.mean != null);
          const avgNdvi = withNdvi.length ? withNdvi.reduce((s, q) => s + q.ndvi.mean, 0) / withNdvi.length : null;
          const problemZones = withNdvi
            .filter(q => avgNdvi && q.ndvi.mean < avgNdvi * 0.85)
            .map(q => ({ label: q.label, ndvi: q.ndvi.mean, diff: avgNdvi ? Math.round((q.ndvi.mean - avgNdvi) * 10000) / 10000 : 0 }));
          
          return {
            quadrants,
            summary: {
              avgNdvi: avgNdvi ? Math.round(avgNdvi * 10000) / 10000 : null,
              problemZones,
              totalQuadrants: quadrants.length,
              withData: withNdvi.length,
            }
          };
        } catch (e) {
          console.error("[SpatialAnalysis] Error:", e);
          return { quadrants: [], summary: null };
        }
      }),

    // Mapa satelital individual (separado para no sobrecargar)
    getSatelliteMap: protectedProcedure
      .input(z.object({ parcelId: z.number(), indexType: z.string() }))
      .query(async ({ input }) => {
        const drizzle = await getDb();
        if (!drizzle) return { image: null };
        try {
          const rows = await drizzle.execute(
            sql`SELECT data FROM parcelSatelliteCache WHERE parcelId = ${input.parcelId} AND dataType = 'map' AND indexType = ${input.indexType} ORDER BY fetchedAt DESC LIMIT 1`
          );
          const mapRow = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0][0] : (rows as any)[0];
          return { image: mapRow ? (mapRow as any).data : null };
        } catch (e) { return { image: null }; }
      }),
  }),

  // ══════ LABELS ══════
  getLastFolio: protectedProcedure
    .query(async () => {
      const drizzle = await getDb();
      if (!drizzle) return { lastFolio: 0 };
      const [last] = await drizzle.select({ folioEnd: labelPrintHistory.folioEnd }).from(labelPrintHistory).orderBy(desc(labelPrintHistory.folioEnd)).limit(1);
      return { lastFolio: last?.folioEnd || 0 };
    }),

  printLabels: protectedProcedure
    .input(z.object({
      harvesterNumber: z.number(),
      labelText: z.string(),
      folioStart: z.number(),
      folioEnd: z.number(),
      quantity: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await drizzle.insert(labelPrintHistory).values({
        harvesterNumber: input.harvesterNumber,
        labelText: input.labelText,
        folioStart: input.folioStart,
        folioEnd: input.folioEnd,
        quantity: input.quantity,
        printedBy: (ctx as any).user?.id || null,
      });
      return { success: true };
    }),

  labelHistory: protectedProcedure
    .query(async () => {
      const drizzle = await getDb();
      if (!drizzle) return [];
      return await drizzle.select().from(labelPrintHistory).orderBy(desc(labelPrintHistory.printedAt)).limit(50);
    }),
});
export type AppRouter = typeof appRouter;
