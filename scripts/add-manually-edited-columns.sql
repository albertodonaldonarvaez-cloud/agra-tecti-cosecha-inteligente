-- Script para agregar campos de protección de edición manual a la tabla boxes
-- Ejecutar en producción: docker exec -i agratec-db mysql -uroot -pPuah4ER57qbTWUbQK2u3 agratec < scripts/add-manually-edited-columns.sql

-- Campo que indica si la caja fue editada manualmente (protege de re-sincronización)
ALTER TABLE boxes ADD COLUMN manuallyEdited BOOLEAN NOT NULL DEFAULT FALSE;

-- Fecha de la última edición manual
ALTER TABLE boxes ADD COLUMN editedAt TIMESTAMP NULL;

-- Código original de la caja antes de ser editada (para rastreo)
ALTER TABLE boxes ADD COLUMN originalBoxCode VARCHAR(64) NULL;
