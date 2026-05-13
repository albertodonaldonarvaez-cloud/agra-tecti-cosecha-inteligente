#!/bin/sh
# Entrypoint: migraciones automáticas + inicio de la aplicación

# Crear subdirectorios necesarios si no existen
mkdir -p /app/photos/field-notes /app/photos/warehouse/products /app/photos/sync-uploads /tmp/uploads

# Ejecutar migraciones pendientes via Node.js + mysql2
echo "[Entrypoint] Ejecutando migraciones de base de datos..."
node -e "
const mysql = require('mysql2/promise');

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.log('[Migration] No DATABASE_URL, saltando'); return; }
  
  let conn;
  try {
    conn = await mysql.createConnection(url);
    
    // Obtener columnas actuales de users
    const [cols] = await conn.query(
      \"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'\"
    );
    const existing = new Set(cols.map(c => c.COLUMN_NAME));
    
    const migrations = [
      { col: 'canViewParcelAnalysis', sql: 'ALTER TABLE users ADD COLUMN canViewParcelAnalysis BOOLEAN NOT NULL DEFAULT TRUE' },
      { col: 'canViewCollaborators', sql: 'ALTER TABLE users ADD COLUMN canViewCollaborators BOOLEAN NOT NULL DEFAULT FALSE' },
      { col: 'avatarColor', sql: \"ALTER TABLE users ADD COLUMN avatarColor VARCHAR(32) DEFAULT '#16a34a'\" },
      { col: 'avatarEmoji', sql: \"ALTER TABLE users ADD COLUMN avatarEmoji VARCHAR(16) DEFAULT '🌿'\" },
      { col: 'bio', sql: 'ALTER TABLE users ADD COLUMN bio VARCHAR(255) DEFAULT NULL' },
      { col: 'phone', sql: 'ALTER TABLE users ADD COLUMN phone VARCHAR(32) DEFAULT NULL' },
    ];
    
    let applied = 0;
    for (const m of migrations) {
      if (!existing.has(m.col)) {
        await conn.query(m.sql);
        console.log('[Migration] + ' + m.col);
        applied++;
      }
    }
    
    if (applied === 0) {
      console.log('[Migration] Schema ya está sincronizado');
    } else {
      console.log('[Migration] ' + applied + ' columna(s) agregada(s)');
    }
  } catch (err) {
    console.error('[Migration] Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}
migrate();
" 2>&1

# Iniciar la aplicación
exec pnpm start
