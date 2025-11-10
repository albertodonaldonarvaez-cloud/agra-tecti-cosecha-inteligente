import XLSX from 'xlsx';
import * as fs from 'fs';

// Leer el archivo Excel
const workbook = XLSX.readFile('/home/ubuntu/upload/cosecha-sistema-base-de-datos-full.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Convertir a JSON
const data = XLSX.utils.sheet_to_json(worksheet);

console.log('📊 Análisis del archivo Excel:');
console.log(`Total de registros: ${data.length}`);

if (data.length > 0) {
  const firstRow = data[0] as any;
  console.log('\n📋 Columnas encontradas:');
  Object.keys(firstRow).forEach(key => {
    console.log(`  - ${key}`);
  });
  
  console.log('\n📝 Muestra del primer registro:');
  console.log(JSON.stringify(firstRow, null, 2));
  
  // Analizar registros con fechas vacías
  const emptyDates = data.filter((row: any) => !row._submission_time || row._submission_time === '');
  console.log(`\n⚠️  Registros con fecha vacía: ${emptyDates.length}`);
  
  if (emptyDates.length > 0 && emptyDates.length <= 5) {
    console.log('\nEjemplos de registros con fecha vacía:');
    emptyDates.slice(0, 3).forEach((row: any, index) => {
      console.log(`\n${index + 1}. Caja: ${row.escanea_la_caja || row['escanea la caja']}`);
      console.log(`   Fecha: "${row._submission_time}"`);
    });
  }
}
