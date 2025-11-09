import { getDb } from "./db";
import { boxes, harvesters, parcels } from "../drizzle/schema";

interface KoboAttachment {
  download_url: string;
  download_large_url?: string;
  download_medium_url?: string;
  download_small_url?: string;
  media_file_basename: string;
}

interface KoboResult {
  escanea_la_parcela: string;
  escanea_la_caja: string;
  peso_de_la_caja: string;
  foto_de_la_caja: string;
  tu_ubicacion: string;
  _attachments?: KoboAttachment[];
  _submission_time: string;
}

interface KoboData {
  results: KoboResult[];
}

export async function processKoboData(data: KoboData) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let processedCount = 0;
  const errors: string[] = [];

  for (const result of data.results) {
    try {
      // Parsear código de parcela
      const parcelParts = result.escanea_la_parcela.split(" -");
      const parcelCode = parcelParts[0].trim();
      const parcelName = parcelParts[1]?.trim() || "";

      // Parsear código de caja (formato: XX-XXXXXX)
      const boxParts = result.escanea_la_caja.split("-");
      if (boxParts.length !== 2) {
        errors.push(`Formato de caja inválido: ${result.escanea_la_caja}`);
        continue;
      }

      const harvesterId = parseInt(boxParts[0]);
      const boxNumber = boxParts[1];
      const boxCode = result.escanea_la_caja;

      // Parsear peso (convertir de kg a gramos para almacenar como entero)
      const weightKg = parseFloat(result.peso_de_la_caja);
      const weight = Math.round(weightKg * 1000); // Convertir a gramos

      // Parsear ubicación
      const locationParts = result.tu_ubicacion.split(" ");
      const latitude = locationParts[0] || null;
      const longitude = locationParts[1] || null;

       // Extraer URLs de fotos
      let photoFilename = result.foto_de_la_caja || null;
      let photoUrl = null;
      let photoLargeUrl = null;
      let photoMediumUrl = null;
      let photoSmallUrl = null;

      if (result._attachments && result._attachments.length > 0) {
        const attachment = result._attachments[0];
        photoFilename = attachment.media_file_basename || photoFilename;
        photoUrl = attachment.download_url;
        photoLargeUrl = attachment.download_large_url || null;
        photoMediumUrl = attachment.download_medium_url || null;
        photoSmallUrl = attachment.download_small_url || null;
      }

      // Insertar o actualizar parcela
      await db.insert(parcels).values({
        code: parcelCode,
        name: parcelName,
      }).onDuplicateKeyUpdate({
        set: { name: parcelName, updatedAt: new Date() },
      });

      // Insertar o actualizar cortadora
      await db.insert(harvesters).values({
        number: harvesterId,
      }).onDuplicateKeyUpdate({
        set: { updatedAt: new Date() },
      });

      // Usar _id como koboId
      const koboId = (result as any)._id || 0;

      // Insertar o actualizar caja
      await db.insert(boxes).values({
        koboId,
        boxCode,
        harvesterId,
        parcelCode,
        parcelName,
        weight,
        photoFilename,
        photoUrl,
        photoLargeUrl,
        photoMediumUrl,
        photoSmallUrl,
        latitude,
        longitude,
        submissionTime: new Date(result._submission_time),
      }).onDuplicateKeyUpdate({
        set: {
          harvesterId,
          parcelCode,
          parcelName,
          weight,
          photoFilename,
          photoUrl,
          photoLargeUrl,
          photoMediumUrl,
          photoSmallUrl,
          latitude,
          longitude,
          submissionTime: new Date(result._submission_time),
          updatedAt: new Date(),
        },
      });

      processedCount++;
    } catch (error) {
      errors.push(`Error procesando ${result.escanea_la_caja}: ${error}`);
    }
  }

  return {
    success: true,
    processedCount,
    totalCount: data.results.length,
    errors,
  };
}

export async function syncFromKoboAPI(apiUrl: string, apiToken: string, assetId: string) {
  try {
    const url = `${apiUrl}/api/v2/assets/${assetId}/data.json`;
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Token ${apiToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Error al conectar con Kobo: ${response.statusText}`);
    }

    const data: KoboData = await response.json();
    
    return await processKoboData(data);
  } catch (error) {
    throw new Error(`Error en sincronización: ${error}`);
  }
}
