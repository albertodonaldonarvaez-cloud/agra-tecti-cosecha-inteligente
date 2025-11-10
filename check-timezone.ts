import { getDb } from './server/db';
import { boxes } from './drizzle/schema';

async function checkTimezone() {
  const db = await getDb();
  if (!db) {
    console.log('❌ Base de datos no disponible');
    return;
  }

  const sample = await db.select().from(boxes).limit(10);
  
  console.log('📅 Muestra de fechas en BD:\n');
  sample.forEach(b => {
    const date = new Date(b.submissionTime);
    console.log(`BoxCode: ${b.boxCode}`);
    console.log(`  submissionTime (raw): ${b.submissionTime}`);
    console.log(`  ISO: ${date.toISOString()}`);
    console.log(`  Local: ${date.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`);
    console.log(`  Fecha local: ${date.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}`);
    console.log('');
  });
}

checkTimezone();
