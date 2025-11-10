import XLSX from 'xlsx';
import { getDb } from './server/db';
import { boxes, harvesters, parcels } from './drizzle/schema';

async function loadFromExcel() {
  try {
    // Leer el archivo Excel
    const workbook = XLSX.readFile('/home/ubuntu/upload/cosecha-sistema-base-de-datos-full.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log('📦 Datos cargados del archivo Excel');
    console.log(`📊 Total de registros: ${data.length}`);
    
    const db = await getDb();
    if (!db) {
      console.error('❌ Base de datos no disponible');
      return;
    }
    
    console.log('🔄 Procesando datos...\n');
    
    let processedCount = 0;
    let newBoxes = 0;
    let updatedBoxes = 0;
    const errors: string[] = [];
    const parcelsSet = new Set<string>();
    const harvestersSet = new Set<number>();
    
    for (const row of data as any[]) {
      try {
        // Parsear código de parcela
        const parcelParts = (row['Escanea la parcela'] || '').split(' -');
        const parcelCode = parcelParts[0]?.trim() || '';
        const parcelName = parcelParts[1]?.trim() || '';
        
        // Parsear código de caja
        const boxCode = row['Escanea la caja'];
        if (!boxCode || typeof boxCode !== 'string') {
          errors.push(`Código de caja inválido: ${boxCode}`);
          continue;
        }
        
        const boxParts = boxCode.split('-');
        if (boxParts.length !== 2) {
          errors.push(`Formato de caja inválido: ${boxCode}`);
          continue;
        }
        
        const harvesterId = parseInt(boxParts[0]);
        const boxNumber = boxParts[1];
        
        // Parsear peso (convertir de kg a gramos)
        const weightKg = parseFloat(row['Peso de la caja'] || '0');
        const weight = Math.round(weightKg * 1000);
        
        // Construir fecha desde año/mes/dia
        let submissionTime: Date;
        if (row['año'] && row['mes'] && row['dia']) {
          // Usar las columnas de fecha del Excel
          submissionTime = new Date(row['año'], row['mes'] - 1, row['dia']);
        } else if (row['_submission_time'] && typeof row['_submission_time'] === 'number') {
          // Convertir fecha numérica de Excel a Date
          // Excel fecha base es 1900-01-01, pero JavaScript usa 1970-01-01
          const excelEpoch = new Date(1899, 11, 30); // Excel epoch
          submissionTime = new Date(excelEpoch.getTime() + row['_submission_time'] * 86400000);
        } else {
          // Usar fecha actual como fallback
          submissionTime = new Date();
        }
        
        // Parsear ubicación
        const latitude = row['_Pon tu ubicación_latitude']?.toString() || null;
        const longitude = row['_Pon tu ubicación_longitude']?.toString() || null;
        
        // Foto
        const photoFilename = row['foto de la caja de primera'] || null;
        const photoUrl = row['foto de la caja de primera_URL'] || null;
        
        // Insertar o actualizar parcela
        if (parcelCode) {
          await db.insert(parcels).values({
            code: parcelCode,
            name: parcelName,
          }).onDuplicateKeyUpdate({
            set: { name: parcelName, updatedAt: new Date() },
          });
          parcelsSet.add(parcelCode);
        }
        
        // Insertar o actualizar cortadora
        await db.insert(harvesters).values({
          number: harvesterId,
        }).onDuplicateKeyUpdate({
          set: { updatedAt: new Date() },
        });
        harvestersSet.add(harvesterId);
        
        // Usar _id como koboId
        const koboId = row['_id'] || 0;
        
        // Verificar si la caja ya existe (por boxCode, no por koboId)
        const existingBox = await db.select().from(boxes).where(eq(boxes.boxCode, boxCode)).limit(1);
        const isNew = existingBox.length === 0;
        
        // Insertar o actualizar caja usando boxCode como clave única
        await db.insert(boxes).values({
          koboId,
          boxCode,
          harvesterId,
          parcelCode,
          parcelName,
          weight,
          photoFilename,
          photoUrl,
          photoLargeUrl: null,
          photoMediumUrl: null,
          photoSmallUrl: null,
          latitude,
          longitude,
          submissionTime,
        }).onDuplicateKeyUpdate({
          set: {
            koboId,
            harvesterId,
            parcelCode,
            parcelName,
            weight,
            photoFilename,
            photoUrl,
            latitude,
            longitude,
            submissionTime,
            updatedAt: new Date(),
          },
        });
        
        processedCount++;
        if (isNew) newBoxes++;
        else updatedBoxes++;
        
        // Mostrar progreso cada 100 registros
        if (processedCount % 100 === 0) {
          console.log(`   Procesados: ${processedCount}/${data.length}`);
        }
      } catch (error) {
        errors.push(`Error procesando ${row['Escanea la caja']}: ${error}`);
      }
    }
    
    console.log('\n✅ Datos cargados exitosamente');
    console.log(`📦 Cajas procesadas: ${processedCount}`);
    console.log(`🆕 Cajas nuevas: ${newBoxes}`);
    console.log(`🔄 Cajas actualizadas: ${updatedBoxes}`);
    console.log(`📍 Parcelas procesadas: ${parcelsSet.size}`);
    console.log(`👷 Cortadoras procesadas: ${harvestersSet.size}`);
    
    if (errors.length > 0) {
      console.log(`\n⚠️  Errores encontrados: ${errors.length}`);
      errors.slice(0, 10).forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
      if (errors.length > 10) {
        console.log(`   ... y ${errors.length - 10} errores más`);
      }
    }
    
    console.log('\n✨ Proceso completado');
  } catch (error) {
    console.error('❌ Error al cargar datos:', error);
    process.exit(1);
  }
}

// Importar eq para las consultas
import { eq } from 'drizzle-orm';

loadFromExcel();
