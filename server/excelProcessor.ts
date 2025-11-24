import XLSX from 'xlsx';
import { nanoid } from 'nanoid';
import { getDb } from './db';
import { boxes, harvesters, parcels, uploadErrors, uploadBatches } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import { downloadPhoto } from './photoDownloader';
import { findParcelByCoordinates } from './kmlParser';

interface ExcelRow {
  'Escanea la parcela': string;
  'Escanea la caja': string;
  'Peso de la caja': number;
  'foto de la caja de primera': string;
  'foto de la caja de primera_URL': string;
  '_Pon tu ubicación_latitude': number;
  '_Pon tu ubicación_longitude': number;
  '_id': number;
  '_submission_time': string;
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
  errors: ValidationError[];
  newBoxes: number;
  updatedBoxes: number;
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

  // Formato esperado: "CODIGO -NOMBRE" o "CODIGO - NOMBRE"
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
 * Procesa un archivo Excel y carga los datos con validación
 */
export async function processExcelFile(
  filePath: string,
  fileName: string,
  userId: number,
  apiConfig: { apiUrl: string; apiToken: string; assetId: string },
  downloadPhotos: boolean = true
): Promise<ProcessResult> {
  const batchId = nanoid();
  const errors: ValidationError[] = [];
  let successRows = 0;
  let errorRows = 0;
  let newBoxes = 0;
  let updatedBoxes = 0;

  const db = await getDb();
  if (!db) {
    throw new Error('Base de datos no disponible');
  }

  // Leer el archivo Excel
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet) as ExcelRow[];

  const totalRows = data.length;

  // Crear registro del lote
  await db.insert(uploadBatches).values({
    batchId,
    fileName,
    totalRows,
    successRows: 0,
    errorRows: 0,
    status: 'processing',
    uploadedBy: userId,
  });

  // Obtener todas las parcelas activas para validación y georreferenciación
  const activeParcels = await db.select().from(parcels).where(eq(parcels.isActive, true));
  const parcelCodes = new Set(activeParcels.map(p => p.code));

  console.log(`📦 Procesando ${totalRows} registros del archivo ${fileName}`);
  console.log(`🔑 Batch ID: ${batchId}`);

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

      // Verificar si la caja ya existe
      const existingBox = await db.select().from(boxes).where(eq(boxes.boxCode, boxCode)).limit(1);
      if (existingBox.length > 0) {
        errors.push({
          type: 'duplicate_box',
          boxCode,
          message: `La caja ${boxCode} ya existe en la base de datos`,
          rowData: row
        });
        errorRows++;
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
            console.log(`✓ Caja ${boxCode} georreferenciada a parcela ${parcelCode}`);
          } else {
            errors.push({
              type: 'invalid_parcel',
              boxCode,
              parcelCode: row['Escanea la parcela'],
              message: `Parcela inválida y no se pudo georreferenciar (lat: ${lat}, lng: ${lng})`,
              rowData: row
            });
            errorRows++;
            continue;
          }
        } else {
          errors.push({
            type: 'invalid_parcel',
            boxCode,
            parcelCode: row['Escanea la parcela'],
            message: 'Parcela inválida y sin coordenadas para georreferenciar',
            rowData: row
          });
          errorRows++;
          continue;
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
          // Agregar al set para futuras validaciones en este lote
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
      
      // Validar peso máximo (20 kg = 20000 gramos)
      if (weight > 20000) {
        errors.push({
          type: 'peso_excesivo',
          boxCode,
          message: `Peso excesivo: ${weightKg} kg (máximo 20 kg). Probablemente falta punto decimal.`,
          rowData: row
        });
        errorRows++;
        continue;
      }

      // Construir fecha
      let submissionTime: Date;
      if (row['año'] && row['mes'] && row['dia']) {
        submissionTime = new Date(row['año'], row['mes'] - 1, row['dia'], 12, 0, 0);
      } else if (row['_submission_time']) {
        submissionTime = new Date(row['_submission_time']);
      } else {
        submissionTime = new Date();
      }

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
        } else {
          errors.push({
            type: 'photo_download_failed',
            boxCode,
            message: `Error descargando foto: ${downloadResult.error}`,
            rowData: row
          });
          // No fallar la fila completa por error de foto
        }
      }

      // Insertar o actualizar parcela
      if (parcelCode) {
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
        console.log(`   Procesados: ${i + 1}/${totalRows} (${successRows} exitosos, ${errorRows} errores)`);
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

  console.log(`\n✅ Procesamiento completado`);
  console.log(`   Total: ${totalRows} | Exitosos: ${successRows} | Errores: ${errorRows}`);

  return {
    batchId,
    totalRows,
    successRows,
    errorRows,
    errors,
    newBoxes,
    updatedBoxes,
  };
}
