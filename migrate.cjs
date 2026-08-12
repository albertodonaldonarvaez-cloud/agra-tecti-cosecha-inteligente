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

    // ── Personal de campo y almacén desde la app (0021) ──────────
    // Catálogo de puestos: la app lo consume y crece solo cuando alguien
    // captura un puesto nuevo con la opción "Otro"
    await conn.query(`CREATE TABLE IF NOT EXISTS collaboratorRoles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      isActive BOOLEAN NOT NULL DEFAULT TRUE,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY collaboratorRoles_name_unique (name)
    )`);
    console.log('[Migration] collaboratorRoles OK');

    // Siembra de los puestos habituales (INSERT IGNORE = idempotente)
    const DEFAULT_ROLES = [
      'Jornalero', 'Encargado de riego', 'Podador', 'Cosechador',
      'Aplicador de agroquímicos', 'Tractorista', 'Supervisor de campo',
      'Ingeniero agrónomo', 'Almacenista', 'Chofer',
    ];
    for (const role of DEFAULT_ROLES) {
      await conn.query('INSERT IGNORE INTO collaboratorRoles (name) VALUES (?)', [role]);
    }
    // Adoptar los puestos que ya se usaban en colaboradores existentes.
    // Va aparte: en una base recién creada la tabla puede no existir todavía y
    // no debe impedir el resto de la migración.
    try {
      await conn.query(
        "INSERT IGNORE INTO collaboratorRoles (name) SELECT DISTINCT TRIM(role) FROM collaborators WHERE role IS NOT NULL AND TRIM(role) <> ''"
      );
    } catch (e) {
      console.log('[Migration] Puestos existentes no adoptados:', e.message);
    }

    // Productos del almacén dados de alta desde la app (idempotencia por UUID)
    await ensureColumn('warehouseProducts', 'clientUuid',
      "ALTER TABLE warehouseProducts ADD COLUMN clientUuid VARCHAR(64) NULL");
    await ensureIndex('warehouseProducts', 'warehouseProducts_clientUuid_unique',
      "ALTER TABLE warehouseProducts ADD UNIQUE INDEX warehouseProducts_clientUuid_unique (clientUuid)");

    // Consumo de productos en actividades: producto del catálogo + cantidad planeada
    await ensureColumn('fieldActivityProducts', 'productId',
      "ALTER TABLE fieldActivityProducts ADD COLUMN productId INT NULL");
    await ensureColumn('fieldActivityProducts', 'plannedQuantity',
      "ALTER TABLE fieldActivityProducts ADD COLUMN plannedQuantity VARCHAR(32) NULL");

    // Unidades de medida nuevas (onzas, libras, galones). Solo se AGREGAN
    // valores al ENUM: los existentes no se tocan, así ninguna fila se invalida.
    const ensureEnumValue = async (table, col, sampleValue, ddl) => {
      const [rows] = await conn.query(
        "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
        [table, col]
      );
      if (rows.length === 0) return; // la tabla/columna no existe todavía
      if (!String(rows[0].COLUMN_TYPE).includes(`'${sampleValue}'`)) {
        await conn.query(ddl);
        console.log(`[Migration] ~ ENUM ampliado ${table}.${col}`);
      }
    };
    // Las nuevas van al FINAL: MySQL guarda los ENUM por índice y así ningún
    // valor ya almacenado cambia de significado.
    // ── Fecha real de la pasada satelital (0022) ──────────────
    // mapDate es la clave del cache ('latest'); captureDate es cuándo pasó de
    // verdad el satélite, que es lo que se le muestra al productor.
    await ensureColumn('parcelSatelliteCache', 'captureDate',
      "ALTER TABLE parcelSatelliteCache ADD COLUMN captureDate VARCHAR(32) NULL");
    await ensureColumn('parcelSatelliteCache', 'clearPct',
      "ALTER TABLE parcelSatelliteCache ADD COLUMN clearPct INT NULL");
    // Ciclo al que pertenece la captura: saber si el dato es del ciclo en curso
    await ensureColumn('parcelSatelliteCache', 'cycleId',
      "ALTER TABLE parcelSatelliteCache ADD COLUMN cycleId INT NULL");

    // ── Historial satelital y trazabilidad del análisis con IA (0023) ──
    // Una fila por captura: permite ver la evolución del vigor en el ciclo
    await conn.query(`CREATE TABLE IF NOT EXISTS parcelSatelliteHistory (
      id INT AUTO_INCREMENT PRIMARY KEY,
      parcelId INT NOT NULL,
      captureDate VARCHAR(32) NOT NULL,
      cycleId INT NULL,
      clearPct INT NULL,
      ndviMean DECIMAL(5,3) NULL,
      ndviMin DECIMAL(5,3) NULL,
      ndviMax DECIMAL(5,3) NULL,
      distributionJson TEXT NULL,
      zonesJson TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY parcelSatelliteHistory_capture_unique (parcelId, captureDate),
      INDEX idx_history_parcel (parcelId)
    )`);
    console.log('[Migration] parcelSatelliteHistory OK');

    // De qué datos salió cada análisis: para regenerarlo solo si hay algo nuevo
    await ensureColumn('parcelAiAnalysis', 'cycleId',
      "ALTER TABLE parcelAiAnalysis ADD COLUMN cycleId INT NULL");
    await ensureColumn('parcelAiAnalysis', 'lastCaptureDate',
      "ALTER TABLE parcelAiAnalysis ADD COLUMN lastCaptureDate VARCHAR(32) NULL");
    await ensureColumn('parcelAiAnalysis', 'lastNotebookStamp',
      "ALTER TABLE parcelAiAnalysis ADD COLUMN lastNotebookStamp VARCHAR(32) NULL");
    // Sin índice único, cada sync insertaba una fila más y la tabla crecía sin
    // control (son imágenes en base64). El índice permite que el upsert que ya
    // usaba el código funcione de verdad.
    try {
      const [dupes] = await conn.query(
        `SELECT parcelId, dataType, indexType, mapDate, COUNT(*) n
           FROM parcelSatelliteCache
          GROUP BY parcelId, dataType, indexType, mapDate HAVING n > 1`
      );
      if (dupes.length > 0) {
        // Conservar solo la fila más reciente de cada combinación
        await conn.query(
          `DELETE c FROM parcelSatelliteCache c
             JOIN (SELECT MAX(id) keepId, parcelId, dataType, indexType, mapDate
                     FROM parcelSatelliteCache
                    GROUP BY parcelId, dataType, indexType, mapDate) k
               ON c.parcelId = k.parcelId AND c.dataType = k.dataType
              AND c.indexType = k.indexType
              AND (c.mapDate <=> k.mapDate)
            WHERE c.id <> k.keepId`
        );
        console.log(`[Migration] parcelSatelliteCache: ${dupes.length} grupo(s) duplicado(s) depurado(s)`);
      }
      await ensureIndex('parcelSatelliteCache', 'parcelSatelliteCache_slot_unique',
        "ALTER TABLE parcelSatelliteCache ADD UNIQUE INDEX parcelSatelliteCache_slot_unique (parcelId, dataType, indexType, mapDate)");
    } catch (e) {
      console.log('[Migration] parcelSatelliteCache sin deduplicar:', e.message);
    }

    const UNITS_SQL = "'kg','g','lt','ml','ton','bulto','saco','unidad','otro','oz','lb','gal'";
    await ensureEnumValue('warehouseProducts', 'unit', 'oz',
      `ALTER TABLE warehouseProducts MODIFY COLUMN unit ENUM(${UNITS_SQL}) NOT NULL DEFAULT 'kg'`);
    await ensureEnumValue('fieldActivityProducts', 'unit', 'oz',
      `ALTER TABLE fieldActivityProducts MODIFY COLUMN unit ENUM(${UNITS_SQL}) NULL DEFAULT 'kg'`);

    // ── Bitácora de la app de campo (0023) ────────────────────
    // La app registra en el teléfono lo que va pasando (entradas, fotos,
    // altas, sincronizaciones) y lo sube por lotes. Todo cae en la misma
    // tabla que ya usa la web; 'source' distingue de dónde vino.
    // Las acciones nuevas van al FINAL del ENUM: MySQL los guarda por índice.
    const ACTIONS_SQL = [
      'login', 'logout', 'page_view', 'page_leave',
      'login_failed', 'app_open', 'app_close', 'screen_view',
      'photo_capture', 'photo_upload',
      'note_create', 'note_status', 'activity_create',
      'person_create', 'product_create', 'product_update',
      'sync', 'error',
    ].map((a) => `'${a}'`).join(',');
    await ensureEnumValue('userActivityLogs', 'action', 'app_open',
      `ALTER TABLE userActivityLogs MODIFY COLUMN action ENUM(${ACTIONS_SQL}) NOT NULL`);
    await ensureColumn('userActivityLogs', 'source',
      "ALTER TABLE userActivityLogs ADD COLUMN source ENUM('web','app') NOT NULL DEFAULT 'web'");
    await ensureColumn('userActivityLogs', 'clientLogId',
      "ALTER TABLE userActivityLogs ADD COLUMN clientLogId VARCHAR(64) NULL");
    await ensureColumn('userActivityLogs', 'device',
      "ALTER TABLE userActivityLogs ADD COLUMN device VARCHAR(160) NULL");
    await ensureColumn('userActivityLogs', 'appVersion',
      "ALTER TABLE userActivityLogs ADD COLUMN appVersion VARCHAR(32) NULL");
    await ensureColumn('userActivityLogs', 'detail',
      "ALTER TABLE userActivityLogs ADD COLUMN detail VARCHAR(500) NULL");
    await ensureColumn('userActivityLogs', 'originalBytes',
      "ALTER TABLE userActivityLogs ADD COLUMN originalBytes INT NULL");
    await ensureColumn('userActivityLogs', 'finalBytes',
      "ALTER TABLE userActivityLogs ADD COLUMN finalBytes INT NULL");
    await ensureColumn('userActivityLogs', 'occurredAt',
      "ALTER TABLE userActivityLogs ADD COLUMN occurredAt TIMESTAMP NULL");
    // Sin este índice, reintentar un lote duplicaría los eventos
    await ensureIndex('userActivityLogs', 'userActivityLogs_clientLogId_unique',
      "ALTER TABLE userActivityLogs ADD UNIQUE INDEX userActivityLogs_clientLogId_unique (clientLogId)");
    await ensureIndex('userActivityLogs', 'idx_activity_source_date',
      "ALTER TABLE userActivityLogs ADD INDEX idx_activity_source_date (source, createdAt)");
  } catch (err) {
    console.error('[Migration] Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

migrate();
