-- Migración: Ciclos de producción + sync móvil de libreta de campo
-- Fecha: 2026-08-06
-- Descripción:
--   1. Tabla productionCycles: cada ciclo de higo inicia con la poda/dormancia
--      (startDate) y registra fin de cosecha (harvestEndDate) y fin de ciclo (endDate).
--   2. fieldActivities.clientUuid: clave de idempotencia para el sync offline
--      de la app móvil (evita duplicados en reintentos).
--   3. users.canViewCycles / canViewReports: permisos de las páginas Ciclos y Reportes.
--
-- NOTA: migrate.cjs (entrypoint de Docker) aplica estos mismos cambios de forma
-- idempotente al arrancar. Este archivo existe para aplicación manual si se prefiere:
--   mysql -u usuario -p base_de_datos < drizzle/0019_add_production_cycles.sql

-- 1. Tabla de ciclos de producción
CREATE TABLE IF NOT EXISTS productionCycles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,                -- Ej: "Ciclo 2026-2027"
  startDate DATE NOT NULL,                   -- Inicio del ciclo (poda / dormancia)
  harvestStartDate DATE NULL,                -- Opcional; si es NULL se detecta con la primera caja del ciclo
  harvestEndDate DATE NULL,                  -- Finalización de cosecha
  endDate DATE NULL,                         -- Finalización del ciclo (NULL = ciclo abierto)
  notes TEXT NULL,
  createdByUserId INT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Idempotencia del sync móvil de actividades
--    (si la columna ya existe, este ALTER falla y puede ignorarse)
ALTER TABLE fieldActivities ADD COLUMN clientUuid VARCHAR(64) NULL;
ALTER TABLE fieldActivities ADD UNIQUE INDEX fieldActivities_clientUuid_unique (clientUuid);

-- 3. Permisos de usuario
ALTER TABLE users ADD COLUMN canViewCycles BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN canViewReports BOOLEAN NOT NULL DEFAULT TRUE;
