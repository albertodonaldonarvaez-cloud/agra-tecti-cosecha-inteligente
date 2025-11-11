import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

interface PhotoDownloadResult {
  success: boolean;
  localPath?: string;
  error?: string;
}

/**
 * Descarga una foto desde la API de KoboToolbox
 * @param photoUrl URL completa de la foto en KoboToolbox
 * @param apiToken Token de autenticación de la API
 * @param boxCode Código de la caja para nombrar el archivo
 * @param downloadDir Directorio donde guardar las fotos
 */
export async function downloadPhoto(
  photoUrl: string,
  apiToken: string,
  boxCode: string,
  downloadDir: string = '/home/ubuntu/agra-tecti-cosecha-inteligente/photos'
): Promise<PhotoDownloadResult> {
  try {
    // Crear directorio si no existe
    await fs.mkdir(downloadDir, { recursive: true });

    // Extraer extensión de la URL o usar .jpg por defecto
    const urlParts = photoUrl.split('.');
    const extension = urlParts.length > 1 ? urlParts[urlParts.length - 1].split('?')[0] : 'jpg';
    
    // Generar nombre de archivo seguro
    const safeBoxCode = boxCode.replace(/[^a-zA-Z0-9-]/g, '_');
    const fileName = `${safeBoxCode}.${extension}`;
    const localPath = path.join(downloadDir, fileName);

    // Verificar si el archivo ya existe
    try {
      await fs.access(localPath);
      // Si existe, retornar sin descargar de nuevo
      return {
        success: true,
        localPath
      };
    } catch {
      // El archivo no existe, continuar con la descarga
    }

    // Descargar la foto
    const response = await axios.get(photoUrl, {
      headers: {
        'Authorization': `Token ${apiToken}`
      },
      responseType: 'arraybuffer',
      timeout: 30000, // 30 segundos de timeout
      maxContentLength: 50 * 1024 * 1024, // Máximo 50MB
    });

    // Guardar el archivo
    await fs.writeFile(localPath, response.data);

    return {
      success: true,
      localPath
    };
  } catch (error: any) {
    console.error(`Error descargando foto para ${boxCode}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Descarga múltiples fotos en lote con control de concurrencia
 * @param photos Array de objetos con photoUrl, boxCode
 * @param apiToken Token de la API
 * @param downloadDir Directorio de descarga
 * @param concurrency Número de descargas simultáneas
 */
export async function downloadPhotosInBatch(
  photos: Array<{ photoUrl: string; boxCode: string }>,
  apiToken: string,
  downloadDir: string = '/home/ubuntu/agra-tecti-cosecha-inteligente/photos',
  concurrency: number = 5
): Promise<{ success: number; failed: number; results: PhotoDownloadResult[] }> {
  const results: PhotoDownloadResult[] = [];
  let success = 0;
  let failed = 0;

  // Procesar en lotes con concurrencia controlada
  for (let i = 0; i < photos.length; i += concurrency) {
    const batch = photos.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(photo => downloadPhoto(photo.photoUrl, apiToken, photo.boxCode, downloadDir))
    );

    for (const result of batchResults) {
      results.push(result);
      if (result.success) {
        success++;
      } else {
        failed++;
      }
    }

    // Log de progreso
    console.log(`Fotos descargadas: ${i + batch.length}/${photos.length}`);
  }

  return { success, failed, results };
}

/**
 * Obtiene la ruta pública de una foto descargada
 */
export function getPhotoPublicPath(localPath: string): string {
  // Convertir ruta local a ruta pública
  const fileName = path.basename(localPath);
  return `/photos/${fileName}`;
}
