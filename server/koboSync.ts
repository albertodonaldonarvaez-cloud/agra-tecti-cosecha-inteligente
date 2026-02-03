import { getDb } from "./db";
import { boxes, harvesters, parcels } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { insertUploadError } from "./db_extended";

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
  start?: string; // Hora de inicio del registro en campo
  end?: string;   // Hora de fin del registro
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
      // Formato esperado: "123 -NOMBRE" o " -NOMBRE" (sin número)
      const parcelRaw = result.escanea_la_parcela.trim();
      let parcelCode = "";
      let parcelName = "";
      
      if (parcelRaw.startsWith("-")) {
        // Formato: "-NOMBRE" (sin número, el código es el nombre completo)
        parcelCode = parcelRaw; // Usar el formato completo como código
        parcelName = parcelRaw.substring(1).trim(); // Quitar el guión inicial
      } else if (parcelRaw.includes(" -")) {
        // Formato: "123 -NOMBRE"
        const parcelParts = parcelRaw.split(" -");
        parcelCode = parcelParts[0].trim();
        parcelName = parcelParts[1]?.trim() || "";
        // Si el código está vacío, usar el formato completo
        if (!parcelCode) {
          parcelCode = parcelRaw;
          parcelName = parcelRaw.replace(/^\s*-\s*/, "");
        }
      } else {
        // Formato desconocido, usar todo como código y nombre
        parcelCode = parcelRaw;
        parcelName = parcelRaw;
      }

      // Parsear código de caja (formato: XX-XXXXXX)
      const boxParts = result.escanea_la_caja.split("-");
      if (boxParts.length !== 2) {
        errors.push(`Formato de caja inválido: ${result.escanea_la_caja}`);
        continue;
      }

      const harvesterId = parseInt(boxParts[0]);
      const boxNumber = boxParts[1];
      const boxCode = result.escanea_la_caja;

      // Parsear ubicación (necesario antes de validaciones)
      const locationParts = result.tu_ubicacion.split(" ");
      const latitude = locationParts[0] || null;
      const longitude = locationParts[1] || null;

      // Parsear peso (convertir de kg a gramos para almacenar como entero)
      const weightKg = parseFloat(result.peso_de_la_caja);
      const weight = Math.round(weightKg * 1000); // Convertir a gramos

      // NOTA: Ya no descartamos cajas con peso alto.
      // Las cajas con peso > 15 kg se marcan visualmente en el Editor de Cajas
      // para revisión manual (posible error de punto decimal).
      // Solo registramos un log para monitoreo.
      if (weight > 15000) {
        console.log(`⚠️ Peso alto detectado: ${weightKg} kg en caja ${result.escanea_la_caja} - Se insertará para revisión manual`);
      }

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

      // Calcular la fecha/hora de la caja actual
      const submissionTime = (result.start && result.start.trim() !== '') 
        ? new Date(result.start) 
        : (result._submission_time && result._submission_time.trim() !== '') 
          ? new Date(result._submission_time) 
          : new Date();

      // Verificar si existe un duplicado EXACTO (mismo código + misma fecha/hora)
      // Solo bloqueamos si coincide código Y fecha/hora exacta (para evitar re-importar el mismo registro)
      const { and } = await import("drizzle-orm");
      const existingExactDuplicate = await db.select()
        .from(boxes)
        .where(
          and(
            eq(boxes.boxCode, boxCode),
            eq(boxes.submissionTime, submissionTime)
          )
        )
        .limit(1);
      
      if (existingExactDuplicate.length > 0) {
        // Duplicado exacto (mismo código Y misma fecha/hora) - este es el mismo registro, saltar
        errors.push(`Registro duplicado exacto (ya importado): ${boxCode} del ${submissionTime.toISOString()}`);
        continue; // No insertar, ya existe este registro exacto
      }

      // NOTA: Si el código existe pero con diferente fecha/hora, SE PERMITE LA INSERCIÓN
      // El usuario decidirá manualmente en el Editor de Cajas si es un duplicado real o una caja diferente

      // Insertar caja (sin onDuplicateKeyUpdate)
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
        submissionTime, // Usar la variable ya calculada arriba
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

export async function syncFromKoboAPI(apiUrl: string, apiToken: string, assetId: string, date?: string) {
  try {
    console.log('🔄 Iniciando sincronización con KoboToolbox...');
    console.log('🌐 API URL:', apiUrl);
    console.log('📎 Asset ID:', assetId);
    if (date) {
      console.log('📅 Fecha específica:', date);
    }
    
    let url = `${apiUrl}/api/v2/assets/${assetId}/data.json`;
    
    // Si se especifica una fecha, agregar query para filtrar por día
    if (date) {
      // Construir rango de fecha en zona horaria de México (UTC-6)
      const startDate = `${date}T00:00:00`;
      const endDate = `${date}T23:59:59`;
      
      const query = JSON.stringify({
        "_submission_time": {
          "$gte": startDate,
          "$lt": endDate
        }
      });
      
      url += `?query=${encodeURIComponent(query)}`;
      console.log('🔍 Query aplicado:', query);
    }
    
    console.log('🔗 URL completa:', url);
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Token ${apiToken}`,
      },
      // Agregar timeout de 30 segundos
      signal: AbortSignal.timeout(30000),
    });

    console.log('\ud83d\udce1 Respuesta recibida. Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('\u274c Error de API:', response.status, errorText);
      throw new Error(`Error al conectar con Kobo (${response.status}): ${response.statusText}`);
    }

    const data: KoboData = await response.json();
    console.log('\ud83d\udcca Datos recibidos:', data.results?.length || 0, 'registros');
    
    const result = await processKoboData(data);
    console.log('\u2705 Sincronización completada:', result.processedCount, 'registros procesados');
    
    return result;
  } catch (error: any) {
    console.error('\u274c Error en sincronización:', error);
    
    // Proporcionar mensajes de error más específicos
    if (error.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado al conectar con KoboToolbox. Verifica tu conexión a internet.');
    }
    
    if (error.cause?.code === 'ENOTFOUND') {
      throw new Error('No se pudo resolver el dominio de KoboToolbox. Verifica la URL de la API.');
    }
    
    if (error.cause?.code === 'ECONNREFUSED') {
      throw new Error('Conexión rechazada por KoboToolbox. Verifica la URL de la API.');
    }
    
    throw new Error(`Error en sincronización: ${error.message || error}`);
  }
}
