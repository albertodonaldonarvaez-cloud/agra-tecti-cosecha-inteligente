-- =====================================================
-- Script de Migración: Índices de Rendimiento
-- AGRA-TECTI Cosecha Inteligente
-- =====================================================
-- Este script agrega índices a las tablas para acelerar
-- las consultas de agrupación por día, filtrado y búsqueda.
-- Es seguro ejecutar múltiples veces (usa IF NOT EXISTS).
-- =====================================================

-- 1. TABLA BOXES: Índice en submissionTime para GROUP BY DATE(submissionTime)
-- Acelera: getHarvestByDay, getDashboardStats, getDailyChartData
CREATE INDEX IF NOT EXISTS idx_boxes_submission_time 
ON boxes (submissionTime);

-- 2. TABLA BOXES: Índice compuesto para filtros frecuentes (archived + submissionTime)
-- Acelera: Todas las consultas que filtran WHERE archived = 0 GROUP BY DATE(submissionTime)
CREATE INDEX IF NOT EXISTS idx_boxes_archived_submission 
ON boxes (archived, submissionTime);

-- 3. TABLA BOXES: Índice en boxCode para búsqueda de duplicados
-- Acelera: Detección de duplicados en sincronización, búsqueda por código
CREATE INDEX IF NOT EXISTS idx_boxes_box_code 
ON boxes (boxCode);

-- 4. TABLA BOXES: Índice compuesto para detección de duplicados en sincronización
-- Acelera: koboSync, excelProcessor, historicalDataSync
CREATE INDEX IF NOT EXISTS idx_boxes_code_submission 
ON boxes (boxCode, submissionTime);

-- 5. TABLA BOXES: Índice en koboId para sincronización con KoboToolbox
-- Acelera: koboSync detección de registros existentes
CREATE INDEX IF NOT EXISTS idx_boxes_kobo_id 
ON boxes (koboId);

-- 6. TABLA BOXES: Índice en harvesterId para filtrado por calidad
-- Acelera: Consultas de primera calidad (NOT IN 98,99), segunda (98), desperdicio (99)
CREATE INDEX IF NOT EXISTS idx_boxes_harvester_id 
ON boxes (harvesterId);

-- 7. TABLA BOXES: Índice en parcelCode para agrupación por parcela
-- Acelera: Estadísticas por parcela, rendimiento de cortadoras
CREATE INDEX IF NOT EXISTS idx_boxes_parcel_code 
ON boxes (parcelCode);

-- 8. TABLA BOXES: Índice en originalBoxCode para protección de cajas editadas
-- Acelera: Detección de cajas editadas durante sincronización
CREATE INDEX IF NOT EXISTS idx_boxes_original_code 
ON boxes (originalBoxCode);

-- 9. TABLA BOXES: Índice en manuallyEdited para filtrar cajas editadas
-- Acelera: Consultas que necesitan saber si una caja fue editada
CREATE INDEX IF NOT EXISTS idx_boxes_manually_edited 
ON boxes (manuallyEdited);

-- 10. TABLA UPLOAD_ERRORS: Índice en uploadBatchId
-- Acelera: Consulta de errores por lote
CREATE INDEX IF NOT EXISTS idx_upload_errors_batch 
ON uploadErrors (uploadBatchId);

-- 11. TABLA UPLOAD_ERRORS: Índice en resolved para filtrar errores pendientes
CREATE INDEX IF NOT EXISTS idx_upload_errors_resolved 
ON uploadErrors (resolved);

-- Verificar que los índices se crearon correctamente
SELECT 
  TABLE_NAME, 
  INDEX_NAME, 
  COLUMN_NAME 
FROM INFORMATION_SCHEMA.STATISTICS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME IN ('boxes', 'uploadErrors')
ORDER BY TABLE_NAME, INDEX_NAME;
