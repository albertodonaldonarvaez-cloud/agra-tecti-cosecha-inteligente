-- Índices para optimizar consultas de cajas
-- Ejecutar manualmente si es necesario

-- Índice para ordenar por fecha de envío (usado en paginación)
CREATE INDEX IF NOT EXISTS idx_boxes_submission_time ON boxes(submission_time DESC);

-- Índice para filtrar por parcela
CREATE INDEX IF NOT EXISTS idx_boxes_parcel_code ON boxes(parcel_code);

-- Índice para filtrar por cortadora
CREATE INDEX IF NOT EXISTS idx_boxes_harvester_id ON boxes(harvester_id);

-- Índice compuesto para filtros combinados
CREATE INDEX IF NOT EXISTS idx_boxes_filters ON boxes(submission_time DESC, parcel_code, harvester_id);
