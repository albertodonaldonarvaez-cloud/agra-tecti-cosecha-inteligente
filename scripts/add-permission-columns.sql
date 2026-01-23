-- Script para agregar nuevos campos de permisos a la tabla users
-- Compatible con MySQL 8.0

-- Usar procedimiento para verificar si la columna existe antes de agregarla

DELIMITER //

DROP PROCEDURE IF EXISTS AddColumnIfNotExists//

CREATE PROCEDURE AddColumnIfNotExists()
BEGIN
    -- Agregar canViewClimate si no existe
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'canViewClimate'
    ) THEN
        ALTER TABLE users ADD COLUMN canViewClimate BOOLEAN NOT NULL DEFAULT TRUE;
        SELECT 'Columna canViewClimate agregada' AS resultado;
    ELSE
        SELECT 'Columna canViewClimate ya existe' AS resultado;
    END IF;

    -- Agregar canViewPerformance si no existe
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'canViewPerformance'
    ) THEN
        ALTER TABLE users ADD COLUMN canViewPerformance BOOLEAN NOT NULL DEFAULT TRUE;
        SELECT 'Columna canViewPerformance agregada' AS resultado;
    ELSE
        SELECT 'Columna canViewPerformance ya existe' AS resultado;
    END IF;

    -- Agregar canViewEditor si no existe
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'canViewEditor'
    ) THEN
        ALTER TABLE users ADD COLUMN canViewEditor BOOLEAN NOT NULL DEFAULT FALSE;
        SELECT 'Columna canViewEditor agregada' AS resultado;
    ELSE
        SELECT 'Columna canViewEditor ya existe' AS resultado;
    END IF;
END//

DELIMITER ;

-- Ejecutar el procedimiento
CALL AddColumnIfNotExists();

-- Limpiar
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;

-- Mostrar estructura actual
DESCRIBE users;
