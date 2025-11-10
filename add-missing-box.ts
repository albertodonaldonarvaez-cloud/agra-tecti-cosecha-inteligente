import XLSX from 'xlsx';
import { getDb } from './server/db';
import { boxes, harvesters, parcels } from './drizzle/schema';
import { eq } from 'drizzle-orm';

async function addMissingBox() {
  try {
    // Leer el archivo Excel
    const workbook = XLSX.readFile('/home/ubuntu/upload/cosecha-sistema-base-de-datos-full.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    // Buscar la caja con código 15617848
    const missingBox = (data as any[]).find(row => 
      row['Escanea la caja'] === '15617848' || 
      row['Escanea la caja'] === 15617848
    );
    
    if (!missingBox) {
      console.log('❌ No se encontró la caja con código 15617848 en el Excel');
      return;
    }
    
    console.log('📦 Caja encontrada:');
    console.log(JSON.stringify(missingBox, null, 2));
    
    const db = await getDb();
    if (!db) {
      console.error('❌ Base de datos no disponible');
      return;
    }
    
    // El código no tiene el formato XX-XXXXXX, vamos a corregirlo
    // Asumiendo que debería ser 15-617848
    const correctedBoxCode = '15-617848';
    
    // Parsear datos
    const parcelParts = (missingBox['Escanea la parcela'] || '').split(' -');
    const parcelCode = parcelParts[0]?.trim() || '';
    const parcelName = parcelParts[1]?.trim() || '';
    
    const harvesterId = 15; // Del código corregido
    const boxNumber = '617848';
    
    const weightKg = parseFloat(missingBox['Peso de la caja'] || '0');
    const weight = Math.round(weightKg * 1000);
    
    // Construir fecha
    let submissionTime: Date;
    if (missingBox['año'] && missingBox['mes'] && missingBox['dia']) {
      submissionTime = new Date(missingBox['año'], missingBox['mes'] - 1, missingBox['dia'], 12, 0, 0);
    } else {
      submissionTime = new Date();
    }
    
    const latitude = missingBox['_Pon tu ubicación_latitude']?.toString() || null;
    const longitude = missingBox['_Pon tu ubicación_longitude']?.toString() || null;
    
    const photoFilename = missingBox['foto de la caja de primera'] || null;
    const photoUrl = missingBox['foto de la caja de primera_URL'] || null;
    
    const koboId = missingBox['_id'] || null;
    
    // Insertar/actualizar parcela
    if (parcelCode) {
      await db.insert(parcels)
        .values({ code: parcelCode, name: parcelName || parcelCode })
        .onDuplicateKeyUpdate({ set: { name: parcelName || parcelCode } });
    }
    
    // Insertar/actualizar cortadora
    await db.insert(harvesters)
      .values({ id: harvesterId, name: `Cortadora ${harvesterId}` })
      .onDuplicateKeyUpdate({ set: { name: `Cortadora ${harvesterId}` } });
    
    // Insertar/actualizar caja
    const boxData = {
      boxCode: correctedBoxCode,
      harvesterId,
      boxNumber,
      parcelCode: parcelCode || null,
      weight,
      latitude,
      longitude,
      photoFilename,
      photoUrl,
      koboId,
      submissionTime,
    };
    
    await db.insert(boxes)
      .values(boxData)
      .onDuplicateKeyUpdate({ set: boxData });
    
    console.log(`✅ Caja ${correctedBoxCode} agregada exitosamente`);
    console.log(`   Peso: ${weightKg} kg`);
    console.log(`   Fecha: ${submissionTime.toLocaleDateString('es-MX')}`);
    console.log(`   Parcela: ${parcelCode}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

addMissingBox();
