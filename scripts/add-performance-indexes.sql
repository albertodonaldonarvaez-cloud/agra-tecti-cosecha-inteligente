-- =====================================================
-- Script de Migración: Índices de Rendimiento
-- AGRA-TECTI Cosecha Inteligente
-- =====================================================
-- Compatible con MySQL 5.7 y 8.0
-- Seguro ejecutar múltiples veces (verifica antes de crear)
-- =====================================================

DELIMITER //

DROP PROCEDURE IF EXISTS add_index_if_not_exists//

CREATE PROCEDURE add_index_if_not_exists(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_columns VARCHAR(255)
)
BEGIN
  DECLARE index_exists INT DEFAULT 0;
  
  SELECT COUNT(*) INTO index_exists
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = p_table
    AND INDEX_NAME = p_index;
  
  IF index_exists = 0 THEN
    SET @sql = CONCAT('CREATE INDEX ', p_index, ' ON ', p_table, ' (', p_columns, ')');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    SELECT CONCAT('✅ Índice creado: ', p_index, ' en ', p_table) AS resultado;
  ELSE
    SELECT CONCAT('⏭️  Índice ya existe: ', p_index, ' en ', p_table) AS resultado;
  END IF;
END//

DELIMITER ;

-- 1. submissionTime para GROUP BY DATE(submissionTime)
CALL add_index_if_not_exists('boxes', 'idx_boxes_submission_time', 'submissionTime');

-- 2. Compuesto archived + submissionTime
CALL add_index_if_not_exists('boxes', 'idx_boxes_archived_submission', 'archived, submissionTime');

-- 3. boxCode para búsqueda de duplicados
CALL add_index_if_not_exists('boxes', 'idx_boxes_box_code', 'boxCode');

-- 4. Compuesto boxCode + submissionTime para sincronización
CALL add_index_if_not_exists('boxes', 'idx_boxes_code_submission', 'boxCode, submissionTime');

-- 5. koboId para sincronización con KoboToolbox
CALL add_index_if_not_exists('boxes', 'idx_boxes_kobo_id', 'koboId');

-- 6. harvesterId para filtrado por calidad
CALL add_index_if_not_exists('boxes', 'idx_boxes_harvester_id', 'harvesterId');

-- 7. parcelCode para agrupación por parcela
CALL add_index_if_not_exists('boxes', 'idx_boxes_parcel_code', 'parcelCode');

-- 8. originalBoxCode para protección de cajas editadas
CALL add_index_if_not_exists('boxes', 'idx_boxes_original_code', 'originalBoxCode');

-- 9. manuallyEdited para filtrar cajas editadas
CALL add_index_if_not_exists('boxes', 'idx_boxes_manually_edited', 'manuallyEdited');

-- 10. uploadBatchId en uploadErrors
CALL add_index_if_not_exists('uploadErrors', 'idx_upload_errors_batch', 'uploadBatchId');

-- 11. resolved en uploadErrors para filtrar errores pendientes
CALL add_index_if_not_exists('uploadErrors', 'idx_upload_errors_resolved', 'resolved');

-- Limpiar el procedimiento temporal
DROP PROCEDURE IF EXISTS add_index_if_not_exists;

-- Verificar índices creados
SELECT 
  TABLE_NAME, 
  INDEX_NAME, 
  COLUMN_NAME 
FROM INFORMATION_SCHEMA.STATISTICS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME IN ('boxes', 'uploadErrors')
ORDER BY TABLE_NAME, INDEX_NAME;
