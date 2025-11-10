import { getDb } from './server/db';
import { boxes } from './drizzle/schema';

async function verifyData() {
  const db = await getDb();
  if (!db) {
    console.log('❌ Base de datos no disponible');
    return;
  }

  const allBoxes = await db.select().from(boxes);
  
  console.log('\n📊 Estadísticas de datos cargados:');
  console.log(`✅ Total de cajas en BD: ${allBoxes.length}`);
  console.log(`📸 Cajas con foto: ${allBoxes.filter(b => b.photoUrl).length}`);
  console.log(`📍 Cajas con ubicación: ${allBoxes.filter(b => b.latitude && b.longitude).length}`);
  
  // Contar por cortadora
  const harvesterCounts = new Map<number, number>();
  allBoxes.forEach(box => {
    harvesterCounts.set(box.harvesterId, (harvesterCounts.get(box.harvesterId) || 0) + 1);
  });
  
  console.log(`\n👷 Cortadoras únicas: ${harvesterCounts.size}`);
  
  // Mostrar una muestra de cajas con foto
  const boxesWithPhotos = allBoxes.filter(b => b.photoUrl).slice(0, 3);
  if (boxesWithPhotos.length > 0) {
    console.log('\n📷 Muestra de cajas con foto:');
    boxesWithPhotos.forEach(box => {
      console.log(`   - ${box.boxCode}: ${box.photoUrl?.substring(0, 60)}...`);
    });
  }
}

verifyData();
