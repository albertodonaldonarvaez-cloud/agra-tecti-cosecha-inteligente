-- =============================================
-- 0017: Agregar columnas faltantes a tabla users
-- =============================================
-- Estas columnas están definidas en el schema de Drizzle pero
-- nunca se creó una migración para agregarlas a la DB.
-- Usar ALTER TABLE ... IF NOT EXISTS para evitar errores si ya existen.

ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `canViewParcelAnalysis` BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `canViewCollaborators` BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `avatarColor` VARCHAR(32) DEFAULT '#16a34a';
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `avatarEmoji` VARCHAR(16) DEFAULT '🌿';
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `bio` VARCHAR(255) DEFAULT NULL;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `phone` VARCHAR(32) DEFAULT NULL;
