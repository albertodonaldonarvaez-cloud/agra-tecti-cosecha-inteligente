import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Tabla de parcelas
export const parcels = mysqlTable("parcels", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
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
  koboId: int("koboId").notNull().unique(), // ID desde KoboToolbox
  boxCode: varchar("boxCode", { length: 64 }).notNull().unique(), // Formato: XX-XXXXXX
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
  lastSync: timestamp("lastSync"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApiConfig = typeof apiConfig.$inferSelect;
export type InsertApiConfig = typeof apiConfig.$inferInsert;