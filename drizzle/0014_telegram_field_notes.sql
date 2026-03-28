-- ============================================================
-- Migración 0014: Telegram + Notas de Campo
-- Agrega campos de vinculación de Telegram a usuarios
-- Agrega tabla de códigos de vinculación temporales
-- ============================================================

-- Agregar campos de Telegram a la tabla users
SET @dbname = DATABASE();

-- telegramChatId
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'users' AND COLUMN_NAME = 'telegramChatId');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN telegramChatId VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- telegramUsername
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'users' AND COLUMN_NAME = 'telegramUsername');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN telegramUsername VARCHAR(128) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- telegramLinkedAt
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'users' AND COLUMN_NAME = 'telegramLinkedAt');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN telegramLinkedAt TIMESTAMP NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Tabla de códigos de vinculación temporales
CREATE TABLE IF NOT EXISTS telegramLinkCodes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  code VARCHAR(8) NOT NULL UNIQUE,
  expiresAt TIMESTAMP NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índice para buscar códigos rápidamente
CREATE INDEX IF NOT EXISTS idx_link_code ON telegramLinkCodes(code);
CREATE INDEX IF NOT EXISTS idx_link_expires ON telegramLinkCodes(expiresAt);
