import fs from 'fs';
import path from 'path';
import { processKoboData } from './server/koboSync';

async function loadData() {
  try {
    // Leer el archivo JSON
    const jsonPath = path.join(process.cwd(), 'output.json');
    const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
    let rawData = JSON.parse(jsonContent);
    
    // El archivo puede ser un array con un objeto dentro
    if (Array.isArray(rawData) && rawData.length > 0) {
      rawData = rawData[0];
    }
    
    const jsonData = rawData;
    
    console.log('📦 Datos cargados del archivo JSON');
    console.log(`📊 Total de registros: ${jsonData.results?.length || 0}`);
    
    if (!jsonData.results || jsonData.results.length === 0) {
      console.log('⚠️  No hay resultados en el archivo JSON');
      console.log('Estructura del archivo:', JSON.stringify(Object.keys(jsonData), null, 2));
      return;
    }
    
    console.log('🔄 Procesando datos...');
    const result = await processKoboData(jsonData);
    
    console.log('\n✅ Datos cargados exitosamente');
    console.log(`📦 Cajas procesadas: ${result.boxesProcessed}`);
    console.log(`🆕 Cajas nuevas: ${result.newBoxes}`);
    console.log(`🔄 Cajas actualizadas: ${result.updatedBoxes}`);
    console.log(`📍 Parcelas procesadas: ${result.parcelsProcessed}`);
    console.log(`👷 Cortadoras procesadas: ${result.harvestersProcessed}`);
    
    if (result.errors && result.errors.length > 0) {
      console.log(`\n⚠️  Errores encontrados: ${result.errors.length}`);
      result.errors.slice(0, 10).forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
      if (result.errors.length > 10) {
        console.log(`   ... y ${result.errors.length - 10} errores más`);
      }
    }
    
    console.log('\n✨ Proceso completado');
  } catch (error) {
    console.error('❌ Error al cargar datos:', error);
    process.exit(1);
  }
}

loadData();
