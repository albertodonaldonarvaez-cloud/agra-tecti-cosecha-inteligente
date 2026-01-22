-- Índices para optimizar consultas de cajas
-- Para MySQL 8.0 - Nombres de columnas en camelCase

-- Índice para ordenar por fecha de envío (usado en paginación)
ALTER TABLE boxes ADD INDEX idx_boxes_submissionTime (submissionTime DESC);

-- Índice para filtrar por parcela
ALTER TABLE boxes ADD INDEX idx_boxes_parcelCode (parcelCode);

-- Índice para filtrar por cortadora
ALTER TABLE boxes ADD INDEX idx_boxes_harvesterId (harvesterId);

-- Índice compuesto para filtros combinados
ALTER TABLE boxes ADD INDEX idx_boxes_filters (submissionTime, parcelCode, harvesterId);
