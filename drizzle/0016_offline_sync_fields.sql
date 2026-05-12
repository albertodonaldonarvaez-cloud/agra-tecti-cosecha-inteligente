-- Offline Sync: Ampliar folio para UUIDs desde app móvil
ALTER TABLE `fieldNotes` MODIFY COLUMN `folio` VARCHAR(64) NOT NULL;

-- Agregar campo syncSource para rastrear origen de la nota
ALTER TABLE `fieldNotes` ADD COLUMN `syncSource` ENUM('web', 'telegram', 'mobile') NOT NULL DEFAULT 'web';

-- Agregar localPhotoId para idempotencia de fotos desde app móvil
ALTER TABLE `fieldNotePhotos` ADD COLUMN `localPhotoId` VARCHAR(64) DEFAULT NULL;

-- Índice único para evitar fotos duplicadas desde la app
ALTER TABLE `fieldNotePhotos` ADD UNIQUE INDEX `idx_localPhotoId` (`localPhotoId`);
