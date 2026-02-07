-- Agregar columnas de Telegram a la tabla apiConfig
ALTER TABLE apiConfig ADD COLUMN telegramBotToken VARCHAR(512) NULL;
ALTER TABLE apiConfig ADD COLUMN telegramChatId VARCHAR(128) NULL;
