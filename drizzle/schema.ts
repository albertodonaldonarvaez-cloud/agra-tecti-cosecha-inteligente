import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, decimal, date } from "drizzle-orm/mysql-core";

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
  canViewCrops: boolean("canViewCrops").default(false).notNull(),
  canViewFieldNotes: boolean("canViewFieldNotes").default(true).notNull(),
  canViewFieldNotebook: boolean("canViewFieldNotebook").default(true).notNull(),
  canViewWarehouse: boolean("canViewWarehouse").default(true).notNull(),
  canViewCollaborators: boolean("canViewCollaborators").default(false).notNull(),
  canViewLabels: boolean("canViewLabels").default(false).notNull(),
  canViewCycles: boolean("canViewCycles").default(true).notNull(),
  canViewReports: boolean("canViewReports").default(true).notNull(),
  // Campos de personalización de perfil
  avatarColor: varchar("avatarColor", { length: 32 }).default("#16a34a"),
  avatarEmoji: varchar("avatarEmoji", { length: 16 }).default("🌿"),
  bio: varchar("bio", { length: 255 }),
  phone: varchar("phone", { length: 32 }),
  telegramChatId: varchar("telegramChatId", { length: 64 }),
  telegramUsername: varchar("telegramUsername", { length: 128 }),
  telegramLinkedAt: timestamp("telegramLinkedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Tabla de códigos de vinculación de Telegram
export const telegramLinkCodes = mysqlTable("telegramLinkCodes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  code: varchar("code", { length: 8 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Acciones registrables. ORDEN IMPORTANTE: MySQL guarda los ENUM por índice,
// así que las acciones nuevas (las de la app de campo) van SIEMPRE al final
// para no mover lo que ya está guardado en producción.
export const ACTIVITY_ACTIONS = [
  "login", "logout", "page_view", "page_leave",
  // App móvil
  "login_failed", "app_open", "app_close", "screen_view",
  "photo_capture", "photo_upload",
  "note_create", "note_status", "activity_create",
  "person_create", "product_create", "product_update",
  "sync", "error",
] as const;

// Tabla de logs de actividad de usuarios (web y app de campo)
export const userActivityLogs = mysqlTable("userActivityLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  action: mysqlEnum("action", ACTIVITY_ACTIONS).notNull(),
  // De dónde vino el evento: la web o la app del teléfono
  source: mysqlEnum("source", ["web", "app"]).default("web").notNull(),
  page: varchar("page", { length: 255 }),
  pageName: varchar("pageName", { length: 255 }),
  sessionId: varchar("sessionId", { length: 128 }),
  durationSeconds: int("durationSeconds"), // Duración en la página (solo para page_leave)
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: varchar("userAgent", { length: 512 }),
  // ── Campos que solo llena la app móvil ──
  // UUID del evento en el teléfono: evita duplicados si el lote se reintenta
  clientLogId: varchar("clientLogId", { length: 64 }).unique(),
  device: varchar("device", { length: 160 }),
  appVersion: varchar("appVersion", { length: 32 }),
  detail: varchar("detail", { length: 500 }),
  // Peso de la foto antes y después de comprimirla en el teléfono: es lo que
  // permite saber cuánto ancho de banda se está ahorrando en el campo
  originalBytes: int("originalBytes"),
  finalBytes: int("finalBytes"),
  // Momento real en el teléfono (puede subirse días después, sin señal)
  occurredAt: timestamp("occurredAt"),
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
  // Copia de la foto guardada en el servidor (ruta pública /app/photos/kobo/...).
  // Mientras sea NULL la foto solo vive en KoboToolbox.
  photoLocalPath: varchar("photoLocalPath", { length: 512 }),
  photoDownloadedAt: timestamp("photoDownloadedAt"),
  photoDownloadAttempts: int("photoDownloadAttempts").default(0).notNull(),
  photoDownloadError: varchar("photoDownloadError", { length: 255 }),
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

// Índice de las fotos de KoboToolbox ya descargadas al servidor.
// Se guarda una fila por cada URL conocida (original, large, medium y small)
// apuntando al mismo archivo, para que el proxy resuelva cualquier variante
// sin volver a salir a internet.
export const koboPhotos = mysqlTable("koboPhotos", {
  id: int("id").autoincrement().primaryKey(),
  urlHash: varchar("urlHash", { length: 40 }).notNull().unique(), // sha1 de la URL de Kobo
  koboUrl: text("koboUrl").notNull(),
  boxId: int("boxId"),
  boxCode: varchar("boxCode", { length: 64 }),
  variant: mysqlEnum("variant", ["original", "large", "medium", "small"]).default("original").notNull(),
  localPath: varchar("localPath", { length: 512 }).notNull(), // Ruta pública: /app/photos/kobo/...
  contentType: varchar("contentType", { length: 128 }),
  sizeBytes: int("sizeBytes"),
  downloadedAt: timestamp("downloadedAt").defaultNow().notNull(),
});

export type KoboPhoto = typeof koboPhotos.$inferSelect;
export type InsertKoboPhoto = typeof koboPhotos.$inferInsert;

// Servidor de correo saliente. Una sola fila: el sistema manda desde una única
// cuenta. La contraseña se guarda cifrada (ver server/encryption.ts).
export const smtpConfig = mysqlTable("smtpConfig", {
  id: int("id").autoincrement().primaryKey(),
  host: varchar("host", { length: 255 }).notNull(),
  port: int("port").default(587).notNull(),
  // true = TLS directo (puerto 465); false = STARTTLS (587) o sin cifrar (25)
  secure: boolean("secure").default(false).notNull(),
  username: varchar("username", { length: 255 }),
  password: varchar("password", { length: 1024 }), // cifrada
  fromName: varchar("fromName", { length: 128 }).default("Agra Tec-Ti"),
  fromEmail: varchar("fromEmail", { length: 255 }).notNull(),
  // Destinatarios por omisión del reporte, separados por coma
  defaultRecipients: text("defaultRecipients"),
  enabled: boolean("enabled").default(true).notNull(),
  lastTestAt: timestamp("lastTestAt"),
  lastTestOk: boolean("lastTestOk"),
  lastTestError: varchar("lastTestError", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SmtpConfig = typeof smtpConfig.$inferSelect;
export type InsertSmtpConfig = typeof smtpConfig.$inferInsert;

// Bitácora de correos enviados: sirve para saber si el reporte salió y a quién
export const sentEmails = mysqlTable("sentEmails", {
  id: int("id").autoincrement().primaryKey(),
  subject: varchar("subject", { length: 512 }).notNull(),
  recipients: text("recipients").notNull(),
  kind: varchar("kind", { length: 64 }).default("reporte").notNull(),
  ok: boolean("ok").default(false).notNull(),
  error: varchar("error", { length: 512 }),
  sentByUserId: int("sentByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SentEmail = typeof sentEmails.$inferSelect;

// Tabla de configuración de API de KoboToolbox
export const apiConfig = mysqlTable("apiConfig", {
  id: int("id").autoincrement().primaryKey(),
  apiUrl: varchar("apiUrl", { length: 512 }).notNull(),
  apiToken: varchar("apiToken", { length: 512 }).notNull(),
  assetId: varchar("assetId", { length: 128 }).notNull(),
  telegramBotToken: varchar("telegramBotToken", { length: 512 }),
  telegramChatId: varchar("telegramChatId", { length: 128 }),
  telegramHarvestChatId: varchar("telegramHarvestChatId", { length: 128 }),
  telegramHarvestHour: int("telegramHarvestHour").default(7),
  telegramHarvestMinute: int("telegramHarvestMinute").default(0),
  telegramHarvestEnabled: boolean("telegramHarvestEnabled").default(false),
  telegramFieldNotesChatId: varchar("telegramFieldNotesChatId", { length: 128 }),
  telegramFieldNotesEnabled: boolean("telegramFieldNotesEnabled").default(false),
  copernicusClientId: varchar("copernicusClientId", { length: 256 }),
  copernicusClientSecret: varchar("copernicusClientSecret", { length: 1024 }),
  deepseekApiKey: varchar("deepseekApiKey", { length: 1024 }),
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
  cropId: int("cropId"), // FK a crops.id
  varietyId: int("varietyId"), // FK a cropVarieties.id
  establishedAt: varchar("establishedAt", { length: 32 }), // Fecha de establecimiento de la parcela (YYYY-MM-DD)
  notes: text("notes"), // Notas del admin (legacy, ahora se usa parcelNotes)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});  

export type ParcelDetails = typeof parcelDetails.$inferSelect;
export type InsertParcelDetails = typeof parcelDetails.$inferInsert;

// Cache de análisis IA por parcela
export const parcelAiAnalysis = mysqlTable("parcelAiAnalysis", {
  id: int("id").autoincrement().primaryKey(),
  parcelId: int("parcelId").notNull(),
  analysis: text("analysis").notNull(),
  fromDate: varchar("fromDate", { length: 32 }).notNull(),
  toDate: varchar("toDate", { length: 32 }).notNull(),
  model: varchar("model", { length: 64 }),
  // Ciclo de producción al que corresponde el análisis
  cycleId: int("cycleId"),
  // De qué datos salió: sirve para regenerarlo solo cuando hay algo nuevo
  // (última captura satelital usada y última modificación de la libreta)
  lastCaptureDate: varchar("lastCaptureDate", { length: 32 }),
  lastNotebookStamp: varchar("lastNotebookStamp", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ══════════════════════════════════════
// HISTORIAL SATELITAL POR PARCELA
// ══════════════════════════════════════
// Una fila por captura del satélite: así se ve cómo evoluciona el vigor a lo
// largo del ciclo en vez de solo la foto más reciente.
export const parcelSatelliteHistory = mysqlTable("parcelSatelliteHistory", {
  id: int("id").autoincrement().primaryKey(),
  parcelId: int("parcelId").notNull(),
  // Fecha real de la pasada del satélite
  captureDate: varchar("captureDate", { length: 32 }).notNull(),
  // Ciclo de producción al que pertenece la captura
  cycleId: int("cycleId"),
  // Qué tan despejada se veía la parcela ese día
  clearPct: int("clearPct"),
  ndviMean: decimal("ndviMean", { precision: 5, scale: 3 }),
  ndviMin: decimal("ndviMin", { precision: 5, scale: 3 }),
  ndviMax: decimal("ndviMax", { precision: 5, scale: 3 }),
  // Reparto del área por nivel de vigor y detalle por zona (JSON)
  distributionJson: text("distributionJson"),
  zonesJson: text("zonesJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ParcelSatelliteHistory = typeof parcelSatelliteHistory.$inferSelect;

// Cache de datos satelitales (Copernicus) por parcela
export const parcelSatelliteCache = mysqlTable("parcelSatelliteCache", {
  id: int("id").autoincrement().primaryKey(),
  parcelId: int("parcelId").notNull(),
  dataType: varchar("dataType", { length: 16 }).notNull(), // 'stats' or 'map'
  indexType: varchar("indexType", { length: 8 }).notNull(), // 'NDVI', 'NDRE', 'NDMI'
  // Clave del cache: 'latest' o la fecha que se pidió a mano
  mapDate: varchar("mapDate", { length: 32 }),
  // Fecha REAL de la pasada del satélite que se ve en la imagen.
  // Distinta de mapDate: 'latest' solo dice "la más reciente", no cuándo se tomó.
  captureDate: varchar("captureDate", { length: 32 }),
  // Porcentaje de la parcela que se veía despejado en esa pasada
  clearPct: int("clearPct"),
  // Ciclo de producción al que pertenece la captura: permite saber si el dato
  // es del ciclo en curso o todavía del anterior
  cycleId: int("cycleId"),
  data: text("data").notNull(), // JSON string or base64
  fromDate: varchar("fromDate", { length: 32 }),
  toDate: varchar("toDate", { length: 32 }),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
});

// Tabla de cultivos
export const crops = mysqlTable("crops", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Crop = typeof crops.$inferSelect;
export type InsertCrop = typeof crops.$inferInsert;

// Tabla de variedades de cultivo (un cultivo puede tener muchas variedades)
export const cropVarieties = mysqlTable("cropVarieties", {
  id: int("id").autoincrement().primaryKey(),
  cropId: int("cropId").notNull(), // FK a crops.id
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CropVariety = typeof cropVarieties.$inferSelect;
export type InsertCropVariety = typeof cropVarieties.$inferInsert;

// Tabla de notas de parcela (con autor y fecha)
export const parcelNotes = mysqlTable("parcelNotes", {
  id: int("id").autoincrement().primaryKey(),
  parcelId: int("parcelId").notNull(), // FK a parcels.id
  userId: int("userId").notNull(), // FK a users.id (autor)
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ParcelNote = typeof parcelNotes.$inferSelect;
export type InsertParcelNote = typeof parcelNotes.$inferInsert;

// ===== CICLOS DE PRODUCCIÓN =====
// El higo se maneja por ciclos: cada ciclo inicia con la poda / dormancia
// y termina después de la cosecha. Las fechas son "YYYY-MM-DD" (mode string)
// para comparar directo contra DATE(submissionTime) y activityDate.
export const productionCycles = mysqlTable("productionCycles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(), // Ej: "Ciclo 2026-2027"
  startDate: date("startDate", { mode: "string" }).notNull(), // Inicio del ciclo (poda / dormancia)
  harvestStartDate: date("harvestStartDate", { mode: "string" }), // Opcional; si es null se detecta con la primera caja del ciclo
  harvestEndDate: date("harvestEndDate", { mode: "string" }), // Finalización de cosecha
  endDate: date("endDate", { mode: "string" }), // Finalización del ciclo (null = ciclo abierto)
  notes: text("notes"),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductionCycle = typeof productionCycles.$inferSelect;
export type InsertProductionCycle = typeof productionCycles.$inferInsert;

// ===== LIBRETA DE CAMPO =====

// Tabla principal de actividades de campo
export const fieldActivities = mysqlTable("fieldActivities", {
  id: int("id").autoincrement().primaryKey(),
  activityType: mysqlEnum("activityType", [
    "riego", "fertilizacion", "nutricion", "poda",
    "control_maleza", "control_plagas", "aplicacion_fitosanitaria", "otro"
  ]).notNull(),
  activitySubtype: varchar("activitySubtype", { length: 128 }),
  description: text("description").notNull(),
  performedBy: varchar("performedBy", { length: 255 }).notNull(),
  activityDate: date("activityDate").notNull(),
  startTime: varchar("startTime", { length: 8 }),
  endTime: varchar("endTime", { length: 8 }),
  durationMinutes: int("durationMinutes"),
  weatherCondition: varchar("weatherCondition", { length: 128 }),
  temperature: varchar("temperature", { length: 16 }),
  status: mysqlEnum("status", ["planificada", "en_progreso", "completada", "cancelada"]).default("planificada").notNull(),
  // UUID generado por la app móvil: clave de idempotencia para sync offline
  // (null en actividades creadas desde la web)
  clientUuid: varchar("clientUuid", { length: 64 }).unique(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FieldActivity = typeof fieldActivities.$inferSelect;
export type InsertFieldActivity = typeof fieldActivities.$inferInsert;

// Jornadas de trabajo de una actividad: una fila por día trabajado con sus horas.
// Permite actividades de varios días (poda de un huerto completo, etc.)
export const fieldActivityWorkSessions = mysqlTable("fieldActivityWorkSessions", {
  id: int("id").autoincrement().primaryKey(),
  activityId: int("activityId").notNull(),
  workDate: date("workDate", { mode: "string" }).notNull(), // "YYYY-MM-DD"
  startTime: varchar("startTime", { length: 8 }), // "HH:MM"
  endTime: varchar("endTime", { length: 8 }),
  notes: varchar("notes", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FieldActivityWorkSession = typeof fieldActivityWorkSessions.$inferSelect;

// Parcelas afectadas por una actividad
export const fieldActivityParcels = mysqlTable("fieldActivityParcels", {
  id: int("id").autoincrement().primaryKey(),
  activityId: int("activityId").notNull(),
  parcelId: int("parcelId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FieldActivityParcel = typeof fieldActivityParcels.$inferSelect;

// Unidades de medida compartidas por el almacén y el consumo en actividades.
// ORDEN IMPORTANTE: las unidades nuevas (oz, lb, gal) van al FINAL. MySQL guarda
// los ENUM por índice, así que agregarlas al final deja intactos los valores ya
// almacenados en producción.
export const PRODUCT_UNITS = [
  "kg", "g", "lt", "ml", "ton", "bulto", "saco", "unidad", "otro", "oz", "lb", "gal",
] as const;

// Productos utilizados en una actividad
export const fieldActivityProducts = mysqlTable("fieldActivityProducts", {
  id: int("id").autoincrement().primaryKey(),
  activityId: int("activityId").notNull(),
  // Producto del almacén cuando se eligió del catálogo (null si se escribió a mano)
  productId: int("productId"),
  productName: varchar("productName", { length: 255 }).notNull(),
  productType: mysqlEnum("productType", [
    "fertilizante_granular", "fertilizante_liquido", "fertilizante_foliar", "fertilizante_organico",
    "herbicida_preemergente", "herbicida_postemergente", "herbicida_selectivo", "herbicida_no_selectivo",
    "insecticida", "fungicida", "acaricida", "nematicida",
    "regulador_crecimiento", "bioestimulante", "enmienda_suelo", "nutriente_foliar",
    "agua", "otro"
  ]).default("otro").notNull(),
  // Cantidad que se planeó aplicar (se captura al programar la actividad)
  plannedQuantity: varchar("plannedQuantity", { length: 32 }),
  // Cantidad realmente utilizada
  quantity: varchar("quantity", { length: 32 }),
  unit: mysqlEnum("unit", PRODUCT_UNITS).default("kg"),
  dosisPerHectare: varchar("dosisPerHectare", { length: 64 }),
  applicationMethod: varchar("applicationMethod", { length: 128 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FieldActivityProduct = typeof fieldActivityProducts.$inferSelect;

// Herramientas / equipos utilizados
export const fieldActivityTools = mysqlTable("fieldActivityTools", {
  id: int("id").autoincrement().primaryKey(),
  activityId: int("activityId").notNull(),
  toolName: varchar("toolName", { length: 255 }).notNull(),
  toolType: mysqlEnum("toolType", [
    "tractor", "aspersora_manual", "aspersora_motorizada", "bomba_riego",
    "sistema_goteo", "motosierra", "tijera_poda", "machete",
    "azadon", "rastrillo", "desbrozadora", "fumigadora", "drone", "vehiculo", "otro"
  ]).default("otro").notNull(),
  notes: varchar("notes", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FieldActivityTool = typeof fieldActivityTools.$inferSelect;

// Fotos de la actividad (antes y después)
export const fieldActivityPhotos = mysqlTable("fieldActivityPhotos", {
  id: int("id").autoincrement().primaryKey(),
  activityId: int("activityId").notNull(),
  photoType: mysqlEnum("photoType", ["antes", "despues", "durante", "producto", "otro"]).default("durante").notNull(),
  photoUrl: text("photoUrl").notNull(),
  caption: varchar("caption", { length: 512 }),
  // ID local de la foto en la app móvil (idempotencia del upload)
  localPhotoId: varchar("localPhotoId", { length: 64 }),
  uploadedByUserId: int("uploadedByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FieldActivityPhoto = typeof fieldActivityPhotos.$inferSelect;

// ===== ALMACÉN =====

// Catálogo de proveedores
export const warehouseSuppliers = mysqlTable("warehouseSuppliers", {
  id: int("id").autoincrement().primaryKey(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  contactName: varchar("contactName", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  phone2: varchar("phone2", { length: 50 }),
  email: varchar("email", { length: 255 }),
  website: varchar("website", { length: 255 }),
  rfc: varchar("rfc", { length: 20 }),
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 128 }),
  postalCode: varchar("postalCode", { length: 10 }),
  category: mysqlEnum("category", [
    "fertilizantes", "agroquimicos", "semillas", "herramientas", "maquinaria",
    "riego", "empaques", "servicios", "combustible", "otro"
  ]).default("otro").notNull(),
  productsOffered: text("productsOffered"),
  paymentTerms: varchar("paymentTerms", { length: 255 }),
  bankAccount: varchar("bankAccount", { length: 255 }),
  notes: text("notes"),
  rating: int("rating"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WarehouseSupplier = typeof warehouseSuppliers.$inferSelect;
export type InsertWarehouseSupplier = typeof warehouseSuppliers.$inferInsert;

// Catálogo de productos del almacén
export const warehouseProducts = mysqlTable("warehouseProducts", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  brand: varchar("brand", { length: 255 }),
  category: mysqlEnum("category", [
    "fertilizante_granular", "fertilizante_liquido", "fertilizante_foliar", "fertilizante_organico",
    "herbicida_preemergente", "herbicida_postemergente", "herbicida_selectivo", "herbicida_no_selectivo",
    "insecticida", "fungicida", "acaricida", "nematicida",
    "regulador_crecimiento", "bioestimulante", "enmienda_suelo", "nutriente_foliar",
    "semilla", "sustrato", "agua", "otro"
  ]).default("otro").notNull(),
  description: text("description").notNull(),
  activeIngredient: varchar("activeIngredient", { length: 255 }),
  concentration: varchar("concentration", { length: 128 }),
  presentation: varchar("presentation", { length: 128 }),
  unit: mysqlEnum("unit", PRODUCT_UNITS).default("kg").notNull(),
  // UUID de la app móvil cuando el producto se dio de alta desde el campo
  // (clave de idempotencia del sync offline)
  clientUuid: varchar("clientUuid", { length: 64 }).unique(),
  currentStock: decimal("currentStock", { precision: 12, scale: 2 }).default("0").notNull(),
  minimumStock: decimal("minimumStock", { precision: 12, scale: 2 }).default("0"),
  costPerUnit: decimal("costPerUnit", { precision: 12, scale: 2 }),
  supplierId: int("supplierId"),
  supplier: varchar("supplier", { length: 255 }),
  supplierContact: varchar("supplierContact", { length: 255 }),
  lotNumber: varchar("lotNumber", { length: 128 }),
  expirationDate: date("expirationDate"),
  storageLocation: varchar("storageLocation", { length: 255 }),
  photoUrl: text("photoUrl"),
  safetyDataSheet: text("safetyDataSheet"),
  isActive: boolean("isActive").default(true).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WarehouseProduct = typeof warehouseProducts.$inferSelect;
export type InsertWarehouseProduct = typeof warehouseProducts.$inferInsert;

// Movimientos de inventario de productos
export const warehouseProductMovements = mysqlTable("warehouseProductMovements", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  movementType: mysqlEnum("movementType", ["entrada", "salida", "ajuste", "devolucion"]).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  previousStock: decimal("previousStock", { precision: 12, scale: 2 }).notNull(),
  newStock: decimal("newStock", { precision: 12, scale: 2 }).notNull(),
  reason: varchar("reason", { length: 512 }),
  relatedActivityId: int("relatedActivityId"),
  invoiceNumber: varchar("invoiceNumber", { length: 128 }),
  supplier: varchar("supplier", { length: 255 }),
  costPerUnit: decimal("costPerUnit", { precision: 12, scale: 2 }),
  totalCost: decimal("totalCost", { precision: 12, scale: 2 }),
  performedByUserId: int("performedByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WarehouseProductMovement = typeof warehouseProductMovements.$inferSelect;

// Catálogo de herramientas/equipos
export const warehouseTools = mysqlTable("warehouseTools", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: mysqlEnum("category", [
    "tractor", "aspersora_manual", "aspersora_motorizada", "bomba_riego",
    "sistema_goteo", "motosierra", "tijera_poda", "machete",
    "azadon", "rastrillo", "desbrozadora", "fumigadora", "drone",
    "vehiculo", "medicion", "proteccion", "transporte", "otro"
  ]).default("otro").notNull(),
  brand: varchar("brand", { length: 255 }),
  model: varchar("model", { length: 255 }),
  serialNumber: varchar("serialNumber", { length: 255 }),
  description: text("description").notNull(),
  status: mysqlEnum("status", ["disponible", "en_uso", "mantenimiento", "dañado", "baja"]).default("disponible").notNull(),
  conditionState: mysqlEnum("conditionState", ["nuevo", "bueno", "regular", "malo"]).default("bueno").notNull(),
  acquisitionDate: date("acquisitionDate"),
  acquisitionCost: decimal("acquisitionCost", { precision: 12, scale: 2 }),
  currentValue: decimal("currentValue", { precision: 12, scale: 2 }),
  storageLocation: varchar("storageLocation", { length: 255 }),
  assignedTo: varchar("assignedTo", { length: 255 }),
  lastMaintenanceDate: date("lastMaintenanceDate"),
  nextMaintenanceDate: date("nextMaintenanceDate"),
  maintenanceNotes: text("maintenanceNotes"),
  photoUrl: text("photoUrl"),
  quantity: int("quantity").default(1).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WarehouseTool = typeof warehouseTools.$inferSelect;
export type InsertWarehouseTool = typeof warehouseTools.$inferInsert;

// Historial de uso/asignación de herramientas
export const warehouseToolAssignments = mysqlTable("warehouseToolAssignments", {
  id: int("id").autoincrement().primaryKey(),
  toolId: int("toolId").notNull(),
  assignmentType: mysqlEnum("assignmentType", ["asignacion", "devolucion", "mantenimiento", "baja"]).notNull(),
  assignedTo: varchar("assignedTo", { length: 255 }),
  relatedActivityId: int("relatedActivityId"),
  notes: text("notes"),
  performedByUserId: int("performedByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WarehouseToolAssignment = typeof warehouseToolAssignments.$inferSelect;

// ============ NOTAS DE CAMPO ============
// Reportes rápidos de observaciones durante recorridos de parcelas
export const fieldNotes = mysqlTable("fieldNotes", {
  id: int("id").autoincrement().primaryKey(),
  folio: varchar("folio", { length: 64 }).notNull().unique(),
  description: text("description").notNull(),
  syncSource: mysqlEnum("syncSource", ["web", "telegram", "mobile"]).default("web").notNull(),
  category: mysqlEnum("category", [
    "arboles_mal_plantados",
    "plaga_enfermedad",
    "riego_drenaje",
    "dano_mecanico",
    "maleza",
    "fertilizacion",
    "suelo",
    "infraestructura",
    "fauna",
    "otro"
  ]).notNull(),
  severity: mysqlEnum("severity", ["baja", "media", "alta", "critica"]).default("media").notNull(),
  status: mysqlEnum("status", ["abierta", "en_revision", "en_progreso", "resuelta", "descartada"]).default("abierta").notNull(),
  parcelId: int("parcelId"),
  // Ubicación GPS (capturada desde el celular)
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  // Quién reportó y quién resolvió
  reportedByUserId: int("reportedByUserId").notNull(),
  resolvedByUserId: int("resolvedByUserId"),
  resolutionNotes: text("resolutionNotes"),
  resolvedAt: timestamp("resolvedAt"),
  // GPS de resolucion
  resolvedLatitude: decimal("resolvedLatitude", { precision: 10, scale: 7 }),
  resolvedLongitude: decimal("resolvedLongitude", { precision: 10, scale: 7 }),
  assignedToCollaboratorId: int("assignedToCollaboratorId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FieldNote = typeof fieldNotes.$inferSelect;
export type InsertFieldNote = typeof fieldNotes.$inferInsert;

// Fotos asociadas a notas de campo
export const fieldNotePhotos = mysqlTable("fieldNotePhotos", {
  id: int("id").autoincrement().primaryKey(),
  fieldNoteId: int("fieldNoteId").notNull(),
  localPhotoId: varchar("localPhotoId", { length: 64 }),
  photoPath: varchar("photoPath", { length: 512 }).notNull(),
  caption: varchar("caption", { length: 255 }),
  stage: mysqlEnum("stage", ["reporte", "revision", "resolucion"]).default("reporte").notNull(),
  uploadedByUserId: int("uploadedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FieldNotePhoto = typeof fieldNotePhotos.$inferSelect;
export type InsertFieldNotePhoto = typeof fieldNotePhotos.$inferInsert;

// ============ COLABORADORES DE CAMPO ============
// Usuarios externos que interactúan solo por Telegram (no acceden al sistema web)

export const collaborators = mysqlTable("collaborators", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  role: varchar("role", { length: 128 }), // Ej: "Encargado de riego", "Jornalero"
  // UUID de la app móvil cuando el colaborador se dio de alta desde el campo
  clientUuid: varchar("clientUuid", { length: 64 }).unique(),
  telegramChatId: varchar("telegramChatId", { length: 64 }),
  telegramUsername: varchar("telegramUsername", { length: 128 }),
  telegramLinkedAt: timestamp("telegramLinkedAt"),
  isActive: boolean("isActive").default(true).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Collaborator = typeof collaborators.$inferSelect;
export type InsertCollaborator = typeof collaborators.$inferInsert;

// Catálogo de puestos del personal de campo.
// Se siembra con los puestos habituales y crece solo: cuando alguien captura
// un puesto nuevo con la opción "Otro" (en la app o en la web), queda dado de
// alta aquí y aparece en el catálogo de todos los dispositivos.
export const collaboratorRoles = mysqlTable("collaboratorRoles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CollaboratorRole = typeof collaboratorRoles.$inferSelect;

// Códigos de vinculación de Telegram para colaboradores
export const collaboratorLinkCodes = mysqlTable("collaboratorLinkCodes", {
  id: int("id").autoincrement().primaryKey(),
  collaboratorId: int("collaboratorId").notNull(),
  code: varchar("code", { length: 8 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CollaboratorLinkCode = typeof collaboratorLinkCodes.$inferSelect;

// Asignación de tareas (actividades de campo) a colaboradores
export const fieldActivityAssignments = mysqlTable("fieldActivityAssignments", {
  id: int("id").autoincrement().primaryKey(),
  activityId: int("activityId").notNull(), // FK a fieldActivities.id
  collaboratorId: int("collaboratorId").notNull(), // FK a collaborators.id
  status: mysqlEnum("status", ["pendiente", "en_progreso", "completada", "cancelada"]).default("pendiente").notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  evidencePhotoPath: varchar("evidencePhotoPath", { length: 512 }),
  evidenceNotes: text("evidenceNotes"),
  notifiedAt: timestamp("notifiedAt"),
  assignedByUserId: int("assignedByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FieldActivityAssignment = typeof fieldActivityAssignments.$inferSelect;
export type InsertFieldActivityAssignment = typeof fieldActivityAssignments.$inferInsert;

// ══════════════════════════════════════
// RESUMEN SEMANAL CON IA
// ══════════════════════════════════════
// Un registro por semana: panorama general generado con IA cruzando
// actividades de la libreta, clima, datos satelitales y etapa del ciclo.
export const weeklySummaries = mysqlTable("weeklySummaries", {
  id: int("id").autoincrement().primaryKey(),
  // Lunes de la semana resumida — único: una fila por semana (el scheduler y el
  // botón "Generar ahora" pueden correr a la vez sin duplicar)
  weekStart: date("weekStart", { mode: "string" }).notNull().unique(),
  weekEnd: date("weekEnd", { mode: "string" }).notNull(), // Domingo de la semana resumida
  content: text("content").notNull(), // Resumen generado por la IA (markdown)
  model: varchar("model", { length: 64 }),
  cycleId: int("cycleId"), // Ciclo activo al momento de generar
  cyclePhase: varchar("cyclePhase", { length: 64 }), // Etapa estimada del ciclo
  statsJson: text("statsJson"), // Datos crudos usados (para depurar/mostrar)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WeeklySummary = typeof weeklySummaries.$inferSelect;

// ══════════════════════════════════════
// VERSIONES DE LA APP MÓVIL (APK)
// ══════════════════════════════════════
export const appReleases = mysqlTable("appReleases", {
  id: int("id").autoincrement().primaryKey(),
  versionCode: int("versionCode").notNull(), // BuildConfig.VERSION_CODE
  versionName: varchar("versionName", { length: 32 }).notNull(), // Ej: "1.2.0"
  fileName: varchar("fileName", { length: 255 }).notNull(),
  filePath: varchar("filePath", { length: 512 }).notNull(), // Ruta en disco del APK
  fileSize: int("fileSize"), // Bytes
  notes: text("notes"), // Notas de la versión
  uploadedByUserId: int("uploadedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AppRelease = typeof appReleases.$inferSelect;

// ══════════════════════════════════════
// LABEL PRINT HISTORY
// ══════════════════════════════════════
export const labelPrintHistory = mysqlTable("labelPrintHistory", {
  id: int("id").autoincrement().primaryKey(),
  harvesterNumber: int("harvesterNumber").notNull(),
  labelText: varchar("labelText", { length: 255 }).notNull(),
  folioStart: int("folioStart").notNull(),
  folioEnd: int("folioEnd").notNull(),
  quantity: int("quantity").notNull(),
  printedAt: timestamp("printedAt").defaultNow().notNull(),
  printedBy: int("printedBy"),
});
export type LabelPrintHistory = typeof labelPrintHistory.$inferSelect;
export type InsertLabelPrintHistory = typeof labelPrintHistory.$inferInsert;

// ══════════════════════════════════════
// LLAVES DE API PARA AGENTES
// ══════════════════════════════════════
// La API pública (/api/v1) la consumen scripts y agentes de IA, no personas.
// Darles el correo y contraseña de un administrador era la única opción antes:
// una llave se puede acotar a solo lectura, revocar sola y auditar aparte.
//
// La llave NUNCA se guarda completa. Se guarda su hash sha256; el prefijo
// (agt_live_xxxxxxxx) se guarda aparte solo para poder identificarla en pantalla.
export const API_KEY_SCOPES = ["lectura", "lectura_ia"] as const;

export const apiKeys = mysqlTable("apiKeys", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(), // "Agente de análisis", "Script de Pedro"
  keyHash: varchar("keyHash", { length: 64 }).notNull().unique(), // sha256 en hexadecimal
  keyPrefix: varchar("keyPrefix", { length: 24 }).notNull(), // agt_live_a1b2c3d4 (para reconocerla)
  // lectura     → todo lo que no cuesta dinero
  // lectura_ia  → además los endpoints que llaman a DeepSeek y Copernicus
  scope: mysqlEnum("scope", API_KEY_SCOPES).default("lectura").notNull(),
  // La llave actúa en nombre de este usuario: hereda sus permisos
  userId: int("userId").notNull(),
  createdByUserId: int("createdByUserId"),
  // Topes. Sin ellos, un script en bucle vacía la cuota de DeepSeek en una tarde
  rateLimitPerMin: int("rateLimitPerMin").default(60).notNull(),
  dailyQuota: int("dailyQuota").default(5000).notNull(),
  dailyAiQuota: int("dailyAiQuota").default(20).notNull(),
  expiresAt: timestamp("expiresAt"), // NULL = no caduca
  revokedAt: timestamp("revokedAt"), // NULL = activa
  lastUsedAt: timestamp("lastUsedAt"),
  lastUsedIp: varchar("lastUsedIp", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

// Consumo diario por llave. Hace dos trabajos con la misma fila: es la bitácora
// que responde "cuánto usó este agente el martes" y es el contador que hace
// cumplir la cuota, sin necesidad de guardar una fila por petición.
export const apiKeyUsage = mysqlTable("apiKeyUsage", {
  id: int("id").autoincrement().primaryKey(),
  keyId: int("keyId").notNull(),
  day: date("day", { mode: "string" }).notNull(), // "YYYY-MM-DD" en hora de México
  calls: int("calls").default(0).notNull(),
  aiCalls: int("aiCalls").default(0).notNull(), // las que cuestan dinero
  errors: int("errors").default(0).notNull(),
  lastPath: varchar("lastPath", { length: 255 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApiKeyUsage = typeof apiKeyUsage.$inferSelect;
