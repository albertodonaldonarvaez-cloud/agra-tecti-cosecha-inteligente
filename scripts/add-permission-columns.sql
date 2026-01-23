-- Script para agregar nuevos campos de permisos a la tabla users
-- Ejecutar en la base de datos MySQL si los campos no existen

-- Agregar campo canViewClimate si no existe
ALTER TABLE users ADD COLUMN IF NOT EXISTS canViewClimate BOOLEAN NOT NULL DEFAULT TRUE;

-- Agregar campo canViewPerformance si no existe  
ALTER TABLE users ADD COLUMN IF NOT EXISTS canViewPerformance BOOLEAN NOT NULL DEFAULT TRUE;

-- Agregar campo canViewEditor si no existe
ALTER TABLE users ADD COLUMN IF NOT EXISTS canViewEditor BOOLEAN NOT NULL DEFAULT FALSE;

-- Verificar que todos los campos de permisos existen
-- Si alguno falla, ejecutar manualmente:
-- ALTER TABLE users ADD COLUMN canViewClimate BOOLEAN NOT NULL DEFAULT TRUE;
-- ALTER TABLE users ADD COLUMN canViewPerformance BOOLEAN NOT NULL DEFAULT TRUE;
-- ALTER TABLE users ADD COLUMN canViewEditor BOOLEAN NOT NULL DEFAULT FALSE;

-- Mostrar estructura actual de la tabla
DESCRIBE users;
