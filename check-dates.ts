import { getDb } from './server/db';
import { boxes } from './drizzle/schema';

async function checkDates() {
  const db = await getDb();
  if (!db) {
    console.log('❌ Base de datos no disponible');
    return;
  }

  const allBoxes = await db.select().from(boxes);
  
  // Agrupar por fecha
  const dateGroups = new Map<string, number>();
  
  allBoxes.forEach(box => {
    const date = new Date(box.submissionTime);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    dateGroups.set(dateStr, (dateGroups.get(dateStr) || 0) + 1);
  });
  
  // Ordenar fechas
  const sortedDates = Array.from(dateGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  
  console.log('📅 Fechas en la base de datos:\n');
  sortedDates.forEach(([date, count]) => {
    console.log(`${date}: ${count} cajas`);
  });
  
  console.log(`\n📊 Total de días con datos: ${sortedDates.length}`);
  console.log(`📦 Total de cajas: ${allBoxes.length}`);
}

checkDates();
