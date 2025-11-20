import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "./_core/trpcNew";
import { COOKIE_NAME } from "./_core/authContext";
import { loginUser, registerUser, hashPassword } from "./auth";
import * as db from "./db";
import * as dbExt from "./db_extended";
import { getDb } from "./db";
import { boxes, harvesters, parcels } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const appRouter = router({
  auth: router({
    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { user, token } = await loginUser(input.email, input.password);
        
        // Establecer cookie
        // secure: false permite HTTP (cambiar a true si usas HTTPS)
        ctx.res.cookie(COOKIE_NAME, token, {
          httpOnly: true,
          secure: false, // Cambiar a true si usas HTTPS
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

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getBoxById(input.id);
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

        // Insertar o actualizar parcelas con polígonos
        for (const poly of polygons) {
          await dbExt.upsertParcel({
            code: poly.code,
            name: poly.name,
            polygon: JSON.stringify(poly.coordinates),
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
        permissions: z.object({
          canViewDashboard: z.boolean(),
          canViewBoxes: z.boolean(),
          canViewAnalytics: z.boolean(),
          canViewDailyAnalysis: z.boolean(),
          canViewParcels: z.boolean(),
          canViewHarvesters: z.boolean(),
          canViewErrors: z.boolean(),
        }),
      }))
      .mutation(async ({ input }) => {
        await db.updateUserPermissions(input.userId, input.permissions);
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
              total: 0,
              weight: 0,
              firstQuality: 0,
              secondQuality: 0,
              waste: 0,
              firstQualityWeight: 0,
              secondQualityWeight: 0,
              wasteWeight: 0,
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
