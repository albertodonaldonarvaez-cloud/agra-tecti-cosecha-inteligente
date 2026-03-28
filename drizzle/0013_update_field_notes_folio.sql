-- Migración: Actualizar Notas de Campo con folio, GPS de resolución, y etapas de fotos
-- Fecha: 2026-03-28

-- 1. Agregar columna folio (se llenará después)
SET @dbname = DATABASE();
SET @tablename = 'fieldNotes';
SET @columnname = 'folio';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE `fieldNotes` ADD COLUMN `folio` VARCHAR(20) NULL AFTER `id`'
));
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Generar folios para registros existentes que no tienen folio
SET @counter = 0;
UPDATE `fieldNotes` SET `folio` = CONCAT('NC-', LPAD(@counter := @counter + 1, 6, '0')) WHERE `folio` IS NULL;

-- 3. Hacer folio NOT NULL y UNIQUE
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'fieldNotes' AND INDEX_NAME = 'fieldNotes_folio_unique') > 0,
  'SELECT 1',
  'ALTER TABLE `fieldNotes` MODIFY COLUMN `folio` VARCHAR(20) NOT NULL, ADD UNIQUE INDEX `fieldNotes_folio_unique` (`folio`)'
));
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. Renombrar title a description si title existe y description no tiene datos
-- (En realidad, quitamos title y hacemos description NOT NULL)
-- Primero copiar title a description donde description esté vacío
UPDATE `fieldNotes` SET `description` = `title` WHERE (`description` IS NULL OR `description` = '') AND `title` IS NOT NULL AND `title` != '';

-- 5. Eliminar columna title si existe
SET @columnname = 'title';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'ALTER TABLE `fieldNotes` DROP COLUMN `title`',
  'SELECT 1'
));
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 6. Hacer description NOT NULL (con default vacío para registros existentes)
UPDATE `fieldNotes` SET `description` = 'Sin descripción' WHERE `description` IS NULL OR `description` = '';
ALTER TABLE `fieldNotes` MODIFY COLUMN `description` TEXT NOT NULL;

-- 7. Agregar columnas GPS de resolución
SET @columnname = 'resolvedLatitude';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE `fieldNotes` ADD COLUMN `resolvedLatitude` DECIMAL(10,7) NULL'
));
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @columnname = 'resolvedLongitude';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE `fieldNotes` ADD COLUMN `resolvedLongitude` DECIMAL(10,7) NULL'
));
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 8. Agregar columna stage a fieldNotePhotos
SET @tablename = 'fieldNotePhotos';
SET @columnname = 'stage';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  "ALTER TABLE `fieldNotePhotos` ADD COLUMN `stage` ENUM('reporte','revision','resolucion') NOT NULL DEFAULT 'reporte'"
));
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 9. Agregar columna uploadedByUserId a fieldNotePhotos
SET @columnname = 'uploadedByUserId';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE `fieldNotePhotos` ADD COLUMN `uploadedByUserId` INT NULL'
));
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
