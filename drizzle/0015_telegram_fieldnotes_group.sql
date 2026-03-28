-- Agregar columnas de configuración de grupo de notas de campo a apiConfig
SET @dbname = DATABASE();

-- telegramFieldNotesChatId
SET @q = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'apiConfig' AND COLUMN_NAME = 'telegramFieldNotesChatId') = 0,
  'ALTER TABLE apiConfig ADD COLUMN telegramFieldNotesChatId VARCHAR(100) DEFAULT NULL',
  'SELECT 1'
));
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- telegramFieldNotesEnabled
SET @q = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'apiConfig' AND COLUMN_NAME = 'telegramFieldNotesEnabled') = 0,
  'ALTER TABLE apiConfig ADD COLUMN telegramFieldNotesEnabled BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT 1'
));
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
