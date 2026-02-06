import XLSX from 'xlsx';
import { nanoid } from 'nanoid';
import { getDb } from './db';
import { boxes, harvesters, parcels, uploadErrors, uploadBatches } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import { downloadPhoto } from './photoDownloader';
import { findParcelByCoordinates } from './kmlParser';

interface HistoricalExcelRow {
  'start': Date | string;
  'end': Date | string;
  'Escanea la parcela': string;
  'Escanea la caja': string;
  'Peso de la caja': number;
  'foto de la caja de primera': string;
  'foto de la caja de primera_URL': string;
  'Pon tu ubicación': string;
  '_Pon tu ubicación_latitude': number;
  '_Pon tu ubicación_longitude': number;
  '_Pon tu ubicación_altitude': number;
  '_Pon tu ubicación_precision': number;
  '_id': number;
  '_uuid': string;
  '_submission_time': string;
  '_validation_status': string;
  '_notes': string;
  '_status': string;
  '_submitted_by': string;
  '__version__': string;
  '_tags': string;
  '_index': number;
  'año': number;
  'mes': number;
  'dia': number;
  'ID': number;
  'Clasificacion': string;
}

interface ValidationError {
  type: 'duplicate_box' | 'invalid_parcel' | 'missing_data' | 'invalid_format' | 'photo_download_failed' | 'other';
  boxCode?: string;
  parcelCode?: string;
  message: string;
  rowData: any;
}

interface ProcessResult {
  batchId: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  skippedRows: number;
  errors: ValidationError[];
  newBoxes: number;
}

/**
 * Valida el formato de un código de caja
 */
function validateBoxCode(boxCode: any): { valid: boolean; harvesterId?: number; error?: string } {
  if (!boxCode || typeof boxCode !== 'string') {
    return { valid: false, error: 'Código de caja inválido o vacío' };
  }

  const parts = boxCode.split('-');
  if (parts.length !== 2) {
    return { valid: false, error: `Formato de caja inválido: ${boxCode}. Debe ser XX-XXXXXX` };
  }

  const harvesterId = parseInt(parts[0]);
  if (isNaN(harvesterId) || harvesterId < 1 || harvesterId > 99) {
    return { valid: false, error: `ID de cortadora inválido: ${parts[0]}. Debe estar entre 1 y 99` };
  }

  return { valid: true, harvesterId };
}

/**
 * Valida y parsea el código de parcela
 */
function parseParcelCode(parcelString: string): { code: string; name: string; error?: string } {
  if (!parcelString || typeof parcelString !== 'string') {
    return { code: '', name: '', error: 'Código de parcela vacío' };
  }

  // Formato esperado: "CODIGO -NOMBRE" o "CODIGO - NOMBRE" o " -NOMBRE"
  const parts = parcelString.split(/\s*-\s*/);
  let code = parts[0]?.trim() || '';
  let name = parts[1]?.trim() || '';

  // Si el código está vacío pero hay nombre (ej. " -LOS ELOTES"), usar el nombre como código
  if (!code && name) {
    code = name;
  }

  if (!code) {
    return { code: '', name: '', error: 'Código de parcela inválido' };
  }

  return { code, name: name || code };
}

/**
 * Convierte un Excel serial date a fecha UTC con hora de México (CST = UTC-6)
 * 
 * PROBLEMA: xlsx interpreta las fechas del Excel usando la zona horaria del servidor,
 * lo cual causa que la hora se desplace dependiendo de dónde corra el servidor.
 * 
 * SOLUCIÓN: Leemos el archivo SIN cellDates para obtener el serial date numérico
 * del Excel. La parte fraccionaria del serial date contiene la hora LOCAL del Excel
 * (que es hora de México CST). Extraemos la hora manualmente y aplicamos el offset
 * correcto (CST = UTC-6). Esto funciona independientemente de la TZ del servidor.
 * 
 * Ejemplo: serial 45954.35690972222
 *   - Parte entera 45954 = 2025-10-24
 *   - Parte fraccionaria 0.35691 = 08:33:57 (hora México CST)
 *   - En UTC: 2025-10-24T14:33:57Z (08:33 + 6 horas)
 */
