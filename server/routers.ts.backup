import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Routers de configuración de API (solo admin)
  apiConfig: router({
    get: protectedProcedure.query(async () => {
      const { getApiConfig } = await import("./db");
      const config = await getApiConfig();
      return config || null;
    }),
    save: protectedProcedure
      .input(z.object({
        apiUrl: z.string(),
        apiToken: z.string(),
        assetId: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Solo administradores pueden configurar la API");
        }
        const { upsertApiConfig } = await import("./db");
        await upsertApiConfig(input);
        return { success: true };
      }),
  }),

  // Routers de harvesters/cortadoras
  harvesters: router({
    list: protectedProcedure.query(async () => {
      const { getAllHarvesters } = await import("./db");
      return await getAllHarvesters();
    }),
    update: protectedProcedure
      .input(z.object({
        number: z.number(),
        customName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Solo administradores pueden actualizar cortadoras");
        }
        const { upsertHarvester } = await import("./db");
        await upsertHarvester(input);
        return { success: true };
      }),
  }),

  // Routers de cajas
  boxes: router({
    list: protectedProcedure.query(async () => {
      const { getAllBoxes } = await import("./db");
      return await getAllBoxes();
    }),
    getById: protectedProcedure
      .input(z.number())
      .query(async ({ input }) => {
        const { getBoxById } = await import("./db");
        return await getBoxById(input);
      }),
    syncFromKobo: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Solo administradores pueden sincronizar datos");
      }
      const { getApiConfig, upsertBox, upsertHarvester, updateLastSync } = await import("./db");
      const config = await getApiConfig();
      if (!config) {
        throw new Error("Configuración de API no encontrada");
      }

      // Llamar a la API de KoboToolbox
      const response = await fetch(`${config.apiUrl}/api/v2/assets/${config.assetId}/data.json`, {
        headers: {
          Authorization: `Token ${config.apiToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Error al sincronizar: ${response.statusText}`);
      }

      const data = await response.json();
      const results = data.results || [];

      let count = 0;
      for (const item of results) {
        const boxCode = item.escanea_la_caja;
        if (!boxCode) continue;

        // Extraer número de cortadora del código de caja (formato: XX-XXXXXX)
        const parts = boxCode.split("-");
        if (parts.length !== 2) continue;
        const harvesterNumber = parseInt(parts[0]);
        if (isNaN(harvesterNumber)) continue;

        // Asegurar que la cortadora existe
        await upsertHarvester({ number: harvesterNumber });

        // Extraer URLs de fotos
        const attachments = item._attachments || [];
        const photoAttachment = attachments.find((a: any) => a.question_xpath === "foto_de_la_caja");

        // Convertir peso a gramos (entero)
        const weightKg = parseFloat(item.peso_de_la_caja || "0");
        const weightGrams = Math.round(weightKg * 1000);

        // Extraer coordenadas
        const geolocation = item._geolocation || [];
        const latitude = geolocation[0]?.toString() || null;
        const longitude = geolocation[1]?.toString() || null;

        await upsertBox({
          koboId: item._id,
          boxCode,
          harvesterId: harvesterNumber,
          parcelCode: item.escanea_la_parcela || "",
          parcelName: item.escanea_la_parcela || "",
          weight: weightGrams,
          photoFilename: photoAttachment?.media_file_basename || null,
          photoUrl: photoAttachment?.download_url || null,
          photoLargeUrl: photoAttachment?.download_large_url || null,
          photoMediumUrl: photoAttachment?.download_medium_url || null,
          photoSmallUrl: photoAttachment?.download_small_url || null,
          latitude,
          longitude,
          submissionTime: new Date(item._submission_time),
        });
        count++;
      }

      await updateLastSync();
      return { success: true, count };
    }),
    uploadJson: protectedProcedure
      .input(z.object({
        jsonData: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Solo administradores pueden cargar JSON");
        }
        const { upsertBox, upsertHarvester } = await import("./db");
        const data = JSON.parse(input.jsonData);
        const results = data.results || [];

        let count = 0;
        for (const item of results) {
          const boxCode = item.escanea_la_caja;
          if (!boxCode) continue;

          const parts = boxCode.split("-");
          if (parts.length !== 2) continue;
          const harvesterNumber = parseInt(parts[0]);
          if (isNaN(harvesterNumber)) continue;

          await upsertHarvester({ number: harvesterNumber });

          const attachments = item._attachments || [];
          const photoAttachment = attachments.find((a: any) => a.question_xpath === "foto_de_la_caja");

          const weightKg = parseFloat(item.peso_de_la_caja || "0");
          const weightGrams = Math.round(weightKg * 1000);

          const geolocation = item._geolocation || [];
          const latitude = geolocation[0]?.toString() || null;
          const longitude = geolocation[1]?.toString() || null;

          await upsertBox({
            koboId: item._id,
            boxCode,
            harvesterId: harvesterNumber,
            parcelCode: item.escanea_la_parcela || "",
            parcelName: item.escanea_la_parcela || "",
            weight: weightGrams,
            photoFilename: photoAttachment?.media_file_basename || null,
            photoUrl: photoAttachment?.download_url || null,
            photoLargeUrl: photoAttachment?.download_large_url || null,
            photoMediumUrl: photoAttachment?.download_medium_url || null,
            photoSmallUrl: photoAttachment?.download_small_url || null,
            latitude,
            longitude,
            submissionTime: new Date(item._submission_time),
          });
          count++;
        }

        return { success: true, count };
      }),
  }),

  // Routers de usuarios (admin)
  usersAdmin: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Solo administradores pueden listar usuarios");
      }
      const { getAllUsers } = await import("./db");
      return await getAllUsers();
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        email: z.string().email(),
        role: z.enum(["user", "admin"]).default("user"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Solo administradores pueden crear usuarios");
        }
        const { createManualUser } = await import("./db");
        await createManualUser(input);
        return { success: true };
      }),
    updateRole: protectedProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(["user", "admin"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Solo administradores pueden actualizar roles");
        }
        const { updateUserRole } = await import("./db");
        await updateUserRole(input.userId, input.role);
        return { success: true };
      }),
  }),

  // Routers de estadísticas y análisis
  analytics: router({
    getStats: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const { getBoxesWithFilters } = await import("./db");
        const boxes = await getBoxesWithFilters(input.startDate, input.endDate);
        
        const total = boxes.length;
        const totalWeight = boxes.reduce((sum, box) => sum + box.weight, 0) / 1000;
        
        const firstQuality = boxes.filter(b => b.harvesterId !== 98 && b.harvesterId !== 99).length;
        const secondQuality = boxes.filter(b => b.harvesterId === 98).length;
        const waste = boxes.filter(b => b.harvesterId === 99).length;
        
        // Estadísticas por parcela
        const parcelStats = boxes.reduce((acc, box) => {
          const key = box.parcelCode;
          if (!acc[key]) {
            acc[key] = {
              parcelCode: box.parcelCode,
              parcelName: box.parcelName,
              total: 0,
              weight: 0,
              firstQuality: 0,
              secondQuality: 0,
              waste: 0,
            };
          }
          acc[key].total++;
          acc[key].weight += box.weight;
          if (box.harvesterId === 98) acc[key].secondQuality++;
          else if (box.harvesterId === 99) acc[key].waste++;
          else acc[key].firstQuality++;
          return acc;
        }, {} as Record<string, any>);
        
        // Estadísticas por cortadora
        const harvesterStats = boxes.reduce((acc, box) => {
          const key = box.harvesterId;
          if (!acc[key]) {
            acc[key] = {
              harvesterId: box.harvesterId,
              total: 0,
              weight: 0,
            };
          }
          acc[key].total++;
          acc[key].weight += box.weight;
          return acc;
        }, {} as Record<number, any>);
        
        return {
          total,
          totalWeight,
          firstQuality,
          secondQuality,
          waste,
          firstQualityPercent: total > 0 ? (firstQuality / total * 100).toFixed(1) : "0",
          secondQualityPercent: total > 0 ? (secondQuality / total * 100).toFixed(1) : "0",
          wastePercent: total > 0 ? (waste / total * 100).toFixed(1) : "0",
          parcelStats: Object.values(parcelStats),
          harvesterStats: Object.values(harvesterStats),
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
