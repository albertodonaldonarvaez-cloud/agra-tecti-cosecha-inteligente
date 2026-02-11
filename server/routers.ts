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
});

export type AppRouter = typeof appRouter;