function parseStartDateTime(startValue: Date | string | number): Date {
  // México zona Centro: CST = UTC-6 (ya no usa horario de verano desde 2023)
  const MEXICO_CST_OFFSET_HOURS = 6;
  
  if (typeof startValue === 'number') {
    // Excel serial date - MÉTODO MÁS CONFIABLE
    // La parte fraccionaria contiene la hora local del Excel (México CST)
    const intPart = Math.floor(startValue);
    const fracPart = startValue - intPart;
    
    // Convertir días a fecha (Excel epoch: 1899-12-30)
    const excelEpoch = Date.UTC(1899, 11, 30); // 30 dic 1899 en UTC
    const dayMs = intPart * 24 * 60 * 60 * 1000;
    const baseDate = new Date(excelEpoch + dayMs);
    
    // Extraer hora de la parte fraccionaria
    const totalSeconds = Math.round(fracPart * 24 * 60 * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    // Construir fecha UTC: hora México + offset = hora UTC
    const utcDate = new Date(Date.UTC(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth(),
      baseDate.getUTCDate(),
      hours + MEXICO_CST_OFFSET_HOURS,
      minutes,
      seconds
    ));
    
    console.log(`   ⏰ Serial ${startValue} -> México: ${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')} CST -> UTC: ${utcDate.toISOString()}`);
    return utcDate;
  }
  
  if (typeof startValue === 'string') {
    // String: "2025-10-24 08:33:57" o "2025-10-24"
    const match = startValue.match(/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2}))?/);
    if (match) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      const day = parseInt(match[3]);
      const hours = match[4] ? parseInt(match[4]) : 12;
      const minutes = match[5] ? parseInt(match[5]) : 0;
      const seconds = match[6] ? parseInt(match[6]) : 0;
      
      const utcDate = new Date(Date.UTC(year, month, day, hours + MEXICO_CST_OFFSET_HOURS, minutes, seconds));
      console.log(`   ⏰ String "${startValue}" -> México: ${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')} CST -> UTC: ${utcDate.toISOString()}`);
      return utcDate;
    }
  }
  
  if (startValue instanceof Date && !isNaN(startValue.getTime())) {
    // Si por alguna razón llega un Date (no debería con cellDates:false)
    // Asumir que los componentes locales son la hora de México
    const hours = startValue.getHours();
    const minutes = startValue.getMinutes();
    const seconds = startValue.getSeconds();
    
    const utcDate = new Date(Date.UTC(
      startValue.getFullYear(),
      startValue.getMonth(),
      startValue.getDate(),
      hours + MEXICO_CST_OFFSET_HOURS,
      minutes,
      seconds
    ));
    console.log(`   ⏰ Date fallback -> México: ${hours}:${minutes}:${seconds} CST -> UTC: ${utcDate.toISOString()}`);
    return utcDate;
  }
  
  // Fallback: fecha actual
  return new Date();
}

/**
 * Procesa un archivo Excel de datos históricos y carga los datos con la hora correcta
 * Usa la columna 'start' para obtener la fecha y hora exacta
 */
