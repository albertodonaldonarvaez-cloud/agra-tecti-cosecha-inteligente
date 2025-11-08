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
      return await getApiConfig();
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
});

export type AppRouter = typeof appRouter;
