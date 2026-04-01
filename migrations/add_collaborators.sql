-- ============================================================
-- Migración: Sistema de Colaboradores de Campo
-- Fecha: 2026-04-01
-- Descripción: Agrega tablas de colaboradores, códigos de vinculación,
--              asignaciones de tareas, y permiso canViewCollaborators
-- 
-- INSTRUCCIONES: Ejecutar dentro del contenedor:
--   docker exec -i agratec-dashboard sh -c "cat /app/migrations/add_collaborators.sql | npx tsx -e \"
--     const {getDb} = require('./server/db');
--     // ...
--   \""
--
-- O directamente en MySQL:
--   docker exec -i <mysql_container> mysql -u<user> -p<pass> <database> < migrations/add_collaborators.sql
-- ============================================================

-- 1. Agregar columna canViewCollaborators a users (si no existe)
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'canViewCollaborators');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `users` ADD COLUMN `canViewCollaborators` tinyint(1) NOT NULL DEFAULT 0',
  'SELECT "canViewCollaborators already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Crear tabla collaborators (si no existe)
CREATE TABLE IF NOT EXISTS `collaborators` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `phone` varchar(32) DEFAULT NULL,
  `role` varchar(128) DEFAULT NULL,
  `telegramChatId` varchar(64) DEFAULT NULL,
  `telegramUsername` varchar(128) DEFAULT NULL,
  `telegramLinkedAt` timestamp NULL DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdByUserId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Crear tabla collaboratorLinkCodes (si no existe)
CREATE TABLE IF NOT EXISTS `collaboratorLinkCodes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `collaboratorId` int NOT NULL,
  `code` varchar(8) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `collaboratorLinkCodes_code_unique` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Crear tabla fieldActivityAssignments (si no existe)
CREATE TABLE IF NOT EXISTS `fieldActivityAssignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `activityId` int NOT NULL,
  `collaboratorId` int NOT NULL,
  `status` enum('pendiente','en_progreso','completada','cancelada') NOT NULL DEFAULT 'pendiente',
  `startedAt` timestamp NULL DEFAULT NULL,
  `completedAt` timestamp NULL DEFAULT NULL,
  `evidencePhotoPath` varchar(512) DEFAULT NULL,
  `evidenceNotes` text DEFAULT NULL,
  `notifiedAt` timestamp NULL DEFAULT NULL,
  `assignedByUserId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Verificación
SELECT 'Migración completada exitosamente' AS resultado;
SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('collaborators', 'collaboratorLinkCodes', 'fieldActivityAssignments');
