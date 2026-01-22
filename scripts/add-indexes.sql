-- Índices para optimizar consultas de cajas
-- Para MySQL 8.0

-- Primero eliminamos índices si existen (para evitar errores)
DROP INDEX IF EXISTS idx_boxes_submission_time ON boxes;
DROP INDEX IF EXISTS idx_boxes_parcel_code ON boxes;
DROP INDEX IF EXISTS idx_boxes_harvester_id ON boxes;
DROP INDEX IF EXISTS idx_boxes_filters ON boxes;

-- Índice para ordenar por fecha de envío (usado en paginación)
CREATE INDEX idx_boxes_submission_time ON boxes(submission_time DESC);

-- Índice para filtrar por parcela
CREATE INDEX idx_boxes_parcel_code ON boxes(parcel_code);

-- Índice para filtrar por cortadora
CREATE INDEX idx_boxes_harvester_id ON boxes(harvester_id);

-- Índice compuesto para filtros combinados
CREATE INDEX idx_boxes_filters ON boxes(submission_time, parcel_code, harvester_id);
