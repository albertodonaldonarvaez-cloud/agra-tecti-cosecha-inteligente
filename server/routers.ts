import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "./_core/trpcNew";
import { COOKIE_NAME } from "./_core/authContext";
import { loginUser, registerUser, hashPassword, comparePassword } from "./auth";
import * as db from "./db";
import * as dbExt from "./db_extended";
import * as webodm from "./webodmService";
import { getDb } from "./db";
import { boxes, harvesters, parcels, parcelDetails, fieldActivities, fieldActivityParcels, fieldActivityProducts, fieldActivityTools, fieldActivityPhotos, warehouseSuppliers, warehouseProducts, warehouseTools, warehouseProductMovements, warehouseToolAssignments } from "../drizzle/schema";
import { eq, desc, and, gte, lte, inArray, sql } from "drizzle-orm";

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

        // Enriquecer con parcelas, productos, herramientas y fotos
        const enriched = await Promise.all(activities.map(async (act) => {
          const [actParcels, actProducts, actTools, actPhotos] = await Promise.all([
            drizzle.select().from(fieldActivityParcels).where(eq(fieldActivityParcels.activityId, act.id)),
            drizzle.select().from(fieldActivityProducts).where(eq(fieldActivityProducts.activityId, act.id)),
            drizzle.select().from(fieldActivityTools).where(eq(fieldActivityTools.activityId, act.id)),
            drizzle.select().from(fieldActivityPhotos).where(eq(fieldActivityPhotos.activityId, act.id)),
          ]);

          // Obtener nombres de parcelas
          let parcelNames: { id: number; name: string }[] = [];
          if (actParcels.length > 0) {
            const parcelIds = actParcels.map(p => p.parcelId);
            const parcelRows = await drizzle.select({ id: parcels.id, name: parcels.name }).from(parcels).where(inArray(parcels.id, parcelIds));
            parcelNames = parcelRows;
          }

          return {
            ...act,
            parcels: parcelNames,
            products: actProducts,
            tools: actTools,
            photos: actPhotos,
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
        performedBy: z.string(),
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
          performedBy: input.performedBy,
          activityDate: input.activityDate,
          startTime: input.startTime || null,
          endTime: input.endTime || null,
          durationMinutes: duration || null,
          weatherCondition: input.weatherCondition || null,
          temperature: input.temperature || null,
          status: (input.status as any) || "completada",
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
      }))
      .mutation(async ({ input }) => {
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
        storageLocation: z.string().optional(), expirationDate: z.string().optional(),
        safetyDataSheet: z.string().optional(), description: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        const result = await drizzle.insert(warehouseProducts).values({
          name: input.name, category: input.category as any, brand: input.brand || null,
          activeIngredient: input.activeIngredient || null, concentration: input.concentration || null,
          presentation: input.presentation || null, unit: input.unit as any,
          currentStock: String(input.currentStock ?? 0), minimumStock: String(input.minimumStock ?? 0),
          costPerUnit: input.costPerUnit ? String(input.costPerUnit) : null,
          supplierId: input.supplierId ?? null,
          supplier: input.supplier || null, supplierContact: input.supplierContact || null,
          lotNumber: input.lotNumber || null, photoUrl: input.photoUrl || null,
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
        photoUrl: z.string().optional(), description: z.string().optional(),
        storageLocation: z.string().optional(), expirationDate: z.string().optional(),
        safetyDataSheet: z.string().optional(), isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const drizzle = await getDb();
        const { id, ...data } = input;
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
        if (data.photoUrl !== undefined) updateData.photoUrl = data.photoUrl || null;
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
});
export type AppRouter = typeof appRouter;
