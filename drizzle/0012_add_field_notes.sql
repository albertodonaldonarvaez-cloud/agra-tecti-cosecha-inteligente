-- Migración: Notas de Campo
-- Tablas para reportes rápidos de observaciones durante recorridos

CREATE TABLE IF NOT EXISTS `fieldNotes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `category` ENUM('arboles_mal_plantados','plaga_enfermedad','riego_drenaje','dano_mecanico','maleza','fertilizacion','suelo','infraestructura','fauna','otro') NOT NULL,
  `severity` ENUM('baja','media','alta','critica') NOT NULL DEFAULT 'media',
  `status` ENUM('abierta','en_revision','en_progreso','resuelta','descartada') NOT NULL DEFAULT 'abierta',
  `parcelId` INT,
  `latitude` DECIMAL(10,7),
  `longitude` DECIMAL(10,7),
  `reportedByUserId` INT NOT NULL,
  `resolvedByUserId` INT,
  `resolutionNotes` TEXT,
  `resolvedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `fieldNotePhotos` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `fieldNoteId` INT NOT NULL,
  `photoPath` VARCHAR(512) NOT NULL,
  `caption` VARCHAR(255),
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Agregar permiso canViewFieldNotes a la tabla users (si no existe)
SET @colExists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'canViewFieldNotes');
SET @sql = IF(@colExists = 0, 'ALTER TABLE `users` ADD COLUMN `canViewFieldNotes` BOOLEAN NOT NULL DEFAULT TRUE', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
