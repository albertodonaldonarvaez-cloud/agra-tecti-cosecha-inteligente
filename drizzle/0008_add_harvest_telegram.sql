-- Agregar campos para notificación de resumen de cosecha por Telegram
-- Segundo Chat ID independiente + hora/minuto configurable
ALTER TABLE apiConfig ADD COLUMN telegramHarvestChatId VARCHAR(128) DEFAULT NULL;
ALTER TABLE apiConfig ADD COLUMN telegramHarvestHour INT DEFAULT 7;
ALTER TABLE apiConfig ADD COLUMN telegramHarvestMinute INT DEFAULT 0;
ALTER TABLE apiConfig ADD COLUMN telegramHarvestEnabled TINYINT(1) DEFAULT 0;
