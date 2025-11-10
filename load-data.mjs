import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Leer el archivo JSON
const jsonPath = join(__dirname, 'output.json');
const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

console.log('📦 Datos cargados del archivo JSON');
console.log(`📊 Total de registros: ${jsonData.results?.length || 0}`);

// Importar la función de procesamiento
const { processKoboData } = await import('./server/koboSync.js');

try {
  console.log('🔄 Procesando datos...');
  const result = await processKoboData(jsonData);
  
  console.log('✅ Datos cargados exitosamente');
  console.log(`📦 Cajas procesadas: ${result.boxesProcessed}`);
  console.log(`🆕 Cajas nuevas: ${result.newBoxes}`);
  console.log(`🔄 Cajas actualizadas: ${result.updatedBoxes}`);
  console.log(`📍 Parcelas procesadas: ${result.parcelsProcessed}`);
  console.log(`👷 Cortadoras procesadas: ${result.harvestersProcessed}`);
  
  if (result.errors && result.errors.length > 0) {
    console.log(`⚠️  Errores: ${result.errors.length}`);
    result.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
  }
} catch (error) {
  console.error('❌ Error al cargar datos:', error);
  process.exit(1);
}
