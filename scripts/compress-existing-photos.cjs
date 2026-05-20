/**
 * Script para comprimir fotos existentes en el servidor.
 * Redimensiona a max 1920px y comprime a JPEG 80%.
 * NO borra originales — crea versiones comprimidas en el mismo lugar.
 * 
 * Ejecutar dentro del contenedor:
 *   docker compose exec app node scripts/compress-existing-photos.cjs
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PHOTOS_DIR = '/app/photos/field-notes';
const MAX_SIZE = 1920;
const QUALITY = 80;
const MIN_SIZE_TO_COMPRESS = 500 * 1024; // Solo comprimir fotos > 500KB

async function compressPhoto(filePath) {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size < MIN_SIZE_TO_COMPRESS) {
      return { file: filePath, status: 'skipped', reason: 'small', size: stats.size };
    }

    const originalSize = stats.size;
    
    // Crear backup temporal
    const backupPath = filePath + '.bak';
    fs.copyFileSync(filePath, backupPath);
    
    try {
      const compressed = await sharp(backupPath)
        .resize(MAX_SIZE, MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: QUALITY })
        .toBuffer();
      
      fs.writeFileSync(filePath, compressed);
      fs.unlinkSync(backupPath); // Eliminar backup
      
      const newSize = compressed.length;
      const saved = ((1 - newSize / originalSize) * 100).toFixed(1);
      
      return { 
        file: path.basename(filePath), 
        status: 'compressed', 
        originalSize: (originalSize / 1024 / 1024).toFixed(2) + 'MB',
        newSize: (newSize / 1024 / 1024).toFixed(2) + 'MB',
        saved: saved + '%'
      };
    } catch (err) {
      // Restaurar backup si sharp falla
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, filePath);
        fs.unlinkSync(backupPath);
      }
      return { file: path.basename(filePath), status: 'error', error: err.message };
    }
  } catch (err) {
    return { file: path.basename(filePath), status: 'error', error: err.message };
  }
}

async function main() {
  console.log('🖼️  Compresión de fotos existentes');
  console.log('='.repeat(50));
  
  if (!fs.existsSync(PHOTOS_DIR)) {
    console.log('❌ Directorio no encontrado:', PHOTOS_DIR);
    return;
  }

  // Buscar todos los .jpg recursivamente
  const files = [];
  function findJpgs(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findJpgs(fullPath);
      } else if (entry.name.endsWith('.jpg') || entry.name.endsWith('.jpeg')) {
        files.push(fullPath);
      }
    }
  }
  findJpgs(PHOTOS_DIR);

  console.log(`📁 Encontradas ${files.length} fotos`);
  console.log('');

  let compressed = 0, skipped = 0, errors = 0;
  let totalSavedBytes = 0;

  for (let i = 0; i < files.length; i++) {
    const result = await compressPhoto(files[i]);
    
    if (result.status === 'compressed') {
      compressed++;
      console.log(`  ✅ ${result.file}: ${result.originalSize} → ${result.newSize} (${result.saved} ahorrado)`);
    } else if (result.status === 'skipped') {
      skipped++;
    } else {
      errors++;
      console.log(`  ❌ ${result.file}: ${result.error}`);
    }

    // Progreso cada 10 fotos
    if ((i + 1) % 10 === 0) {
      console.log(`  ... ${i + 1}/${files.length} procesadas`);
    }
  }

  console.log('');
  console.log('='.repeat(50));
  console.log(`📊 Resultado:`);
  console.log(`   ✅ Comprimidas: ${compressed}`);
  console.log(`   ⏭️  Omitidas (< 500KB): ${skipped}`);
  console.log(`   ❌ Errores: ${errors}`);
  console.log('='.repeat(50));
}

main().catch(console.error);
