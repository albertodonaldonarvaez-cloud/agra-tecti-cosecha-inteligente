import { getDb } from './server/db';
import { boxes } from './drizzle/schema';

async function clearDatabase() {
  const db = await getDb();
  if (!db) {
    console.log('❌ Base de datos no disponible');
    return;
  }

  await db.delete(boxes);
  console.log('✅ Base de datos limpiada - todas las cajas eliminadas');
}

clearDatabase();
