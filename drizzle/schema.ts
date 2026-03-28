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
  telegramHarvestChatId: varchar("telegramHarvestChatId", { length: 128 }),
  telegramHarvestHour: int("telegramHarvestHour").default(7),
  telegramHarvestMinute: int("telegramHarvestMinute").default(0),
  telegramHarvestEnabled: boolean("telegramHarvestEnabled").default(false),
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

// Tabla de cultivos
export const crops = mysqlTable("crops", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
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
  description: text("description"),
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

// ===== LIBRETA DE CAMPO =====

// Tabla principal de actividades de campo
export const fieldActivities = mysqlTable("fieldActivities", {
  id: int("id").autoincrement().primaryKey(),
  activityType: mysqlEnum("activityType", [
    "riego", "fertilizacion", "nutricion", "poda",
    "control_maleza", "control_plagas", "aplicacion_fitosanitaria", "otro"
  ]).notNull(),
  activitySubtype: varchar("activitySubtype", { length: 128 }),
  description: text("description"),
  performedBy: varchar("performedBy", { length: 255 }).notNull(),
  activityDate: date("activityDate").notNull(),
  startTime: varchar("startTime", { length: 8 }),
  endTime: varchar("endTime", { length: 8 }),
  durationMinutes: int("durationMinutes"),
  weatherCondition: varchar("weatherCondition", { length: 128 }),
  temperature: varchar("temperature", { length: 16 }),
  status: mysqlEnum("status", ["planificada", "en_progreso", "completada", "cancelada"]).default("completada").notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FieldActivity = typeof fieldActivities.$inferSelect;
export type InsertFieldActivity = typeof fieldActivities.$inferInsert;

// Parcelas afectadas por una actividad
export const fieldActivityParcels = mysqlTable("fieldActivityParcels", {
  id: int("id").autoincrement().primaryKey(),
  activityId: int("activityId").notNull(),
  parcelId: int("parcelId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FieldActivityParcel = typeof fieldActivityParcels.$inferSelect;

// Productos utilizados en una actividad
export const fieldActivityProducts = mysqlTable("fieldActivityProducts", {
  id: int("id").autoincrement().primaryKey(),
  activityId: int("activityId").notNull(),
  productName: varchar("productName", { length: 255 }).notNull(),
  productType: mysqlEnum("productType", [
    "fertilizante_granular", "fertilizante_liquido", "fertilizante_foliar", "fertilizante_organico",
    "herbicida_preemergente", "herbicida_postemergente", "herbicida_selectivo", "herbicida_no_selectivo",
    "insecticida", "fungicida", "acaricida", "nematicida",
    "regulador_crecimiento", "bioestimulante", "enmienda_suelo", "nutriente_foliar",
    "agua", "otro"
  ]).default("otro").notNull(),
  quantity: varchar("quantity", { length: 32 }),
  unit: mysqlEnum("unit", ["kg", "g", "lt", "ml", "ton", "bulto", "saco", "unidad", "otro"]).default("kg"),
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
  description: text("description"),
  activeIngredient: varchar("activeIngredient", { length: 255 }),
  concentration: varchar("concentration", { length: 128 }),
  presentation: varchar("presentation", { length: 128 }),
  unit: mysqlEnum("unit", ["kg", "g", "lt", "ml", "ton", "bulto", "saco", "unidad", "otro"]).default("kg").notNull(),
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
  description: text("description"),
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
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FieldNote = typeof fieldNotes.$inferSelect;
export type InsertFieldNote = typeof fieldNotes.$inferInsert;

// Fotos asociadas a notas de campo
export const fieldNotePhotos = mysqlTable("fieldNotePhotos", {
  id: int("id").autoincrement().primaryKey(),
  fieldNoteId: int("fieldNoteId").notNull(),
  photoPath: varchar("photoPath", { length: 512 }).notNull(),
  caption: varchar("caption", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FieldNotePhoto = typeof fieldNotePhotos.$inferSelect;
export type InsertFieldNotePhoto = typeof fieldNotePhotos.$inferInsert;
