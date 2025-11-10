import XLSX from 'xlsx';

// Leer el archivo Excel
const workbook = XLSX.readFile('/home/ubuntu/upload/cosecha-sistema-base-de-datos-full.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet);

console.log('📊 Análisis de códigos de caja:');
console.log(`Total de registros: ${data.length}`);

// Contar códigos únicos
const boxCodes = new Set<string>();
const duplicates = new Map<string, number>();

(data as any[]).forEach(row => {
  const boxCode = row['Escanea la caja'];
  if (boxCode && typeof boxCode === 'string') {
    boxCodes.add(boxCode);
    duplicates.set(boxCode, (duplicates.get(boxCode) || 0) + 1);
  }
});

console.log(`\n📦 Códigos de caja únicos: ${boxCodes.size}`);

// Encontrar duplicados
const duplicateBoxes = Array.from(duplicates.entries())
  .filter(([_, count]) => count > 1)
  .sort((a, b) => b[1] - a[1]);

if (duplicateBoxes.length > 0) {
  console.log(`\n⚠️  Códigos duplicados: ${duplicateBoxes.length}`);
  console.log('\nTop 10 códigos más duplicados:');
  duplicateBoxes.slice(0, 10).forEach(([code, count]) => {
    console.log(`   ${code}: ${count} veces`);
  });
  
  // Calcular total de registros duplicados
  const totalDuplicates = duplicateBoxes.reduce((sum, [_, count]) => sum + (count - 1), 0);
  console.log(`\n📊 Total de registros duplicados: ${totalDuplicates}`);
  console.log(`📊 Registros únicos esperados: ${data.length - totalDuplicates}`);
} else {
  console.log('\n✅ No hay códigos duplicados');
}

// Analizar códigos inválidos
const invalidCodes = (data as any[]).filter(row => {
  const boxCode = row['Escanea la caja'];
  if (!boxCode || typeof boxCode !== 'string') return true;
  const parts = boxCode.split('-');
  return parts.length !== 2;
});

if (invalidCodes.length > 0) {
  console.log(`\n⚠️  Códigos inválidos: ${invalidCodes.length}`);
  invalidCodes.slice(0, 5).forEach(row => {
    console.log(`   ${row['Escanea la caja']}`);
  });
}
