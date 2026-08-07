/**
 * Migración automática — se ejecuta en el entrypoint de Docker.
 * Archivo .cjs para forzar CommonJS y evitar el "type":"module" del package.json.
 */
const mysql = require('mysql2/promise');

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('[Migration] No DATABASE_URL, saltando');
    return;
  }

  let conn;
  try {
    conn = await mysql.createConnection(url);

    // Obtener columnas actuales de la tabla users con info de DEFAULT
    const [cols] = await conn.query(
      "SELECT COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE, DATA_TYPE, COLUMN_TYPE, EXTRA FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' ORDER BY ORDINAL_POSITION"
    );
    const existing = new Map();
    for (const c of cols) {
      existing.set(c.COLUMN_NAME, c);
    }

    console.log('[Migration] Columnas actuales en users:', cols.length);

    // Todas las columnas que el schema Drizzle espera con sus definiciones MySQL
    const expectedColumns = [
      { col: 'id', sql: null }, // auto_increment, siempre existe
      { col: 'email', sql: null },
      { col: 'password', sql: null },
      { col: 'name', sql: null },
      { col: 'role', sql: null },
      { col: 'canViewDashboard', sql: "ALTER TABLE users ADD COLUMN canViewDashboard BOOLEAN NOT NULL DEFAULT TRUE" },
      { col: 'canViewBoxes', sql: "ALTER TABLE users ADD COLUMN canViewBoxes BOOLEAN NOT NULL DEFAULT TRUE" },
      { col: 'canViewAnalytics', sql: "ALTER TABLE users ADD COLUMN canViewAnalytics BOOLEAN NOT NULL DEFAULT TRUE" },
      { col: 'canViewDailyAnalysis', sql: "ALTER TABLE users ADD COLUMN canViewDailyAnalysis BOOLEAN NOT NULL DEFAULT TRUE" },
      { col: 'canViewClimate', sql: "ALTER TABLE users ADD COLUMN canViewClimate BOOLEAN NOT NULL DEFAULT TRUE" },
      { col: 'canViewPerformance', sql: "ALTER TABLE users ADD COLUMN canViewPerformance BOOLEAN NOT NULL DEFAULT TRUE" },
      { col: 'canViewParcelAnalysis', sql: "ALTER TABLE users ADD COLUMN canViewParcelAnalysis BOOLEAN NOT NULL DEFAULT TRUE" },
      { col: 'canViewParcels', sql: "ALTER TABLE users ADD COLUMN canViewParcels BOOLEAN NOT NULL DEFAULT FALSE" },
      { col: 'canViewHarvesters', sql: "ALTER TABLE users ADD COLUMN canViewHarvesters BOOLEAN NOT NULL DEFAULT FALSE" },
      { col: 'canViewEditor', sql: "ALTER TABLE users ADD COLUMN canViewEditor BOOLEAN NOT NULL DEFAULT FALSE" },
      { col: 'canViewErrors', sql: "ALTER TABLE users ADD COLUMN canViewErrors BOOLEAN NOT NULL DEFAULT FALSE" },
      { col: 'canViewCrops', sql: "ALTER TABLE users ADD COLUMN canViewCrops BOOLEAN NOT NULL DEFAULT FALSE" },
      { col: 'canViewFieldNotes', sql: "ALTER TABLE users ADD COLUMN canViewFieldNotes BOOLEAN NOT NULL DEFAULT TRUE" },
      { col: 'canViewFieldNotebook', sql: "ALTER TABLE users ADD COLUMN canViewFieldNotebook BOOLEAN NOT NULL DEFAULT TRUE" },
      { col: 'canViewWarehouse', sql: "ALTER TABLE users ADD COLUMN canViewWarehouse BOOLEAN NOT NULL DEFAULT TRUE" },
      { col: 'canViewCollaborators', sql: "ALTER TABLE users ADD COLUMN canViewCollaborators BOOLEAN NOT NULL DEFAULT FALSE" },
      { col: 'canViewLabels', sql: "ALTER TABLE users ADD COLUMN canViewLabels BOOLEAN NOT NULL DEFAULT FALSE" },
      { col: 'canViewCycles', sql: "ALTER TABLE users ADD COLUMN canViewCycles BOOLEAN NOT NULL DEFAULT TRUE" },
      { col: 'canViewReports', sql: "ALTER TABLE users ADD COLUMN canViewReports BOOLEAN NOT NULL DEFAULT TRUE" },
      { col: 'avatarColor', sql: "ALTER TABLE users ADD COLUMN avatarColor VARCHAR(32) DEFAULT '#16a34a'" },
      { col: 'avatarEmoji', sql: "ALTER TABLE users ADD COLUMN avatarEmoji VARCHAR(16) DEFAULT '🌿'" },
      { col: 'bio', sql: "ALTER TABLE users ADD COLUMN bio VARCHAR(255) DEFAULT NULL" },
      { col: 'phone', sql: "ALTER TABLE users ADD COLUMN phone VARCHAR(32) DEFAULT NULL" },
      { col: 'telegramChatId', sql: "ALTER TABLE users ADD COLUMN telegramChatId VARCHAR(64) DEFAULT NULL" },
      { col: 'telegramUsername', sql: "ALTER TABLE users ADD COLUMN telegramUsername VARCHAR(128) DEFAULT NULL" },
      { col: 'telegramLinkedAt', sql: "ALTER TABLE users ADD COLUMN telegramLinkedAt TIMESTAMP NULL DEFAULT NULL" },
      { col: 'createdAt', sql: "ALTER TABLE users ADD COLUMN createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" },
      { col: 'updatedAt', sql: "ALTER TABLE users ADD COLUMN updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" },
      { col: 'lastSignedIn', sql: "ALTER TABLE users ADD COLUMN lastSignedIn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" },
    ];

    let added = 0;
    let fixed = 0;

    for (const m of expectedColumns) {
      if (!m.sql) continue; // skip core columns

      if (!existing.has(m.col)) {
        // Column doesn't exist - add it
        await conn.query(m.sql);
        console.log('[Migration] + ADDED ' + m.col);
        added++;
      } else {
        // Column exists - check if it has a proper DEFAULT for NOT NULL columns
        const info = existing.get(m.col);
        if (info.IS_NULLABLE === 'NO' && info.COLUMN_DEFAULT === null && info.EXTRA !== 'auto_increment') {
          // NOT NULL column without DEFAULT — this causes the INSERT error!
          console.log('[Migration] ! FIXING ' + m.col + ' (NOT NULL without DEFAULT)');
          // Determine the default based on the column type
          let defaultVal = 'TRUE';
          if (m.col.startsWith('canView')) {
            defaultVal = m.sql.includes('DEFAULT FALSE') ? 'FALSE' : 'TRUE';
            await conn.query(`ALTER TABLE users MODIFY COLUMN ${m.col} BOOLEAN NOT NULL DEFAULT ${defaultVal}`);
          } else if (info.DATA_TYPE === 'timestamp') {
            await conn.query(`ALTER TABLE users MODIFY COLUMN ${m.col} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`);
          }
          fixed++;
        }
      }
    }

    if (added === 0 && fixed === 0) {
      console.log('[Migration] Schema ya esta sincronizado');
    } else {
      console.log('[Migration] ' + added + ' columna(s) agregada(s), ' + fixed + ' columna(s) corregida(s)');
    }

    // Print summary of columns without defaults for debugging
    const problematic = cols.filter(c => c.IS_NULLABLE === 'NO' && c.COLUMN_DEFAULT === null && c.EXTRA !== 'auto_increment');
    if (problematic.length > 0) {
      console.log('[Migration] WARN: Columnas NOT NULL sin DEFAULT:');
      for (const c of problematic) {
        console.log('  - ' + c.COLUMN_NAME + ' (' + c.COLUMN_TYPE + ')');
      }
    }

    // ── Ciclos de producción (0019) ──────────────────────────────
    // Tabla nueva: idempotente por IF NOT EXISTS
    await conn.query(`CREATE TABLE IF NOT EXISTS productionCycles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      startDate DATE NOT NULL,
      harvestStartDate DATE NULL,
      harvestEndDate DATE NULL,
      endDate DATE NULL,
      notes TEXT NULL,
      createdByUserId INT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
    console.log('[Migration] productionCycles OK');

    // fieldActivities.clientUuid — idempotencia del sync móvil
    const [faCols] = await conn.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fieldActivities' AND COLUMN_NAME = 'clientUuid'"
    );
    if (faCols.length === 0) {
      await conn.query("ALTER TABLE fieldActivities ADD COLUMN clientUuid VARCHAR(64) NULL");
      console.log('[Migration] + ADDED fieldActivities.clientUuid');
    }
    const [faIdx] = await conn.query(
      "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fieldActivities' AND INDEX_NAME = 'fieldActivities_clientUuid_unique'"
    );
    if (faIdx.length === 0) {
      await conn.query("ALTER TABLE fieldActivities ADD UNIQUE INDEX fieldActivities_clientUuid_unique (clientUuid)");
      console.log('[Migration] + ADDED unique index fieldActivities.clientUuid');
    }

    // ── Jornadas, fotos móviles, colaboradores móviles, resumen semanal, APK (0020) ──
    const ensureColumn = async (table, col, ddl) => {
      const [rows] = await conn.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
        [table, col]
      );
      if (rows.length === 0) {
        await conn.query(ddl);
        console.log(`[Migration] + ADDED ${table}.${col}`);
      }
    };
    const ensureIndex = async (table, indexName, ddl) => {
      const [rows] = await conn.query(
        "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
        [table, indexName]
      );
      if (rows.length === 0) {
        await conn.query(ddl);
        console.log(`[Migration] + ADDED index ${table}.${indexName}`);
      }
    };

    await conn.query(`CREATE TABLE IF NOT EXISTS fieldActivityWorkSessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      activityId INT NOT NULL,
      workDate DATE NOT NULL,
      startTime VARCHAR(8) NULL,
      endTime VARCHAR(8) NULL,
      notes VARCHAR(512) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ws_activity (activityId)
    )`);
    console.log('[Migration] fieldActivityWorkSessions OK');

    await conn.query(`CREATE TABLE IF NOT EXISTS weeklySummaries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      weekStart DATE NOT NULL,
      weekEnd DATE NOT NULL,
      content TEXT NOT NULL,
      model VARCHAR(64) NULL,
      cycleId INT NULL,
      cyclePhase VARCHAR(64) NULL,
      statsJson TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('[Migration] weeklySummaries OK');

    await conn.query(`CREATE TABLE IF NOT EXISTS appReleases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      versionCode INT NOT NULL,
      versionName VARCHAR(32) NOT NULL,
      fileName VARCHAR(255) NOT NULL,
      filePath VARCHAR(512) NOT NULL,
      fileSize INT NULL,
      notes TEXT NULL,
      uploadedByUserId INT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('[Migration] appReleases OK');

    await ensureIndex('weeklySummaries', 'weeklySummaries_weekStart_unique',
      "ALTER TABLE weeklySummaries ADD UNIQUE INDEX weeklySummaries_weekStart_unique (weekStart)");
    await ensureColumn('fieldActivityPhotos', 'localPhotoId',
      "ALTER TABLE fieldActivityPhotos ADD COLUMN localPhotoId VARCHAR(64) NULL");
    await ensureColumn('collaborators', 'clientUuid',
      "ALTER TABLE collaborators ADD COLUMN clientUuid VARCHAR(64) NULL");
    await ensureIndex('collaborators', 'collaborators_clientUuid_unique',
      "ALTER TABLE collaborators ADD UNIQUE INDEX collaborators_clientUuid_unique (clientUuid)");
  } catch (err) {
    console.error('[Migration] Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

migrate();
