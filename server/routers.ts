import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "./_core/trpcNew";
import { COOKIE_NAME } from "./_core/authContext";
import { loginUser, registerUser, hashPassword } from "./auth";
import * as db from "./db";

export const appRouter = router({
  auth: router({
    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { user, token } = await loginUser(input.email, input.password);
        
        // Establecer cookie
        ctx.res.cookie(COOKIE_NAME, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
        });
        
        return { success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
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

  boxes: router({
    list: protectedProcedure.query(async () => {
      return await db.getAllBoxes();
    }),

    sync: adminProcedure
      .mutation(async () => {
        const { syncFromKoboAPI } = await import("./koboSync");
        const config = await db.getApiConfig();
        
        if (!config || !config.apiUrl || !config.apiToken || !config.assetId) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "Configuración de API incompleta. Por favor configura la API primero." 
          });
        }

        const result = await syncFromKoboAPI(config.apiUrl, config.apiToken, config.assetId);
        await db.updateLastSync();
        
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
  }),

  analytics: router({
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
        const totalWeight = boxes.reduce((sum, box) => sum + box.weight, 0);
        
        const firstQuality = boxes.filter(b => b.harvesterId !== 98 && b.harvesterId !== 99).length;
        const secondQuality = boxes.filter(b => b.harvesterId === 98).length;
        const waste = boxes.filter(b => b.harvesterId === 99).length;
        
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
              total: 0,
              weight: 0,
              firstQuality: 0,
              secondQuality: 0,
              waste: 0,
            });
          }
          const parcel = parcelMap.get(box.parcelCode);
          parcel.total++;
          parcel.weight += box.weight;
          if (box.harvesterId === 98) parcel.secondQuality++;
          else if (box.harvesterId === 99) parcel.waste++;
          else parcel.firstQuality++;
        });

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

        return {
          total,
          totalWeight,
          firstQuality,
          secondQuality,
          waste,
          firstQualityPercent,
          secondQualityPercent,
          wastePercent,
          parcelStats: Array.from(parcelMap.values()),
          harvesterStats: Array.from(harvesterMap.values()),
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
});

export type AppRouter = typeof appRouter;
