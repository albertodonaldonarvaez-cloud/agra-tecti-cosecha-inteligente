-- Migración para agregar permisos granulares a la tabla users
-- Ejecutar este script en la base de datos de producción

ALTER TABLE users 
ADD COLUMN canViewDashboard BOOLEAN NOT NULL DEFAULT TRUE AFTER role,
ADD COLUMN canViewBoxes BOOLEAN NOT NULL DEFAULT TRUE AFTER canViewDashboard,
ADD COLUMN canViewAnalytics BOOLEAN NOT NULL DEFAULT TRUE AFTER canViewBoxes,
ADD COLUMN canViewDailyAnalysis BOOLEAN NOT NULL DEFAULT TRUE AFTER canViewAnalytics,
ADD COLUMN canViewParcels BOOLEAN NOT NULL DEFAULT FALSE AFTER canViewDailyAnalysis,
ADD COLUMN canViewHarvesters BOOLEAN NOT NULL DEFAULT FALSE AFTER canViewParcels,
ADD COLUMN canViewErrors BOOLEAN NOT NULL DEFAULT FALSE AFTER canViewHarvesters;

-- Verificar que las columnas se agregaron correctamente
DESCRIBE users;
