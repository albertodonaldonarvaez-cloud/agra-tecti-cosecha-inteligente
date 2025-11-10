import { getDb } from './server/db';
import { boxes, harvesters, parcels } from './drizzle/schema';

async function addMissingBox() {
  try {
    const db = await getDb();
    if (!db) {
      console.error('❌ Base de datos no disponible');
      return;
    }
    
    // Datos del registro encontrado en el JSON
    const correctedBoxCode = '15-617848'; // Código corregido
    const harvesterId = 15;
    const boxNumber = '617848';
    const parcelCode = '372';
    const parcelName = 'MICAELA';
    const weightKg = 8.285;
    const weight = Math.round(weightKg * 1000); // 8285 gramos
    const submissionTime = new Date(2025, 9, 27, 12, 0, 0); // 27 de octubre 2025 (mes 9 = octubre)
    const latitude = '18.69098325';
    const longitude = '-99.18060782';
    const photoFilename = '1761596357556.jpg';
    const photoUrl = 'https://kf.kobotoolbox.org/api/v2/assets/aftaTojWJyxjUWyWnAk7Ff/data/592223322/attachments/attkPzDP99izodMBzjTzFaw7/';
    const koboId = 592223322;
    
    // Insertar/actualizar parcela
    await db.insert(parcels)
      .values({ code: parcelCode, name: parcelName })
      .onDuplicateKeyUpdate({ set: { name: parcelName } });
    
    console.log(`✅ Parcela ${parcelCode} - ${parcelName} procesada`);
    
    // Insertar/actualizar cortadora
    await db.insert(harvesters)
      .values({ number: harvesterId })
      .onDuplicateKeyUpdate({ set: { number: harvesterId } });
    
    console.log(`✅ Cortadora ${harvesterId} procesada`);
    
    // Insertar/actualizar caja
    const boxData = {
      boxCode: correctedBoxCode,
      harvesterId,
      boxNumber,
      parcelCode,
      parcelName,
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
    
    console.log(`\n✅ Caja ${correctedBoxCode} agregada exitosamente`);
    console.log(`   Peso: ${weightKg} kg (${weight} gramos)`);
    console.log(`   Fecha: ${submissionTime.toLocaleDateString('es-MX')}`);
    console.log(`   Parcela: ${parcelCode} - ${parcelName}`);
    console.log(`   Cortadora: ${harvesterId}`);
    console.log(`   Ubicación: ${latitude}, ${longitude}`);
    console.log(`   Foto: ${photoFilename}`);
    console.log(`   KoboID: ${koboId}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

addMissingBox();
