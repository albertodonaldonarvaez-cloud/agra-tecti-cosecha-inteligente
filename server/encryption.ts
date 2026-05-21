import crypto from "crypto";

/**
 * Módulo de encriptación simétrica AES-256-GCM para secretos de API.
 * Usa JWT_SECRET como clave de derivación (scrypt).
 * A diferencia de bcrypt (one-way), esto permite encriptar y desencriptar.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT = "agratec-copernicus-salt-v1"; // Salt fijo para derivación de clave

function deriveKey(): Buffer {
  const secret = process.env.JWT_SECRET || "your-secret-key-change-in-production";
  return crypto.scryptSync(secret, SALT, 32);
}

/**
 * Encripta un string con AES-256-GCM.
 * Retorna un JSON string con {iv, tag, data} codificados en base64.
 */
export function encryptSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted,
  });
}

/**
 * Desencripta un string encriptado con encryptSecret().
 * Recibe el JSON string con {iv, tag, data}.
 */
export function decryptSecret(encrypted: string): string {
  try {
    const { iv, tag, data } = JSON.parse(encrypted);
    const key = deriveKey();
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));

    let decrypted = decipher.update(data, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("[Encryption] Error al desencriptar:", error);
    throw new Error("No se pudo desencriptar el secreto. Verifica que JWT_SECRET no haya cambiado.");
  }
}

/**
 * Verifica si un string parece estar encriptado con este módulo.
 */
export function isEncrypted(value: string): boolean {
  try {
    const parsed = JSON.parse(value);
    return !!(parsed.iv && parsed.tag && parsed.data);
  } catch {
    return false;
  }
}
