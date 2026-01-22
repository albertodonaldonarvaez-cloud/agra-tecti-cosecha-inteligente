-- Índices para optimizar consultas de cajas
-- Para MySQL 8.0

-- Índice para ordenar por fecha de envío (usado en paginación)
ALTER TABLE boxes ADD INDEX idx_boxes_submission_time (submission_time DESC);

-- Índice para filtrar por parcela
ALTER TABLE boxes ADD INDEX idx_boxes_parcel_code (parcel_code);

-- Índice para filtrar por cortadora
ALTER TABLE boxes ADD INDEX idx_boxes_harvester_id (harvester_id);

-- Índice compuesto para filtros combinados
ALTER TABLE boxes ADD INDEX idx_boxes_filters (submission_time, parcel_code, harvester_id);
