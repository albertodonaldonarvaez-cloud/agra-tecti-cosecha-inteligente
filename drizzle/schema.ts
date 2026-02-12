import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  name: text("name").notNull(),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // Permisos granulares para usuarios no-admin
  // NOTA: Estos campos deben coincidir con permissionKey en client/src/config/pages.ts
  canViewDashboard: boolean("canViewDashboard").default(true).notNull(),
  canViewBoxes: boolean("canViewBoxes").default(true).notNull(),
  canViewAnalytics: boolean("canViewAnalytics").default(true).notNull(),
  canViewDailyAnalysis: boolean("canViewDailyAnalysis").default(true).notNull(),
  canViewClimate: boolean("canViewClimate").default(true).notNull(),
  canViewPerformance: boolean("canViewPerformance").default(true).notNull(),
  canViewParcelAnalysis: boolean("canViewParcelAnalysis").default(true).notNull(),
  canViewParcels: boolean("canViewParcels").default(false).notNull(),
  canViewHarvesters: boolean("canViewHarvesters").default(false).notNull(),
  canViewEditor: boolean("canViewEditor").default(false).notNull(),
  canViewErrors: boolean("canViewErrors").default(false).notNull(),
  // Campos de personalización de perfil
  avatarColor: varchar("avatarColor", { length: 32 }).default("#16a34a"),
  avatarEmoji: varchar("avatarEmoji", { length: 16 }).default("🌿"),
  bio: varchar("bio", { length: 255 }),
  phone: varchar("phone", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Tabla de logs de actividad de usuarios
export const userActivityLogs = mysqlTable("userActivityLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  action: mysqlEnum("action", ["login", "logout", "page_view", "page_leave"]).notNull(),
  page: varchar("page", { length: 255 }),
  pageName: varchar("pageName", { length: 255 }),
  sessionId: varchar("sessionId", { length: 128 }),
  durationSeconds: int("durationSeconds"), // Duración en la página (solo para page_leave)
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: varchar("userAgent", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserActivityLog = typeof userActivityLogs.$inferSelect;
export type InsertUserActivityLog = typeof userActivityLogs.$inferInsert;

// Tabla de parcelas con polígonos geográficos
export const parcels = mysqlTable("parcels", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  polygon: text("polygon"), // GeoJSON del polígono de la parcela
  isActive: boolean("isActive").default(true).notNull(), // Parcela activa/válida
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Parcel = typeof parcels.$inferSelect;
export type InsertParcel = typeof parcels.$inferInsert;

// Tabla de cortadoras/cosechadoras
export const harvesters = mysqlTable("harvesters", {
  id: int("id").autoincrement().primaryKey(),
  number: int("number").notNull().unique(), // 01-96, 97 (recolecta), 98 (segunda), 99 (desperdicio)
  customName: varchar("customName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Harvester = typeof harvesters.$inferSelect;
export type InsertHarvester = typeof harvesters.$inferInsert;

// Tabla de cajas
export const boxes = mysqlTable("boxes", {
  id: int("id").autoincrement().primaryKey(),
  koboId: int("koboId"), // ID desde KoboToolbox (puede ser null o duplicado)
  boxCode: varchar("boxCode", { length: 64 }).notNull(), // Formato: XX-XXXXXX (sin UNIQUE para permitir códigos repetidos de diferentes días)
  harvesterId: int("harvesterId").notNull(),
  parcelCode: varchar("parcelCode", { length: 64 }).notNull(),
  parcelName: varchar("parcelName", { length: 255 }).notNull(),
  weight: int("weight").notNull(), // Peso en gramos para evitar decimales
  photoFilename: varchar("photoFilename", { length: 255 }),
  photoUrl: text("photoUrl"),
  photoLargeUrl: text("photoLargeUrl"),
  photoMediumUrl: text("photoMediumUrl"),
  photoSmallUrl: text("photoSmallUrl"),
  latitude: varchar("latitude", { length: 64 }),
  longitude: varchar("longitude", { length: 64 }),
  submissionTime: timestamp("submissionTime").notNull(),
  manuallyEdited: boolean("manuallyEdited").default(false).notNull(), // Protege la caja de ser sobrescrita en sincronizaciones
  editedAt: timestamp("editedAt"), // Fecha de última edición manual
  originalBoxCode: varchar("originalBoxCode", { length: 64 }), // Código original antes de editar (para rastreo)
  archived: boolean("archived").default(false).notNull(), // Cajas archivadas no aparecen en dashboard
  archivedAt: timestamp("archivedAt"), // Fecha de archivado
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Box = typeof boxes.$inferSelect;
export type InsertBox = typeof boxes.$inferInsert;

// Tabla de configuración de API de KoboToolbox
export const apiConfig = mysqlTable("apiConfig", {
  id: int("id").autoincrement().primaryKey(),
  apiUrl: varchar("apiUrl", { length: 512 }).notNull(),
  apiToken: varchar("apiToken", { length: 512 }).notNull(),
  assetId: varchar("assetId", { length: 128 }).notNull(),
  telegramBotToken: varchar("telegramBotToken", { length: 512 }),
  telegramChatId: varchar("telegramChatId", { length: 128 }),
  lastSync: timestamp("lastSync"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApiConfig = typeof apiConfig.$inferSelect;
export type InsertApiConfig = typeof apiConfig.$inferInsert;

// Tabla de errores de validación de carga
export const uploadErrors = mysqlTable("uploadErrors", {
  id: int("id").autoincrement().primaryKey(),
  uploadBatchId: varchar("uploadBatchId", { length: 64 }).notNull(), // ID único del lote de carga
  errorType: mysqlEnum("errorType", [
    "duplicate_box",
    "invalid_parcel",
    "missing_data",
    "invalid_format",
    "photo_download_failed",
    "other"
  ]).notNull(),
  boxCode: varchar("boxCode", { length: 64 }),
  parcelCode: varchar("parcelCode", { length: 64 }),
  errorMessage: text("errorMessage").notNull(),
  rowData: text("rowData"), // JSON con los datos de la fila que causó el error
  resolved: boolean("resolved").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UploadError = typeof uploadErrors.$inferSelect;
export type InsertUploadError = typeof uploadErrors.$inferInsert;

// Tabla de lotes de carga
export const uploadBatches = mysqlTable("uploadBatches", {
  id: int("id").autoincrement().primaryKey(),
  batchId: varchar("batchId", { length: 64 }).notNull().unique(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  totalRows: int("totalRows").notNull(),
  successRows: int("successRows").notNull(),
  errorRows: int("errorRows").notNull(),
  status: mysqlEnum("status", ["processing", "completed", "failed"]).notNull(),
  uploadedBy: int("uploadedBy").notNull(), // ID del usuario que subió
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type UploadBatch = typeof uploadBatches.$inferSelect;
export type InsertUploadBatch = typeof uploadBatches.$inferInsert;

// Tabla de configuración de ubicación para datos meteorológicos
export const locationConfig = mysqlTable("locationConfig", {
  id: int("id").autoincrement().primaryKey(),
  locationName: varchar("locationName", { length: 255 }).notNull(), // Ej: "Santa Rosa Treinta"
  latitude: varchar("latitude", { length: 64 }).notNull(), // Ej: "18.693"
  longitude: varchar("longitude", { length: 64 }).notNull(), // Ej: "-99.182"
  timezone: varchar("timezone", { length: 64 }).default("America/Mexico_City").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LocationConfig = typeof locationConfig.$inferSelect;
export type InsertLocationConfig = typeof locationConfig.$inferInsert;

// Tabla de configuración de WebODM
export const webodmConfig = mysqlTable("webodmConfig", {
  id: int("id").autoincrement().primaryKey(),
  serverUrl: varchar("serverUrl", { length: 512 }).notNull(), // Ej: "https://odm.midominio.com"
  username: varchar("username", { length: 255 }).notNull(),
  password: varchar("password", { length: 512 }).notNull(), // Encriptada o en texto
  token: text("token"), // JWT token cacheado
  tokenExpiresAt: timestamp("tokenExpiresAt"), // Expiración del token
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WebodmConfig = typeof webodmConfig.$inferSelect;
export type InsertWebodmConfig = typeof webodmConfig.$inferInsert;

// Relación parcela <-> proyecto WebODM
export const parcelOdmMapping = mysqlTable("parcelOdmMapping", {
  id: int("id").autoincrement().primaryKey(),
  parcelId: int("parcelId").notNull(), // FK a parcels.id
  odmProjectId: int("odmProjectId").notNull(), // ID del proyecto en WebODM
  odmProjectName: varchar("odmProjectName", { length: 255 }), // Nombre cacheado del proyecto
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ParcelOdmMapping = typeof parcelOdmMapping.$inferSelect;
export type InsertParcelOdmMapping = typeof parcelOdmMapping.$inferInsert;

// Detalles de parcela (densidad, hectáreas, árboles)
export const parcelDetails = mysqlTable("parcelDetails", {
  id: int("id").autoincrement().primaryKey(),
  parcelId: int("parcelId").notNull().unique(), // FK a parcels.id (1:1)
  totalHectares: varchar("totalHectares", { length: 32 }), // Hectáreas completas
  productiveHectares: varchar("productiveHectares", { length: 32 }), // Hectáreas productivas
  treeDensityPerHectare: varchar("treeDensityPerHectare", { length: 32 }), // Densidad de árboles por hectárea
  totalTrees: int("totalTrees"), // Total de árboles
  productiveTrees: int("productiveTrees"), // Árboles productivos
  newTrees: int("newTrees"), // Árboles nuevos
  notes: text("notes"), // Notas del admin
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});  

export type ParcelDetails = typeof parcelDetails.$inferSelect;
export type InsertParcelDetails = typeof parcelDetails.$inferInsert;
