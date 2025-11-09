import { drizzle } from "drizzle-orm/mysql2";
import { users } from "./drizzle/schema.ts";
import bcrypt from "bcryptjs";

const db = drizzle(process.env.DATABASE_URL);

const hashedPassword = await bcrypt.hash("admin123", 10);

await db.insert(users).values({
  email: "admin@agratec.com",
  password: hashedPassword,
  name: "Administrador",
  role: "admin",
});

console.log("✅ Usuario admin creado:");
console.log("Email: admin@agratec.com");
console.log("Contraseña: admin123");
