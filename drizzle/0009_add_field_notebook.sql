-- Migración: Libreta de Campo
-- Fecha: 2026-03-20
-- Descripción: Tablas para registro de actividades agrícolas de campo

-- Permiso para ver la libreta de campo
ALTER TABLE users ADD COLUMN canViewFieldNotebook BOOLEAN NOT NULL DEFAULT TRUE;

-- Tabla principal de actividades de campo
CREATE TABLE IF NOT EXISTS fieldActivities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  -- Tipo de actividad
  activityType ENUM(
    'riego',
    'fertilizacion',
    'nutricion',
    'poda',
    'control_maleza',
    'control_plagas',
    'aplicacion_fitosanitaria',
    'otro'
  ) NOT NULL,
  -- Subtipo según la actividad
  activitySubtype VARCHAR(128),
  -- Descripción / observaciones generales
  description TEXT,
  -- Quién realizó la actividad
  performedBy VARCHAR(255) NOT NULL,
  -- Fecha en que se realizó la actividad
  activityDate DATE NOT NULL,
  -- Hora de inicio y fin (para calcular tiempo de ejecución)
  startTime VARCHAR(8), -- HH:MM formato
  endTime VARCHAR(8),   -- HH:MM formato
  durationMinutes INT,  -- Duración en minutos (calculado o manual)
  -- Condiciones climáticas al momento
  weatherCondition VARCHAR(128),
  temperature VARCHAR(16),
  -- Estado de la actividad
  status ENUM('planificada', 'en_progreso', 'completada', 'cancelada') NOT NULL DEFAULT 'completada',
  -- Usuario que registró
  createdByUserId INT NOT NULL,
  -- Timestamps
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Parcelas afectadas por una actividad (muchas a muchas)
CREATE TABLE IF NOT EXISTS fieldActivityParcels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  activityId INT NOT NULL,
  parcelId INT NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_activity_parcel (activityId, parcelId)
);

-- Productos utilizados en una actividad
CREATE TABLE IF NOT EXISTS fieldActivityProducts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  activityId INT NOT NULL,
  productName VARCHAR(255) NOT NULL,
  productType ENUM(
    'fertilizante_granular',
    'fertilizante_liquido',
    'fertilizante_foliar',
    'fertilizante_organico',
    'herbicida_preemergente',
    'herbicida_postemergente',
    'herbicida_selectivo',
    'herbicida_no_selectivo',
    'insecticida',
    'fungicida',
    'acaricida',
    'nematicida',
    'regulador_crecimiento',
    'bioestimulante',
    'enmienda_suelo',
    'nutriente_foliar',
    'agua',
    'otro'
  ) NOT NULL DEFAULT 'otro',
  quantity DECIMAL(10,2),
  unit ENUM('kg', 'g', 'lt', 'ml', 'ton', 'bulto', 'saco', 'unidad', 'otro') DEFAULT 'kg',
  dosisPerHectare VARCHAR(64),
  applicationMethod VARCHAR(128),
  notes TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Herramientas / equipos utilizados
CREATE TABLE IF NOT EXISTS fieldActivityTools (
  id INT AUTO_INCREMENT PRIMARY KEY,
  activityId INT NOT NULL,
  toolName VARCHAR(255) NOT NULL,
  toolType ENUM(
    'tractor',
    'aspersora_manual',
    'aspersora_motorizada',
    'bomba_riego',
    'sistema_goteo',
    'motosierra',
    'tijera_poda',
    'machete',
    'azadon',
    'rastrillo',
    'desbrozadora',
    'fumigadora',
    'drone',
    'vehiculo',
    'otro'
  ) NOT NULL DEFAULT 'otro',
  notes VARCHAR(512),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Fotos de la actividad (antes y después)
CREATE TABLE IF NOT EXISTS fieldActivityPhotos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  activityId INT NOT NULL,
  photoType ENUM('antes', 'despues', 'durante', 'producto', 'otro') NOT NULL DEFAULT 'durante',
  photoUrl TEXT NOT NULL,
  caption VARCHAR(512),
  uploadedByUserId INT NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices para búsquedas frecuentes
CREATE INDEX idx_fa_type ON fieldActivities(activityType);
CREATE INDEX idx_fa_date ON fieldActivities(activityDate);
CREATE INDEX idx_fa_status ON fieldActivities(status);
CREATE INDEX idx_fa_created_by ON fieldActivities(createdByUserId);
CREATE INDEX idx_fap_activity ON fieldActivityParcels(activityId);
CREATE INDEX idx_fap_parcel ON fieldActivityParcels(parcelId);
CREATE INDEX idx_fapr_activity ON fieldActivityProducts(activityId);
CREATE INDEX idx_fat_activity ON fieldActivityTools(activityId);
CREATE INDEX idx_faph_activity ON fieldActivityPhotos(activityId);
