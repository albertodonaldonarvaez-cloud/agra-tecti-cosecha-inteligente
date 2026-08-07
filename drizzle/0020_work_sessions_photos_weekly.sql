-- Migración: Jornadas de trabajo, fotos móviles de actividades, colaboradores
--            desde la app, resumen semanal con IA y distribución del APK
-- Fecha: 2026-08-06
-- NOTA: migrate.cjs (entrypoint de Docker) aplica estos cambios de forma
-- idempotente al arrancar. Este archivo es para aplicación manual si se prefiere.

-- 1. Jornadas de trabajo por actividad (multi-día con horas)
CREATE TABLE IF NOT EXISTS fieldActivityWorkSessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  activityId INT NOT NULL,
  workDate DATE NOT NULL,                    -- Día trabajado
  startTime VARCHAR(8) NULL,                 -- "HH:MM"
  endTime VARCHAR(8) NULL,
  notes VARCHAR(512) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ws_activity (activityId)
);

-- 2. Resumen semanal generado con IA (weekStart único: una fila por semana)
CREATE TABLE IF NOT EXISTS weeklySummaries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  weekStart DATE NOT NULL UNIQUE,
  weekEnd DATE NOT NULL,
  content TEXT NOT NULL,
  model VARCHAR(64) NULL,
  cycleId INT NULL,
  cyclePhase VARCHAR(64) NULL,
  statsJson TEXT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Versiones del APK para auto-actualización de la app
CREATE TABLE IF NOT EXISTS appReleases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  versionCode INT NOT NULL,
  versionName VARCHAR(32) NOT NULL,
  fileName VARCHAR(255) NOT NULL,
  filePath VARCHAR(512) NOT NULL,
  fileSize INT NULL,
  notes TEXT NULL,
  uploadedByUserId INT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Idempotencia de fotos de actividad subidas desde la app
ALTER TABLE fieldActivityPhotos ADD COLUMN localPhotoId VARCHAR(64) NULL;

-- 5. Colaboradores dados de alta desde la app móvil
ALTER TABLE collaborators ADD COLUMN clientUuid VARCHAR(64) NULL;
ALTER TABLE collaborators ADD UNIQUE INDEX collaborators_clientUuid_unique (clientUuid);