export async function processHistoricalExcelFile(
  filePath: string,
  fileName: string,
  userId: number,
  apiConfig: { apiUrl: string; apiToken: string; assetId: string },
  downloadPhotos: boolean = false // Por defecto no descargar fotos para datos históricos
): Promise<ProcessResult> {
  const batchId = nanoid();
  const errors: ValidationError[] = [];
  let successRows = 0;
  let errorRows = 0;
  let skippedRows = 0;
  let newBoxes = 0;

  const db = await getDb();
  if (!db) {
    throw new Error('Base de datos no disponible');
  }

  // Leer el archivo Excel SIN cellDates para obtener serial dates numéricos
  // IMPORTANTE: Con cellDates:false + raw:true, las fechas llegan como números
  // (Excel serial date). La parte fraccionaria contiene la hora local del Excel.
  // Esto nos permite extraer la hora exacta sin depender de la zona horaria del servidor.
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { raw: true }) as HistoricalExcelRow[];

  const totalRows = data.length;

  // Crear registro del lote
  await db.insert(uploadBatches).values({
    batchId,
    fileName: `[HISTÓRICO] ${fileName}`,
    totalRows,
    successRows: 0,
    errorRows: 0,
    status: 'processing',
    uploadedBy: userId,
  });

  // Obtener todas las parcelas activas para validación y georreferenciación
  const activeParcels = await db.select().from(parcels).where(eq(parcels.isActive, true));
  const parcelCodes = new Set(activeParcels.map(p => p.code));

  console.log(`📦 [HISTÓRICO] Procesando ${totalRows} registros del archivo ${fileName}`);
  console.log(`🔑 Batch ID: ${batchId}`);
  console.log(`⏰ Usando columna 'start' para fecha/hora exacta`);

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNumber = i + 2; // +2 porque Excel empieza en 1 y tiene header

    try {
      // Validar código de caja
      const boxValidation = validateBoxCode(row['Escanea la caja']);
      if (!boxValidation.valid) {
        errors.push({
          type: 'invalid_format',
          boxCode: row['Escanea la caja'],
          message: boxValidation.error!,
          rowData: row
        });
        errorRows++;
        continue;
      }

      const boxCode = row['Escanea la caja'];
      const harvesterId = boxValidation.harvesterId!;

      // USAR LA COLUMNA 'start' PARA LA FECHA/HORA EXACTA
      let submissionTime: Date;
      if (row['start']) {
        submissionTime = parseStartDateTime(row['start']);
        console.log(`   Fila ${rowNumber}: ${boxCode} -> ${submissionTime.toISOString()}`);
      } else if (row['año'] && row['mes'] && row['dia']) {
        // Fallback: usar año/mes/dia con hora 12:00
        submissionTime = new Date(row['año'], row['mes'] - 1, row['dia'], 12, 0, 0);
      } else {
        submissionTime = new Date();
      }

      // === PROTECCIÓN DE CAJAS EDITADAS MANUALMENTE ===
      const { and } = await import("drizzle-orm");
      
      // 1. Buscar por koboId
      const koboId = row['_id'] || null;
      if (koboId) {
        const existingByKoboId = await db.select()
          .from(boxes)
          .where(eq(boxes.koboId, koboId))
          .limit(1);
        
        if (existingByKoboId.length > 0) {
          skippedRows++;
          continue;
        }
      }
      
      // 2. Buscar por código + fecha/hora exacta
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
        skippedRows++;
        continue;
      }
      
      // 3. Buscar por originalBoxCode + fecha/hora (caja editada que cambió de código)
      const existingEditedBox = await db.select()
        .from(boxes)
        .where(
          and(
            eq(boxes.originalBoxCode, boxCode),
            eq(boxes.submissionTime, submissionTime),
            eq(boxes.manuallyEdited, true)
          )
        )
        .limit(1);
      
      if (existingEditedBox.length > 0) {
        skippedRows++;
        continue;
      }

      // Parsear y validar parcela
      let parcelCode = '';
      let parcelName = '';
      const parcelParsed = parseParcelCode(row['Escanea la parcela']);
      
      if (parcelParsed.error) {
        // Si no hay parcela válida, intentar georreferenciar
        const lat = row['_Pon tu ubicación_latitude'];
        const lng = row['_Pon tu ubicación_longitude'];
        
        if (lat && lng) {
          const foundParcel = findParcelByCoordinates(lat, lng, activeParcels);
          if (foundParcel) {
            parcelCode = foundParcel.code;
            parcelName = foundParcel.name;
          } else {
            // Usar coordenadas como código de parcela temporal
            parcelCode = 'SIN_PARCELA';
            parcelName = 'Sin parcela definida';
          }
        } else {
          parcelCode = 'SIN_PARCELA';
          parcelName = 'Sin parcela definida';
        }
      } else {
        parcelCode = parcelParsed.code;
        parcelName = parcelParsed.name;

        // Si la parcela no existe, crearla automáticamente
        if (!parcelCodes.has(parcelCode)) {
          console.log(`📍 Creando nueva parcela: ${parcelCode} - ${parcelName}`);
          await db.insert(parcels).values({
            code: parcelCode,
            name: parcelName || parcelCode,
            polygon: null,
            isActive: true,
          });
          parcelCodes.add(parcelCode);
        }
      }

      // Validar peso
      const weightKg = parseFloat(String(row['Peso de la caja'] || '0'));
      if (isNaN(weightKg) || weightKg <= 0) {
        errors.push({
          type: 'missing_data',
          boxCode,
          message: `Peso inválido: ${row['Peso de la caja']}`,
          rowData: row
        });
        errorRows++;
        continue;
      }
      const weight = Math.round(weightKg * 1000); // Convertir a gramos

      // Coordenadas
      const latitude = row['_Pon tu ubicación_latitude'] ? String(row['_Pon tu ubicación_latitude']) : null;
      const longitude = row['_Pon tu ubicación_longitude'] ? String(row['_Pon tu ubicación_longitude']) : null;

      // Procesar foto
      let photoFilename = row['foto de la caja de primera'] || null;
      let photoUrl = row['foto de la caja de primera_URL'] || null;
      let localPhotoPath = null;

      if (downloadPhotos && photoUrl && apiConfig.apiToken) {
        const downloadResult = await downloadPhoto(photoUrl, apiConfig.apiToken, boxCode);
        if (downloadResult.success && downloadResult.localPath) {
          localPhotoPath = downloadResult.localPath;
          photoFilename = downloadResult.localPath.split('/').pop() || photoFilename;
        }
      }

      // Insertar o actualizar parcela
      if (parcelCode && parcelCode !== 'SIN_PARCELA') {
        await db.insert(parcels).values({
          code: parcelCode,
          name: parcelName,
          isActive: true,
        }).onDuplicateKeyUpdate({
          set: { name: parcelName, updatedAt: new Date() },
        });
      }

      // Insertar o actualizar cortadora
      await db.insert(harvesters).values({
        number: harvesterId,
      }).onDuplicateKeyUpdate({
        set: { updatedAt: new Date() },
      });

      // Insertar caja
      await db.insert(boxes).values({
        koboId: row['_id'] || null,
        boxCode,
        harvesterId,
        parcelCode,
        parcelName,
        weight,
        photoFilename,
        photoUrl: localPhotoPath || photoUrl,
        photoLargeUrl: null,
        photoMediumUrl: null,
        photoSmallUrl: null,
        latitude,
        longitude,
        submissionTime,
      });

      successRows++;
      newBoxes++;

      // Mostrar progreso cada 50 registros
      if ((i + 1) % 50 === 0) {
        console.log(`   Procesados: ${i + 1}/${totalRows} (${successRows} nuevos, ${skippedRows} omitidos, ${errorRows} errores)`);
      }
    } catch (error: any) {
      console.error(`Error procesando fila ${rowNumber}:`, error);
      errors.push({
        type: 'other',
        boxCode: row['Escanea la caja'],
        message: `Error inesperado: ${error.message}`,
        rowData: row
      });
      errorRows++;
    }
  }

  // Guardar errores en la base de datos
  if (errors.length > 0) {
    const errorRecords = errors.map(err => ({
      uploadBatchId: batchId,
      errorType: err.type,
      boxCode: err.boxCode || null,
      parcelCode: err.parcelCode || null,
      errorMessage: err.message,
      rowData: JSON.stringify(err.rowData),
      resolved: false,
    }));

    // Insertar en lotes de 100
    for (let i = 0; i < errorRecords.length; i += 100) {
      const batch = errorRecords.slice(i, i + 100);
      await db.insert(uploadErrors).values(batch);
    }
  }

  // Actualizar registro del lote
  await db.update(uploadBatches)
    .set({
      successRows,
      errorRows,
      status: errorRows === totalRows ? 'failed' : 'completed',
      completedAt: new Date(),
    })
    .where(eq(uploadBatches.batchId, batchId));

  console.log(`\n✅ [HISTÓRICO] Procesamiento completado`);
  console.log(`   Total: ${totalRows} | Nuevos: ${successRows} | Omitidos: ${skippedRows} | Errores: ${errorRows}`);

  return {
    batchId,
    totalRows,
    successRows,
    errorRows,
    skippedRows,
    errors,
    newBoxes,
  };
}
