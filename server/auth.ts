import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { getDb } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRES_IN = "30d";
// La app de campo vive meses sin re-login: token de refresco de larga duración.
// Cuando el token de acceso caduca, la app lo canjea sola por uno nuevo
// (antes se quedaba sin sesión en silencio y dejaba de sincronizar).
const REFRESH_EXPIRES_IN = "365d";

export interface JWTPayload {
  userId: number;
  email: string;
  role: "user" | "admin";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload & { typ?: string };
    // Un token de refresco NO sirve para autenticar peticiones normales
    if (payload.typ === "refresh") return null;
    return payload;
  } catch {
    return null;
  }
}

/** Token de refresco: solo sirve para pedir un token de acceso nuevo */
export function generateRefreshToken(payload: JWTPayload): string {
  return jwt.sign({ ...payload, typ: "refresh" }, JWT_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
}

/**
 * Canjea un token de refresco por un par nuevo (acceso + refresco).
 * Devuelve null si el refresco es inválido, caducó o el usuario ya no existe.
 */
export async function refreshSession(refreshToken: string) {
  let payload: (JWTPayload & { typ?: string }) | null = null;
  try {
    payload = jwt.verify(refreshToken, JWT_SECRET) as JWTPayload & { typ?: string };
  } catch {
    return null;
  }
  if (!payload || payload.typ !== "refresh") return null;

  const db = await getDb();
  if (!db) return null;
  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user) return null;

  const nextPayload: JWTPayload = { userId: user.id, email: user.email, role: user.role };
  return {
    user,
    token: generateToken(nextPayload),
    refreshToken: generateRefreshToken(nextPayload),
  };
}

export async function registerUser(email: string, password: string, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Verificar si el email ya existe
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    throw new Error("El email ya está registrado");
  }

  // Hash de la contraseña
  const hashedPassword = await hashPassword(password);

  // Crear usuario
  await db.insert(users).values({
    email,
    password: hashedPassword,
    name,
    role: "user",
  });

  // Obtener el usuario creado
  const [newUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  
  return newUser;
}

export async function loginUser(email: string, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Buscar usuario
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  
  if (!user) {
    throw new Error("Email o contraseña incorrectos");
  }

  // Verificar contraseña
  const isValid = await comparePassword(password, user.password);
  
  if (!isValid) {
    throw new Error("Email o contraseña incorrectos");
  }

  // Actualizar última conexión
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

  // Generar tokens
  const payload: JWTPayload = { userId: user.id, email: user.email, role: user.role };
  const token = generateToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return { user, token, refreshToken };
}

export async function getUserFromToken(token: string) {
  const payload = verifyToken(token);
  if (!payload) return null;

  const db = await getDb();
  if (!db) return null;

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  return user || null;
}
