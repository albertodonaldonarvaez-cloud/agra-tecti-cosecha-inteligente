-- Script para agregar columnas de archivado a la tabla boxes
-- Ejecutar: docker exec -i agratec-db mysql -u root -pPuah4ER57qbTWUbQK2u3 agratec < scripts/add-archived-column.sql

-- Agregar columna archived (boolean con default false)
ALTER TABLE boxes ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;

-- Agregar columna archivedAt (timestamp nullable)
ALTER TABLE boxes ADD COLUMN archivedAt TIMESTAMP NULL;

-- Agregar índice para filtrar cajas no archivadas rápidamente
CREATE INDEX idx_boxes_archived ON boxes(archived);

-- Verificar que se agregaron correctamente
DESCRIBE boxes;
